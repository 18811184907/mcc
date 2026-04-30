#!/usr/bin/env node
// codex-runner v2.8 streaming tests
//
// Strategy: mock codex CLI 输出 jsonl 模拟 --json 流式行为，包含真实事件类型。
// 测试改为 async (await) 形式适配 v2.8 Promise API。

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const repoRoot = path.resolve(__dirname, '..');
const runnerPath = path.join(repoRoot, 'source', 'hooks', 'scripts', 'lib', 'codex-runner.js');

let totalPass = 0;
let totalFail = 0;

function check(label, cond) {
  if (cond) { console.log(`✓ ${label}`); totalPass++; }
  else { console.log(`✗ ${label}`); totalFail++; }
}

// 准备 mock codex
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-codex-runner-test-'));
const mockBinDir = path.join(tmpHome, 'bin');
fs.mkdirSync(mockBinDir, { recursive: true });

const mockCodexJs = path.join(mockBinDir, 'mock-codex.js');
fs.writeFileSync(mockCodexJs, `#!/usr/bin/env node
// v2.8 mock: 输出 JSONL 流式事件，模拟真 codex --json
const mode = process.env.MOCK_CODEX_MODE || 'success';
const args = process.argv.slice(2);

// codex --version
if (args[0] === '--version') {
  if (mode === 'no-version') { process.stderr.write('command not found\\n'); process.exit(1); }
  console.log('codex-cli 0.125.0 (mock)'); process.exit(0);
}

// codex exec --json -
if (args[0] === 'exec') {
  // 模拟读 stdin
  let stdinData = '';
  if (args.includes('-')) {
    try { stdinData = require('fs').readFileSync(0, 'utf8'); } catch (_) {}
  }

  if (mode === 'rate-limit') {
    process.stderr.write('Error: Rate limit reached. Try again in 30 minutes.\\n');
    process.exit(1);
  }
  if (mode === 'rate-limit-2') {
    // stdout 有讨论 rate-limit 主题（v2.7.1 hotfix 必须不误判）
    console.log(JSON.stringify({type: 'thread.started', thread_id: 'mock-1'}));
    console.log(JSON.stringify({type: 'item.completed', item: {id: 'i0', type: 'agent_message', text: 'analysis discusses rate-limit handling and quota patterns'}}));
    console.log(JSON.stringify({type: 'turn.completed', usage: {input_tokens: 100, output_tokens: 20}}));
    process.exit(0);
  }
  if (mode === 'error') {
    process.stderr.write('Error: something else broke\\n');
    process.exit(1);
  }
  if (mode === 'idle-stuck') {
    // 不输出任何事件，模拟 codex 卡住 — runner 应该 idle timeout 杀掉
    setTimeout(() => process.exit(0), 60_000);
    return;
  }
  if (mode === 'streaming-multi-event') {
    // 多事件流，验证累积 + onEvent 回调
    console.log(JSON.stringify({type: 'thread.started', thread_id: 'mock-2'}));
    console.log(JSON.stringify({type: 'turn.started'}));
    console.log(JSON.stringify({type: 'item.completed', item: {id: 'i0', type: 'reasoning', text: 'thinking...'}}));
    console.log(JSON.stringify({type: 'item.completed', item: {id: 'i1', type: 'agent_message', text: '[HIGH] file.js:42 — bug A'}}));
    console.log(JSON.stringify({type: 'item.completed', item: {id: 'i2', type: 'agent_message', text: '[MEDIUM] file.js:55 — bug B'}}));
    console.log(JSON.stringify({type: 'turn.completed', usage: {input_tokens: 500, output_tokens: 50}}));
    process.exit(0);
  }

  // success 默认
  console.log(JSON.stringify({type: 'thread.started', thread_id: 'mock-default'}));
  console.log(JSON.stringify({type: 'item.completed', item: {id: 'i0', type: 'agent_message', text: 'mock codex ok output'}}));
  console.log(JSON.stringify({type: 'turn.completed', usage: {input_tokens: 50, output_tokens: 5}}));
  process.exit(0);
}

process.stderr.write('mock: unknown subcommand\\n'); process.exit(1);
`, { mode: 0o755 });

let mockBinPath;
if (process.platform === 'win32') {
  mockBinPath = path.join(mockBinDir, 'mock-codex.cmd');
  const winPath = mockCodexJs.replace(/\//g, '\\');
  fs.writeFileSync(mockBinPath, `@echo off\r\nnode "${winPath}" %*\r\n`);
} else {
  mockBinPath = mockCodexJs;
}

process.env.HOME = tmpHome;
process.env.USERPROFILE = tmpHome;
process.env.CODEX_BIN_OVERRIDE = mockBinPath;

delete require.cache[runnerPath];
const runner = require(runnerPath);
runner._resetBinCache && runner._resetBinCache();

const flagPath = path.join(tmpHome, '.claude', '.codex-blocked-until');

// ════════════════════════════════════════════════════════════════════════════
// 主 async 测试函数
// ════════════════════════════════════════════════════════════════════════════
async function main() {
  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: isCodexInstalled
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Test 1: isCodexInstalled ──');
  process.env.MOCK_CODEX_MODE = 'success';
  check('mock codex --version 成功 → isCodexInstalled true', runner.isCodexInstalled() === true);
  process.env.MOCK_CODEX_MODE = 'no-version';
  check('mock codex --version 失败 → isCodexInstalled false', runner.isCodexInstalled() === false);

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: 红队模板
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Test 2: 红队模板 ──');
  const t1 = runner.REDTEAM_TEMPLATES.audit_diff({ gitRange: 'HEAD~3..HEAD' });
  check('audit_diff 含 git range', t1.includes('HEAD~3..HEAD'));
  check('audit_diff 红队视角', /渗透测试|攻击者|红队/.test(t1));

  // ──────────────────────────────────────────────────────────────────────────
  // Test 3: streaming happy path（多事件 + onEvent 回调 + 累积 agent_message）
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Test 3: streaming multi-event happy path ──');
  try { fs.unlinkSync(flagPath); } catch (_) {}
  process.env.MOCK_CODEX_MODE = 'streaming-multi-event';
  const onEventCalls = [];
  const r3 = await runner.runCodexAudit({
    prompt: 'test',
    idleTimeoutMs: 5_000,
    totalTimeoutMs: 30_000,
    onEvent: (ev) => onEventCalls.push(ev.type),
  });
  check('skipped: false', r3.skipped === false);
  check('output 含 bug A + bug B 累积', /bug A[\s\S]*bug B/.test(r3.output || ''));
  check('output 不含 reasoning text（只累积 agent_message）', !/thinking\.\.\./.test(r3.output || ''));
  check('events 数组含多事件', Array.isArray(r3.events) && r3.events.length >= 5);
  check('onEvent 被调用多次', onEventCalls.length >= 5);
  check('tokensUsed === 550 (input 500 + output 50)', r3.tokensUsed === 550);
  check('durationMs 是数字', typeof r3.durationMs === 'number');

  // ──────────────────────────────────────────────────────────────────────────
  // Test 4: rate-limit 写 flag
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Test 4: rate-limit → 写 flag ──');
  try { fs.unlinkSync(flagPath); } catch (_) {}
  process.env.MOCK_CODEX_MODE = 'rate-limit';
  const r4 = await runner.runCodexAudit({ prompt: 'test', idleTimeoutMs: 5_000, totalTimeoutMs: 30_000 });
  check('skipped: true', r4.skipped === true);
  check('reason 含 rate-limited', /rate-limited/.test(r4.reason || ''));
  check('flag 文件被写入', fs.existsSync(flagPath));

  // ──────────────────────────────────────────────────────────────────────────
  // Test 5: flag 存在 + 未到 probe → 直接 skip
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Test 5: flag 存在 + 未到 probe → 直接 skip ──');
  process.env.MOCK_CODEX_MODE = 'success';
  const r5 = await runner.runCodexAudit({ prompt: 'test', idleTimeoutMs: 5_000, totalTimeoutMs: 30_000 });
  check('skipped: true (未到 probe 时间)', r5.skipped === true);
  check('reason 含 next auto-probe', /probe/.test(r5.reason || ''));

  // ──────────────────────────────────────────────────────────────────────────
  // Test 6: probe 时间到 + mock 恢复 → 清 flag + 跑真任务
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Test 6: probe 恢复 → 清 flag + 跑真任务 ──');
  const flag = JSON.parse(fs.readFileSync(flagPath, 'utf8'));
  flag.last_probe_at = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  fs.writeFileSync(flagPath, JSON.stringify(flag));

  process.env.MOCK_CODEX_MODE = 'success';
  const r6 = await runner.runCodexAudit({ prompt: 'test', idleTimeoutMs: 5_000, totalTimeoutMs: 30_000 });
  check('skipped: false (probe 恢复)', r6.skipped === false);
  check('flag 已清', !fs.existsSync(flagPath));
  check('output 含 mock', /mock codex ok output/.test(r6.output || ''));

  // ──────────────────────────────────────────────────────────────────────────
  // Test 7: stdout 含 rate-limit 关键字 + exit 0 → 不误判（v2.7.1 防回归）
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Test 7: stdout 关键字 + exit 0 → 不误判 ──');
  try { fs.unlinkSync(flagPath); } catch (_) {}
  process.env.MOCK_CODEX_MODE = 'rate-limit-2';
  const r7 = await runner.runCodexAudit({ prompt: 'test', idleTimeoutMs: 5_000, totalTimeoutMs: 30_000 });
  check('skipped: false (exit 0 = 成功)', r7.skipped === false);
  check('output 含主题词', /rate-limit handling/.test(r7.output || ''));
  check('flag NOT 写入', !fs.existsSync(flagPath));

  // ──────────────────────────────────────────────────────────────────────────
  // Test 8: idle timeout 杀卡死的 codex
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Test 8: idle timeout 杀卡死的 codex ──');
  try { fs.unlinkSync(flagPath); } catch (_) {}
  process.env.MOCK_CODEX_MODE = 'idle-stuck';
  const startedAt = Date.now();
  const r8 = await runner.runCodexAudit({
    prompt: 'test',
    idleTimeoutMs: 3_000,  // 3 秒就 idle
    totalTimeoutMs: 30_000,
  });
  const elapsed = Date.now() - startedAt;
  check('skipped: true', r8.skipped === true);
  check('reason 含 idle timeout', /idle timeout/.test(r8.reason || ''));
  check(`耗时 < 15s（idle 3s + 杀进程余量；实际 ${elapsed}ms）`, elapsed < 15_000);
  check('flag NOT 写（不是 rate-limit）', !fs.existsSync(flagPath));

  // ──────────────────────────────────────────────────────────────────────────
  // Test 9: 其他错误
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Test 9: 非 rate-limit 错误 ──');
  try { fs.unlinkSync(flagPath); } catch (_) {}
  process.env.MOCK_CODEX_MODE = 'error';
  const r9 = await runner.runCodexAudit({ prompt: 'test', idleTimeoutMs: 5_000, totalTimeoutMs: 30_000 });
  check('skipped: true', r9.skipped === true);
  check('reason 含 codex error', /codex error/.test(r9.reason || ''));
  check('flag NOT 写入', !fs.existsSync(flagPath));

  // ──────────────────────────────────────────────────────────────────────────
  // Test 10: 未装
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Test 10: codex 未装时 ──');
  try { fs.unlinkSync(flagPath); } catch (_) {}
  process.env.MOCK_CODEX_MODE = 'no-version';
  const r10 = await runner.runCodexAudit({ prompt: 'test', idleTimeoutMs: 5_000, totalTimeoutMs: 30_000 });
  check('skipped: true', r10.skipped === true);
  check('reason 含 not installed', /not installed/.test(r10.reason || ''));

  // Cleanup
  delete process.env.CODEX_BIN_OVERRIDE;
  delete process.env.MOCK_CODEX_MODE;
  fs.rmSync(tmpHome, { recursive: true, force: true });

  console.log(`\nResult: ${totalPass} passed, ${totalFail} failed`);
  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test crashed:', err);
  process.exit(1);
});

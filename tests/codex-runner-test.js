#!/usr/bin/env node
// codex-runner unit tests
//
// Strategy: 不调用真 codex CLI（消耗 quota）。改在 PATH 前面塞一个 mock `codex`
// 脚本，根据环境变量返回不同场景（success/rate-limit/error）。
// 测试覆盖：CLI 检测 / flag 写读 / 自动 probe / 红队模板 / 主入口流程。

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const runnerPath = path.join(repoRoot, 'source', 'hooks', 'scripts', 'lib', 'codex-runner.js');

let totalPass = 0;
let totalFail = 0;

function check(label, cond) {
  if (cond) { console.log(`✓ ${label}`); totalPass++; }
  else { console.log(`✗ ${label}`); totalFail++; }
}

// ════════════════════════════════════════════════════════════════════════════
// 准备 mock codex CLI
// ════════════════════════════════════════════════════════════════════════════
//
// 写一个 fake codex 到 tmp dir，PATH 前置加它。读环境变量决定返回啥。
//
// MOCK_CODEX_MODE:
//   "success"      → exit 0, stdout "mock codex ok output"
//   "rate-limit"   → exit 1, stderr "Rate limit reached. Try again in 30 minutes."
//   "rate-limit-2" → exit 0, stdout 但含 rate-limit 关键字（codex 偶尔在 stdout 报）
//   "error"        → exit 1, stderr "some other error"
//   "no-version"   → exit 1（codex --version 失败 → 模拟未装）
//   "ok-with-tokens" → exit 0, stderr "tokens used 1234"

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-codex-runner-test-'));
const mockBinDir = path.join(tmpHome, 'bin');
fs.mkdirSync(mockBinDir, { recursive: true });

// Mock codex —— 模拟真实 codex 行为（含 stdin 读 prompt）。Windows 用 .cmd 跟
// 真实 codex npm shim 完全一致结构（都是 cmd → node script），最贴近生产场景。
const mockCodexJs = path.join(mockBinDir, 'mock-codex.js');
fs.writeFileSync(mockCodexJs, `#!/usr/bin/env node
const mode = process.env.MOCK_CODEX_MODE || 'success';
const args = process.argv.slice(2);

if (args[0] === '--version') {
  if (mode === 'no-version') { process.stderr.write('command not found\\n'); process.exit(1); }
  console.log('codex-cli 0.125.0 (mock)'); process.exit(0);
}

if (args[0] === 'exec') {
  // 如果 args 里有 '-'，从 stdin 读 prompt（兼容 runner 的新模式）
  // 这里我们不真用 prompt，只校验 stdin 可读
  let stdinData = '';
  if (args.includes('-')) {
    try { stdinData = require('fs').readFileSync(0, 'utf8'); } catch (_) {}
  }
  if (mode === 'rate-limit')    { process.stderr.write('Error: Rate limit reached. Try again in 30 minutes.\\n'); process.exit(1); }
  if (mode === 'rate-limit-2')  { process.stdout.write('Some output\\nNote: usage limit approaching\\n'); process.exit(0); }
  if (mode === 'error')         { process.stderr.write('Error: something else broke\\n'); process.exit(1); }
  if (mode === 'ok-with-tokens'){ process.stdout.write('mock codex audit output\\n'); process.stderr.write('tokens used 1,234\\n'); process.exit(0); }
  if (mode === 'echo-stdin')    { process.stdout.write('STDIN_RECEIVED:' + stdinData.slice(0, 40)); process.exit(0); }
  process.stdout.write('mock codex ok output\\n'); process.exit(0);
}
process.stderr.write('mock: unknown subcommand ' + args.join(' ') + '\\n'); process.exit(1);
`, { mode: 0o755 });

// 跨平台 wrapper：Windows 写 .cmd 调 node（跟真 codex.cmd 风格一致）；
// Unix 直接调 .js（带 shebang，chmod +x）
let mockBinPath;
if (process.platform === 'win32') {
  mockBinPath = path.join(mockBinDir, 'mock-codex.cmd');
  // 注意 .cmd 内必须用 \\ 路径分隔 + 引号包路径防空格 + %* 透传 args
  const winPath = mockCodexJs.replace(/\//g, '\\');
  fs.writeFileSync(mockBinPath, `@echo off\r\nnode "${winPath}" %*\r\n`);
} else {
  mockBinPath = mockCodexJs;
}

// HOME / USERPROFILE override 让 flag 写到 tmpHome
process.env.HOME = tmpHome;
process.env.USERPROFILE = tmpHome;
// CODEX_BIN_OVERRIDE 让 runner 用 mock，不去 PATH 找真 codex
process.env.CODEX_BIN_OVERRIDE = mockBinPath;

// 清 require cache 让 lib 用新 env
delete require.cache[runnerPath];
const runner = require(runnerPath);
// 重置 cache（如果 runner 已被 require 过）
runner._resetBinCache && runner._resetBinCache();

// flagPath 显式从 tmpHome 推导（与 runner getFlagPath 同逻辑）
const flagPath = path.join(tmpHome, '.claude', '.codex-blocked-until');

// ════════════════════════════════════════════════════════════════════════════
// Test 1: isCodexInstalled
// ════════════════════════════════════════════════════════════════════════════
{
  console.log('\n── Test 1: isCodexInstalled ──');

  process.env.MOCK_CODEX_MODE = 'success';
  check('mock codex --version 成功 → isCodexInstalled true', runner.isCodexInstalled() === true);

  process.env.MOCK_CODEX_MODE = 'no-version';
  check('mock codex --version 失败 → isCodexInstalled false', runner.isCodexInstalled() === false);
}

// ════════════════════════════════════════════════════════════════════════════
// Test 2: 红队模板字符串
// ════════════════════════════════════════════════════════════════════════════
{
  console.log('\n── Test 2: 红队模板 ──');
  const t1 = runner.REDTEAM_TEMPLATES.audit_diff({ gitRange: 'HEAD~3..HEAD' });
  check('audit_diff 含 git range', t1.includes('HEAD~3..HEAD'));
  check('audit_diff 是红队视角', /渗透测试|攻击者|红队/.test(t1));
  check('audit_diff 禁止"看起来没问题"', /禁止.*没问题|必须给至少 1 个/.test(t1));

  const t2 = runner.REDTEAM_TEMPLATES.audit_plan({ planContent: 'fake plan', projectContext: 'mcc-fork' });
  check('audit_plan 含 plan 内容', t2.includes('fake plan'));
  check('audit_plan 含项目上下文', t2.includes('mcc-fork'));
  check('audit_plan 强制反例', /反例|绝不写.*plan 看起来不错/.test(t2));
}

// ════════════════════════════════════════════════════════════════════════════
// Test 3: runCodexAudit happy path
// ════════════════════════════════════════════════════════════════════════════
{
  console.log('\n── Test 3: runCodexAudit happy path ──');
  process.env.MOCK_CODEX_MODE = 'success';
  // 先清 flag
  try { fs.unlinkSync(flagPath); } catch (_) {}

  const result = runner.runCodexAudit({ prompt: 'test prompt', timeoutMs: 5000 });
  check('成功调用 → skipped: false', result.skipped === false);
  check('output 含 mock 内容', /mock codex ok output/.test(result.output || ''));
  check('durationMs 是数字', typeof result.durationMs === 'number');
}

// ════════════════════════════════════════════════════════════════════════════
// Test 4: runCodexAudit rate-limit 触发写 flag
// ════════════════════════════════════════════════════════════════════════════
{
  console.log('\n── Test 4: rate-limit → 写 flag ──');
  // 先清 flag
  try { fs.unlinkSync(flagPath); } catch (_) {}
  process.env.MOCK_CODEX_MODE = 'rate-limit';

  const result = runner.runCodexAudit({ prompt: 'test', timeoutMs: 5000 });
  check('skipped: true', result.skipped === true);
  check('reason 含 rate-limited', /rate-limited/.test(result.reason || ''));
  check('flag 文件被写入', fs.existsSync(flagPath));

  if (fs.existsSync(flagPath)) {
    const flag = JSON.parse(fs.readFileSync(flagPath, 'utf8'));
    check('flag 含 blocked_at', !!flag.blocked_at);
    check('flag 含 blocked_until', !!flag.blocked_until);
    check('flag.probe_attempts === 0', flag.probe_attempts === 0);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Test 5: 后续调用读 flag → 短期内不再 probe
// ════════════════════════════════════════════════════════════════════════════
{
  console.log('\n── Test 5: flag 存在 + 未到 probe → 直接 skip ──');
  // 上一步已经写好 flag with last_probe_at = now, probe_attempts = 0
  // 下次 probe 间隔 = 5min，刚写完显然没到

  process.env.MOCK_CODEX_MODE = 'success'; // mock 现在是 OK 的，但应该不调用
  const result = runner.runCodexAudit({ prompt: 'test', timeoutMs: 5000 });
  check('skipped: true (未到 probe 时间)', result.skipped === true);
  check('reason 含 next auto-probe', /probe/.test(result.reason || ''));
}

// ════════════════════════════════════════════════════════════════════════════
// Test 6: 模拟 last_probe_at 过期 → 触发 probe → mock 恢复 → 清 flag
// ════════════════════════════════════════════════════════════════════════════
{
  console.log('\n── Test 6: probe 时间到 + mock 恢复 → 清 flag + 跑真任务 ──');
  // 改 flag 让 last_probe_at 是 1 小时前（超过 5min 间隔）
  const flag = JSON.parse(fs.readFileSync(flagPath, 'utf8'));
  flag.last_probe_at = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  fs.writeFileSync(flagPath, JSON.stringify(flag));

  process.env.MOCK_CODEX_MODE = 'success'; // probe 会成功 → 清 flag → 真任务也跑
  const result = runner.runCodexAudit({ prompt: 'test', timeoutMs: 10000 });
  check('skipped: false (probe 恢复后跑真任务)', result.skipped === false);
  check('flag 已清', !fs.existsSync(flagPath));
  check('output 含 mock 内容', /mock codex ok output/.test(result.output || ''));
}

// ════════════════════════════════════════════════════════════════════════════
// Test 7: probe 时间到但仍 rate-limit → 更新 probe_attempts
// ════════════════════════════════════════════════════════════════════════════
{
  console.log('\n── Test 7: probe 失败 → 更新 attempts，flag 保留 ──');
  // 先制造 rate-limit 状态
  process.env.MOCK_CODEX_MODE = 'rate-limit';
  runner.runCodexAudit({ prompt: 'first call', timeoutMs: 5000 });

  // probe 时间手动调到 1h 前
  const flag = JSON.parse(fs.readFileSync(flagPath, 'utf8'));
  const initialAttempts = flag.probe_attempts;
  flag.last_probe_at = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  fs.writeFileSync(flagPath, JSON.stringify(flag));

  // mock 仍 rate-limit
  process.env.MOCK_CODEX_MODE = 'rate-limit';
  const result = runner.runCodexAudit({ prompt: 'second call', timeoutMs: 5000 });
  check('skipped: true (probe 仍失败)', result.skipped === true);

  if (fs.existsSync(flagPath)) {
    const newFlag = JSON.parse(fs.readFileSync(flagPath, 'utf8'));
    check(`probe_attempts 增加 (${initialAttempts} → ${newFlag.probe_attempts})`, newFlag.probe_attempts > initialAttempts);
    check('flag 仍存在', true);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Test 8: stdout 含 rate-limit 关键字 + exit 0 → 不应误判（v2.7.1 hotfix）
// ════════════════════════════════════════════════════════════════════════════
{
  console.log('\n── Test 8: stdout 含 rate-limit 关键字 + exit 0 → 不误判 ──');
  try { fs.unlinkSync(flagPath); } catch (_) {}
  process.env.MOCK_CODEX_MODE = 'rate-limit-2'; // 现在该模式：stdout 含关键字 + exit 0
  // 反映真实场景：codex audit 一段讲限流的代码时，输出会自然提到 rate-limit。
  // v2.7.0 之前会误判，v2.7.1 修复后必须当成正常成功。

  const result = runner.runCodexAudit({ prompt: 'test', timeoutMs: 5000 });
  check('skipped: false (exit 0 = 成功)', result.skipped === false);
  check('output 含 mock 内容', /Some output|usage limit approaching/.test(result.output || ''));
  check('flag NOT 写入（stdout 关键字不算限流）', !fs.existsSync(flagPath));
}

// ════════════════════════════════════════════════════════════════════════════
// Test 9: 其他错误 → skipped + 错误 reason
// ════════════════════════════════════════════════════════════════════════════
{
  console.log('\n── Test 9: 非 rate-limit 错误 ──');
  try { fs.unlinkSync(flagPath); } catch (_) {}
  process.env.MOCK_CODEX_MODE = 'error';

  const result = runner.runCodexAudit({ prompt: 'test', timeoutMs: 5000 });
  check('skipped: true', result.skipped === true);
  check('reason 含 codex error', /codex error/.test(result.reason || ''));
  check('flag NOT 写入（非 rate-limit）', !fs.existsSync(flagPath));
}

// ════════════════════════════════════════════════════════════════════════════
// Test 10: token usage 解析
// ════════════════════════════════════════════════════════════════════════════
{
  console.log('\n── Test 10: tokens used 解析 ──');
  try { fs.unlinkSync(flagPath); } catch (_) {}
  process.env.MOCK_CODEX_MODE = 'ok-with-tokens';

  const result = runner.runCodexAudit({ prompt: 'test', timeoutMs: 5000 });
  check('skipped: false', result.skipped === false);
  check(`tokensUsed === 1234 (got ${result.tokensUsed})`, result.tokensUsed === 1234);
}

// ════════════════════════════════════════════════════════════════════════════
// Test 11: codex 未装时优雅 skip
// ════════════════════════════════════════════════════════════════════════════
{
  console.log('\n── Test 11: codex 未装时 ──');
  try { fs.unlinkSync(flagPath); } catch (_) {}
  process.env.MOCK_CODEX_MODE = 'no-version';

  const result = runner.runCodexAudit({ prompt: 'test', timeoutMs: 5000 });
  check('skipped: true', result.skipped === true);
  check('reason 含 not installed', /not installed/.test(result.reason || ''));
}

// ════════════════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════════════════
delete process.env.CODEX_BIN_OVERRIDE;
delete process.env.MOCK_CODEX_MODE;
fs.rmSync(tmpHome, { recursive: true, force: true });

console.log(`\nResult: ${totalPass} passed, ${totalFail} failed`);
process.exit(totalFail > 0 ? 1 : 0);

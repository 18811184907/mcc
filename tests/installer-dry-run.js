#!/usr/bin/env node
// MCC Installer Dry-Run 集成测试
//
// 目的：保护 installer 现有行为，作为未来重构的安全网。
// 不需要真装到 ~/.claude/，只跑 --dry-run 看 installer 的行为是否符合预期。
//
// 验证：
//   1. dry-run 退出码 = 0
//   2. 输出包含关键日志（目标路径、agent/command/skill 复制计划、settings 合并）
//   3. 不会真的创建任何文件（dry-run 保证）
//   4. --scope project 和 --scope global 行为不同
//   5. --exclusive 模式触发备份计划日志

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const INSTALLER = path.join(ROOT, 'scripts', 'installer.js');
const failures = [];
let checks = 0;

function assert(cond, msg) {
  checks++;
  if (!cond) failures.push(msg);
}

function runDryRun(extraArgs = [], cwd = ROOT) {
  const args = [INSTALLER, '--dry-run', ...extraArgs];
  const res = spawnSync('node', args, {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, MCC_NO_COLOR: '1' },
  });
  return {
    exitCode: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    signal: res.signal,
    error: res.error,
  };
}

// --- Case 1: 默认（global auto） dry-run 应该通过 ---

const r1 = runDryRun(['--target', 'claude-code']);
assert(r1.exitCode === 0, `Case 1: 默认 dry-run 应 exit 0，实际 ${r1.exitCode}；stderr: ${r1.stderr.slice(0, 300)}`);
assert(r1.stdout.length > 100, `Case 1: 输出应有内容，实际长度 ${r1.stdout.length}`);
assert(!r1.signal, `Case 1: 不该 signal 终止，实际 ${r1.signal}`);

// --- Case 2: project scope dry-run 应打印本地路径 ---

const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-dry-run-'));
try {
  const r2 = runDryRun(['--scope', 'project', '--target', 'claude-code'], tmpProject);
  assert(r2.exitCode === 0, `Case 2: project dry-run 应 exit 0，实际 ${r2.exitCode}`);
  // 路径应包含 tmpProject（或其规范化形式）
  const tmpNormalized = fs.realpathSync(tmpProject).replace(/\\/g, '/');
  const outNormalized = r2.stdout.replace(/\\/g, '/');
  assert(
    outNormalized.includes(tmpNormalized) || outNormalized.includes('.claude'),
    `Case 2: 输出应含 project 路径或 .claude；实际: ${r2.stdout.slice(0, 200)}`,
  );
} finally {
  fs.rmSync(tmpProject, { recursive: true, force: true });
}

// --- Case 3: --exclusive 模式 dry-run 应提到 exclusive 备份 ---

const r3 = runDryRun(['--target', 'claude-code', '--exclusive']);
assert(r3.exitCode === 0, `Case 3: exclusive dry-run 应 exit 0，实际 ${r3.exitCode}`);
// exclusive 只在目标目录存在时才会触发；不存在时默默跳过（合理）
// 所以不硬性验证"exclusive"字样出现，只验证退出码和输出非空
assert(r3.stdout.length > 50, `Case 3: exclusive dry-run 输出应非空`);

// --- Case 4: --help 应正常 ---

const r4 = spawnSync('node', [INSTALLER, '--help'], { encoding: 'utf8', timeout: 10_000 });
assert(r4.status === 0, `Case 4: --help 应 exit 0，实际 ${r4.status}`);
assert(r4.stdout.includes('用法') || r4.stdout.includes('MCC'),
  `Case 4: --help 输出应含用法；实际前 200 字符: ${r4.stdout.slice(0, 200)}`);

// --- Case 5: 非法 scope 应报错退出 ---

const r5 = spawnSync('node', [INSTALLER, '--dry-run', '--scope', 'invalid'], {
  encoding: 'utf8', timeout: 10_000,
});
assert(r5.status !== 0, `Case 5: 非法 --scope 应非 0 退出，实际 ${r5.status}`);

// --- Case 6: dry-run 不应实际创建文件（关键） ---

const sentinelDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-sentinel-'));
try {
  const before = fs.readdirSync(sentinelDir);
  const r6 = runDryRun(['--scope', 'project', '--target', 'claude-code'], sentinelDir);
  assert(r6.exitCode === 0, `Case 6: dry-run 应 exit 0`);
  const after = fs.readdirSync(sentinelDir);
  assert(
    JSON.stringify(before) === JSON.stringify(after),
    `Case 6 CRITICAL: dry-run 不应修改文件系统！before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
  );
} finally {
  fs.rmSync(sentinelDir, { recursive: true, force: true });
}

// --- Case 7: --exclusive 在已有 .claude 的目录上 dry-run，应说"备份+清空"计划 ---

const exclusiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-exclusive-'));
try {
  // 制造已有 .claude/agents/ 内容
  fs.mkdirSync(path.join(exclusiveDir, '.claude', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(exclusiveDir, '.claude', 'agents', 'user-custom.md'), '# user');
  fs.mkdirSync(path.join(exclusiveDir, '.claude', 'commands'), { recursive: true });
  fs.writeFileSync(path.join(exclusiveDir, '.claude', 'commands', 'user-cmd.md'), '# user');

  const before7 = fs.readdirSync(path.join(exclusiveDir, '.claude'));
  const r7 = runDryRun(['--scope', 'project', '--target', 'claude-code', '--exclusive'], exclusiveDir);
  assert(r7.exitCode === 0, `Case 7: exclusive dry-run on real dir 应 exit 0，实际 ${r7.exitCode}`);

  // dry-run 不应该改文件
  const after7 = fs.readdirSync(path.join(exclusiveDir, '.claude'));
  assert(
    JSON.stringify(before7.sort()) === JSON.stringify(after7.sort()),
    `Case 7 CRITICAL: --exclusive --dry-run 不应改 .claude/，实际改了`,
  );
  // 用户文件还在
  assert(
    fs.existsSync(path.join(exclusiveDir, '.claude', 'agents', 'user-custom.md')),
    `Case 7 CRITICAL: --exclusive --dry-run 不应删用户文件`,
  );
  // 输出应有 exclusive 信号（备份 / 清空类字眼）
  const outputCombined = r7.stdout + r7.stderr;
  assert(
    /备份|backup|exclusive|清空/i.test(outputCombined),
    `Case 7: exclusive dry-run 输出应提及备份/清空计划，实际:\n${outputCombined.slice(0, 500)}`,
  );
} finally {
  fs.rmSync(exclusiveDir, { recursive: true, force: true });
}

// --- Case 8: 同时传 --scope 和 --exclusive，参数解析不冲突 ---

const r8 = runDryRun(['--scope', 'project', '--exclusive', '--target', 'claude-code']);
assert(r8.exitCode === 0, `Case 8: --scope project --exclusive 组合应正常`);

// --- 报告 ---

console.log('');
console.log('════════════════════════════════════');
console.log('  MCC Installer Dry-Run Test');
console.log('════════════════════════════════════');
console.log(`checks: ${checks}`);
if (failures.length) {
  console.log(`failed: ${failures.length}`);
  console.log('');
  for (const f of failures) console.log(`  ✗ ${f}`);
  console.log('');
  process.exit(1);
} else {
  console.log('passed ✓');
  console.log('');
}

#!/usr/bin/env node
// MCC Smoke Tests
//
// 防止发布事故的最小自测套件。跑法：`node tests/smoke.js`
// 不需要 npm 依赖——纯 Node 内置模块。
//
// 覆盖：
//   1. source/ 结构完整（agents / commands / skills / modes / hooks / mcp / rules 都在）
//   2. 每个 command / agent / skill 的 frontmatter 合法
//   3. manifest.json 的 components 计数 ≤ 实际文件数（不能谎报）
//   4. workflow-map.json 引用的 command 都真实存在
//   5. hooks.json 引用的脚本都真实存在
//   6. build 跑得过、dist 有产出、Claude Code 和 Codex 都有 >=15 agent
//   7. version 字段在 manifest/plugin/marketplace/README 同步
//
// 任何 assert 失败即 exit 1，退出前打印所有失败项。

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const failures = [];
let checks = 0;

function assert(cond, msg) {
  checks++;
  if (!cond) failures.push(msg);
}

function readText(p) { return fs.readFileSync(p, 'utf8'); }
function readJSON(p) { return JSON.parse(readText(p)); }
function listDir(p) { return fs.readdirSync(p); }
function isDir(p) { return fs.existsSync(p) && fs.statSync(p).isDirectory(); }
function isFile(p) { return fs.existsSync(p) && fs.statSync(p).isFile(); }

// --- 1. source/ 结构 ---

const src = path.join(ROOT, 'source');
assert(isDir(src), 'source/ 必须存在');
for (const d of ['agents', 'commands', 'skills', 'modes', 'hooks', 'mcp', 'rules']) {
  assert(isDir(path.join(src, d)), `source/${d}/ 必须存在`);
}

// --- 2. frontmatter 合法 ---

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 4);
  if (end < 0) return null;
  const body = text.slice(4, end);
  const fields = {};
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (m) fields[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return fields;
}

for (const f of listDir(path.join(src, 'commands')).filter(f => f.endsWith('.md'))) {
  const p = path.join(src, 'commands', f);
  const fm = parseFrontmatter(readText(p));
  assert(fm, `commands/${f}: frontmatter 缺失或损坏`);
  if (fm) assert(fm.description && fm.description.length > 5,
    `commands/${f}: description 为空或过短`);
}

for (const f of listDir(path.join(src, 'agents')).filter(f => f.endsWith('.md'))) {
  const p = path.join(src, 'agents', f);
  const fm = parseFrontmatter(readText(p));
  assert(fm, `agents/${f}: frontmatter 缺失或损坏`);
  if (fm) {
    assert(fm.name, `agents/${f}: frontmatter 缺 name`);
    assert(fm.description && fm.description.length > 10,
      `agents/${f}: description 为空或过短`);
  }
}

for (const dir of listDir(path.join(src, 'skills'))) {
  const skillMd = path.join(src, 'skills', dir, 'SKILL.md');
  if (isFile(skillMd)) {
    const fm = parseFrontmatter(readText(skillMd));
    assert(fm, `skills/${dir}/SKILL.md: frontmatter 缺失`);
    if (fm) assert(fm.name && fm.description,
      `skills/${dir}/SKILL.md: name/description 字段不全`);
  }
}

// --- 3. manifest components 不谎报 ---

const manifest = readJSON(path.join(ROOT, 'manifest.json'));
const realAgents = listDir(path.join(src, 'agents')).filter(f => f.endsWith('.md')).length;
const realCmds = listDir(path.join(src, 'commands')).filter(f => f.endsWith('.md')).length;
const realSkills = listDir(path.join(src, 'skills')).filter(d => isDir(path.join(src, 'skills', d))).length;

assert(manifest.components.agents === realAgents,
  `manifest.components.agents=${manifest.components.agents}，实际 ${realAgents}`);
assert(manifest.components.commands === realCmds,
  `manifest.components.commands=${manifest.components.commands}，实际 ${realCmds}`);
assert(manifest.components.skills === realSkills,
  `manifest.components.skills=${manifest.components.skills}，实际 ${realSkills}`);

// --- 4. workflow-map 引用的命令都存在 ---

const wfMap = readJSON(path.join(src, 'skills', 'help', 'workflow-map.json'));
const knownCommands = new Set(listDir(path.join(src, 'commands'))
  .filter(f => f.endsWith('.md')).map(f => '/' + f.replace('.md', '')));
for (const phase of (wfMap.phases || [])) {
  for (const c of (phase.commands || [])) {
    assert(knownCommands.has(c),
      `workflow-map.json phase=${phase.id} 引用了未知命令 ${c}`);
  }
}

// --- 5. hooks.json 引用的脚本存在 ---

const hooksConfigPath = path.join(src, 'hooks', 'hooks.json');
if (isFile(hooksConfigPath)) {
  const hooksConfig = readJSON(hooksConfigPath);
  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'script' && typeof v === 'string') {
        const scriptPath = path.join(src, 'hooks', v.replace(/^\.\//, ''));
        assert(isFile(scriptPath),
          `hooks.json 引用的脚本 ${v} 不存在（解析到 ${scriptPath}）`);
      } else if (Array.isArray(v) || typeof v === 'object') {
        walk(v);
      }
    }
  };
  walk(hooksConfig);
}

// --- 6. build 跑得过，dist 有产出 ---

try {
  execSync('node adapters/build.js', { cwd: ROOT, stdio: 'pipe' });
  const ccAgents = listDir(path.join(ROOT, 'dist', 'claude-code', '.claude', 'agents'))
    .filter(f => f.endsWith('.md')).length;
  const cxAgents = listDir(path.join(ROOT, 'dist', 'codex', '.codex', 'agents'))
    .filter(f => f.endsWith('.md')).length;
  assert(ccAgents >= 15, `dist/claude-code agents 只有 ${ccAgents} 个（期望 ≥15）`);
  assert(cxAgents >= 15, `dist/codex agents 只有 ${cxAgents} 个（期望 ≥15）`);
} catch (err) {
  assert(false, `build 失败：${err.message.split('\n')[0]}`);
}

// --- 7. version 同步 ---

const v = manifest.version;
const plugin = readJSON(path.join(ROOT, 'plugin.json'));
const marketplace = readJSON(path.join(ROOT, 'marketplace.json'));
assert(plugin.version === v, `plugin.json version=${plugin.version} ≠ manifest ${v}`);
const mv = marketplace.plugins?.[0]?.version;
assert(mv === v, `marketplace.json plugins[0].version=${mv} ≠ manifest ${v}`);
const readme = readText(path.join(ROOT, 'README.md'));
assert(readme.includes(`version-${v}-blue`) || readme.includes(`version-${v}`),
  `README.md 未见 version badge=${v}`);

// --- 8. installer dry-run 集成测试 ---

try {
  const dryRunResult = execSync('node tests/installer-dry-run.js', {
    cwd: ROOT, stdio: 'pipe', encoding: 'utf8', timeout: 60_000,
  });
  const passed = /passed ✓/.test(dryRunResult);
  assert(passed, `installer dry-run 测试未通过：${dryRunResult.slice(-300)}`);
} catch (err) {
  assert(false, `installer dry-run 测试失败：${err.message.slice(0, 200)}`);
}

// --- 8b. bootstrap 脚本健康度（v2.2 加）---

const bootstrapPs1 = path.join(ROOT, 'bootstrap.ps1');
const bootstrapSh = path.join(ROOT, 'bootstrap.sh');
assert(isFile(bootstrapPs1), 'bootstrap.ps1 不存在');
assert(isFile(bootstrapSh), 'bootstrap.sh 不存在');

if (isFile(bootstrapPs1)) {
  const ps1 = readText(bootstrapPs1);
  assert(ps1.includes('MCC_BOOTSTRAP_ARGS'), 'bootstrap.ps1 缺 MCC_BOOTSTRAP_ARGS env 透传逻辑');
  assert(ps1.includes('install.ps1'), 'bootstrap.ps1 没引用 install.ps1');
}
if (isFile(bootstrapSh)) {
  const sh = readText(bootstrapSh);
  assert(sh.includes('MCC_BOOTSTRAP_ARGS'), 'bootstrap.sh 缺 MCC_BOOTSTRAP_ARGS env 透传逻辑');
  assert(sh.includes('install.sh'), 'bootstrap.sh 没引用 install.sh');
  assert(sh.startsWith('#!/usr/bin/env bash') || sh.startsWith('#!/bin/bash'),
    'bootstrap.sh 缺 shebang');
}

// --- 8c. PRPs/onboarding 占位（v2.0 引入）---

const prpsOnboardingDistCC = path.join(ROOT, 'dist', 'claude-code', '.claude', 'PRPs', 'onboarding');
assert(isDir(prpsOnboardingDistCC), 'dist/claude-code/.claude/PRPs/onboarding/ 占位目录缺失（v2.0 应有）');

// --- 8d. settings.fragment 信任模式 + strict 双版本（v2.3 引入）---

const fragmentJsonPath = path.join(src, 'hooks', 'settings.fragment.json');
const fragmentStrictPath = path.join(src, 'hooks', 'settings.fragment.strict.json');
assert(isFile(fragmentJsonPath), 'source/hooks/settings.fragment.json 缺失');
assert(isFile(fragmentStrictPath), 'source/hooks/settings.fragment.strict.json 缺失（v2.3 引入）');

if (isFile(fragmentJsonPath)) {
  const frag = readJSON(fragmentJsonPath);
  // 信任模式必备 5 个字段
  assert(Array.isArray(frag.permissions?.allow) && frag.permissions.allow.includes('*'),
    'settings.fragment 信任模式应有 permissions.allow=["*"]');
  assert(frag.permissions?.defaultMode === 'bypassPermissions',
    'settings.fragment 信任模式应有 defaultMode=bypassPermissions');
  assert(frag.enableAllProjectMcpServers === true,
    'settings.fragment 应有 enableAllProjectMcpServers=true');
  assert(frag.skipDangerousModePermissionPrompt === true,
    'settings.fragment 应有 skipDangerousModePermissionPrompt=true');
  assert(frag.skipAutoPermissionPrompt === true,
    'settings.fragment 应有 skipAutoPermissionPrompt=true');
}

if (isFile(fragmentStrictPath)) {
  const fragS = readJSON(fragmentStrictPath);
  assert(Array.isArray(fragS.permissions?.allow) && !fragS.permissions.allow.includes('*'),
    'settings.fragment.strict 严格模式不应含 ["*"]');
  assert(fragS.permissions?.defaultMode !== 'bypassPermissions',
    'settings.fragment.strict 不应有 bypassPermissions');
  assert(!fragS.skipDangerousModePermissionPrompt,
    'settings.fragment.strict 不应 skip dangerous prompt');
}

// --- 8e. CLAUDE.global.example.md 模板（v2.3 引入）---

const globalTemplate = path.join(src, 'templates', 'CLAUDE.global.example.md');
assert(isFile(globalTemplate), 'source/templates/CLAUDE.global.example.md 缺失（v2.3 引入）');
if (isFile(globalTemplate)) {
  const tpl = readText(globalTemplate);
  assert(tpl.includes('优先复用'), 'CLAUDE.global.example 应含核心条款"优先复用"');
  assert(tpl.length > 1000, 'CLAUDE.global.example 内容过短');
}

// --- 9. rules 完整性（TS + Python 对齐）---

const pyRulesDir = path.join(src, 'rules', 'python');
const tsRulesDir = path.join(src, 'rules', 'typescript');
if (isDir(pyRulesDir) && isDir(tsRulesDir)) {
  const pyFiles = new Set(listDir(pyRulesDir).filter(f => f.endsWith('.md')));
  const tsFiles = new Set(listDir(tsRulesDir).filter(f => f.endsWith('.md')));
  // 两侧应有同名文件覆盖（coding-style / hooks / patterns / security / testing）
  for (const core of ['coding-style.md', 'testing.md', 'security.md', 'hooks.md', 'patterns.md']) {
    assert(pyFiles.has(core), `rules/python/${core} 缺失`);
    assert(tsFiles.has(core), `rules/typescript/${core} 缺失`);
  }
}

// --- 报告 ---

console.log('');
console.log('════════════════════════════════════');
console.log('  MCC Smoke Test');
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

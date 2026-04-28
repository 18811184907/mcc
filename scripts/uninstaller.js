#!/usr/bin/env node
// MCC Uninstaller
// 从备份恢复 settings.json / config.toml，并清理 MCC namespace 下的内容。

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');

// ═══ 参数 ════════════════════════════════════════════

function parseArgs(argv) {
  const args = { scope: 'global', timestamp: '', dryRun: false, force: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scope') args.scope = argv[++i];
    else if (a === '--timestamp') args.timestamp = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--force') args.force = true;
    else if (a === '-h' || a === '--help') {
      console.log(`MCC Uninstaller

用法:
  node scripts/uninstaller.js [选项]

选项:
  --scope <global|project>        从哪里卸载（默认 global）
  --timestamp <YYYY-MM-DD-HHMMSS> 指定备份时间戳（不给则用最近的）
  --dry-run                       只打印计划
  --force                         跳过确认提示
`);
      process.exit(0);
    }
  }
  return args;
}

// ═══ 工具 ═════════════════════════════════════════════

function log(level, msg) {
  const sym = { info: 'ℹ', ok: '✓', warn: '⚠', err: '✗' }[level] || '·';
  console.log(`${sym} ${msg}`);
}

function pathExists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function readJsonIfExists(p) {
  if (!pathExists(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function getInstalledClaudeCommands(targetDir) {
  // 优先读 install 时复制到 targetDir/.mcc-meta/ 的 manifest 副本，
  // 这样即使用户已经删了 mcc repo，uninstaller 仍能精确删除装过的 commands。
  const localManifest = readJsonIfExists(path.join(targetDir, '.mcc-meta', 'INSTALL-MANIFEST.json'));
  const repoManifest = readJsonIfExists(path.join(ROOT, 'dist', 'claude-code', 'INSTALL-MANIFEST.json'));
  const installManifest = localManifest || repoManifest;

  const fromManifest = (installManifest?.files || [])
    .filter(f => f.kind === 'command' && typeof f.install === 'string')
    .map(f => f.install)
    .filter(p => p.startsWith('.claude/commands/') && p.endsWith('.md'))
    .map(p => p.replace('.claude/commands/', ''));

  if (fromManifest.length > 0) {
    return [...new Set(fromManifest)];
  }

  // 最后兜底：列 source/commands/（仅在从 mcc repo 跑且没 manifest 时有效）
  const sourceCommandsDir = path.join(ROOT, 'source', 'commands');
  if (!pathExists(sourceCommandsDir)) return [];
  return fs.readdirSync(sourceCommandsDir).filter(f => f.endsWith('.md'));
}

function findLatestBackup(dir, basename) {
  if (!pathExists(dir)) return null;
  const prefix = `${basename}.backup-`;
  const entries = fs.readdirSync(dir).filter((f) => f.startsWith(prefix));
  if (entries.length === 0) return null;
  entries.sort();
  return path.join(dir, entries[entries.length - 1]);
}

function findBackupByTimestamp(dir, basename, timestamp) {
  if (!pathExists(dir)) return null;
  const name = `${basename}.backup-${timestamp}`;
  const full = path.join(dir, name);
  return pathExists(full) ? full : null;
}

function promptYesNo(question, defaultYes = false) {
  if (!process.stdin.isTTY) return Promise.resolve(defaultYes);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const hint = defaultYes ? ' [Y/n] ' : ' [y/N] ';
  return new Promise((resolve) => {
    rl.question(question + hint, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === '') resolve(defaultYes);
      else resolve(a === 'y' || a === 'yes');
    });
  });
}

function removeDirIfExists(dir, dryRun) {
  if (!pathExists(dir)) return false;
  if (dryRun) {
    log('info', `(dry-run) 删除: ${dir}`);
    return true;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

function removeFileIfExists(p, dryRun) {
  if (!pathExists(p)) return false;
  if (dryRun) {
    log('info', `(dry-run) 删除: ${p}`);
    return true;
  }
  fs.unlinkSync(p);
  return true;
}

// ═══ Claude Code 卸载 ════════════════════════════════

async function uninstallClaudeCode(targetDir, args) {
  log('info', `Claude Code target: ${targetDir}`);

  const summary = { restored: [], removed: [], skipped: [] };

  // 恢复 settings.json
  const settingsPath = path.join(targetDir, 'settings.json');
  let backupPath = null;
  if (args.timestamp) {
    backupPath = findBackupByTimestamp(targetDir, 'settings.json', args.timestamp);
  } else {
    backupPath = findLatestBackup(targetDir, 'settings.json');
  }

  if (backupPath) {
    if (!args.dryRun) {
      fs.copyFileSync(backupPath, settingsPath);
    }
    log('ok', `恢复 settings.json ← ${path.basename(backupPath)}`);
    summary.restored.push('settings.json');
  } else {
    log('warn', `未找到 settings.json 备份${args.timestamp ? ` (timestamp=${args.timestamp})` : ''}`);
  }

  // 删除 MCC namespace
  const mccHooksDir = path.join(targetDir, '.mcc-hooks');
  if (removeDirIfExists(mccHooksDir, args.dryRun)) {
    log('ok', `删除 ${mccHooksDir}`);
    summary.removed.push('.mcc-hooks/');
  }

  // 删除 commands/mcc/（MCC 专有）
  const mccCommandsDir = path.join(targetDir, 'commands', 'mcc');
  if (removeDirIfExists(mccCommandsDir, args.dryRun)) {
    log('ok', `删除 ${mccCommandsDir}`);
    summary.removed.push('commands/mcc/');
  }

  for (const commandFile of getInstalledClaudeCommands(targetDir)) {
    const commandPath = path.join(targetDir, 'commands', commandFile);
    if (removeFileIfExists(commandPath, args.dryRun)) {
      summary.removed.push(`commands/${commandFile}`);
    }
  }

  // 删除 .mcc-meta/ 副本（uninstall 完就用不上了）
  const metaDir = path.join(targetDir, '.mcc-meta');
  if (removeDirIfExists(metaDir, args.dryRun)) {
    summary.removed.push('.mcc-meta/');
  }

  // 删除 rules/common/mcc-principles.md（MCC 独有）
  const princFile = path.join(targetDir, 'rules', 'common', 'mcc-principles.md');
  if (removeFileIfExists(princFile, args.dryRun)) {
    summary.removed.push('rules/common/mcc-principles.md');
  }

  // 不删：
  // - agents/*（用户可能自己改过同名文件，也可能混有 MCC 装的；交给用户自己删）
  // - skills/*（同上）
  // - modes/*（同上）
  // - rules/python/*（用户可能改过）
  // - rules/typescript/*（同上，v1.7 起加入）
  // - PRPs/**/*（用户工作产物，绝不碰）
  // - session-data/*
  // - skills/learned/*
  log('info', 'agents / skills / modes / rules/python / rules/typescript 由用户自行决定是否删除（可能已改动）');
  summary.skipped.push('agents/', 'skills/', 'modes/', 'rules/python/', 'rules/typescript/');

  return summary;
}

// ═══ Codex 卸载 ══════════════════════════════════════

async function uninstallCodex(targetDir, args) {
  // NOTE: AGENTS.md / HOOKS-SOFT-GUIDANCE.md sit one level above targetDir
  // (e.g. ~/AGENTS.md when targetDir=~/.codex, or ./AGENTS.md when targetDir=./.codex).
  // The earlier ad-hoc `path.dirname(targetDir) === targetDir` ternary collapsed
  // to $HOME for global scope, which would delete ~/AGENTS.md if anything ever
  // hooked it up. We now derive targetRoot the same way as the installer.
  const targetRoot = args.scope === 'project'
    ? path.resolve('.')
    : os.homedir();
  log('info', `Codex target: ${targetDir} (root: ${targetRoot})`);

  const summary = { restored: [], removed: [], skipped: [] };

  // 恢复 config.toml
  const configPath = path.join(targetDir, 'config.toml');
  let backupPath = null;
  if (args.timestamp) {
    backupPath = findBackupByTimestamp(targetDir, 'config.toml', args.timestamp);
  } else {
    backupPath = findLatestBackup(targetDir, 'config.toml');
  }

  if (backupPath) {
    if (!args.dryRun) {
      fs.copyFileSync(backupPath, configPath);
    }
    log('ok', `恢复 config.toml ← ${path.basename(backupPath)}`);
    summary.restored.push('config.toml');
  } else {
    log('warn', `未找到 config.toml 备份`);
  }

  // AGENTS.md / HOOKS-SOFT-GUIDANCE.md：不主动删（用户可能参考中）
  log('info', 'AGENTS.md / HOOKS-SOFT-GUIDANCE.md 由用户自行决定是否删除');

  // prompts / agents / rules 目录同 Claude Code 侧处理
  log('info', '.codex/agents / prompts / rules 由用户自行决定是否删除');
  summary.skipped.push('.codex/agents/', '.codex/prompts/', '.codex/rules/', 'AGENTS.md', 'HOOKS-SOFT-GUIDANCE.md');

  return summary;
}

// ═══ 主流程 ═══════════════════════════════════════════

async function main() {
  const args = parseArgs(process.argv);

  console.log(`scope:     ${args.scope}`);
  console.log(`timestamp: ${args.timestamp || '(自动：最近)'}`);
  console.log(`dry-run:   ${args.dryRun}`);
  console.log('');

  const claudeDir = args.scope === 'project' ? path.resolve('.claude') : path.join(os.homedir(), '.claude');
  const codexDir  = args.scope === 'project' ? path.resolve('.codex')  : path.join(os.homedir(), '.codex');

  const hasCc = pathExists(claudeDir);
  const hasCx = pathExists(codexDir);

  if (!hasCc && !hasCx) {
    log('err', '未检测到 Claude Code 或 Codex 安装。');
    process.exit(1);
  }

  log('info', '将执行以下卸载：');
  if (hasCc) log('info', '  · Claude Code：恢复 settings.json + 删除 .mcc-hooks/ + commands/mcc/ + mcc-principles.md');
  if (hasCx) log('info', '  · Codex：恢复 config.toml');
  log('info', '  · 保留：用户 PRPs/ 产物 / session-data / learned skills / agents / skills / modes');
  console.log('');

  if (!args.force && !args.dryRun) {
    const proceed = await promptYesNo('继续？', false);
    if (!proceed) { log('info', '已取消。'); process.exit(0); }
    console.log('');
  }

  const summaries = [];
  if (hasCc) {
    console.log('── 卸载 Claude Code ───────────');
    summaries.push({ target: 'claude-code', ...(await uninstallClaudeCode(claudeDir, args)) });
    console.log('');
  }
  if (hasCx) {
    console.log('── 卸载 Codex ─────────────────');
    summaries.push({ target: 'codex', ...(await uninstallCodex(codexDir, args)) });
    console.log('');
  }

  console.log('====================================');
  console.log('  卸载完成');
  console.log('====================================');
  for (const s of summaries) {
    console.log('');
    console.log(`[${s.target}]`);
    if (s.restored.length) console.log(`  ✓ 恢复: ${s.restored.join(', ')}`);
    if (s.removed.length)  console.log(`  🗑 删除: ${s.removed.join(', ')}`);
    if (s.skipped.length)  console.log(`  ⋯ 保留（用户决定是否删）: ${s.skipped.join(', ')}`);
  }
  console.log('');
  if (args.dryRun) console.log('⚠  dry-run，未实际修改。');
}

if (require.main === module) {
  main().catch((err) => {
    log('err', err.message);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  });
}

module.exports = { getInstalledClaudeCommands };

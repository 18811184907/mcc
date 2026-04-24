#!/usr/bin/env node
// MCC Installer
// 安装 MCC v1 到 Claude Code 和/或 Codex。
// 核心约束：不覆盖用户已有的 agent/command/skill/rule。JSON 深度合并。带备份。

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');

// ═══ 参数解析 ═══════════════════════════════════════════

function parseArgs(argv) {
  const args = {
    scope: 'global',
    target: 'auto',
    force: false,
    dryRun: false,
    verbose: false,
    exclusive: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scope') args.scope = argv[++i];
    else if (a === '--target') args.target = argv[++i];
    else if (a === '--force') args.force = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--verbose') args.verbose = true;
    else if (a === '--exclusive') args.exclusive = true;
    else if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    }
  }
  if (!['global', 'project', 'hybrid'].includes(args.scope)) {
    throw new Error(`--scope 必须是 global/project/hybrid，不是 "${args.scope}"`);
  }
  if (!['auto', 'claude-code', 'codex', 'both'].includes(args.target)) {
    throw new Error(`--target 必须是 auto/claude-code/codex/both，不是 "${args.target}"`);
  }
  return args;
}

function printHelp() {
  console.log(`MCC Installer v1.2.0

用法:
  node scripts/installer.js [选项]

选项:
  --scope <global|project|hybrid>    安装位置（默认 global = ~/.claude）
                                     global: 装到 ~/.claude 和 ~/.codex
                                     project: 装到当前目录的 .claude 和 .codex
                                     hybrid: 通用资产全局 + rules/PRPs 项目级
  --target <auto|claude-code|codex|both>  目标工具（默认 auto = 检测已装的）
  --force                            同名文件覆盖（默认跳过用户已有的）
  --exclusive                        独占模式：先备份并清空 agents/commands/skills/modes 目录
                                     再装 MCC。rules/ 和 settings.json 保留。
                                     只用 MCC、想清干净现有 agent/command/skill 的场景。
  --dry-run                          只打印计划，不动任何文件
  --verbose                          详细日志
  -h, --help                         显示此帮助

示例:
  node scripts/installer.js                          # 自动检测 + 全局装（共存模式，同名跳过）
  node scripts/installer.js --exclusive              # 全局 + 独占（清空 agent/command/skill/mode 再装）
  node scripts/installer.js --scope project          # 装到当前项目
  node scripts/installer.js --target codex           # 只装 Codex 侧
`);
}

// ═══ 日志 ════════════════════════════════════════════

function log(level, msg) {
  const sym = { info: 'ℹ', ok: '✓', warn: '⚠', err: '✗', step: '·' }[level] || '·';
  console.log(`${sym} ${msg}`);
}

let VERBOSE = false;
function vlog(msg) {
  if (VERBOSE) log('step', msg);
}

// ═══ FS 工具 ═════════════════════════════════════════

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function pathExists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function expandHome(p) {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

function writeText(p, s) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, s, 'utf8');
}

function copyFile(src, dst) {
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
}

// 递归列文件（相对路径）
function walkFiles(root) {
  if (!pathExists(root)) return [];
  const out = [];
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    const abs = path.join(root, rel);
    const entries = fs.readdirSync(abs, { withFileTypes: true });
    for (const e of entries) {
      const childRel = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) stack.push(childRel);
      else if (e.isFile()) out.push(childRel);
    }
  }
  return out.sort();
}

// 拷贝目录：同名跳过（除非 force）；返回 { copied, skipped }
function copyDirSkipExisting(src, dst, force, dryRun, label) {
  const result = { copied: [], skipped: [] };
  if (!pathExists(src)) return result;
  if (!dryRun) ensureDir(dst);
  for (const rel of walkFiles(src)) {
    const srcPath = path.join(src, rel);
    const dstPath = path.join(dst, rel);
    if (pathExists(dstPath) && !force) {
      result.skipped.push(rel);
      vlog(`${label} skip (already exists): ${rel}`);
      continue;
    }
    if (!dryRun) {
      copyFile(srcPath, dstPath);
    }
    result.copied.push(rel);
  }
  return result;
}

// ═══ 备份 ════════════════════════════════════════════

function makeBackupTimestamp() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

function backupDir(dir, timestamp, dryRun) {
  if (!pathExists(dir)) return null;
  const parent = path.dirname(dir);
  const name = path.basename(dir);
  const backup = path.join(parent, `${name}.backup-${timestamp}`);
  if (dryRun) {
    log('info', `(dry-run) 备份 ${dir} → ${backup}`);
    return backup;
  }
  // 跨驱动器 rename 失败，fallback copy
  try {
    fs.renameSync(dir, backup);
  } catch {
    copyDirRecursive(dir, backup);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  log('ok', `备份 ${dir} → ${backup}`);
  return backup;
}

function copyDirRecursive(src, dst) {
  ensureDir(dst);
  for (const rel of walkFiles(src)) {
    copyFile(path.join(src, rel), path.join(dst, rel));
  }
}

// ═══ 环境检测 ════════════════════════════════════════

function detectEnvironment() {
  const env = {
    home: os.homedir(),
    claudeCode: {
      dir: path.join(os.homedir(), '.claude'),
      exists: false,
      settingsPath: null,
    },
    codex: {
      dir: path.join(os.homedir(), '.codex'),
      exists: false,
      configPath: null,
    },
    node: { version: process.version },
  };

  // Claude Code
  if (pathExists(env.claudeCode.dir)) {
    env.claudeCode.exists = true;
    const sp = path.join(env.claudeCode.dir, 'settings.json');
    if (pathExists(sp)) env.claudeCode.settingsPath = sp;
  }

  // Codex
  if (pathExists(env.codex.dir)) {
    env.codex.exists = true;
    const cp = path.join(env.codex.dir, 'config.toml');
    if (pathExists(cp)) env.codex.configPath = cp;
  }

  return env;
}

// ═══ JSON 深度合并（settings.json）══════════════════════

/**
 * 深度合并 existing 和 fragment（都是对象）：
 *  - permissions.allow 并集去重
 *  - hooks 数组按 matcher + command 联合去重，新增项追加
 *  - mcpServers 对象合并（同名以 fragment 覆盖）
 *  - 其他字段：fragment 存在则覆盖
 */
function mergeSettingsJson(existing, fragment) {
  const merged = JSON.parse(JSON.stringify(existing || {}));

  // permissions
  if (fragment.permissions) {
    merged.permissions = merged.permissions || {};
    if (fragment.permissions.allow) {
      const existAllow = Array.isArray(merged.permissions.allow) ? merged.permissions.allow : [];
      merged.permissions.allow = [...new Set([...existAllow, ...fragment.permissions.allow])];
    }
  }

  // hooks：按 event + matcher 分组，合并数组
  if (fragment.hooks) {
    merged.hooks = merged.hooks || {};
    for (const [event, groups] of Object.entries(fragment.hooks)) {
      if (!Array.isArray(groups)) continue;
      merged.hooks[event] = merged.hooks[event] || [];
      for (const group of groups) {
        // 查找同 matcher 的已有 group
        const existingGroup = merged.hooks[event].find(
          (g) => g.matcher === group.matcher,
        );
        if (existingGroup) {
          // 合并 hooks 数组，按 command 去重
          const existCmds = new Set(
            (existingGroup.hooks || []).map((h) => h.command),
          );
          for (const h of group.hooks || []) {
            if (!existCmds.has(h.command)) {
              existingGroup.hooks.push(h);
            }
          }
        } else {
          merged.hooks[event].push(group);
        }
      }
    }
  }

  // mcpServers
  if (fragment.mcpServers) {
    merged.mcpServers = { ...(merged.mcpServers || {}), ...fragment.mcpServers };
  }

  // 其他字段（非 _mcc_ 开头、非上面已处理的）：fragment 覆盖
  const skip = new Set(['permissions', 'hooks', 'mcpServers', '$schema']);
  for (const [k, v] of Object.entries(fragment)) {
    if (skip.has(k) || k.startsWith('_mcc_')) continue;
    merged[k] = v;
  }

  return merged;
}

// ═══ TOML 追加合并（config.toml）═════════════════════════

/**
 * 把 TOML fragment 追加到现有 TOML。按 [section.name] 去重。
 *  - 如果 existing 已有同名 [mcp_servers.xxx]，跳过（不覆盖用户已有）除非 force
 *  - 其他 [section] 追加到末尾
 */
function appendTomlFragment(existingToml, fragment, force) {
  const existingSections = extractTomlSections(existingToml);
  const fragmentSections = extractTomlSections(fragment);

  const toAppend = [];
  const skipped = [];

  for (const [name, body] of Object.entries(fragmentSections.sections)) {
    if (name in existingSections.sections && !force) {
      skipped.push(name);
      continue;
    }
    toAppend.push({ name, body });
  }

  if (toAppend.length === 0) {
    return { merged: existingToml, added: [], skipped };
  }

  let merged = existingToml;
  if (merged.length > 0 && !merged.endsWith('\n')) merged += '\n';
  if (!merged.endsWith('\n\n')) merged += '\n';
  merged += '# ═══ MCC MCP servers (added by installer) ═══\n\n';
  for (const { name, body } of toAppend) {
    merged += `[${name}]\n${body}\n`;
  }

  return { merged, added: toAppend.map((t) => t.name), skipped };
}

function extractTomlSections(toml) {
  const sections = {};
  const lines = toml.split(/\r?\n/);
  let currentName = null;
  let currentBody = [];
  const preamble = [];

  for (const line of lines) {
    const secMatch = /^\[([^\[\]]+)\]\s*$/.exec(line);
    if (secMatch) {
      if (currentName) {
        sections[currentName] = currentBody.join('\n').trim();
      }
      currentName = secMatch[1];
      currentBody = [];
    } else if (currentName === null) {
      preamble.push(line);
    } else {
      currentBody.push(line);
    }
  }
  if (currentName) {
    sections[currentName] = currentBody.join('\n').trim();
  }
  return { preamble: preamble.join('\n'), sections };
}

// ═══ 变量替换（hooks.json 里的 ${MCC_HOOKS} 等）══════════

function replaceInstallVariables(content, vars) {
  let out = content;
  for (const [key, val] of Object.entries(vars)) {
    const pattern = new RegExp('\\$\\{' + key + '\\}', 'g');
    // 路径里反斜杠替换为正斜杠（JSON 里安全）
    const safe = val.replace(/\\/g, '/');
    out = out.replace(pattern, safe);
  }
  return out;
}

// ═══ Claude Code 安装 ════════════════════════════════

async function installClaudeCode(distDir, scope, options) {
  const sourceClaudeDir = path.join(distDir, '.claude');
  if (!pathExists(sourceClaudeDir)) {
    throw new Error(`dist/claude-code/.claude/ 不存在：${sourceClaudeDir}`);
  }

  const targetDir = scope === 'project' ? path.resolve('.claude') : path.join(os.homedir(), '.claude');
  log('info', `Claude Code 目标: ${targetDir}`);

  // 备份
  const timestamp = makeBackupTimestamp();

  // v1.2: 独占模式 — 备份并清空 agents/commands/skills/modes（保留 rules/settings.json）
  if (options.exclusive && pathExists(targetDir)) {
    const ccDirs = ['agents', 'commands', 'skills', 'modes'];
    const excBackupRoot = `${targetDir}.exclusive-backup-${timestamp}`;
    log('info', `[exclusive] 备份+清空 ${ccDirs.join(', ')} → ${excBackupRoot}`);
    for (const d of ccDirs) {
      const fromDir = path.join(targetDir, d);
      if (!pathExists(fromDir)) continue;
      const toDir = path.join(excBackupRoot, d);
      if (!options.dryRun) {
        ensureDir(path.dirname(toDir));
        try { fs.renameSync(fromDir, toDir); }
        catch { copyDirRecursive(fromDir, toDir); fs.rmSync(fromDir, { recursive: true, force: true }); }
      }
      log('ok', `  ✓ ${d}/ → ${path.basename(excBackupRoot)}/${d}/`);
    }
  }

  let backup = null;
  if (pathExists(targetDir) && !options.dryRun) {
    // 不备份整个 ~/.claude/（太大），只备份会被我们碰的部分：settings.json
    const settingsPath = path.join(targetDir, 'settings.json');
    if (pathExists(settingsPath)) {
      const backupSettings = path.join(targetDir, `settings.json.backup-${timestamp}`);
      fs.copyFileSync(settingsPath, backupSettings);
      log('ok', `备份 settings.json → settings.json.backup-${timestamp}`);
      backup = backupSettings;
    }
  }

  const report = {
    target: 'claude-code',
    scope,
    targetDir,
    backup,
    timestamp,
    copied: { agents: [], commands: [], skills: [], modes: [], hookScripts: [], rules: [] },
    skipped: { agents: [], commands: [], skills: [], modes: [], rules: [] },
    merged: { settingsJson: false, mcpServers: false, hooks: false },
  };

  // 1) agents → targetDir/agents/（同名跳过）
  const agentsRes = copyDirSkipExisting(
    path.join(sourceClaudeDir, 'agents'),
    path.join(targetDir, 'agents'),
    options.force, options.dryRun, 'agents',
  );
  report.copied.agents = agentsRes.copied;
  report.skipped.agents = agentsRes.skipped;
  log('ok', `agents: ${agentsRes.copied.length} copied, ${agentsRes.skipped.length} skipped`);

  // 2) commands/mcc/ → targetDir/commands/mcc/
  const cmdRes = copyDirSkipExisting(
    path.join(sourceClaudeDir, 'commands'),
    path.join(targetDir, 'commands'),
    options.force, options.dryRun, 'commands',
  );
  report.copied.commands = cmdRes.copied;
  report.skipped.commands = cmdRes.skipped;
  log('ok', `commands: ${cmdRes.copied.length} copied, ${cmdRes.skipped.length} skipped`);

  // 3) skills → targetDir/skills/（skill 目录级同名跳过）
  const skillsRes = copyDirSkipExisting(
    path.join(sourceClaudeDir, 'skills'),
    path.join(targetDir, 'skills'),
    options.force, options.dryRun, 'skills',
  );
  report.copied.skills = skillsRes.copied;
  report.skipped.skills = skillsRes.skipped;
  log('ok', `skills: ${skillsRes.copied.length} copied, ${skillsRes.skipped.length} skipped`);

  // 4) modes → targetDir/modes/
  const modesRes = copyDirSkipExisting(
    path.join(sourceClaudeDir, 'modes'),
    path.join(targetDir, 'modes'),
    options.force, options.dryRun, 'modes',
  );
  report.copied.modes = modesRes.copied;
  report.skipped.modes = modesRes.skipped;
  log('ok', `modes: ${modesRes.copied.length} copied, ${modesRes.skipped.length} skipped`);

  // 5) hooks scripts → targetDir/.mcc-hooks/scripts/（MCC namespace，force 覆盖保新）
  const hookScriptsRes = copyDirSkipExisting(
    path.join(sourceClaudeDir, '.mcc-hooks', 'scripts'),
    path.join(targetDir, '.mcc-hooks', 'scripts'),
    true, options.dryRun, 'hook-scripts',
  );
  report.copied.hookScripts = hookScriptsRes.copied;
  log('ok', `hook scripts: ${hookScriptsRes.copied.length} files → .mcc-hooks/scripts/`);

  // 6) hooks.json 的 ${MCC_HOOKS} 替换
  const hooksJsonSrc = path.join(sourceClaudeDir, '.mcc-hooks', 'hooks.json');
  const hooksJsonDst = path.join(targetDir, '.mcc-hooks', 'hooks.json');
  if (pathExists(hooksJsonSrc)) {
    const mccHome = path.join(targetDir, '.mcc-hooks');
    const mccSkills = path.join(targetDir, 'skills');
    const content = readText(hooksJsonSrc);
    const replaced = replaceInstallVariables(content, {
      MCC_HOME: mccHome,
      MCC_HOOKS: mccHome,
      MCC_SKILLS: mccSkills,
    });
    if (!options.dryRun) {
      writeText(hooksJsonDst, replaced);
    }
    log('ok', `hooks.json 占位符已替换并写入 .mcc-hooks/`);
  }

  // 7) rules/python 和 rules/common/mcc-principles.md → targetDir/rules/（仅目标不存在）
  const rulesRes = copyDirSkipExisting(
    path.join(sourceClaudeDir, 'rules'),
    path.join(targetDir, 'rules'),
    options.force, options.dryRun, 'rules',
  );
  report.copied.rules = rulesRes.copied;
  report.skipped.rules = rulesRes.skipped;
  log('ok', `rules: ${rulesRes.copied.length} copied, ${rulesRes.skipped.length} skipped`);

  // 8) PRPs 占位目录（只在 project scope 下装，global 下不需要）
  if (scope === 'project') {
    const prpsSrc = path.join(sourceClaudeDir, 'PRPs');
    const prpsDst = path.join(targetDir, 'PRPs');
    if (pathExists(prpsSrc) && !pathExists(prpsDst)) {
      if (!options.dryRun) copyDirRecursive(prpsSrc, prpsDst);
      log('ok', `PRPs/ 占位目录已建`);
    }
  }

  // 9) 合并 settings.json
  const fragmentPath = path.join(sourceClaudeDir, 'settings.fragment.json');
  const settingsPath = path.join(targetDir, 'settings.json');
  if (pathExists(fragmentPath)) {
    const fragment = readJson(fragmentPath);
    // 在 fragment 的 hooks 里也做变量替换（它引用了 ${MCC_HOOKS}）
    const fragmentStr = JSON.stringify(fragment);
    const resolvedStr = replaceInstallVariables(fragmentStr, {
      MCC_HOME: path.join(targetDir, '.mcc-hooks'),
      MCC_HOOKS: path.join(targetDir, '.mcc-hooks'),
      MCC_SKILLS: path.join(targetDir, 'skills'),
    });
    const resolvedFragment = JSON.parse(resolvedStr);

    let existing = {};
    if (pathExists(settingsPath)) existing = readJson(settingsPath);
    const merged = mergeSettingsJson(existing, resolvedFragment);

    // 合并 MCP 配置到 mcpServers
    const mcpPath = path.join(sourceClaudeDir, 'mcp-configs', 'mcp.json');
    if (pathExists(mcpPath)) {
      const mcpJson = readJson(mcpPath);
      if (mcpJson.mcpServers) {
        merged.mcpServers = { ...(merged.mcpServers || {}), ...mcpJson.mcpServers };
        report.merged.mcpServers = true;
      }
    }

    if (!options.dryRun) writeJson(settingsPath, merged);
    report.merged.settingsJson = true;
    report.merged.hooks = true;
    log('ok', `settings.json 已深度合并（permissions 并集、hooks 追加去重、mcpServers 合并）`);
  }

  return report;
}

// ═══ Codex 安装 ══════════════════════════════════════

async function installCodex(distDir, scope, options) {
  if (!pathExists(distDir) || fs.readdirSync(distDir).length === 0) {
    throw new Error(`dist/codex/ 不存在或为空`);
  }

  const targetDir = scope === 'project' ? path.resolve('.codex') : path.join(os.homedir(), '.codex');
  const targetRoot = scope === 'project' ? path.resolve('.') : os.homedir();
  log('info', `Codex 目标: ${targetDir}`);

  const timestamp = makeBackupTimestamp();

  // v1.2: 独占模式 — 备份并清空 agents/prompts/rules（保留 config.toml）
  if (options.exclusive && pathExists(targetDir)) {
    const cxDirs = ['agents', 'prompts', 'rules'];
    const excBackupRoot = `${targetDir}.exclusive-backup-${timestamp}`;
    log('info', `[exclusive] 备份+清空 ${cxDirs.join(', ')} → ${excBackupRoot}`);
    for (const d of cxDirs) {
      const fromDir = path.join(targetDir, d);
      if (!pathExists(fromDir)) continue;
      const toDir = path.join(excBackupRoot, d);
      if (!options.dryRun) {
        ensureDir(path.dirname(toDir));
        try { fs.renameSync(fromDir, toDir); }
        catch { copyDirRecursive(fromDir, toDir); fs.rmSync(fromDir, { recursive: true, force: true }); }
      }
      log('ok', `  ✓ ${d}/ → ${path.basename(excBackupRoot)}/${d}/`);
    }
  }

  let backup = null;
  if (pathExists(targetDir) && !options.dryRun) {
    const configPath = path.join(targetDir, 'config.toml');
    if (pathExists(configPath)) {
      const backupConfig = path.join(targetDir, `config.toml.backup-${timestamp}`);
      fs.copyFileSync(configPath, backupConfig);
      log('ok', `备份 config.toml → config.toml.backup-${timestamp}`);
      backup = backupConfig;
    }
  }

  const report = {
    target: 'codex',
    scope,
    targetDir,
    backup,
    timestamp,
    copied: { agents: [], prompts: [], rules: [] },
    skipped: { agents: [], prompts: [], rules: [] },
    agentsMd: null,
    mergedToml: { added: [], skipped: [] },
  };

  // 1) .codex/agents/ → targetDir/agents/（同名跳过）
  const srcCodex = path.join(distDir, '.codex');
  const agentsRes = copyDirSkipExisting(
    path.join(srcCodex, 'agents'),
    path.join(targetDir, 'agents'),
    options.force, options.dryRun, 'codex-agents',
  );
  report.copied.agents = agentsRes.copied;
  report.skipped.agents = agentsRes.skipped;
  log('ok', `.codex/agents/: ${agentsRes.copied.length} copied, ${agentsRes.skipped.length} skipped`);

  // 2) .codex/prompts/ → targetDir/prompts/
  const promptsRes = copyDirSkipExisting(
    path.join(srcCodex, 'prompts'),
    path.join(targetDir, 'prompts'),
    options.force, options.dryRun, 'codex-prompts',
  );
  report.copied.prompts = promptsRes.copied;
  report.skipped.prompts = promptsRes.skipped;
  log('ok', `.codex/prompts/: ${promptsRes.copied.length} copied, ${promptsRes.skipped.length} skipped`);

  // 3) .codex/rules/ → targetDir/rules/
  const rulesRes = copyDirSkipExisting(
    path.join(srcCodex, 'rules'),
    path.join(targetDir, 'rules'),
    options.force, options.dryRun, 'codex-rules',
  );
  report.copied.rules = rulesRes.copied;
  report.skipped.rules = rulesRes.skipped;
  log('ok', `.codex/rules/: ${rulesRes.copied.length} copied, ${rulesRes.skipped.length} skipped`);

  // 4) AGENTS.md → targetRoot/AGENTS.md（如果没有就直接写；如有就追加 MCC section）
  const agentsMdSrc = path.join(distDir, 'AGENTS.md');
  const agentsMdDst = path.join(targetRoot, 'AGENTS.md');
  if (pathExists(agentsMdSrc)) {
    const mccContent = readText(agentsMdSrc);
    if (pathExists(agentsMdDst)) {
      const existing = readText(agentsMdDst);
      if (existing.includes('# AGENTS.md') && existing.includes('MCC 自动生成')) {
        log('warn', `AGENTS.md 已含 MCC section，跳过（用 --force 强制覆盖）`);
      } else {
        const merged = existing + '\n\n---\n\n# MCC Section\n\n' + mccContent;
        if (!options.dryRun) writeText(agentsMdDst, merged);
        log('ok', `AGENTS.md 追加了 MCC section`);
        report.agentsMd = 'appended';
      }
    } else {
      if (!options.dryRun) copyFile(agentsMdSrc, agentsMdDst);
      log('ok', `AGENTS.md 已写入 ${agentsMdDst}`);
      report.agentsMd = 'created';
    }
  }

  // 5) HOOKS-SOFT-GUIDANCE.md → targetRoot/（仅参考文档）
  const guidanceSrc = path.join(distDir, 'HOOKS-SOFT-GUIDANCE.md');
  const guidanceDst = path.join(targetRoot, 'HOOKS-SOFT-GUIDANCE.md');
  if (pathExists(guidanceSrc) && (!pathExists(guidanceDst) || options.force)) {
    if (!options.dryRun) copyFile(guidanceSrc, guidanceDst);
    log('ok', `HOOKS-SOFT-GUIDANCE.md 已写入`);
  }

  // 6) 合并 config.toml
  const tomlFragSrc = path.join(distDir, 'config.fragment.toml');
  const configTomlDst = path.join(targetDir, 'config.toml');
  if (pathExists(tomlFragSrc)) {
    const fragment = readText(tomlFragSrc);
    let existing = '';
    if (pathExists(configTomlDst)) existing = readText(configTomlDst);
    const { merged, added, skipped } = appendTomlFragment(existing, fragment, options.force);
    if (!options.dryRun) writeText(configTomlDst, merged);
    report.mergedToml = { added, skipped };
    log('ok', `config.toml: +${added.length} sections, ${skipped.length} already present`);
  }

  return report;
}

// ═══ 用户确认 ════════════════════════════════════════

function promptYesNo(question, defaultYes = true) {
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

// ═══ 主流程 ═══════════════════════════════════════════

async function main() {
  const args = parseArgs(process.argv);
  VERBOSE = args.verbose;

  console.log(`scope:  ${args.scope}`);
  console.log(`target: ${args.target}`);
  console.log(`force:  ${args.force}`);
  console.log(`dry-run: ${args.dryRun}`);
  console.log('');

  const manifest = readJson(MANIFEST_PATH);
  log('info', `MCC version ${manifest.version}`);
  console.log('');

  const env = detectEnvironment();
  log('info', `Home: ${env.home}`);
  log('info', `Node: ${env.node.version}`);
  log('info', `Claude Code: ${env.claudeCode.exists ? '✓ ' + env.claudeCode.dir : '✗ 未装'}`);
  log('info', `Codex:       ${env.codex.exists ? '✓ ' + env.codex.dir : '✗ 未装'}`);
  console.log('');

  // 决定实际 targets
  let targets = [];
  if (args.target === 'auto') {
    if (env.claudeCode.exists) targets.push('claude-code');
    if (env.codex.exists) targets.push('codex');
    if (targets.length === 0) {
      log('err', '未检测到 Claude Code 或 Codex。请先安装其中一个。');
      process.exit(1);
    }
  } else if (args.target === 'both') {
    targets = ['claude-code', 'codex'];
  } else {
    targets = [args.target];
  }

  log('info', `将安装到: ${targets.join(', ')}`);
  console.log('');

  if (!args.dryRun && process.stdin.isTTY) {
    const proceed = await promptYesNo('继续吗？');
    if (!proceed) {
      log('info', '已取消。');
      process.exit(0);
    }
    console.log('');
  }

  // 执行安装
  const reports = [];
  for (const target of targets) {
    console.log(`── 安装 ${target} ─────────────`);
    const distDir = path.join(DIST, target);
    if (!pathExists(distDir)) {
      log('err', `dist/${target}/ 不存在。先跑 'node adapters/build.js' 构建。`);
      process.exit(1);
    }
    try {
      if (target === 'claude-code') {
        reports.push(await installClaudeCode(distDir, args.scope, args));
      } else if (target === 'codex') {
        reports.push(await installCodex(distDir, args.scope, args));
      }
      console.log('');
    } catch (err) {
      log('err', `${target} 安装失败: ${err.message}`);
      if (args.verbose) console.error(err.stack);
      process.exit(1);
    }
  }

  // 打印最终报告
  console.log('');
  console.log('====================================');
  console.log('  安装完成');
  console.log('====================================');
  for (const r of reports) {
    console.log('');
    console.log(`[${r.target}] scope=${r.scope}  target=${r.targetDir}`);
    for (const [k, v] of Object.entries(r.copied)) {
      if (v.length > 0) console.log(`  ✓ ${k}: ${v.length} 个`);
    }
    for (const [k, v] of Object.entries(r.skipped)) {
      if (v.length > 0) console.log(`  ⋯ ${k} (跳过已有): ${v.length} 个`);
    }
    if (r.merged) {
      if (r.merged.settingsJson) console.log(`  ✓ settings.json 已合并`);
      if (r.merged.mcpServers)   console.log(`  ✓ mcpServers 已合并`);
    }
    if (r.mergedToml) {
      if (r.mergedToml.added.length > 0) console.log(`  ✓ config.toml: +${r.mergedToml.added.length} MCP`);
      if (r.mergedToml.skipped.length > 0) console.log(`  ⋯ config.toml 已有 ${r.mergedToml.skipped.length} MCP`);
    }
    if (r.backup) console.log(`  💾 备份: ${r.backup}`);
    if (r.timestamp) console.log(`  🕐 时间戳: ${r.timestamp}`);
  }
  console.log('');
  console.log('回滚:');
  for (const r of reports) {
    if (r.timestamp) {
      console.log(`  .\\uninstall.ps1 -Timestamp ${r.timestamp}   (Windows)`);
      console.log(`  ./uninstall.sh --timestamp ${r.timestamp}   (Unix)`);
      break;
    }
  }
  console.log('');
  if (args.dryRun) {
    console.log('⚠  这是 dry-run，没有实际修改任何文件。去掉 --dry-run 真跑。');
    console.log('');
  }
}

main().catch((err) => {
  log('err', err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});

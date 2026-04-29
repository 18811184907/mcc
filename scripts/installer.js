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
    scope: 'smart',       // v2.4: smart 是新默认 = 用户级强制 ~/.claude + 项目 cwd 建 PRPs/
    target: 'auto',
    force: false,
    dryRun: false,
    verbose: false,
    exclusive: false,
    strict: false,        // v2.3: --strict 用细粒度白名单（替代默认信任模式）
    skipClaudemd: false,  // v2.3: --skip-claudemd 跳过自动写 ~/.claude/CLAUDE.md
    noProjectStub: false, // v2.4: --no-project-stub 跳过 cwd 建 PRPs/（仅 smart 场景生效）
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scope') args.scope = argv[++i];
    else if (a === '--target') args.target = argv[++i];
    else if (a === '--force') args.force = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--verbose') args.verbose = true;
    else if (a === '--exclusive') args.exclusive = true;
    else if (a === '--strict') args.strict = true;
    else if (a === '--skip-claudemd') args.skipClaudemd = true;
    else if (a === '--no-project-stub') args.noProjectStub = true;
    else if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    }
  }
  if (!['smart', 'global', 'project', 'hybrid'].includes(args.scope)) {
    throw new Error(`--scope 必须是 smart/global/project/hybrid，不是 "${args.scope}"`);
  }
  if (!['auto', 'claude-code', 'codex', 'both'].includes(args.target)) {
    throw new Error(`--target 必须是 auto/claude-code/codex/both，不是 "${args.target}"`);
  }
  return args;
}

function printHelp() {
  console.log(`MCC Installer

用法:
  node scripts/installer.js [选项]

选项:
  --scope <smart|global|project|hybrid>  安装模式（默认 smart）
                                     smart   (推荐): 用户级强制装 ~/.claude/（Claude Code）
                                              + ~/.codex/（Codex agents/prompts/rules/AGENTS.md/MCP）
                                              + 当前项目下建 .claude/PRPs/（工作产物目录）
                                     global  : 只装 ~/.claude/ + ~/.codex/，不动当前目录
                                     project : 全套装到当前目录 .claude/ + .codex/，团队 commit 场景
                                     hybrid  : (alias of smart, 兼容老调用方)
  --target <auto|claude-code|codex|both>  目标工具（默认 auto = 检测已装的）
  --force                            同名文件覆盖（默认跳过用户已有的）
  --exclusive                        独占模式：先备份并清空 agents/commands/skills/modes 目录
                                     再装 MCC。rules/ 和 settings.json 保留。
  --no-project-stub                  smart 模式下跳过 cwd 建 PRPs/（等价于 --scope global）
  --strict                           严格权限模式（细粒度白名单 + 不开 bypassPermissions）
  --skip-claudemd                    跳过自动写 ~/.claude/CLAUDE.md
  --dry-run                          只打印计划，不动任何文件
  --verbose                          详细日志
  -h, --help                         显示此帮助

示例:
  node scripts/installer.js                          # smart 模式（推荐）
  node scripts/installer.js --scope global           # 只装全局，不动当前目录
  node scripts/installer.js --scope project          # 团队共享：全套到 ./.claude/ + ./.codex/
  node scripts/installer.js --exclusive              # smart + 独占（清空已有 agent/command/skill/mode）
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

// v2.4.3: 把绝对路径转成 Claude Code permissions 规则用的 path-glob 格式
// Windows: C:\Users\28935 -> //c/Users/28935
// Unix:    /Users/anouk    -> /Users/anouk
function pathToClaudeCodeGlob(absPath) {
  const normalized = absPath.replace(/\\/g, '/');
  const driveMatch = normalized.match(/^([A-Za-z]):\/(.*)/);
  if (driveMatch) {
    return `//${driveMatch[1].toLowerCase()}/${driveMatch[2]}`;
  }
  return normalized;
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
  // 先尝试 renameSync（同盘符原子）
  try {
    fs.renameSync(dir, backup);
    log('ok', `备份 ${dir} → ${backup}`);
    return backup;
  } catch (err) {
    if (err.code !== 'EXDEV' && err.code !== 'EPERM') throw err;
    // EXDEV 跨盘符 / EPERM Windows 常见 → 走原子 copy-then-delete 策略
    return backupDirAtomicCrossDevice(dir, backup);
  }
}

// 跨盘符"原子"备份：先 copy 到 backup.tmp → 校验完整 → rename 为 backup → 删原目录。
// 任一步失败都不会让 src 和 backup 同时存在冲突状态。
function backupDirAtomicCrossDevice(src, finalBackup) {
  const tmpBackup = finalBackup + '.tmp';
  try {
    // 清理旧残留（上次异常中断留下的）
    if (pathExists(tmpBackup)) fs.rmSync(tmpBackup, { recursive: true, force: true });

    // 1) copy 到 tmp
    copyDirRecursive(src, tmpBackup);

    // 2) 验证完整：文件数 + 总大小对齐
    const srcStats = collectDirStats(src);
    const tmpStats = collectDirStats(tmpBackup);
    if (srcStats.fileCount !== tmpStats.fileCount || srcStats.totalSize !== tmpStats.totalSize) {
      // 失败：留下 src 不动，删除不完整的 tmp
      fs.rmSync(tmpBackup, { recursive: true, force: true });
      throw new Error(
        `备份校验失败（文件数 ${srcStats.fileCount}→${tmpStats.fileCount}，字节 ${srcStats.totalSize}→${tmpStats.totalSize}）。源目录未动，请检查磁盘空间 / 权限`,
      );
    }

    // 3) rename tmp → final（同盘符，原子）
    fs.renameSync(tmpBackup, finalBackup);

    // 4) 验证通过后才删源
    fs.rmSync(src, { recursive: true, force: true });
    log('ok', `跨盘符备份 ${src} → ${finalBackup}（copy+verify+rename+rm）`);
    return finalBackup;
  } catch (err) {
    // 保证失败时 src 仍存活
    log('err', `备份失败: ${err.message}`);
    throw err;
  }
}

function collectDirStats(dir) {
  let fileCount = 0;
  let totalSize = 0;
  for (const rel of walkFiles(dir)) {
    fileCount++;
    try {
      totalSize += fs.statSync(path.join(dir, rel)).size;
    } catch (_) { /* 跳过读失败的项（link broken 等） */ }
  }
  return { fileCount, totalSize };
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

  // v2.3: 区分"fragment 提供默认"vs"fragment 强制覆盖"
  // fragment 提供默认 = 用户未显式设过时才写入（尊重用户已选）
  // 这避免 MCC 升级覆盖用户精心配过的偏好（如 alwaysThinkingEnabled, defaultMode 等）
  function setDefault(target, key, value) {
    if (target[key] === undefined) target[key] = value;
  }

  // permissions
  if (fragment.permissions) {
    merged.permissions = merged.permissions || {};
    // allow / deny / ask: 并集去重（合并保留双方的）
    for (const listKey of ['allow', 'deny', 'ask']) {
      if (Array.isArray(fragment.permissions[listKey])) {
        const exist = Array.isArray(merged.permissions[listKey]) ? merged.permissions[listKey] : [];
        merged.permissions[listKey] = [...new Set([...exist, ...fragment.permissions[listKey]])];
      }
    }
    // defaultMode: 用户未设才写（v2.3 信任模式默认是 bypassPermissions，但用户已设的 askForPermission 等保留）
    if (fragment.permissions.defaultMode !== undefined) {
      setDefault(merged.permissions, 'defaultMode', fragment.permissions.defaultMode);
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

  // v2.3: 顶级布尔/字符串字段改为"fragment 提供默认"语义
  // 避免 MCC 升级覆盖用户精心配的开关（如 alwaysThinkingEnabled = false 想省 token）
  const skip = new Set(['permissions', 'hooks', 'mcpServers', '$schema']);
  for (const [k, v] of Object.entries(fragment)) {
    if (skip.has(k) || k.startsWith('_mcc_')) continue;
    setDefault(merged, k, v);
  }

  return merged;
}

// ═══ TOML 追加合并（config.toml）═════════════════════════

// MCC 管理项白名单：装时允许自动覆盖用户已存在的同名 section（补缺失参数）。
// 其他 section 一律不覆盖，除非传 --force。
// 加新管理项时只需把 section 名加进来。
const MCC_MANAGED_TOML_SECTIONS = new Set([
  'mcp_servers.serena',  // v2.5.4 起需要补 --enable-web-dashboard False / --enable-gui-log-window False
]);

// 匹配独立一行的 TOML 表头：[xxx] 或 [[xxx]]（array of tables）
const TOML_SECTION_HEADER_RE = /^\s*\[\[?[^\[\]]+\]\]?\s*$/;

/**
 * 把 TOML fragment 追加到现有 TOML。按 [section.name] 去重。
 *  - 默认已有同名 section 就跳过，避免覆盖用户改过的 MCP 配置
 *  - MCC_MANAGED_TOML_SECTIONS 里的 section 允许自动更新
 *  - 其他 [section] 追加到末尾
 */
function appendTomlFragment(existingToml, fragment, force) {
  const existingSections = extractTomlSections(existingToml);
  const fragmentSections = extractTomlSections(fragment);

  const toAppend = [];
  const skipped = [];
  const updated = [];
  let merged = existingToml;

  for (const [name, body] of Object.entries(fragmentSections.sections)) {
    if (name in existingSections.sections) {
      const shouldUpdate = force || MCC_MANAGED_TOML_SECTIONS.has(name);
      if (shouldUpdate && existingSections.sections[name].trim() !== body.trim()) {
        merged = replaceTomlSection(merged, name, body);
        updated.push(name);
      } else {
        skipped.push(name);
      }
      continue;
    }
    toAppend.push({ name, body });
  }

  if (toAppend.length === 0) {
    return { merged, added: [], updated, skipped };
  }

  if (merged.length > 0 && !merged.endsWith('\n')) merged += '\n';
  if (!merged.endsWith('\n\n')) merged += '\n';
  merged += '# ═══ MCC MCP servers (added by installer) ═══\n\n';
  for (const { name, body } of toAppend) {
    merged += `[${name}]\n${body}\n`;
  }

  return { merged, added: toAppend.map((t) => t.name), updated, skipped };
}

function replaceTomlSection(toml, sectionName, newBody) {
  const lines = toml.split(/\r?\n/);
  const out = [];
  let i = 0;
  const sectionHeader = `[${sectionName}]`;

  while (i < lines.length) {
    if (lines[i].trim() === sectionHeader) {
      out.push(sectionHeader);
      out.push(...newBody.split(/\r?\n/));
      i += 1;
      while (i < lines.length && !TOML_SECTION_HEADER_RE.test(lines[i])) i += 1;
      continue;
    }
    out.push(lines[i]);
    i += 1;
  }

  return out.join('\n');
}

function extractTomlSections(toml) {
  const sections = {};
  const lines = toml.split(/\r?\n/);
  let currentName = null;
  let currentBody = [];
  const preamble = [];

  for (const line of lines) {
    // Skip comment lines so that a literal "[mcp_servers.example]" inside a
    // TOML comment isn't mistaken for a real section header (would otherwise
    // cause the next real definition with the same name to be treated as a
    // duplicate and silently dropped).
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      if (currentName === null) preamble.push(line);
      else currentBody.push(line);
      continue;
    }
    // Reject TOML array-of-tables (`[[name]]`) — appendTomlFragment writes plain
    // `[name]` headers and would round-trip array-of-tables incorrectly. Better
    // to fail loudly than silently corrupt the file.
    if (/^\[\[[^\[\]]+\]\]\s*$/.test(line)) {
      throw new Error(
        `extractTomlSections: TOML array-of-tables not supported (line: ${line.trim()}). `
        + `Use plain [section] headers in MCC fragments, or extend the parser.`
      );
    }
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
  // v1.7: fallback 走 backupDirAtomicCrossDevice（copy + verify + rename + rm），
  //       中途失败不会让用户数据半空半满。
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
        try {
          fs.renameSync(fromDir, toDir);
        } catch (err) {
          if (err.code !== 'EXDEV' && err.code !== 'EPERM') throw err;
          backupDirAtomicCrossDevice(fromDir, toDir);
        }
      }
      if (options.dryRun) {
        log('info', `  (dry-run) ${d}/ → ${path.basename(excBackupRoot)}/${d}/`);
      } else {
        log('ok', `  ${d}/ → ${path.basename(excBackupRoot)}/${d}/`);
      }
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
  // v2.3: --strict 时优先用 strict 变体（细粒度白名单 + 不开 bypassPermissions）
  const fragmentPath = options.strict
    ? path.join(sourceClaudeDir, 'settings.fragment.strict.json')
    : path.join(sourceClaudeDir, 'settings.fragment.json');
  const settingsPath = path.join(targetDir, 'settings.json');
  if (options.strict && !pathExists(fragmentPath)) {
    log('warn', `--strict 但找不到 settings.fragment.strict.json，回退默认 fragment`);
  }
  const actualFragmentPath = pathExists(fragmentPath)
    ? fragmentPath
    : path.join(sourceClaudeDir, 'settings.fragment.json');
  if (pathExists(actualFragmentPath)) {
    const fragment = readJson(actualFragmentPath);
    if (options.strict) log('info', '🛡  --strict 模式：使用细粒度白名单');
    // 在 fragment 的 hooks 里也做变量替换（它引用了 ${MCC_HOOKS}）
    const fragmentStr = JSON.stringify(fragment);
    const resolvedStr = replaceInstallVariables(fragmentStr, {
      MCC_HOME: path.join(targetDir, '.mcc-hooks'),
      MCC_HOOKS: path.join(targetDir, '.mcc-hooks'),
      MCC_SKILLS: path.join(targetDir, 'skills'),
    });
    const resolvedFragment = JSON.parse(resolvedStr);

    // v2.4.3: 注入 .claude/ + .codex/ 的 Read/Write path-allow 规则。
    // 等于在装时就替用户点了"for all projects"按钮，免于反复弹窗。
    // .claude/ 子树受 IDE 扩展硬编码反 prompt-injection 保护，但具体 path-glob 规则可以覆盖。
    if (!options.strict) {
      const homeGlob = pathToClaudeCodeGlob(os.homedir());
      const dynamicAllow = [
        `Read(${homeGlob}/.claude/**)`,
        `Write(${homeGlob}/.claude/**)`,
        `Edit(${homeGlob}/.claude/**)`,
        `Read(${homeGlob}/.codex/**)`,
        `Write(${homeGlob}/.codex/**)`,
        `Edit(${homeGlob}/.codex/**)`,
      ];
      resolvedFragment.permissions = resolvedFragment.permissions || {};
      resolvedFragment.permissions.allow = [
        ...(resolvedFragment.permissions.allow || []),
        ...dynamicAllow,
      ];
      log('info', `[trust-paths] 注入 ${dynamicAllow.length} 条 .claude/.codex Read/Write/Edit 允许规则（免反复点 "for all projects"）`);
    }

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

  // 9) 写一份 INSTALL-MANIFEST.json 副本到 targetDir/.mcc-meta/，
  //    让 uninstaller 在 mcc repo 已删除的情况下仍能精确删除装过的命令。
  copyInstallManifest(distDir, targetDir, options.dryRun);

  return report;
}

function copyInstallManifest(distDir, targetDir, dryRun) {
  const manifestSrc = path.join(distDir, 'INSTALL-MANIFEST.json');
  if (!pathExists(manifestSrc)) return;
  const metaDir = path.join(targetDir, '.mcc-meta');
  const manifestDst = path.join(metaDir, 'INSTALL-MANIFEST.json');
  if (dryRun) {
    log('info', `(dry-run) 写入 ${manifestDst}`);
    return;
  }
  ensureDir(metaDir);
  fs.copyFileSync(manifestSrc, manifestDst);
}

// ═══ Codex 安装 ══════════════════════════════════════

async function installCodex(distDir, scope, options) {
  if (!pathExists(distDir) || fs.readdirSync(distDir).length === 0) {
    throw new Error(`dist/codex/ 不存在或为空`);
  }

  const targetDir = scope === 'project' ? path.resolve('.codex') : path.join(os.homedir(), '.codex');
  // v2.4.1: AGENTS.md / HOOKS-SOFT-GUIDANCE.md 装到 ~/.codex/ 里（不再污染 $HOME 根）
  // Codex CLI 全局 AGENTS.md 的标准路径就是 ~/.codex/AGENTS.md。project scope 仍写到项目根（Codex 从 cwd 向上找）。
  const targetRoot = scope === 'project' ? path.resolve('.') : path.join(os.homedir(), '.codex');
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
        try {
          fs.renameSync(fromDir, toDir);
        } catch (err) {
          // Mirror the Claude Code side: only fall back to copy+verify+rm on
          // EXDEV (cross-device) or EPERM (Windows). Naked `catch{}` was masking
          // permission/disk errors and then `rmSync` deleted the source even
          // when the copy failed half-way — silent data loss.
          if (err.code !== 'EXDEV' && err.code !== 'EPERM') throw err;
          backupDirAtomicCrossDevice(fromDir, toDir);
        }
      }
      if (options.dryRun) {
        log('info', `  (dry-run) ${d}/ → ${path.basename(excBackupRoot)}/${d}/`);
      } else {
        log('ok', `  ${d}/ → ${path.basename(excBackupRoot)}/${d}/`);
      }
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
    mergedToml: { added: [], updated: [], skipped: [] },
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
      const mccMarker = '\n\n---\n\n# MCC Section\n\n';
      if (existing.includes(mccMarker) && existing.includes('MCC 自动生成')) {
        const merged = existing.slice(0, existing.indexOf(mccMarker)) + mccMarker + mccContent;
        if (!options.dryRun) writeText(agentsMdDst, merged);
        log('ok', `AGENTS.md 已更新 MCC section`);
        report.agentsMd = 'updated-section';
      } else if (existing.trimStart().startsWith('# AGENTS.md') && existing.includes('MCC 自动生成')) {
        if (!options.dryRun) writeText(agentsMdDst, mccContent);
        log('ok', `AGENTS.md 已更新 MCC 生成内容`);
        report.agentsMd = 'updated';
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
    const { merged, added, updated, skipped } = appendTomlFragment(existing, fragment, options.force);
    if (!options.dryRun) writeText(configTomlDst, merged);
    report.mergedToml = { added, updated, skipped };
    log('ok', `config.toml: +${added.length} sections, ${updated.length} updated, ${skipped.length} already present`);
  }

  // 7) 写一份 INSTALL-MANIFEST.json 副本（同 Claude Code 侧）
  copyInstallManifest(distDir, targetDir, options.dryRun);

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

// ═══ 全局 CLAUDE.md 自动写入（v2.3 · 装即可用核心）═══
//
// 安装时检查 ~/.claude/CLAUDE.md：
//   - 不存在 → 用 MCC 推荐模板写入（"优先复用 / 中文沟通 / TodoWrite"）
//   - 已存在 → 不动用户文件，但提示有模板可参考
//   - --skip-claudemd 时全跳过

// v2.4: smart-split — smart scope 在 cwd 建 PRPs/ 工作目录残骸（不重复全局已装的能力）
// 关键日志带 [project-stub] 英文 marker 便于跨 locale 测试 grep
// v2.4.3: 同时写一个项目级 .claude/settings.json，加 ./.claude/** Read/Write 允许规则
function installProjectStub(cwd, dryRun, opts = {}) {
  if (cwd === os.homedir()) {
    log('info', `[project-stub] cwd is $HOME, skipping (smart mode only stubs real project dirs)`);
    return null;
  }
  // v2.5.5: opts.targets 让"PRPs/ 入口提示语"双线适配
  // - 仅 codex   : 用 mcc-prd / mcc-plan / mcc-init 提示（Codex prompts，无 slash 概念）
  // - 仅 claude  : 用 /prd / /plan / /onboard 提示
  // - 双线       : 两边都写
  const targets = Array.isArray(opts.targets) && opts.targets.length > 0
    ? opts.targets
    : ['claude-code'];
  const hasClaude = targets.includes('claude-code');
  const hasCodex = targets.includes('codex');
  const projectClaude = path.join(cwd, '.claude');
  const prpsDir = path.join(projectClaude, 'PRPs');
  const subdirs = ['prds', 'plans', 'reports', 'reviews', 'onboarding', 'features'];
  const projectSettingsPath = path.join(projectClaude, 'settings.json');

  // v2.4.3: 项目级 settings.json 注入 .claude/.codex 路径放行规则
  // 解决"workspace 内 .claude/ 子树写入弹窗"问题
  const projectAllow = [
    'Read(.claude/**)',
    'Write(.claude/**)',
    'Edit(.claude/**)',
    'Read(.codex/**)',
    'Write(.codex/**)',
    'Edit(.codex/**)',
  ];

  // v2.5.3 起：装时同时拷 PROJECT_VAULT / SCHEMA / CHANGELOG-DEV 空模板（如不存在）
  // 2026-04-28 起：三个用户关注文件统一放 docs/，便于查找。PROJECT_VAULT 老路径
  // (.claude/PROJECT_VAULT.md) 仍被 hook 兼容；新装一律走 docs/。
  const vaultTemplate = path.join(DIST, 'claude-code', '.claude', 'templates', 'PROJECT_VAULT.example.md');
  const vaultTemplateSrc = path.join(ROOT, 'source', 'templates', 'PROJECT_VAULT.example.md');
  const vaultTemplatePath = pathExists(vaultTemplate) ? vaultTemplate : vaultTemplateSrc;
  const vaultDstDocs = path.join(cwd, 'docs', 'PROJECT_VAULT.md');
  const vaultDstLegacy = path.join(projectClaude, 'PROJECT_VAULT.md');
  // 如果老位置已存在，尊重老位置（不动用户已有内容）；否则装到 docs/
  const vaultDst = pathExists(vaultDstLegacy) ? vaultDstLegacy : vaultDstDocs;

  const schemaTemplate = path.join(DIST, 'claude-code', '.claude', 'templates', 'SCHEMA.example.md');
  const schemaTemplateSrc = path.join(ROOT, 'source', 'templates', 'SCHEMA.example.md');
  const schemaTemplatePath = pathExists(schemaTemplate) ? schemaTemplate : schemaTemplateSrc;
  const schemaDst = path.join(cwd, 'docs', 'SCHEMA.md');

  const changelogTemplate = path.join(DIST, 'claude-code', '.claude', 'templates', 'CHANGELOG-DEV.example.md');
  const changelogTemplateSrc = path.join(ROOT, 'source', 'templates', 'CHANGELOG-DEV.example.md');
  const changelogTemplatePath = pathExists(changelogTemplate) ? changelogTemplate : changelogTemplateSrc;
  const changelogDst = path.join(cwd, 'docs', 'CHANGELOG-DEV.md');

  if (dryRun) {
    log('info', `[project-stub] (dry-run) will create ${subdirs.length} PRPs/ subdirs under ${prpsDir}`);
    log('info', `[project-stub] (dry-run) will write/merge ${projectSettingsPath} with ${projectAllow.length} allow rules`);
    if (!pathExists(vaultDst) && pathExists(vaultTemplatePath)) {
      log('info', `[project-stub] (dry-run) will create ${vaultDst} from template`);
    }
    if (!pathExists(schemaDst) && pathExists(schemaTemplatePath)) {
      log('info', `[project-stub] (dry-run) will create ${schemaDst} from template`);
    }
    if (!pathExists(changelogDst) && pathExists(changelogTemplatePath)) {
      log('info', `[project-stub] (dry-run) will create ${changelogDst} from template`);
    }
    return prpsDir;
  }

  ensureDir(prpsDir);
  for (const d of subdirs) {
    const sub = path.join(prpsDir, d);
    ensureDir(sub);
    const gitkeep = path.join(sub, '.gitkeep');
    if (!pathExists(gitkeep)) {
      fs.writeFileSync(gitkeep, '', 'utf8');
    }
  }
  log('ok', `[project-stub] 📁 PRPs/ work-product dir created: ${prpsDir} (${subdirs.length} subdirs)`);

  // 合并/创建项目级 settings.json
  let existing = {};
  if (pathExists(projectSettingsPath)) {
    try { existing = readJson(projectSettingsPath); } catch { existing = {}; }
  }
  const fragment = { permissions: { allow: projectAllow } };
  const merged = mergeSettingsJson(existing, fragment);
  writeJson(projectSettingsPath, merged);
  log('ok', `[project-stub] 🔓 project settings.json: 注入 ${projectAllow.length} 条 .claude/.codex 允许规则`);

  // 拷 PROJECT_VAULT.md 空模板（仅当 docs/ 和 .claude/ 都不存在）
  if (!pathExists(vaultDst) && pathExists(vaultTemplatePath)) {
    ensureDir(path.dirname(vaultDst));
    fs.copyFileSync(vaultTemplatePath, vaultDst);
    log('ok', `[project-stub] 🔐 ${vaultDst} created from template (gitignored)`);
    log('info', `   填 secret 直接编辑或告诉 Claude；hook 自动 sync 到 .env.local + ~/.ssh/config`);
  } else if (pathExists(vaultDst)) {
    log('info', `[project-stub] ${vaultDst} 已存在，跳过`);
  }

  // 拷 docs/SCHEMA.md 空模板（仅当不存在）
  if (!pathExists(schemaDst) && pathExists(schemaTemplatePath)) {
    ensureDir(path.dirname(schemaDst));
    fs.copyFileSync(schemaTemplatePath, schemaDst);
    log('ok', `[project-stub] 📊 ${schemaDst} created from template (committed)`);
    log('info', `   加表/字段告诉 Claude；它会自动追加业务含义`);
  } else if (pathExists(schemaDst)) {
    log('info', `[project-stub] ${schemaDst} 已存在，跳过`);
  }

  // 拷 docs/CHANGELOG-DEV.md 空模板（仅当不存在）
  if (!pathExists(changelogDst) && pathExists(changelogTemplatePath)) {
    ensureDir(path.dirname(changelogDst));
    fs.copyFileSync(changelogTemplatePath, changelogDst);
    log('ok', `[project-stub] 📝 ${changelogDst} created from template (committed)`);
    log('info', `   开发实时流水：◇ 需求 / ✓ 完成 / ⚠ 卡点 / → 下一步；Claude 自动维护`);
  } else if (pathExists(changelogDst)) {
    log('info', `[project-stub] ${changelogDst} 已存在，跳过`);
  }

  // 强制 .gitignore 加 vault 相关条目（不依赖 vault-sync hook 首次触发）
  ensureProjectGitignore(cwd);

  // v2.5.5: 入口提示语按 targets 双线适配
  if (hasClaude && hasCodex) {
    log('info', `   Claude Code: /prd → PRPs/prds/, /plan → PRPs/plans/`);
    log('info', `   Codex:       mcc-prd / mcc-plan 写到同样位置`);
  } else if (hasCodex) {
    log('info', `   Codex prompt: mcc-prd → PRPs/prds/, mcc-plan → PRPs/plans/`);
    log('info', `   (Codex 没有 slash 命令；在 codex 里输入 mcc-<name> 触发 prompt)`);
  } else {
    log('info', `   /prd writes to PRPs/prds/, /plan writes to PRPs/plans/, etc.`);
  }
  return prpsDir;
}

// v2.5.3: 项目级 .gitignore 强制加 vault / .env 相关条目
function ensureProjectGitignore(cwd) {
  const gitignorePath = path.join(cwd, '.gitignore');
  // v2.6.4 critical fix: 加上 docs/PROJECT_VAULT.md（v2.5.10 起新装走 docs/）。
  // 之前只 ignore .claude/PROJECT_VAULT.md 旧路径，新装的 vault 文件会进 git
  // → 真 secret 泄漏风险。codex audit 找到。
  const required = [
    'docs/PROJECT_VAULT.md',         // v2.5.10+ 新默认路径
    '.claude/PROJECT_VAULT.md',      // 老路径兼容
    '.env.local',
    '.env.*.local',
    '.deploy.local.md',
  ];
  const MCC_MARKER = '# MCC PROJECT_VAULT (auto-managed — secrets must never enter git)';

  let existing = '';
  if (pathExists(gitignorePath)) {
    existing = fs.readFileSync(gitignorePath, 'utf8');
  }

  // v2.6.4 fix: 之前看到 marker 就 return，老 .gitignore（v2.5.x 装的）有 marker
  // 但缺 docs/PROJECT_VAULT.md → 升级也补不上。现在改成"先看 marker 是否存在
  // + 检查 required 全在；缺啥补啥"。
  const existingLines = new Set(
    existing.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  );
  const missing = required.filter(p => !existingLines.has(p));

  if (missing.length === 0) return false;

  // 已有 marker：补缺失行（不再追加新 marker，避免重复）
  if (existing.includes(MCC_MARKER)) {
    fs.writeFileSync(
      gitignorePath,
      existing.trimEnd() + '\n' + missing.join('\n') + '\n'
    );
    log('ok', `[project-stub] 🚫 .gitignore 补 ${missing.length} 行漏掉的 vault 路径（${missing.join(', ')}）`);
    return true;
  }

  // 没 marker：新加完整块
  const additions = [
    '',
    MCC_MARKER,
    ...missing,
    '',
  ];
  fs.writeFileSync(gitignorePath, existing.trimEnd() + '\n' + additions.join('\n'));
  log('ok', `[project-stub] 🚫 .gitignore +${missing.length} 行（vault / env.local / deploy.local.md）`);
  return true;
}

function ensureGlobalClaudemd(args) {
  const home = os.homedir();
  const globalClaudemd = path.join(home, '.claude', 'CLAUDE.md');
  // 模板优先从 dist 拿（用户已 clone），fallback 到 source（开发场景）
  const templatePathDist = path.join(DIST, 'claude-code', '.claude', 'templates', 'CLAUDE.global.example.md');
  const templatePathSrc = path.join(ROOT, 'source', 'templates', 'CLAUDE.global.example.md');
  const templatePath = pathExists(templatePathDist) ? templatePathDist : templatePathSrc;

  if (!pathExists(templatePath)) {
    log('warn', `跳过 ~/.claude/CLAUDE.md 写入：找不到模板 ${templatePath}`);
    return;
  }

  if (pathExists(globalClaudemd)) {
    log('info', `~/.claude/CLAUDE.md 已存在，MCC 不覆盖。`);
    log('info', `   要查看 MCC 推荐模板：cat ${templatePath}`);
    return;
  }

  if (args.dryRun) {
    log('info', `(dry-run) 将写入 ~/.claude/CLAUDE.md（来自模板 ${path.basename(templatePath)}）`);
    return;
  }

  try {
    ensureDir(path.dirname(globalClaudemd));
    fs.copyFileSync(templatePath, globalClaudemd);
    log('ok', `📝 写入 ~/.claude/CLAUDE.md（推荐模板：优先复用 / 中文 / TodoWrite）`);
    log('info', `   想要重置：删了重跑 installer，或参考 ${templatePath}`);
    log('info', `   想跳过：装时加 --skip-claudemd`);
  } catch (err) {
    log('warn', `写入 ~/.claude/CLAUDE.md 失败：${err.message}（不影响 MCC 主体安装）`);
  }
}

// v2.6: 用户级 vault 模板。跨项目通用 secret / git identity / 个人 SSH 落这里。
// 与 CLAUDE.md 平级（都在 ~/.claude/，由 installer 一次性创建）。
function ensureUserVault(args) {
  const home = os.homedir();
  const userVault = path.join(home, '.claude', 'USER_VAULT.md');
  const templatePathDist = path.join(DIST, 'claude-code', '.claude', 'templates', 'USER_VAULT.example.md');
  const templatePathSrc = path.join(ROOT, 'source', 'templates', 'USER_VAULT.example.md');
  const templatePath = pathExists(templatePathDist) ? templatePathDist : templatePathSrc;

  if (!pathExists(templatePath)) {
    return; // 找不到模板就静默跳过（v2.5 装在没 templates/ 的环境时不要硬错）
  }

  if (pathExists(userVault)) {
    return; // 用户已有 USER_VAULT，绝不覆盖
  }

  if (args.dryRun) {
    log('info', `(dry-run) 将创建 ~/.claude/USER_VAULT.md（USER 级 vault，跨项目通用）`);
    return;
  }

  try {
    ensureDir(path.dirname(userVault));
    fs.copyFileSync(templatePath, userVault);
    log('ok', `🔐 写入 ~/.claude/USER_VAULT.md（USER 级跨项目 vault；告诉 Claude 你的 personal API key 即可，hook 自动同步）`);
  } catch (err) {
    log('warn', `写入 ~/.claude/USER_VAULT.md 失败：${err.message}（不影响 MCC 主体安装）`);
  }
}

// ═══ 主流程 ═══════════════════════════════════════════

async function main() {
  const args = parseArgs(process.argv);
  VERBOSE = args.verbose;

  // v2.1.2: 中断 / 异常时写"安装状态日志"到 ~/.mcc-install.log
  // 让用户知道半成品状态、给恢复指引（避免 Ctrl-C 后用户困惑）
  const installLog = path.join(os.homedir(), '.mcc-install.log');
  const startedAt = new Date().toISOString();
  let installState = 'started';

  function writeStateLog(state, extra = {}) {
    if (args.dryRun) return; // dry-run 不污染状态文件
    try {
      const entry = JSON.stringify({
        ts: new Date().toISOString(),
        state,
        startedAt,
        scope: args.scope,
        target: args.target,
        ...extra,
      }) + '\n';
      fs.appendFileSync(installLog, entry, 'utf8');
    } catch (_) { /* log 失败不影响安装本身 */ }
  }

  // 中断处理（Ctrl-C / SIGTERM）
  const onInterrupt = (sig) => {
    writeStateLog('interrupted', { signal: sig });
    log('err', `\n⚠ 收到 ${sig} 信号 → 安装中断。状态记录在 ${installLog}`);
    log('err', `   恢复步骤：检查目标目录是否有半成品文件，可手动删除或重跑 installer。`);
    log('err', `   独占模式下：备份在 ~/.claude.exclusive-backup-{timestamp}，可 ./uninstall.sh --timestamp 恢复。`);
    process.exit(130);
  };
  process.on('SIGINT', () => onInterrupt('SIGINT'));
  process.on('SIGTERM', () => onInterrupt('SIGTERM'));

  // 全局异常 → 也写状态日志
  process.on('uncaughtException', (err) => {
    writeStateLog('uncaught_exception', { error: String(err.message || err) });
    log('err', `\n❌ 未捕获异常: ${err.message}`);
    log('err', `   状态记录在 ${installLog}`);
    process.exit(1);
  });

  console.log(`scope:  ${args.scope}`);
  console.log(`target: ${args.target}`);
  console.log(`force:  ${args.force}`);
  console.log(`dry-run: ${args.dryRun}`);
  console.log('');

  const manifest = readJson(MANIFEST_PATH);
  log('info', `MCC version ${manifest.version}`);
  writeStateLog('started', { mccVersion: manifest.version });
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

  // v2.4: smart-split — smart 内部走 global 完成主安装；之后再单独装项目级 PRPs/ 残骸
  // hybrid 是 smart 的别名（兼容老调用方）
  const isSmart = (args.scope === 'smart' || args.scope === 'hybrid');
  const effectiveScope = isSmart ? 'global' : args.scope;
  const cwd = process.cwd();
  const willStubProject = isSmart && !args.noProjectStub && cwd !== os.homedir();

  if (isSmart) {
    log('info', `📦 smart-split 模式：用户级能力强制装 ~/.claude/ + ~/.codex/，项目工作产物落在当前目录`);
    log('info', `   ~/.claude/                        ← Claude Code: 19 agents + 15 commands + skills + settings + MCP`);
    log('info', `   ~/.codex/                         ← Codex: 19 agents + 15 prompts + AGENTS.md + MCP`);
    if (willStubProject) {
      log('info', `   ${path.join(cwd, '.claude', 'PRPs')}/   ← PRDs/plans/reports 工作产物目录`);
    } else if (cwd === os.homedir()) {
      log('info', `   (cwd 是 $HOME，跳过项目级 PRPs/ 建立)`);
    } else if (args.noProjectStub) {
      log('info', `   (--no-project-stub：跳过当前目录 PRPs/ 建立)`);
    }
  } else if (args.scope === 'project') {
    log('info', `📦 project (team-shared) 模式：全套装到 ${path.resolve('.claude')}/ + ${path.resolve('.codex')}/（要 commit 给团队）`);
  } else {
    log('info', `📦 global 模式：全套装到 ~/.claude/ + ~/.codex/，不动当前目录`);
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
        reports.push(await installClaudeCode(distDir, effectiveScope, args));
      } else if (target === 'codex') {
        reports.push(await installCodex(distDir, effectiveScope, args));
      }
      writeStateLog('target_done', { target });
      console.log('');
    } catch (err) {
      writeStateLog('target_failed', { target, error: String(err.message || err) });
      log('err', `${target} 安装失败: ${err.message}`);
      log('err', `   状态记录在 ${installLog}`);
      log('err', `   恢复指引：`);
      log('err', `     • 已写入的文件可手动删除或保留（installer 不破坏现有 settings 备份）`);
      log('err', `     • 跑 ./uninstall.sh --timestamp <ts> 可回到装前状态（ts 见上面 ✓ 备份行）`);
      if (args.verbose) console.error(err.stack);
      process.exit(1);
    }
  }

  // v2.3: 装即可用 — 自动写 ~/.claude/CLAUDE.md（如不存在），让推荐模板（优先复用 / 中文 / TodoWrite）立即生效
  if (!args.skipClaudemd && targets.includes('claude-code')) {
    ensureGlobalClaudemd(args);
  }

  // v2.6: USER 级跨项目 vault — 装一次，所有项目共用
  if (targets.includes('claude-code')) {
    ensureUserVault(args);
  }

  // v2.4 smart-split: 主装完成后建项目级 PRPs/ 残骸（让本项目有工作产物落盘点）
  // v2.5.5: 不再限定 claude-code —— Codex-only 用户也需要 PRPs/PROJECT_VAULT/SCHEMA/.gitignore，
  // 否则 mcc-prd / mcc-plan / project-vault 这些 prompt 跑出来无处落盘。
  if (willStubProject) {
    console.log('');
    console.log(`── 项目级残骸 ─────────────`);
    installProjectStub(cwd, args.dryRun, { targets });
  }

  writeStateLog('completed', { targets, reports: reports.length });

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
      if (r.mergedToml.updated.length > 0) console.log(`  ✓ config.toml: updated ${r.mergedToml.updated.length} MCP`);
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

// MCC needs ?. and ?? plus modern fs APIs — these landed in Node 16. We don't
// claim to support 14 (EOL since 2023) so fail fast with a useful message
// rather than letting the user hit a confusing SyntaxError or fs API miss.
function assertSupportedNode() {
  const m = /^v(\d+)\.(\d+)/.exec(process.version);
  const major = m ? parseInt(m[1], 10) : 0;
  if (major < 16) {
    log('err', `MCC requires Node ≥ 16 LTS. Current: ${process.version}`);
    log('info', 'Upgrade Node (https://nodejs.org/) and re-run.');
    process.exit(1);
  }
}

// 仅在被 node scripts/installer.js 直接调用时跑 main；
// require('./installer.js') 时不要自动安装（让测试可以拿内部函数）。
if (require.main === module) {
  assertSupportedNode();
  main().catch((err) => {
    log('err', err.message);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  });
}

module.exports = {
  appendTomlFragment,
  replaceTomlSection,
  MCC_MANAGED_TOML_SECTIONS,
  copyInstallManifest,
};

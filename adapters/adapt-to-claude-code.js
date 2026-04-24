// MCC Adapter: source/ → dist/claude-code/.claude/
// Claude Code 是宿主格式，大部分是直接拷贝 + 少量改造（commands 加 mcc 子目录、hooks 放隐藏子目录）
// 产出 INSTALL-MANIFEST.json 供 installer 使用

'use strict';

const path = require('path');
const fs = require('fs');

const {
  ensureDir,
  assertExists,
  walkFiles,
  readText,
  writeText,
  copyFile,
  copyDir,
  placeholderDir,
  clearDir,
  pathExists,
  sha256OfFile,
  statSize,
  makeLogger,
} = require('./_lib');

async function adaptToClaudeCode(sourceDir, distDir) {
  const log = makeLogger('claude-code');
  assertExists(sourceDir, 'source/ 不存在，请确认 mcc-build 结构完整');

  // 幂等：清空 dist 后重建
  clearDir(distDir);
  ensureDir(distDir);

  const claudeRoot = path.join(distDir, '.claude');
  ensureDir(claudeRoot);

  const manifest = {
    target: 'claude-code',
    generatedAt: new Date().toISOString(),
    sourceDir: sourceDir,
    distDir: distDir,
    installBase: '.claude/',
    files: [],
    notes: [],
  };

  // 1) agents/*.md → .claude/agents/*.md（直接拷）
  copySimpleDir(
    path.join(sourceDir, 'agents'),
    path.join(claudeRoot, 'agents'),
    'agents',
    manifest,
    log,
    { filter: (f) => f.endsWith('.md') }
  );

  // 2) commands → .claude/commands/*.md（直接顶层，触发 /prd、/plan 等）
  //    v1.2 去掉 mcc/ 子目录前缀。Claude Code 会把 commands/xxx.md 识别为 /xxx 命令。
  //    和用户已有 commands 冲突时由 installer 的 --force / --exclusive 处理。
  const cmdSrc = path.join(sourceDir, 'commands');
  const cmdDst = path.join(claudeRoot, 'commands');
  assertExists(cmdSrc);
  ensureDir(cmdDst);
  for (const rel of walkFiles(cmdSrc)) {
    if (!rel.endsWith('.md')) continue;
    const src = path.join(cmdSrc, rel);
    const dst = path.join(cmdDst, rel);
    copyFile(src, dst);
    log.step(`commands: ${rel} → .claude/commands/${rel}  (触发 /${rel.replace(/\.md$/, '')})`);
    recordFile(manifest, src, dst, distDir, 'command');
  }

  // 3) skills → .claude/skills/（整目录拷，包括 continuous-learning-v2 的子目录）
  copySimpleDir(
    path.join(sourceDir, 'skills'),
    path.join(claudeRoot, 'skills'),
    'skills',
    manifest,
    log
  );

  // 4) modes → .claude/modes/*.md
  copySimpleDir(
    path.join(sourceDir, 'modes'),
    path.join(claudeRoot, 'modes'),
    'modes',
    manifest,
    log,
    { filter: (f) => f.endsWith('.md') }
  );

  // 5) hooks scripts → .claude/.mcc-hooks/scripts/（隐藏子目录，避免污染用户原 hooks）
  const hooksScriptSrc = path.join(sourceDir, 'hooks', 'scripts');
  const hooksScriptDst = path.join(claudeRoot, '.mcc-hooks', 'scripts');
  copySimpleDir(hooksScriptSrc, hooksScriptDst, 'hooks/scripts', manifest, log);

  // 6) hooks.json → .claude/.mcc-hooks/hooks.json（保持 ${MCC_HOOKS} 占位，installer 替换）
  const hooksJsonSrc = path.join(sourceDir, 'hooks', 'hooks.json');
  const hooksJsonDst = path.join(claudeRoot, '.mcc-hooks', 'hooks.json');
  copyFile(hooksJsonSrc, hooksJsonDst);
  log.step('hooks: hooks.json → .claude/.mcc-hooks/hooks.json  (installer 负责替换 ${MCC_HOOKS})');
  recordFile(manifest, hooksJsonSrc, hooksJsonDst, distDir, 'hooks-config');

  // 7) settings.fragment.json → .claude/settings.fragment.json（installer 合并）
  const settingsFragSrc = path.join(sourceDir, 'hooks', 'settings.fragment.json');
  const settingsFragDst = path.join(claudeRoot, 'settings.fragment.json');
  copyFile(settingsFragSrc, settingsFragDst);
  log.step('hooks: settings.fragment.json → .claude/settings.fragment.json');
  recordFile(manifest, settingsFragSrc, settingsFragDst, distDir, 'settings-fragment');

  // 8) mcp.json → .claude/mcp-configs/mcp.json
  const mcpSrc = path.join(sourceDir, 'mcp', 'mcp.json');
  const mcpDst = path.join(claudeRoot, 'mcp-configs', 'mcp.json');
  copyFile(mcpSrc, mcpDst);
  log.step('mcp: mcp.json → .claude/mcp-configs/mcp.json');
  recordFile(manifest, mcpSrc, mcpDst, distDir, 'mcp-config');

  // 9) rules/common/mcc-principles.md → .claude/rules/common/mcc-principles.md
  const rulesCommonSrc = path.join(sourceDir, 'rules', 'common');
  const rulesCommonDst = path.join(claudeRoot, 'rules', 'common');
  copySimpleDir(rulesCommonSrc, rulesCommonDst, 'rules/common', manifest, log, {
    filter: (f) => f.endsWith('.md'),
  });

  // 10) rules/python/ → .claude/rules/python/
  const rulesPySrc = path.join(sourceDir, 'rules', 'python');
  const rulesPyDst = path.join(claudeRoot, 'rules', 'python');
  copySimpleDir(rulesPySrc, rulesPyDst, 'rules/python', manifest, log, {
    filter: (f) => f.endsWith('.md'),
  });

  // 10b) rules/typescript/ → .claude/rules/typescript/（v1.7 新增，项目定位关键）
  const rulesTsSrc = path.join(sourceDir, 'rules', 'typescript');
  const rulesTsDst = path.join(claudeRoot, 'rules', 'typescript');
  copySimpleDir(rulesTsSrc, rulesTsDst, 'rules/typescript', manifest, log, {
    filter: (f) => f.endsWith('.md'),
  });

  // 11) 空占位目录（给 commands 产出物落地）
  const prpBase = path.join(claudeRoot, 'PRPs');
  const placeholders = [
    path.join(prpBase, 'prds'),
    path.join(prpBase, 'plans'),
    path.join(prpBase, 'plans', 'completed'),
    path.join(prpBase, 'reports'),
    path.join(prpBase, 'reviews'),
    path.join(prpBase, 'reviews', 'full'),
    path.join(prpBase, 'features'),
  ];
  for (const dir of placeholders) {
    placeholderDir(dir);
    const rel = path.relative(distDir, path.join(dir, '.gitkeep')).replace(/\\/g, '/');
    log.step(`placeholder: ${rel}`);
    manifest.files.push({
      kind: 'placeholder',
      dist: rel,
      size: 0,
      sha256: null,
      install: '.claude/' + path.relative(claudeRoot, dir).replace(/\\/g, '/') + '/',
    });
  }

  // 12) 产出 INSTALL-MANIFEST.json
  manifest.summary = buildSummary(manifest.files);
  const manifestPath = path.join(distDir, 'INSTALL-MANIFEST.json');
  writeText(manifestPath, JSON.stringify(manifest, null, 2));
  log.info(`manifest: INSTALL-MANIFEST.json  (${manifest.files.length} 项)`);

  return {
    target: 'claude-code',
    distDir,
    filesCount: manifest.files.length,
    summary: manifest.summary,
    manifestPath,
  };
}

// ---------- 辅助 ----------

function copySimpleDir(src, dst, label, manifest, log, opts = {}) {
  if (!pathExists(src)) {
    log.warn(`源目录不存在，跳过: ${src}`);
    return;
  }
  ensureDir(dst);
  const files = walkFiles(src);
  for (const rel of files) {
    if (opts.filter && !opts.filter(rel)) continue;
    const srcAbs = path.join(src, rel);
    const dstAbs = path.join(dst, rel);
    copyFile(srcAbs, dstAbs);
    log.step(`${label}: ${rel}`);
    recordFile(manifest, srcAbs, dstAbs, manifest.distDir, label.split('/')[0]);
  }
}

function recordFile(manifest, srcAbs, dstAbs, distDir, kind) {
  const relDist = path.relative(distDir, dstAbs).replace(/\\/g, '/');
  const installPath = relDist.startsWith('.claude/')
    ? relDist
    : '.claude/' + relDist;
  manifest.files.push({
    kind,
    dist: relDist,
    install: installPath,
    size: statSize(dstAbs),
    sha256: sha256OfFile(dstAbs),
  });
}

function buildSummary(files) {
  const byKind = {};
  let totalSize = 0;
  for (const f of files) {
    byKind[f.kind] = (byKind[f.kind] || 0) + 1;
    totalSize += f.size || 0;
  }
  return { total: files.length, byKind, totalBytes: totalSize };
}

module.exports = { adaptToClaudeCode };

// 允许直接 node adapt-to-claude-code.js 跑
if (require.main === module) {
  const sourceDir = path.resolve(__dirname, '..', 'source');
  const distDir = path.resolve(__dirname, '..', 'dist', 'claude-code');
  adaptToClaudeCode(sourceDir, distDir)
    .then((r) => {
      console.log('\n=== Claude Code adapter done ===');
      console.log(JSON.stringify(r, null, 2));
    })
    .catch((err) => {
      console.error('[claude-code adapter] FAILED:', err.message);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
}

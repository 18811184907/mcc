// MCC Adapter: source/ → dist/codex/
// Codex 没有原生 sub-agent / skill / hook，要转译 + 聚合：
//  - agents: tools 字段重命名（Read → read_file 等），删 model，放 .codex/agents/
//  - commands: /mcc:xxx 引用改 "mcc-xxx prompt"，放 .codex/prompts/mcc-*.md
//  - skills / modes / hooks: 不直接拷，合并进 AGENTS.md 和 HOOKS-SOFT-GUIDANCE.md
//  - mcp.json: 转 TOML
//  - rules/python: 直接拷到 .codex/rules/python/（若 Codex 不认也无害）

'use strict';

const path = require('path');
const fs = require('fs');

const {
  ensureDir,
  pathExists,
  assertExists,
  walkFiles,
  readText,
  writeText,
  copyFile,
  clearDir,
  parseFrontmatter,
  serializeFrontmatter,
  sha256OfFile,
  statSize,
  makeLogger,
} = require('./_lib');

// MCC Canonical §5 tools 重命名表（Claude Code → Codex）
// 覆盖 MCC agents 实际用到的 8 个 Claude Code tool。其它 Claude-only tool
// （Monitor / Skill / TaskStop / PushNotification / RemoteTrigger / Agent 等）
// 是 main session-only 的，agent 本不该声明。若 agent 真的声明了未映射 tool，
// 下面的转译会落到 unmappedWarnings 并让 build 明显提示。
const TOOLS_MAP = {
  Read: 'read_file',
  Grep: 'search',
  Glob: 'list_files',
  Bash: 'run_shell_command',
  Edit: 'apply_patch',
  Write: 'apply_patch',
  MultiEdit: 'apply_patch',
  WebFetch: 'fetch_url',
  WebSearch: 'search_web',
  NotebookEdit: 'apply_patch',
};

const unmappedWarnings = new Map(); // tool -> [agent file list]

async function adaptToCodex(sourceDir, distDir) {
  const log = makeLogger('codex');
  assertExists(sourceDir, 'source/ 不存在');

  clearDir(distDir);
  ensureDir(distDir);

  const codexRoot = path.join(distDir, '.codex');
  ensureDir(codexRoot);

  const manifest = {
    target: 'codex',
    generatedAt: new Date().toISOString(),
    sourceDir,
    distDir,
    files: [],
    notes: [
      'Codex 不支持 sub-agent 直接调用，agents 作为角色指引放 AGENTS.md + .codex/agents/',
      'Codex 不支持 slash command，改用 prompts 机制（.codex/prompts/mcc-*.md）',
      'Codex 不支持 hook，转为 HOOKS-SOFT-GUIDANCE.md 作自律约定',
      'Codex 不支持 skill，转为 AGENTS.md 中的场景指引段',
    ],
  };

  // ── 1) agents → .codex/agents/*.md（tools 重命名 + 删 model）
  const agentsSrc = path.join(sourceDir, 'agents');
  const agentsDst = path.join(codexRoot, 'agents');
  ensureDir(agentsDst);
  let agentCount = 0;
  for (const rel of walkFiles(agentsSrc)) {
    if (!rel.endsWith('.md')) continue;
    const srcPath = path.join(agentsSrc, rel);
    const dstPath = path.join(agentsDst, rel);
    const content = readText(srcPath);
    const { frontmatter, body, hasFrontmatter } = parseFrontmatter(content);

    if (!hasFrontmatter) {
      log.warn(`agent ${rel} 无 frontmatter，原样拷贝`);
      copyFile(srcPath, dstPath);
      agentCount++;
      continue;
    }

    // 转译 tools；未映射的 tool 记录 warn（不静默穿透，否则 Codex 侧 agent tools 字段可能不识别）
    const toolsTranslated = [];
    if (Array.isArray(frontmatter.tools)) {
      for (const t of frontmatter.tools) {
        if (TOOLS_MAP[t]) {
          toolsTranslated.push(TOOLS_MAP[t]);
        } else {
          toolsTranslated.push(t); // 仍保留，但记录 warn
          const list = unmappedWarnings.get(t) || [];
          list.push(rel);
          unmappedWarnings.set(t, list);
        }
      }
    }
    frontmatter.tools = [...new Set(toolsTranslated)]; // 去重（Edit/Write 都映射到 apply_patch）

    // 删 model（Codex 不管）
    delete frontmatter.model;

    const newContent = `---\n${serializeFrontmatter(frontmatter)}\n---\n${body}`;
    writeText(dstPath, newContent);
    recordFile(manifest, srcPath, dstPath, distDir, 'agent');
    log.step(`agent: ${rel}  (tools 转译, model 删除)`);
    agentCount++;
  }
  log.info(`agents: ${agentCount} 个`);

  // ── 2) commands → .codex/prompts/mcc-*.md（/mcc:xxx 引用替换）
  const cmdSrc = path.join(sourceDir, 'commands');
  const promptsDst = path.join(codexRoot, 'prompts');
  ensureDir(promptsDst);
  let cmdCount = 0;
  for (const rel of walkFiles(cmdSrc)) {
    if (!rel.endsWith('.md')) continue;
    const srcPath = path.join(cmdSrc, rel);
    let content = readText(srcPath);

    // 把 /mcc:xxx 引用替换为 mcc-xxx prompt（Codex 风格）
    content = content.replace(/`\/mcc:([a-z0-9-]+)`/gi, '`mcc-$1` prompt');
    content = content.replace(/\/mcc:([a-z0-9-]+)/gi, '`mcc-$1` prompt');

    const newName = 'mcc-' + rel;
    const dstPath = path.join(promptsDst, newName);
    writeText(dstPath, content);
    recordFile(manifest, srcPath, dstPath, distDir, 'prompt');
    log.step(`command: ${rel} → prompts/${newName}`);
    cmdCount++;
  }
  log.info(`commands: ${cmdCount} 个 → prompts`);

  // ── 3) rules/python → .codex/rules/python/（直接拷，Codex 若不认也无害）
  const pySrc = path.join(sourceDir, 'rules', 'python');
  const pyDst = path.join(codexRoot, 'rules', 'python');
  if (pathExists(pySrc)) {
    ensureDir(pyDst);
    for (const rel of walkFiles(pySrc)) {
      const srcPath = path.join(pySrc, rel);
      const dstPath = path.join(pyDst, rel);
      copyFile(srcPath, dstPath);
      recordFile(manifest, srcPath, dstPath, distDir, 'rule');
      log.step(`rules/python: ${rel}`);
    }
  }

  // ── 3b) rules/typescript → .codex/rules/typescript/（v1.7 新增）
  const tsSrc = path.join(sourceDir, 'rules', 'typescript');
  const tsDst = path.join(codexRoot, 'rules', 'typescript');
  if (pathExists(tsSrc)) {
    ensureDir(tsDst);
    for (const rel of walkFiles(tsSrc)) {
      const srcPath = path.join(tsSrc, rel);
      const dstPath = path.join(tsDst, rel);
      copyFile(srcPath, dstPath);
      recordFile(manifest, srcPath, dstPath, distDir, 'rule');
      log.step(`rules/typescript: ${rel}`);
    }
  }

  // ── 4) rules/common → .codex/rules/common/
  const ccSrc = path.join(sourceDir, 'rules', 'common');
  const ccDst = path.join(codexRoot, 'rules', 'common');
  if (pathExists(ccSrc)) {
    ensureDir(ccDst);
    for (const rel of walkFiles(ccSrc)) {
      if (!rel.endsWith('.md')) continue;
      const srcPath = path.join(ccSrc, rel);
      const dstPath = path.join(ccDst, rel);
      copyFile(srcPath, dstPath);
      recordFile(manifest, srcPath, dstPath, distDir, 'rule');
      log.step(`rules/common: ${rel}`);
    }
  }

  // ── 5) AGENTS.md（角色 + 工作流 + skill 指引 + modes + 产出落盘）
  const agentsMd = buildAgentsMd(sourceDir);
  const agentsMdPath = path.join(distDir, 'AGENTS.md');
  writeText(agentsMdPath, agentsMd);
  manifest.files.push({
    kind: 'agents-md',
    dist: 'AGENTS.md',
    install: 'AGENTS.md（放在项目根或 ~/.codex/AGENTS.md）',
    size: statSize(agentsMdPath),
    sha256: sha256OfFile(agentsMdPath),
  });
  log.info(`AGENTS.md  (${fs.statSync(agentsMdPath).size} bytes)`);

  // ── 6) HOOKS-SOFT-GUIDANCE.md（hooks 语义→自律约定）
  const guidance = buildHooksSoftGuidance(sourceDir);
  const guidancePath = path.join(distDir, 'HOOKS-SOFT-GUIDANCE.md');
  writeText(guidancePath, guidance);
  manifest.files.push({
    kind: 'hooks-soft-guidance',
    dist: 'HOOKS-SOFT-GUIDANCE.md',
    install: 'HOOKS-SOFT-GUIDANCE.md（Codex 用户参考；不自动生效）',
    size: statSize(guidancePath),
    sha256: sha256OfFile(guidancePath),
  });
  log.info(`HOOKS-SOFT-GUIDANCE.md`);

  // ── 7) mcp.json → config.fragment.toml
  const mcpPath = path.join(sourceDir, 'mcp', 'mcp.json');
  assertExists(mcpPath);
  const mcpJson = JSON.parse(readText(mcpPath));
  const tomlFrag = mcpJsonToToml(mcpJson);
  const tomlPath = path.join(distDir, 'config.fragment.toml');
  writeText(tomlPath, tomlFrag);
  manifest.files.push({
    kind: 'mcp-toml',
    dist: 'config.fragment.toml',
    install: '合并到 ~/.codex/config.toml（追加 [mcp_servers.*] 段）',
    size: statSize(tomlPath),
    sha256: sha256OfFile(tomlPath),
  });
  log.info(`config.fragment.toml`);

  // ── 8) INSTALL-MANIFEST.json
  manifest.summary = buildSummary(manifest.files);
  const manifestPath = path.join(distDir, 'INSTALL-MANIFEST.json');
  writeText(manifestPath, JSON.stringify(manifest, null, 2));
  log.info(`INSTALL-MANIFEST.json  (${manifest.files.length} 项)`);

  // 未映射 tool 报告
  if (unmappedWarnings.size) {
    log.warn('下列 Claude Code tool 在 TOOLS_MAP 里未映射，Codex 侧原样保留可能不识别：');
    for (const [tool, files] of unmappedWarnings) {
      log.warn(`  • ${tool}  ← 出现在: ${files.join(', ')}`);
    }
    log.warn('  若是 MCC agent 确实需要，补到 adapters/adapt-to-codex.js 的 TOOLS_MAP');
  }

  return {
    target: 'codex',
    distDir,
    filesCount: manifest.files.length,
    summary: manifest.summary,
    manifestPath,
    unmappedTools: [...unmappedWarnings.keys()],
  };
}

// ─── AGENTS.md 拼接 ─────────────────────────────────────

function buildAgentsMd(sourceDir) {
  const L = [];
  L.push('# AGENTS.md');
  L.push('');
  L.push('> MCC 自动生成。编辑 `source/` 后跑 `node adapters/build.js` 刷新。');
  L.push('> 本文件 + `.codex/agents/*.md` + `.codex/prompts/*.md` 构成 Codex 上的 MCC 能力。');
  L.push('');

  // Core principles
  L.push('## 核心原则');
  L.push('');
  L.push('完整版见 `.codex/rules/common/mcc-principles.md`。要点：');
  L.push('- **证据 > 假设**：所有结论需证据支撑；不确定时明确标"假设"');
  L.push('- **代码 > 文档**：文档是代码的影子，不是真相');
  L.push('- **效率 > 冗长**：符号/缩写/压缩优先，尤其 context 紧张时');
  L.push('- **SOLID + KISS + DRY + YAGNI**：工程判断的公约数');
  L.push('- **实现前 5 维度置信度 ≥90%** 才开工（见 `confidence-check` 指引）');
  L.push('- **错误时禁止 retry**，强制 root cause（见 `debugger` 指引）');
  L.push('');

  // Agents
  L.push('## 可用角色（相当于 Claude Code 的 sub-agents）');
  L.push('');
  L.push('遇到对应场景时，以该角色视角工作。`.codex/agents/*.md` 有完整 prompt。');
  L.push('');
  const agentsSrc = path.join(sourceDir, 'agents');
  const agentEntries = [];
  for (const rel of walkFiles(agentsSrc)) {
    if (!rel.endsWith('.md')) continue;
    const content = readText(path.join(agentsSrc, rel));
    const { frontmatter } = parseFrontmatter(content);
    if (!frontmatter) continue;
    const name = frontmatter.name || rel.replace(/\.md$/, '');
    const desc = frontmatter.description || '';
    agentEntries.push({ name, desc });
  }
  for (const { name, desc } of agentEntries) {
    L.push(`### ${name}`);
    L.push(desc);
    L.push('');
  }

  // Commands (as prompts)
  L.push('## 工作流（Prompts）');
  L.push('');
  L.push('Codex 下用 `mcc-xxx` 调用（文件：`.codex/prompts/mcc-xxx.md`）：');
  L.push('');
  const cmdSrc = path.join(sourceDir, 'commands');
  for (const rel of walkFiles(cmdSrc)) {
    if (!rel.endsWith('.md')) continue;
    const content = readText(path.join(cmdSrc, rel));
    const { frontmatter } = parseFrontmatter(content);
    const cmdName = rel.replace(/\.md$/, '');
    const desc = (frontmatter && frontmatter.description) || '';
    L.push(`- **\`mcc-${cmdName}\`** — ${desc}`);
  }
  L.push('');

  // Skills
  L.push('## Skill 指引（Codex 不原生支持 skill，以下为遇场景时的思路）');
  L.push('');
  const skillsSrc = path.join(sourceDir, 'skills');
  if (pathExists(skillsSrc)) {
    const skillDirs = fs
      .readdirSync(skillsSrc, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    for (const sd of skillDirs) {
      const skillFile = path.join(skillsSrc, sd, 'SKILL.md');
      if (!pathExists(skillFile)) continue;
      const content = readText(skillFile);
      const { frontmatter } = parseFrontmatter(content);
      const desc = (frontmatter && frontmatter.description) || '';
      L.push(`### ${sd}`);
      L.push(desc);
      L.push('');
    }
  }

  // Modes
  L.push('## 心智模式（按关键词/上下文自动激活）');
  L.push('');
  const modesSrc = path.join(sourceDir, 'modes');
  if (pathExists(modesSrc)) {
    for (const rel of walkFiles(modesSrc)) {
      if (!rel.endsWith('.md')) continue;
      const content = readText(path.join(modesSrc, rel));
      const { frontmatter } = parseFrontmatter(content);
      const modeName = rel.replace(/\.md$/, '');
      const desc = (frontmatter && frontmatter.description) || '';
      L.push(`### ${modeName}`);
      L.push(desc);
      L.push('');
    }
  }

  // Hooks soft
  L.push('## 软约定（原 hooks，Codex 下靠自律）');
  L.push('');
  L.push('完整自律指引见 `HOOKS-SOFT-GUIDANCE.md`。核心 3 条：');
  L.push('- **pre:config-protection**：改 config 前检查是否放宽 lint/security 规则');
  L.push('- **stop:format-typecheck**：每批 edit 完，手动跑 format + typecheck');
  L.push('- **pre:bash:safety**：破坏性 Bash（rm -rf / git reset --hard / force push）前三思');
  L.push('');

  // Artifacts
  L.push('## 产出落盘位置（与 Claude Code 侧共享）');
  L.push('');
  L.push('- `.claude/PRPs/prds/{slug}.prd.md` — PRD');
  L.push('- `.claude/PRPs/plans/{slug}.plan.md` — Plan');
  L.push('- `.claude/PRPs/plans/completed/` — 已完成 plan 归档');
  L.push('- `.claude/PRPs/reports/{plan}-report.md` — 实施报告');
  L.push('- `.claude/PRPs/reviews/pr-{N}-review.md` — PR 审查');
  L.push('- `.claude/PRPs/reviews/full/{ts}/` — 全面审查（5 阶段）');
  L.push('- `.claude/PRPs/features/{slug}/01-...09-docs.md` — 全栈特性 9 步');
  L.push('- `~/.claude/session-data/` — 跨 session 持久化');
  L.push('- `~/.claude/skills/learned/` — 从 session 提取的 pattern');
  L.push('- `docs/mistakes/bug-YYYY-MM-DD-{slug}.md` — bug 归档');
  L.push('- `docs/adr/NNNN-*.md` — 架构决策');
  L.push('');

  return L.join('\n') + '\n';
}

function buildHooksSoftGuidance(sourceDir) {
  const hooksPath = path.join(sourceDir, 'hooks', 'hooks.json');
  const hooksJson = JSON.parse(readText(hooksPath));
  const L = [];
  L.push('# MCC Hooks 软约定（Codex）');
  L.push('');
  L.push('> Codex 不支持原生 hook 机制。以下把 MCC 的 8 条 hook 翻译成 Codex 使用者的自律约定。');
  L.push('> 没法自动拦截，但你知道**这些时刻该手动做什么**。');
  L.push('');

  for (const h of hooksJson.hooks || []) {
    L.push(`## ${h.id}`);
    L.push('');
    L.push(`- **原 hook 事件**：\`${h.event}\`  ${h.matcher ? `(matcher: \`${h.matcher}\`)` : ''}`);
    L.push(`- **语义**：${h.description || ''}`);
    L.push('- **Codex 自律**：');
    L.push(`  - ${selfDisciplineFor(h.id)}`);
    L.push('');
  }

  L.push('## 统一原则');
  L.push('');
  L.push('这 8 条约定落地的共同点：**让自己停下来想 2 秒，再动手**。');
  L.push('就像跑步前系鞋带——不能省，省了会摔跤。');
  L.push('');

  return L.join('\n') + '\n';
}

function selfDisciplineFor(id) {
  const map = {
    'pre:config-protection':
      '改 lint / security / tsconfig / eslint 等配置前，问自己："这是放宽规则吗？如果是，这个场景真的值得放宽吗？"',
    'stop:format-typecheck':
      '一批文件 edit 完后，手动跑 `pnpm/yarn/npm run lint && tsc --noEmit`（或 `ruff check && pyright`）。别累积一堆再修。',
    'session:start':
      '开新 session 前，先读上次 session 留下的 `~/.claude/session-data/` 最近文件（或类似笔记），别从零重启上下文。',
    'stop:session-end':
      'session 结束前写一段 "本次做了什么 / 什么没跑通 / 下一步 exact action"，用 `mcc-session-save` prompt。',
    'stop:check-console-log':
      '交付前 grep `console.log` / `print(` / `dbg!` 等调试语句清掉。',
    'pre:observe:continuous-learning':
      '（可选）想让 AI 长期学习你的习惯？装 `continuous-learning-v2` skill 到 Claude Code 侧；Codex 下不支持。',
    'post:observe:continuous-learning': '同上。',
    'pre:bash:safety':
      '跑破坏性命令前停 2 秒：`rm -rf` / `git reset --hard` / `git push --force` / `DROP TABLE` / `truncate` 等。',
  };
  return map[id] || '（该 hook 无对应 Codex 自律指引）';
}

// ─── JSON mcp → TOML 片段 ───────────────────────────────

function mcpJsonToToml(mcpJson) {
  const L = [];
  L.push('# MCC MCP servers');
  L.push('# 追加到 ~/.codex/config.toml 的末尾（或 installer 自动合并）');
  L.push('# 由 MCC adapter 从 source/mcp/mcp.json 自动生成');
  L.push('');

  const servers = mcpJson.mcpServers || {};
  for (const [name, conf] of Object.entries(servers)) {
    // [mcp_servers.name]
    L.push(`[mcp_servers.${name}]`);
    if (conf.command) {
      L.push(`command = ${JSON.stringify(conf.command)}`);
    }
    if (Array.isArray(conf.args)) {
      const argsStr = conf.args.map((a) => JSON.stringify(a)).join(', ');
      L.push(`args = [${argsStr}]`);
    }
    if (conf.description) {
      L.push(`# ${conf.description}`);
    }
    if (conf.required !== undefined) {
      L.push(`# required: ${conf.required}`);
    }
    L.push('');

    // [mcp_servers.name.env]
    if (conf.env && Object.keys(conf.env).length > 0) {
      L.push(`[mcp_servers.${name}.env]`);
      for (const [k, v] of Object.entries(conf.env)) {
        L.push(`${k} = ${JSON.stringify(v)}`);
      }
      L.push('');
    }
  }

  return L.join('\n');
}

// ─── Manifest 辅助 ─────────────────────────────────────

function recordFile(manifest, srcAbs, dstAbs, distDir, kind) {
  const relDist = path.relative(distDir, dstAbs).replace(/\\/g, '/');
  manifest.files.push({
    kind,
    dist: relDist,
    size: statSize(dstAbs),
    sha256: sha256OfFile(dstAbs),
  });
}

function buildSummary(files) {
  const byKind = {};
  let totalBytes = 0;
  for (const f of files) {
    byKind[f.kind] = (byKind[f.kind] || 0) + 1;
    totalBytes += f.size || 0;
  }
  return { total: files.length, byKind, totalBytes };
}

// ─── CLI ──────────────────────────────────────────────

module.exports = { adaptToCodex };

if (require.main === module) {
  const sourceDir = path.resolve(__dirname, '..', 'source');
  const distDir = path.resolve(__dirname, '..', 'dist', 'codex');
  adaptToCodex(sourceDir, distDir)
    .then((r) => {
      console.log('\n=== Codex adapter done ===');
      console.log(JSON.stringify(r, null, 2));
    })
    .catch((err) => {
      console.error('[codex adapter] FAILED:', err.message);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
}

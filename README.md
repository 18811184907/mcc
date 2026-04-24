# MCC · Multi-target Claude/Codex Configuration

> 为 Claude Code 和 Codex 双目标定制的产品级 AI 协作配置。
> 中文主场景，Python + TypeScript + AI 应用全栈定向优化。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-1.1.0-blue)
![Target](https://img.shields.io/badge/target-Claude_Code_%2B_Codex-purple)

---

## 什么是 MCC

**单一源 × 双目标分发**。一套精心打磨的 AI 编码配置，自动适配 Claude Code 和 Codex 两种工具。

从 5 个开源项目（`everything-claude-code` / `SuperClaude` / `wshobson/agents` / `BMAD-METHOD` / `obra/superpowers`）里挑精华、去冗余、融合改写，不是简单拼接。

### 装完你会拥有

| 维度 | 内容 |
|---|---|
| **19 个角色 agent** | planner / code-reviewer / debugger / security-reviewer / ai-engineer / python-pro / typescript-pro / fastapi-pro / frontend-developer / backend-architect / database-optimizer / performance-engineer / …… |
| **20 个 slash 命令** | `/mcc:prd` `/mcc:plan` `/mcc:implement` `/mcc:pr`（PRP 四件套流水线）、`/mcc:full-stack`（9 步全栈）、`/mcc:review` `/mcc:full-review`（两档审查）、`/mcc:tdd` `/mcc:e2e` `/mcc:test-coverage`（测试三路）、`/mcc:fix-bug` `/mcc:troubleshoot` `/mcc:build-fix`（诊断三档）、`/mcc:session-save` `/mcc:session-resume`（跨 session 持久化）…… |
| **16 个 skill** | **v1.0 基础（8）**：`product-lens`（产品诊断）、`confidence-check`（5 维度开工门槛）、`party-mode`（真并行多 agent 辩论）、`mcc-help`（扫 FS 推当前阶段+建议下一步）、`architecture-decision-records`、`coding-standards`、`verification-loop`、`continuous-learning-v2`<br><br>**v1.1 Superpowers 增量（8）**：`subagent-driven-development`（每任务 fresh subagent + 两阶段 review）、`tdd-workflow`（含 testing-anti-patterns，`/mcc:tdd` 的 skill 实现体）、`writing-skills`（创作 skill 的 meta-skill + Anthropic 最佳实践）、`using-git-worktrees`、`finishing-a-development-branch`、`requesting-code-review` + `receiving-code-review`（审查两端）、`dispatching-parallel-agents`（和 party-mode 辩论互补：一个分发一个辩论） |
| **3 个 behavioral mode** | `brainstorming` · `task-management` · `token-efficiency`（按关键词/上下文自动激活） |
| **8 条 hook** | `pre:config-protection` 独家（阻止 Claude 修改 config 绕过 lint/security）、`stop:format-typecheck`（批量 lint+tsc，不每次 edit 跑）、`pre:bash:safety`（破坏性命令拦截）等 |
| **5 个 MCP 服务器** | Serena（语义记忆）、Context7（实时查文档）、GitHub、Sequential（深推理）、Playwright |
| **精选 rules** | Python 5 个（`coding-style` / `testing` / `patterns` / `security` / `hooks`）+ `mcc-principles`（6 主题：Core Directive / Evidence-Based / SOLID / Systems Thinking / Decision Framework / Risk Management） |

---

## 快速上手

### 前置

- **Node.js 18+**（installer 运行时）
- **Claude Code** 或 **Codex**（或两者都装）
- Git Bash（Windows 环境可选，用于 observe.sh hook 等 bash 脚本）

### 3 种安装方式

#### A. Claude Code 原生 `/plugin`（推荐 Claude Code 用户）

```
/plugin marketplace add https://github.com/18811184907/mcc
/plugin install mcc@mcc-marketplace
```

然后跑 `.\install.ps1` 合并 hooks + MCP 配置（`/plugin` 只装 agent/command/skill，settings 合并还得跑 installer）。

#### B. 一键脚本（推荐多工具用户）

```powershell
# Windows
git clone https://github.com/18811184907/mcc
cd mcc
.\install.ps1

# macOS / Linux / Git Bash
git clone https://github.com/18811184907/mcc
cd mcc
./install.sh
```

installer 会自动：
1. 检测你装了哪些工具（Claude Code / Codex）
2. 备份现有 `settings.json` / `config.toml`
3. **不覆盖**你的 agent/command/skill（同名跳过）
4. 深度合并 settings.json（permissions 并集、hooks 追加去重、mcpServers 合并）
5. 打印回滚命令（带时间戳）

#### C. 手动 clone + 指定参数

```bash
./install.sh --scope project --target claude-code --force
```

### 验证装好了

在 Claude Code 里打一条消息：
```
/mcc-help
```

会告诉你当前项目在 MCC workflow 的什么阶段、建议下一步。

---

## 安装选项

```
./install.sh --scope <global|project|hybrid>    # 安装位置
             --target <auto|claude-code|codex|both>  # 目标工具
             --force                             # 覆盖同名（默认跳过）
             --dry-run                           # 只打印计划，不动文件
             --verbose                           # 详细日志
```

| Scope | Claude Code | Codex | 适合谁 |
|---|---|---|---|
| **global**（默认） | `~/.claude/` | `~/.codex/` | 个人使用 |
| **project** | `./.claude/` | `./.codex/` + `./AGENTS.md` | 团队协作 / 多项目不同配置 |
| **hybrid** | 通用全局 + 规则项目级 | 同上 | 进阶用户 |

---

## 核心设计

### 单一源 → 双目标

```
source/                              ← 一份真相
├── agents/*.md
├── commands/*.md
├── skills/*/SKILL.md
├── modes/*.md
├── hooks/ + scripts/
├── mcp/mcp.json
└── rules/

       ↓ adapters/build.js（0.2 秒）

dist/
├── claude-code/.claude/             ← 给 Claude Code 用
│   ├── agents/          (19)
│   ├── commands/mcc/    (20，触发 /mcc:*)
│   ├── skills/          (8)
│   ├── modes/           (3)
│   ├── .mcc-hooks/      (25 scripts + hooks.json)
│   ├── rules/common/    (mcc-principles.md)
│   ├── rules/python/    (5 个)
│   ├── mcp-configs/
│   └── settings.fragment.json
│
└── codex/                          ← 给 Codex 用
    ├── .codex/agents/     (tools 字段已转译: Read → read_file 等)
    ├── .codex/prompts/    (20 个 mcc-*.md)
    ├── .codex/rules/
    ├── AGENTS.md          (编译了所有 agents + commands + skill 指引)
    ├── HOOKS-SOFT-GUIDANCE.md  (hooks 转为自律约定)
    ├── config.fragment.toml    (MCP 的 TOML 版)
    └── INSTALL-MANIFEST.json
```

编辑 `source/` 后跑 `node adapters/build.js` 刷新 `dist/`。

### 为什么分 source/adapters/dist

- **source/**：你的真实配置，版本控制在这里
- **adapters/**：纯 Node 脚本（无 npm 依赖），把 source 转译成各工具需要的格式
- **dist/**：构建产物，commit 进 git 方便 `/plugin install` 直接用，不需要每个用户本地构建

### 约束：产品化不是拼接

MCC 的 agent/command 都是 **融合改写**过的，不是多个源并存：
- 融合型（`code-reviewer` / `debugger` / `backend-architect` / `database-optimizer` / `performance-engineer`）取多源精华
- 全部中文化角色定位和段落 header，代码/API/术语保留英文
- 删除所有来源暴露词（OCI、GPT-5.4 幻觉、三段式空话）
- Python 主力：`python-pro`、`fastapi-pro` 降 opus→sonnet 省 token
- AI 应用定向：`ai-engineer` + `prompt-engineer` + `vector-database-engineer` 是独家

详见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

---

## 典型工作流

### 场景 1：做一个新功能

```
/mcc:prd    → 7 phase Socratic 对话生成 PRD
/mcc:plan   → 从 PRD 生成自包含实施计划（含 mandatory reading）
/mcc:implement → 按 plan 执行，每步 5 级验证（type/lint/test/build/integration）
/mcc:review → 并行跑 code-reviewer + security-reviewer
/mcc:pr     → 创建 PR 关联所有 PRP artifacts
```

artifacts 都落 `.claude/PRPs/{prds,plans,reports,reviews}/`。

### 场景 2：卡住了

```
/mcc:fix-bug "登录接口偶尔 500" → root cause 调查 → 方案 A/B → 实施
```

禁止 retry，强制根因分析，产出归档到 `docs/mistakes/`。

### 场景 3：方向有分歧

```
/mcc-help → 查看当前阶段 + 推荐 skill
调 party-mode → 真并行 spawn 4 个 MCC agent 辩论
             (planner + backend-architect + security-reviewer + ai-engineer)
```

### 场景 4：跨天继续上次的活

```
昨天结束前：/mcc:session-save
今天开始：/mcc:session-resume → 秒懂昨天做到哪了、什么没跑通、下一步 exact action
```

完整 20 个命令速查见 [USAGE.md](./USAGE.md)。

---

## 安装后会发生什么

### 你会多出（以 global 为例）

```
~/.claude/
├── agents/{19 个 MCC agent}.md        ← 同名用户已有的不覆盖
├── commands/mcc/{20 个命令}.md         ← 触发 /mcc:*
├── skills/{8 个 skill 目录}/           ← 同名跳过
├── modes/{3 个 mode}.md
├── rules/python/ + rules/common/mcc-principles.md
├── .mcc-hooks/                          ← MCC 私有 namespace
│   ├── scripts/{25 个 .js/.sh}/
│   └── hooks.json
├── mcp-configs/mcp.json
└── settings.json                        ← 深度合并（已备份原文件）

~/.codex/
├── agents/{19 个}.md                    ← tools 已转译为 Codex 命名
├── prompts/{20 个 mcc-*}.md             ← Codex 用 prompt 机制
├── rules/python/
└── config.toml                          ← 追加了 6 个 MCP sections

~/AGENTS.md（或项目根）
└── 编译版的角色清单 + 命令索引 + skill 指引 + hooks 软约定
```

### 不会动

- 你原有的 `agents/xxx.md` / `commands/xxx.md` / `skills/xxx/` / `modes/xxx.md`（同名跳过）
- `rules/common/` 下你的现有文件（只加 `mcc-principles.md`）
- `rules/typescript/` / `rules/web/` / `rules/zh/`（完全不碰）
- 任何 `.claude/PRPs/` 下的用户产物
- 任何 `session-data/` / `learned/` / `docs/mistakes/` / `docs/adr/`

---

## 卸载

```powershell
# Windows
.\uninstall.ps1                              # 从最近备份恢复
.\uninstall.ps1 -Timestamp 2026-04-24-065853 # 指定时间戳恢复
```

```bash
# Unix
./uninstall.sh --timestamp 2026-04-24-065853
```

卸载会：
- 恢复 `settings.json` / `config.toml` 到安装前
- 删除 `.mcc-hooks/` / `commands/mcc/` / `rules/common/mcc-principles.md`（MCC 独有）
- **保留** 你的 PRPs artifacts、session-data、learned skills、mistakes、ADR
- **保留** agents/skills/modes（因为你可能改过同名文件）—— 手动清理

---

## Roadmap

### v1.0 · 2026-04-24 首发

- [x] 19 agents（含 5 融合型）+ 20 commands + 8 skills + 3 modes
- [x] 8 hooks + 5 MCPs + Python rules + mcc-principles
- [x] 双目标 adapter（Claude Code + Codex）
- [x] installer / uninstaller 支持 global/project/hybrid scope
- [x] 幂等 build + 备份 + 回滚

### v1.1 · 2026-04-24 Superpowers 增量 ✅

- [x] 纳入 [obra/superpowers](https://github.com/obra/superpowers) 8 个独家 skill
- [x] **subagent-driven-development**：每任务 fresh subagent + 两阶段 review（spec → quality）
- [x] **tdd-workflow**（改名自 test-driven-development）：填补 `/mcc:tdd` 的 skill 实现体，含 testing-anti-patterns
- [x] **writing-skills**：创作 skill 的 meta-skill + Anthropic 官方最佳实践参考
- [x] **using-git-worktrees**：worktree 隔离并行开发
- [x] **finishing-a-development-branch**：分支收尾（merge/PR/cleanup）
- [x] **requesting-code-review** + **receiving-code-review**：代码审查两端流程
- [x] **dispatching-parallel-agents**：独立任务并行分发（和 party-mode 辩论互补）
- [x] skills 从 8 扩展到 **16**

### v1.2+ · 待定（按社区反馈）

- [ ] `doc-updater` agent（ECC 有但 v1 没装）
- [ ] 更多语言 rules（Go / Rust 等按需）
- [ ] Cursor / Gemini CLI 支持（按需）
- [ ] MCC 自检测试套件
- [ ] e2e-testing skill（v1 `/mcc:e2e` 是内联版）

---

## 开源协议

MIT. 详见 [LICENSE](./LICENSE)。

融合了以下项目的精华（均为 MIT 协议）：
- [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code)
- [SuperClaude-Org/SuperClaude_Framework](https://github.com/SuperClaude-Org/SuperClaude_Framework)
- [wshobson/agents](https://github.com/wshobson/agents)
- [bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD)
- [obra/superpowers](https://github.com/obra/superpowers) （v1.1 新增：8 个独家 skill）

---

## 贡献

- 提 issue / PR 前先看 [ARCHITECTURE.md](./ARCHITECTURE.md)
- 改 agent/command/skill 时改 `source/` 不要直接改 `dist/`（会被下次 build 覆盖）
- 跑 `node adapters/build.js` 验证产出
- `./install.sh --dry-run` 验证 installer 逻辑

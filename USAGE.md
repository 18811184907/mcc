# MCC Usage · 命令速查

> 13 个命令 + 19 个 skill + 3 个 behavioral mode 的使用手册。
> 新手建议先看 [README.md](./README.md) 的"典型工作流"章节。
>
> **v1.5 后只留真正高频、产出 artifact、或需要显式触发的命令。冷门能力转 skill 自动激活**（说"验证一下" → verification-loop；说"审一下" → code-review-workflow；说"写 E2E" → e2e-testing；说"记下这个" → continuous-learning-v2）。

---

## 命令命名

Claude Code 侧：`/xxx`（打 `/` + Tab 可自动补全所有 MCC 命令）

Codex 侧：`mcc-xxx`（作为 prompt 调用，不带 `:`）

---

## 13 个命令按类型

### 🎯 PRP 流水线（4 个）· 中小功能的主力流

一条线走到底，每步产出 artifact 落 `.claude/PRPs/`。

| 命令 | 功能 | 产出位置 |
|---|---|---|
| `/prd` | 交互式 PRD 生成（7 phase Socratic 对话，问题驱动不编造需求） | `.claude/PRPs/prds/{slug}.prd.md` |
| `/plan` | 从 PRD 或描述生成自包含实施计划（含 mandatory reading、patterns to mirror） | `.claude/PRPs/plans/{slug}.plan.md` |
| `/implement` | 按 plan 执行，每步 5 级验证（type/lint/test/build/integration），失败立停 | `.claude/PRPs/reports/{plan-name}-report.md`，plan 归档到 `completed/` |
| `/pr` | 自动找 PR 模板、分析 commits、关联 PRP artifacts，push + create | 直接发 PR |

**典型流**：
```
/prd          → PRD
/plan         → Plan（含待读文件和代码模式）
/implement    → 执行 + 5 级验证
/pr           → 发 PR
```

### 🔍 审查（1 个）

| 命令 | 场景 |
|---|---|
| `/review` | 本地未提交 diff 或 `/review 123` 审 PR #123；并行派 `code-reviewer` + `security-reviewer`。深度审能力靠 **code-review-workflow skill** 覆盖。 |

### ✅ 测试（1 个）

| 命令 | 场景 |
|---|---|
| `/tdd` | 强制 RED → GREEN → REFACTOR。也可直接说"用 TDD 写 xxx"触发 **tdd-workflow skill**。 |

> **其他测试能力**（不再是命令，说关键词 skill 自动激活）：
> - 交付前 6 阶段验证 → 说"验证一下 / 交付前检查" → `verification-loop` skill
> - E2E Playwright → 说"写 E2E / 端到端测试" → `e2e-testing` skill（含 Page Object 模板）
> - 覆盖率补到 80% → 说"补测试到 80%" → `test-automator` agent

### 🔧 诊断（1 个 · 统一入口）

| 命令 | 场景 |
|---|---|
| `/fix-bug` | **统一问题入口**：自动分诊 bug / build / performance / deployment 四域，强制根因调查，禁止打补丁。归档到 `docs/mistakes/`。 |

### 🧠 会话持久化（2 个）· 跨天必用

| 命令 | 场景 |
|---|---|
| `/session-save` | session 结束前写已验证成果 / 失败路线 / 下一步 exact action |
| `/session-resume` | 加载最近 session 文件 |

### 🚪 入口（2 个）

| 命令 | 场景 |
|---|---|
| `/init` | **空项目 / 小项目**初始化：探测栈 + 生成轻量 CLAUDE.md（~30 行）。已有项目会自动建议改用 `/onboard` |
| `/explain` | 用中文详细解释代码/函数/模块/概念 |

### 🌍 接手已有项目（2 个 · v2.0 旗舰）

| 命令 | 场景 |
|---|---|
| `/onboard` | **接手陌生大代码库**（brownfield）：4 阶段并行扫架构/数据/约定/危险信号，~5 min 产出 onboarding 报告 + ≤100 行 CLAUDE.md。借鉴 ECC `codebase-onboarding`。带 `--quick` 模式跳到 ~1 min。 |
| `/index-repo` | **大项目（>1k 文件）token 节省索引**：生成 `PROJECT_INDEX.md` + `.json`，2K 一次性投入 → 每 session 省 ~10-15K tokens（多 session 摊平 ROI 5-7x）。借鉴 SuperClaude `/sc:index-repo`。 |

---

## v1.5 删除的命令 → 能力都在（靠 skill 自动激活）

| 删了 | 替代 |
|---|---|
| `/full-stack` | `/prd → /plan → /implement` 已覆盖 |
| `/full-review` | `/review` + `code-review-workflow` skill |
| `/verify` | 说"验证一下" → `verification-loop` skill |
| `/test-coverage` | 说"补覆盖率" → `test-automator` agent |
| `/e2e` | 说"写 E2E" → `e2e-testing` skill |
| `/build-fix` | 并入 `/fix-bug`（自动识别 build 类） |
| `/troubleshoot` | 并入 `/fix-bug`（4 域分诊） |
| `/learn` | 说"记下这个" → `continuous-learning-v2` skill |
| `/skill-create` | 说"建个 skill" → `writing-skills` skill |

---

## 17 个 skill（Claude 自动激活，无需手动调）

| Skill | 自动激活关键词 / 时机 |
|---|---|
| **help** | 用户问"我该做什么 / 下一步是什么 / 我在哪"。扫 `.claude/PRPs/*` + `docs/mistakes/*` 推断当前阶段 |
| **orchestration-playbook** | Claude 自查手册：遇任务查"该派什么 agent / 激活什么 skill / 该不该并行"。A 节 agent 派发 / B 节 skill 激活 / C 节并行 Q1-Q4 / D 节任务规模 → 流程深度 |
| **product-lens** | 写代码前验证"为什么要做"：4 模式诊断 → 产出 `PRODUCT-BRIEF.md` |
| **confidence-check** | "开工前 / 心里没底 / 信心如何"：5 维度打勾，≥90% 才开工 |
| **party-mode** | "选不出方案 / 多视角 / 辩论"：真并行 spawn N 个 MCC agent |
| **architecture-decision-records** | "记录决策 / 架构取舍" → `docs/adr/NNNN-*.md` |
| **coding-standards** | 写代码时自动参考 |
| **verification-loop** | "验证一下 / 交付前检查 / 跑 CI 前"：6 阶段 Build/Type/Lint/Test/Security/Diff |
| **tdd-workflow** | "用 TDD / 写测试 / 新 feature / 修 bug"：RED-GREEN-REFACTOR |
| **e2e-testing** | "写 E2E / Playwright / 端到端测试"：Page Object 模板 + CI 集成 |
| **code-review-workflow** | "审一下 / 帮我看看代码 / 收到审查意见"：派 subagent + 收反馈两端 |
| **subagent-driven-development** | 任务拆分后每 task fresh subagent + 两阶段 review |
| **dispatching-parallel-agents** | 多个独立任务并行分发（和 party-mode 辩论互补） |
| **using-git-worktrees** | 需要同时开多个分支隔离开发 |
| **finishing-a-development-branch** | 分支收尾（merge/PR/cleanup） |
| **writing-skills** | "建个 skill / 提炼约定 / 创作流程文档" |
| **continuous-learning-v2** | "记下这个 / 沉淀 / 归纳经验"：产出 learned skill 到 `~/.claude/skills/learned/` |

---

## 3 个 behavioral mode（按关键词自动激活）

| Mode | 触发 | 行为 |
|---|---|---|
| **brainstorming** | "I want to build" / "maybe" / "not sure" / "/prd" | Socratic 提问，不做假设，等用户确认 |
| **task-management** | >3 步 / >2 目录 / >3 文件 / "polish/refine" | 强制 Plan → Phase → Task → Todo 层级 + Serena 跨 session 记忆 |
| **token-efficiency** | 上下文 >75% / 用户说"简短点" | 符号系统（→/⇒/∴/✅/❌）+ 缩写压缩 30-50% token |

---

## 19 个角色 agent

agent 由命令自动调用，用户一般不直接调。但可以 `/agents` 查看列表。

### 通用流程（5 个）
- `planner` — 把复杂功能拆成带文件路径 + 风险等级 + Phase 的实现计划（Opus）
- `code-reviewer` — 基于置信度过滤噪音的代码审查（Sonnet，含 LLM 应用专项）
- `debugger` — 证据链方法论 + 5 步快速修复 + LLM/RAG 调试专项
- `refactor-cleaner` — 死代码清理（knip / depcheck / ts-prune / vulture）
- `silent-failure-hunter` — 静默失败专项扫描（独家）

### AI 应用（3 个）
- `ai-engineer` — LLM 应用 / RAG / Agent 工程
- `prompt-engineer` — Prompt 工程（强制展示完整文本）
- `vector-database-engineer` — 向量 DB 选型 + chunking / HNSW 参数

### 语言专家（4 个）
- `python-pro` — Python 3.12+ 全栈（uv / ruff / Pydantic / FastAPI）
- `typescript-pro` — TS 高级类型系统
- `javascript-pro` — 现代 JS / Node / Bun
- `fastapi-pro` — FastAPI 0.100+ 异步 API + LLM 集成模板

### 后端/前端/数据（3 个）
- `backend-architect` — API / 微服务 / 事件驱动 / resilience（含 ADR 模板）
- `frontend-developer` — React 19 + Next.js 15 + AI 应用前端模板
- `database-optimizer` — 多 DB 覆盖 + PG/Supabase/RLS 深度

### 质量 / 测试 / 性能（4 个）
- `code-explorer` — 深度剖析现有代码库（AI 全栈场景特化）
- `security-reviewer` — OWASP Top 10 + Python/JS/通用安全工具
- `test-automator` — 单元/集成/E2E + LLM 测试专项
- `performance-engineer` — 观测性 + Web Vitals + LLM 性能专项

---

## 典型场景 · 完整命令链

### 🆕 新项目起手

```bash
cd my-new-project
git init

# Claude Code 里
/init           # 探测栈 + 生成 CLAUDE.md
/prd            # 第一个 feature 的 PRD
```

### 📝 做一个新功能（中等复杂度）

```
/prd            → PRD
/plan           → Plan（自包含，含 mandatory reading）
/implement      → 执行，每步 5 级验证
/review         → 单点审查
/pr             → 发 PR
```

跨天的话中间可以：
```
/session-save   # 下班前
/session-resume # 第二天
```

### 🌐 做一个新功能（复杂度高，全栈级）

```
/full-stack     # 9 步流水线，含 2 个 checkpoint
```

9 步是：需求 → DB 设计 → 架构 → DB 实现 → 后端实现 → 前端实现 → 并行 test+sec+perf → 部署 → 文档。每步产出落 `.claude/PRPs/features/{slug}/01-...09-docs.md`。

### 🔍 提交前全面体检

```
说"验证一下" / "交付前检查"  # 自动激活 verification-loop skill（6 阶段闸门）
/review                       # 并行派 code-reviewer + security-reviewer
```

> v1.5 起 `/verify` 和 `/full-review` 命令已删，改为关键词触发 skill。

### 🐛 生产出错了

```
/fix-bug "API 偶尔 500"  # 4 域并行盲诊
```

`/fix-bug` 自动按现象分诊到 build / runtime / performance / deploy 四类。
v1.5 起 `/troubleshoot` 和 `/build-fix` 已合并进 `/fix-bug`。

### 🗣 方向有分歧

```
help               # 查当前阶段 + 推荐（原 mcc-help，v1.9 简化为 help）
```

然后：
- 做技术选型："Next.js vs Remix" → party-mode skill 会自动 spawn planner + frontend-developer + backend-architect + performance-engineer 辩论
- 做架构决策 → spawn planner + backend-architect + database-optimizer + security-reviewer

### 📖 看陌生代码

```
/explain 这段代码是干什么的？[粘贴代码]
# 或
让 code-explorer 给我 src/auth/ 下的 onboarding
```

---

## 产出 artifacts 地图

装完 MCC 后，你的项目里会多出这些"工作产物"的落盘位置：

```
<project>/
├── CLAUDE.md                                # /init 生成（如没有）
├── AGENTS.md                                # Codex 侧（如装了 Codex）
├── docs/
│   ├── mistakes/bug-YYYY-MM-DD-{slug}.md   # /fix-bug 归档
│   └── adr/NNNN-*.md                        # architecture-decision-records 产出
└── .claude/
    └── PRPs/
        ├── prds/{slug}.prd.md               # /prd
        ├── plans/{slug}.plan.md             # /plan
        ├── plans/completed/                 # /implement 归档
        ├── reports/{plan}-report.md         # /implement 产出
        ├── reviews/
        │   ├── pr-{N}-review.md             # /review (PR mode)
        │   ├── local-{ts}.md                # /review (Local mode)
        │   └── full/{ts}/00-...05-final.md  # /full-review
        └── features/{slug}/01-...09-docs.md # /full-stack

<用户家目录>/.claude/
├── session-data/YYYY-MM-DD-{shortid}-session.tmp  # /session-save
└── skills/learned/{pattern}.md                     # 用户说"记下这个" → continuous-learning-v2 skill 自动产出
```

---

## FAQ

### Q: 命令不触发怎么办

A: 检查 3 点：
1. 装了没？`ls ~/.claude/commands/`（Claude Code 侧）
2. Claude Code 版本？需要 ≥ 2.1.0 支持 `commands/{子目录}/` 机制
3. 重启 Claude Code 会话

### Q: 我已经有 `code-reviewer` agent 了，怎么办

A: MCC 默认**不覆盖**同名。安装时会 `skipped`。两个选择：
- 保留你的，忽略 MCC 的（默认）
- 强制替换：`--force` 重装

### Q: 怎么暂时禁用某个 MCC hook

A: 编辑 `~/.claude/settings.json`，把对应 hook 的 `command` 注释或删除。或者改 `~/.claude/.mcc-hooks/hooks.json` 里的 `default_enabled: false`。

### Q: 怎么看 MCC 装了什么

A: `cat ~/.claude/.mcc-hooks/hooks.json` 看 hooks 清单，`ls ~/.claude/commands/` 看命令，`ls ~/.claude/skills/` 看 skills（MCC 的装在同级，目录名能识别）。

### Q: 国内拉 Serena MCP 慢

A: Serena 首次从 GitHub 拉取。可改用 Gitee 镜像或设置 `GOPROXY`。或者暂时跳过 Serena（installer 可选装）。

### Q: Playwright 首次下载浏览器 300MB 很慢

A: 设置 `PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright/`。

### Q: Codex 怎么用

A: 装完 MCC 后，Codex 会读：
- `~/.codex/agents/*.md` — 角色定义
- `~/.codex/prompts/mcc-*.md` — 命令 prompt
- `~/.codex/config.toml` — MCP（含 MCC 的 5 个）
- `~/AGENTS.md` 或项目根 `AGENTS.md` — 总索引

用 Codex 时**不能**像 Claude Code 那样敲 `/xxx`（Codex 没有 slash command）。改成用"自然语言 + 引用 prompt 名"：

"用 `mcc-prd` prompt 帮我做一份 PRD，主题是 …"

或者直接让 Codex 按 AGENTS.md 里的角色工作：

"你现在是 `planner` 角色，帮我规划实现 JWT 认证系统。"

---

## 更多

- 架构 / 贡献 → [ARCHITECTURE.md](./ARCHITECTURE.md)
- 设计原则 → `~/.claude/rules/common/mcc-principles.md`（装完后）
- 问题反馈 → GitHub Issues

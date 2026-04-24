# MCC Usage · 命令速查

> 23 个命令 + 16 个 skill + 3 个 behavioral mode 的使用手册。
> 新手建议先看 [README.md](./README.md) 的"典型工作流"章节。

---

## 命令命名

Claude Code 侧：`/xxx`（打 `/` + Tab 可自动补全所有 MCC 命令）

Codex 侧：`mcc-xxx`（作为 prompt 调用，不带 `:`）

---

## 23 个命令按类型

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

### 🏗 大流水线（2 个）· 复杂功能用

比 PRP 更重，带人工 checkpoint 和并行验证。

| 命令 | 功能 |
|---|---|
| `/full-stack` | 9 步全栈特性流水线：需求 → DB 设计 → 架构 → DB/后端/前端实现 → test+sec+perf 并行验证 → 部署 → 文档。**2 个 user approval checkpoint** |
| `/full-review` | 5 阶段全面代码审查：质量+架构 / 安全+性能 / 测试+文档 / 最佳实践+CI/CD → 按 P0/P1/P2/P3 优先级汇总 |

### 🔍 审查（2 个）

| 命令 | 场景 |
|---|---|
| `/review` | **单点**审查：本地未提交 diff，或 `mcc:review 123` 审 PR #123（并行调 code-reviewer + security-reviewer） |
| `/full-review` | **全面**体检：模块级或项目级（见上面大流水线） |

### ✅ 验证 / 测试（4 个）

| 命令 | 场景 |
|---|---|
| `/verify` | 跑 verification-loop skill：build / type / lint / test / security / diff 6 阶段 |
| `/test-coverage` | 分析覆盖率，定位低覆盖文件，生成缺失测试到 80%+（委派 test-automator） |
| `/tdd` | 强制 RED → GREEN → REFACTOR，先写失败测试再实现 |
| `/e2e` | Playwright E2E 测试：生成 page object + 跑测 + 产出 artifacts |

### 🔧 诊断（3 档）

窄 → 广 三档阶梯：

| 命令 | 适合 |
|---|---|
| `/build-fix` | 构建/类型错误专项修复。3 次同错误自动停下问用户 |
| `/fix-bug` | 单个 bug 深挖：强制 root cause → 提 A/B 方案 → 用户确认再动手。禁止 retry / timeout 拉长。产出归档 `docs/mistakes/` |
| `/troubleshoot` | 多域诊断：bug / build / performance / deployment 四种快速判断 + 路由到上面两个专项 |

### 🧠 会话持久化（2 个）· 跨天必用

| 命令 | 场景 |
|---|---|
| `/session-save` | session 结束前写"已验证成果 / 失败路线 / 下一步 exact action"到 `~/.claude/session-data/YYYY-MM-DD-{shortid}-session.tmp` |
| `/session-resume` | 加载最近 session 文件，结构化 briefing 后等用户确认继续 |

### 📚 学习 / 沉淀（2 个）

| 命令 | 场景 |
|---|---|
| `/learn` | 从当前 session 提取可复用 pattern（错误解决 / 调试技巧 / 项目约定）→ `~/.claude/skills/learned/{pattern}.md` |
| `/skill-create` | 分析 git history（默认 200 commits）提取约定 + 文件共变 + 架构 + 测试模式 → 生成 SKILL.md |

### 🚪 入口（2 个）

| 命令 | 场景 |
|---|---|
| `/init` | 新项目首次入场：探测栈 + 提取约定 + 生成 `CLAUDE.md` |
| `/explain` | 用中文详细解释代码/函数/模块/概念（假设懂基础，补领域知识） |

### ☁ Team Backup（3 个）· v1.4 新 · 小团队代码备份

适合 1-10 人非技术小团队，把代码默默推到管理员个人 GitHub。不用 Organization。

| 命令 | 场景 |
|---|---|
| `/backup "说明"` | 日常一键同步 = add + commit + push。首次自动进入 setup（问姓名/邮箱/项目名 → 建 `{项目}-backup` private repo → 装 post-commit hook → 首推） |
| `/backup-status` | 看当前项目的备份状态：远程 URL / 身份 / 待推送 commit 数 / 最近 3 次 commit / hook 是否装了 |
| `/backup-off` | 关闭当前项目备份（可逆）：删 `.mcc/backup-state.json` + `.git/hooks/post-commit`，保留 git remote + 远程代码 |

**同事第一次用**：管理员发 `team-install.ps1` / `team-install.sh`（已内嵌 PAT），双击运行 → 装好 MCC → 敲 `/backup "xxx"`。

**管理员**：参照 [ADMIN-GUIDE.md](./ADMIN-GUIDE.md) 建 fine-grained PAT（3 个月过期），填脚本顶部的 `TEAM_PAT`。

---

## 16 个 skill（Claude 自动激活，无需手动调）

| Skill | 触发时机 |
|---|---|
| **mcc-help** | 用户问"我该做什么 / 下一步是什么 / /help"时激活。扫 `.claude/PRPs/*` + `docs/mistakes/*` 推断当前阶段 |
| **product-lens** | 写代码前验证"为什么要做"时：4 模式诊断（Diagnostic / Founder Review / User Journey / Feature Prioritization）→ 产出 `PRODUCT-BRIEF.md` |
| **confidence-check** | 实现前跑 5 维度打勾（去重查 / 架构合规 / 官方文档 / OSS 参考 / 根因识别），≥90% 才开工 |
| **party-mode** | 架构决策、技术选型、思路发散时：真并行 spawn N 个 MCC agent 辩论（不是单 LLM 扮多角色），滚动 400 词摘要 |
| **architecture-decision-records** | 识别架构决策瞬间 → `docs/adr/NNNN-*.md` |
| **coding-standards** | 写代码时自动参考的编码规范（Python + TS 带示例） |
| **verification-loop** | `/verify` 的实现体 |
| **continuous-learning-v2** | 默认关闭。启用后 hooks 观察 tool 调用 → Haiku 分析 → 产出 instincts（带置信度） |

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
/verify         # 本地 6 阶段验证
/full-review    # 5 阶段 × 多维度审查
```

### 🐛 生产出错了

```
/troubleshoot "API 偶尔 500"  # 快速多域诊断
```

根据诊断路由：
- 如果是 build 问题 → 自动走 `/build-fix`
- 如果是单 bug → 自动走 `/fix-bug`
- 如果是 runtime 多域问题 → 现场给方案

### 🗣 方向有分歧

```
mcc-help           # 查当前阶段 + 推荐
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
└── skills/learned/{pattern}.md                     # /learn
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

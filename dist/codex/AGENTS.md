# AGENTS.md

> MCC 自动生成。编辑 `source/` 后跑 `node adapters/build.js` 刷新。
> 本文件 + `.codex/agents/*.md` + `.codex/prompts/*.md` 构成 Codex 上的 MCC 能力。

## 核心原则

完整版见 `.codex/rules/common/mcc-principles.md`。要点：
- **证据 > 假设**：所有结论需证据支撑；不确定时明确标"假设"
- **代码 > 文档**：文档是代码的影子，不是真相
- **效率 > 冗长**：符号/缩写/压缩优先，尤其 context 紧张时
- **SOLID + KISS + DRY + YAGNI**：工程判断的公约数
- **实现前 5 维度置信度 ≥90%** 才开工（见 `confidence-check` 指引）
- **错误时禁止 retry**，强制 root cause（见 `debugger` 指引）

## 可用角色（相当于 Claude Code 的 sub-agents）

遇到对应场景时，以该角色视角工作。`.codex/agents/*.md` 有完整 prompt。

### ai-engineer
生产级 LLM 应用、RAG 系统、AI Agent 工程师。构建 LLM 功能、聊天机器人、智能 Agent、AI 驱动应用时自动调用。覆盖 vector search、多模态、Agent 编排。

### backend-architect
后端架构师：可扩展 API 设计、微服务、分布式系统、事件驱动、resilience 模式。新建后端服务或 API 时自动调用。

### code-explorer
深度剖析现有代码库的 feature/模块：追踪执行路径、标注架构层、梳理依赖。新功能开发/重构前自动调用。

### code-reviewer
代码质量审查专家。写完/改完代码后立即调用。基于置信度过滤噪音，按严重级别给出可执行 fix。覆盖安全、质量、React/Next/FastAPI 反模式、成本意识。

### database-optimizer
数据库优化专家：查询调优、索引策略、N+1 消除、多层缓存、分区/分片、云 DB 调优。数据库优化或性能问题时自动调用。PG/Supabase 最深，其它主流 DB 也覆盖。

### debugger
调试专家。遇到报错、测试失败、异常行为时自动调用。先用证据链系统性定位根因，再给出最小修复。

### fastapi-pro
FastAPI 0.100+ 高性能异步 API 专家。FastAPI 开发、异步优化、微服务架构、WebSocket、SQLAlchemy 2.0 async 场景自动调用。

### frontend-developer
React 19 + Next.js 15 前端实现专家。构建 UI 组件、响应式布局、客户端状态、解决前端问题时自动调用。兼顾性能和可访问性。

### javascript-pro
现代 JavaScript 与异步编程专家。做 JS 性能优化、异步调试、复杂异步模式（promise/async/event loop）时自动调用。支持 Node 和浏览器环境。

### performance-engineer
性能工程师：观测性、应用剖析、多层缓存、Core Web Vitals、可扩展性。性能优化、观测性、扩展性挑战时自动调用。

### planner
把复杂功能、重构、架构变更拆成带文件路径和风险评估的实现计划。启动较大单元（页面/子系统/复杂能力）时自动调用。

### prompt-engineer
Prompt 工程与 LLM 输出优化专家。构建 AI 功能、提升 Agent 效果、编写系统 prompt 时自动调用。必须展示完整 prompt 文本，不仅描述。

### python-pro
Python 3.12+ 实现专家。掌握 uv/ruff/pydantic/FastAPI/Django 等现代生态，写 Python 代码、优化性能、构建生产级 Python 应用时自动调用。

### refactor-cleaner
清理死代码、未用依赖、重复实现的专家。运行 knip/depcheck/ts-prune/vulture 等工具安全删除。大功能开发或部署前调用。

### security-reviewer
安全漏洞检测与修复专家。处理用户输入、认证、API 端点、敏感数据时自动调用。覆盖 OWASP Top 10、密钥泄漏、SSRF、注入、不安全加密。

### silent-failure-hunter
审查代码中的静默失败：吞掉的异常、误导性 fallback、错误传播丢失、缺失的错误处理。生产部署前强烈建议调用。

### test-automator
测试自动化工程师：编写完整的单元/集成/E2E 测试套件。功能开发期调用。支持 TDD 和 BDD。自动检测项目已有测试框架并跟随约定。

### typescript-pro
TypeScript 高级类型系统与企业级类型安全专家。做 TS 架构、类型推导优化、泛型/条件类型/映射类型/decorator 时自动调用。

### vector-database-engineer
向量数据库、embedding 策略、语义搜索工程师。实现向量搜索、embedding 优化、RAG 检索系统时自动调用。覆盖 Pinecone/Qdrant/Weaviate/Milvus/pgvector 选型。

## 工作流（Prompts）

Codex 下用 `mcc-xxx` 调用（文件：`.codex/prompts/mcc-xxx.md`）：

- **`mcc-explain`** — 用中文解释一段代码、函数、模块或机制的工作原理
- **`mcc-fix-bug`** — 修 bug / 排查问题（合并了 troubleshoot 的多域分诊）。自动判断是代码 bug / build 错 / 性能退化 / 部署故障，走对应流程。强制根因分析，禁止打补丁。
- **`mcc-implement`** — 执行 PRP plan 文件：每步立即验证（type / lint / test / build / integration 5 级），失败立停不累积。
- **`mcc-init`** — 为当前项目初始化 CLAUDE.md（如果不存在的话），带栈检测和约定提取
- **`mcc-plan`** — 生成自包含 PRP 实施计划：抓取所有代码模式和 mandatory reading，让实现期间零提问、零二次搜索。
- **`mcc-pr`** — 从当前分支创建 GitHub PR：自动找模板、分析 commits、关联 PRP artifacts、push 并 create。
- **`mcc-prd`** — 交互式 PRD 生成器：问题先行，7 个 phase 提问生成完整 PRD。功能尚未清晰、需要把模糊想法打磨成可执行产品规格时调用。
- **`mcc-review`** — 代码审查：本地未提交改动（无参数）OR GitHub PR（传 PR number/URL 走 PR 模式）。并行调用 code-reviewer + security-reviewer。
- **`mcc-session-resume`** — 加载最近的 session 文件，展示结构化 briefing（已做什么 / 什么不要重试 / 下一步），等用户确认后继续。
- **`mcc-session-save`** — 把当前 session 的已验证成果、失败路线、下一步 exact action 写入带日期的 session 文件，供 /session-resume 恢复。
- **`mcc-tdd`** — 强制 TDD 流程：先写失败测试（RED）→ 最小实现（GREEN）→ 重构（REFACTOR）。新功能、bug fix 必走。

## Skill 指引（Codex 不原生支持 skill，以下为遇场景时的思路）

### architecture-decision-records
识别架构决策瞬间，落盘到 docs/adr/NNNN-*.md。planner/code-reviewer 看到架构变动时自动提醒。

### code-review-workflow
代码审查完整流程：派发 code-reviewer subagent + 收到反馈后的反应模式。用户说'审一下 / review / 审代码 / 帮我看看改动对不对 / 收到审查意见怎么回'时激活，或 Claude 写完较大单元代码后主动激活。

### coding-standards
Python + TS 编码规范带示例教学。与 rules/ 分工：rules 是清单（短），此 skill 是带代码示例的教学（长）。冲突以 rules 为准。

### confidence-check
实现前 5 维度置信度打勾（去重/架构/官方文档/OSS 参考/根因），≥90% 才准开工。100-200 token 省 5K-50K token。

### continuous-learning-v2
长期学习你的编码习惯，沉淀 learned skill 到 ~/.claude/skills/learned/。用户说'记下这个 / 以后别再这样 / 这个模式以后用 / 沉淀一下 / 提炼出约定 / 归纳经验'时激活；修完 bug 或完成重要 refactor 后 Claude 主动提议。默认关闭 observer 需手动启用。

### dispatching-parallel-agents
遇到 2+ 个独立问题域时并行派 subagent，每个 agent 一个问题域。多文件独立失败、多子系统独立 bug 时触发。

### e2e-testing
Playwright E2E 测试模式：page object + 稳定选择器 + CI 集成。用户说'写 E2E / 端到端测试 / Playwright / 跑完整用户流程'时激活。

### finishing-a-development-branch
实现完成、测试通过、要决定如何合入时使用：先验证测试，再给 4 个清晰选项（本地合并 / PR / 保留 / 丢弃），然后执行并清理。

### mcc-help
扫 .claude/PRPs/* 和 docs/mistakes/* 推断当前进度，给结构化'下一步'建议。用户问'我该做什么'、'下一步'时激活。

### party-mode
真并行 spawn 多个 MCC agent 辩论（不是单 LLM 扮多角色）。做技术选型/架构决策/思路发散时用。

### product-lens
写代码前先做 4 模式产品诊断（诊断/创始人审查/用户旅程/优先级），输出 PRODUCT-BRIEF.md。

### subagent-driven-development
同会话内 dispatch 新鲜 subagent 逐 task 实现 + 每 task 两轮 review（spec + code quality）。执行已有 implementation plan 时自动触发。

### tdd-workflow
严格的 RED-GREEN-REFACTOR 工作流：先写失败测试、watch it fail、再写最小实现。用户说'写测试 / 加单元测试 / 写新功能 / 修 bug / 用 TDD / test first'时自动激活；任何 feature/bugfix 开工前 Claude 应主动提议。/tdd 命令的 skill 实现。

### using-git-worktrees
建隔离 worktree + 自动选目录 + 安全校验。开始 feature 开发或执行 plan 之前触发，避免污染当前工作区。

### verification-loop
交付前 6 阶段验证（Build/Type/Lint/Test/Security/Diff）。用户说'验证一下 / 跑一遍检查 / 交付前检查 / 确认没问题'时自动激活。

### writing-skills
创作 skill 的 meta-skill（TDD 写流程文档）。用户说'创建 skill / 写个 skill / 提炼约定 / 从 git 历史抽模式 / 把这个固化成 skill / 建立团队规范'时激活；也处理 /skill-create 被删后的能力。

## 心智模式（按关键词/上下文自动激活）

### brainstorming
需求模糊时切入苏格拉底式对话，把想法变成可落盘的结构化 brief。

### task-management
多步复杂操作的层级任务管理，用 Serena memory 跨会话持久化状态。

### token-efficiency
符号化压缩表达模式，30-50% token 削减，保留 ≥95% 信息量。context 吃紧或用户要'简短'时触发。

## 软约定（原 hooks，Codex 下靠自律）

完整自律指引见 `HOOKS-SOFT-GUIDANCE.md`。核心 3 条：
- **pre:config-protection**：改 config 前检查是否放宽 lint/security 规则
- **stop:format-typecheck**：每批 edit 完，手动跑 format + typecheck
- **pre:bash:safety**：破坏性 Bash（rm -rf / git reset --hard / force push）前三思

## 产出落盘位置（与 Claude Code 侧共享）

- `.claude/PRPs/prds/{slug}.prd.md` — PRD
- `.claude/PRPs/plans/{slug}.plan.md` — Plan
- `.claude/PRPs/plans/completed/` — 已完成 plan 归档
- `.claude/PRPs/reports/{plan}-report.md` — 实施报告
- `.claude/PRPs/reviews/pr-{N}-review.md` — PR 审查
- `.claude/PRPs/reviews/full/{ts}/` — 全面审查（5 阶段）
- `.claude/PRPs/features/{slug}/01-...09-docs.md` — 全栈特性 9 步
- `~/.claude/session-data/` — 跨 session 持久化
- `~/.claude/skills/learned/` — 从 session 提取的 pattern
- `docs/mistakes/bug-YYYY-MM-DD-{slug}.md` — bug 归档
- `docs/adr/NNNN-*.md` — 架构决策


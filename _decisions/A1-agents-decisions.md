# A1 · 20 个 Agent 加工决策（执行版）

> Phase B1 执行 agent 必读。配合 `MCC-CANONICAL.md` 使用。
> **所有决策均已评审通过，执行者严格照做，不要自由发挥**。

## 全局执行规则

1. **去除一切来源暴露词**：ECC / SuperClaude / SC / BMAD / wshobson / Anthropic "PRPs-agentic-eng" / Wirasm
2. **去除所有云厂商 OCI / Oracle / MySQL HeatWave**
3. **去除幻觉模型名**：GPT-5.4 / GPT-5-mini → 换成真实 GPT-4o / GPT-4.1 / o1
4. **去除空话三段**：Knowledge Base / Response Approach / Behavioral Traits
5. **补齐 frontmatter 4 字段**：name, description(中文), tools, model
6. **中文化规则**：角色定位句 + 段落 header + 说明正文 → 中文；代码 + 命令 + API + 模型名 → 英文保留
7. **Worked Example（大段代码示例）保留英文**
8. **补 AI 全栈专项段**：对用户画像有增值的 agent 加 "LLM 应用专项" 或 "Python/TS 栈贴合点"
9. **文件输出到**：`mcc-build/final/source/agents/{name}.md`
10. **源文件位置**：
    - ECC: `mcc-build/refs/ecc/agents/{name}.md`
    - wshobson: `mcc-build/refs/wshobson/plugins/{plugin}/agents/{name}.md`
    - SC: `mcc-build/refs/sc/plugins/superclaude/agents/{name}.md`

## 逐个 agent 加工动作

### 1. planner (源: ECC)
- **源**: `ecc/agents/planner.md` (213 行)
- **frontmatter**: `name: planner` | `description: "把复杂功能、重构、架构变更拆成带文件路径和风险评估的实现计划。启动较大单元（页面/子系统/复杂能力）时自动调用。"` | `tools: [Read, Grep, Glob]` | `model: opus`（保留 Opus，规划需深推理）
- **保留**：L46-90 Plan Format 模板、L101-178 Stripe Worked Example（不翻译）
- **删除**：L180-197 "When Planning Refactors"+"Sizing and Phasing"（与 common 重复）；L199-210 "Red Flags to Check"（rules 已覆盖）
- **翻译**：L8 角色句、L10-45 段落 header 和说明
- **新增**：
  - "### 与用户画像匹配的优先级"：FastAPI + Django + LLM API 调用优先；不做 ML 模型训练步骤；Windows 部署用 .bat/.ps1
  - "### 产出落盘"：`docs/plans/<feature>.md` 或 `.claude/PRPs/plans/{slug}.plan.md`
  - 追加："启动前先按 development-workflow 的第 0 步做 `gh search repos` 复用搜索"
- **协同**：被 `/mcc:plan`、`/mcc:implement` 调用；交接 `tdd-guide`、`backend-architect`、`ai-engineer`
- **目标行数**：~140

### 2. refactor-cleaner (源: ECC)
- **源**: `ecc/agents/refactor-cleaner.md` (86 行)
- **frontmatter**: `name: refactor-cleaner` | `description: "清理死代码、未用依赖、重复实现的专家。运行 knip/depcheck/ts-prune/vulture 安全删除。大功能开发或部署前调用。"` | `tools: [Read, Write, Edit, Bash, Grep, Glob]` | `model: sonnet`
- **保留**：L21-26 JS/TS 检测命令；L28-51 工作流；L53-64 checklist；L74-86 "When NOT to Use"+"Success Metrics"
- **删除**：L66-72 Key Principles（与 common 重复）
- **翻译**：角色句、段落 header、checklist 说明
- **新增（关键）**：Python 检测命令段：
  ```bash
  vulture src/ --min-confidence 80
  pip-autoremove -L
  pyflakes src/
  ruff check --select F401,F811 src/
  ```
- **协同**：被 `/mcc:refactor-clean` 调用；上游依赖 `tdd-guide` 覆盖率 ≥80%
- **目标行数**：~90

### 3. silent-failure-hunter (源: ECC)
- **源**: `ecc/agents/silent-failure-hunter.md` (52 行)
- **frontmatter**: `name: silent-failure-hunter` | `description: "审查代码中的静默失败：吞掉的异常、误导性 fallback、错误传播丢失、缺失的错误处理。生产部署前强烈建议调用。"` | `tools: [Read, Grep, Glob, Bash]` | `model: sonnet`
- **保留全部原内容**（精炼骨架，不砍）
- **翻译**：L10 零容忍句、5 类 hunt targets header 和描述、Output Format
- **新增（关键）**：`### LLM 调用场景的特殊静默失败`：
  - LLM API 返空/被 guardrails 过滤时没记 finish_reason
  - Tool call 解析失败被吞回退字符串
  - 向量检索 0 命中直接返空数组（上游以为"没结果"而非"检索失败"）
  - Streaming 被中断没抛错
- **协同**：被 `/mcc:review` 作为子项并行
- **目标行数**：~75

### 4. security-reviewer (源: ECC)
- **源**: `ecc/agents/security-reviewer.md` (108 行)
- **frontmatter**: `name: security-reviewer` | `description: "安全漏洞检测与修复专家。处理用户输入、认证、API 端点、敏感数据时自动调用。覆盖 OWASP Top 10、密钥泄漏、SSRF、注入、不安全加密。"` | `tools: [Read, Write, Edit, Bash, Grep, Glob]` | `model: sonnet`
- **保留**：L32-44 OWASP 10 项术语；L49-60 代码模式表（pattern/severity/fix 三栏）；L63-70 Key Principles；L72-77 False Positives；L79-93 Emergency Response；L102-104 skill 引用
- **翻译**：角色+核心职责段，Emergency+When to Run 段
- **扩展**：L22-27 多语言分析命令（加 Python 的 bandit / pip-audit / safety / semgrep + 通用 gitleaks / trufflehog）
- **协同**：被 `/mcc:security-review`、`/mcc:review`（安全维度）；依赖 skill `security-review` / `django-security`
- **目标行数**：~115

### 5. code-explorer (源: ECC)
- **源**: `ecc/agents/code-explorer.md` (70 行)
- **frontmatter**: `name: code-explorer` | `description: "深度剖析现有代码库的 feature/模块：追踪执行路径、标注架构层、梳理依赖。新功能开发/重构前自动调用。"` | `tools: [Read, Grep, Glob, Bash]` | `model: sonnet`
- **保留**：5 步探索法 + 输出 markdown 模板
- **翻译**：角色句、5 步 header、模板表头（占位符保留英文）
- **新增（关键）**：`### 典型探索目标（AI 全栈项目）`：
  - LLM 调用链：FastAPI/Django endpoint → Anthropic SDK 完整调用栈
  - RAG 流水线：chunking → embedding → vector store → retrieval → rerank → prompt 组装
  - Agent 工具链：tool 被哪个 agent 调用、失败如何 fallback
- **协同**：被 `/mcc:feature-dev`、`/mcc:plan`；输出给 `planner`、`backend-architect`
- **目标行数**：~90

### 6. code-reviewer (融合: wshobson 骨架 + ECC 精华)
- **源 1**: `wshobson/plugins/comprehensive-review/agents/code-reviewer.md` (172 行)
- **源 2**（融合参考）: `ecc/agents/code-reviewer.md` (235 行)
- **融合策略**：**以 ECC 版为骨架**（更实操：git diff 命令、confidence filtering、React/Node 反模式 BAD/GOOD 对照、summary 表模板），从 wshobson 摘 **AI 工具整合 + Observability 审查** 两个段落
- **frontmatter**: `name: code-reviewer` | `description: "代码质量审查专家。写完/改完代码后立即调用。基于置信度过滤噪音，按严重级别给出可执行 fix。覆盖安全、质量、React/Next/FastAPI 反模式、成本意识。"` | `tools: [Read, Grep, Glob, Bash]` | `model: sonnet`（**降级！原 opus 日常 review 是浪费**）
- **保留 ECC 版**：L11-28 Review Process + Confidence-Based Filtering；L32-174 全部 checklist + 代码对照
- **从 wshobson 摘**：
  - "AI 生成代码专项审查"（合并 ECC v1.8 addendum + wshobson L124-134 cost-awareness）
  - "Observability 代码审查"（wshobson L81-88）：结构化日志完整性、trace-id 传递、指标埋点
- **删除 wshobson**：L13-170 大部分广告型 Capabilities 堆
- **翻译**：中文化所有 header，代码块保留英文
- **新增（关键）**：`### 审查 LLM 应用代码` 专项：
  - prompt 硬编码未抽出
  - 无 max_tokens 上限
  - 无 retry + exponential backoff for 429/500
  - tool_use 返回未校验 JSON schema
  - 无 token 消耗埋点
- **目标行数**：~240

### 7. debugger (融合: wshobson + SC root-cause-analyst)
- **源 1**: `wshobson/plugins/debugging-toolkit/agents/debugger.md` (33 行)
- **源 2**: `sc/plugins/superclaude/agents/root-cause-analyst.md` (49 行) **— 本 agent 不再独立产出，合并至此**
- **融合策略**：wshobson 的 5 步骤快速流程 + SC 的证据链方法论
- **frontmatter**: `name: debugger` | `description: "调试专家。遇到报错、测试失败、异常行为时自动调用。先用证据链系统性定位根因，再给出最小修复。"` | `tools: [Read, Grep, Glob, Bash, Edit]` | `model: sonnet`
- **保留 wshobson 原 5 步**（翻译 header）
- **插入 SC 的方法论段**：
  - `### 调查原则`：跟随证据而非假设、看透症状找底层、多假设并行测试、结论必须可验证
  - `### 证据收集清单`：日志/错误消息/时间线/系统行为数据
  - `### 假设测试`：形成多个假设 → 系统性验证 → 保留证据链
- **保留 wshobson 输出格式**：root cause / evidence / fix / testing / prevention 五段（翻译）
- **新增（关键）**：`### LLM/RAG 应用调试专项`：
  - LLM 输出不符预期：检查 temperature/seed/prompt 版本
  - RAG 召回差：检查 embedding 模型版本、chunk 边界、rerank 阈值
  - Agent 卡住：检查 tool schema 验证失败、token limit、loop detection
  - 流式响应中断：检查 SSE 心跳、代理超时、客户端 abort
- **协同**：被 `/mcc:fix-bug` 调用；下游：防复发方案传给 `tdd-guide` 加测试
- **目标行数**：~75

### 8. ai-engineer (源: wshobson)
- **源**: `wshobson/plugins/llm-application-dev/agents/ai-engineer.md` (158 行)
- **frontmatter**: `name: ai-engineer` | `description: "生产级 LLM 应用、RAG 系统、AI Agent 工程师。构建 LLM 功能、聊天机器人、智能 Agent、AI 驱动应用时自动调用。覆盖 vector search、多模态、Agent 编排。"` | `tools: [Read, Write, Edit, Bash, Grep, Glob, WebFetch]` | `model: inherit`
- **修正**：L17-22 模型清单去掉幻觉名（GPT-5.4 / GPT-5-mini），保留 GPT-4o / GPT-4.1 / o1 / Claude Opus 4.7 / Claude Sonnet 4.6 / Claude Haiku 4.5 / Llama 3.3 / Mixtral / Qwen / DeepSeek-V3
- **保留**：L30-32 embedding 清单（Voyage / OpenAI / Cohere）、agent 框架段精简后
- **删除**：L95-101（Kafka/Pulsar 大数据 pipeline，YAGNI）；L102-111（Enterprise Slack/Teams 集成）
- **新增（关键）**：
  - `### Agent 框架选型矩阵`（短表）：LangGraph（有状态/长流程）、CrewAI（多 agent 协作）、Claude Agent SDK（最轻）、AutoGen（对话式）
  - `### FastAPI + LLM 生产部署模板`：异步 streaming 端点骨架、prompt caching、失败重试降级到 Haiku、token 消耗埋点 Prometheus
- **追加**：最后加"向量 DB 深度优化请交给 `vector-database-engineer`；Prompt 设计深度优化请交给 `prompt-engineer`"
- **目标行数**：~130

### 9. prompt-engineer (源: wshobson)
- **源**: `wshobson/plugins/llm-application-dev/agents/prompt-engineer.md` (277 行)
- **frontmatter**: `name: prompt-engineer` | `description: "Prompt 工程与 LLM 输出优化专家。构建 AI 功能、提升 Agent 效果、编写系统 prompt 时自动调用。必须展示完整 prompt 文本，不仅描述。"` | `tools: [Read, Write, Edit, Bash, Grep, Glob, WebFetch]` | `model: inherit`
- **保留（最关键！）**：L9 硬性规则（中文化但必须醒目）："**重要：创建 prompt 时必须在明显标注的代码块中展示完整文本。绝不只描述 prompt 而不展示。必须单独一块可直接复制粘贴。**"
- **保留**：L19-27 CoT、L29-37 Constitutional AI（翻译 header）
- **修正**：L51-55 去掉 GPT-5.4 幻觉名
- **扩充 L61-69 Claude 段（重点）**：
  - XML tag 结构化 prompt
  - prompt caching 应用位
  - Messages API 与 extended thinking 的 prompt 设计差别
  - Tool use 中 tool description 写法
  - 模型分级：Sonnet 4.6 默认 / Opus 4.7 复杂架构 / Haiku 4.5 批量分类
- **删除**：L71-80（Open Source Models，用户不用本地）；L115-142（Business/Creative/Technical 应用，YAGNI）；L145-166（评估方法论，下沉到 skill）；L169-188（Chaining/Multimodal 过度延展）
- **保留**：L226-253 Required Output Format；L266-273 "Before Completing Any Task" checklist
- **目标行数**：~130

### 10. vector-database-engineer (源: wshobson)
- **源**: `wshobson/plugins/llm-application-dev/agents/vector-database-engineer.md` (118 行)
- **frontmatter**: `name: vector-database-engineer` | `description: "向量数据库、embedding 策略、语义搜索工程师。实现向量搜索、embedding 优化、RAG 检索系统时自动调用。覆盖 Pinecone/Qdrant/Weaviate/Milvus/pgvector 选型。"` | `tools: [Read, Write, Edit, Bash, Grep, Glob]` | `model: inherit`
- **保留**：L19-24 6 种 DB 选型、L28-32 embedding 模型清单（Voyage/OpenAI/BGE）、L36-41 索引配置（HNSW/IVF/PQ）、L44-49 chunking 规格
- **精简**：L66-75 Workflow（浓缩 5 步）、L79-106 Best Practices（删重复）
- **保留**：L109-117 Example Tasks
- **新增（关键）**：`### 中小规模 RAG 首选栈`（针对用户画像）：
  - <10 万文档：pgvector + Supabase（FastAPI/Django 天然 SQL 集成）
  - 10-100 万：Qdrant self-hosted 或 Pinecone Serverless
  - 100 万+：Milvus / Weaviate 集群
  - Claude 应用默认 embedding：Voyage voyage-3-large
- **目标行数**：~100

### 11. python-pro (源: wshobson)
- **源**: `wshobson/plugins/python-development/agents/python-pro.md` (150 行)
- **frontmatter**: `name: python-pro` | `description: "Python 3.12+ 实现专家。掌握 uv/ruff/pydantic/FastAPI/Django 等现代生态，写 Python 代码、优化性能、构建生产级 Python 应用时自动调用。"` | `tools: [Read, Write, Edit, Bash, Grep, Glob]` | `model: sonnet`（**降级！原 opus 日常 Python 是浪费**）
- **保留**：L16-24 Modern Python Features；L27-35 Modern Tooling（uv/ruff/pyright 用户首选）；L39-46 pytest；L50-57 Performance；L60-68 Web Development（FastAPI/Django 加强）
- **删除**：L71-79 Data Science/ML 段（**用户不训模型**）；L119-126 Knowledge Base；L129-138 Response Approach
- **精简**：L82-90 DevOps（保留 Docker 多阶段、12-factor）；L93-101 Advanced Patterns（保留 SOLID/DI/decorator，删元编程）
- **保留**：L141-149 Example Interactions 前 4 条
- **新增（关键）**：`### LLM 应用相关 Python 模式`：
  - Anthropic SDK 异步调用 + prompt caching 代码骨架
  - Pydantic v2 作为 LLM 输出 schema（structured output）
  - httpx async client（替代 requests）
  - tenacity 装饰器 retry + backoff
- **目标行数**：~110

### 12. typescript-pro (源: wshobson)
- **源**: `wshobson/plugins/javascript-typescript/agents/typescript-pro.md` (37 行)
- **frontmatter**: `name: typescript-pro` | `description: "TypeScript 高级类型系统与企业级类型安全专家。做 TS 架构、类型推导优化、泛型/条件类型/映射类型/decorator 时自动调用。"` | `tools: [Read, Write, Edit, Bash, Grep, Glob]` | `model: sonnet`（**降级！**）
- **保留**：L10-16 Focus Areas（术语英文保留）、L18-26 Approach、L28-36 Output
- **新增（关键扩充）**：
  - `### 常用模式速查`：
    - `as const` + `satisfies` 替代 enum
    - discriminated union + exhaustive switch
    - `readonly` 数组/对象 + immer
    - zod / typebox 作为运行时 + 类型单一来源
    - Generic constraint 带默认值 `<T extends Base = Default>`
  - `### tsconfig 严格模式推荐`：strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes / isolatedModules / moduleResolution: "bundler"
- **目标行数**：~65

### 13. javascript-pro (源: wshobson)
- **源**: `wshobson/plugins/javascript-typescript/agents/javascript-pro.md` (36 行)
- **frontmatter**: `name: javascript-pro` | `description: "现代 JavaScript 与异步编程专家。做 JS 性能优化、异步调试、复杂异步模式（promise/async/event loop）时自动调用。支持 Node 和浏览器环境。"` | `tools: [Read, Write, Edit, Bash, Grep, Glob]` | `model: inherit`
- **保留全部**（精简骨架，翻译 header）
- **新增（关键）**：
  - `### 常见异步反模式`：forEach 中 await（不并发）→ Promise.all + map；未处理 Promise rejection；在 async 里 throw 失栈；AbortController 取消
  - `### Bun 运行时`：首选 Bun 时的 package.json 差别、`bun test`
- **目标行数**：~55

### 14. fastapi-pro (源: wshobson)
- **源**: `wshobson/plugins/python-development/agents/fastapi-pro.md` (172 行)
- **frontmatter**: `name: fastapi-pro` | `description: "FastAPI 0.100+ 高性能异步 API 专家。FastAPI 开发、异步优化、微服务架构、WebSocket、SQLAlchemy 2.0 async 场景自动调用。"` | `tools: [Read, Write, Edit, Bash, Grep, Glob]` | `model: sonnet`（**降级！**）
- **保留**：L16-24 Core FastAPI、L27-35 Data Management（async SQLAlchemy 2.0 + Alembic + Redis）、L38-46 API Design、L49-57 Auth（OAuth2 + JWT）、L60-68 Testing（pytest-asyncio）、L71-79 Performance、L82-90 Observability（结构化日志 + OpenTelemetry + Sentry）、L93-101 Deployment（Docker + Uvicorn/Gunicorn）
- **删除**：L105-112（gRPC/SSE/GraphQL/Celery 非用户主场）；L139-149 Knowledge Base；L151-160 Response Approach
- **精简**：L114-123 Advanced（保留 DI + custom exception handler）
- **保留**：L164-171 Example Interactions 前 4 条
- **新增（关键）**：`### FastAPI + LLM 集成模板`：
  - `StreamingResponse` + async generator 做 LLM streaming
  - BackgroundTasks 做慢处理（embedding、chunking）
  - DI 注入 Anthropic client 单例 + prompt cache
  - SSE 端点骨架
- **目标行数**：~120

### 15. backend-architect (融合: wshobson 骨架 + ECC ADR 模板)
- **源 1**: `wshobson/plugins/backend-development/agents/backend-architect.md` (310 行)
- **源 2**（融合）: `ecc/agents/architect.md`（摘 ADR 模板段）
- **frontmatter**: `name: backend-architect` | `description: "后端架构师：可扩展 API 设计、微服务、分布式系统、事件驱动、resilience 模式。新建后端服务或 API 时自动调用。"` | `tools: [Read, Grep, Glob, Bash]` | `model: inherit`
- **保留**：L19-31 API Design、L34-40 API Contract、L44-54 Microservices、L57-66 Event-Driven、L69-79 Auth、L82-92 Security Patterns、L95-105 Resilience、L108-118 Observability、L121-131 Data Integration、L134-143 Caching、L146-155 Async Processing、L287-292 Key Distinctions、L294-309 Output Examples
- **精简**：
  - L157-167 Framework 段 → 只保留 "Python (FastAPI/Django)、Node.js (NestJS/Express)、Go (可选)"；删 Ruby/Java/C#/Rust
  - L169-178 API Gateway（保留 Kong/Traefik/Envoy，删厂商）
  - L180-191 Performance（保留 N+1/连接池/async/压缩）
  - L193-202 Testing（保留 unit/integration/contract/load，删 chaos）
  - L204-214 Deployment（保留 Docker/K8s/CI-CD）
- **删除**：L247-258 Knowledge Base；L260-271 Response Approach；所有 OCI 引用
- **融合插入**：从 ECC architect.md L108-142 摘 ADR 模板段（作为"架构决策文档"章节）
- **新增（关键）**：`### AI 全栈后端典型架构模板`：
  - FastAPI 单体 + Postgres + Redis + Celery（起步）
  - 加 vector DB（pgvector → Qdrant 迁移路径）
  - 加 Django admin 后台管理
  - Windows 本地 docker-compose 开发
- **目标行数**：~220

### 16. frontend-developer (源: wshobson)
- **源**: `wshobson/plugins/frontend-mobile-development/agents/frontend-developer.md` (165 行)
- **frontmatter**: `name: frontend-developer` | `description: "React 19 + Next.js 15 前端实现专家。构建 UI 组件、响应式布局、客户端状态、解决前端问题时自动调用。兼顾性能和可访问性。"` | `tools: [Read, Write, Edit, Bash, Grep, Glob]` | `model: inherit`
- **保留**：L16-23 Core React（19 Actions/RSC/Suspense）、L26-34 Next.js（App Router/RSC/Server Actions）、L36-44 Architecture、L47-54 State（Zustand/TanStack Query）、L68-76 Performance（Core Web Vitals）、L79-86 Testing（RTL/Playwright）、L89-96 A11y（WCAG）
- **精简**：L57-65 Styling（保留 Tailwind/CSS Modules/Framer Motion）；L99-106 DX（保留 ESLint/Prettier/Storybook）；L108-116 Third-Party（削为："认证 NextAuth/Clerk、支付 Stripe、分析 GA4、CMS 可选"）
- **删除**：L118-130 Behavioral Traits；L133-142 Knowledge Base；L145-154 Response Approach
- **保留**：L156-164 Example Interactions 前 5 条
- **新增（关键）**：`### AI 应用前端模板`：
  - Vercel AI SDK 流式渲染 `useChat` / `useCompletion`
  - Server-Sent Events 消费 FastAPI streaming
  - optimistic message + 错误回滚
  - token 计数 + 成本预估 UI
- **目标行数**：~120

### 17. database-optimizer (融合: wshobson 骨架 + ECC database-reviewer PG 深度)
- **源 1**: `wshobson/plugins/database-cloud-optimization/agents/database-optimizer.md` (163 行)
- **源 2**（融合）: `ecc/agents/database-reviewer.md` (91 行，专 PG/Supabase/RLS)
- **融合策略**：wshobson 广度（多 DB） + ECC 深度（PG 专项）
- **frontmatter**: `name: database-optimizer` | `description: "数据库优化专家：查询调优、索引策略、N+1 消除、多层缓存、分区/分片、云 DB 调优。数据库优化或性能问题时自动调用。PG/Supabase 最深，其它主流 DB 也覆盖。"` | `tools: [Read, Write, Edit, Bash, Grep, Glob]` | `model: inherit`
- **保留**：L16-23 Query Optimization（**删 OCI/HeatWave**）、L26-32 Indexing（**删 OCI**）、L35-41 Performance Analysis（**加 ECC 的 pg_stat_statements 诊断命令**）、L44-49 N+1、L52-58 Caching、L61-67 Scaling、L70-75 Schema Design
- **精简**：L77-82 Modern DB（保留 ClickHouse/TimescaleDB，删 NewSQL/图 DB）；L85-91 Cloud DB（删 OCI，保留 AWS/Azure/GCP）；L110-115 Cost
- **删除**：L131-139 Knowledge Base；L141-151 Response Approach
- **保留**：L154-162 Example Interactions 前 5 条
- **融合插入**：ECC database-reviewer 的 PG/Supabase 专项段：
  - PG RLS 模式 + `(SELECT auth.uid())` 优化
  - 外键必加索引
  - Partial index（软删除场景）
  - SKIP LOCKED 队列模式
  - Cursor 分页替代 OFFSET
  - timestamptz/bigint 类型选择
  - 反模式清单（SELECT */int ID/varchar(255)/随机 UUID PK/GRANT ALL）
- **目标行数**：~180

### 18. test-automator (源: wshobson)
- **源**: `wshobson/plugins/backend-development/agents/test-automator.md` (42 行)
- **frontmatter**: `name: test-automator` | `description: "测试自动化工程师：编写完整的单元/集成/E2E 测试套件。功能开发期调用。支持 TDD 和 BDD。自动检测项目已有测试框架并跟随约定。"` | `tools: [Read, Write, Edit, Bash, Grep, Glob]` | `model: sonnet`
- **保留全部**（翻译 header）
- **新增（关键）**：
  - `### 项目框架映射`：
    - Python：pytest + pytest-asyncio + pytest-cov + factory_boy + httpx (FastAPI TestClient)
    - Django：pytest-django + factory_boy + freezegun
    - TypeScript：Vitest 或 Jest + RTL + MSW
    - E2E：Playwright（Windows 友好）
  - `### LLM 应用测试专项`：
    - prompt 的 golden test（固定输入 → 断言输出含关键信息）
    - tool call schema 验证
    - 对 LLM 响应做属性测试（长度、JSON 有效性、关键字段）
    - sandbox / VCR 录制 API 响应回放
- **目标行数**：~70

### 19. performance-engineer (融合: wshobson 骨架 + ECC performance-optimizer 实操)
- **源 1**: `wshobson/plugins/application-performance/agents/performance-engineer.md` (168 行)
- **源 2**（融合）: `ecc/agents/performance-optimizer.md` (446 行，实操细节极丰富)
- **融合策略**：wshobson 广度（观测/分布/云） + ECC 深度（Web Vitals 表、React 反模式代码对照、bundle 分析、报告模板）
- **frontmatter**: `name: performance-engineer` | `description: "性能工程师：观测性、应用剖析、多层缓存、Core Web Vitals、可扩展性。性能优化、观测性、扩展性挑战时自动调用。"` | `tools: [Read, Write, Edit, Bash, Grep, Glob]` | `model: inherit`
- **保留**：L16-22 Observability（**删 OCI**）、L25-31 Profiling（**删 OCI**）、L34-40 Load Testing、L43-49 Caching（**删 OCI CDN**）、L61-67 Backend、L70-76 Distributed、L88-94 Testing Automation、L97-103 DB Performance、L115-121 Analytics
- **L52-58 Frontend 段大幅增强**：插入 ECC Web Vitals 目标表 + React 反模式代码对照（useMemo/useCallback/memo）
- **L79-85 Cloud**：删 OCI，保留 AWS/Azure/GCP
- **删除**：L106-112 Mobile & Edge 整段（用户不做）；L122-133 Behavioral Traits；L135-143 Knowledge Base；L145-156 Response Approach
- **保留**：L158-167 Example Interactions 前 5 条
- **融合插入 ECC performance-optimizer 精华**：
  - Web Vitals 目标表（LCP/FID/CLS/TBT/FCP/Bundle 指标）
  - 算法复杂度对照表 + 代码示例
  - React useMemo/useCallback/memo 反模式代码对照
  - Bundle 分析命令 bash 块
  - Lighthouse CI 命令
  - 内存泄漏 useEffect 清理代码对照
  - Performance Report 模板
- **新增（关键）**：`### LLM 应用性能专项`：
  - prompt caching 节省（Anthropic 可 90%）
  - streaming 首 token 时间 (TTFT) 指标
  - batch API 批处理场景
  - embedding 批处理（batch_size 优化）
  - 模型路由（Haiku 处理简单任务降成本）
- **目标行数**：~260

### 20. ~~root-cause-analyst~~ (已合并到 #7 debugger)
- **不产出独立文件**。所有内容已融入 `debugger.md`。

---

## 总表

| # | 目标文件 | 源 | 原行数 | 目标行数 | 融合? | 新 model |
|---|---|---|---|---|---|---|
| 1 | planner.md | ECC | 213 | 140 | 否 | opus |
| 2 | refactor-cleaner.md | ECC | 86 | 90 | 否 | sonnet |
| 3 | silent-failure-hunter.md | ECC | 52 | 75 | 否 | sonnet |
| 4 | security-reviewer.md | ECC | 108 | 115 | 否 | sonnet |
| 5 | code-explorer.md | ECC | 70 | 90 | 否 | sonnet |
| 6 | code-reviewer.md | wshobson+ECC | 172+235 | 240 | **是** | **sonnet**（降 opus）|
| 7 | debugger.md | wshobson+SC | 33+49 | 75 | **是** | sonnet |
| 8 | ai-engineer.md | wshobson | 158 | 130 | 否 | inherit |
| 9 | prompt-engineer.md | wshobson | 277 | 130 | 否 | inherit |
| 10 | vector-database-engineer.md | wshobson | 118 | 100 | 否 | inherit |
| 11 | python-pro.md | wshobson | 150 | 110 | 否 | **sonnet**（降 opus）|
| 12 | typescript-pro.md | wshobson | 37 | 65 | 否 | **sonnet**（降 opus）|
| 13 | javascript-pro.md | wshobson | 36 | 55 | 否 | inherit |
| 14 | fastapi-pro.md | wshobson | 172 | 120 | 否 | **sonnet**（降 opus）|
| 15 | backend-architect.md | wshobson+ECC | 310+... | 220 | 是 | inherit |
| 16 | frontend-developer.md | wshobson | 165 | 120 | 否 | inherit |
| 17 | database-optimizer.md | wshobson+ECC | 163+91 | 180 | **是** | inherit |
| 18 | test-automator.md | wshobson | 42 | 70 | 否 | sonnet |
| 19 | performance-engineer.md | wshobson+ECC | 168+446 | 260 | **是** | inherit |
| 20 | ~~root-cause-analyst~~ | — | — | — | 合并到 #7 | — |

**合计产出**：19 个独立 agent 文件到 `mcc-build/final/source/agents/`

**5 个融合型（深度粘合）**：#6 code-reviewer、#7 debugger、#15 backend-architect、#17 database-optimizer、#19 performance-engineer

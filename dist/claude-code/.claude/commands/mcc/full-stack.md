---
description: "端到端全栈特性流水线：9 步（需求 / DB 设计 / 架构 / 实现 / 测试 + 安全 + 性能 / 部署 / 文档），含 2 个 user approval checkpoint。"
argument-hint: "<feature description> [--stack react/fastapi/postgres] [--api-style rest|graphql] [--complexity simple|medium|complex]"
---

# Full-Stack Feature Orchestrator

**Input**: $ARGUMENTS

## 核心价值

把一个全栈特性的端到端过程（需求 → 数据模型 → 架构 → 实现 → 测试/安全/性能并行审查 → 部署 → 文档）自动化编排成 9 步，带 2 个人工审批 checkpoint，避免"写完才发现架构不对""实现完才发现漏安全"。

## CRITICAL BEHAVIORAL RULES

必须严格遵守，违反任何一条都算失败：

1. **按顺序执行** — 不要跳步、重排、合并 step
2. **必写输出文件** — 每步必须产出 `.claude/PRPs/features/{slug}/NN-xxx.md`，下一步从文件读上下文，**不要只靠会话窗口记忆**
3. **在 checkpoint 处停** — 到 `PHASE CHECKPOINT` 必须停下等用户明确批准，用 AskUserQuestion 给清晰选项
4. **失败即停** — 任何 step 失败（agent 报错 / 测试失败 / 缺依赖）立刻停，告诉用户错误并问下一步，**不要默默继续**
5. **优先用 MCC 已装的 agent，找不到时降级 general-purpose** — 见下方 subagent 映射表
6. **不要自行进入 plan mode** — 本命令本身就是 plan，直接执行

## Pre-flight Checks

### 1. 检查已有 session

查 `.claude/PRPs/features/{slug}/state.json` 是否存在：

- 存在且 `status` 为 `"in_progress"`：读它，展示当前步，问用户：
  ```
  发现未完成的 full-stack session：
  Feature: [name]
  Current step: [step]

  1. 从断点继续
  2. 重开（归档现有 session）
  ```
- 存在且 `status` 为 `"complete"`：问是否归档重开

### 2. 初始化 state

解析 $ARGUMENTS 的 feature 名生成 slug（kebab-case），创建目录：

```bash
mkdir -p .claude/PRPs/features/{slug}
```

写 `.claude/PRPs/features/{slug}/state.json`：

```json
{
  "feature": "$ARGUMENTS",
  "slug": "{slug}",
  "status": "in_progress",
  "stack": "auto-detect",
  "api_style": "rest",
  "complexity": "medium",
  "current_step": 1,
  "current_phase": 1,
  "completed_steps": [],
  "files_created": [],
  "started_at": "ISO_TIMESTAMP",
  "last_updated": "ISO_TIMESTAMP"
}
```

解析 $ARGUMENTS 的 `--stack` / `--api-style` / `--complexity` flag。未指定用默认。

### 3. 解析 feature 描述

从 $ARGUMENTS 提 feature 描述（flag 之前的部分）。下文用 `$FEATURE` 引用。

---

## Phase 1 — 架构与设计基础（Steps 1-3，交互式）

### Step 1：需求收集

一次问一个问题（用 AskUserQuestion，**不要一股脑全问**）：

1. **Problem Statement**："这个功能解决什么问题？谁是用户、痛点是什么？"
2. **Acceptance Criteria**："关键验收标准？什么时候算'做完'？"
3. **Scope Boundaries**："明确 OUT of scope 的是什么？"
4. **Technical Constraints**："技术约束？（如现有 API 约定、指定 DB、延迟要求、auth 系统）"
5. **Stack Confirmation**："确认栈——项目里探测到 [stack]。Frontend 框架？Backend 框架？DB？要调整吗？"
6. **Dependencies**："是否依赖/影响其他 feature/service？"

写到：`.claude/PRPs/features/{slug}/01-requirements.md`

```markdown
# Requirements: $FEATURE

## Problem Statement
[From Q1]

## Acceptance Criteria
[From Q2 — checkbox 格式]

## Scope
### In Scope
[Derived from answers]
### Out of Scope
[From Q3]

## Technical Constraints
[From Q4]

## Technology Stack
[From Q5 — frontend / backend / database / infrastructure]

## Dependencies
[From Q6]

## Configuration
- Stack: [detected or specified]
- API Style: [rest|graphql]
- Complexity: [simple|medium|complex]
```

更新 state.json：`current_step` → 2，`files_created` 加 `"01-requirements.md"`，`completed_steps` 加 1。

### Step 2：数据库与数据模型设计

读 `01-requirements.md`。

**subagent**：**`database-optimizer`** + **`backend-architect`**（两人协作——前者出 schema 细节，后者校准与业务对齐）

```
Task (parallel x2):
  agent 1: database-optimizer
    prompt: 设计 schema、索引、迁移策略、查询模式、data access pattern（见 deliverables）
  agent 2: backend-architect
    prompt: 校准 schema 与 service 边界、与现有数据层集成点

  Shared context: 完整 01-requirements.md

Deliverables:
  1. Entity relationship：tables/collections, relationships, cardinality
  2. Schema definitions：column types, constraints, defaults, nullable fields
  3. Indexing strategy
  4. Migration strategy（生产环境安全）
  5. Query patterns：预期读写模式
  6. Data access patterns：repository/DAO interface
```

合并输出写到 `02-database-design.md`。

更新 state.json：`current_step` → 3。

### Step 3：Backend + Frontend 架构

读 `01-requirements.md` + `02-database-design.md`。

**subagent**：**`backend-architect`** + **`frontend-developer`**（并行）

```
Task (parallel x2):
  agent 1: backend-architect
    Backend Architecture deliverables:
      1. API design：endpoints/resolvers、req/resp schemas、error handling、versioning
      2. Service layer：业务逻辑组件、职责、边界
      3. Authentication/authorization：新 endpoint 的 auth 应用
      4. Integration points：与已有 service/system 的连接

  agent 2: frontend-developer
    Frontend Architecture deliverables:
      1. Component hierarchy：page / container / presentational
      2. State management：什么 state、在哪、数据流
      3. Routing：新路由、导航结构、route guards
      4. API integration：数据获取策略、cache、optimistic updates

Shared Cross-Cutting Concerns section:
  1. Error handling：backend error → API response → frontend error state
  2. Security considerations：input validation, XSS, CSRF, data protection
  3. Risk assessment：技术风险与缓解
```

合并输出写到 `03-architecture.md`。

更新 state.json：`current_step` → "checkpoint-1"。

---

## PHASE CHECKPOINT 1 — 用户批准

**必须停下**展示架构供审查。

展示 `02-database-design.md` 和 `03-architecture.md` 的摘要（关键组件、API endpoint、data model、component 结构），问：

```
架构和数据库设计完成，请审查：
- .claude/PRPs/features/{slug}/02-database-design.md
- .claude/PRPs/features/{slug}/03-architecture.md

1. 批准——进入实现阶段
2. 要求修改——告诉我哪里调整
3. 暂停——保存进度停下
```

用户选 1 才继续。选 2 修订后再次 checkpoint。选 3 更新 state.json 停下。

---

## Phase 2 — 实现（Steps 4-7）

### Step 4：数据库实现

读 `01-requirements.md` + `02-database-design.md`。

**subagent**：**`database-optimizer`** + **`python-pro`**（Python 栈）或 **`typescript-pro`**（TS/Node 栈）

```
1. Migration scripts
2. Models/entities 匹配 schema
3. Repository/data access layer
4. Database-level 约束
5. Query 按索引策略优化
6. 沿用项目现有 ORM 和 migration 约定
```

摘要写到 `04-database-impl.md`。

### Step 5：Backend 实现

读 `01-requirements.md` + `03-architecture.md` + `04-database-impl.md`。

**subagent**：**`backend-architect`** + **`fastapi-pro`**（FastAPI）或 **`python-pro`**（其他 Python）或 **`typescript-pro`**（Node/NestJS/Express）

```
1. 实现 API endpoints/resolvers 按架构设计
2. Service layer 业务逻辑
3. 连接数据访问层
4. Input validation, error handling, HTTP status codes
5. Auth/authz middleware
6. 结构化 logging 和 observability
7. 沿用项目现有代码模式
```

摘要写到 `05-backend-impl.md`。

### Step 6：Frontend 实现

读 `01-requirements.md` + `03-architecture.md` + `05-backend-impl.md`。

**subagent**：**`frontend-developer`** + **`typescript-pro`**

```
1. UI 组件按架构的 component hierarchy 搭建
2. State management 和 data flow
3. 与 backend API 集成（按设计的 fetching 策略）
4. Form handling, validation, error states
5. Loading states, optimistic updates
6. Responsive 和 a11y 基础（semantic HTML、ARIA、键盘导航）
7. 沿用项目现有前端模式
```

摘要写到 `06-frontend-impl.md`。

**注**：纯后端/API 无前端的 feature，跳过此步，在 `06-frontend-impl.md` 写一行"skipped — pure backend feature"继续。

### Step 7：测试 + 安全 + 性能（并行）

读 `04-database-impl.md` + `05-backend-impl.md` + `06-frontend-impl.md`。

**一次回复里发 3 个 Task 并行**：

**7a. Test Suite Creation**
- **subagent**：**`test-automator`**
- deliverables：
  - 每个新 backend 函数/方法的 unit test
  - API endpoint 的 integration test
  - Migration 和 query pattern 的 DB test
  - Frontend component test（如适用）
  - Happy path / edge cases / error handling / boundary conditions
  - 沿用项目现有测试模式
  - 目标 80%+ 覆盖

**7b. Security Review**
- **subagent**：**`security-reviewer`**
- 审查：OWASP Top 10、auth/authz 缺陷、input validation 漏洞、SQL injection、XSS/CSRF、data protection、依赖漏洞、security anti-patterns
- 输出：severity + location + 具体修复建议

**7c. Performance Review**
- **subagent**：**`performance-engineer`**
- 审查：N+1 查询、缺索引、未优化 query、内存泄漏、missing caching、大 payload、慢渲染、bundle size、不必要的 re-render
- 输出：severity + 性能影响估计 + 具体优化建议

3 个都跑完后，合并到 `07-testing.md`：

```markdown
# Testing & Validation: $FEATURE

## Test Suite
[Summary from 7a — files created, coverage areas]

## Security Findings
[Summary from 7b — findings by severity]

## Performance Findings
[Summary from 7c — findings by impact]

## Action Items
[List any Critical / High findings that need addressing before delivery]
```

**有 Critical 或 High 的安全/性能发现 → 先修再继续**。修完重跑相关审查。

更新 state.json：`current_step` → "checkpoint-2"。

---

## PHASE CHECKPOINT 2 — 用户批准

展示 `07-testing.md` 摘要：

```
测试与验证完成。请审查 .claude/PRPs/features/{slug}/07-testing.md

Test coverage: [summary]
Security findings: [X critical, Y high, Z medium]
Performance findings: [X critical, Y high, Z medium]

1. 批准——进入部署与文档
2. 要求修改——告诉我要修什么
3. 暂停——保存进度停下
```

用户批准才继续 Phase 3。

---

## Phase 3 — 交付（Steps 8-9）

### Step 8：部署与基础设施

读 `03-architecture.md` + `07-testing.md`。

**subagent**：MCC 未装专用 `deployment-engineer`，**降级到 `general-purpose`** 并在 prompt 里写明"按下列 deliverables 按 DevOps 工程师视角产出"。若项目提供了其他部署相关 agent，用户可以替换。

deliverables：

```
1. CI/CD pipeline 配置（为新代码）
2. DB migration 加入部署流水线
3. Feature flag 配置（若需要灰度）
4. Health checks / readiness probes
5. 关键指标的 monitoring alerts（error rate / latency / throughput）
6. 部署 runbook 含 rollback（包括 DB rollback）
7. 沿用项目现有部署模式
```

输出写到 `08-deployment.md`。

### Step 9：文档与交接

读所有前面的 `*.md`。

**subagent**：**`general-purpose`**（或 `prompt-engineer` 若需要更强的叙事能力）

deliverables：

```
1. 新 endpoint 的 API 文档（req/resp 示例）
2. Schema 变更文档 + migration 说明
3. 用户向文档更新（若适用）
4. 简短 ADR 说明关键设计决策
5. 交接摘要：造了什么、如何测试、已知限制
```

输出写到 `09-documentation.md`。

更新 state.json：`current_step` → "complete"。

---

## 完成

更新 state.json：`status` → `"complete"`，`last_updated` → 当前时间。

给出最终摘要：

```
Full-stack feature 开发完成：$FEATURE

## 产出文件
.claude/PRPs/features/{slug}/
  ├── 01-requirements.md
  ├── 02-database-design.md
  ├── 03-architecture.md
  ├── 04-database-impl.md
  ├── 05-backend-impl.md
  ├── 06-frontend-impl.md
  ├── 07-testing.md
  ├── 08-deployment.md
  └── 09-documentation.md

## Next Steps
1. 审阅全部生成代码与文档
2. 跑完整测试套件
3. 用 /mcc:pr 创建 PR
4. 按 08-deployment.md 的 runbook 部署
```

---

## Artifact 路径说明

本命令的所有中间产物放 `.claude/PRPs/features/{slug}/` 下（不是旧版的 `.full-stack-feature/`）。

## 与其他命令的关系

- 本命令≈ 把 `/mcc:prd → /mcc:plan → /mcc:implement + /mcc:review(安全+性能)` 做成编排，加上前端/部署/文档
- 更轻量的单线：`/mcc:prd → /mcc:plan → /mcc:implement → /mcc:review → /mcc:pr`
- 审查既有代码（不是新造）：`/mcc:full-review`

---
name: architecture-decision-records
description: "识别架构决策瞬间，落盘到 docs/adr/NNNN-*.md。planner/code-reviewer 看到架构变动时自动提醒。"
---

# Architecture Decision Records

在编码会话中捕获架构决策。决策不再只躺在 Slack / PR 评论 / 某人的脑子里，而是产出结构化 ADR 文档，和代码一起维护。

## 何时启用

- 用户明确说"记录一下这个决定"或"ADR this"
- 用户在重要备选之间做选择（框架 / 库 / 模式 / 数据库 / API 设计）
- 用户说"我们决定..."或"选 X 不选 Y 的原因是..."
- 用户问"为什么当初选的是 X？"（读已有 ADR）
- 规划阶段讨论架构权衡时

## ADR 格式

使用 Michael Nygard 提出的轻量 ADR 格式，针对 AI 辅助开发做了微调：

```markdown
# ADR-NNNN: [Decision Title]

**Date**: YYYY-MM-DD
**Status**: proposed | accepted | deprecated | superseded by ADR-NNNN
**Deciders**: [who was involved]

## Context

What is the issue that we're seeing that is motivating this decision or change?

[2-5 sentences describing the situation, constraints, and forces at play]

## Decision

What is the change that we're proposing and/or doing?

[1-3 sentences stating the decision clearly]

## Alternatives Considered

### Alternative 1: [Name]
- **Pros**: [benefits]
- **Cons**: [drawbacks]
- **Why not**: [specific reason this was rejected]

### Alternative 2: [Name]
- **Pros**: [benefits]
- **Cons**: [drawbacks]
- **Why not**: [specific reason this was rejected]

## Consequences

What becomes easier or more difficult to do because of this change?

### Positive
- [benefit 1]
- [benefit 2]

### Negative
- [trade-off 1]
- [trade-off 2]

### Risks
- [risk and mitigation]
```

## 工作流程

### 记录一条新 ADR

检测到决策瞬间时：

1. **初始化（仅首次）** — 如果 `docs/adr/` 不存在，**先询问用户确认**再创建目录 + 索引 `README.md` + 空白 `template.md`。不经用户同意不写文件。
2. **识别决策** — 提取核心架构选择
3. **收集上下文** — 什么问题触发的？有哪些约束？
4. **记录备选** — 还考虑过哪些？为什么被否？
5. **说明后果** — 权衡是什么？什么变容易了，什么变难了？
6. **分配编号** — 扫描 `docs/adr/` 已有 ADR 递增
7. **确认后落盘** — 先把草稿展示给用户审阅，**明确同意后**再写 `docs/adr/NNNN-decision-title.md`；用户拒绝就丢弃草稿，不写任何文件
8. **更新索引** — 追加到 `docs/adr/README.md`

### 读已有 ADR

用户问"为什么当初选 X？"：

1. 若 `docs/adr/` 不存在 → 回复："项目里没有 ADR。要开始记录架构决策吗？"
2. 存在就扫 `docs/adr/README.md` 索引
3. 读匹配的 ADR 文件，展示 Context 和 Decision 段
4. 没匹配到 → 回复："没找到相关 ADR。要现在记一条吗？"

### ADR 目录结构

```
docs/
└── adr/
    ├── README.md              ← index of all ADRs
    ├── 0001-use-nextjs.md
    ├── 0002-postgres-over-mongo.md
    ├── 0003-rest-over-graphql.md
    └── template.md            ← blank template for manual use
```

### 索引格式

```markdown
# Architecture Decision Records

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [0001](0001-use-nextjs.md) | Use Next.js as frontend framework | accepted | 2026-01-15 |
| [0002](0002-postgres-over-mongo.md) | PostgreSQL over MongoDB for primary datastore | accepted | 2026-01-20 |
| [0003](0003-rest-over-graphql.md) | REST API over GraphQL | accepted | 2026-02-01 |
```

## 决策信号识别

**显式信号**
- "就用 X 吧"
- "应该用 X 而不是 Y"
- "值得这么权衡，因为..."
- "记成 ADR"

**隐式信号**（**建议**记 ADR，但别自动写，要问过用户）
- 对比两个框架或库并做出选择
- 带理由地做了数据库 schema 设计决定
- 架构模式抉择（单体 vs 微服务 / REST vs GraphQL）
- 认证授权策略选型
- 评估后选了部署基础设施

## 什么是好的 ADR

### Do
- **具体** — "用 Prisma ORM"而不是"用个 ORM"
- **写 why** — 理由比决定本身更重要
- **写被否的备选** — 后人需要知道你想过什么
- **诚实写后果** — 每个决定都有权衡
- **短** — 一条 ADR 2 分钟能读完
- **用现在时** — "We use X" 而不是 "We will use X"

### Don't
- 记琐碎决定 — 变量命名或格式化不需要 ADR
- 写成长篇 — context 超过 10 行就过长
- 省略备选 — "就随便选了"不是有效理由
- 回填不标注 — 补记过去的决定，要标明原始日期
- 让 ADR 过期 — 被 supersede 的要链接到替代方案

## ADR 生命周期

```
proposed → accepted → [deprecated | superseded by ADR-NNNN]
```

- **proposed**：决定还在讨论，未落实
- **accepted**：决定已生效，正在被遵守
- **deprecated**：决定不再相关（比如功能被移除）
- **superseded**：有更新的 ADR 取代，**务必链接**新 ADR

## 值得记的决策类别

| 类别 | 示例 |
|----------|---------|
| **Technology choices** | Framework, language, database, cloud provider |
| **Architecture patterns** | Monolith vs microservices, event-driven, CQRS |
| **API design** | REST vs GraphQL, versioning strategy, auth mechanism |
| **Data modeling** | Schema design, normalization decisions, caching strategy |
| **Infrastructure** | Deployment model, CI/CD pipeline, monitoring stack |
| **Security** | Auth strategy, encryption approach, secret management |
| **Testing** | Test framework, coverage targets, E2E vs integration balance |
| **Process** | Branching strategy, review process, release cadence |

## 与其它 MCC 组件的协同

- **planner agent**：在 plan 阶段提出架构变更时，主动建议创建 ADR
- **code-reviewer agent**：PR 引入架构改动但没有对应 ADR 时，flag 提醒
- **backend-architect / ai-engineer**：这些 agent 的产出如果涉及基础决策，落盘成 ADR 而不是只留在 plan 文档里

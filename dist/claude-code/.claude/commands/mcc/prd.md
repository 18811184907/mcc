---
description: "交互式 PRD 生成器：问题先行，7 个 phase 提问生成完整 PRD。功能尚未清晰、需要把模糊想法打磨成可执行产品规格时调用。"
argument-hint: "<feature/product idea>"
---

# Product Requirements Document Generator

**Input**: $ARGUMENTS

## 核心价值

以"问题先行"而非"方案先行"的方式，通过 7 个阶段的定向提问 + 市场和代码库的基础调研，把模糊想法打磨成证据充足、可测试、边界清晰的 PRD。

**你扮演的角色**：一位敏锐的产品经理：
- 先谈 problem，再谈 solution
- 要求 evidence，拒绝臆测
- 以 hypothesis 思考，不以 spec 思考
- 承认不确定性（信息缺失就写 `TBD - needs research`，不要编造）

## 流程总览

```
QUESTION SET 1 → GROUNDING → QUESTION SET 2 → RESEARCH → QUESTION SET 3 → GENERATE
```

每一轮提问建立在上一轮答案之上，中间穿插 grounding 阶段来验证假设。

---

## Phase 1 — 初始化：核心问题

**若无输入**，直接问：

> **你想构建什么？**
> 用几句话描述这个产品、功能或能力。

**若有输入**，复述确认：

> 我理解你想构建的是：{restated understanding}
> 是否准确？需要调整吗？

**Gate**：等用户回复后再进入下一阶段。

---

## Phase 2 — 基础问题：问题发现

一次性抛出这 5 题，用户可以一起回答：

> **Foundation Questions：**
>
> 1. **Who** — 谁有这个问题？不是"用户"这种抽象词，是什么具体角色？
> 2. **What** — 他们面对的具体痛点是什么？（观察到的痛，不是臆测的需求）
> 3. **Why** — 他们今天为什么解决不了？已有的替代方案是什么、为什么失败？
> 4. **Why now** — 什么变化让这件事值得现在做？
> 5. **How** — 如何判断问题被解决了？成功是什么样的？

**Gate**：等答复。

---

## Phase 3 — Grounding：市场与上下文调研

收到基础答复后，并行做两件事：

**市场调研**：
1. 找同类产品/功能
2. 看竞品怎么解这个问题
3. 提炼常见模式和反模式
4. 检查该领域的最新趋势

**若有现成代码库**，同时扫描：
1. 找已有相关能力
2. 识别可复用模式
3. 记录技术约束和机会

记下 file:line 精确引用，不做建议、只做盘点。

**向用户汇报**：

> **我找到的：**
> - {市场洞察 1}
> - {竞品方案}
> - {代码库中可参考的模式（如有）}
>
> 这会改变或精化你的想法吗？

**Gate**：短暂等待（"continue" 也可）。

---

## Phase 4 — 深度挖掘：Vision 和用户

基于 foundation + research 结果，继续问：

> **Vision & Users：**
>
> 1. **Vision**：一句话描述这事如果狂野成功，最终态是什么？
> 2. **Primary User**：描述最核心的用户——角色、使用场景、触发需求的那个瞬间。
> 3. **Job to Be Done**：补全 "When [situation], I want to [motivation], so I can [outcome]."
> 4. **Non-Users**：明确不服务哪些人？哪些请求应该忽略？
> 5. **Constraints**：存在哪些限制？（时间、预算、技术、合规）

**Gate**：等答复。

---

## Phase 5 — Grounding：技术可行性

**若有代码库**，做两个并行调查：

调查 1 — 可行性：
1. 哪些现有基础设施可复用
2. 哪些相似模式已实现
3. 集成点和依赖
4. 相关配置和类型定义

调查 2 — 约束：
1. 已有相似功能的端到端实现
2. 数据流经哪些集成点
3. 架构边界和模式
4. 基于相似功能估算复杂度

每处发现给出精确的 file:line 引用，只陈述现状，不给建议。

**若无代码库**，改为技术方案调研：
1. 别人用过哪些技术方案
2. 常见实现模式
3. 已知技术难点和坑

**向用户汇报**：

> **Technical Context：**
> - Feasibility: {HIGH/MEDIUM/LOW}，原因：{reason}
> - 可复用：{existing patterns/infrastructure}
> - 关键技术风险：{main concern}
>
> 有需要我知道的技术约束吗？

**Gate**：短暂等待。

---

## Phase 6 — 决策：范围与方法

最后一轮澄清：

> **Scope & Approach：**
>
> 1. **MVP Definition**：验证这事能不能走通，最小可测试单元是什么？
> 2. **Must Have vs Nice to Have**：v1 必须有哪 2-3 样？哪些可以晚点做？
> 3. **Key Hypothesis**：补全 "We believe [capability] will [solve problem] for [users]. We'll know we're right when [measurable outcome]."
> 4. **Out of Scope**：明确不做什么？（即使用户要求）
> 5. **Open Questions**：哪些不确定性可能改变方案？

**Gate**：等答复后再生成。

---

## Phase 7 — 生成：写出 PRD

**输出路径**：`.claude/PRPs/prds/{kebab-case-name}.prd.md`

若目录不存在先创建：`mkdir -p .claude/PRPs/prds`

### PRD Template

```markdown
# {Product/Feature Name}

## Problem Statement

{2-3 sentences: Who has what problem, and what's the cost of not solving it?}

## Evidence

- {User quote, data point, or observation that proves this problem exists}
- {If none: "Assumption - needs validation through [method]"}

## Proposed Solution

{One paragraph: What we're building and why this approach over alternatives}

## Key Hypothesis

We believe {capability} will {solve problem} for {users}.
We'll know we're right when {measurable outcome}.

## What We're NOT Building

- {Out of scope item} - {why}

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| {Primary metric} | {Specific number} | {Method} |

## Open Questions

- [ ] {Unresolved question}

---

## Users & Context

**Primary User**
- **Who**: {Specific description}
- **Current behavior**: {What they do today}
- **Trigger**: {What moment triggers the need}
- **Success state**: {What "done" looks like}

**Job to Be Done**
When {situation}, I want to {motivation}, so I can {outcome}.

**Non-Users**
{Who this is NOT for and why}

---

## Solution Detail

### Core Capabilities (MoSCoW)

| Priority | Capability | Rationale |
|----------|------------|-----------|
| Must | {Feature} | {Why essential} |
| Should | {Feature} | {Why important but not blocking} |
| Could | {Feature} | {Nice to have} |
| Won't | {Feature} | {Explicitly deferred and why} |

### MVP Scope

{What's the minimum to validate the hypothesis}

### User Flow

{Critical path - shortest journey to value}

---

## Technical Approach

**Feasibility**: {HIGH/MEDIUM/LOW}

**Architecture Notes**
- {Key technical decision and why}
- {Dependency or integration point}

**Technical Risks**

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| {Risk} | {H/M/L} | {How to handle} |

---

## Implementation Phases

<!--
  STATUS: pending | in-progress | complete
  PARALLEL: phases that can run concurrently (e.g., "with 3" or "-")
  DEPENDS: phases that must complete first
  PRP: link to generated plan file once created
-->

| # | Phase | Description | Status | Parallel | Depends | PRP Plan |
|---|-------|-------------|--------|----------|---------|----------|
| 1 | {Phase name} | {Deliverable} | pending | - | - | - |
| 2 | {Phase name} | {Deliverable} | pending | - | 1 | - |

### Phase Details

**Phase 1: {Name}**
- **Goal**: {What we're trying to achieve}
- **Scope**: {Bounded deliverables}
- **Success signal**: {How we know it's done}

---

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| {Decision} | {Choice} | {Options} | {Why} |

---

## Research Summary

**Market Context**
{Key findings from market research}

**Technical Context**
{Key findings from technical exploration}

---

*Generated: {timestamp}*
*Status: DRAFT - needs validation*
```

---

## Phase 8 — 输出汇报

生成之后给用户这份简报：

```markdown
## PRD Created

**File**: `.claude/PRPs/prds/{name}.prd.md`

### Summary

**Problem**: {One line}
**Solution**: {One line}
**Key Metric**: {Primary success metric}

### Validation Status

| Section | Status |
|---------|--------|
| Problem Statement | {Validated / Assumption} |
| User Research | {Done / Needed} |
| Technical Feasibility | {Assessed / TBD} |
| Success Metrics | {Defined / Needs refinement} |

### Open Questions ({count})

{List the open questions that need answers}

### Recommended Next Step

{One of: user research, technical spike, prototype, stakeholder review}

### Implementation Phases

{Table of phases from PRD}

### To Start Implementation

运行 `/mcc:plan .claude/PRPs/prds/{name}.prd.md` → 自动选中下一个 pending phase 并生成实施计划。
```

---

## 与其他命令的关系

- 之后：`/mcc:plan` 把每个 phase 转化为自包含实施计划
- 之后：`/mcc:session-save` 在 PRD 生成完保存 session，方便跨日继续
- 若 PRD 写着写着发现范围不清楚，回到 Phase 2 继续问

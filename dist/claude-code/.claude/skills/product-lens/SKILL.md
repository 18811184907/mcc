---
name: product-lens
description: "写代码前先做 4 模式产品诊断（诊断/创始人审查/用户旅程/优先级），输出 PRODUCT-BRIEF.md。"
---

# Product Lens — 动手写代码前先想清楚"为什么"

这个 skill 专注于产品诊断，不负责写实现级别的 spec。

如果产出需要进入正式 PRD → 实现流程，直接衔接 `/prd` 和 `planner` agent。

## 何时使用

- 启动任何新功能前——先验证"为什么要做"
- 每周产品回顾——我们在做对的事情吗？
- 在多个功能之间选不出来时
- 发布前——对用户旅程做一次清醒检查
- 把模糊想法变成 PRODUCT-BRIEF 交给 engineering 之前

## 工作方式

### Mode 1: Product Diagnostic（产品诊断）

像 YC office hours 自动化版本，问最硬的 7 个问题：

```
1. Who is this for? (specific person, not "developers")
2. What's the pain? (quantify: how often, how bad, what do they do today?)
3. Why now? (what changed that makes this possible/necessary?)
4. What's the 10-star version? (if money/time were unlimited)
5. What's the MVP? (smallest thing that proves the thesis)
6. What's the anti-goal? (what are you explicitly NOT building?)
7. How do you know it's working? (metric, not vibes)
```

输出：`PRODUCT-BRIEF.md`，包含回答 / 风险 / go/no-go 建议。

如果结论是"是，继续建"，下一步进入 `/prd` 把 brief 变成正式 PRD。

### Mode 2: Founder Review（创始人视角复盘）

从创始人视角审视当前项目：

```
1. Read README, CLAUDE.md, package.json, recent commits
2. Infer: what is this trying to be?
3. Score: product-market fit signals (0-10)
   - Usage growth trajectory
   - Retention indicators (repeat contributors, return users)
   - Revenue signals (pricing page, billing code, Stripe integration)
   - Competitive moat (what's hard to copy?)
4. Identify: the one thing that would 10x this
5. Flag: things you're building that don't matter
```

### Mode 3: User Journey Audit（用户旅程审计）

映射真实用户体验：

```
1. Clone/install the product as a new user
2. Document every friction point (confusing steps, errors, missing docs)
3. Time each step
4. Compare to competitor onboarding
5. Score: time-to-value (how long until the user gets their first win?)
6. Recommend: top 3 fixes for onboarding
```

### Mode 4: Feature Prioritization（优先级决策）

10 个想法选 2 个时：

```
1. List all candidate features
2. Score each on: impact (1-5) × confidence (1-5) ÷ effort (1-5)
3. Rank by ICE score
4. Apply constraints: runway, team size, dependencies
5. Output: prioritized roadmap with rationale
```

## 输出

所有模式产出可执行文档，不写长篇大论。每一条建议都带一个具体的下一步动作。

## 与 MCC 其它组件的协同

- 产出 `PRODUCT-BRIEF.md` 后 → `/prd` 把 brief 变成正式 PRD
- `planner` agent 在拿到 PRD 后负责拆解实现计划
- 和 `brainstorming` mode 的分工：brainstorming 是轻量对话式探索；product-lens 是产出落盘 brief 的结构化诊断

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

## 优先级决策矩阵（v2.2 补 · 4 个维度交叉判断）

四模式产出建议后，用以下矩阵决定**先做哪件事**：

### ICE × Impact-Effort 4 象限

| 维度 | 1 分 | 3 分 | 5 分 |
|---|---|---|---|
| **Impact** | 影响 <10% 用户或营收 | 10-30% | >30% / 战略级 |
| **Confidence** | 假设多 / 数据少 | 部分用户访谈支持 | 已有数据或竞品验证 |
| **Effort**（反向）| 1 周以上 | 2-5 天 | <2 天 |

**ICE 分** = (Impact × Confidence) ÷ (6 - Effort)
- ≥10：立即做
- 5-9：本季度做
- <5：暂缓 / 进 backlog

### 4 象限快速归类

```
            高 Impact
              ↑
   做! ────┼──── 做（但要小心）
  快赢      │      战略投入
  (高 Impact│      (高 Impact
   低 Effort)│       高 Effort)
─────────┼─────────→ 高 Effort
   填空      │      不做
   (低 Impact│      (低 Impact
   低 Effort)│       高 Effort)
              ↓
            低 Impact
```

- **快赢**（高 Impact 低 Effort）：先做
- **战略**（高 Impact 高 Effort）：拆成小步、小步回报
- **填空**（低 Impact 低 Effort）：碎片时间做（实习生 / 周五下午）
- **不做**（低 Impact 高 Effort）：果断说不

### 用户访谈数据 vs 直觉

```
有 ≥5 个目标用户访谈 + 量化数据? → 信 ICE 分
只是直觉 / 创始人偏好?         → ICE 分仅参考，先去访谈再排
```

### 反模式

- ❌ 用 ICE 给已经决定的事情背书（先有结论再算分 → 数据是装的）
- ❌ Impact 给所有 feature 都打 5（说明你没在 trade-off）
- ❌ Effort 不区分"做出来"和"做对"（MVP 用 Effort 估时；生产质量再 ×2-3）

## 输出

所有模式产出可执行文档，不写长篇大论。每一条建议都带一个**具体的下一步动作 + ICE 分**（让用户立即知道排序）。

格式：

```markdown
## 建议清单（已 ICE 排序）

### 立即做（ICE ≥ 10）
1. **{建议}** — Impact 5 / Confidence 4 / Effort 2 → ICE = 10
   下一步：{具体动作}

### 本季度做（ICE 5-9）
...

### 暂缓（ICE < 5）
...
```

## 与 MCC 其它组件的协同

- 产出 `PRODUCT-BRIEF.md` 后 → `/prd` 把 brief 变成正式 PRD
- `planner` agent 在拿到 PRD 后负责拆解实现计划
- 和 `brainstorming` mode 的分工：brainstorming 是轻量对话式探索；product-lens 是产出落盘 brief 的结构化诊断
- 和 `confidence-check` 的关系：confidence-check 检查实现层（"这个 feature 能不能正确做出来"）；product-lens 检查产品层（"这个 feature 该不该做"）

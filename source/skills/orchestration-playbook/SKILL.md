---
name: orchestration-playbook
description: "MCC 主动性手册：Claude 遇任务时查'该派什么 agent / 激活什么 skill / 该不该并行'。触发：Claude 自己看到一个新任务但不确定是该硬干、该派 agent、该激活 skill、还是该并行——立即激活本 skill 查 playbook。与 help 分工：help 是用户导航（用户问'我在哪'激活）；本 skill 是 Claude 编排参考（Claude 自己查'该派什么'激活）。"
---

# Orchestration Playbook · Claude 编排手册

MCC 的执行哲学**落地到具体选择**。不对用户可见——这是 Claude **自己**接手任务时查的 playbook：

- **"该派 agent 还是硬干？"** → 查 [A 节](#a)
- **"该激活哪个 skill？"** → 查 [B 节](#b)
- **"该不该并行？怎么并行？"** → 查 [C 节](#c)
- **"任务多大才启动完整流程？"** → 查 [D 节](#d)

---

## A · 意图 → Agent 派发速查 {#a}

遇到用户意图或场景关键词，**主动委派下列 agent**（不要等用户说"帮我派"）：

| 用户意图 / 场景关键词 | 派的 agent | 备注 |
|---|---|---|
| 修 bug / 排查 / 性能慢 / 报错 | `debugger` | `/fix-bug` 的 Phase 2 主 agent |
| 新功能规划 / 设计 API / 拆解大任务 | `planner` | `/plan` 的主 agent |
| 写完 >50 行改动 | `code-reviewer`（+ `security-reviewer` 并行） | 不等用户说 review |
| 安全敏感代码（auth / 加密 / 用户输入 / DB 查询） | `security-reviewer` | 即使没问 |
| 扫代码里的静默失败 / 吞掉的异常 | `silent-failure-hunter` | code-reviewer 通过后补一刀 |
| 慢 / 延迟高 / bundle 大 / Core Web Vitals | `performance-engineer` | 主动，不等 |
| DB 查询慢 / N+1 / schema 设计 | `database-optimizer` | |
| 架构决策 / 服务边界 / 技术栈选型 | `backend-architect` | |
| LLM / RAG / Agent 编排 | `ai-engineer` | |
| Prompt 优化 | `prompt-engineer` | |
| 向量 DB / embedding | `vector-database-engineer` | |
| React / Next.js / 前端 UI | `frontend-developer` | |
| FastAPI 高性能 | `fastapi-pro` | |
| Python 实现 | `python-pro` | |
| TS 类型系统 / 泛型 / decorator | `typescript-pro` | |
| JS 异步 / Promise / event loop | `javascript-pro` | |
| 补测试到 80% 覆盖 | `test-automator` | |
| 死代码 / 重复 / 重构清理 | `refactor-cleaner` | |
| 在写代码前扫现有模式 | `code-explorer` | 只读探索 |

---

## B · 场景 → Skill 激活速查 {#b}

遇到下列关键词 / 场景，**主动激活**对应 skill（不等用户说"帮我用 xxx skill"）：

| 场景 | Skill |
|---|---|
| 开工前心里没底 / "我真的要这么做吗" | `confidence-check`（5 维度 ≥90% 才动手） |
| 要写新 feature / 修 bug | `tdd-workflow`（先写失败测试） |
| 交付前 / 合并前 / "验证一下" | `verification-loop`（6 阶段 gate） |
| 做架构决策 / 技术选型落盘 | `architecture-decision-records`（产出 ADR） |
| 方向分歧 / 两方案选不出 | `party-mode`（并行 4 视角辩论） |
| 审代码 / 收 review 反馈 | `code-review-workflow`（两端） |
| 修完 bug / 完成 refactor 后 | `continuous-learning-v2`（沉淀 learned skill） |
| 用户说"建个 skill / 提炼约定" | `writing-skills` |
| 多独立问题并行处理 | `dispatching-parallel-agents` |
| 写 E2E 测试 / Playwright | `e2e-testing` |
| 开始新 feature 需隔离开发 | `using-git-worktrees` |
| 分支做完要合入 | `finishing-a-development-branch` |
| 执行已有 plan 的 task 链 | `subagent-driven-development` |
| 写代码前做产品验证 | `product-lens` |
| 用户问"我在哪 / 下一步" | `help`（纯用户导航） |
| **用户说"我刚 clone / 不熟这个项目 / 怎么接手 / 从哪开始"**（已有项目） | **`/onboard` 命令 + `project-onboarding` skill**（4 阶段深度接手） |
| 大项目（>1k 文件）反复操作想省 token | `/index-repo` 命令（PROJECT_INDEX，2K 投入省 50K/session） |
| 全新空项目 / 想要轻量 CLAUDE.md | `/init` 命令（轻量模式，已有项目会建议改用 /onboard） |
| 涉及证据驱动 | `confidence-check` skill（5 维度评估） |
| 涉及 SOLID / 代码风格 | `coding-standards` skill（Python + TS 带示例） |
| 涉及架构取舍 / 可逆性 | `architecture-decision-records` skill（产出 ADR） |
| 涉及风险管理 | `planner` agent 的 Risks & Mitigations 段 + `security-reviewer` agent |
| 写/改代码时想找规范示例 | `coding-standards`（Python + TS 示例） |

---

## C · 并行决策（Q1-Q4） {#c}

每次接手任务第 1 秒自问：

1. **Q1** 能拆 2+ 独立子任务？ → fan-out 并行（同一条 message 多个 Task call）
2. **Q2** 多视角给不同答案？ → `party-mode` 辩论
3. **Q3** 有时序依赖？ → 接力（A→B→C，每步主 session 整合）
4. **Q4** 任务很小？ → 直接做，不派 agent

**3 种最常用并行组合**（熟记）：

- **代码审查** → `code-reviewer` + `security-reviewer` 并行（大改动加 `silent-failure-hunter` + `performance-engineer`）
- **Bug 盲诊** → `debugger` + `performance-engineer` 并行（涉数据加 `database-optimizer`）
- **架构规划** → `planner` + 栈相关 domain agent 并行（后端 / 前端 / AI 按栈选）

完整 10+ 场景组合 + 4 种协作模式 + 合流 4 动作 + 成本控制 → `dispatching-parallel-agents` skill。

---

## D · 任务规模 → 流程深度 {#d}

- **小改动**（<30 行 / typo / 文案）：**直接做**，不启流程。别 confidence-check、别 TDD、别 review——否则"一件小事连串调 skill"。
- **中等单元**（一组件 / 一 endpoint / 一算法）：**TDD + review** 就够（tdd-workflow → 实现 → code-review-workflow）。
- **较大单元**（完整页面 / 子系统 / PR 改 10+ 文件）：**完整流程**：confidence-check → /plan → /implement（带 subagent-driven-development）→ /review → verification-loop → /pr。

---

## 并行派发必须可视化（v1.9 新增 · 让用户看到真并行）

每次并行派 2+ agent 时，**assistant message 必须输出以下可视化格式**，然后紧跟 Task tool call：

**派发前**：
```
⚡ 并行派发 N agent（fan-out / 预计 ~X min）
   ├─ agent1  用途一句话
   ├─ agent2  用途一句话
   └─ agent3  用途一句话
```

**返回后合流**：
```
✓ N agent 全部返回（耗时 X.X min）
   ├─ agent1  X.X min → N findings
   └─ ...

合流整合：
  CRITICAL (n): ...
  HIGH (n): ...
```

完整模板 + 理由见 `dispatching-parallel-agents` skill 的"派发可视化模板"章节。

**禁止**：不说就派（用户看不到并行证据，怀疑"你是不是只派了 1 个"）。

---

## 禁止

- ❌ 等用户敲 slash 命令才激活能力（用户不知道你有什么）
- ❌ 一件小事连串调 skill（改 typo 不要先 confidence-check）
- ❌ 忽略 agent 直接在会话里硬写（上下文污染，丢失 subagent 隔离优势）
- ❌ 多 agent 并行时把某 agent 的 full report 直接贴给用户（主 session 做摘要）
- ❌ 并行派发不加可视化文本（见上节）

## 底线

**MCC 的执行哲学：用户少敲，Claude 多主动**。本 playbook 是这个哲学的具体落地手册，遇不确定时查它。

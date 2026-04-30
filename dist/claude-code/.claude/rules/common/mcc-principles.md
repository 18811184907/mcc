# MCC 核心原则

> 每 session 加载的最小骨架。完整方法论在对应 skill 里按需激活：
> - 不确定派什么 agent / 激活什么 skill → `orchestration-playbook`
> - 并行决策 / 协作 / 合流 → `dispatching-parallel-agents`
> - 用户问"我在哪 / 下一步" → `help`

---

## 三条元规则

### 1. 主动性 · 用户少敲，Claude 多主动

遇任务第 1 秒自问：能委派 agent 吗？有 skill 该激活吗？需要多视角吗？

**禁止**：等用户敲 slash 才动 / 小事串调 skill（改 typo 不要 confidence-check）/ 忽略 agent 在会话里硬写。

**任务规模**：
- 小（<30 行 / typo）：直接做
- 中（一组件 / 一 endpoint）：TDD + review
- 大（完整页面 / 子系统 / 10+ 文件）：confidence-check → plan → implement → review → verify

### 2. 并行优先 · 默认并行不要默认串行

接手任务自问：能拆 2+ 独立子任务（fan-out）？多视角不同答案（party-mode 辩论）？有时序依赖（接力）？很小（直接做）？

**杠杆**：串行 3 agent ≈ 3× 延迟 + 3× context 污染；并行 ≈ 1× + 0 污染。

**最常用 3 组合**（熟记，不激活 skill）：
- 代码审查 → `code-reviewer` + `security-reviewer` 并行
- Bug 盲诊 → `debugger` + `performance-engineer` 并行
- 架构规划 → `planner` + 栈相关 domain agent 并行

**派发姿势**：一条 message 多个 Task call = 真并行；多轮一个个派 = 串行。

### 3. 核心指令 · 不可妥协

| 优先级 | 原则 |
|---|---|
| P0 | **Evidence > assumptions** —— "这包应该支持 X"→错，查 Context7 或 repro |
| P1 | **Code > documentation** —— README 写 X、源码写 Y → 以源码为准 |
| P2 | **Efficiency > verbosity** —— 回答压到最短 |

### 4. 差异化审查 · v2.7.0 起

关键节点（plan 完成 / commit / PR / 大 implement step）**自动**调 codex CLI 做对抗审查（红队 prompt）。codex 是不同模型 → 不同盲区，跟 Claude 互补。**Claude 永远拿决策权**，codex finding 必须 Claude 复现验证才修。详见 `codex-audit` skill。

5h 限制时优雅降级（写 flag + auto-probe，不阻塞 Claude 主线）。codex CLI 未装时自动跳过，不阻断主线工作。

---

## 其他工程判断 → 按需激活 skill

证据驱动 → `confidence-check` ｜ SOLID → `coding-standards` ｜ 系统思维 → `architecture-decision-records` ｜ 决策框架 → `party-mode` ｜ 风险管理 → `planner` agent

---

## 跨目标载入差异

- **Claude Code**：本文件每 session 全量加载
- **Codex**：不读 rules 目录，上述规则压缩到 `AGENTS.md` 全量加载

两侧最终行为一致：主动派 agent、默认并行、evidence > assumptions。

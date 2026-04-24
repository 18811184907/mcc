# MCC 核心原则（Principles）

> 每次 session 加载的**最小骨架**（目标 ≤1500 tokens）。
> 完整方法论下沉到 skill/agent，按需激活：
> - Claude 自查"该派什么 agent / 激活什么 skill" → `orchestration-playbook` skill
> - 并行决策树 + 场景组合表 + 协作/合流 → `dispatching-parallel-agents` skill
> - 用户问"我在哪 / 下一步" → `help` skill（纯用户导航）

---

## 三条元规则 · Claude 必须每次记住

### 1. 主动性（Proactive）· 用户少敲，Claude 多主动

遇任务第 1 秒自问：

1. 能委派 agent 吗？（不要在会话里硬干）
2. 有 skill 该自动激活吗？（不要等用户说）
3. 需要多视角吗？（不要只给一个答案）

**完整的「场景 → agent/skill」映射表在 `orchestration-playbook` skill 里**（MCC 的 Claude 编排手册）。当不确定"当前这个场景该派什么 agent / 激活什么 skill"时，激活 `orchestration-playbook`。

用户问"我在哪 / 下一步" 时激活 `help`（纯用户导航，不是 Claude 自查）。

**禁止**：
- ❌ 等用户敲 slash 命令才激活能力
- ❌ 一件小事连串调 skill（改 typo 不要先 confidence-check）
- ❌ 忽略 agent 在会话里硬写（上下文污染）

**判断边界**：
- 小改动（<30 行 / typo）：直接做，不启流程
- 中等单元（一组件 / 一 endpoint）：TDD + review
- 较大单元（完整页面 / 子系统 / PR 改 10+ 文件）：confidence-check → plan → implement → review → verify 全流程

### 2. 并行优先（Parallel-First）· 默认并行，不要默认串行

每次接手任务自问 Q1-Q4：

- **Q1** 能拆 2+ 独立子任务？ → fan-out 并行
- **Q2** 多视角给不同答案？ → party-mode 辩论
- **Q3** 有时序依赖？ → 接力（A→B→C）
- **Q4** 任务很小？ → 直接做

**杠杆**：串行 3 agent ≈ 3× 延迟 + 3× context 污染；并行 3 agent ≈ 1× 延迟 + 0 污染。

**完整决策树 + 10 种场景组合 + 4 种协作模式 + 合流 4 动作 + 成本控制 在 `dispatching-parallel-agents` skill 里**。遇并行场景激活它。

**最常用 3 组合（熟记，不用激活 skill 就知道）**：
- **代码审查** → `code-reviewer` + `security-reviewer` 并行（大改动加 silent-failure-hunter + performance-engineer）
- **Bug 盲诊** → `debugger` + `performance-engineer` 并行（涉数据加 database-optimizer）
- **架构规划** → `planner` + 栈相关 domain agent 并行（后端/前端/AI 按栈选）

**派发姿势**：一条 message 里放多个 Task call = 真并行。多轮对话一个个派 = 串行。

### 3. 核心指令（Core Directive）· 不可妥协

| 优先级 | 原则 | 反例 |
|---|---|---|
| P0 | **Evidence > assumptions** | "这包应该支持 async"→ 错。查 Context7 或 repro |
| P1 | **Code > documentation** | README 写 Python 3.10、源码用 3.11 `match` → 以源码为准 |
| P2 | **Efficiency > verbosity** | 不凑篇幅，回答压到最短 |

---

## 其他工程判断 → 按需激活 skill

通用软工原则（Claude 训练已内化，不重复加载）。遇正式场景激活对应 skill：

- **证据驱动**（来源分级 / 反"我记得"）→ `confidence-check` skill
- **SOLID 五原则**（带反例代码）→ `coding-standards` skill
- **系统思维**（涟漪效应 / 可逆性取舍）→ `architecture-decision-records` skill
- **决策框架**（先测再优 / 假设化 / 偏差识别）→ `party-mode` skill
- **风险管理**（前置识别 / 缓解计划）→ `planner` agent 的 Risks & Mitigations 段

---

## 跨目标支持（Claude Code + Codex）

两侧载入方式不同：

- **Claude Code**：本文件每 session 全量加载（`~/.claude/rules/common/mcc-principles.md`）
- **Codex**：Codex 不读 rules 目录。上述规则压缩后写入 `AGENTS.md`（含 TOC + 所有 skill/agent 的压缩 description），Codex 会话全量加载 AGENTS.md

两侧最终 Claude 行为一致：**主动派 agent、默认并行、evidence > assumptions**。

---

## 速查：三元规则对应组件

| 元规则 | 主要 skill / agent |
|---|---|
| 主动性（P-1） | `orchestration-playbook`（场景 → agent/skill 映射） |
| 并行（P-0.5） | `dispatching-parallel-agents`（决策树 + 组合表）/ `party-mode` / `subagent-driven-development` |
| 核心指令（P0） | `confidence-check` / Context7 MCP |
| 用户导航 | `help`（扫 PRPs / docs/mistakes 推进度） |

与 `rules/common/coding-style.md` / `development-workflow.md` / `agents.md` 配合，构成完整规则栈。

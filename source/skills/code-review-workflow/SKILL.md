---
name: code-review-workflow
description: "代码审查完整流程（两端）：Part 1 派发 reviewer、Part 2 收反馈的反应模式。触发：写完 >50 行改动后主动激活 Part 1；用户贴 review 意见问怎么回激活 Part 2。与 verification-loop 分工：本 skill 做**架构/需求合规性**判断；verification-loop 做**技术闸门**（build/test 跑得过）。/review 命令是本 skill 的显式入口。"
---

# Code Review Workflow（代码审查两端合一）

一个 skill 覆盖"发起 review"（Part 1）+"收到 review 怎么回"（Part 2）两端。两端都是为了**外部视角不被会话历史污染**。

**核心原则：**
1. 早审、常审（别攒到合并前）
2. 派 subagent 审，不在自己会话里审（避免自我迁就）
3. 收反馈：先验证、不表演、不盲从

---

## 自动激活时机

| Part | 时机 |
|---|---|
| **Part 1 · 发起** | Claude 刚完成较大单元（>50 行）/ 用户说"帮我审 / review / 看看对不对" / 合并 main 前 / 卡壳换视角 |
| **Part 2 · 收反馈** | 用户贴 review 意见进来 / PR 有 comment 需处理 / 外部 subagent reviewer 返回结论 |

---

# Part 1 · 发起 Review

派发 `code-reviewer` subagent 在问题扩散前抓住它。Reviewer 收到**精心构造的上下文**，不继承你的会话历史，避免迁就。

## 如何请求

**1. 拿 git SHA：**
```bash
BASE_SHA=$(git rev-parse HEAD~1)   # 或 origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

**2. 派发 code-reviewer：**

用 Task tool spawn **MCC 的 `code-reviewer` agent**，prompt 模板包含：
- `{WHAT_WAS_IMPLEMENTED}` — 你刚做了什么
- `{PLAN_OR_REQUIREMENTS}` — 它**应该**做什么
- `{BASE_SHA}` / `{HEAD_SHA}` — 起止 commit
- **不要**把会话历史贴给 reviewer

**3. 安全触发：**
审查认证 / 加密 / 用户输入 / 数据库查询 / 外部 API → 同步派 `security-reviewer`

**4. 并行：** 如果审查范围大，可用 `dispatching-parallel-agents` skill 同时派 code-reviewer + security-reviewer + silent-failure-hunter。

---

# Part 2 · 收到 Review 反馈

**铁律：先验证 → 再实施。先问 → 再假设。技术正确性 > 社交舒适。**

## 反应模式

```
收到反馈时：
1. READ      完整读完，不反应
2. UNDERSTAND 用自己的话复述要求（或提问）
3. VERIFY    对照代码库核实
4. EVALUATE  对**这个**代码库技术上合理吗
5. RESPOND   技术承接，或有理由的反驳
6. IMPLEMENT 一次一项，逐项测试
```

## 禁用回应

**永远不说：**
- "你完全正确！"
- "好观点！"
- "我马上实施"（在验证之前）
- 任何"谢谢"表达

**改为：**
- 复述技术要求
- 提澄清问题
- 有理由就用技术推理反驳
- 直接改代码（代码自己说话）

## 反馈不清楚

```
IF 任何一项不清楚:
  STOP —— 什么都还不要实施
  对不清楚的项请求澄清
```

**举例：**
```
人类："修第 1-6 项"
你懂 1/2/3/6，4/5 不懂
❌ 先改 1/2/3/6，回头再问 4/5
✅ "明白 1/2/3/6。动手前需要 4、5 澄清。"
```

## 按反馈来源区分

**来自人类合作者：** 可信 → 理解后直接实施；范围不清**仍要问**；**不表演同意**。

**来自外部审阅者（PR comment / subagent reviewer）：**
```
实施前检查：
1. 对**这个**代码库技术上对吗？
2. 会破坏现有功能吗？
3. 当前实现这样写有原因吗？
4. 在所有平台/版本上都管用吗？
5. 审阅者理解完整上下文吗？

IF 建议似乎有错 → 技术推理反驳
IF 自己难以验证 → 明说"我没法验证 [X]"
IF 与人类先前决定冲突 → 先和人类确认
```

**原则：外部反馈 = 保持怀疑，但仔细核查。**

## YAGNI 检查"专业化"建议

```
IF 审阅者建议"按专业标准实现":
  grep 代码库看实际用法
  IF 没用到: "这个 endpoint 没人调。移除（YAGNI）？"
  IF 用到了: 那就按专业标准实现
```

## 何时反驳

合理反驳情形：
- 建议会破坏现有功能
- 审阅者缺完整上下文
- 违反 YAGNI（加一个没人用的 feature）
- 对当前技术栈技术上不对
- 有 legacy / 兼容原因
- 与人类先前架构决定冲突

**怎么反驳：**
- 技术推理，不防御
- 问具体问题
- 引用能工作的测试/代码
- 涉及架构就把人类卷进来

## 承接**正确**反馈

```
✅ "已修。[简述改了什么]"
✅ "抓得准 — [具体问题]。已在 [位置] 修。"
✅ [直接改代码，代码自己说话]

❌ "你完全正确！"
❌ "好观点！"
❌ 任何感激表达
```

**为什么不说谢：** 行动 > 语言。直接改。代码本身说明听进去了。

**发现自己要写"谢谢"时：** 删掉，改成"已修"。

## 纠正自己错误反驳

反驳了但其实你错了：
```
✅ "你是对的 — 我核查了 [X]，确实 [Y]。正在实施。"
✅ "核实后你观点正确。我之前理解错了因为 [原因]。在修。"

❌ 长篇道歉
❌ 为反驳辩护
```

## 常见错误

| 错误 | 修正 |
|---|---|
| 表演同意 | 复述要求或直接行动 |
| 盲目实施 | 先对照代码库验证 |
| 批量改不测 | 一次一项，逐项测 |
| 假定审阅者对 | 先看会不会弄坏东西 |
| 不敢反驳 | 技术正确 > 舒适 |
| 部分实施 | 先澄清**全部** |

## GitHub 内联评论回复

对 PR 行内 comment 回复要走评论串：
```bash
gh api repos/{owner}/{repo}/pulls/{pr}/comments/{id}/replies
```
不要做 PR 顶层评论。

---

## 与 MCC 生态的配合

- **涉及具体 bug**：派 `debugger` agent 查根因，不自己瞎猜
- **涉及安全**（认证/加密/SQL/XSS）：转 `security-reviewer` agent 复核
- **涉及性能**：转 `performance-engineer` agent 确认瓶颈
- **大范围审查**：用 `dispatching-parallel-agents` skill 同时派多个 reviewer
- **subagent-driven-development**：那个 skill 的每 task 结束点会调用本 skill 的 Part 1

## 底线

外部反馈 = 要评估的建议，不是要执行的命令。

验证 → 质疑 → 再实施。不表演同意。始终技术严谨。

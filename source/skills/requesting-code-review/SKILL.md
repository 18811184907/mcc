---
name: requesting-code-review
description: "派 code-reviewer subagent 审代码（用精确构造的上下文，不继承会话历史）。完成任务、合并前、卡壳时触发。"
---

# Requesting Code Review

派发 `code-reviewer` subagent 在问题扩散之前抓住它。Reviewer 收到的是**精心构造的上下文**——绝不是你会话的历史。这样可以让 reviewer 聚焦在**工作产物**而不是你的思考过程，也保留你自己的 context 给后续工作。

**核心原则：** 早审、常审。

## 何时请求 review

**强制：**
- `subagent-driven-development` 里每个 task 结束后
- 重要 feature 完成后
- 合入 main 前

**可选但有价值：**
- 卡住时（换个视角）
- 重构前（打 baseline）
- 复杂 bug 修好后

## 如何请求

**1. 拿到 git SHA：**
```bash
BASE_SHA=$(git rev-parse HEAD~1)   # 或 origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

**2. 派发 code-reviewer subagent：**

用 Task tool 直接 spawn **MCC 的 `code-reviewer` agent**（MCC 已装），prompt 填 `code-reviewer.md` 模板。

**占位符：**
- `{WHAT_WAS_IMPLEMENTED}` —— 你刚做了什么
- `{PLAN_OR_REQUIREMENTS}` —— 它**应该**做什么
- `{BASE_SHA}` —— 起始 commit
- `{HEAD_SHA}` —— 结束 commit
- `{DESCRIPTION}` —— 简要说明

**3. 按反馈行动：**
- Critical 问题立刻修
- Important 问题继续之前修
- Minor 问题记下稍后处理
- 反对方错了就技术性反驳（基于推理，不是情绪）

## Example

```
[刚完成 Task 2: 加 verification 函数]

You: 继续之前请求代码审查。

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[Dispatch code-reviewer subagent]
  WHAT_WAS_IMPLEMENTED: Verification and repair functions for conversation index
  PLAN_OR_REQUIREMENTS: Task 2 from .claude/PRPs/plans/deployment-plan.md
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661
  DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types

[Subagent returns]:
  Strengths: Clean architecture, real tests
  Issues:
    Important: Missing progress indicators
    Minor: Magic number (100) for reporting interval
  Assessment: Ready to proceed

You: [Fix progress indicators]
[Continue to Task 3]
```

## 与各 workflow 的集成

**Subagent-Driven Development：**
- 每个 task 后审一次
- 问题在累积前就抓住
- 下一 task 之前修掉

**执行 plan：**
- 每个 batch（3 个 task）后审一次
- 拿反馈，改，继续

**Ad-Hoc 开发：**
- 合并前审
- 卡住时审

## 红旗

**永远不要：**
- 因为"很简单"就跳过审查
- 忽略 Critical 问题
- 带着未修的 Important 问题继续
- 对合理的技术反馈硬犟

**Reviewer 错了：**
- 用技术推理反驳
- 给出能证明的代码/测试
- 请求澄清

## 与 MCC 生态的配合

- **直接派 `code-reviewer` agent**（MCC 已装）—— Task tool 的 subagent_type 设为 `code-reviewer`，不需要再写 prompt persona
- `code-reviewer.md`（本目录）—— 评审的职责模板，填入具体占位符后作为 prompt
- 安全敏感区（auth / payment / 用户数据）额外派 `security-reviewer` agent
- Python / Go / Rust / TypeScript 等语言特化需要时派对应的 `*-reviewer` agent（如果项目里装了）
- 与 `receiving-code-review` 成对：本 skill 负责"发出请求"，那个 skill 负责"接收反馈"
- `/code-review`、`/review-pr`（如果项目装了）可以作为命令层快捷入口，底层还是派 `code-reviewer`

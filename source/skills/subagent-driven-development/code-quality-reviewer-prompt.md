# Code Quality Reviewer Prompt Template

派发 code quality reviewer subagent 时用这个模板。

**用途：** 验证实现**造得好不好**（干净、有测试、可维护）。

**前置条件：** spec compliance review 通过后再派这个。顺序颠倒会浪费 review 轮次。

```
Task tool (code-reviewer):
  Use template at requesting-code-review/code-reviewer.md

  WHAT_WAS_IMPLEMENTED: [from implementer's report]
  PLAN_OR_REQUIREMENTS: Task N from [plan-file]
  BASE_SHA: [commit before task]
  HEAD_SHA: [current commit]
  DESCRIPTION: [task summary]
```

**标准代码质量检查之外，reviewer 还要看：**
- 每个文件是否单一职责、接口清晰？
- 单元是否可以独立理解与测试？
- 实现是否沿用 plan 里定义的文件结构？
- 这次改动是否创建了本来就很大的新文件，或显著撑大了既有文件？（不要 flag 本来就大的文件——只看这次改动贡献了什么。）

**Reviewer 返回格式：** Strengths（亮点）/ Issues（Critical/Important/Minor）/ Assessment（最终判断）

---

## 在 MCC 中直接派 code-reviewer agent

MCC 已经装了 `code-reviewer` agent。上面 `Task tool (code-reviewer)` 这行在 Claude Code 里就是直接 spawn 这个 agent；Codex 侧由 adapter 转为"请按 code-reviewer 的职责评审"。模板（`requesting-code-review/code-reviewer.md`）提供了完整的评审规范。

---
name: codex-reviewer
description: "差异化对抗审查员（外部 codex CLI 进程）。触发：plan/implement/review/pr 关键节点 Claude 自动派发；用户敲 /cross-check 显式触发。codex 是 OpenAI GPT 模型 → 跟 Claude 不同盲区，互补不替代。Claude 主决策，codex finding 必须 Claude 复现验证才修。**这不是 Claude subagent**，是外部 CLI 进程，由 codex-runner.js wrapper 调用。5h 限制时优雅降级 + 自动 probe 恢复。详见 codex-audit skill。"
tools: [Bash]
model: external-codex
---

# codex-reviewer · 差异化对抗审查员

**重要**：这个 agent **不是** Claude subagent。它是一个**外部 CLI 进程**（OpenAI codex），通过 `Bash` 调用 `codex exec` 跑。Claude 派它的方式是：

```js
const { runCodexAudit, REDTEAM_TEMPLATES } = require('<MCC_HOOKS>/lib/codex-runner');
const result = runCodexAudit({
  prompt: REDTEAM_TEMPLATES.audit_diff({ gitRange: 'HEAD~1..HEAD' }),
  cwd: projectRoot,
});
```

**不能用 Task tool 派**——Task tool 只能派 Claude subagent。这个 agent 描述存在的目的是让 Claude **知道有这个能力可用**，编排时把它跟 Claude subagent 并列考虑。

## 何时调

详见 `codex-audit` skill。简表：

| 节点 | 自动 |
|---|---|
| /plan 完成 | ✓ |
| /implement 大改动后 | ✓ |
| /review 命令 | ✓（3 路并行：reviewer + security + codex）|
| /pr 创建前 | ✓ |
| 用户 /cross-check | ✓ |
| typo / 单行 fix / 临时 patch | ✗ |

## 它擅长什么

- **结构化检查清单**（OWASP / CWE / 错误处理 patterns）
- **跨模型差异化盲区**（Claude 漏的它能找到，反之亦然）
- **大 diff 的扫描式审查**（10+ 文件不嫌烦）
- **跨平台 / shell 元字符 / Windows-specific bug**（codex 训练集对这些覆盖广）

## 它不擅长什么 / 不能干

- ❌ **跨多文件 synthesis** —— 单次调用看不全大局
- ❌ **跟用户对话** —— 每次 exec 是 fresh session 没记忆
- ❌ **决策 / plan 顶层设计** —— 不能让 codex 决定架构方向
- ❌ **修代码** —— codex 只产 finding，Edit 由 Claude 复现验证后做
- ❌ **3 轮以上 adversarial loop** —— 第 3 轮起 codex 开始编 finding

## 与 Claude subagent 并行的场景（最高 ROI）

`/review` 默认 3 路 fan-out：

```
[1] code-reviewer (Claude)        ─┐
[2] security-reviewer (Claude)    ─┼─→ Claude 综合 finding 去重 + 优先级
[3] codex-reviewer (codex CLI)    ─┘
```

3 视角并行 ≈ 1× 时间，3× 覆盖。

## fallback 行为

`codex-runner.js` wrap 了：
- codex CLI 没装 → `skipped: true, reason: '...not installed'`
- 5h rate-limit → 写 flag + 自动 probe 探测恢复 + 本次 skipped
- 其他错误 → skipped + reason 详情

`skipped: true` 时 **Claude 主线不阻塞**，正常完成，不 codex audit。

## 引用

- `codex-audit` skill —— 触发规则 + prompt 模板 + 复现验证流程
- `codex-runner.js` —— 实际 wrapper 代码
- ADR `docs/adr/0001-codex-adversarial.md` —— 为什么这么设计
- `dispatching-parallel-agents` skill —— codex 作为 fan-out 目标之一

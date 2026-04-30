---
name: codex-audit
description: "Claude 主动用 codex CLI 做差异化对抗审查（red-team 视角）。触发：(a) /plan 完成自动审 plan 找盲区；(b) /review 默认 3 路并行（Claude reviewer + security + codex）；(c) /pr 创建前自动审 diff；(d) /implement 大改动后自动审实施。codex 是不同模型 → 不同盲区，跟 Claude 互补不替代。**Claude 主决策，codex finding 必须 Claude 复现验证才修**。5h 限制时优雅降级（写 flag + auto-probe 探测恢复，不阻塞主线）。**全自动 — 用户从不需要手动调 codex**。"
---

# codex-audit · 差异化对抗审查 skill

**核心原则**：codex（OpenAI 模型）和 Claude（Anthropic 模型）训练数据 + 推理偏好不同 → 同一段代码看到的 bug 不重叠 → 合并起来覆盖更全。**已实证**：v2.6.4 时 codex 抓出 Claude 8 个 agent 全漏的 4 个真 bug。

**Level**：当前是 Level 1 红队（red-team prompt 风格）。Level 2/3（two-pass debate / disagree-by-design）留 v2.8+ 评估。

## 何时自动触发（Claude 不问，直接派）

| 节点 | 触发 | 红队模板 |
|---|---|---|
| `/plan` Phase 6 完成 | **自动** | `audit_plan` |
| `/implement` 单 step 完成且改动 > 50 行或跨文件 | **自动** | `audit_implementation` |
| `/review` 命令调用 | **自动 3 路并行** | `audit_pr` (与 code-reviewer + security-reviewer 并行) |
| `/pr` 创建前 | **自动** | `audit_pr` |
| 用户敲 `/cross-check` | 显式 | 按参数选模板 |
| 重大 commit 前（用户说"上线 / 部署"等关键词）| **自动** | `audit_diff` |

**不触发**：
- 改 typo / 改注释 / 单行 fix（杀鸡用牛刀）
- 用户说"快速 patch / 临时改 / 试一下"
- 用户已经在多轮 codex audit 后第 3 轮（避免 codex 编 finding）

## 如何调用（Claude 内部）

```js
// Claude 在 hook / skill / command 里 require:
const { runCodexAudit, REDTEAM_TEMPLATES } = require('<MCC_HOOKS>/lib/codex-runner');

const prompt = REDTEAM_TEMPLATES.audit_diff({ gitRange: 'HEAD~1..HEAD' });
const result = runCodexAudit({
  prompt,
  cwd: projectRoot,
  timeoutMs: 90_000,
});

if (result.skipped) {
  // 优雅降级：codex 不可用（未装 / rate-limit / 错误）
  // 不阻塞主线，正常完成 Claude 这边的工作
  process.stderr.write(`[codex-audit] skipped: ${result.reason}\n`);
  return;
}

// 收 codex finding，进入"Claude 复现验证"流程（下方）
processCodexFindings(result.output);
```

## Claude 复现验证规则（**必走，不可跳**）

codex finding 来了之后 Claude **永远不直接修**，先做 3 件事：

```
对每个 codex finding:
  1. 实测复现:
     - 文件存在？(Read 验证)
     - 行号对得上？(grep 验证)
     - 攻击 input 真能触发？(必要时跑代码验证)
     - 已经被别处覆盖了？(grep 已有防御)
  
  2. 三档分类:
     ✓ 真 bug   → 修 + 在 commit message 标 "(codex audit found this)"
     ✗ 误报    → 写 reason 到 docs/adr/ 或 docs/mistakes/
                  ("codex thought X, but Y because Z")
     ? 模糊    → 升给用户拍板（不擅自决定）
  
  3. 决不盲信:
     - codex 误报率不低（30%-50%）
     - 同样的 issue Claude reviewer + security-reviewer 也报过 → 高置信
     - 只有 codex 一方报 → 必须复现才修
```

**反模式**：
- ❌ codex 说有 bug → 直接 Edit 修 → 实际是误报 → 把好代码改坏了
- ❌ codex 找到 finding → Claude 在不复现的情况下"以防万一"加防御 → 代码膨胀
- ❌ Adversarial loop > 2 轮（第 3 轮起 codex 开始编 finding）

## 红队 prompt 模板（在 codex-runner.js 里）

```js
REDTEAM_TEMPLATES = {
  audit_plan,           // 审 PRP plan 找盲区
  audit_diff,           // 审 git diff 找 bug
  audit_implementation, // 审单文件实施
  audit_pr,             // 审 PR / commit 综合（4 维度）
};
```

每个模板都强制 codex 走**红队视角**：
- "你是渗透测试员 / staff engineer / 攻击者..."
- "禁止写'代码看起来没问题' — 必须给至少 1 个 finding"
- "如果认为修复彻底，用反证：构造能突破防御的 input"
- "禁止给抽象建议（'应该加错误处理'），必须具体到哪行哪个分支"

这是 Level 1 对抗的核心——**强迫 codex 主动找问题**，而不是友好地"reviewing"。

## 5h 限制 + 自动恢复（codex-runner.js 实现）

```
首次调用:
  → 直跑 codex
  → 如果 stderr 含 rate-limit 关键字 → 写 ~/.claude/.codex-blocked-until
    {
      blocked_at, blocked_until (now + 1h),
      last_probe_at, probe_attempts: 0
    }
  → 本次 skipped, 不阻塞主线

后续调用:
  → 读 flag
  → 如果到 next_probe 时间（指数退避: 5/10/20/40/60min）:
     - 跑 minimal probe ("say ok")
     - 恢复 → 清 flag → 重试真任务
     - 仍 blocked → 更新 probe_attempts + last_probe_at
  → 如果未到 probe 时间 → skipped, 报"next probe in Nmin"
  → blocked_until 到了 (1h) → 自动清 flag

完全自动 — 用户从不手动管 flag。
```

## 主线不阻塞

codex audit **结果到达 ≠ 工作流推进点**。Claude 该干啥继续干啥：

```
错误做法:
  await codex_audit  ← Claude 主线 wait 30 秒
  read finding
  fix bug
  commit

正确做法:
  start codex_audit (Bash run_in_background: true)
  Claude 主线: write code / talk to user / next step
  codex 跑完 (10-30s 后)
  Claude 在合适时机吸收 finding，按"复现验证规则"处理
```

**例外**：`/pr` 创建前的 audit 是 **synchronous gate** — 因为 PR 创建是不可逆的，要 codex 通过才推。其他都 async。

## 与其他 skill / agent 的分工

| 对比对象 | 区别 |
|---|---|
| `code-reviewer` agent (Claude) | 同模型同盲区。codex 提供差异化视角 |
| `security-reviewer` agent (Claude) | 同上 |
| `silent-failure-hunter` agent | 专项静默失败，codex 跨多类问题。**两者并行最好** |
| `dispatching-parallel-agents` skill | codex 是其中一个**派发目标**（外部进程，跟 Claude subagent 并列） |
| `verification-loop` skill | verification 是机械闸门（build/test 跑得过），codex audit 是 LLM 判断 |
| `confidence-check` skill | confidence-check 是实施前自查，codex audit 是实施后他查 |

## 输出处理（Claude 收 codex finding 后）

codex 的 stdout 会有结构化 finding。Claude 解析处理:

```
为每条 finding:
  1. 提取 [Severity] file:line + 描述
  2. Read file:line 验证存在性
  3. grep / 跑代码 复现攻击向量
  4. 分类（真 bug / 误报 / 模糊）
  5. 真 bug → Edit 修 + 测试
  6. 误报 → 写到 docs/adr/NNNN-codex-rejection-{date}.md
            (含 codex 原 finding + Claude 反驳 reasoning)
  7. 模糊 → 升给用户

最后 Claude 给用户一份摘要:
  "codex 提了 N 条 finding:
   - 真 bug 修了 X 条 (commit ZZZ)
   - 误报 Y 条 (记到 docs/adr/...)
   - 模糊 Z 条，需要你拍板:
     - finding A: ...
     - finding B: ..."
```

## 用户视角 — 你需要做什么

**啥都不用做**。

Claude 在每个关键节点（plan / implement / review / pr 完成时）自动调 codex audit，自动复现验证，自动修真 bug，自动归档误报。

你只在两种情况会收到提示:
1. **codex 提了模糊 finding 等你拍板** — Claude 列出几条问"该修吗"
2. **codex 5h 限制中** — Claude 报"codex 暂不可用（next auto-probe in Xmin），主线继续"

其他时间 codex 隐性运行，你看到的就是 Claude **更稳的输出**。

## 引用

- `~/.mcc-install/source/hooks/scripts/lib/codex-runner.js` — runner 实现
- `~/.mcc-install/source/agents/codex-reviewer.md` — agent 角色描述（Claude 知道有这个 agent 可派）
- `dispatching-parallel-agents` skill — 并行派发模式
- `code-review-workflow` skill — 跟 reviewer + security-reviewer 三路并行（v2.7.0 起默认）
- ADR `docs/adr/0001-codex-adversarial.md` — 设计决策记录

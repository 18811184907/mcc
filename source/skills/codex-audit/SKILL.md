---
name: codex-audit
description: "Claude 用 codex CLI 做差异化对抗审查 + Layer 2 二审 + auto-fix 全链路。**v2.8.0 起流式 streaming**：codex 思考过程实时事件流（onEvent 回调每个 thread.started / item.completed / turn.completed），idle-timeout（90s 没新事件才算卡死）替代固定 totalTimeout。runCodexAudit 是 async，要 await。三层架构：Layer 1 codex (OpenAI) 流式产 finding → Layer 2 finding-validator subagent (Claude fresh) 独立复现 → Layer 3 通过自动 Edit 修不询问用户。触发：/plan 完成 / /implement 大改动 / /review 3 路并行 / /pr 4 路 PR 预检。codex 是不同模型 = 不同盲区，跟 Claude 互补不替代。**全自动 — 用户从不需要手动管 codex**。"
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

## 如何调用（Claude 内部，v2.8 streaming）

```js
// Claude 在 hook / skill / command 里 require:
const { runCodexAudit, REDTEAM_TEMPLATES } = require('<MCC_HOOKS>/lib/codex-runner');

const prompt = REDTEAM_TEMPLATES.audit_diff({ gitRange: 'HEAD~1..HEAD' });

// v2.8 是 async — 必须 await
const result = await runCodexAudit({
  prompt,
  cwd: projectRoot,
  idleTimeoutMs: 90_000,    // 没新事件 90s 当卡死
  totalTimeoutMs: 600_000,  // 绝对上限 10min
  onEvent: (ev) => {
    // 实时回调：thread.started / turn.started / item.completed / turn.completed
    if (ev.type === 'item.completed' && ev.item?.type === 'agent_message') {
      process.stderr.write(`[codex] message: ${ev.item.text.slice(0, 60)}...\n`);
    } else {
      process.stderr.write(`[codex] ${ev.type}\n`); // 心跳进度
    }
  },
});

if (result.skipped) {
  process.stderr.write(`[codex-audit] skipped: ${result.reason}\n`);
  return;
}

// result.output = 累积所有 agent_message 的 text（不含 reasoning / tool_call）
// result.events = 完整事件数组（debug 用）
// result.tokensUsed = total tokens (input + output)
// result.durationMs = 总耗时

processCodexFindings(result.output);
```

**关键设计**：
- **streaming**: 不再等终结才返回，事件实时到 onEvent
- **idle-timeout > total-timeout**: codex 思考 5 分钟没事但 90s 没动静就 idle 杀
- **stdin UTF-8**: prompt 通过 child.stdin.write(prompt, 'utf8') 走 pipe，绕过 Windows cmd codepage
- **JSONL parse**: 每行一个事件 JSON.parse，非 JSON 行（banner）忽略
- **agent_message only**: result.output 只累积 agent_message text，过滤掉 reasoning + tool_call

## v2.7.1 三层架构（Layer 1 → Layer 2 → Layer 3）

```
LAYER 1 · codex 提 finding (OpenAI)
  ↓ runCodexAudit() 返回 raw 文本
  ↓ parseFindings() 解析成 [{severity, file, line, summary, raw}]
LAYER 2 · finding-validator subagent (Claude fresh)
  ↓ 对每个 finding 派 fresh subagent 独立复现
  ↓ subagent 返回 verdict: confirmed / rejected / ambiguous
LAYER 3 · 主 Claude 自动决策
  ✓ confirmed   → 直接 Edit 修，**不询问用户**
  ✗ rejected    → 记 docs/adr/codex-rejection-{date}.md
  ? ambiguous   → 升给用户拍板（少数情况）
```

**关键安全约束**：Layer 2 严格判别——错给 confirmed 比错给 ambiguous 危害大（confirmed 等于授权 Layer 3 自动修）。validator agent prompt 写明"宁可 ambiguous 也不要错 confirmed"。

## Claude 主线工作流（编排 3 层）

收到 codex finding 后，Claude 按这个流程：

```js
// Phase 1: 拿 codex output (已经有，从 runCodexAudit)
const codexResult = runCodexAudit({...});
if (codexResult.skipped) return; // 优雅降级

// Phase 2: 解析成结构化 finding
const { parseFindings, sortBySeverity, summarize } = require('<MCC_HOOKS>/lib/finding-parser');
const findings = sortBySeverity(parseFindings(codexResult.output));
console.log(`[codex-audit] codex 提了 ${findings.length} 条 finding (${summarize(findings)})`);

// Phase 3: 对每个 finding 派 fresh subagent 二审（一次 message 多 Task call 真并行）
const validations = await Promise.all(findings.map(f =>
  Task({
    subagent_type: 'finding-validator',
    prompt: buildValidatorPrompt(f, gitRange, projectRoot),
  })
));

// Phase 4: 按 verdict 分流
const fixed = [];
const rejected = [];
const ambiguous = [];
for (let i = 0; i < findings.length; i++) {
  const f = findings[i];
  const v = parseVerdict(validations[i]); // verdict / reasoning / fix_guidance / user_question
  
  if (v.verdict === 'confirmed') {
    // Layer 3 自动 Edit 修，不问用户
    applyFix(f, v.fix_guidance);
    fixed.push({f, v});
  } else if (v.verdict === 'rejected') {
    appendToADR(f, v); // docs/adr/codex-rejection-YYYY-MM-DD.md
    rejected.push({f, v});
  } else {
    ambiguous.push({f, v});
  }
}

// Phase 5: 给用户摘要
report({
  total: findings.length,
  fixed: fixed.length,
  rejected: rejected.length,
  ambiguous, // 只有这部分需要用户回应
});
```

## Validator Subagent 派发模板

```js
function buildValidatorPrompt(finding, gitRange, projectRoot) {
  return `codex 提了一条 finding：
severity: ${finding.severity}
file: ${finding.file}
line: ${finding.line}
summary: ${finding.summary}
raw: ${finding.raw}

工作目录: ${projectRoot}
git range: ${gitRange}

任务：独立复现 + 给 verdict (confirmed / rejected / ambiguous)。
按 finding-validator agent 描述的输出格式严格遵守。
`;
}
```

## 反模式（必看）

- ❌ **跳过 Layer 2 直接修** → 把好代码改坏（v2.7.0 之前的设计就是这样）
- ❌ **Layer 2 用同 session Claude（带原对话 context）** → 不是真二审，等于自审
- ❌ **Layer 2 仅靠 LLM 判断不复现** → validator agent prompt 强制 Read/Grep/Bash 复现
- ❌ **Layer 3 confirmed 又问用户一次** → 用户烦，违反 v2.7.0 全自动原则
- ❌ **Adversarial loop > 2 轮**（第 3 轮起 codex 编 finding）—— 二审是 1 轮，不是迭代

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

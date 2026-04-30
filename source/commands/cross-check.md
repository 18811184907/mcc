---
description: "用 codex CLI 做差异化对抗审查（红队视角）。手动入口——其他场景（plan/implement/review/pr）已经自动跑过。$ARGUMENTS = plan|diff|impl|pr 之一。codex 未装 / 5h 限流时优雅降级提示用户。"
argument-hint: "[plan|diff|impl|pr] [<额外参数>]（默认 diff）"
---

# /cross-check · 差异化对抗审查（手动入口）

**Input**: `$ARGUMENTS`

## 何时用这个命令

99% 场景**不需要** —— `/plan`、`/implement`、`/review`、`/pr` 都已经在关键节点自动派 codex。

只在以下场景手动调：

| 场景 | 怎么用 |
|---|---|
| 想审刚改的本地 diff，但还没准备 PR | `/cross-check diff` |
| 想审某段历史 commit | `/cross-check diff HEAD~3..HEAD` |
| 想审某个 plan 文件（不是刚 /plan 完成的） | `/cross-check plan .claude/PRPs/plans/foo.plan.md` |
| 想审一个已经 push 的 PR | `/cross-check pr 42` |
| 单文件实施完审 | `/cross-check impl src/foo.ts "task spec text"` |

## 执行流程

```
1. 解析 $ARGUMENTS
   - 第一个 token 是 mode (plan/diff/impl/pr)，缺省 diff
   - 后续 token 是 mode-specific 参数

2. 检查 codex 可用性 (runCodexAudit 内部已处理)
   - 未装 → 报 "需要 npm install -g @openai/codex"
   - 5h 限流 + 未到 probe 时间 → 报"next probe in Xmin"
   - 都不是 → 跑

3. 选 prompt 模板
   - mode=plan  → REDTEAM_TEMPLATES.audit_plan({ planContent: 读 plan 文件 })
   - mode=diff  → REDTEAM_TEMPLATES.audit_diff({ gitRange })
   - mode=impl  → REDTEAM_TEMPLATES.audit_implementation({ filePath, taskSpec })
   - mode=pr    → REDTEAM_TEMPLATES.audit_pr({ prNumber, gitRange, summary })

4. 调 codex（同步等结果，因为用户主动触发希望即时看 finding）
   - timeoutMs: 90_000
   - run_in_background: false（手动模式不后台）

5. 处理 finding（按 codex-audit skill 复现验证规则）
   - Claude 不直接信 codex finding
   - 对每条 finding:
     - Read 文件复现存在性 / 行号
     - grep 验证攻击向量真触发
     - 三档分类（真 bug / 误报 / 模糊）
   - 真 bug → Claude 修 + 标 "(codex audit)" 在 commit message
   - 误报 → 记 docs/adr/codex-rejection-{YYYY-MM-DD}.md
   - 模糊 → 升给用户拍板

6. 摘要给用户
   "codex 提了 N 条 finding:
    - 真 bug 修了 X 条
    - 误报 Y 条 (记到 docs/adr/...)
    - 模糊 Z 条等你定:
       finding A: ...
       finding B: ..."
```

## 实施代码（Claude 内部）

```js
const fs = require('fs');
const { runCodexAudit, REDTEAM_TEMPLATES } = require('<MCC_HOOKS>/lib/codex-runner');

// 解析 mode + args
const tokens = ($ARGUMENTS || 'diff').trim().split(/\s+/);
const mode = tokens[0] || 'diff';
const restArgs = tokens.slice(1);

let prompt;
switch (mode) {
  case 'plan': {
    const planPath = restArgs[0] || prompt_user_for_plan_path();
    const planContent = fs.readFileSync(planPath, 'utf8');
    prompt = REDTEAM_TEMPLATES.audit_plan({ planContent, projectContext: getProjectName() });
    break;
  }
  case 'diff': {
    const gitRange = restArgs[0] || 'HEAD';
    prompt = REDTEAM_TEMPLATES.audit_diff({ gitRange });
    break;
  }
  case 'impl': {
    const [filePath, ...specParts] = restArgs;
    const taskSpec = specParts.join(' ') || '(spec 待 Claude 从 cwd 推断)';
    prompt = REDTEAM_TEMPLATES.audit_implementation({ filePath, taskSpec });
    break;
  }
  case 'pr': {
    const prNumber = restArgs[0] || '本地';
    const gitRange = restArgs[1] || 'origin/main..HEAD';
    prompt = REDTEAM_TEMPLATES.audit_pr({ prNumber, gitRange });
    break;
  }
  default:
    throw new Error(`unknown mode: ${mode}. Try: plan / diff / impl / pr`);
}

const result = runCodexAudit({
  prompt,
  cwd: process.cwd(),
  timeoutMs: 90_000,
});

if (result.skipped) {
  // 优雅降级：报 reason + 不阻塞
  console.log(`[cross-check] codex skipped: ${result.reason}`);
  return;
}

// 处理 finding（complex Claude 逻辑，按 codex-audit skill 复现验证规则）
processCodexFindings(result.output, mode);
```

## 跟其他命令的关系

- `/review` 已自动跑（3 路并行含 codex）—— 大多数情况用 `/review` 不用 `/cross-check`
- `/pr` 创建前已自动跑（4 路并行）—— 不需要再 `/cross-check pr`
- `/plan` 完成后已自动跑 —— 不需要再 `/cross-check plan` (除非审旧 plan)
- `/implement` 单 step 完成后大改动已自动跑 —— 不需要再 `/cross-check impl`

**这个命令存在的目的**：审古老的 plan / 审已经 push 的 PR / 审历史 commit / 用户单纯想再要一份 codex 视角。

## 引用

- `codex-audit` skill —— 完整规则（何时调 / 怎么调 / 处理冲突 / 复现验证）
- `codex-runner.js` —— 实际 wrapper
- `codex-reviewer` agent —— Claude 知道有这个 agent 的"角色卡"
- ADR `docs/adr/0001-codex-adversarial.md` —— 设计决策

---
description: "代码审查：本地未提交改动（无参数）OR GitHub PR（传 PR number/URL 走 PR 模式）。并行调用 code-reviewer + security-reviewer。"
argument-hint: "[PR# | PR URL]（留空则审本地未提交）"
---

# Code Review

**Input**: $ARGUMENTS

## 核心价值

对单点改动做深度审查——要么是本地未提交的改动，要么是一个 GitHub PR。**并行委派 `code-reviewer`（质量/架构）+ `security-reviewer`（安全）** 两个 agent，然后汇总给 CRITICAL/HIGH/MEDIUM/LOW 4 级 finding。

与 `mcc-full-review` prompt 的区别：本命令是单点，范围小、速度快；full-review 是模块或项目级全景审查。

---

## 模式选择

若 `$ARGUMENTS` 含 PR number / PR URL / `--pr`：
→ 跳到 **PR Review Mode**。

否则：
→ **Local Review Mode**。

---

## Local Review Mode

### Phase 1 — GATHER

```bash
git diff --name-only HEAD
```

若无变更文件，停："Nothing to review."

### Phase 2 — REVIEW（并行委派）

**一次回复里发两个 Task，并行运行**：

```
Task (parallel x2):
  agent 1: code-reviewer
    prompt:
      审查 git diff HEAD 的所有改动，重点：
      - Functions > 50 行
      - Files > 800 行
      - 嵌套 > 4 层
      - 缺失 error handling
      - console.log / TODO / FIXME
      - 公共 API 缺 JSDoc
      - 可变操作（应 immutable）
      - 新代码缺测试

  agent 2: security-reviewer
    prompt:
      审查 git diff HEAD 的所有改动，重点：
      - 硬编码凭据 / API key / token
      - SQL injection
      - XSS
      - 缺 input validation
      - 不安全依赖
      - Path traversal
      - Auth / authz 缺陷
```

两个 agent 读每个改动文件**完整内容**（不只是 diff hunk），给出：severity + file:line + 描述 + 建议修复。

### Phase 3 — VALIDATE（委派 verification-loop skill）

委派 `verification-loop` skill：按项目类型跑 build / type / lint / test / security / diff 验证，汇总为 verdict。

### Phase 4 — DECIDE

| 条件 | 决策 |
|---|---|
| 零 CRITICAL/HIGH + 验证全绿 | **APPROVE** |
| 仅 MEDIUM/LOW + 验证绿 | **APPROVE 带 comment** |
| 任何 HIGH 或验证挂 | **REQUEST CHANGES** |
| 任何 CRITICAL | **BLOCK**——必须修完才能 merge |

### Phase 5 — REPORT

写 `.claude/PRPs/reviews/local-{timestamp}.md`（timestamp 用秒级 ISO）：

```markdown
# Local Review — {timestamp}

**Decision**: APPROVE | REQUEST CHANGES | BLOCK

## Summary
<1-2 句整体评估>

## Findings

### CRITICAL
<findings or "None">

### HIGH
<findings>

### MEDIUM
<findings>

### LOW
<findings>

## Validation Results

| Check | Result |
|---|---|
| Type check | Pass / Fail / Skipped |
| Lint | Pass / Fail / Skipped |
| Tests | Pass / Fail / Skipped |
| Build | Pass / Fail / Skipped |

## Files Reviewed
<list with change type>
```

---

## PR Review Mode

### Phase 1 — FETCH

```bash
# 从 $ARGUMENTS 解析 PR 号
gh pr view <N> --json number,title,body,author,baseRefName,headRefName,changedFiles,additions,deletions
gh pr diff <N>
```

| 输入 | 动作 |
|---|---|
| 数字（如 `42`）| 直接当 PR 号 |
| URL（`github.com/.../pull/42`）| 抽出 PR 号 |
| 分支名 | `gh pr list --head <branch>` 查 PR |

找不到 PR → 报错停。保存 PR 元数据给后续用。

### Phase 2 — CONTEXT

1. **项目规则** — 读 `CLAUDE.md`、`.claude/docs/`、`CONTRIBUTING.md`
2. **PRP artifacts** — 检查 `.claude/PRPs/reports/` 和 `.claude/PRPs/plans/` 里是否有这个 PR 对应的实现上下文
3. **PR 意图** — PR description 里的目标、关联 issue、test plan
4. **改动文件** — 列出并归类（source / test / config / docs）

### Phase 3 — REVIEW

读每个改动文件**完整内容**（不只 diff hunk——需要周边上下文）。

在 PR head revision 上拉取完整文件：

```bash
gh pr diff <N> --name-only | while IFS= read -r file; do
  gh api "repos/{owner}/{repo}/contents/$file?ref=<head-branch>" --jq '.content' | base64 -d
done
```

**并行发 2 个 Task**：

```
Task (parallel x2):
  agent 1: code-reviewer
    审查 7 个类别：Correctness / Type Safety / Pattern Compliance /
    Performance / Completeness / Maintainability / 代码质量
  agent 2: security-reviewer
    审查安全：injection / auth gaps / secret exposure / SSRF / path traversal / XSS
```

Severity 同 Local Mode。

### Phase 4 — VALIDATE（委派 verification-loop skill）

委派 `verification-loop` skill——按 `package.json` / `Cargo.toml` / `go.mod` / `pyproject.toml` 自动识别栈并跑对应 type/lint/test/build。记 pass/fail。

### Phase 5 — DECIDE

同 Local Mode 的决策表。

**特殊情况**（放在 Phase 5 末尾统一处理）：

- **Draft PR** → 一律 **COMMENT**（不 approve / 不 block）
- **仅 docs/config 改动** → 轻审查，重点看 correctness
- **显式 `--approve` 或 `--request-changes` flag** → 覆盖决策（但 findings 仍全部报告）

### Phase 6 — REPORT

写 `.claude/PRPs/reviews/pr-<N>-review.md`：

```markdown
# PR Review: #<N> — <TITLE>

**Reviewed**: <date>
**Author**: <author>
**Branch**: <head> → <base>
**Decision**: APPROVE | REQUEST CHANGES | BLOCK

## Summary
<1-2 句整体评估>

## Findings

### CRITICAL
<findings or "None">

### HIGH
<findings>

### MEDIUM
<findings>

### LOW
<findings>

## Validation Results
| Check | Result |
|---|---|

## Files Reviewed
<list with change type>
```

### Phase 7 — PUBLISH

```bash
# APPROVE
gh pr review <N> --approve --body "<summary>"

# REQUEST CHANGES
gh pr review <N> --request-changes --body "<summary with required fixes>"

# COMMENT（draft PR 或信息性）
gh pr review <N> --comment --body "<summary>"
```

需要 inline comment：

```bash
gh api "repos/{owner}/{repo}/pulls/<N>/comments" \
  -f body="<comment>" \
  -f path="<file>" \
  -F line=<line> \
  -f side="RIGHT" \
  -f commit_id="$(gh pr view <N> --json headRefOid --jq .headRefOid)"
```

### Phase 8 — OUTPUT

```
PR #<N>: <TITLE>
Decision: <APPROVE|REQUEST_CHANGES|BLOCK>

Issues: <critical> critical, <high> high, <medium> medium, <low> low
Validation: <pass>/<total> checks passed

Artifacts:
  Review: .claude/PRPs/reviews/pr-<N>-review.md
  GitHub: <PR URL>

Next steps:
  - <contextual suggestions>
```

---

## 边界情况

- **无 `gh` CLI**：降级为 local-only（读 diff、跳过 GitHub publish），警告用户
- **Diverged branches**：建议 `git fetch origin && git rebase origin/<base>` 再审
- **大 PR（>50 文件）**：警告审查规模。优先 source → test → config/docs

## 与其他命令的关系

- 要求：在 `mcc-implement` prompt 或手工 commit 后运行
- 配合：`mcc-verify` prompt 单跑验证
- 更重：`mcc-full-review` prompt 全景审查
- 之后：`mcc-pr` prompt 或 `gh pr merge`

---
description: "从当前分支创建 GitHub PR：自动找模板、分析 commits、关联 PRP artifacts、push 并 create。"
argument-hint: "[base-branch] [--draft]"
---

# Create Pull Request

**Input**: `$ARGUMENTS` —— 可选，可含 base branch 名和/或 flag（如 `--draft`）。

**解析 `$ARGUMENTS`**：
- 抽出已识别 flag（`--draft`）
- 剩余非 flag 文本当 base branch 名
- 未指定则默认 `main`

---

## Phase 1 — 预检

```bash
git branch --show-current
git status --short
git log origin/<base>..HEAD --oneline
```

| 检查 | 条件 | 失败时动作 |
|---|---|---|
| 不在 base 上 | 当前分支 ≠ base | 停："先切到 feature branch" |
| 工作区干净 | 无未提交改动 | 警："你有未提交改动，先 commit 或 stash。" |
| 有待推送 commit | `git log origin/<base>..HEAD` 非空 | 停："没有领先 `<base>` 的 commit。无事可做。" |
| 无已存在 PR | `gh pr list --head <branch>` 为空 | 停："PR 已存在：#<number>。用 `gh pr view <number> --web` 打开。" |

全通过才继续。

---

## Phase 2 — 发现

### PR 模板

按顺序找：

1. `.github/PULL_REQUEST_TEMPLATE/` 目录 —— 若存在，列出文件让用户选（或用 `default.md`）
2. `.github/PULL_REQUEST_TEMPLATE.md`
3. `.github/pull_request_template.md`
4. `docs/pull_request_template.md`

找到就读入，按其结构填 PR body。

### Commit 分析

```bash
git log origin/<base>..HEAD --format="%h %s" --reverse
```

- **PR title**：用 conventional commit 前缀（`feat:` / `fix:` / ...）
  - 多类型取主流类型
  - 单 commit 直接用其 message
- **Change summary**：按类型/区域归类

### 文件分析

```bash
git diff origin/<base>..HEAD --stat
git diff origin/<base>..HEAD --name-only
```

文件归类：source / tests / docs / config / migrations。

### PRP Artifacts

检查相关 PRP artifacts：
- `.claude/PRPs/reports/` — 实施报告
- `.claude/PRPs/plans/` — 执行过的 plan
- `.claude/PRPs/prds/` — 相关 PRD

找到的就在 PR body 里引用。

---

## Phase 3 — 推送

```bash
git push -u origin HEAD
```

push 因 divergence 失败时：

```bash
git fetch origin
git rebase origin/<base>
git push -u origin HEAD
```

rebase 有冲突 → 停下来告诉用户。

---

## Phase 4 — 创建

### 有模板时

按 Phase 2 找到的模板填，保留所有 section——不适用的写 "N/A" 也比删掉好。

### 无模板时

用默认格式：

```markdown
## Summary

<1-2 sentence description of what this PR does and why>

## Changes

<bulleted list grouped by area>

## Files Changed

<table or list with change type: Added/Modified/Deleted>

## Testing

<how changes were tested, or "Needs testing">

## Related Issues

<Closes/Fixes/Relates to #N, or "None">
```

### 执行创建

```bash
gh pr create \
  --title "<PR title>" \
  --base <base-branch> \
  --body "<PR body>"
  # 若解析到 --draft 则附加 --draft
```

**Windows 注（PowerShell）**：`gh pr create --body` 的多行内容用 here-string `@'...'@`（单引号阻止变量展开），闭合 `'@` 必须顶格：

```powershell
gh pr create --title "feat: add x" --base main --body @'
## Summary
...
'@
```

避免用 POSIX heredoc 语法。

---

## Phase 5 — 验证

```bash
gh pr view --json number,url,title,state,baseRefName,headRefName,additions,deletions,changedFiles
gh pr checks --json name,status,conclusion 2>/dev/null || true
```

---

## Phase 6 — 汇报

```
PR #<number>: <title>
URL: <url>
Branch: <head> → <base>
Changes: +<additions> -<deletions> across <changedFiles> files

CI Checks: <status summary 或 "pending" 或 "none configured">

Artifacts referenced:
  - <any PRP reports/plans linked in PR body>

Next steps:
  - gh pr view <number> --web   → 浏览器打开
  - `mcc-review` prompt <number>        → 审查该 PR
  - gh pr merge <number>        → 合并
```

---

## 边界情况

- **无 `gh` CLI**：停："需要 GitHub CLI（`gh`）。安装：<https://cli.github.com/>"
- **未认证**：停："先运行 `gh auth login`"
- **需要 force push**：rebase 过且 remote 已 diverge 时，用 `git push --force-with-lease`（绝不 `--force`）
- **多 PR 模板**：`.github/PULL_REQUEST_TEMPLATE/` 多文件时列出让用户选
- **大 PR（>20 文件）**：警告规模。若改动逻辑可分，建议拆分

---

## 与其他命令的关系

- 上游：`mcc-implement` prompt 跑完就能接 `mcc-pr` prompt
- 上游：自己手工 commit 后也可直接用
- 之后：``mcc-review` prompt <PR#>` 对刚开的 PR 做审查

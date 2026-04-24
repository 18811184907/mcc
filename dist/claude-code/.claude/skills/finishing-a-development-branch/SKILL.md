---
name: finishing-a-development-branch
description: "实现完成、测试通过、要决定如何合入时使用：先验证测试，再给 4 个清晰选项（本地合并 / PR / 保留 / 丢弃），然后执行并清理。"
---

# Finishing a Development Branch

## 概述

在开发分支完成、测试通过、需要决定**怎么把工作合入**时，给出清晰选项并执行选中的工作流。

**核心原则：** 验证测试 → 给选项 → 执行选择 → 清理。

## 流程

### Step 1：验证测试

**给选项之前必须确认测试通过：**

```bash
# 按项目跑对应的测试
npm test / cargo test / pytest / go test ./...
```

**测试失败：**
```
Tests failing (<N> failures)。必须先修才能完成：

[展示失败]

测试过之前不能 merge / PR。
```

停。不要进入 Step 2。

**测试通过：** 进入 Step 2。

### Step 2：确定基线分支

```bash
# 常见 base 分支
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

或问："本分支基于 main，对吗？"

### Step 3：给出选项

**严格给这 4 个：**

```
实现完成。你想怎么做？

1. 本地合回 <base-branch>
2. Push 并创建 Pull Request
3. 保留分支（我稍后处理）
4. 丢弃这份工作

选哪个？
```

**不要加解释** —— 选项保持简洁。

### Step 4：执行选择

#### Option 1：本地 merge

```bash
# 切到 base branch
git checkout <base-branch>

# 拉最新
git pull

# 合入 feature branch
git merge <feature-branch>

# 在合并结果上跑测试
<test command>

# 测试通过
git branch -d <feature-branch>
```

然后：清理 worktree（Step 5）。

#### Option 2：Push 并创建 PR

```bash
# Push 分支
git push -u origin <feature-branch>

# 创建 PR
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<2-3 bullets of what changed>

## Test Plan
- [ ] <verification steps>
EOF
)"
```

**或者直接调 MCC 的 `/mcc:prp-pr` 命令**——它会自动分析 commit 历史、起草 PR 描述、push 新分支。本 skill 里只给最小命令，复杂场景走那条命令。

然后：清理 worktree（Step 5）。

#### Option 3：保留原状

报告："保留分支 <name>。Worktree 保留在 <path>。"

**不清理 worktree。**

#### Option 4：丢弃

**必须先确认：**
```
这将永久删除：
- 分支 <name>
- 所有 commit：<commit-list>
- <path> 处的 worktree

输入 'discard' 确认。
```

等待**精确**的确认字。

确认后：
```bash
git checkout <base-branch>
git branch -D <feature-branch>
```

然后：清理 worktree（Step 5）。

### Step 5：清理 worktree

**对 Options 1、2、4：**

检查是否在 worktree 里：
```bash
git worktree list | grep $(git branch --show-current)
```

是则：
```bash
git worktree remove <worktree-path>
```

**对 Option 3：** 保留 worktree。

## 速查

| Option | Merge | Push | 保留 Worktree | 清理 Branch |
|---|---|---|---|---|
| 1. 本地 merge | ✓ | - | - | ✓ |
| 2. 建 PR | - | ✓ | ✓ | - |
| 3. 保留 | - | - | ✓ | - |
| 4. 丢弃 | - | - | - | ✓（强制） |

## 常见错误

**跳过测试验证**
- **问题：** 合入坏代码或造出失败的 PR
- **修法：** 给选项前**永远**先验证测试

**开放式问话**
- **问题：** "下一步做什么？" → 含糊
- **修法：** 精确给 4 个结构化选项

**自动清理 worktree**
- **问题：** 在可能还需要的时候清掉（Option 2、3）
- **修法：** 只对 Options 1 和 4 清理

**丢弃无确认**
- **问题：** 误删工作
- **修法：** 要求精确输入 'discard'

## 红旗

**永远不要：**
- 带着失败测试继续
- merge 后不在合并结果上再跑一次测试
- 无确认就删工作
- 无明确请求就 force push

**永远：**
- 给选项前验证测试
- 精确给 4 个选项
- Option 4 要求用户打 'discard'
- 只对 Options 1 和 4 清理 worktree

## 与 MCC 生态的配合

**被以下场景调用：**
- `subagent-driven-development`（Step 7）—— 全部 task 完成后
- 实现完成后的任何收尾节点

**配套使用：**
- `using-git-worktrees` —— 清理由该 skill 建出来的 worktree
- `/mcc:prp-pr` —— 选 Option 2 时的首选命令，自动处理 PR 分析、push、创建
- `/mcc:prp-commit` —— 合并前还有未提交工作时用

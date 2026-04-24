---
name: using-git-worktrees
description: "建隔离 worktree + 自动选目录 + 安全校验。开始 feature 开发或执行 plan 之前触发，避免污染当前工作区。"
---

# Using Git Worktrees

## 概述

Git worktree 允许在同一个仓库里建**隔离的工作区**，让你同时在多个分支上工作而**不用切换**。

**核心原则：** 系统化选目录 + 安全校验 = 可靠隔离。

## 目录选择流程

按**优先级**顺序执行：

### 1. 检查已有目录

```bash
# 按优先级检查
ls -d .worktrees 2>/dev/null     # 首选（隐藏）
ls -d worktrees 2>/dev/null      # 备选
```

**找到则用。** 两个都存在时 `.worktrees` 胜出。

### 2. 检查 CLAUDE.md

```bash
grep -i "worktree.*director" CLAUDE.md 2>/dev/null
```

**指定了偏好则直接用，不问。**

### 3. 问用户

既没有目录、CLAUDE.md 也没偏好时：

```
没找到 worktree 目录，在哪里创建？

1. .worktrees/（项目本地、隐藏）
2. ~/.mcc/worktrees/<project-name>/（全局位置）

选哪个？
```

## 安全校验

### 对项目本地目录（.worktrees 或 worktrees）

**创建 worktree 前必须验证该目录是 gitignored：**

```bash
# 检查（会遵守本地、全局、系统 gitignore）
git check-ignore -q .worktrees 2>/dev/null || git check-ignore -q worktrees 2>/dev/null
```

**如果 NOT ignored：**

按"发现问题立即修"原则：
1. 向 `.gitignore` 加相应行
2. Commit 该改动
3. 再创建 worktree

**为什么关键：** 防止 worktree 内容被意外 commit 进仓库。

### 对全局目录（~/.mcc/worktrees/ 之类）

无需 gitignore 校验 —— 本来就不在项目内。

## 创建步骤

### 1. 检测项目名

```bash
project=$(basename "$(git rev-parse --show-toplevel)")
```

### 2. 创建 worktree

```bash
# 确定完整路径
case $LOCATION in
  .worktrees|worktrees)
    path="$LOCATION/$BRANCH_NAME"
    ;;
  ~/.mcc/worktrees/*)
    path="~/.mcc/worktrees/$project/$BRANCH_NAME"
    ;;
esac

# 创建 worktree，同时建新 branch
git worktree add "$path" -b "$BRANCH_NAME"
cd "$path"
```

### 3. 跑项目 setup

自动检测并运行相应 setup：

```bash
# Node.js
if [ -f package.json ]; then npm install; fi

# Rust
if [ -f Cargo.toml ]; then cargo build; fi

# Python
if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
if [ -f pyproject.toml ]; then poetry install; fi

# Go
if [ -f go.mod ]; then go mod download; fi
```

### 4. 验证基线 clean

跑测试确认 worktree 起点干净：

```bash
# 举例 —— 按项目选合适命令
npm test
cargo test
pytest
go test ./...
```

**测试失败：** 报告失败，问用户继续还是先查。

**测试通过：** 报告 ready。

### 5. 报位置

```
Worktree ready at <完整路径>
Tests passing (<N> tests, 0 failures)
Ready to implement <feature-name>
```

## 速查

| 情况 | 动作 |
|---|---|
| `.worktrees/` 存在 | 用它（校验 ignored） |
| `worktrees/` 存在 | 用它（校验 ignored） |
| 两个都存在 | 用 `.worktrees/` |
| 都没有 | 查 CLAUDE.md → 问用户 |
| 目录未 ignore | 加 `.gitignore` + commit |
| 基线测试失败 | 报告 + 问 |
| 无 package.json/Cargo.toml 等 | 跳过依赖安装 |

## 常见错误

### 跳过 ignore 校验

- **问题：** worktree 内容被 git 追踪，污染 `git status`
- **修法：** 创建项目本地 worktree 前必跑 `git check-ignore`

### 擅自假定目录位置

- **问题：** 制造不一致，违反项目约定
- **修法：** 按优先级 —— 已有 > CLAUDE.md > 问

### 带着失败测试继续

- **问题：** 新 bug 和既有问题混不清
- **修法：** 报告失败，获得明确授权再继续

### 硬编码 setup 命令

- **问题：** 对用不同工具的项目会断
- **修法：** 自动检测项目文件（package.json 等）

## Example Workflow

```
[Check .worktrees/ - exists]
[Verify ignored - git check-ignore confirms .worktrees/ is ignored]
[Create worktree: git worktree add .worktrees/auth -b feature/auth]
[Run npm install]
[Run npm test - 47 passing]

Worktree ready at /Users/jesse/myproject/.worktrees/auth
Tests passing (47 tests, 0 failures)
Ready to implement auth feature
```

## 红旗

**永远不要：**
- 项目本地 worktree 没校验 ignore 就创建
- 跳过基线测试校验
- 没问就带着失败测试继续
- 目录选择含糊时擅自决定
- 跳过 CLAUDE.md 检查

**永远：**
- 按优先级：已有 > CLAUDE.md > 问
- 项目本地 worktree 验 ignored
- 自动检测并跑 project setup
- 验证测试基线干净

## Windows 环境提示

- 本 skill 的 bash 命令需要 **Git Bash**（或 WSL）执行；Windows 原生 cmd / PowerShell 不支持这些语法
- `~/.mcc/worktrees/` 在 Windows 下展开为 `%USERPROFILE%\.mcc\worktrees\`
- `git worktree add` 在 Windows 上正常工作，但路径分隔符建议用正斜杠以兼容工具
- 如果你在 Git Bash 里跑 `cd` 到 worktree，注意后续用的终端也得是 Git Bash（环境变量差异）

## 与 MCC 生态的配合

**被以下场景调用：**
- `brainstorming` 阶段完成、设计通过后进入实现前 —— 必需
- `subagent-driven-development` —— 执行 task 前必需
- 任何需要隔离工作区的 skill

**配套使用：**
- `finishing-a-development-branch` —— 工作完成后清理 worktree
- `/prp-commit`、`/prp-pr` —— 在 worktree 内执行 commit / PR 创建

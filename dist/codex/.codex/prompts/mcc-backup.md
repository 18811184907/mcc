---
description: "一键备份当前项目到公司仓库：add + commit + push 一条龙。日常用。"
argument-hint: "<简短说明，作为 commit message>"
---

# 团队代码备份 · 日常一键同步

**Input**: $ARGUMENTS（commit message，必填）

## 前置检查

### 1. 检测当前项目的 backup 状态

```bash
cat .mcc/backup-state.json 2>/dev/null
```

**如果文件不存在**（第一次在这个项目用 `/backup`）：**自动进入首次设置流程**。

给用户一个简短提示：
```
[MCC Backup] 这个项目还没配置备份。我先帮你做一次性设置（10 秒），然后继续备份你这次的改动。
```

然后**内联执行** `/backup-setup` 的 Phase 1-4 流程（见 `backup-setup.md`）：
- 检测 gh 认证
- 问用户姓名、邮箱、项目名
- 创建 repo
- 配 remote
- 装 post-commit hook
- 首次推送

setup 完成后**不要让用户重新敲 `/backup`**，直接**继续** Step 2（commit + push）。

**如果文件存在**：略过 setup，直接继续 Step 2。

### 2. 确认 commit message 非空

如果 `$ARGUMENTS` 为空：
```
[MCC Backup] 缺 commit message。
用法: /backup "简短说明你做了什么"
例: /backup "改了首页按钮颜色"
```

停下来。

## 执行流程

### Step 1: 检查是否有改动

```bash
git status --porcelain
```

如果无输出（没改动）：
```
[MCC Backup] 没有未提交的改动。
直接跑一次推送? [Y/n]
  y → 继续 Step 3
  n → 退出
```

如果有改动：打印改动文件数
```
[MCC Backup] 检测到 {N} 个改动文件
[MCC Backup] Adding files...
```

继续。

### Step 2: git add + commit

```bash
git add -A
git commit -m "$ARGUMENTS"
```

打印：
```
[MCC Backup] ✓ 提交: {新 commit 的 hash 前 7 位} ({commit 标题})
```

**注意**：post-commit hook 会自动触发 push（Step 3 的动作）。但 hook 是 async 的，有时候会看不到进度，所以这里**再显式 push 一次**确保用户看到结果。

### Step 3: git push

```bash
git push backup HEAD 2>&1
```

输出分两种：

**成功**：
```
[MCC Backup] 推到 https://github.com/{owner}/{project}-backup...
[MCC Backup] ✓ 完成! (+{N 行} / -{M 行})
[MCC Backup] 本次改的文件:
  - src/pages/home.tsx
  - src/styles/button.css
[MCC Backup] 备份地址: https://github.com/.../commit/{hash}
```

**失败**：
```
[MCC Backup] ⚠ 推送失败:
  {错误信息前 3 行}

常见原因:
- 网络不通 → 稍后再跑 /backup-sync
- PAT 过期 → 找团队管理员要新 PAT，然后 gh auth login --with-token
- 被 reject（冲突）→ 先 git pull backup HEAD --rebase，再 /backup "xxx"

需要我帮你做什么?
```

## 禁止

- ❌ 不要 push 到 `origin` remote（origin 可能是主仓库，不是 backup）
- ❌ 不要 `git push -f`（强制推）
- ❌ 不要改用户的 commit author 配置（那是 /backup-setup 的工作）
- ❌ 不要 pull / rebase 除非用户明确要求

## 给 Claude 的提示

- **一条消息搞定**：从用户敲 `/backup "xxx"` 到显示"✓ 完成"，最好一气呵成 3-5 条 bash 执行
- 失败时给**具体的修复方案**（抄上面的"常见原因"清单）
- 不要让用户自己猜 `git pull --rebase` 怎么敲

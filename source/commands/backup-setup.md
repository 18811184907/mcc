---
description: "首次给当前项目配置团队代码备份到公司仓库。一次性运行，之后用 /backup 日常同步。"
argument-hint: "(无参数 · 交互式问答)"
---

# 团队代码备份 · 首次设置

**Input**: $ARGUMENTS（忽略）

## 你的任务

引导用户为当前项目配置"自动备份到公司 GitHub"。整个流程用**提问式**，每一步让用户确认。

## 前置要求检查

### Phase 0 — 环境检查

```bash
# 检查是不是 git repo
git rev-parse --git-dir 2>/dev/null
```

如果不是 git repo：
```
[MCC Backup] 当前目录不是 git 仓库。
如果你想给这个项目开启备份，我先帮你 git init 好吗? [y/N]
```

用户同意后：
```bash
git init
```

### Phase 1 — gh CLI 认证检查

```bash
gh auth status
```

失败的话告诉用户：
```
❌ 你的 gh CLI 还没登录公司账号。
请你的团队管理员给你一个 PAT token，然后跑:
  echo <TOKEN> | gh auth login --with-token
完成后再跑 /backup-setup。
```

成功的话显示登录用户名并继续。

## Phase 2 — 收集信息

**分 3 个问题问用户**（每个问完等回答再继续）：

### Q1. 项目名
```
这个项目叫啥? (作为公司 GitHub 下的 backup 仓库名)
例：my-backend-api、admin-dashboard
输入:
```

收到 `{project_name}`。**校验**：只能字母数字-下划线，不能有空格中文。
生成最终 repo 名 = `{project_name}-backup`（加后缀避免和主 repo 撞）。

### Q2. 你的名字
```
你叫啥? (作为 git commit 的 author 名)
例：张三、Zhang San
输入:
```

收到 `{user_name}`。

### Q3. 你的邮箱
```
你的邮箱? (作为 git commit 的 author 邮箱，建议用公司邮箱)
输入:
```

收到 `{user_email}`。

## Phase 3 — 确认展示

```
[MCC Backup] 我将要做这些事:

1. 在公司账号下创建 repo:
   https://github.com/{公司 gh 账号}/{project_name}-backup
   (private)

2. 给当前项目加 git remote:
   remote "backup" → 上面的 URL

3. 配置 git commit 身份:
   user.name  = {user_name}
   user.email = {user_email}
   (仅当前项目生效，不改你的全局 git config)

4. 装一个 post-commit hook:
   .git/hooks/post-commit
   以后每次 git commit 后自动 push 到 backup remote

5. 首次全量推送:
   git push backup --all

确认开始? [Y/n]
```

用户确认后执行 Phase 4。

## Phase 4 — 执行（逐步打印）

### Step 1: 创建 repo
```bash
gh repo create "{project_name}-backup" --private --confirm
```
打印：`✓ 创建 https://github.com/.../...-backup`

如果 repo 已存在：
```bash
gh repo view "{project_name}-backup" 2>/dev/null && echo "exists"
```
询问用户：`repo 已存在，复用它? [Y/n]`

### Step 2: 加 remote
```bash
git remote remove backup 2>/dev/null  # 如果已有，先清
git remote add backup "https://github.com/{owner}/{project_name}-backup.git"
```
打印：`✓ remote "backup" → {URL}`

### Step 3: 配 git identity
```bash
git config user.name  "{user_name}"
git config user.email "{user_email}"
```
打印：`✓ commit author = {user_name} <{user_email}>`

### Step 4: 装 post-commit hook

创建文件 `.git/hooks/post-commit`：

```bash
#!/usr/bin/env bash
# MCC Team Backup · post-commit hook
# 用户主动启用，见 .mcc/backup-state.json

STATE_FILE="$(git rev-parse --show-toplevel)/.mcc/backup-state.json"
if [ ! -f "$STATE_FILE" ]; then
    exit 0
fi

echo "[MCC Backup] 推到 backup remote..."
if git push backup HEAD 2>&1 | tail -3; then
    echo "[MCC Backup] ✓ 完成"
else
    echo "[MCC Backup] ⚠ 推送失败，可以晚点跑 /backup-sync 再试"
fi
```

然后：
```bash
chmod +x .git/hooks/post-commit
mkdir -p .mcc
echo '{"backup_enabled":true,"project":"{project_name}","owner":"{user_name}","created_at":"'$(date -Iseconds)'"}' > .mcc/backup-state.json
```

打印：`✓ post-commit hook 已装`

### Step 5: 首次全量推送

检查是否有 commit：
```bash
git log -1 --oneline 2>/dev/null
```

如果没有任何 commit（空 repo），先让用户创建一个：
```
[MCC] 这个 repo 还没有任何 commit。
建议先做第一次提交:
  git add -A && git commit -m "initial"

完成后再跑 /backup-sync 做首次推送。
```

如果有 commit：
```bash
git push -u backup HEAD
git push backup --tags 2>/dev/null || true
```

打印：`✓ 首次推送完成`

## Phase 5 — 完成提示

```
[MCC Backup] ✅ 设置完成!

- 备份地址: https://github.com/{owner}/{project_name}-backup
- 日常用法: 在这个项目里敲 /backup "简短说明"
  （或者直接 git commit，会自动触发 post-commit hook 推送）
- 查看状态: /backup-status
- 停用备份: /backup-off

有问题:
- 查看团队指南: TEAM-MEMBER-GUIDE.md
- 联系团队管理员

完成！现在回去写代码吧。
```

## 错误处理

| 情况 | 动作 |
|---|---|
| `gh auth status` 失败 | 告诉用户先 `gh auth login`，引用管理员提供的 PAT |
| `gh repo create` 失败（权限不足） | 告诉用户 PAT 缺 `Administration: write` 权限，让管理员重新给 |
| push 被拒绝（可能 PAT 过期） | 告诉用户找管理员要新 PAT |
| 已有 post-commit hook | 问用户：`已有其他 post-commit hook，是否合并 MCC 备份? [Y/n]` |

## 禁止

- ❌ 不要在没有用户明确"同意"前，执行任何 `git` / `gh` 命令
- ❌ 不要把 PAT 或任何 secret 写到任何文件（.env / .git/config 都不行）
- ❌ 不要改全局 git config（`--global`）

## 给 Claude 的提示

- **一次只问一个问题**，等用户回答再下一步
- 敬语中文，但不啰嗦
- 每步动作前打印"要做什么"，做完打印"做了什么"
- 失败立刻停，不要"重试 3 次"

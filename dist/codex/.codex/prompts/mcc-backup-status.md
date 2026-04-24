---
description: "看当前项目的备份状态：远程位置、最近一次推送、待推送的 commit 数。"
argument-hint: "(无参数)"
---

# 查看备份状态

**Input**: 无

## 执行流程

### Step 1: 检测是否启用备份

```bash
cat .mcc/backup-state.json 2>/dev/null
```

如果无输出：
```
[MCC Backup] 这个项目还没配置备份。
用 /backup "xxx" 可以一键首次设置 + 开始备份。
```
停下来。

### Step 2: 读取配置

从 `.mcc/backup-state.json` 读：
- `project`
- `owner`（commit author 名字）
- `created_at`

从 git 读：
- `git remote get-url backup 2>/dev/null`
- `git config user.name` / `git config user.email`
- 最近一次 push 时间（见下）
- 待推送的 commit 数：`git rev-list --count backup/HEAD..HEAD 2>/dev/null`
- 最近 3 次 commit：`git log -3 --pretty='%h %s (%cr)'`

### Step 3: 展示

```
[MCC Backup] 备份状态

📦 备份位置: {backup_url}
👤 身份:     {user.name} <{user.email}>
🆔 项目名:   {project}
📅 配置于:   {created_at}

📊 最近状态:
  - 最新 commit: {hash} "{title}" ({时间相对})
  - 待推送:     {N} 个 commit {如果 N>0 加: "👉 跑 /backup 或 /backup-sync 把它们推上去"}
  - 最近 3 次 commit:
      {hash1} {title1} ({time1})
      {hash2} {title2} ({time2})
      {hash3} {title3} ({time3})

🔧 钩子:     post-commit hook {✓ 已装 | ✗ 未装}

管理:
  /backup "msg"   每次写完代码用
  /backup-off     关闭此项目备份
```

### 可能的状态检查

- `backup` remote 不存在 → "remote 丢了，重新跑 /backup-setup"
- post-commit hook 不存在 → "post-commit hook 丢了，重新跑 /backup-setup 装回"
- 本地 HEAD 比 backup/HEAD 落后（用户 pull 过别的）→ "本地比 backup 落后，先 git pull backup"

## 禁止

- ❌ 不要触发任何 push / commit
- ❌ 不要改任何 git config

## 给 Claude 的提示

纯只读 + 报告。不做任何修改。

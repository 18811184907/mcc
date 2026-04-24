---
description: "关闭当前项目的备份（停止 post-commit 自动推送）。已推的历史保留不动。"
argument-hint: "(无参数)"
---

# 关闭备份

**Input**: 无

## 执行流程

### Step 1: 检测

```bash
cat .mcc/backup-state.json 2>/dev/null
```

如果无输出：
```
[MCC Backup] 这个项目当前没启用备份，不用关。
```
停下来。

### Step 2: 确认

向用户展示要做的事，**等 y/N 回答**：

```
[MCC Backup] 要关闭当前项目的备份吗?

会做以下事:
  1. 删除 .mcc/backup-state.json (标记停用)
  2. 删除 .git/hooks/post-commit (停止 commit 时自动推送)
  3. 保留 git remote "backup" 配置（方便你未来重开）
  4. 保留远程仓库 github.com/{owner}/{project}-backup 里已推的代码

你可以随时 /backup "xxx" 再开（重新装 hook）。

继续? [y/N]
```

**默认 N**，用户必须明确敲 y 才继续。

### Step 3: 执行

```bash
rm .mcc/backup-state.json
rm .git/hooks/post-commit 2>/dev/null
# 不删 git remote，方便重开
# 不删远程 repo（远程代码谁都别自动删）
```

### Step 4: 打印结果

```
[MCC Backup] ✓ 已关闭当前项目的备份

- post-commit hook 已删
- 不再自动推送 (commit 不再触发)
- 远程 repo 仍在 github.com/{owner}/{project}-backup (代码还在，可以浏览器查看)
- git remote "backup" 仍保留 (方便未来 /backup 重开)

想彻底删远程仓库？手动去 GitHub 网页操作:
  浏览器打开 https://github.com/{owner}/{project}-backup/settings
  拉到最下 Danger Zone → Delete this repository

想重新启用? 再敲 /backup "xxx" 即可 (会重装 hook)。
```

## 禁止

- ❌ 不要删远程 repo（太危险，交给用户手动）
- ❌ 不要删 .git/config 里的 remote（用户可能重开）
- ❌ 不要删 .mcc/ 整个目录（可能有其他用途）

## 给 Claude 的提示

动作要**可逆、最小**。只删启用标记 + post-commit hook。其他保留。

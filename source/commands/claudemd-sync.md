---
description: "全局 ~/.claude/CLAUDE.md 跨设备同步管理：init（首次配置 dotfiles repo + symlink/copy）/ push（手动推送，给 hook 阻拦的删除型改动）/ status（看 sync 状态 + 远程是否有新版本）。"
argument-hint: "init <repo-url> | push | status | pull"
---

# /claudemd-sync · 全局 CLAUDE.md 跨设备同步

跨电脑同步你的 `~/.claude/CLAUDE.md`（你的 Claude 习惯/偏好）。

**核心机制**：
- `~/.claude/CLAUDE.md` 是你日常编辑的（Claude / 你直接改）
- `~/.dotfiles/claude-dotfiles/CLAUDE.md` 是 git 镜像
- PostToolUse hook (`post-claudemd-sync.js`) 检测到 ~/.claude/CLAUDE.md 改动 → 自动 cp 到 dotfiles → git add
  - **纯追加** → 自动 commit + push（99% 场景）
  - **有删除/改写** → 不自动推，用户跑 `/claudemd-sync push` 确认

## 用法

### `/claudemd-sync init <repo-url>` — 首次配置（一次）

例：
```
/claudemd-sync init https://github.com/18811184907/claude-dotfiles
```

执行步骤（Claude 自动跑）：

1. **检查 git 可用**：`git --version`
2. **检查目标目录是否已存在**：`~/.dotfiles/claude-dotfiles/`
   - 已存在且是同 repo 的 clone → 跳过 clone，重用
   - 已存在但是别的 repo / 非 git → 报错让用户确认
3. **clone 或拉新**：
   ```bash
   mkdir -p ~/.dotfiles
   git clone <repo-url> ~/.dotfiles/claude-dotfiles
   ```
4. **决定哪个版本是 canonical**：
   - 本机 `~/.claude/CLAUDE.md` 存在 + dotfiles repo 没 CLAUDE.md → **用本机的**
     ```bash
     cp ~/.claude/CLAUDE.md ~/.dotfiles/claude-dotfiles/CLAUDE.md
     cd ~/.dotfiles/claude-dotfiles
     git add CLAUDE.md
     git commit -m "init: claudemd-sync from <hostname>"
     git push
     ```
   - 本机没 + dotfiles 有（新设备 onboard）→ **用 dotfiles 的**
     ```bash
     mkdir -p ~/.claude
     cp ~/.dotfiles/claude-dotfiles/CLAUDE.md ~/.claude/CLAUDE.md
     ```
   - **两边都有 + 内容不同** → 让用户选保留哪边（不要静默覆盖）
   - **两边都没** → 写 dotfiles repo 一个空骨架 CLAUDE.md
5. **写配置文件** `~/.claude/.claudemd-sync.config`：
   ```json
   {
     "repoUrl": "<repo-url>",
     "dotfilesDir": "~/.dotfiles/claude-dotfiles",
     "syncFile": "CLAUDE.md",
     "version": 1
   }
   ```
6. **写 .gitignore 在 dotfiles repo 里**（如还没有）排除：
   ```
   .credentials.json
   *.local.json
   .DS_Store
   ```
7. **报告**：
   ```
   ✓ claudemd-sync 已配置
     dotfiles: ~/.dotfiles/claude-dotfiles → <repo-url>
     synced: ~/.claude/CLAUDE.md (XX lines)

   之后 Claude 改你 ~/.claude/CLAUDE.md：
     - 纯追加 → hook 自动 commit + push
     - 含删除 → 提醒你跑 /claudemd-sync push 确认
   ```

### `/claudemd-sync push` — 确认推送（含删除时用）

当 hook 检测到删除性改动时**不会**自动 push。这条命令让用户确认后推送。

执行：
1. **读 config** 找 dotfiles dir
2. **检查未提交改动**：
   ```bash
   cd ~/.dotfiles/claude-dotfiles
   git status --porcelain
   ```
3. **show diff**：
   ```bash
   git diff --cached CLAUDE.md
   ```
   让用户看清楚改了啥
4. **询问 y/n** 确认（基于 v2.5.1 偏好"git remote 必须先问"）
5. **commit + push**：
   ```bash
   git add CLAUDE.md
   git commit -m "manual: claudemd update (review by user)"
   git push
   ```
6. **报告** "✓ pushed"

### `/claudemd-sync status` — 看同步状态

执行：
1. **读 config**（不存在 → 提示运行 init）
2. **本地 vs dotfiles repo 对比**：
   ```bash
   diff ~/.claude/CLAUDE.md ~/.dotfiles/claude-dotfiles/CLAUDE.md
   ```
3. **dotfiles repo 状态**：
   ```bash
   cd ~/.dotfiles/claude-dotfiles
   git status
   git log --oneline -5
   ```
4. **远程是否有新版本**（其他设备推过来的）：
   ```bash
   git fetch
   git log HEAD..@{u} --oneline   # show new commits behind
   ```
5. **输出**：
   ```
   📊 claudemd-sync status

     repo:          https://github.com/.../claude-dotfiles
     dotfiles dir:  ~/.dotfiles/claude-dotfiles
     local match:   ✓ matches dotfiles
     uncommitted:   (nothing) | (+5 -2 lines)
     pending push:  (none) | (1 commit ahead)
     remote ahead:  (none) | (2 commits — run /claudemd-sync pull)
     last 3 commits:
       abc1234  auto: claudemd append (+8 lines)
       def5678  auto: claudemd append (+3 lines)
       ...
   ```

### `/claudemd-sync pull` — 拉远程新版本（其他设备推过的）

跨设备工作流：
- 设备 A 改 CLAUDE.md → hook 自动 push → GitHub 上有新版本
- 设备 B `/claudemd-sync pull` → 拉到本地 → cp 到 ~/.claude/CLAUDE.md

执行：
1. **读 config**
2. **fetch + 检查冲突风险**：
   ```bash
   cd ~/.dotfiles/claude-dotfiles
   git fetch
   ```
3. **如果本地有未提交改动** → 警告 + 让用户先 push 或 stash
4. **pull**：
   ```bash
   git pull --ff-only
   ```
   如果不能 fast-forward → 让用户手动解决（不要自动 merge）
5. **同步到本机 ~/.claude/**：
   ```bash
   cp ~/.dotfiles/claude-dotfiles/CLAUDE.md ~/.claude/CLAUDE.md
   ```
6. **报告**："✓ pulled N commits, ~/.claude/CLAUDE.md 已更新"

## 安全约束

- ❌ **不要** 把 `.claude/PROJECT_VAULT.md` / `.env.local` / 任何项目级 secret 放进 dotfiles repo
- ❌ **不要** 把 `~/.claude/.credentials.json` 推到 repo（OAuth token，机器特定 + 安全）
- ❌ **不要** 在 dotfiles repo 里 force-push（会破坏其他设备的同步链路）
- ✅ **dotfiles repo 必须是 private**（即使私有也只装非 secret 内容）
- ✅ 删除型改动**永远问一下** —— 防止误删安全规则后被自动推上去

## 与 v2.5.1 偏好的呼应

你 ~/.claude/CLAUDE.md 里写了 "AI 主导接管"，并明确："改 git 远程必须先问"。

本命令的设计：
- **追加** → 自动 push（最常见场景，"AI 主导"原则）
- **删除/改写** → 必须先问（git 远程改动的"必须先问"原则）

99% 场景全自动，1% 场景一次确认。

## 引用

- Hook：`~/.mcc-install/source/hooks/scripts/hooks/post-claudemd-sync.js`
- Skill：`claudemd-sync` SKILL.md（教 Claude 什么时候主动追加 ~/.claude/CLAUDE.md）
- 新设备 onboard：`bootstrap.{ps1,sh}` 加 `--with-dotfiles <url>` flag

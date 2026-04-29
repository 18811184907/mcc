---
name: claudemd-sync
description: "Claude 主动沉淀用户跨项目偏好到 ~/.claude/CLAUDE.md，post-hook 自动 commit+push 到 dotfiles repo 跨设备同步。触发：用户说'记下这个偏好 / 沉淀到 CLAUDE.md / 把这个习惯加进去'、用户连续多次重复同样反馈（'又忘了'）、或做了跨项目通用决策（'以后所有项目都用 zod'）。仅追加不覆盖。与 continuous-learning-v2 分工：本 skill 主动显式沉淀偏好，learning-v2 被动观察行为。"
---

# claudemd-sync · AI 主动接管全局 CLAUDE.md 更新 + 跨设备同步

**核心原则**：用户**从不**手动编辑 `~/.claude/CLAUDE.md`。Claude 在对话里检测到"这是个跨项目通用偏好"信号时主动 Edit 追加。后台 hook 自动 sync 到用户的 dotfiles repo（GitHub 私有），新设备 clone 即可继承全部习惯。

## 自动激活的场景（Claude 必须主动接管）

### A. 用户明确说沉淀

| 用户说 | Claude 立刻做 |
|---|---|
| "把这个习惯加到 CLAUDE.md" | Edit ~/.claude/CLAUDE.md 追加 |
| "记下这个偏好" / "沉淀一下" | 同上 |
| "以后都这样" / "所有项目都" | 同上 |

### B. 用户连续给同样的反馈（隐性信号）

| 信号 | Claude 行为 |
|---|---|
| 同一 session 用户 ≥2 次给同样指正（"又忘了 X / 又来了，每次都"）| 主动问"我把这个加到 CLAUDE.md 吧，下次不会忘" + 用户回 y → 追加 |
| 用户表达跨项目通用决策（"我所有项目都用 zod 不用 valibot"）| 主动追加（不需问，用户已表达明确意图）|
| 用户给一句话明显是规则（"永远不要 X" / "默认用 Y" / "禁止 Z"）| 同上 |

### C. 项目级偏好混进来时主动区分

| 用户说 | Claude 判断 |
|---|---|
| "这个项目用 React，所有 component 用 PascalCase" | **项目级** → 写 `<project>/CLAUDE.md`（不是全局）|
| "我所有项目都用 React 19+" | **用户级** → 写 `~/.claude/CLAUDE.md` |

判断标准：包含"这个项目 / 本项目 / 当前项目" → 项目级；包含"所有项目 / 我都 / 默认" → 用户级。

## Claude 的标准接管动作

### Step 1. 判断是用户级 vs 项目级

参考上面 C 段。错位 = 把偏好写错地方，跨设备同步时漏 / 串。

### Step 2. 检查 ~/.claude/CLAUDE.md 是否存在

```
file_exists("~/.claude/CLAUDE.md")?
```

应该都存在（MCC 装时会建）。如不存在 → 从模板拷：
```bash
cp ~/.mcc-install/source/templates/CLAUDE.global.example.md ~/.claude/CLAUDE.md
```

### Step 3. Edit 追加（**不**覆盖）

用 Edit tool。**严格规则**：

- **必须**追加新段落（在合适章节末尾或文件末尾）
- **禁止**修改 / 删除已有行（hook 检测到删除会拦下不自动推，用户得手动确认）
- **禁止**整文件 Write 覆盖（破坏用户已有内容）

**追加位置选择**：

| 用户偏好类型 | 追加到哪个章节 |
|---|---|
| 工具偏好（"用 X 不用 Y"）| `## 其他默认偏好` 末尾 |
| 命名 / 风格规则 | `## 其他默认偏好` 末尾 |
| 跨项目通用工作流 | `## AI 主导开发` 段相关位置 |
| 完全新主题（如"安全约束"）| 文件末尾建新章节 `## <新主题>` |

### Step 4. Hook 自动 sync（不需要 Claude 干预）

PostToolUse hook `post-claudemd-sync` 监听 ~/.claude/CLAUDE.md 改动：
- 纯追加 → 自动 cp 到 dotfiles repo + git commit + git push
- 含删除 → 不自动 push，stderr 提醒用户跑 `/claudemd-sync push` 手动确认

### Step 5. 简短报告

```
✓ 已追加到 ~/.claude/CLAUDE.md：
  X X X
  hook 已自动推送到 GitHub（如已配置 dotfiles）
```

如果未配置 dotfiles：
```
✓ 已追加到 ~/.claude/CLAUDE.md（本机）
  跨设备同步未配置。要装吗？跑 /claudemd-sync init <github-private-repo-url>
```

## 关键约束（Claude 行为）

| 约束 | 怎么做 |
|---|---|
| **永远 Edit 追加，不 Write 覆盖** | 用 Edit tool 在文件末尾或段落末尾添加 |
| **不写项目特定信息到全局** | 见 Step 1 判断标准 |
| **不写 secret 进 CLAUDE.md** | secret 永远走 PROJECT_VAULT.md，CLAUDE.md 是元规则不是数据 |
| **追加内容简洁** | 每条偏好 1-3 行；写在 markdown 列表里 |
| **保留 "Why"** | 偏好后面加一句"原因：xxx"（用户后续判断边界用）|

## 例外：用户主动要求覆盖 / 删除

只有用户**明确**说"删掉 X 这条偏好" / "改写成 Y" → Claude 才能修改 / 删除已有行。

这种情况：
1. Edit 修改 / 删除
2. Hook 检测到删除 → **不自动 push**
3. Claude 立刻提醒用户："改动含删除，hook 没自动推。要确认后推吗？"
4. 用户 y → Claude 跑 `/claudemd-sync push`

## 跨设备工作流（用户视角）

### 设备 A：日常使用

你说"以后用 zod 不用 valibot" → Claude 自动追加 → hook 自动 push GitHub。**不需要任何手动操作**。

### 设备 B：第一次配（onboard）

```bash
# bootstrap 一行带 dotfiles flag
$env:MCC_BOOTSTRAP_ARGS = "--with-dotfiles https://github.com/你/claude-dotfiles"
iwr -useb https://raw.githubusercontent.com/18811184907/mcc/main/bootstrap.ps1 | iex
```

或先装 MCC，再单独配 dotfiles：
```
/claudemd-sync init https://github.com/你/claude-dotfiles
```

完事。设备 B 的 ~/.claude/CLAUDE.md 自动从 GitHub 拉下来 = 设备 A 的偏好都跟着走。

### 设备 A 改了，设备 B 拉

设备 B 跑：
```
/claudemd-sync pull
```

把 GitHub 上 A 推的新偏好拉到 B 本机。

## 不要做的事

- ❌ 不要把 ~/.claude/CLAUDE.md 当 vault 用（不要存 secret，secret 走 PROJECT_VAULT.md）
- ❌ 不要写项目特定的代码风格到 ~/.claude/CLAUDE.md（项目级偏好走 `<project>/CLAUDE.md`）
- ❌ 不要在 CLAUDE.md 里 force-rewrite 已有规则（除非用户明确要）—— 追加优先
- ❌ 不要用 ~/.claude/CLAUDE.md 当 changelog（写得越长 token 占用越大；保持简洁、最多 200 行 hard limit）

## 引用

- 命令：`/claudemd-sync init|push|status|pull`
- Hook：`~/.mcc-install/source/hooks/scripts/hooks/post-claudemd-sync.js`
- 配置文件：`~/.claude/.claudemd-sync.config`（init 后自动建）

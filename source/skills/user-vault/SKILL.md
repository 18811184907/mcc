---
name: user-vault
description: "Claude 自动接管用户级跨项目敏感配置（personal API key / 个人 PAT / git 全局身份 / 跨项目 SSH host）。触发：用户提到跨项目通用 secret、或 project-vault 检测到条目应提升到用户级、或用户问'跨项目共用 secret 放哪'。写 ~/.claude/USER_VAULT.md，hook 自动 sync 到 .user-env.{sh,ps1} + git --global + ~/.ssh/config。与 project-vault 分工：本 skill 跨项目，project-vault 单项目。"
---

# User Vault · 跨项目通用的 AI 接管敏感配置

**核心原则**：USER_VAULT 是机器上**所有项目共用**的 vault；PROJECT_VAULT 是**单项目特有**的。Claude 在对话里检测到 secret 时**自动判断该写哪个**，用户从不手编。

## 与 project-vault 的分工

| 维度 | USER_VAULT (本 skill) | PROJECT_VAULT (project-vault skill) |
|---|---|---|
| 位置 | `~/.claude/USER_VAULT.md` | `<project>/docs/PROJECT_VAULT.md` |
| 范围 | 跨所有项目 | 当前一个项目 |
| 写入触发 | "**我的** OpenAI key" / "**个人** SSH" / "git 身份" | "**本项目**的 DB 密码" / "**这个项目**部署到 X" |
| 同步目标 | `.user-env.sh` + `.user-env.ps1` + `git --global` + `~/.ssh/config` (User block) | `.env.local` + `.env.example` + `~/.ssh/config` (Project block) |
| Git 追踪 | 不属于任何 git repo（在 ~/.claude/） | gitignored 强制 |
| 优先级 | 跨项目兜底 | 同名 key 时覆盖 USER |

## 自动激活：USER vs PROJECT 判断

每次对话里 Claude 检测到 secret 类输入，**先判断是 USER 还是 PROJECT**：

### USER 信号（→ 写 USER_VAULT）

- **GitHub PAT / Personal API keys**（OpenAI / Anthropic / Linear personal token）
- **git 身份**：`GIT_USER_NAME` / `GIT_USER_EMAIL`
- **个人 SSH**：bastion / 个人 VPS / 跨多项目复用的 deploy key
- **个人云凭证**：personal AWS IAM access key
- **关键措辞**：用户说 "**我的** xxx"、"**个人** xxx"、"**所有项目都用的** xxx"、"以后所有项目"

### PROJECT 信号（→ 写 PROJECT_VAULT）

- **本项目的 DB**：`DATABASE_URL` 这种项目特有的
- **本项目的 SaaS 账号**：Stripe live key（一个项目一个）、Sentry DSN
- **本项目的部署目标**：staging / prod 服务器（这个项目专属）
- **关键措辞**：用户说 "**本项目**"、"**这个项目**"、"**当前**"、"**这次**"

### 拿不准 → 问

```
"这个 OPENAI_API_KEY 是你跨项目都用的（写 USER_VAULT），
 还是只这个项目用（写 PROJECT_VAULT）？默认我倾向 PROJECT。"
```

不要默默猜。**v2.6.3 起默认 PROJECT**（之前默认 USER）。理由：

| 场景 | 后果 |
|---|---|
| 实际是 PROJECT 但写到 USER | 全机污染 + 跨项目可能用错 secret + 难恢复 |
| 实际是 USER 但写到 PROJECT | 多写一次（下个项目重填）—— 可恢复，影响范围小 |

**写错 USER 比写错 PROJECT 严重**——所以默认走更安全（更小影响范围）的 PROJECT，只在用户明确说"我的 / 个人 / 跨项目"时才走 USER。

**注意：USER vs PROJECT 同名 key 的覆盖语义**（**关键，仅在 dotenv-based Node 项目里成立**）：

| 工具栈 | USER + PROJECT 同名 key 谁赢 |
|---|---|
| Node + dotenv（默认 `override:true`） | **PROJECT 赢**（dotenv 加载 `.env.local` 覆盖 process.env） |
| Node + dotenv `override:false` | USER 赢（dotenv 不覆盖已存在 env） |
| Python `os.environ` 直接读 | **USER 赢**（没人读 `.env.local`） |
| Python + python-dotenv | 看 `load_dotenv(override=True/False)`，默认 False → USER 赢 |
| Go / Rust / Shell 脚本 | **USER 赢**（直接读 shell env，不加载 `.env`） |
| Vite / Next.js（server side） | dotenv 系，PROJECT 赢 |

**结论**：你期望的"PROJECT 覆盖 USER"**仅在 Node + dotenv 项目里默认成立**。用 Python / Go / Shell 脚本时，shell env 来自 USER 始终是兜底来源——同名 key 时 USER 赢。

实务建议：
- 跨项目共用的（OpenAI / Anthropic key）→ 写 USER_VAULT，所有项目都拿到
- 项目特有的（DB / Stripe live key）→ 写 PROJECT_VAULT
- **避免 USER 和 PROJECT 同名 key**（容易混淆）。如果 PROJECT 真要覆盖 USER 的 key，确认你的项目用 dotenv 且 `override:true`。

## Claude 标准接管动作

**Step 1. 判断 USER vs PROJECT**（按上节）

**Step 2. 若 USER → 检查 ~/.claude/USER_VAULT.md 是否存在**

```
file_exists("$HOME/.claude/USER_VAULT.md")?
```

**Step 3a. 不存在 → Claude 自己建（不让用户做）**

```
1. 找模板：~/.claude/templates/USER_VAULT.example.md
   （installer 装的；备选 ~/.mcc-install/source/templates/）
2. Bash:  cp <template> ~/.claude/USER_VAULT.md
3. 删除模板里的 <your-xxx> 占位行（hook 会跳过含 < > 的占位值，但删掉更干净）
4. 通知："✓ 已建 ~/.claude/USER_VAULT.md，加你说的 <KEY>"
```

**Step 3b. 存在 → 直接 Edit 加条目**

按章节加（Git Identity / Personal API Tokens / Personal SSH / Cloud Personal）。章节不存在就在文件末尾加一个 `## <Section>`。

**Step 4. hook 自动同步（无需手动）**

PostToolUse hook (`post-user-vault-sync`) 自动跑：
- `.user-env.sh` 重建（所有 USER env 变成 `export KEY=value`）
- `.user-env.ps1` 重建（PowerShell 版本）
- `git config --global user.name/email`（如果改了 GIT_USER_*）
- `~/.ssh/config` 更新 MCC-User-Managed 块
- 第一次还会自动追加 `source ~/.claude/.user-env.sh` 到 ~/.bashrc / ~/.zshrc / PowerShell $PROFILE

**Step 5. 简短确认**

```
✓ 已加 OPENAI_API_KEY 到 ~/.claude/USER_VAULT.md
  hook sync: .user-env.sh + .user-env.ps1
  生效：新开 shell 自动加载；当前 shell 跑 `source ~/.claude/.user-env.sh`
  代码用：process.env.OPENAI_API_KEY（所有项目都拿得到）
```

## 提升机制（PROJECT → USER 双向）

### Claude 主动建议提升

当用户在 PROJECT_VAULT 加一个**看起来明显跨项目**的条目，Claude 应该问一句：

```
"OPENAI_API_KEY 看起来你别的项目也会用——要不要提到 ~/.claude/USER_VAULT.md？
 这样所有项目都能用，不用每个项目都写一遍。
 (y/N)"
```

判断"明显跨项目"的启发：
- 字段名是常见 LLM provider key（OPENAI / ANTHROPIC / GROQ / OPENROUTER）
- 字段名是 personal-flavored（含 PERSONAL_ / MY_ 前缀）
- SSH host 是 bastion / 跨多项目共用的

**不要总是问**——只在有强信号时问，避免烦人。

### 用户显式说"提到用户级"

用户说 "把这个挪到 USER_VAULT" / "用户级管理" / "跨项目"：
1. 从 PROJECT_VAULT.md Read 该条目
2. Edit USER_VAULT.md 加条目
3. Edit PROJECT_VAULT.md 删条目
4. 提示："✓ 已迁 KEY 从 PROJECT 到 USER。所有项目都拿得到 process.env.KEY 了。"

### 反向（USER → PROJECT）

少见但合理：用户说 "这个 key 只在这个项目用，从 USER 拿掉":
1. Read USER_VAULT.md 拿值
2. Edit PROJECT_VAULT.md 加条目
3. Edit USER_VAULT.md 删条目
4. 重新触发 user-vault sync（重写 .user-env.sh，那个 export 就消失了）

## Git Identity 特殊处理

`GIT_USER_NAME` / `GIT_USER_EMAIL` 这两个 key 不写 `.user-env.sh`（无意义，git 不读 env），而是 hook 直接跑：

```bash
git config --global user.name "<value>"
git config --global user.email "<value>"
```

用户说 "git 用户名 anoukcupp、邮箱 anoukcupp@gmail.com" → Claude 加进 USER_VAULT 的 `## Git Identity` 段，hook 自动 git config。

## 安全约束（同 project-vault）

| 约束 | 怎么做 |
|---|---|
| 永远不在对话里复述 secret 完整值 | 用户输入"OPENAI_API_KEY 是 sk-proj-abc123" → 确认时只说"已加 OPENAI_API_KEY"，不 echo 那个值 |
| 不在 commit / PR / docs 里包含 USER_VAULT 值 | 同 PROJECT_VAULT |
| 不读 USER_VAULT 给用户看 | 用户问"我 OPENAI_API_KEY 是啥" → 回："去看 ~/.claude/USER_VAULT.md，它在你家目录不属于任何 git" |
| pre-vault-leak-detect hook 也扫 USER_VAULT 值 | 自动覆盖（hook 优先 docs/，但 v2.6 起也扫 USER） |

## Shell 集成细节

第一次保存 USER_VAULT 后 hook 会**幂等**地追加：

**~/.bashrc / ~/.zshrc**（用 marker 避免重复）：
```bash
# >>> MCC user-env autoload >>>
[ -f "$HOME/.claude/.user-env.sh" ] && source "$HOME/.claude/.user-env.sh"
# <<< MCC user-env autoload <<<
```

**PowerShell `$PROFILE`**（**v2.6.2 起 Windows 同时写 PS 5.1 + PS 7+**）：
- PS 7+: `~/Documents/PowerShell/Microsoft.PowerShell_profile.ps1`
- PS 5.1（Win10/11 自带）: `~/Documents/WindowsPowerShell/Microsoft.PowerShell_profile.ps1`

```powershell
# >>> MCC user-env autoload >>>
if (Test-Path "$HOME\.claude\.user-env.ps1") { . "$HOME\.claude\.user-env.ps1" }
# <<< MCC user-env autoload <<<
```

新开 shell 自动加载。当前 shell 立刻生效手动跑一次 source 命令。

**opt-out**: 设环境变量 `MCC_NO_AUTOLOAD=1` 让 hook 不动你的 shell profile（适合用 1Password CLI 等密码管理器自管的高级用户）。

## 常见问题

### Q: 我已经手编过 ~/.bashrc / $PROFILE 加了 export，会冲突吗？
A: 不会。USER_VAULT 用 `# >>> MCC user-env autoload >>>` marker 圈住自己的块，不动你手编的。如果你手编的 export 同名，**你手编的赢**（因为 .bashrc 后面加载，覆盖之前 source 的）。

### Q: 我同时用 PowerShell + Git Bash，两边都装吗？
A: 是的。hook 同时写 `.user-env.sh`（Git Bash 用）+ `.user-env.ps1`（PowerShell 用）+ 两边 profile 都自动加 source 行。

### Q: USER 和 PROJECT 同名 key，哪个赢？
A: **取决于工具栈**——上面"USER vs PROJECT 同名 key 的覆盖语义"section 详列。简短版：

- Node + dotenv 默认 (`override:true`) → PROJECT 赢
- Python `os.environ` / Go / Shell / Python-dotenv 默认 → USER 赢

**实务建议**：避免 USER 和 PROJECT 同名 key，容易混淆。

### Q: 我换电脑了，USER_VAULT 怎么办？

A: USER_VAULT 不进 git（在 ~/.claude/ 住家目录）。**不要 push USER_VAULT 到 git**。换机三种方案：

1. **密码管理器（推荐）**：用 [1Password CLI](https://developer.1password.com/docs/cli/) / [Bitwarden CLI](https://bitwarden.com/help/cli/) / [pass](https://www.passwordstore.org/) 等管 secret 值。`USER_VAULT.md` 里只放占位，shell 启动时由 `op read 'op://...'` 类命令注入真值。MCC 兼容这种 setup（设 `MCC_NO_AUTOLOAD=1` 让 MCC 不动 profile，自己手编 `~/.bashrc` 走密码管理器）。

   ```bash
   # 例：~/.bashrc 里
   export MCC_NO_AUTOLOAD=1
   export OPENAI_API_KEY=$(op read 'op://Personal/OpenAI/api-key')
   export ANTHROPIC_API_KEY=$(op read 'op://Personal/Anthropic/api-key')
   ```

2. **dotfiles repo + SOPS / age 加密**：把 `~/.claude/USER_VAULT.md` 放进**私有** dotfiles repo，用 [SOPS](https://github.com/getsops/sops) 或 [age](https://github.com/FiloSottile/age) 加密。decrypt 后让 Claude 重新触发 user-vault-sync。

   ```bash
   # 例：dotfiles repo 里
   sops -e USER_VAULT.md > USER_VAULT.md.enc
   git add USER_VAULT.md.enc && git commit
   # 新机 clone 后:
   sops -d USER_VAULT.md.enc > ~/.claude/USER_VAULT.md
   # 然后让 Claude 在对话里说"重新同步 USER_VAULT" 触发 hook
   ```

3. **手动 scp（最简）**：`scp ~/.claude/USER_VAULT.md newmachine:~/.claude/`。然后新机让 Claude `Edit ~/.claude/USER_VAULT.md`（哪怕只加一空行）触发 hook 重建 .user-env.{sh,ps1}。

**反模式**：把 `USER_VAULT.md` 直接 push 到 git（即使 private repo）—— git history 永远留 secret 痕迹，泄漏代价大。如果非要走 git，**必须用 #2 加密方案**。

### Q: 跨项目 secret 我能用 1Password CLI / pass / gopass 这种吗？
A: 可以——那是更安全的路。USER_VAULT 是"无密码管理器"场景的最简方案。如果你已经在用密码管理器，更好的做法是 `~/.bashrc` 里 `export OPENAI_API_KEY=$(op read 'op://...')`，USER_VAULT 留 placeholder + 备注 source 来自 1Password。

## 引用

- `~/.claude/templates/USER_VAULT.example.md` —— 标准模板
- `~/.mcc-install/source/hooks/scripts/hooks/post-user-vault-sync.js` —— sync 实现
- `project-vault` skill —— 项目级 vault（搭配使用）
- `claudemd-sync` skill —— 用户级偏好同步（USER_VAULT 管 secret，CLAUDE.md 管行为偏好，互补）

# User Vault · ⚠ NEVER COMMIT (lives in ~/.claude/, never in any git repo)

> **跨项目通用**的敏感配置：personal API key / 个人 SSH / git 身份 / 任何"在很多项目都会用到"的东西。
>
> 与项目级 `docs/PROJECT_VAULT.md` 区别：
> - **USER_VAULT 是你机器上所有项目共用的**（住在 ~/.claude/，永远不进任何 git）
> - **PROJECT_VAULT 是这个项目特有的**（住在项目里，gitignored）
> - 同名 key → PROJECT 覆盖 USER（项目可以重写）
>
> MCC user-vault-sync hook 自动同步到：
>   - `~/.claude/.user-env.sh`（Bash/Zsh `source` 用，让所有 shell 拿到 env）
>   - `~/.claude/.user-env.ps1`（PowerShell `dot-source` 用）
>   - `~/.ssh/config`（追加 `# MCC-User-Managed` 块）
>   - `git config --global user.name/user.email`（GIT_USER_* key 触发）
>   - 自动追加 `source ~/.claude/.user-env.sh` 到 ~/.bashrc / ~/.zshrc 和 PowerShell `$PROFILE`（idempotent，加过就不再加）
>
> **无须手动 commit**：~/.claude 在用户家目录，不属于任何 git 仓库。

---

## Git Identity

- GIT_USER_NAME = `<your-name-here>`
- GIT_USER_EMAIL = `<your-email-here>`
- 备注：保存后 hook 自动 `git config --global user.name/email`

## Personal API Tokens

- OPENAI_API_KEY = `<your-openai-api-key>`
- ANTHROPIC_API_KEY = `<your-anthropic-api-key>`
- GITHUB_PERSONAL_ACCESS_TOKEN = `<your-github-pat>`
- 备注：所有项目共用——code 里 `process.env.OPENAI_API_KEY` 会从 .user-env.sh 拿到

## Personal SSH

- bastion:
    host = bastion.example.com
    user = jumpuser
    key = ~/.ssh/id_ed25519
    port = 22

- personal-vps:
    host = vps.example.com
    user = me
    key = ~/.ssh/id_ed25519

## Cloud Personal

- AWS_ACCESS_KEY_ID = `<personal-iam-key>`
- AWS_SECRET_ACCESS_KEY = `<personal-iam-secret>`
- 备注：CI/项目用的 IAM 角色不写这里，写项目 PROJECT_VAULT

---

## 用法说明（不会进 sync）

**与项目 vault 怎么搭配**

- 跨项目用的：写这里（USER_VAULT）。例：你个人的 OPENAI_API_KEY。
- 单项目用的：写项目里的 `docs/PROJECT_VAULT.md`。例：本项目的 DATABASE_URL。
- Claude 自动判断：你提"我的 OpenAI key 是 sk-xxx" → 写 USER；提"本项目的 DB 密码" → 写 PROJECT。
- 拿不准时 Claude 会问。

**怎么让 shell 拿到 env**

USER_VAULT 第一次保存时 hook 会自动追加 `source ~/.claude/.user-env.sh` 到你的 `~/.bashrc`（和 PowerShell `$PROFILE`）。新开 shell 自动加载。

已经开着的 shell 要立刻生效：手动跑一次 `source ~/.claude/.user-env.sh`。

**项目里的 .env.local 是否要重复列？**

不需要。code 用 `process.env.OPENAI_API_KEY` 时，dotenv 库找不到会 fallback 到 shell env（来自 .user-env.sh）。

如果你的 framework 不 fallback（少见），就在项目 PROJECT_VAULT 里也列同名 key，会写进 .env.local。

**字段名规则**：`UPPER_SNAKE_CASE`（`A-Z`、`0-9`、`_`），开头必须字母。

**注释**：`备注：xxx` / `note: xxx` 开头的 bullet 不进 sync。

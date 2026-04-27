# Project Vault · ⚠ NEVER COMMIT

> 这个文件是你这个项目的**唯一真相源**：所有 secret / IP / SSH key / 数据库密码 都写在这里。
>
> MCC vault-sync hook 自动同步到三个地方：
>   - `.env.local`（gitignored，代码 `process.env.X` 读这个）
>   - `.env.example`（进 git，列字段名占位）
>   - `~/.ssh/config`（追加 SSH 主机块，带 `# MCC-Managed` marker）
>   - `.claude/SECRETS-INDEX.md`（进 git，只列字段名 + 描述，无值）
>
> **强制 gitignore**：`.gitignore` 已自动加 `.claude/PROJECT_VAULT.md`、`.env.local`、`.env.*.local`、`.deploy.local.md`。

---

## Database

- DATABASE_URL = `postgres://user:password@host:5432/dbname`
- REDIS_URL = `redis://:password@host:6379`
- 备注：DB 每 90 天轮换，最近一次 2026-04-27

## API Tokens

- OPENAI_API_KEY = `<your-openai-api-key>`
- ANTHROPIC_API_KEY = `<your-anthropic-api-key>`
- STRIPE_SECRET_KEY = `<your-stripe-secret-key>`
- GITHUB_PERSONAL_ACCESS_TOKEN = `<your-github-pat>`

## Auth Secrets

- JWT_SECRET = `at-least-32-bytes-of-random-data-here`
- WEBHOOK_HMAC_SECRET = `random-secret-for-signing-webhooks`
- COOKIE_SIGNING_SECRET = `another-random-secret`

## SSH / 服务器

- prod-server:
    host = 192.168.1.10
    user = deploy
    key = ~/.ssh/prod_id_rsa
    port = 22

- staging-server:
    host = 192.168.1.20
    user = deploy
    key = ~/.ssh/staging_id_rsa

- bastion:
    host = bastion.example.com
    user = jumpuser
    key = ~/.ssh/bastion_id_rsa

## 部署目标

- prod = AWS ec2-prod-01 (us-east-1)
- staging = AWS ec2-staging-01 (us-east-1)
- 备注：prod 走蓝绿部署，staging 直接覆盖

---

## 用法说明（不会进 sync）

**加 env**：在任何 `## <Section>` 下加一行 `- KEY = \`value\``。保存后 `.env.local` 自动更新。

**加 SSH 主机**：在 `## SSH` 下加：
```
- 新主机名:
    host = ip-or-domain
    user = your-user
    key = ~/.ssh/your-key
    port = 22
```
保存后 `~/.ssh/config` 自动追加，立刻可以 `ssh 新主机名` 连接。

**注释**：用 `备注：xxx` 或 `note: xxx` 开头的 bullet 不进 sync，只是给你看的笔记。

**字段名规则**：env 字段必须是 `UPPER_SNAKE_CASE`（`A-Z`、`0-9`、`_`），开头必须字母。

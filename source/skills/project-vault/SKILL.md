---
name: project-vault
description: "项目级敏感配置统一管理 skill。用户说'存这个 token / 存密钥 / 存数据库密码 / SSH key / API key / 部署服务器 IP / .env 该放哪'时激活。MCC 装时自动启用 post-vault-sync hook：用户只需在 .claude/PROJECT_VAULT.md 一处 markdown 文件里写所有敏感值，hook 自动同步到 .env.local（gitignored，代码 process.env 读）+ .env.example（进 git，列字段名占位）+ ~/.ssh/config（追加 SSH 主机块）+ .claude/SECRETS-INDEX.md（进 git，只列字段名）。永远不进 git（hook 强制 .gitignore）。"
---

# Project Vault · 项目级敏感配置统一管理

**核心原则**：所有敏感配置只写**一处** —— `<project>/.claude/PROJECT_VAULT.md`。hook 自动同步到所有标准位置。

## 何时激活

- 用户问"我有个 API token，放哪？"
- 用户说"存这个数据库密码 / 服务器 IP / SSH key"
- 用户说"代码里有硬编 secret，怎么搬出去"
- 用户问 ".env 在哪 / 怎么设环境变量"
- 用户说"团队怎么共享 secret"

## 期望结果

用完 skill 后用户应该：

1. **知道唯一存储位置** —— `<project>/.claude/PROJECT_VAULT.md`
2. **知道格式** —— markdown 分章节，env 用 `- KEY = \`value\``，SSH 用嵌套块
3. **知道自动同步** —— 改完 vault 文件保存，4 个目标位置自动更新
4. **不需要手动管 .env / .ssh/config** —— hook 全包了
5. **不需要担心 commit 进 git** —— hook 强制 `.gitignore`

## 工作流

### Step 1. 检查 vault 文件是否存在

```bash
ls <project>/.claude/PROJECT_VAULT.md
```

- **不存在** → 从 MCC 模板拷一份：
  ```bash
  cp ~/.mcc-install/source/templates/PROJECT_VAULT.example.md \
     <project>/.claude/PROJECT_VAULT.md
  ```
  然后编辑里面的占位值。

- **存在** → 直接编辑追加。

### Step 2. 协助用户加条目

判断用户给的是哪种类型，引导加到正确章节：

| 用户说的 | 加到哪个章节 | 格式 |
|---|---|---|
| API key / token | `## API Tokens` | `- KEY_NAME = \`value\`` |
| 数据库密码 / 连接串 | `## Database` | `- DATABASE_URL = \`postgres://...\`` |
| JWT secret / HMAC | `## Auth Secrets` | `- JWT_SECRET = \`32-byte-hex\`` |
| SSH 私钥路径 + IP | `## SSH / 服务器` | 嵌套块（见下面）|
| 服务器元数据（不敏感）| `## 部署目标` | `- prod = AWS ec2-x` |

**SSH 嵌套格式**：

```markdown
## SSH / 服务器

- prod-server:
    host = 192.168.1.10
    user = deploy
    key = ~/.ssh/prod_id_rsa
    port = 22
```

字段名固定：`host` / `hostname`、`user`、`key` / `identityfile`、`port`。

**注释**：用 `备注：xxx` 或 `note: xxx` 开头不会被 sync 当成字段。

### Step 3. 保存后 → hook 自动跑

PostToolUse hook `post-vault-sync` 监听 Write/Edit on `.claude/PROJECT_VAULT.md`，触发：

1. 解析 markdown
2. 写 `<project>/.env.local`（k=v 列表，gitignored）
3. 写 `<project>/.env.example`（key 名 + 占位值，进 git）
4. 写 `<project>/.claude/SECRETS-INDEX.md`（字段名清单 + 备注，进 git）
5. 追加 `~/.ssh/config`（带 `# MCC-Managed: <project>` 块标记，幂等）
6. 强制 `.gitignore` 含 `.claude/PROJECT_VAULT.md`、`.env.local`、`.env.*.local`、`.deploy.local.md`

stderr 输出：`[vault-sync] ✓ Synced N env entries + M SSH hosts`

### Step 4. 代码侧使用

完全标准的 `.env` 用法：

**Node**：
```js
import 'dotenv/config';
const apiKey = process.env.OPENAI_API_KEY;
```

**Python**：
```python
from dotenv import load_dotenv
import os
load_dotenv('.env.local')
api_key = os.getenv('OPENAI_API_KEY')
```

**SSH**：
```bash
ssh prod-server   # ~/.ssh/config 已自动配置好
```

### Step 5. 启动校验（强烈推荐）

`/init` 流程会建议加启动校验代码（zod / pydantic）：

```typescript
import { z } from 'zod';
const env = z.object({
  DATABASE_URL: z.string().url(),
  OPENAI_API_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(32),
}).parse(process.env);
```

启动时缺值立刻挂，不到运行时才发现。

## 安全护栏

| 护栏 | 怎么实现 |
|---|---|
| **强制 gitignore** | post-vault-sync hook 启动时自动加 .gitignore（4 行）|
| **误进 git 检测** | 用户主动跑 `git status` 看到 PROJECT_VAULT.md staged → 立刻 `git rm --cached .claude/PROJECT_VAULT.md` 撤销 |
| **不自动 inject 到 context** | SessionStart 不读这个文件 |
| **leak detect** | pre-vault-leak-detect hook 监听所有 tool 调用，发现 vault 值出现在 input 里 → 警告（不阻断）|
| **Claude 主动读时**| Claude 看到要读这个文件先警告："secret 会进对话历史，确认吗？" |

## 重要：Claude 自己的行为约束

当 Claude 自己被要求读取 `PROJECT_VAULT.md` 内容时：

- **不要**直接 cat / head / Read 整个文件输出到对话
- **不要**在生成的 commit message / PR description / docs 里包含 vault 字段值
- **不要**把 vault 值粘贴到 search query / web request / 其他 tool input 里
- **可以**：
  - 引用字段名（"用 `process.env.OPENAI_API_KEY`"）
  - 告诉用户某个字段是否存在（`grep -q "^- OPENAI_API_KEY" PROJECT_VAULT.md && echo "已设置"`）
  - 提示用户去文件里加 / 改某个字段

## 常见问题

### "已经有 .env 了，怎么迁过来？"

```bash
# 把 .env 内容粘到 PROJECT_VAULT.md 的合适章节，加 - 前缀和反引号：
# DATABASE_URL=postgres://...   →   - DATABASE_URL = `postgres://...`
```

保存 → hook 同步 `.env.local`。然后**删掉** `.env`（或 rename 备份），改用 `.env.local`。

### "团队同事 clone 后怎么搞？"

1. 同事看 `.env.example`（进 git 的）+ `.claude/SECRETS-INDEX.md`（进 git 的）→ 知道有哪些 key
2. 找你拿真实值
3. 同事自己建 `<project>/.claude/PROJECT_VAULT.md` 填进去
4. 同事保存 → hook 自动同步到他本地的 `.env.local` / `~/.ssh/config`

### "我想换一台机器开发"

新机器上克隆项目后，`.claude/PROJECT_VAULT.md` 不会跟过来（gitignored）。重新建一个并填值。

### "secret 还在 git 历史里没洗掉怎么办"

立刻：
1. 改这个 secret（轮换 / 重新生成 token）—— 这是第一步，最重要
2. 用 `git filter-branch` / BFG Repo-Cleaner 清历史（高级操作）
3. force-push（仅当你确定全部协作者已知）

**不要**寄希望于 secret 在 git 历史里隐藏 —— 假设已被复制 = 必须轮换。

## 引用

- `~/.mcc-install/source/templates/PROJECT_VAULT.example.md` —— 标准模板
- `~/.mcc-install/source/hooks/scripts/hooks/post-vault-sync.js` —— sync 实现
- `~/.mcc-install/source/hooks/scripts/hooks/pre-vault-leak-detect.js` —— 泄漏检测

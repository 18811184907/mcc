---
name: project-vault
description: "Claude 自动接管项目级敏感配置（API key / DB 密码 / 部署 IP / SSH / token）。触发：用户在对话里说出任何 secret 或 IP、或代码里硬编 secret、或问 '.env 怎么放 / token 存哪'。写 .claude/PROJECT_VAULT.md，hook 自动 sync 到 .env.local + .env.example + ~/.ssh/config + SECRETS-INDEX.md，强制 .gitignore。与 user-vault 分工：本 skill 单项目，跨项目用 user-vault。"
---

# Project Vault · AI 自动接管的项目级敏感配置

**核心原则**：用户**从不**手动管 vault 文件 / 拷模板 / 编辑。Claude 在对话里检测到 secret 类信息时**自动**创建 + 写入 + 触发同步。用户只需说"我有个 token: xxx" 这种话就行。

## 自动激活的场景（Claude 必须主动接管）

每次对话里，Claude **持续监控**用户输入是否包含 secret-like 信息：

### A. 用户主动提到 secret 类的值

| 用户说 | Claude 立刻做 |
|---|---|
| "OPENAI_API_KEY 是 sk-xxx" | 加进 vault 的 `## API Tokens` 段 |
| "数据库密码 abc123" / "DB_PASSWORD = xxx" | 加进 `## Database` 段 |
| "JWT secret 是 32-byte-xxxx" | 加进 `## Auth Secrets` 段 |
| "我的 prod 服务器 192.168.1.10，用户 deploy，key 在 ~/.ssh/prod_id_rsa" | 加进 `## SSH / 服务器` 段（嵌套块）|
| "Stripe live key sk_live_xxx" | 加进 `## API Tokens` 段 |
| "部署到 AWS ec2-xxx" | 加进 `## 部署目标` 段 |

### B. Claude 在工作中产出 secret 推荐

| 场景 | Claude 做 |
|---|---|
| 用户让 Claude 生成 JWT secret / HMAC key | 生成后**直接写 vault**，不要打印到对话 |
| Claude 帮用户配 OAuth 拿到 client_secret | 同上 |
| Claude 帮用户配 webhook 给随机 secret | 同上 |

### C. 防御场景（v2.5.0 hook 已部分覆盖，skill 跟进）

| 场景 | Claude 做 |
|---|---|
| 用户写代码硬编 `apiKey = "sk-xxx"` | pre-secret-detect hook 警告 → Claude 主动 refactor 到 vault + `process.env.X` |
| 用户问 ".env 该放哪" | 解释 vault → .env.local 关系，说明用户只需告诉 Claude secret 值，Claude 自动写 vault |
| 用户复制粘贴某个 .env 内容到对话 | Claude 立刻把所有条目搬到 vault |

## Claude 的标准接管动作（每次都走这个）

**Step 1. 检查 vault 是否存在**

```
file_exists("<cwd>/.claude/PROJECT_VAULT.md")?
```

**Step 2a. 不存在 → Claude 自己建（不让用户做）**

```
1. 检查 dist 模板：~/.mcc-install/dist/claude-code/.claude/templates/PROJECT_VAULT.example.md
   （或 ~/.mcc-install/source/templates/ 备选）
2. Bash:  cp <template> <project>/.claude/PROJECT_VAULT.md
3. 删除模板里的示例值（OPENAI_API_KEY = `<your-openai-api-key>` 那些占位）
   保留章节标题（## Database / ## API Tokens / ## Auth Secrets / ## SSH / 服务器 / ## 部署目标）
4. 通知用户："vault 已建在 <path>，我会把你说的 X 加进去"
```

**Step 2b. 存在 → 直接 Edit 加条目**

用 Edit tool 在合适章节追加。如果章节不存在就在文件末尾加一个。

**Step 3. 不需要手动触发 sync**

Edit 完成后 PostToolUse hook (`post-vault-sync`) **自动**触发同步到 .env.local / .env.example / ~/.ssh/config / SECRETS-INDEX.md / .gitignore。

**Step 4. 简短确认给用户**

```
✓ 已加到 vault：OPENAI_API_KEY
  hook 同步：.env.local + .env.example + SECRETS-INDEX.md
  代码用：process.env.OPENAI_API_KEY
```

不要解释 4 个目标文件的细节（用户不关心，hook 自动管）。

## 关键约束（Claude 的安全边界）

| 约束 | 怎么做 |
|---|---|
| 永远不在对话里复述完整 secret 值 | 用户说"OPENAI_API_KEY 是 sk-proj-abc123"后，Claude 输出确认时只说"已加 OPENAI_API_KEY"，不要 echo 那个 sk-proj-abc123 |
| 永远不在 commit message / PR description / docs 里包含 vault 值 | 提到字段时只用字段名 |
| 永远不把 vault 值粘到 search query / web fetch / 其他 tool input | pre-vault-leak-detect hook 会警告 |
| 不要 cat / head 整个 vault 文件输出 | 要看用 grep 看特定字段名是否存在，不显示值 |
| 用户问"我的 OPENAI_API_KEY 是啥" | 回："去看 .claude/PROJECT_VAULT.md（它是 gitignored 安全的）"。**不直接读出来给用户看** |

## 用户视角的简化

老办法（v2.5.0 文档错的）：用户拷模板 → 编辑 → 保存 → hook 跑

**新办法（v2.5.1 起）**：用户在对话里说"OPENAI_API_KEY 是 sk-xxx" → 完事。

Claude 接管所有：建文件、加条目、触发 sync、解释。用户什么都不用做。

## 老条目搬家（如果用户已有 .env）

用户说"我已经有 .env 了" → Claude:

1. Read 用户的 .env
2. 把每行 KEY=VALUE 转成 vault 格式 `- KEY = \`VALUE\``
3. 按命名猜分到合适章节（KEY/SECRET/TOKEN → API Tokens；DB/DATABASE → Database；JWT/HMAC → Auth Secrets）
4. 写到 vault → hook 自动 sync 出 .env.local
5. 让用户 rename `.env` → `.env.backup`（或删）

## 团队协作（多人 clone）

新同事 clone 项目后：

1. 看 `.claude/SECRETS-INDEX.md`（进 git 的字段名清单）+ `.env.example`（key 占位）→ 知道有哪些 secret
2. 找你拿真实值
3. **不要让同事自己拷模板**。让他**告诉 Claude**："OPENAI_API_KEY 是 xxx"，Claude 自动建他本机的 vault + 同步。

## 常见问题

### "我已经在 .env 里写了一堆，怎么搬？"
告诉 Claude："我有 .env，搬到 vault"。Claude 自动 read .env → 转格式 → 写 vault → 你只需 rename 旧 .env。

### "团队同事第一次跑要做啥？"
让他在对话里跟 Claude 说真实值，Claude 自动建他本机 vault。**不要他手动拷模板**。

### "secret 不小心 commit 进 git 了？"
立刻：(1) 轮换该 secret（重新生成）→ (2) 用 BFG / git filter-branch 清历史 → (3) 同事 force-pull。**假设已被复制 = 必须轮换**。

## 与 user-vault skill 的分工（v2.6 起）

| 维度 | PROJECT_VAULT (本 skill) | USER_VAULT (`user-vault` skill) |
|---|---|---|
| 位置 | `<project>/docs/PROJECT_VAULT.md` | `~/.claude/USER_VAULT.md` |
| 范围 | 当前项目 | 跨所有项目 |
| 写入信号 | "**本项目**的 DB 密码" / "Stripe key" | "**我的** OpenAI key" / "git 用户名" / "**个人** SSH" |

### 自动建议提升到 USER_VAULT

当用户在 PROJECT_VAULT 加的条目**明显跨项目**（OPENAI / ANTHROPIC / GROQ key、PERSONAL_/MY_ 前缀、bastion SSH host），Claude 应该问一句：

```
"OPENAI_API_KEY 看起来你别的项目也会用——要不要提到 ~/.claude/USER_VAULT.md？
 这样所有项目都能用，不用每个项目都写一遍。"
```

不要总问，只在有强信号时。详细判断标准在 `user-vault` skill。

## 引用

- `~/.mcc-install/source/templates/PROJECT_VAULT.example.md` —— 标准模板（Claude 用）
- `~/.mcc-install/source/hooks/scripts/hooks/post-vault-sync.js` —— sync 实现
- `~/.mcc-install/source/hooks/scripts/hooks/pre-vault-leak-detect.js` —— 泄漏检测
- `user-vault` skill —— 用户级跨项目 vault（搭配使用）

---
name: database-schema-doc
description: "Claude 自动维护项目数据库 schema 文档（docs/SCHEMA.md）。触发：(a) 用户提到表结构（'我加了 users 表，有 email/password 字段'）；(b) 用户写/改 ORM 模型（Prisma / SQLAlchemy / TypeORM）；(c) 用户写/改 migration SQL；(d) 用户问'数据库怎么设计的 / 表结构在哪'。Claude 自动检查 docs/SCHEMA.md 是否存在，不存在就建（基于检测到的 ORM stub 表骨架），存在就直接 Edit 加表/字段。业务含义优先用对话上下文；缺少时填 '_TODO: 业务含义_' 占位让用户后补。**用户从不需要手动维护 schema 文档**。"
---

# Database Schema Doc · AI 自动接管的项目数据库结构文档

**核心原则**：用户**从不**手动维护 `docs/SCHEMA.md`。Claude 在对话里检测到 schema 变化信号时**主动**写入。

## 自动激活的场景（Claude 必须主动接管）

### A. 用户在对话里提到表 / 字段

| 用户说 | Claude 立刻做 |
|---|---|
| "加一张 users 表，字段 email、password、created_at" | Edit docs/SCHEMA.md 追加 `## users` 段 + 字段表 |
| "users 表加个 deleted_at 字段做软删" | Edit docs/SCHEMA.md 在 users 段追加字段 |
| "把 password 字段改成 password_hash" | Edit docs/SCHEMA.md 修对应行 + 加备注"v0.X 改名" |
| "orders 关联 users 表（user_id 外键）" | 在 orders 段加 `**关系**` 子段 |
| "users.email 加唯一索引" | 在 users 段的 `**索引**` 行追加 |
| "DB 改名了，X 表删了" | 在 SCHEMA.md 标 `## ~~X~~ (deprecated 2026-04-28)` |

### B. Claude 在写代码时看到 schema 定义

| 场景 | Claude 做 |
|---|---|
| 用户让 Claude 写 Prisma model | 写完 `.prisma` 文件后**立刻**追加 docs/SCHEMA.md |
| 用户让 Claude 写 SQLAlchemy / Pydantic model | 同上 |
| 用户让 Claude 写 SQL migration（CREATE TABLE / ALTER TABLE）| 写完 SQL 后**立刻**追加 docs/SCHEMA.md |
| 用户改了 ORM model 文件 | 跑 schema-change-remind hook 后**主动** Edit docs/SCHEMA.md |

### C. 用户问 schema 相关

| 用户问 | Claude 做 |
|---|---|
| "我们数据库有哪些表" | Read docs/SCHEMA.md 总结（**只表名 + 用途，不读字段值**）|
| "users 表的 email 是怎么用的" | Read docs/SCHEMA.md 的 users 段，引用业务规则段 |
| "schema 在哪" | "在 `docs/SCHEMA.md`（进 git，所有人能看）" |

## Claude 的标准接管动作

### Step 1. 检查 SCHEMA 文件是否存在

```
file_exists("<cwd>/docs/SCHEMA.md")?
```

### Step 2a. 不存在 → Claude 自己建

```
1. ensureDir("<cwd>/docs")
2. 检测项目 ORM 栈：
   - 有 prisma/schema.prisma → 解析 model 块 → stub 表骨架
   - 有 alembic/versions/*.py → 解析最新 migration → stub
   - 有 db/schema.rb (Rails) → 解析 → stub
   - 有 *.sql 含 CREATE TABLE → 解析 → stub
   - 都没有 → 写空模板（章节标题 + 一段说明）
3. 业务含义段一律标 _TODO: 业务含义_ 让用户后补
4. 通知用户："已建 docs/SCHEMA.md，stub 了 N 个表的字段。业务含义段标了 TODO，你后续告诉我每张表是干嘛的我会帮你补。"
```

### Step 2b. 存在 → 直接 Edit

用 Edit tool 在合适位置追加 / 修改。如果对应表段不存在就在文件末尾加。

### Step 3. 简短确认给用户

```
✓ docs/SCHEMA.md 已更新：users 表加 deleted_at 字段（软删）
```

## SCHEMA.md 标准格式

```markdown
# Schema · 数据库结构 + 业务含义

> 项目数据库的真相源。任何表 / 字段变更必须同步这里。
> Claude 自动维护（检测到 schema 变化 / 用户提到表字段时立刻更新）。
> 连接串 / 密码见 `.claude/PROJECT_VAULT.md`（不进 git）。

## users

**用途**: 用户主表，账号 / 登录 / 资料

| 字段 | 类型 | 含义 | 备注 |
|---|---|---|---|
| id | UUID PK | 用户唯一标识 | 自动生成 |
| email | varchar(320) UNIQUE | 登录邮箱 | RFC 5321 |
| password_hash | varchar(60) | bcrypt 哈希 | 永不返给前端 |
| created_at | timestamptz | 注册时间 | 自动填 |
| deleted_at | timestamptz NULL | 软删 | NULL = 活跃 |

**关系**:
- 1:N → `orders` (orders.user_id)
- 1:1 → `user_profiles` (user_profiles.user_id)

**索引**: email (unique), deleted_at (partial WHERE NULL)

**业务规则**:
- email 注册需邮件验证
- 密码 8 位 + 1 大写 + 1 数字（应用层校验）
- 软删 30 天后物理删（合规）

---

## orders

**用途**: _TODO: 业务含义_

| 字段 | 类型 | 含义 | 备注 |
|---|---|---|---|
| id | UUID PK | 订单 ID | |
| user_id | UUID FK | 下单用户 | → users.id |
| ... | | | |

**关系**: ...
**索引**: ...
**业务规则**: _TODO: 在用户给上下文时补_
```

## ORM 自动 stub 规则

### Prisma → SCHEMA.md

```prisma
model User {
  id         String   @id @default(uuid())
  email      String   @unique
  password   String
  createdAt  DateTime @default(now()) @map("created_at")
  deletedAt  DateTime? @map("deleted_at")

  orders     Order[]
}
```

→ Stub 成：

```markdown
## users  (Prisma model: User)

**用途**: _TODO: 业务含义_

| 字段 | 类型 | 含义 | 备注 |
|---|---|---|---|
| id | String PK | _TODO_ | uuid 默认 |
| email | String UNIQUE | _TODO_ | |
| password | String | _TODO_ | |
| created_at | DateTime | _TODO_ | now() 默认 |
| deleted_at | DateTime NULL | _TODO_ | |

**关系**:
- 1:N → `orders`

**业务规则**: _TODO_
```

### SQLAlchemy / Pydantic 类似规则

把 Column / Field 定义抽取成字段表行。

### SQL CREATE TABLE 类似规则

正则解析 column 定义。

## 业务含义来源（Claude 主动推断 + 提问填补）

| 来源 | 优先级 |
|---|---|
| 用户对话上下文（"users 表存账号"）| **最高**，直接用 |
| 字段命名暗示（`email` 一看就是邮箱）| 中，自动填一句 |
| 注释 / docstring（model 上的 `///` 或 `#`）| 中，搬运过来 |
| 都没有 | **最低**，标 `_TODO: 业务含义_` 让用户填 |

## 关键约束（Claude 行为）

| 约束 | 怎么做 |
|---|---|
| 永远 Edit，不 Write | 用 Edit 工具追加，避免覆盖现有人写的内容 |
| 不删除用户填的"业务规则"段 | 即使 schema 字段被 ORM 删了，业务规则保留，标 `~~deprecated~~` |
| 不输出 SQL 真值 / 数据 | SCHEMA.md 只描述结构，不存数据样本（除非用户明确给 fixture）|
| 跟 ADR 协作 | 重大决策（"用 Postgres 不用 MySQL"）写 `docs/adr/`，**不**塞 SCHEMA.md。SCHEMA.md 只描述当前状态 |
| 跟 PROJECT_VAULT.md 协作 | DATABASE_URL 等连接串放 vault，不进 SCHEMA.md |

## 用户视角的简化

旧办法（手动维护）：每次改 schema 自己去更新文档，一定漏 → 文档越来越陈旧。

**新办法（v2.5.1 起）**：
- 你在对话里随便说"加 users 表，字段 email/password" → Claude 立刻写
- 你跑 `prisma migrate dev` 加新字段 → hook 提醒 Claude → Claude 主动更新 SCHEMA.md
- 你问"我们数据库结构是啥" → Claude 总结 SCHEMA.md 给你看

**你不需要打开 docs/SCHEMA.md 手动改任何东西**。所有维护 Claude 接管。

## 团队协作（schema 文档进 git）

`docs/SCHEMA.md` **进 git**（跟 vault 不同）。这样：

- 团队同事 clone 后立刻看到完整 schema 文档
- PR review 时 schema 改动 + SCHEMA.md 更新一起 review
- 历史可追溯：`git log docs/SCHEMA.md` 看任何字段什么时候加 / 改 / 删

## 新同事 onboarding

新同事 clone 项目 →

1. Read docs/SCHEMA.md → 知道所有表 + 用途 + 业务规则
2. 不用问你"这字段干嘛的"

这是 schema 文档的核心价值。维护好它 = 给团队节省海量沟通成本。

## 引用

- `~/.mcc-install/source/templates/SCHEMA.example.md` —— 标准模板
- 数据库决策 → `architecture-decision-records` skill（写 docs/adr/）
- 数据库密码 → `project-vault` skill（写 .claude/PROJECT_VAULT.md）

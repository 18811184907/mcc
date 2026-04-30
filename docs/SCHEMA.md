# Schema · 数据库结构 + 业务含义

> 项目数据库的真相源。任何表 / 字段变更必须同步这里。
>
> Claude 自动维护：检测到 schema 变化 / 用户在对话里提到表字段时**立刻更新**。
> 用户**从不**手动编辑这个文件。
>
> 连接串 / 密码见 `.claude/PROJECT_VAULT.md`（不进 git）。
> 数据库选型决策见 `docs/adr/0001-database-choice.md`。

---

## users

**用途**: 用户主表，账号 / 登录 / 资料

| 字段 | 类型 | 含义 | 备注 |
|---|---|---|---|
| id | UUID PK | 用户唯一标识 | 自动生成 |
| email | varchar(320) UNIQUE | 登录邮箱 | RFC 5321 上限 |
| password_hash | varchar(60) | bcrypt 哈希 | **永不返给前端** |
| created_at | timestamptz | 注册时间 | 自动填 |
| deleted_at | timestamptz NULL | 软删时间 | NULL = 活跃 |

**关系**:
- 1:N → `orders` (orders.user_id)
- 1:1 → `user_profiles` (user_profiles.user_id)

**索引**:
- email (unique)
- deleted_at (partial index WHERE deleted_at IS NULL)

**业务规则**:
- email 注册需邮件验证
- 密码至少 8 位 + 1 大写 + 1 数字（应用层校验）
- 软删 30 天后物理删（GDPR 合规）

---

## orders

**用途**: _TODO: 业务含义（让 Claude 在对话里告知后自动填）_

| 字段 | 类型 | 含义 | 备注 |
|---|---|---|---|
| id | UUID PK | 订单 ID | |
| user_id | UUID FK | 下单用户 | → users.id |
| total_amount | decimal(10,2) | 订单总额 | 单位元 |
| status | enum('pending','paid','shipped','delivered','cancelled') | 订单状态 | |
| created_at | timestamptz | 下单时间 | |
| paid_at | timestamptz NULL | 支付完成时间 | NULL = 未支付 |

**关系**:
- N:1 → `users` (user_id → users.id)
- 1:N → `order_items` (order_items.order_id)

**索引**:
- user_id
- status (用于按状态查询)
- (user_id, created_at DESC)

**业务规则**: _TODO: 当用户告知后 Claude 自动补_

---

## sessions

**用途**: 用户登录会话，JWT refresh token 管理

| 字段 | 类型 | 含义 | 备注 |
|---|---|---|---|
| id | UUID PK | 会话 ID | |
| user_id | UUID FK | 所属用户 | → users.id |
| refresh_token | varchar(255) UNIQUE | 长生命 token | 哈希存储 |
| user_agent | text | 客户端 UA | |
| ip | inet | 登录 IP | |
| created_at | timestamptz | 登录时间 | |
| expires_at | timestamptz | 过期时间 | 默认 30 天 |

**关系**:
- N:1 → `users`

**索引**:
- refresh_token (unique)
- user_id
- expires_at (清理过期会话)

**业务规则**:
- refresh_token 旋转：每次刷新生成新 token，旧 token 立即失效
- 用户登出 → 删本会话
- 改密码 → 删该用户所有会话（强制重登）

---

## migration 历史

详细 migration 记录见 `docs/adr/db/`（每个 migration 一个 .md，描述改动 + 回滚方案 + 影响代码）。

本文件只描述**当前**结构。

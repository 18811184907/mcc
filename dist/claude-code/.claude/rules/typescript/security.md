---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
# TypeScript / JavaScript Security

> 扩展 [common/security.md](../common/security.md) 的 TS/JS 特定内容。

## Secret 管理

```typescript
// 错：硬编
const apiKey = "sk-proj-xxxxxxxx";

// 错：运行时才发现缺
const apiKey = process.env.OPENAI_API_KEY;  // undefined 也能跑
await openai.chat(apiKey!, ...);            // 到这里才崩

// 对：启动时校验所有 env
import { z } from 'zod';

const env = z.object({
  OPENAI_API_KEY: z.string().min(1),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'test', 'production']),
}).parse(process.env);

// 之后全程用 env.OPENAI_API_KEY（类型安全）
```

`.env` 从不进 git。`.env.example` 列出所有变量（值为空）进 git。

## XSS 防护

```tsx
// 错：未转义用户输入
<div dangerouslySetInnerHTML={{ __html: userComment }} />

// 对：让 React 默认转义
<div>{userComment}</div>

// 必须渲染 HTML 时用 sanitizer
import DOMPurify from 'isomorphic-dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userComment) }} />
```

- **禁止** `innerHTML = userInput`
- **禁止** `eval` / `new Function(userInput)`
- Next.js 中用户 URL 跳转用 `<Link>` 而非 `<a href={userUrl}>` 避免 `javascript:` 注入

## SQL / 注入

```typescript
// 错：字符串拼接
db.query(`SELECT * FROM users WHERE email = '${email}'`);

// 对：参数化（Prisma / Drizzle / pg）
await db.user.findUnique({ where: { email } });
await pool.query('SELECT * FROM users WHERE email = $1', [email]);
```

ORM（Prisma / Drizzle / TypeORM）默认参数化。裸 SQL 场景必须用 prepared statement。

## CSRF

- **same-site cookies + SameSite=Strict/Lax** 是 CSRF 第一道防线
- 状态改变的端点加 CSRF token 或用 double-submit cookie
- Next.js Server Actions 自动带 CSRF 保护，直接写 API route 时要手动加

## 认证 / 授权

- **密码哈希**：`bcrypt` / `argon2`（argon2id 首选），不要 MD5 / SHA256
- **JWT secret 最小 32 字节随机**，HS256 够用，对称密钥
- **session cookie 必须** `httpOnly; secure; sameSite=Strict/Lax`
- **权限检查在服务端**，客户端只隐藏 UI（永不信任客户端）

```typescript
// 每个 protected endpoint 手动检查
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!session.user.canEditProject(params.id))
    return Response.json({ error: 'forbidden' }, { status: 403 });
  // ...
}
```

## 依赖安全

```bash
npm audit --audit-level=moderate
pnpm audit
# 或用 Socket.dev / Snyk
```

- CI 中跑 `npm audit`，CRITICAL / HIGH 级漏洞阻断合并
- 锁定版本：`pnpm-lock.yaml` / `package-lock.json` 必须进 git
- 新装依赖前查 npm 下载量、GitHub star、最近维护：**新包当心供应链**

## 安全扫描工具

| 用途 | 工具 |
|---|---|
| 静态代码分析 | **ESLint** + `eslint-plugin-security` / `semgrep` |
| 依赖漏洞 | `npm audit` / `pnpm audit` / Socket.dev |
| Secret 扫描 | `trufflehog` / GitHub Secret Scanning / Gitleaks |
| 容器镜像 | `trivy` / `grype` |

## 常见 OWASP Top 10 对照

| OWASP | TS/JS 最常见表现 | 防 |
|---|---|---|
| A01 Broken Access Control | 服务端漏检权限，仅靠客户端隐藏 | 每 endpoint 服务端 guard |
| A03 Injection | SQL / NoSQL / command injection | 参数化、白名单校验 |
| A05 Security Misconfiguration | 默认 `.env` 进 git、CORS `*` | env 校验 + CORS 允许名单 |
| A07 Auth Failures | 弱密码、明文 token、JWT secret 短 | argon2 + 强 JWT secret + refresh token |
| A08 Data Integrity | 依赖未锁版本、npm 供应链 | lockfile + audit + 慎选新包 |

## 引用

- security-reviewer agent：自动派发扫代码
- silent-failure-hunter agent：扫吞错路径（可能泄露信息）

---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---
# TypeScript / JavaScript Patterns

> 扩展 [common/patterns.md](../common/patterns.md) 的 TS/JS 特定内容。

## API 响应信封

```typescript
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

// 用法
async function getUser(id: string): Promise<ApiResponse<User>> {
  try {
    const user = await db.user.findUnique({ where: { id } });
    if (!user) return { ok: false, error: { code: 'NOT_FOUND', message: 'user not found' } };
    return { ok: true, data: user };
  } catch (e) {
    return { ok: false, error: { code: 'INTERNAL', message: errorMessage(e) } };
  }
}

// 调用方用 discriminated union 强制处理错误
const res = await getUser(id);
if (res.ok) {
  return res.data;        // TS 知道这里是 User
} else {
  logger.warn(res.error); // TS 知道这里是 error
}
```

**禁止**：`{ data: T | null, error: string | null }` 两个都 nullable—— TS 无法强制穷举，调用方容易忘判错误。

## Repository 模式

```typescript
interface Repository<T, TCreate = Omit<T, 'id'>, TUpdate = Partial<TCreate>> {
  findAll(filters?: Record<string, unknown>): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  create(data: TCreate): Promise<T>;
  update(id: string, data: TUpdate): Promise<T>;
  delete(id: string): Promise<void>;
}

class UserRepository implements Repository<User> {
  constructor(private db: PrismaClient) {}
  findById(id: string) { return this.db.user.findUnique({ where: { id } }); }
  // ...
}
```

业务层依赖接口，测试时 mock 接口而非 Prisma client。

## 自定义 Hook 模式（React）

```typescript
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const h = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(h);
  }, [value, delay]);

  return debouncedValue;
}
```

- **一个 hook 一件事**：`useUser` 只负责拿用户数据，不负责表单 / 路由
- **返回要稳定**：对象返回时考虑用 `useMemo` 防 re-render 级联
- **所有 effect 都要 cleanup**（除非你能证明不需要）

## 状态管理分层（前端）

```
服务器状态   → TanStack Query / SWR          （带缓存 + 重验证 + 乐观更新）
URL 状态     → searchParams / path params    （页面分享、回退友好）
表单状态     → React Hook Form               （受控成本、校验集成）
客户端状态   → Zustand / Jotai / React Context（真·全局共享，且不在 URL 不适合表单）
```

**禁止**：把服务器状态 duplicate 进客户端 store（数据不同步是 state 管理 bug 之王）。

## 错误边界

```tsx
// React Error Boundary（必须 class component）
class ErrorBoundary extends React.Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.error('render error', { error, info });
  }
  render() {
    if (this.state.error) return <FallbackUI error={this.state.error} />;
    return this.props.children;
  }
}
```

每个路由级页面包一层。不包等于白屏让用户刷新。

## 模块边界

```typescript
// src/features/users/index.ts — 对外 public API
export { UserCard } from './UserCard';
export { useUser } from './useUser';
export type { User } from './types';

// 其它模块只从 index 引：
import { UserCard, useUser } from '@/features/users';
// 禁止：import { ... } from '@/features/users/internal/...'
```

用 ESLint rule `no-restricted-imports` 强制"只能从 feature 入口引入"。

## 反模式警惕

| 反模式 | 为什么坏 | 改 |
|---|---|---|
| `any` 到处是 | 失去类型，后期重构成本爆炸 | `unknown` + 类型守卫 |
| 单文件 1000+ 行 | 难找代码、难 review、难并行改 | 按责任拆，>400 行就想拆 |
| 深层 prop drilling | 中间组件必须穿越 prop | 用 Context 或 composition |
| `useEffect` 做数据派生 | 双 render、易死循环 | `useMemo` 纯计算 |
| 无 timeout 的 `fetch` | 进程挂住 | `AbortController` + 10s 默认 |
| 多层回调 | 可读性差、错误传播弱 | `async/await` 线性 |

## 引用

- `e2e-testing` skill：Playwright 模式
- `coding-standards` skill：完整风格教学
- `code-review-workflow` skill：审查两端流程

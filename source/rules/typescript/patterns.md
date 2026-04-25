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

## 完整设计模式（v2.2 补，对等 Python rules）

### Strategy 模式 + Discriminated Union

```typescript
// 错：每加一种支付方式改 switch（违反 OCP）
type PaymentMethod = 'stripe' | 'paypal' | 'alipay';
function charge(method: PaymentMethod, amount: number) {
  switch (method) {
    case 'stripe': /* ... */ break;
    case 'paypal': /* ... */ break;
    // 加 alipay 必须改这里
  }
}

// 对：策略接口 + 注册表（discriminated union 强制穷举）
interface PaymentProvider {
  readonly type: string;
  charge(amount: number, currency: string): Promise<{ ok: true; txId: string } | { ok: false; error: string }>;
}

class StripeProvider implements PaymentProvider {
  readonly type = 'stripe' as const;
  async charge(amount: number, currency: string) {
    // ... 调 Stripe API
    return { ok: true as const, txId: 'tx_xxx' };
  }
}

const providers = new Map<string, PaymentProvider>();
providers.set('stripe', new StripeProvider());
providers.set('paypal', new PayPalProvider());
// 新增 → providers.set('alipay', new AlipayProvider())，不改原有代码
```

### Compound Components（React）

```tsx
// 错：每个 prop 一层 drill
<Tabs activeTab={tab} onChange={setTab} tabs={[...]} content={[...]} />

// 对：父子用 Context 共享 state，调用方组装结构
import { createContext, useContext, useState, type ReactNode } from 'react';

type TabsContext = { active: string; setActive: (v: string) => void };
const Ctx = createContext<TabsContext | null>(null);
const useTabs = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('Tab.* must be inside Tabs');
  return ctx;
};

function Tabs({ defaultValue, children }: { defaultValue: string; children: ReactNode }) {
  const [active, setActive] = useState(defaultValue);
  return <Ctx.Provider value={{ active, setActive }}>{children}</Ctx.Provider>;
}
Tabs.List = ({ children }: { children: ReactNode }) => <div role="tablist">{children}</div>;
Tabs.Trigger = ({ value, children }: { value: string; children: ReactNode }) => {
  const { active, setActive } = useTabs();
  return <button role="tab" aria-selected={active === value} onClick={() => setActive(value)}>{children}</button>;
};
Tabs.Panel = ({ value, children }: { value: string; children: ReactNode }) => {
  const { active } = useTabs();
  return active === value ? <div role="tabpanel">{children}</div> : null;
};

// 用法
<Tabs defaultValue="overview">
  <Tabs.List>
    <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
    <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Panel value="overview">...</Tabs.Panel>
  <Tabs.Panel value="settings">...</Tabs.Panel>
</Tabs>
```

### Error Boundary（React）

```tsx
// 路由级错误边界，避免一处崩溃白屏整个应用
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: (e: Error) => ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 上报到 Sentry / 自家 logger
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return this.props.fallback?.(this.state.error) ?? (
        <div role="alert">
          <h2>页面崩了</h2>
          <pre>{this.state.error.message}</pre>
          <button onClick={this.reset}>重试</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// 用：包每个路由
<ErrorBoundary fallback={(e) => <ErrorPage error={e} />}>
  <Route path="/dashboard" element={<Dashboard />} />
</ErrorBoundary>
```

### Custom Hook（数据 + 状态封装）

```typescript
import { useEffect, useState, useRef } from 'react';

interface UseAsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

// 通用 async 数据 hook，含 cleanup + AbortController + 防过期返回
export function useAsync<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: unknown[] = [],
): UseAsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const triggerRef = useRef(0);

  useEffect(() => {
    const ctrl = new AbortController();
    const trigger = ++triggerRef.current;
    setLoading(true);
    setError(null);

    fn(ctrl.signal)
      .then((result) => {
        // 防过期：如果在 await 期间组件 re-render 触发了新请求，丢弃旧结果
        if (trigger !== triggerRef.current) return;
        setData(result);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return; // 主动 abort 不报错
        if (trigger !== triggerRef.current) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (trigger !== triggerRef.current) return;
        setLoading(false);
      });

    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    data,
    loading,
    error,
    refetch: () => triggerRef.current++,
  };
}

// 用法
const { data, loading, error } = useAsync(
  (signal) => fetch('/api/users', { signal }).then(r => r.json()),
  []
);
```

### Result 类型（避免 try/catch 满天飞）

```typescript
// 错：throw 让调用方猜会不会抛
async function getUser(id: string): Promise<User> {
  const r = await fetch(`/api/users/${id}`);
  if (!r.ok) throw new Error('not found');
  return r.json();
}

// 对：用 Result 强制调用方处理两种情况
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

async function getUser(id: string): Promise<Result<User>> {
  try {
    const r = await fetch(`/api/users/${id}`);
    if (!r.ok) return { ok: false, error: new Error(`HTTP ${r.status}`) };
    return { ok: true, value: await r.json() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

// 调用方 TS 强制穷举
const res = await getUser('u1');
if (res.ok) {
  return res.value;          // 类型是 User
} else {
  logger.warn('getUser failed', res.error);  // 类型是 Error
  return null;
}
```

> 何时用 Result vs throw：
> - **业务错误**（404 / 校验失败 / 外部 API 失败）→ Result，让调用方决策
> - **程序员错误**（不该发生 / bug）→ throw，让上层 ErrorBoundary 兜底

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

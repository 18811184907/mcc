---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.mts"
  - "**/*.cts"
---
# TypeScript / JavaScript Coding Style

> 扩展 [common/coding-style.md](../common/coding-style.md) 的 TS/JS 特定内容。
> 代码示例教学见 `coding-standards` skill 的 TS section。

## 严格度（tsconfig 必开）

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

不要为了"让它先跑起来"关 strict。打脸时间 = 项目越大越贵。

## 类型设计原则

- **禁止 `any`**。用 `unknown` + 类型守卫，或定义具体类型
- **Public API 必须有显式类型**（导出的函数、类方法）
- **内部局部变量**让 TS 推导，不要冗余标注
- **`interface` 用于可扩展的对象形状**，`type` 用于联合 / 交叉 / 工具类型
- **优先字符串字面量联合 > enum**（除非跨语言互操作需要 enum）
- **React props 用 `interface`**，不用 `React.FC`（除非有具体理由）

## 不可变性（默认）

```typescript
// 错
function addItem(list: Item[], item: Item): Item[] {
  list.push(item);   // 就地变异
  return list;
}

// 对
function addItem(list: ReadonlyArray<Item>, item: Item): Item[] {
  return [...list, item];
}
```

- `Readonly<T>` / `ReadonlyArray<T>` 用于参数，表明不会修改
- 用 `Object.freeze`、展开符、解构更新，禁止 `Array.prototype.push / splice` 在共享数据上

## 错误处理

```typescript
function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return '未知错误';
}

async function load(id: string): Promise<User> {
  try {
    return await api.getUser(id);
  } catch (e: unknown) {
    logger.error('加载用户失败', { id, error: errorMessage(e) });
    throw new Error(errorMessage(e));
  }
}
```

- `catch (e: unknown)`，禁用 `catch (e: any)`
- 永不静默吞错（`catch {}` 是代码 review 的红旗）
- 在系统边界（API 响应、用户输入、文件读取）用 Zod / Valibot schema 校验

## 输入校验（系统边界）

```typescript
import { z } from 'zod';

const userInputSchema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0).max(150),
});

type UserInput = z.infer<typeof userInputSchema>;
const parsed = userInputSchema.parse(rawInput); // 失败抛 ZodError
```

**禁止**：`as UserInput`（类型断言绕过校验）。断言是信任声明，外部数据永不信任。

## 异步

- **优先 async/await**，不用 `.then().catch()` 链
- **禁止 `async` 函数不 `await`**（会丢错误）
- `Promise.all` 并发时注意：**一个失败全挂**，需要容错用 `Promise.allSettled`
- `for await (const x of stream)` 处理流式数据，不要 `.forEach` 套 async

## 命名

- **变量/函数**：`camelCase`
- **组件/类/类型/接口**：`PascalCase`
- **常量**：`UPPER_SNAKE_CASE`
- **Boolean**：`is`/`has`/`should`/`can` 前缀
- **React Hook**：`use` 前缀
- **文件名**：组件 `PascalCase.tsx`，其他 `kebab-case.ts`（跟项目现有约定）

## Console 调试

**生产代码禁止 `console.log`**。用合适的 logger（pino / winston / 浏览器端 Sentry breadcrumb）。MCC hook `stop:check-console-log` 默认开启，会扫改过的文件提醒。

## 格式化 / 静态分析工具

| 用途 | 首选 | 备选 |
|---|---|---|
| 格式化 | **Prettier** | dprint |
| 静态分析 | **ESLint**（`@typescript-eslint`）| Biome（统一格式+lint，快但生态新） |
| 类型检查 | **`tsc --noEmit`** | 无替代 |
| 运行时 | **Bun / Node 20+** | Deno |

**统一命令**：`package.json` 里 `scripts` 至少有 `lint`、`typecheck`、`test`、`build`。

## React / Next 特定

- **Server Component 默认**（Next 13+ App Router），`'use client'` 只在真需要交互的叶子
- **Effect 只管外部系统同步**（订阅、DOM API），不要放派生状态计算（用 `useMemo`）
- **Key 必须稳定**：不要用数组 index 当 `key`（有增删场景会错位）
- **表单用 React Hook Form**，不要手写 controlled input 每字符 re-render

## Node / API 特定

- **`fetch` 用 `AbortController` 带超时**，默认不超时是 bug
- **异步错误必须 await**：`await` 丢失 = 错误逃逸到进程级（crash）
- **环境变量启动时校验**，不要运行时才发现缺

```typescript
import { z } from 'zod';
const env = z.object({
  DATABASE_URL: z.string().url(),
  OPENAI_API_KEY: z.string().min(1),
}).parse(process.env);
```

## 引用

- 教学版带完整代码示例：`coding-standards` skill 的 TypeScript section
- 架构/设计模式：`patterns.md`（本目录）
- 测试：`testing.md`（本目录）
- 安全：`security.md`（本目录）

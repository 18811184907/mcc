---
# v2.6.1: 只在改测试文件时注入（之前每次改 .ts 都注入 ~3.8k 字符浪费）
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.test.js"
  - "**/*.test.jsx"
  - "**/*.spec.ts"
  - "**/*.spec.tsx"
  - "**/*.spec.js"
  - "**/*.spec.jsx"
  - "**/test/**/*.{ts,tsx,js,jsx}"
  - "**/tests/**/*.{ts,tsx,js,jsx}"
  - "**/__tests__/**/*.{ts,tsx,js,jsx}"
  - "**/playwright/**/*.{ts,tsx,js,jsx}"
  - "**/vitest.config.*"
  - "**/jest.config.*"
  - "**/playwright.config.*"
---
# TypeScript / JavaScript Testing

> 扩展 [common/testing.md](../common/testing.md) 的 TS/JS 特定内容。
> E2E 见 `e2e-testing` skill。

## 框架选择

| 目的 | 首选 | 备选 |
|---|---|---|
| 单元 + 集成（Node） | **Vitest**（快、ESM 原生、Jest API 兼容） | Jest |
| 单元 + 集成（Bun） | `bun test` | Vitest |
| E2E（浏览器） | **Playwright**（跨 Chromium/FF/WebKit） | Cypress |
| React 组件 | **@testing-library/react**（和 Vitest 配合） | — |
| API 端点 | Vitest + **supertest** | — |

不要混用 Jest + Vitest 在同一项目。

## 覆盖率

```bash
vitest run --coverage
```

- **80% 行覆盖**为最低门槛
- **金融 / 认证 / 安全关键路径 要求 100%**
- 只看行覆盖会失真，配合 `--coverage.include` 排除纯类型文件、生成代码

## 测试结构（AAA）

```typescript
import { describe, it, expect } from 'vitest';

describe('calculateTotal', () => {
  it('returns 0 for empty cart', () => {
    // Arrange
    const cart: Item[] = [];

    // Act
    const total = calculateTotal(cart);

    // Assert
    expect(total).toBe(0);
  });

  it('applies tax correctly', () => {
    const cart = [{ price: 100, qty: 1 }];
    const total = calculateTotal(cart, { tax: 0.1 });
    expect(total).toBe(110);
  });
});
```

## 命名

```typescript
// 错：描述代码
it('tests the function', () => { ... });

// 对：描述行为
it('returns empty array when no markets match query', () => { ... });
it('throws when API key is missing', () => { ... });
it('falls back to substring search when Redis is down', () => { ... });
```

测试名 = 一句话文档。读测试名就知道代码应该怎么工作。

## Mock 策略

- **单元测试**：mock 外部依赖（DB / API / 文件系统 / 时间）
- **集成测试**：**不 mock** 数据库（用真 DB 或内存替代 like sqlite-memory），mock 外部 API 即可
- **禁止** mock 自家代码（mock 被测模块 = 在测 mock 不是真代码）

```typescript
import { vi } from 'vitest';

// mock 外部 API
vi.mock('./api-client', () => ({
  fetchUser: vi.fn().mockResolvedValue({ id: '1', name: 'Test' }),
}));

// 时间
vi.useFakeTimers();
vi.setSystemTime(new Date('2026-04-24'));
```

## 异步测试

```typescript
// 错：忘记 await
it('loads user', () => {
  const user = loadUser('1');  // Promise 没 await，断言会在 load 前跑
  expect(user.name).toBe('Test');
});

// 对
it('loads user', async () => {
  const user = await loadUser('1');
  expect(user.name).toBe('Test');
});
```

## 测试 Anti-Pattern

**禁止**：
- `expect(true).toBe(true)` 占位测试
- 测试里写复杂逻辑（测试应该直线）
- 一个 `it` 测 5 件事（拆分）
- `setTimeout(done, 2000)` 等异步（用 `await` + `vi.advanceTimersByTime`）
- 依赖测试执行顺序（`beforeEach` 重置）
- 把测试数据硬编到远端 API（用 mock 或 fixture）

## CI 集成

```yaml
# .github/workflows/test.yml
- run: pnpm install --frozen-lockfile
- run: pnpm typecheck
- run: pnpm lint
- run: pnpm test -- --run --coverage
- run: pnpm build   # 确保生产构建也能过
```

**4 层闸门**：typecheck → lint → test → build。任一失败 CI 红。

## E2E 单独指引

E2E（Playwright）看 `e2e-testing` skill，含 Page Object 模板、视觉回归、a11y、Core Web Vitals。

## 引用

- tdd-workflow skill：RED-GREEN-REFACTOR 流程
- verification-loop skill：交付前 6 阶段闸门
- e2e-testing skill：端到端测试

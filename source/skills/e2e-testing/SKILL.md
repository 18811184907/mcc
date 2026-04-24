---
name: e2e-testing
description: "Playwright E2E 测试模式：page object + 稳定选择器 + CI 集成。用户说'写 E2E / 端到端测试 / Playwright / 跑完整用户流程'时激活。"
---

# E2E Testing（端到端测试）

用户需要写/跑端到端测试时激活。**默认用 Playwright**（跨 Chromium / Firefox / WebKit）。

## 何时激活

关键词：
- "写 E2E / e2e 测试"
- "端到端测试 / 用户流程测试"
- "Playwright / 浏览器自动化测试"
- "登录流程 / checkout 流程的完整测试"

用户问"怎么测这个页面"且场景涉及多步骤 UI 交互时，主动提议 E2E。

## 核心原则

1. **少而稳 > 多而糙**：E2E 跑得慢，只测关键用户路径（3-5 条 critical path），不重复单元测试
2. **稳定选择器**：用 `data-testid` > role > text，**不要**用 CSS class（样式一改就挂）
3. **Page Object 模式**：把每个页面/组件封装成一个类，测试里只调方法
4. **明确等待**：用 `expect(locator).toBeVisible()` 而非 `page.waitForTimeout(2000)`
5. **每次测试独立**：用 `test.beforeEach` 登录/重置状态，不依赖上一个测试

## 目录结构

```
tests/e2e/
├── pages/
│   ├── login.page.ts         ← Page Object
│   ├── dashboard.page.ts
│   └── checkout.page.ts
├── fixtures/
│   └── test-users.ts
├── specs/
│   ├── auth.spec.ts          ← 登录/登出/注册
│   ├── checkout.spec.ts      ← 下单核心流程
│   └── dashboard.spec.ts
└── playwright.config.ts
```

## Page Object 模板

```ts
// tests/e2e/pages/login.page.ts
import { Page, expect } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.page.getByTestId('email-input').fill(email);
    await this.page.getByTestId('password-input').fill(password);
    await this.page.getByTestId('submit-btn').click();
  }

  async expectLoggedIn() {
    await expect(this.page.getByTestId('user-avatar')).toBeVisible();
  }

  async expectError(message: string) {
    await expect(this.page.getByRole('alert')).toContainText(message);
  }
}
```

## Spec 模板

```ts
// tests/e2e/specs/auth.spec.ts
import { test } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { testUsers } from '../fixtures/test-users';

test.describe('登录流程', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('有效凭证登录成功', async () => {
    await loginPage.login(testUsers.valid.email, testUsers.valid.password);
    await loginPage.expectLoggedIn();
  });

  test('无效密码显示错误', async () => {
    await loginPage.login(testUsers.valid.email, 'wrong-password');
    await loginPage.expectError('密码错误');
  });
});
```

## playwright.config.ts 推荐

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

## CI 集成（GitHub Actions）

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

## 禁止

- ❌ 禁止 `page.waitForTimeout(N)`（除非真的等动画 ≤200ms）—— 用 `expect().toBeVisible()` 替代
- ❌ 禁止用 CSS class 做选择器（`.btn-primary` 样式一改就挂）
- ❌ 禁止测试之间共享状态（上个测试登录 → 下个测试假设已登录）
- ❌ 禁止硬编码生产 URL 或真实用户数据

## 提议给用户的对话节奏

1. 先问 **critical path 是哪条**（登录？下单？上传？）
2. 先写 1 条完整通过
3. 再批量扩展

不要一上来就写 10 条 spec。

---

## 可选扩展（进阶场景，用户明确要求再加）

### 视觉回归测试

```ts
// 在关键页面稳定后加截图锁定
test('dashboard 视觉回归', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveScreenshot('dashboard.png', {
    maxDiffPixels: 100,
    threshold: 0.2,
  });
});
```

首次跑会生成 baseline，CI 自动比对。慎用：需要稳定的设计系统，否则噪音多。

### 可访问性测试（a11y）

```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('首页 WCAG 2.1 AA', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
```

需要 `npm i -D @axe-core/playwright`。每个核心页面至少跑一次。

### 性能基准（Core Web Vitals）

```ts
test('首页 LCP < 2.5s', async ({ page }) => {
  await page.goto('/');
  const lcp = await page.evaluate(() => new Promise<number>(r => {
    new PerformanceObserver(list => {
      const entries = list.getEntries();
      r((entries[entries.length - 1] as any).startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  }));
  expect(lcp).toBeLessThan(2500);
});
```

Lighthouse CI（`@lhci/cli`）比手写 PerformanceObserver 更完整，推荐用在主要 landing page。

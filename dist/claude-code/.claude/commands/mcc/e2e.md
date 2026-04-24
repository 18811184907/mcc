---
description: "生成或运行 Playwright E2E 测试：页面对象 → 跑测试 → 产出 artifacts（截图/录像/trace）。"
argument-hint: "<要测试的用户流 或 path/to/spec.ts>"
---

# E2E Testing

**Input**: $ARGUMENTS

## 核心价值

用 Playwright 把关键用户流程端到端自动化：Page Object 抽稳定选择器 → 跑测试 → 失败时给完整 artifact（screenshot / video / trace）调试。

> **前置**：推荐装 `e2e-testing` skill，它包含更完整的 Page Object Model 模式库和 flaky 排查剧本。若已装则委派 skill；未装则按本命令内联指南执行。

---

## 核心流程

### 1. 识别要测的用户流

从 `$ARGUMENTS` 抽出场景。每个 E2E 应对应一条真实用户旅程（登录 → 发布 → 看到结果），不是 API 级单元测试。

### 2. 建 Page Object Model

Page Object 封装"页面上有什么、怎么操作"——让测试 spec 读起来像业务语言：

```ts
// tests/e2e/pages/MarketsPage.ts
import { Page, Locator } from '@playwright/test'

export class MarketsPage {
  readonly page: Page
  readonly searchInput: Locator
  readonly marketCards: Locator

  constructor(page: Page) {
    this.page = page
    this.searchInput = page.locator('[data-testid="search-input"]')
    this.marketCards = page.locator('[data-testid="market-card"]')
  }

  async goto() {
    await this.page.goto('/markets')
  }

  async searchMarkets(query: string) {
    await this.searchInput.fill(query)
    await this.searchInput.press('Enter')
    await this.page.waitForLoadState('networkidle')
  }
}
```

### 3. 写测试 spec

```ts
import { test, expect } from '@playwright/test'
import { MarketsPage } from '../pages/MarketsPage'

test.describe('Markets', () => {
  test('search filters results', async ({ page }) => {
    const markets = new MarketsPage(page)
    await markets.goto()
    await markets.searchMarkets('election')

    const count = await markets.marketCards.count()
    expect(count).toBeGreaterThan(0)
  })
})
```

### 4. 跑测试并查看报告

```bash
# 运行单个 spec
npx playwright test tests/e2e/markets.spec.ts

# 跑全部
npx playwright test

# headed 模式调试
npx playwright test --headed

# debug 模式（一步步）
npx playwright test --debug

# codegen 自动生成测试
npx playwright codegen http://localhost:3000

# 打开 HTML 报告
npx playwright show-report
```

---

## Test Artifacts

默认行为：

**所有测试**：
- HTML Report（时间线 + 结果）
- JUnit XML（CI 集成）

**失败时**：
- 失败状态的 Screenshot
- 整个测试的 Video
- Trace 文件（逐帧回放）
- Network logs
- Console logs

```bash
# 查看 trace
npx playwright show-trace artifacts/trace-abc123.zip

# 截图位置
ls artifacts/*.png
```

---

## Flaky 测试处理

测试间歇性失败时：

```
⚠ FLAKY TEST DETECTED: tests/e2e/markets/trade.spec.ts

通过率：7/10

常见失败：
"Timeout waiting for element '[data-testid="confirm-btn"]'"

建议修复：
1. 显式等待：await page.waitForSelector('[data-testid="confirm-btn"]')
2. 增加 timeout：{ timeout: 10000 }
3. 检查组件内的竞态
4. 确认元素未被动画遮盖

暂挂建议：改 test.fixme() 直到修好
```

**别忽略 flaky**——flaky 意味着测试或被测代码里有竞态，迟早在 prod 爆发。

---

## DO

1. **用 Page Object Model** — 选择器集中在一处，UI 改动只改一处
2. **用 `data-testid` 选择器** — 比 CSS class 稳定（class 会因样式调整而改）
3. **等 API response 或 `waitForLoadState('networkidle')`**，不要 `setTimeout`
4. **测关键用户旅程** — 登录、支付、搜索、发布这种
5. **在合入 main 前跑**
6. **失败时翻 artifact**（截图 + trace）

## DON'T

1. 用脆的选择器（CSS class 可能随时改）
2. 测实现细节（改内部状态就挂）
3. 在生产环境跑
4. 忽略 flaky 测试
5. 失败后不看 artifact 就重跑
6. 把每个 edge case 都写 E2E（那是 unit test 的事）

---

## CI/CD 集成

```yaml
# .github/workflows/e2e.yml
- name: Install Playwright
  run: npx playwright install --with-deps

- name: Run E2E tests
  run: npx playwright test

- name: Upload artifacts
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

---

## 与其他命令的关系

- `/mcc:tdd` — 单元 + 集成（更快更细，E2E 别滥用）
- `/mcc:test-coverage` — 补 unit test 覆盖
- `/mcc:plan` — 先识别要测的关键用户旅程
- `/mcc:review` — 审查测试质量

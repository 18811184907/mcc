---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
# TypeScript / JavaScript Hooks

> 扩展 [common/hooks.md](../common/hooks.md) 的 TS/JS 特定内容。

## PostToolUse hook（写完 / 改完自动跑）

- **Prettier**：格式化 `.ts/.tsx/.js/.jsx` 文件
- **ESLint**：`eslint --fix` 修可自动修的，其他报告
- **TypeScript**：`tsc --noEmit` 类型检查（大项目慢，优先 IDE 实时检查）

MCC 不默认装这些（v1.3 把 format-typecheck 挪到 optional hooks），避免大项目每次 edit 跑 tsc 拖 30-60 秒。个人小项目想开，把 `_mcc_optional_hooks.stop_format_typecheck_OFF_BY_DEFAULT` 的 snippet 放到 `hooks.Stop[0].hooks` 里。

## Stop hook（每次响应结束）

- **`check-console-log`**：扫改过的 `.ts/.tsx/.js/.jsx` 文件，发现 `console.log` 给 warning（**MCC 默认开**）
- **Format + typecheck**（默认**关**）：大项目慢；小项目可开

## 自律补充（hook 无法覆盖的）

即使没装 hook，以下动作请养成自律：

- 写完模块前手动 `npm run lint && npm run typecheck`
- 提交前 `git diff | grep 'console\.log'`（或用 pre-commit hook）
- 新增依赖后 `npm audit`
- 部署前 `npm run build`（catch 只有生产 build 能抓到的问题）

## 推荐的 package.json scripts 最小集

```json
{
  "scripts": {
    "dev": "vite / next / bun dev",
    "build": "vite build / next build / bun build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "test": "vitest",
    "test:e2e": "playwright test",
    "verify": "npm run typecheck && npm run lint && npm run test"
  }
}
```

`npm run verify` 是本地版的 verification-loop，上线前必过。

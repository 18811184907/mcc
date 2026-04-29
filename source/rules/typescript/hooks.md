---
# v2.6.1: 只在改 hook / 工具配置时注入（之前每次改 .ts 都注入 ~4.7k 字符浪费）。
# 内容是 prettier/eslint/tsc/playwright hook 模板 + Claude Code settings.json
# hook 配置——日常改 .ts 业务代码时用不到。
paths:
  - "**/.claude/settings*.json"
  - "**/.claude/hooks/**"
  - "**/.claude/.mcc-hooks/**"
  - "**/.husky/**"
  - "**/lefthook.{yml,yaml}"
  - "**/package.json"
  - "**/.eslintrc*"
  - "**/eslint.config.*"
  - "**/.prettierrc*"
  - "**/prettier.config.*"
  - "**/tsconfig*.json"
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

## v2.2 补：4 个实战 hook 模板（对等 Python rules 深度）

### Format hook（PostToolUse · 默认开）

写完 / 改完 .ts / .tsx 自动跑 prettier：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "filePattern": "*.{ts,tsx,js,jsx,mts,cts}",
        "hooks": [
          {
            "type": "command",
            "command": "npx prettier --write \"$FILE_PATH\" 2>/dev/null || true",
            "async": true,
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

注：`|| true` 防 prettier 没装时 hook 报错。`--write` 自动改文件。

### Typecheck hook（PostToolUse · 大项目默认关）

每次 edit 后跑 `tsc --noEmit`：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "filePattern": "*.{ts,tsx}",
        "hooks": [
          {
            "type": "command",
            "command": "npx tsc --noEmit --pretty false 2>&1 | tail -20",
            "async": false,
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

**警告**：大项目 tsc 30-60 秒，每次 edit 跑会让 Claude 等到睡着。MCC 默认**关**这个 hook，挪到 `_mcc_optional_hooks.stop_format_typecheck_OFF_BY_DEFAULT`。手动启用见 settings.fragment.json 注释。

### Build hook（Stop · 大改动结束验证）

session 结束时跑 build 验证：

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "npm run build 2>&1 | tail -30",
            "async": false,
            "timeout": 180
          }
        ]
      }
    ]
  }
}
```

**何时启用**：项目快上线、要 PR 合并、改了构建配置。日常开发关掉省时间。

### E2E hook（Stop · CI-only）

只在 CI 环境跑 Playwright（本地太慢）：

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "[ -n \"$CI\" ] && npx playwright test --reporter=list || echo 'E2E skipped (not in CI)'",
            "async": false,
            "timeout": 600
          }
        ]
      }
    ]
  }
}
```

通过 `[ -n "$CI" ]` 判断 CI 环境。本地不跑（10 分钟太久），CI 跑全套。

## 自律层（hook 不够用时）

不是所有团队都开放 hook 自动跑。养成自律：

- **每写一个组件 / endpoint 后**：手动 `npm run typecheck`（或 IDE 实时类型检查 + Problems 面板看错）
- **PR 前**：跑 `npm run verify`（typecheck + lint + test）
- **部署前**：跑 `npm run build`（catch 只有生产 build 能抓的问题）
- **新增依赖**：`npm audit` + Socket.dev 看包健康度

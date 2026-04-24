---
name: verification-loop
description: "交付前**技术验证**（Build/Type/Lint/Test/Security/Diff 六阶段 gate）。用户说'验证一下 / 跑一遍检查 / 交付前检查 / 确认没问题 / CI 前'时激活。与 code-review-workflow 的分工：本 skill 是**机械可验证的技术闸门**（跑命令看 exit code）；code-review-workflow 是**人类判断的架构/需求符合性**（派 subagent 看是否做对了事）。两者互补：先 verify 过，再 review。"
---

# Verification Loop

交付前的全面验证系统。

## 何时使用（自动激活关键词）

- 用户说"验证一下 / 跑一遍检查 / 交付前检查 / 确认没问题 / 跑 CI 前"
- 完成一个功能或重要改动之后（主动提议）
- 创建 PR 前
- 重构之后

## 验证阶段

### Phase 1: Build Verification

```bash
# JS/TS 项目
npm run build 2>&1 | tail -20
# 或 pnpm build 2>&1 | tail -20

# Python 项目通常没有 build 步骤，这一阶段直接跳过
```

Build 失败就 **STOP**，先修好再进下一阶段。

### Phase 2: Type Check

```bash
# TypeScript
npx tsc --noEmit 2>&1 | head -30

# Python
pyright . 2>&1 | head -30
# 或 mypy . 2>&1 | head -30
```

上报所有 type error，critical 的先修掉再继续。

### Phase 3: Lint Check

```bash
# JS/TS
npm run lint 2>&1 | head -30

# Python
ruff check . 2>&1 | head -30
```

### Phase 4: Test Suite

```bash
# JS/TS with coverage
npm run test -- --coverage 2>&1 | tail -50

# Python with coverage（AI 全栈主场景）
pytest --cov=. --cov-report=term-missing 2>&1 | tail -50

# 目标：覆盖率 ≥ 80%
```

上报：
- Total tests: X
- Passed: X
- Failed: X
- Coverage: X%

### Phase 5: Security Scan

```bash
# 找 API key / secret 泄漏（Unix / Git Bash）
grep -rn "sk-" --include="*.ts" --include="*.js" --include="*.py" . 2>/dev/null | head -10
grep -rn "api_key" --include="*.ts" --include="*.js" --include="*.py" . 2>/dev/null | head -10

# 找 debug 残留
grep -rn "console.log" --include="*.ts" --include="*.tsx" src/ 2>/dev/null | head -10
grep -rn "print(" --include="*.py" . 2>/dev/null | head -10
```

**Windows（PowerShell，不装 Git Bash 时）**：

```powershell
Select-String -Path .\**\*.ts,.\**\*.py -Pattern "sk-|api_key" | Select-Object -First 10
Select-String -Path .\**\*.py -Pattern "print\(" | Select-Object -First 10
```

### Phase 6: Diff Review

```bash
git diff --stat
git diff HEAD~1 --name-only
```

逐文件检查：
- 非预期的改动
- 缺失的错误处理
- 未覆盖的边界情况

## 输出格式

跑完所有阶段，产出验证报告：

```
VERIFICATION REPORT
==================

Build:     [PASS/FAIL]
Types:     [PASS/FAIL] (X errors)
Lint:      [PASS/FAIL] (X warnings)
Tests:     [PASS/FAIL] (X/Y passed, Z% coverage)
Security:  [PASS/FAIL] (X issues)
Diff:      [X files changed]

Overall:   [READY/NOT READY] for PR

Issues to Fix:
1. ...
2. ...
```

## 持续验证模式

长会话建议每 15 分钟或重要节点跑一次。触发时机：
- 完成一个函数后
- 完成一个组件后
- 进入下一个任务前

命令：`/verify`

## 和 hooks 的关系

PostToolUse hooks 在每次 tool 执行后做**即时**检查（format / lint 单文件）；
verification-loop 是**阶段性**全量检查——覆盖 build / types / tests / security / diff 这些跨文件的质量门槛。
两者互补，不重叠。

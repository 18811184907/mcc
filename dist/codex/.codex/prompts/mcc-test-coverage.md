---
description: "分析测试覆盖率，定位低覆盖文件，生成缺失测试到 80%+。新功能请用 `mcc-tdd` prompt，E2E 请用 `mcc-e2e` prompt。"
argument-hint: "[path/to/file 或 module 限定范围（可选）]"
---

# Test Coverage

**Input**: $ARGUMENTS

## 核心价值

分析既有代码的测试覆盖率，为低于 80% 的文件自动补测试到 80%+。**对象是已存在的实现**；新功能应先走 TDD（`mcc-tdd` prompt），这个命令补老债。

## Step 1 — 检测测试框架

委派 `verification-loop` skill 的 framework detection，或按下表自己识别：

| 指示 | Coverage 命令 |
|-----------|-----------------|
| `jest.config.*` 或 `package.json` 的 jest | `npx jest --coverage --coverageReporters=json-summary` |
| `vitest.config.*` | `npx vitest run --coverage` |
| `pytest.ini` / `pyproject.toml` pytest | `pytest --cov=src --cov-report=json` |
| `Cargo.toml` | `cargo llvm-cov --json` |
| `pom.xml` with JaCoCo | `mvn test jacoco:report` |
| `go.mod` | `go test -coverprofile=coverage.out ./...` |

## Step 2 — 分析覆盖率

1. 跑 coverage 命令
2. 解析 JSON summary（或终端输出）
3. 列出 **<80% 的文件**，按覆盖率最低排序
4. 对每个文件识别：
   - 未测试的函数/方法
   - 缺失的 branch coverage（if/else、switch、error 路径）
   - 拉低分母的死代码

## Step 3 — 生成缺失测试

**委派 `test-automator` agent** 按下列优先级为每个低覆盖文件补测试：

1. **Happy path** — 合法输入的核心功能
2. **Error handling** — 非法输入、缺失数据、网络失败
3. **Edge cases** — 空数组、null/undefined、边界值（0、-1、MAX_INT）
4. **Branch coverage** — 每个 if/else、switch case、ternary

### 测试生成规则

- 测试就近：`foo.ts` → `foo.test.ts`（或项目惯例）
- 沿用项目现有测试模式（import 风格、断言库、mock 方式）
- mock 外部依赖（DB / API / 文件系统）
- 每个测试独立——test 间无共享可变状态
- 命名要描述行为：`test_create_user_with_duplicate_email_returns_409`

## Step 4 — 验证

1. 跑完整测试套件——必须全绿
2. 重跑 coverage——确认提升
3. 仍 <80% → 回 Step 3 补剩余缺口

## Step 5 — 汇报

before/after 对比：

```
Coverage Report
──────────────────────────────
File                    Before  After
src/services/auth.ts    45%     88%
src/utils/validation.ts 32%     82%
──────────────────────────────
Overall:                67%     84%  PASS
```

## 重点照顾

- 复杂分支的函数（cyclomatic 高）
- Error handler 和 catch 块
- 跨代码库复用的 utility
- API endpoint handler（request → response）
- Edge cases：null、undefined、空字符串、空数组、0、负数

## 与其他命令的关系

- 新功能：先 `mcc-tdd` prompt（RED-GREEN-REFACTOR），不要写完再补
- 用户流：`mcc-e2e` prompt 跑 Playwright
- 验证通过后：`mcc-verify` prompt 做总闸门

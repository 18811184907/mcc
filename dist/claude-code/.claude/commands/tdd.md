---
description: "强制 TDD 流程：先写失败测试（RED）→ 最小实现（GREEN）→ 重构（REFACTOR）。新功能、bug fix 必走。"
argument-hint: "<要实现的功能或要修复的 bug>"
---

# TDD Workflow

**Input**: $ARGUMENTS

## 核心价值

强制 **RED → GREEN → REFACTOR** 循环。不是"写完代码再补测试"——是**先写失败的测试**，跑确认失败，再写最小实现让它过，最后重构。

> **前置条件**：若 MCC 已装 `tdd-workflow` skill，本命令委派 skill 执行，获得完整方法论；若未装，按本命令内联的核心流程走。

---

## RED-GREEN-REFACTOR 三步

### 1. RED — 先写失败测试

根据 `$ARGUMENTS` 描述的功能/bug：

- 明确要验证的**行为**（不是实现细节）
- 写出覆盖 happy path + 至少 1 个 edge case 的测试
- 断言必须精确（具体值、具体错误类型）

```bash
# 跑测试，**必须失败**
npm test <test-file>   # 或项目对应的 test 命令
```

若测试意外通过 → 测试写错了，回去改测试（可能断言了平凡为真的东西）。

### 2. GREEN — 最小实现

**只写刚好让测试过**的代码。不做额外抽象、不写"万一用到"的分支。

```bash
# 重跑，必须全过
npm test <test-file>
```

### 3. REFACTOR — 在测试保护下重构

测试绿的状态下：
- 提常量（魔法数字 → 命名常量）
- 抽公共子函数
- 改名字让意图更清楚
- 每次改动后**立刻重跑测试**，保持绿

---

## DO（核心 6 条）

1. **测试先于实现** — 没写测试不许写实现
2. **测试行为，不测实现** — 断言返回值/副作用，不断言内部调用细节
3. **每步跑一次测试** — 不累积未验证改动
4. **80%+ 覆盖**（关键代码 100%：金融计算、认证、安全、核心业务）
5. **Edge case 先行** — happy path 后立刻补 empty / null / boundary / error
6. **重构只在绿时做** — 红状态下不重构

## DON'T

1. 先写代码再补测试（破坏 TDD 的核心保护）
2. 跳过跑测试直接写下一块
3. 一次写太多（RED 不明显就失去了早期反馈）
4. 忽略失败测试（"等会再看"往往变成"再也不看"）
5. 测试实现细节（改实现就挂一片，测试变负担）
6. mock 到天 — 能用真实依赖就别 mock；大依赖才 mock

---

## 测试类型指引

**Unit Tests**（函数级）：
- Happy path
- Edge cases（empty、null、max）
- Error conditions
- Boundary values

**Integration Tests**（组件级）：
- API endpoint
- DB 操作
- 外部服务调用
- 带 hook 的 React component

**E2E Tests** → 说"写 E2E / Playwright" 触发 `e2e-testing` skill（带 Page Object 模板）

---

## 覆盖率要求

- **80% 最低** — 所有代码
- **100% 必须** — 下列：
  - 金融计算
  - 认证/授权逻辑
  - 安全关键代码
  - 核心业务规则

**Mandatory**：测试**先于**实现。TDD cycle 是 RED → GREEN → REFACTOR，**永不跳过 RED**。

---

## 典型 session

1. 用 `/plan` 明确要造什么
2. 用 `/tdd` 按 RED-GREEN-REFACTOR 实现
3. 遇到 build error / 失败 → `/fix-bug`（自动分诊 build 类）
4. 跑 `/review` 审查
5. 说"验证一下 / 补测试到 80%" → `verification-loop` + `test-automator` agent

---

## 与其他命令 / skill 的关系

- 新功能：先 `/plan`，再 `/tdd`
- Bug fix：`/fix-bug` 的 Phase 4 会调用 TDD 流程
- 老代码补测试：说"补测试到 80%" 让 `test-automator` agent 接管
- 完成后：`/review`

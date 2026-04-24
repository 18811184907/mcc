---
description: "增量修复构建/类型错误：检测 build 系统 → 逐个错误最小修复 → 同错 3 次失败停下问用户。"
argument-hint: "[build 相关的特定错误或 log 片段（可选）]"
---

# Build and Fix

**Input**: $ARGUMENTS

## 核心价值

面对大片 build / type error，不要一次性重写一大片。检测项目的 build 系统，一次只修一个错，每次改动重新跑 build 确认进度。同一个错误 3 次失败就停下问用户，避免陷入补丁循环。

## Step 1 — 检测 Build 系统

识别 build 工具并跑一次 build：

| 指示 | Build 命令 |
|-----------|---------------|
| `package.json` 有 `build` script | `npm run build` 或 `pnpm build` |
| `tsconfig.json`（仅 TS） | `npx tsc --noEmit` |
| `Cargo.toml` | `cargo build 2>&1` |
| `pom.xml` | `mvn compile` |
| `build.gradle` | `./gradlew compileJava` |
| `go.mod` | `go build ./...` |
| `pyproject.toml` | `python -m compileall -q .` 或 `mypy .` |

## Step 2 — 解析 + 分组错误

1. 跑 build 捕获 stderr
2. 按文件路径分组
3. 按依赖顺序排（先 import/type 错，再逻辑错）
4. 统计错误总数做进度跟踪

## Step 3 — 修复循环（一次一个错）

**委派 `debugger` agent** 做每个错的根因分析和最小修复。若无 `debugger` 则降级内联 Edit 流程：

对每个错：
1. **Read 文件** — 用 Read 看错误上下文（周围 10 行）
2. **诊断** — 识别根因（缺 import / 类型错 / 语法错 / 循环依赖）
3. **最小修复** — 用 Edit 做最小改动
4. **重跑 build** — 确认错消失、无新错引入
5. **进下一个**

## Step 4 — 护栏（Guardrails，核心）

**停下来问用户**，如果：

- 某个修复**引入的错多于它解决的**
- **同一个错 3 次尝试后还在** — 说明是更深层问题
- 需要**架构调整**（不是 build fix 的事）
- 错是**缺依赖**（需要 `npm install` / `cargo add` / `uv pip install`）

## Step 5 — 汇总

给用户：
- 已修错误（带文件路径）
- 剩余错误（若有）
- 新引入错误（应该是 0）
- 未解决问题的下一步建议

## 常见回收策略

| 情况 | 动作 |
|-----------|--------|
| 缺模块/import | 检查包是否装了，建议安装命令 |
| 类型不匹配 | 读双方类型定义，改窄的那边 |
| 循环依赖 | 画 import graph，建议抽公共模块 |
| 版本冲突 | 查 `package.json` / `Cargo.toml` 的版本约束 |
| Build 工具配置错 | 读配置文件，对照工作默认值 |

**一次改一个错，最小 diff 优先，不要借 build-fix 之名做重构。**

## 与其他命令的关系

- Build 成功后：`/mcc:verify` 跑完整验证
- Build 是 bug 症状而非根因：`/mcc:fix-bug`
- 多域问题（build + runtime + performance）：`/mcc:troubleshoot`

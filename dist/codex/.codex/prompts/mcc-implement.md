---
description: "执行 PRP plan 文件：每步立即验证（type / lint / test / build / integration 5 级），失败立停不累积。"
argument-hint: "<path/to/plan.md>"
---

# PRP Implement

**Input**: $ARGUMENTS

## 核心价值

按 plan 文件逐步执行，**每个改动都立刻验证**——绝不累积 broken state。验证循环在早期抓住错误；发现问题就修，修完再推进。

**黄金法则**：任何一级验证失败，修它之后再继续。不要把错误留到下一步。

---

## Phase 0 — 侦测

### Package Manager 检测

| 文件存在 | 包管理器 | Runner |
|---|---|---|
| `bun.lockb` | bun | `bun run` |
| `pnpm-lock.yaml` | pnpm | `pnpm run` |
| `yarn.lock` | yarn | `yarn` |
| `package-lock.json` | npm | `npm run` |
| `pyproject.toml` 或 `requirements.txt` | uv / pip | `uv run` 或 `python -m` |
| `Cargo.toml` | cargo | `cargo` |
| `go.mod` | go | `go` |

### 识别验证脚本

检查 `package.json`（或等价文件）有哪些 script 可用：

```bash
# Node.js 项目
cat package.json | grep -A 20 '"scripts"'
```

记下可用的：type-check / lint / test / build 命令。

---

## Phase 1 — 载入 plan

```bash
cat "$ARGUMENTS"
```

抽取这些段落：
- **Summary** — 在造什么
- **Patterns to Mirror** — 要遵循的代码约定
- **Files to Change** — 要新建或改的文件
- **Step-by-Step Tasks** — 执行顺序
- **Validation Commands** — 验证方法
- **完成门槛** — done 的定义

若文件不存在或不是有效 plan：

```
Error: Plan file not found or invalid.
Run `mcc-plan` prompt <feature-description> to create a plan first.
```

**Checkpoint**：plan 已载入，所有段落识别完毕，tasks 提取完毕。

---

## Phase 2 — 准备

### Git 状态

```bash
git branch --show-current
git status --porcelain
```

### 分支决策

| 当前状态 | 动作 |
|---|---|
| 在 feature branch | 直接用 |
| 在 main、工作区干净 | 新建 feature 分支：`git checkout -b feat/{plan-name}` |
| 在 main、工作区脏 | **停**——让用户先 stash 或 commit |
| 在该 feature 的 worktree | 用 worktree |

### 同步 remote

```bash
git pull --rebase origin $(git branch --show-current) 2>/dev/null || true
```

**Checkpoint**：在正确分支上，工作区可用，remote 同步完成。

---

## Phase 3 — 执行

### 逐 Task 循环

对 plan 里 **Step-by-Step Tasks** 的每一个 task：

1. **读 MIRROR 引用** — 打开 task 的 MIRROR 字段指向的那个 pattern 文件，看清约定再写代码
2. **实现** — 严格按 pattern 写。应用 GOTCHA 警告。用指定的 IMPORTS
3. **立即验证** — 每改一个文件马上：
   ```bash
   [Phase 0 选出的 type-check 命令]
   ```
   type-check 失败 → 修好再进下一个
4. **记进度** — 打日志：`[done] Task N: [name] — complete`

### 处理偏差

若必须偏离 plan：
- 记 **WHAT** 变了
- 记 **WHY** 变了
- 用修正后的方案继续
- 这些偏差会进最终 report

**Checkpoint**：全部 task 执行完，偏差已记录。

---

## Phase 4 — 验证（委派 verification-loop skill）

跑完整 5 级验证。实际执行**委派给 `verification-loop` skill**，它会根据项目类型跑对应命令并按"按级报 verdict / blocker"的格式汇总。

5 级是：

1. **Static Analysis** — type-check + lint（lint 先 auto-fix，残留手工修）
2. **Unit Tests** — 按 plan 里 Testing Strategy 写测试，全绿
3. **Build** — 零错误构建
4. **Integration Testing**（如适用）— 启服务、调 endpoint、停服务
5. **Edge Case Testing** — 跑 plan 里的 edge case 清单

任一级失败 → 修完再继续，不往下走。

### Integration Testing 注意

本命令不复制 server 启动脚本样板。**委派 `test-automator` agent**（若已装）执行 integration；若未装 agent，降级到简单 curl 本地检测。

**Windows 注**：PowerShell 下不要用 `&` 后台运行加 POSIX while 循环，改用 `Start-Process` + polling 或直接让 `test-automator` agent 处理跨平台。

**Checkpoint**：5 级全绿。

---

## Phase 5 — 报告

### 创建实施报告

```bash
mkdir -p .claude/PRPs/reports
```

写到 `.claude/PRPs/reports/{plan-name}-report.md`：

```markdown
# Implementation Report: [Feature Name]

## Summary
[What was implemented]

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | [from plan] | [actual] |
| Confidence | [from plan] | [actual] |
| Files Changed | [from plan] | [actual count] |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | [name] | [done] Complete | |
| 2 | [name] | [done] Complete | Deviated — [reason] |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | Pass | |
| Unit Tests | Pass | N tests written |
| Build | Pass | |
| Integration | Pass / N/A | |
| Edge Cases | Pass | |

## Files Changed

| File | Action | Lines |
|---|---|---|
| `path/to/file` | CREATED | +N |
| `path/to/file` | UPDATED | +N / -M |

## Deviations from Plan
[List any deviations with WHAT and WHY, or "None"]

## Issues Encountered
[List any problems and how they were resolved, or "None"]

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|

## Next Steps
- [ ] 代码审查：`mcc-review` prompt
- [ ] 创建 PR：`mcc-pr` prompt
```

### 若输入是 PRD phase

1. 把对应 phase 状态从 `in-progress` 改为 `complete`
2. 添加 report 路径引用

### 归档 plan

```bash
mkdir -p .claude/PRPs/plans/completed
mv "$ARGUMENTS" .claude/PRPs/plans/completed/
```

**Checkpoint**：report 写完，PRD 更新，plan 归档。

---

## Phase 6 — 输出

```
## Implementation Complete

- **Plan**: [plan file path] → archived to completed/
- **Branch**: [current branch name]
- **Status**: [done] All tasks complete

### Validation Summary

| Check | Status |
|---|---|
| Type Check | Pass |
| Lint | Pass |
| Tests | Pass (N written) |
| Build | Pass |
| Integration | Pass / N/A |

### Files Changed
- [N] files created, [M] files updated

### Deviations
[Summary or "None — implemented exactly as planned"]

### Artifacts
- Report: `.claude/PRPs/reports/{name}-report.md`
- Archived Plan: `.claude/PRPs/plans/completed/{name}.plan.md`

### PRD Progress (if applicable)
| Phase | Status |
|---|---|
| Phase 1 | Complete |
| Phase 2 | Next |

> Next: `mcc-review` prompt 审查改动，或 `mcc-pr` prompt 直接发 PR。
```

---

## 失败处理

### Type / Lint / Test / Build 失败

对照 plan 的"完成门槛"，遇到失败：

1. **不要"加 try/except 吞掉"或"timeout 拉长"这类补丁式动作**
2. **委派 `debugger` agent** 做根因分析（MCC 合并了 root-cause-analyst 能力到 `debugger`）
3. 修实现（而非改测试，除非测试本身有误）
4. 重跑对应级别的验证
5. 全绿才继续

### Integration Test 失败

1. 检查 server 是否起来
2. 检查 endpoint 是否存在
3. 检查请求格式
4. 修好重跑

---

## 成功标准

- **TASKS_COMPLETE**：所有 task 执行完
- **TYPES_PASS**：零类型错误
- **LINT_PASS**：零 lint 错误
- **TESTS_PASS**：测试全绿，新测试已写
- **BUILD_PASS**：构建成功
- **REPORT_CREATED**：实施报告已保存
- **PLAN_ARCHIVED**：plan 已移入 `completed/`

---

## 与其他命令的关系

- 上游：`mcc-plan` prompt 产出输入
- 之后：`mcc-review` prompt 审查，然后用 `git commit` 提交（自己写清楚的 commit message）
- 之后：`mcc-pr` prompt 创建 PR
- 若 PRD 还有下一个 phase：``mcc-plan` prompt <prd-path>` 自动选下一 phase

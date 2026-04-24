---
description: "生成自包含 PRP 实施计划：抓取所有代码模式和 mandatory reading，让实现期间零提问、零二次搜索。"
argument-hint: "<feature description | path/to/prd.md>"
---

# PRP Plan

**Input**: $ARGUMENTS

## 核心价值

生成一份**自包含**的实施计划：实现时所需的所有 pattern、convention、gotcha 都在这个文档里，不需要再回头搜代码、不需要再提问。

**黄金法则**：实施期间如果你会想"我得搜一下这个怎么写"——那就必须**现在**把这个知识固化到 plan 里。

---

## Phase 0 — 侦测

从 `$ARGUMENTS` 判断输入类型：

| 输入模式 | 识别 | 动作 |
|---|---|---|
| 路径以 `.prd.md` 结尾 | PRD 文件路径 | 解析 PRD，找下一个 pending phase |
| 其他 `.md` 且含 "Implementation Phases" 段 | 类 PRD 文档 | 解析 phases，找下一个 pending |
| 其他文件路径 | 参考文件 | 读进上下文，当 free-form 处理 |
| 自由文本 | 功能描述 | 直接进 Phase 1 |
| 空输入 | 无输入 | 反问用户 |

### PRD 解析（输入是 PRD 时）

1. `cat "$PRD_PATH"` 读 PRD
2. 定位 **Implementation Phases** 表格
3. 按状态筛选：找所有 `pending` 的 phase，检查依赖链（某 phase 可能依赖前 phase `complete`），选**第一个符合条件的 pending phase**
4. 提取：phase 名、描述、验收标准、依赖、范围备注
5. 用该 phase 描述作为要计划的 feature

若无 pending phase，汇报全部完成并停止。

---

## Phase 1 — 解析

### 理解要做什么

从输入（PRD phase 或自由描述）提取：

- **What** 具体交付物
- **Why** 用户价值
- **Who** 目标用户/系统
- **Where** 落在代码库哪里

### User Story

```
As a [type of user],
I want [capability],
So that [benefit].
```

### 复杂度评估

| 级别 | 特征 | 典型规模 |
|---|---|---|
| **Small** | 单文件、隔离改动、无新依赖 | 1-3 文件，<100 行 |
| **Medium** | 多文件、沿用现有模式、少量新概念 | 3-10 文件，100-500 行 |
| **Large** | 跨切面、新模式、外部集成 | 10+ 文件，500+ 行 |
| **XL** | 架构调整、新子系统、需要迁移 | 20+ 文件，考虑拆分 |

### Ambiguity Gate

只要有以下任一项不清楚，**停下来问用户**：

- 核心交付物模糊
- 成功标准未定义
- 有多种合理解读
- 技术路径有重大未知

不要猜。问。建立在假设上的计划会在实施时崩。

---

## Phase 2 — 探索（抓取代码库情报）

### 代码库搜索（8 个类别）

针对每个类别用 Grep / Glob / Read 直接搜：

1. **Similar Implementations** — 找类似已有功能，类比的 endpoint / component / module
2. **Naming Conventions** — 文件、函数、变量、类、导出的命名
3. **Error Handling** — 错误怎么捕获、传播、记录、返回
4. **Logging Patterns** — 记什么、级别、格式
5. **Type Definitions** — 相关类型、interface、schema 及其组织方式
6. **Test Patterns** — 测试文件位置、命名、setup/teardown、断言风格
7. **Configuration** — 相关 config、环境变量、feature flag
8. **Dependencies** — 相似功能用了哪些包、导入、内部模块

### 代码库追踪（5 个 trace）

1. **Entry Points** — request/action 如何进入系统并到达你要改的区域
2. **Data Flow** — 数据如何流经相关代码路径
3. **State Changes** — 哪些 state 被修改、在哪
4. **Contracts** — 要守住哪些 interface / API / 协议
5. **Patterns** — 使用什么架构模式（repository / service / controller 等）

### 统一发现表

| Category | File:Lines | Pattern | Key Snippet |
|---|---|---|---|
| Naming | `src/services/userService.ts:1-5` | camelCase services, PascalCase types | `export class UserService` |
| Error | `src/middleware/errorHandler.ts:10-25` | Custom AppError class | `throw new AppError(...)` |

---

## Phase 3 — 调研（外部文档）

若功能涉及外部库 / API / 不熟悉的技术：

1. **优先使用 Context7 MCP** 获取官方文档（避免训练数据幻觉）
2. 找使用示例和最佳实践
3. 识别版本相关的坑

格式：

```
KEY_INSIGHT: [what you learned]
APPLIES_TO: [which part of the plan this affects]
GOTCHA: [any warnings or version-specific issues]
```

若只用已熟悉的内部模式，跳过并注明："No external research needed — feature uses established internal patterns."

---

## Phase 4 — 设计（UX 变化，若有）

记录 before/after 用户体验（若是纯后端/内部变更，标 N/A）：

```
Before:
┌─────────────────────────────┐
│  [Current user experience]  │
└─────────────────────────────┘

After:
┌─────────────────────────────┐
│  [New user experience]      │
└─────────────────────────────┘
```

### Interaction Changes

| Touchpoint | Before | After | Notes |
|---|---|---|---|

---

## Phase 5 — 架构（策略设计）

- **Approach**：高层策略（如"加新 service layer 沿用 repository 模式"）
- **Alternatives Considered**：评估过的其他方案 + 被淘汰的原因
- **Scope**：WILL build 的具体边界
- **NOT Building**：OUT OF SCOPE 的明确清单（防止实施期范围蔓延）

---

## Phase 6 — 生成

写入：`.claude/PRPs/plans/{kebab-case-feature-name}.plan.md`

若目录不存在先创建：`mkdir -p .claude/PRPs/plans`

### Plan Template（核心必填 10 节）

````markdown
# Plan: [Feature Name]

## Summary
[2-3 sentence overview]

## User Story
As a [user], I want [capability], so that [benefit].

## Metadata
- **Complexity**: [Small | Medium | Large | XL]
- **Source PRD**: [path or "N/A"]
- **PRD Phase**: [phase name or "N/A"]
- **Estimated Files**: [count]

---

## Mandatory Reading

Files that MUST be read before implementing:

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 (critical) | `path/to/file` | 1-50 | Core pattern to follow |
| P1 (important) | `path/to/file` | 10-30 | Related types |
| P2 (reference) | `path/to/file` | all | Similar implementation |

### External Documentation

| Topic | Source | Key Takeaway |
|---|---|---|

---

## Patterns to Mirror

Code patterns discovered in the codebase. Follow these exactly.

### NAMING_CONVENTION
// SOURCE: [file:lines]
[actual snippet]

### ERROR_HANDLING
// SOURCE: [file:lines]
[actual snippet]

### LOGGING_PATTERN
// SOURCE: [file:lines]
[actual snippet]

### REPOSITORY_PATTERN
// SOURCE: [file:lines]
[actual snippet]

### SERVICE_PATTERN
// SOURCE: [file:lines]
[actual snippet]

### TEST_STRUCTURE
// SOURCE: [file:lines]
[actual snippet]

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `path/to/file.ts` | CREATE | New service for feature |
| `path/to/existing.ts` | UPDATE | Add new method |

## NOT Building

- [Explicit item 1 that is out of scope]

---

## Step-by-Step Tasks

### Task 1: [Name]
- **ACTION**: [What to do]
- **IMPLEMENT**: [Specific code/logic to write]
- **MIRROR**: [Pattern from Patterns to Mirror section]
- **IMPORTS**: [Required imports]
- **GOTCHA**: [Known pitfall]
- **VALIDATE**: [How to verify this task is correct]

### Task 2: [Name]
...

---

## Testing Strategy

### Unit Tests

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|

---

## Validation Commands

### Static Analysis
```bash
[project type check command]
```
EXPECT: Zero type errors

### Unit Tests
```bash
[project test command]
```
EXPECT: All tests pass

### Build
```bash
[project build command]
```
EXPECT: Build succeeds

### Manual Validation
- [ ] [Step-by-step manual verification checklist]

---

## 完成门槛（Done Criteria）

合并 acceptance / verification / completion 为单一 checklist：

- [ ] 所有 Task 完成
- [ ] 所有 Validation Commands 通过
- [ ] 代码遵循 Patterns to Mirror 中的所有模式
- [ ] Error handling 与代码库风格一致
- [ ] Tests 写了且全绿
- [ ] 无类型错误、无 lint 错误
- [ ] 无硬编码
- [ ] 无超出 NOT Building 范围的新增

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|

## Notes
[任何其他上下文、决策或观察]
````

### 可选节（需要时才填）

- **UX Before/After** 图（纯后端变更标 N/A 即可）
- **Edge Cases Checklist**（empty / max-size / invalid type / concurrent / network failure / permission denied）
- **Browser Validation**（有 UI 时给 dev server 启动指令）
- **Database Validation**（有 schema 变更时验证 migration）

---

## 输出落盘

1. 写计划到 `.claude/PRPs/plans/{name}.plan.md`
2. 若输入是 PRD：
   - 将对应 phase 状态从 `pending` 改为 `in-progress`
   - 在 phase 里添加 plan 文件路径引用

### 给用户的汇报

```
## Plan Created

- **File**: .claude/PRPs/plans/{name}.plan.md
- **Source PRD**: [path or "N/A"]
- **Phase**: [phase name or "standalone"]
- **Complexity**: [level]
- **Scope**: [N files, M tasks]
- **Key Patterns**: [top 3 discovered patterns]
- **External Research**: [topics researched or "none needed"]
- **Risks**: [top risk or "none identified"]
- **Confidence Score**: [1-10] — 单次通过实施的概率

> Next step: 运行 ``mcc-implement` prompt .claude/PRPs/plans/{name}.plan.md` 执行该计划。
```

---

## 自检

生成后对照这些问题审一遍：

- [ ] 所有相关文件都发现并登记了
- [ ] 命名约定带真实示例
- [ ] 错误处理模式有文档
- [ ] 测试模式有识别
- [ ] 每个 Task 都有 ACTION / IMPLEMENT / MIRROR / VALIDATE
- [ ] 无任何 Task 需要再搜代码库
- [ ] 导入路径明确
- [ ] 已知坑都写在 GOTCHA 里
- [ ] 代码片段是真实代码（不是编造的）
- [ ] SOURCE 引用指向真实文件和行号

## 与其他命令的关系

- 上游：`mcc-prd` prompt 若范围还不清楚，先写 PRD
- 下游：``mcc-implement` prompt <plan-path>` 执行
- 平行：`mcc-session-save` prompt 若 plan 写完要换 session

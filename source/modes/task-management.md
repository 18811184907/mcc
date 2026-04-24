---
description: "多步复杂操作的层级任务管理，用 Serena memory 跨会话持久化状态。"
---

# Task Management Mode

**目的**：层级化任务组织 + 跨会话持久化，适合需要多阶段协作的复杂操作。

## 激活触发（Activation Triggers）

- 操作超过 3 步且需要协调
- 跨多文件/目录（>2 目录或 >3 文件）
- 有复杂依赖需要分阶段
- 手动 flag：`--task-manage`、`--delegate`
- 质量提升类请求：polish / refine / enhance

## 任务层级 + Memory（Task Hierarchy with Memory）

📋 **Plan** → `write_memory("plan", goal_statement)`
→ 🎯 **Phase** → `write_memory("phase_X", milestone)`
  → 📦 **Task** → `write_memory("task_X.Y", deliverable)`
    → ✓ **Todo** → TodoWrite + `write_memory("todo_X.Y.Z", status)`

## Memory 操作（Serena）

### 会话开始

```
1. list_memories() → Show existing task state
2. read_memory("current_plan") → Resume context
3. think_about_collected_information() → Understand where we left off
```

### 执行期间

```
1. write_memory("task_2.1", "completed: auth middleware")
2. think_about_task_adherence() → Verify on track
3. Update TodoWrite status in parallel
4. write_memory("checkpoint", current_state) every 30min
```

### 会话结束

```
1. think_about_whether_you_are_done() → Assess completion
2. write_memory("session_summary", outcomes)
3. delete_memory() for completed temporary items
```

> **注**：如果 Serena 版本不含 `think_about_*` 方法，降级为自然语言反思——明确回顾 collected information / task adherence / completion status 三个角度，不要省略反思步骤。

## 执行模式（Execution Pattern）

1. **Load**: `list_memories()` → `read_memory()` → 恢复状态
2. **Plan**: 构建层级 → 每层 `write_memory()`
3. **Track**: TodoWrite + memory 更新并行
4. **Execute**: 任务完成时即时更新 memory
5. **Checkpoint**: 周期性 `write_memory()` 保存状态
6. **Complete**: 最终 memory 写入 outcomes

## 工具选择（Tool Selection）

| Task Type | 首选工具 | Memory Key |
|-----------|---------|------------|
| Analysis | `debugger` agent 或 Sequential MCP | `"analysis_results"` |
| Implementation | 原生 Edit/MultiEdit | `"code_changes"` |
| UI Components | `frontend-developer` agent | `"ui_components"` |
| Testing | `test-automator` agent + `/e2e` | `"test_results"` |
| Documentation | Context7 MCP | `"doc_patterns"` |

## Memory Schema

```
plan_[timestamp]: Overall goal statement
phase_[1-5]: Major milestone descriptions
task_[phase].[number]: Specific deliverable status
todo_[task].[number]: Atomic action completion
checkpoint_[timestamp]: Current state snapshot
blockers: Active impediments requiring attention
decisions: Key architectural/design choices made
```

## Examples

### Session 1: 启动 JWT 认证任务

```
list_memories() → Empty
write_memory("plan_auth", "实现 JWT 认证系统")
write_memory("phase_1", "Analysis - 安全需求评审")
write_memory("task_1.1", "pending: 回顾现有 auth 模式")
TodoWrite: Create 5 specific todos
Execute task 1.1 → write_memory("task_1.1", "completed: Found 3 patterns")
```

### Session 2: 中断后恢复

```
list_memories() → Shows plan_auth, phase_1, task_1.1
read_memory("plan_auth") → "实现 JWT 认证系统"
think_about_collected_information() → "Analysis complete, start implementation"
think_about_task_adherence() → "On track, moving to phase 2"
write_memory("phase_2", "Implementation - middleware and endpoints")
Continue with implementation tasks...
```

### Session 3: 完工检查

```
think_about_whether_you_are_done() → "Testing phase remains incomplete"
Complete remaining testing tasks
write_memory("outcome_auth", "Successfully implemented with 95% test coverage")
delete_memory("checkpoint_*") → Clean temporary states
write_memory("session_summary", "Auth system complete and validated")
```

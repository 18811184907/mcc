---
description: "5 阶段全面代码审查：质量+架构 / 安全+性能 / 测试+文档 / 最佳实践+CI/CD → 优先级汇总。模块或项目级；单点审查请用 /mcc:review。"
argument-hint: "<target path or description> [--security-focus] [--performance-critical] [--strict-mode] [--framework react|spring|django|rails]"
---

# Comprehensive Code Review Orchestrator

**Input**: $ARGUMENTS

## 核心价值

对一个模块或整个项目做分层全面审查：质量 / 架构 / 安全 / 性能 / 测试 / 文档 / 框架最佳实践 / CI/CD，每层并行委派专家 agent，最后汇总成按优先级排序的 action plan。

与 `/mcc:review` 的区别：`/mcc:review` 是单点（本地未提交或单个 PR），本命令是全景。

## CRITICAL BEHAVIORAL RULES

1. **按 phase 顺序执行** — 不跳、不重排、不合并
2. **必写输出文件** — 每 phase 输出 `.claude/PRPs/reviews/full/{timestamp}/NN-xxx.md`，下一 phase 从文件读上下文
3. **在 checkpoint 处停** — 用 AskUserQuestion 明确等待批准
4. **失败即停** — agent 报错 / 文件读不到 / 权限问题立刻停，告诉用户
5. **优先用 MCC 装的 agent，无则降级 `general-purpose`** — 见各步 subagent 映射
6. **不要自行进入 plan mode** — 本命令就是 plan，直接执行

## Pre-flight Checks

### 1. Session 检查

`timestamp` = 当前时间（ISO 8601，秒级，文件系统安全格式，例：`2026-04-22T143045`）。

检查 `.claude/PRPs/reviews/full/` 下最新 session：

- 存在 `in_progress` session：问用户 resume or 新开
- 存在 `complete` session：询问是否归档新开

### 2. 初始化

```bash
mkdir -p .claude/PRPs/reviews/full/{timestamp}
```

写 `state.json`：

```json
{
  "target": "$ARGUMENTS",
  "status": "in_progress",
  "flags": {
    "security_focus": false,
    "performance_critical": false,
    "strict_mode": false,
    "framework": null
  },
  "current_step": 1,
  "current_phase": 1,
  "completed_steps": [],
  "files_created": [],
  "started_at": "ISO_TIMESTAMP",
  "last_updated": "ISO_TIMESTAMP"
}
```

解析 flag 并更新。

### 3. 识别审查目标

从 $ARGUMENTS 判断审查范围：
- 文件/目录路径 → 先验证存在
- 描述（如 "recent changes" / "authentication module"）→ 定位相关文件
- 列出被审查文件让用户确认

写 `00-scope.md`：

```markdown
# Review Scope

## Target
[Description]

## Files
[List of files/directories]

## Flags
- Security Focus: [yes/no]
- Performance Critical: [yes/no]
- Strict Mode: [yes/no]
- Framework: [name or auto-detected]

## Review Phases
1. Code Quality & Architecture
2. Security & Performance
3. Testing & Documentation
4. Best Practices & Standards
5. Consolidated Report
```

---

## Phase 1 — 代码质量与架构（Steps 1A-1B，并行）

### Step 1A：Code Quality Analysis
**subagent**：**`code-reviewer`**

prompt 包含 `00-scope.md` 完整内容。deliverables：

```
1. Code complexity：cyclomatic / cognitive complexity，深层嵌套
2. Maintainability：命名、函数/方法长度、class 内聚
3. Code duplication
4. Clean Code：SOLID 违反、code smells、anti-patterns
5. Technical debt
6. Error handling：缺失处理、吞掉 exception、错误信息不清

每条 finding：
- Severity (Critical / High / Medium / Low)
- File:line location
- Description
- Specific fix recommendation with code example
```

### Step 1B：Architecture & Design Review
**subagent**：**`backend-architect`**（MCC 没有单独的 `architect-review` 专职 agent，由 `backend-architect` 承担架构审查职责；若审前端也可加 `frontend-developer` 并行）

deliverables：

```
1. Component boundaries
2. Dependency management
3. API design
4. Data model
5. Design patterns（使用恰当性 / 缺失抽象 / 过度工程）
6. Architectural consistency

每条 finding：severity + 架构影响 + 具体改进建议
```

两个都完成后，合并到 `01-quality-architecture.md`：

```markdown
# Phase 1: Code Quality & Architecture Review

## Code Quality Findings
[Summary from 1A, organized by severity]

## Architecture Findings
[Summary from 1B, organized by severity]

## Critical Issues for Phase 2 Context
[给后续 security / performance 审查用的关键 finding]
```

---

## Phase 2 — 安全与性能（Steps 2A-2B，并行）

读 `01-quality-architecture.md` 的 "Critical Issues for Phase 2 Context" 做上下文。

### Step 2A：Security Vulnerability Assessment
**subagent**：**`security-reviewer`**

deliverables：

```
1. OWASP Top 10：injection, broken auth, sensitive data exposure,
   XXE, broken access control, misconfig, XSS, insecure deserialization,
   vulnerable components, insufficient logging
2. Input validation：sanitization / unvalidated redirects / path traversal
3. Auth/authz：flawed logic、privilege escalation、session mgmt
4. Cryptographic：弱算法、硬编码 secret、key mgmt
5. Dependency vulnerabilities：CVE / 过时包
6. Configuration security：debug mode、verbose error、permissive CORS、缺 security headers

每条 finding：
- Severity（带 CVSS 若适用）
- CWE 引用
- File:line
- POC 或攻击场景
- 修复步骤 + 代码示例
```

### Step 2B：Performance & Scalability
**subagent**：**`performance-engineer`**

deliverables：

```
1. Database：N+1 queries、missing indexes、unoptimized queries、connection pool sizing
2. Memory：leaks、unbounded collections、large object allocation
3. Caching：缺 cache、stale cache、invalidation
4. I/O bottlenecks：同步阻塞、缺分页、大 payload
5. Concurrency：race conditions、deadlocks、线程安全
6. Frontend：bundle size、render perf、无谓 re-render、缺 lazy load
7. Scalability：水平扩展障碍、stateful components、SPOF

每条：severity + 影响估计 + 优化建议 + 代码示例
```

合并到 `02-security-performance.md`：

```markdown
# Phase 2: Security & Performance Review

## Security Findings
[Summary from 2A]

## Performance Findings
[Summary from 2B]

## Critical Issues for Phase 3 Context
```

---

## PHASE CHECKPOINT 1 — 用户批准

展示 Phase 1 + Phase 2 findings 摘要：

```
Phases 1-2 complete：Code Quality / Architecture / Security / Performance 审查完成。

Summary:
- Code Quality: [X critical, Y high, Z medium]
- Architecture: [X critical, Y high, Z medium]
- Security: [X critical, Y high, Z medium]
- Performance: [X critical, Y high, Z medium]

请审查:
- .claude/PRPs/reviews/full/{timestamp}/01-quality-architecture.md
- .claude/PRPs/reviews/full/{timestamp}/02-security-performance.md

1. 继续——进入 Testing & Documentation 审查
2. 先修 critical——处理完再继续
3. 暂停——保存进度停下
```

若 `--strict-mode` 且有 Critical 发现，**推荐选 2**。

用户批准才继续。

---

## Phase 3 — 测试与文档（Steps 3A-3B，并行）

读 `01-*` + `02-*` 做上下文。

### Step 3A：Test Coverage & Quality
**subagent**：**`test-automator`**

deliverables：

```
1. Test coverage：哪些路径有测试、哪些关键路径没测
2. Test quality：测行为 vs 测实现、assertion 质量
3. Test pyramid：unit vs integration vs E2E 比例
4. Edge cases：边界、错误路径、并发场景
5. Test maintainability：隔离、mock、flaky 迹象
6. Security test gaps：auth / input validation 是否有测
7. Performance test gaps：关键路径是否有 load test

每条：severity + 哪里没测/测得差 + 具体测试建议（带示例 test code）
```

### Step 3B：Documentation & API Review
**subagent**：**`general-purpose`**（或项目定制的 doc-focused agent 若有）

deliverables：

```
1. Inline 文档：复杂算法和业务逻辑是否解释
2. API 文档：endpoint 有示例吗？req/resp schema？
3. Architecture 文档：ADR、系统图、组件文档
4. README：setup / dev workflow / deployment guide
5. 准确性：文档是否匹配实际实现
6. Changelog / migration：breaking change 是否记录

每条：severity + 缺什么/不准 + 具体建议
```

合并到 `03-testing-documentation.md`。

---

## Phase 4 — 最佳实践与标准（Steps 4A-4B，并行）

读所有之前的文件做上下文。

### Step 4A：Framework & Language Best Practices
**subagent（按栈选）**：
- Python 栈 → **`python-pro`**
- TS/Node 栈 → **`typescript-pro`**
- JavaScript 栈 → **`javascript-pro`**
- 其他 → **`general-purpose`** 并在 prompt 里写明语言

deliverables：

```
1. Language idioms：符合语言惯用法吗？
2. Framework patterns：符合 framework 推荐模式吗？（React hooks / Django views / Spring beans）
3. Deprecated APIs
4. Modernization opportunities
5. Package management：依赖是否最新 / 无用依赖
6. Build configuration：dev vs prod 设置

每条：severity + 当前模式 vs 推荐模式 + 迁移建议
```

### Step 4B：CI/CD & DevOps
**subagent**：**`general-purpose`**（MCC 未装 DevOps 专家 agent）

deliverables：

```
1. CI/CD pipeline：build automation、test gates、deployment stages、security scanning
2. Deployment strategy：blue-green / canary / rollback
3. IaC：配置版本化并 review 过吗
4. Monitoring & observability
5. Incident response：runbook、on-call、rollback plan
6. Environment management：config 分离、secret mgmt、environment parity

每条：severity + 运维风险 + 具体改进
```

合并到 `04-best-practices.md`。

---

## Phase 5 — 合并报告（Step 5）

读所有 `00-04` 生成最终汇总 `05-final-report.md`：

```markdown
# Comprehensive Code Review Report

## Review Target
[From 00-scope.md]

## Executive Summary
[2-3 句整体代码健康度和关键 concern]

## Findings by Priority

### Critical Issues (P0 — Must Fix Immediately)
[所有 Critical findings 带来源 phase 引用]

- Security vulnerabilities with CVSS > 7.0
- Data loss / corruption risks
- Auth/authz bypasses
- Production stability threats

### High Priority (P1 — Fix Before Next Release)
[所有 High findings]

- Performance bottlenecks impacting user experience
- Missing critical test coverage
- Architectural anti-patterns causing technical debt
- Outdated dependencies with known vulnerabilities

### Medium Priority (P2 — Plan for Next Sprint)
[所有 Medium findings]

### Low Priority (P3 — Track in Backlog)
[所有 Low findings]

## Findings by Category

- **Code Quality**: [count] findings ([breakdown by severity])
- **Architecture**: [count] findings
- **Security**: [count] findings
- **Performance**: [count] findings
- **Testing**: [count] findings
- **Documentation**: [count] findings
- **Best Practices**: [count] findings
- **CI/CD & DevOps**: [count] findings

## Recommended Action Plan

1. [有序的行动列表，从 Critical/High 开始]
2. [相关修复可合并]
3. [估算相对工作量：small/medium/large]

## Review Metadata

- Review timestamp: [ISO]
- Phases completed: [list]
- Flags applied: [active flags]
```

更新 state.json：`status` → `"complete"`。

---

## 完成

展示最终摘要：

```
Comprehensive code review complete for: $ARGUMENTS

## Review Output Files
.claude/PRPs/reviews/full/{timestamp}/
  ├── 00-scope.md
  ├── 01-quality-architecture.md
  ├── 02-security-performance.md
  ├── 03-testing-documentation.md
  ├── 04-best-practices.md
  └── 05-final-report.md

## Summary
- Total findings: [count]
- Critical: [X] | High: [Y] | Medium: [Z] | Low: [W]

## Next Steps
1. 看完整报告：.claude/PRPs/reviews/full/{timestamp}/05-final-report.md
2. 立即处理 Critical (P0)
3. 本 sprint 处理 High (P1)
4. Medium/Low 进 backlog
```

---

## Artifact 路径说明

本命令的所有产物放 `.claude/PRPs/reviews/full/{timestamp}/`（不是旧版 `.full-review/`）。

## 与其他命令的关系

- 单 PR / 单文件审查：`/mcc:review` 更合适
- 新造全栈特性：`/mcc:full-stack` 已包含审查 step
- 修 bug 后做 sanity check：`/mcc:review` 或 `/mcc:verify`

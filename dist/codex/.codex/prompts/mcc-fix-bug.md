---
description: "修复一个 bug：先分析根因再改代码（强制防止只打补丁）。需要深度根因调查的单点问题调用。"
argument-hint: "<bug 描述或错误信息（可选，为空则 Claude 主动询问）>"
---

# Fix Bug

**Input**: $ARGUMENTS

## 铁律

**禁止直接改代码**。任何 bug 都要先查清根因再动手，避免"看起来修好了但其实只是换了种方式出错"。

## Phase 1 — 理解（如果输入为空就先问）

如果 `$ARGUMENTS` 为空或不清楚，先问用户：
- 什么场景出现的 bug？
- 预期行为 vs 实际行为？
- 报错信息（栈 + 日志）？
- 最近改了什么？

## Phase 2 — 根因调查（强制）

委派 **`debugger`** agent 做深度调查（MCC 已将根因分析方法论合并到 `debugger` 里）：
- 读相关代码，跟踪调用链
- 查日志、错误信息
- 检查同类模式的历史实现
- 产出"根因假设" + "证据链" + "置信度"

**禁止行为**：
- ❌ "重试试试"
- ❌ "加个 try/except 就行"
- ❌ "timeout 拉长点"
- ❌ "忽略这个 warning"

## Phase 3 — 方案呈现（等用户确认）

根据调查结果，委派 **`debugger`** agent 提出 2 个方案：
- **方案 A**：最小改动修复
- **方案 B**：根本解决（如果是架构问题）

**呈现给用户**，等确认再进 Phase 4。不要直接动手。

## Phase 4 — 实施 + 验证

用户选定方案后：
1. 按 TDD 流程：先写失败测试（证明能复现 bug）
2. 修改代码让测试通过
3. 跑完整测试套件（回归检查）
4. 跑 `/verify` 做最终验证

## Phase 5 — 归档

成功后，把调查过程 + 根因 + 修复方案写到：

```
docs/mistakes/bug-{yyyy-mm-dd}-{short-name}.md
```

以便将来同类问题能快速 grep 到。归档文件结构建议：

```markdown
# Bug: {short name}

**Date**: {yyyy-mm-dd}
**Reporter**: {who}
**Severity**: CRITICAL | HIGH | MEDIUM | LOW

## 症状
[用户/调用方看到的现象、报错]

## 复现步骤
1. ...
2. ...

## 根因
[`debugger` agent 调查产出]

## 修复
[方案 + diff 摘要]

## 验证
[测试 + 回归 + /verify 结果]

## 教训
[下次同类问题如何更早发现]
```

---

**Related**: `/troubleshoot`（更轻量、多域分诊）, `/verify`（最终闸门）, `/learn`（把这个根因变成 learned skill）

---
description: "跑完整验证流程：build / type / lint / test / security / diff。这是 verification-loop skill 的快捷入口。"
---

# Verify

**Input**: `$ARGUMENTS`（可选，指定验证深度：quick / standard / deep）

## 核心价值

这是 `verification-loop` skill 的快捷入口——不重复 skill 内容，一切逻辑由 skill 执行。

## 委派

应用 **`verification-loop` skill**：
- 按用户要求的验证深度选择（未指定时用默认 standard）
- 按当前项目类型（Node / Python / Rust / Go / Java）依次跑：build → types → lint → tests → security/log → diff review
- 汇报 verdict 和 blocker——**本命令不维护第二份验证清单**

## 与其他命令的关系

- `mcc-implement` prompt 的 Phase 4 会自动委派 verification-loop；直接跑 `mcc-verify` prompt 适用于"已改完想单独验证一遍"
- `mcc-review` prompt 的 Phase 4 也委派同一 skill
- 验证失败 → 用 `mcc-build-fix` prompt（build 问题）或 `mcc-fix-bug` prompt（bug）或 `mcc-troubleshoot` prompt（多域）

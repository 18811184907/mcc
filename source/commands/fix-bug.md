---
description: "修 bug / 排查问题（合并了 troubleshoot 的多域分诊）。自动判断是代码 bug / build 错 / 性能退化 / 部署故障，走对应流程。强制根因分析，禁止打补丁。"
argument-hint: "<问题描述，留空则 Claude 问>"
---

# Fix Bug（统一问题诊断入口）

**Input**: $ARGUMENTS

## 铁律

**禁止直接改代码**。任何问题都先分诊 → 定类型 → 查根因 → 再动手。避免"看起来修好但只是换种方式出错"。

---

## Phase 1 — 分诊（自动判断问题类型）

根据 `$ARGUMENTS` 的关键词和用户提供的证据自动判断：

| 类型 | 触发关键词 | 走的路径 |
|---|---|---|
| **bug** | "报错 / 崩溃 / 返回错的值 / 空指针 / 异常 / null / 逻辑错" | 深度根因调查（Phase 2-5） |
| **build** | "build 失败 / 编译错 / tsc 报错 / webpack / vite" | 编译诊断（Phase 2b） |
| **performance** | "慢 / 卡 / 响应变长 / 内存 / CPU / 延迟" | 性能诊断（委派 `performance-engineer`） |
| **deployment** | "prod 起不来 / 部署 / env / secret / health check / docker" | 运维排查（Phase 2d） |
| **不确定** | 其他 | 先问用户 1-2 个澄清问题，再选路径 |

如果 `$ARGUMENTS` 为空：先问
- 什么场景触发的？
- 预期行为 vs 实际行为？
- 报错信息（贴 stack + log）？
- 最近改了什么？

---

## Phase 2 — 根因调查（bug 类）

**委派 `debugger` agent** 做深度调查：
- 读相关代码，跟踪调用链
- 查日志、错误信息
- 检查同类模式的历史实现（`docs/mistakes/`）
- 产出"根因假设 + 证据链 + 置信度"

**禁止**：
- ❌ "重试试试"
- ❌ "加个 try/except 就行"
- ❌ "timeout 拉长点"
- ❌ "忽略 warning"

## Phase 2b — 编译诊断（build 类）

**遵循本命令的铁律——必找根因，禁止打补丁**。不是"重试更多次"。

- 跑 build 命令收完整 error（stack + log）
- 按错误类型分诊（type error / dep missing / config 错 / tooling 版本）
- 一次只改一处，改完必须验证错误是否变化
- 如果同错误改了 2 次仍不降级（从 error → warn → gone）**停下**，把证据链给用户
- 禁止：加 `@ts-ignore`、`eslint-disable`、降低 tsconfig 严格度来"绕过"错误
- 禁止：随便升级/降级依赖"试试看"——必须先读 changelog 有证据再动

## Phase 2c — 性能诊断（performance 类）

**委派 `performance-engineer` agent**：
- 指标分析 → 瓶颈定位
- 给出优化建议（N+1 查询 / 缺索引 / 前端 bundle / 缓存缺失）
- 不要一上来就重写代码

## Phase 2d — 运维排查（deployment 类）

- 环境差异（本地 vs staging vs prod）
- env vars / secrets 是否齐
- health check / readiness probe
- 依赖服务（DB / Redis / 上游 API）可达性
- 最近的部署配置变更

---

## Phase 3 — 方案呈现（等用户确认）

根据调查结果，给 2 个方案：
- **方案 A**：最小改动修复
- **方案 B**：根本解决（如果是架构问题）

**呈现给用户，等 Y 确认再进 Phase 4**。不要直接动手。

---

## Phase 4 — 实施 + 验证

1. bug 类：按 TDD 先写失败测试（证明能复现）→ 修代码让测试通过
2. 跑完整测试套件（回归检查）
3. 跑 verification-loop skill（build / type / lint / test / security / diff 6 阶段）
4. 如果涉及性能：跑前后对比基准

---

## Phase 5 — 归档

成功后写入：

```
docs/mistakes/{yyyy-mm-dd}-{short-name}.md
```

结构：

```markdown
# {short name}

**Date**: {yyyy-mm-dd}
**Type**: bug | build | performance | deployment
**Severity**: CRITICAL | HIGH | MEDIUM | LOW

## 症状
[用户/调用方看到的现象、报错]

## 复现步骤
1. ...

## 根因
[`debugger` / `performance-engineer` agent 调查产出]

## 修复
[方案 + diff 摘要]

## 验证
[测试 + 回归结果]

## 教训
[下次同类问题如何更早发现]
```

归档会被 `continuous-learning-v2` skill 自动扫描沉淀为 learned skill（不需要再敲专门命令）。

---
description: "多域问题诊断：bug / build / performance / deployment。快速定位→根因→修复。单 bug 深挖用 /fix-bug，专 build 错用 /build-fix。"
argument-hint: "<issue 描述> [--type bug|build|performance|deployment] [--trace] [--fix]"
---

# Troubleshoot

**Input**: $ARGUMENTS

## 核心价值

问题发生但还不确定是什么类型——代码 bug？build 失败？性能退化？部署故障？本命令做**先分诊再解决**：系统性根因分析 + 结构化调试方法 + 安全修复 + 验证。

与 `/fix-bug` 的分工：troubleshoot 适合类型未知或跨域；fix-bug 适合已确认是 bug 且需要深度根因分析的单点问题。

---

## 触发场景

- 代码缺陷 / 运行时错误
- Build 失败
- 性能退化
- 部署问题
- 系统行为异常

---

## 行为流程

### 1. 分析（Analyze）
审查问题描述，收集相关系统状态：
- 错误信息 / stack trace
- 复现步骤
- 最近变更（git log）
- 相关 log 片段
- 环境差异（本地 vs staging vs prod）

### 2. 调查（Investigate）— 委派 debugger agent

**委派 `debugger` agent** 做系统性根因分析（MCC 已将根因分析方法论合并到 `debugger`）：
- 通过 pattern matching 识别可能根因
- 形成假设 → 找证据验证
- 排除假阳性
- 给出根因假设 + 证据链 + 置信度

### 3. 调试（Debug）
执行结构化调试：
- Log 分析 / state 检查
- Diagnostic 命令（按领域选：`curl`、`top`、`netstat`、`npm run build`）
- Grep 错误模式

### 4. 提出方案（Propose）— 委派 debugger agent
基于调查结果，**委派 `debugger` agent** 给 2 个方案：
- **方案 A**：最小改动修复
- **方案 B**：根本解决（如是架构问题）
每个方案带影响评估 + 风险

### 5. 解决（Resolve）
按问题类型路由到更专的命令或直接修：

| 问题类型 | 处理 |
|---|---|
| Build 类 | 转 `/build-fix` |
| Bug 类（单点深挖）| 转 `/fix-bug` |
| 性能类 | 可委派 `performance-engineer` agent，或按本命令内联方案修 |
| 部署类 | 按运维视角排查（env / secret / health check） |

修完跑 `/verify` 确认解决。

---

## 关键模式

- **Bug 调查**：错误分析 → stack trace → 代码检查 → 修复验证
- **Build 排查**：build log → 依赖检查 → 配置验证
- **性能诊断**：指标分析 → 瓶颈定位 → 优化建议
- **部署问题**：环境分析 → 配置验证 → service 验证

---

## 示例

### 代码 bug 调查
```
/troubleshoot "user service 里的空指针异常" --type bug --trace
# 系统性分析错误上下文和调用栈
# 识别根因 + 给出精准修复建议
```

### Build 失败分析
```
/troubleshoot "TypeScript 编译错误" --type build --fix
# 分析 build log 和 TS 配置
# 对常见编译问题自动应用安全修复（委派 /build-fix）
```

### 性能退化诊断
```
/troubleshoot "API response 时间变慢" --type performance
# 指标分析 + 瓶颈识别
# 给出优化建议和监控方向
```

### 部署问题
```
/troubleshoot "服务在 prod 起不来" --type deployment --trace
# 环境和配置分析
# 系统性验证部署前置条件和依赖
```

---

## 边界

**Will:**
- 用结构化调试方法做系统性问题诊断
- 给出验证过的方案与完整问题分析
- 做**安全**修复并带验证与详细解决文档

**Will Not:**
- 未做分析就应用高风险修复
- 未经用户明确许可就改 prod 系统
- 未理解全局影响就做架构变更

---

## 与其他命令的关系

- 专 build 问题 → `/build-fix`
- 单 bug 深挖 → `/fix-bug`
- 修完验证 → `/verify`
- 复盘沉淀 → `/learn`（把解法变成 learned skill）

---
name: confidence-check
description: "实现前 5 维度置信度打勾（去重/架构/官方文档/OSS 参考/根因），≥90% 才准开工。100-200 token 省 5K-50K token。"
---

# Confidence Check Skill

## 目的

在**开始实现之前**评估置信度，防止错方向返工。

**硬门槛**：总分 ≥ 90% 才准开工。

## 何时使用

实现任何任务**之前**调用，确保：

- 没有重复实现
- 架构合规
- 官方文档读过
- 找到可工作的 OSS 参考
- 根因已定位

## 置信度评分维度

按下面 5 个维度打分（0.0-1.0），加权求和。

### 1. No Duplicate Implementations?（25%）

**检查**：在当前代码库搜同类功能

```bash
# 用 Grep 找相似函数
# 用 Glob 找相关模块
```

- ✅ 未找到重复 → 过
- ❌ 已有类似实现 → 不过（应复用而不是新写）

### 2. Architecture Compliance?（25%）

**检查**：技术栈是否一致

- 读 `CLAUDE.md`、`PLANNING.md`、`AGENTS.md`
- 确认沿用现有模式（ORM、cache、queue、HTTP client）
- 避免无必要地引入新依赖

- ✅ 复用现有栈（比如 Pydantic + FastAPI + SQLAlchemy + Redis）→ 过
- ❌ 无理由引入新框架 → 不过

### 3. Official Documentation Verified?（20%）

**检查**：动手前读官方文档

- **Context7 MCP** 查最新官方文档
- **Exa MCP** 做技术发现与对比
- **WebFetch** 直接拉文档 URL
- 确认 API 签名 / 版本兼容 / 弃用警告

- ✅ 官方文档已核对 → 过
- ❌ 靠训练数据猜 → 不过

### 4. Working OSS Implementations Referenced?（15%）

**检查**：有没有靠谱的 OSS 参考

- 搜 GitHub 找相近实现
- 核对是否真有 tests / 近期提交 / 合理 star 数
- 避免拿 demo / POC 当生产参考

- ✅ 找到可工作的 OSS 参考 → 过
- ❌ 没找到同类实现 → 不过

### 5. Root Cause Identified?（15%）

**检查**：真问题定位了吗？

- 分析错误信息 / stack trace / 日志
- 区分**症状**和**根因**
- 确认不是在治标

- ✅ 根因清楚 → 过
- ❌ 只看到症状 → 不过

## 置信度计算

```
Total = Check1 (25%) + Check2 (25%) + Check3 (20%) + Check4 (15%) + Check5 (15%)

Total ≥ 0.90:  ✅ 开工
0.70 ≤ Total < 0.90:  ⚠️  先列出备选方案 / 追问用户
Total < 0.70:  ❌ STOP，补上下文再来
```

## 输出格式

```
📋 Confidence Checks:
   ✅ No duplicate implementations found
   ✅ Uses existing tech stack (FastAPI + Pydantic + SQLAlchemy)
   ✅ Official documentation verified (Context7: FastAPI 0.115)
   ✅ Working OSS implementation found (github.com/xxx/yyy, 3.2k stars)
   ✅ Root cause identified (N+1 query in repo layer)

📊 Confidence: 1.00 (100%)
✅ High confidence — proceeding to implementation
```

## ROI

**Token 账**：100-200 token 的置信度检查，省下 5,000-50,000 token 的返工。

错方向返工的平均成本（3-10 次 edit + 1 次 review + 1 次 refactor）≈ 20,000-50,000 token；前置检查 200 token 以内就能拦下绝大多数风险。

## 与 MCC 其它组件的配合

- `/tdd` 前：先跑 confidence-check，不到 90% 先补齐再写测试
- `/implement` 前：plan 产出后、动手前，跑一次确认
- `/plan` 产出后：plan 里的技术选型通过 confidence-check 才进 implement 阶段
- `confidence < 0.7` 时：切到 `/prd` 或 `product-lens` skill 补需求侧上下文

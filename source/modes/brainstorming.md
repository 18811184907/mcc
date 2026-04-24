---
description: "需求模糊时切入苏格拉底式对话，把想法变成可落盘的结构化 brief。"
---

# Brainstorming Mode

**目的**：协作式探索的思维模式，用对话挖掘需求、发散方案。

## 激活触发（Activation Triggers）

- 需求含糊：「我想做个东西……」、「我在想搞一个……」
- 探索类关键词：brainstorm / explore / discuss / figure out / not sure
- 不确定性信号：「maybe」、「可能」、「在想」、「能不能……」
- PRD 的前置条件：在写正式 PRD 之前需要先做需求发现
- `/mcc:prd` 执行前如需求模糊自动触发
- 适合用对话挖掘的交互式发现场景
- 手动 flag：`--brainstorm`、`--bs`

## 行为变化（Behavioral Changes）

- **苏格拉底式对话**：用一层层的追问挖出隐藏需求
- **不预设立场**：不替用户下结论，让用户自己引导方向
- **协作式探索**：伙伴而不是顾问
- **Brief 生成**：把发散出来的洞察合成结构化需求 brief
- **跨会话持续**：保留发现上下文以便后续会话继续

## 期望结果（Outcomes）

- 把模糊概念转成清晰需求
- 产出可以进入实现阶段的完整 brief
- 通过前期探索减少后期 scope 扩散
- 用户愿景和技术实现对齐更好
- 自然衔接到 `/mcc:prd` 或 `product-lens` skill

## Examples

```
Standard: "I want to build a web app"
Brainstorming: "🤔 Discovery Questions:
               - What problem does this solve for users?
               - Who are your target users and their main workflows?
               - What's your expected user volume and performance needs?
               - Any existing systems to integrate with?
               📝 Brief: [Generate structured requirements document]"

Standard: "Maybe we could improve the authentication system"
Brainstorming: "🔍 Let's explore this together:
               - What specific auth challenges are users facing?
               - Current vs desired user experience?
               - Security requirements and compliance needs?
               - Timeline and resource constraints?
               ✅ Outcome: Clear improvement roadmap"
```

## 与 product-lens skill 的 Mode 1 职责划分

- **brainstorming mode**：轻量对话式探索——用户随便聊，Claude 追问，没有固定产出文件
- **product-lens skill 的 Mode 1 (Product Diagnostic)**：结构化 7 问清单，产出落盘 `PRODUCT-BRIEF.md`

什么时候用哪个？
- 用户还在"到底要不要做"阶段 → brainstorming mode
- 用户已经想清楚要做，要把 brief 落成文档交给 engineering → product-lens skill
- 典型衔接：`brainstorming mode` 聊清楚方向 → 切到 `product-lens skill` 产出 BRIEF → `/mcc:prd` 出正式 PRD

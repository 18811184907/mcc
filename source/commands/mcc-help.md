---
description: "MCC 进度导航：扫当前项目的 PRPs/ 与 docs/mistakes/ 推断已做了什么、下一步建议做什么。基于实际文件给建议，不要自由发挥成'选项编号 1234 你回我编号'式硬塞。"
argument-hint: (无参数)
---

# MCC Help · 进度导航

**这是 MCC 的导航命令**（不是 Claude Code 内置 `/help`）。

## 目的

让 AI 在**几秒内**告诉用户：当前 MCC 项目里**已经做了什么、卡在哪、下一步推荐做什么**。

完全基于**当前项目的真实文件**回答，不要凭印象编流程。

## 强制行为（CRITICAL · 必读）

> 该命令容易触发 LLM "硬塞工作流" anti-pattern。下面这些**禁止**：

**禁止**：
- ❌ "你回我一个编号 1/2/3/4，我按那个路径继续" —— 这是劫持用户决策权
- ❌ 在没扫文件之前就编"4 个推荐路径" —— 没有依据
- ❌ 把所有 mcc-xxx 命令背一遍当回答 —— 用户要的是**当前进度**，不是命令字典
- ❌ 长篇介绍 MCC 是什么 —— 用户用了 MCC 才会跑 mcc-help，已经知道
- ❌ 主动开新工作流（比如自己开始 plan / prd） —— 只**建议**，不**执行**

**必做**：
- ✅ 先扫文件（PRPs / docs/mistakes / .claude/PROJECT_VAULT.md / docs/SCHEMA.md / CLAUDE.md / AGENTS.md）
- ✅ 基于扫描结果给"已完成 / 未完成 / 推荐下一步"三段简明输出
- ✅ 推荐的"下一步"必须 ≤3 条，附调用方式（Claude Code 端 `/xxx`，Codex 端 `mcc-xxx`）
- ✅ 不知道就说不知道，不要瞎编

## 执行流程

### Phase 1 — 扫文件（并行 Glob，~5s）

并行（同一回复发多个 tool call）：

```
Glob ".claude/PRPs/prds/*.md"          → 已写的 PRD
Glob ".claude/PRPs/plans/*.md"         → 已做的 plan
Glob ".claude/PRPs/reports/*.md"       → 已跑的 review/onboard 报告
Glob ".claude/PRPs/onboarding/*.md"    → onboard 报告
Glob "docs/mistakes/*.md"              → 已修的 bug（fix-bug 自动归档）
Glob "docs/adr/*.md"                   → 架构决策
Glob ".claude/PROJECT_VAULT.md"        → vault 是否已建（不读内容！）
Glob "docs/SCHEMA.md"                  → schema 是否已建
Glob "CLAUDE.md" 与 "AGENTS.md"        → 协作基线是否已建
```

**禁止**读 `.claude/PROJECT_VAULT.md` 内容（含 secret）。只看是否存在 + mtime。

### Phase 2 — 推断进度

按这个简易规则映射"已完成阶段"：

| 文件存在 | 推断 |
|---|---|
| `CLAUDE.md` 或 `AGENTS.md` | 已 `/init` 或 `/onboard` |
| `.claude/PRPs/onboarding/*.md` | 已 `/onboard`（深度接手） |
| `.claude/PRPs/prds/*.md` 至少 1 份 | 已写过 PRD |
| `.claude/PRPs/plans/*.md` 比 prds 少 | PRD 写了但 plan 还没做 |
| `docs/SCHEMA.md` 不存在 | 还没声明数据 schema（如有 DB 用法应建议） |
| `.claude/PROJECT_VAULT.md` 不存在 | 还没建 secret vault（如代码里有 env 用法应建议） |
| `docs/mistakes/` 有近 7 天文件 | 最近修过 bug |

### Phase 3 — 输出（≤30 行）

固定格式，**不要花哨**：

```markdown
## 📊 MCC 项目进度

**已完成**
- ✓ /init（CLAUDE.md 存在，{N} 行）
- ✓ /onboard（onboarding/2025-04-XX-onboard-report.md）
- ✓ 1 个 PRD：login-flow
- ✓ 修过 2 个 bug（最近：bug-2025-04-25-rate-limit.md）

**未完成 / 卡住**
- ○ login-flow PRD 还没对应 plan
- ○ 没有 docs/SCHEMA.md（代码里检测到 prisma 用法，建议建）

**推荐下一步**（≤3 条，按优先级）
1. 把 login-flow PRD 转成 plan
   - Claude Code: `/plan` （把 PRD 路径粘进去）
   - Codex:       `mcc-plan` 后粘 PRD 路径
2. 建 docs/SCHEMA.md（描述 user / session 表）
   - 直接告诉 AI："给我建 SCHEMA.md，user/session 两张表"
3. （可选）跑 /review 看现有代码质量
   - Claude Code: `/review`
   - Codex:       `mcc-review`
```

输出后**停**。不要追问"你想做哪个"。用户看完会自己说下一步要什么。

## 禁止扩展

- ❌ 不要列 14 个 mcc-* 命令字典 —— 用户能看到 AGENTS.md / CLAUDE.md
- ❌ 不要自动开 plan / prd 新工作流 —— 只建议
- ❌ 不要用 `请回 1/2/3/4` 这种交互劫持
- ❌ 不要超过 30 行输出 —— 信息密度优先

## 与其他命令的关系

- **上游**：用户随时可调，无前置
- **下游**：用户看完进度自己决定下一步（可能跑 `/plan`、`/prd`、`/fix-bug` 等）
- **不替代**：Claude Code 自身 `/help` —— 那个是 CC 内置帮助（键盘快捷键等）。本命令叫 `/mcc-help` 故意不冲突。

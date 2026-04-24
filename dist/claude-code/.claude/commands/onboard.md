---
description: "接手已有项目（brownfield）：4 阶段并行扫架构 / 数据 / 安全 / 约定，产出 onboarding 报告 + ≤100 行 CLAUDE.md。让 Claude 几分钟内理解陌生代码库。"
argument-hint: "[--quick | --skip-codex | <子目录>]（留空=完整 4 阶段）"
---

# Onboard · 接手已有项目

**Input**: `$ARGUMENTS` —— 可选参数：
- `--quick` — 只跑 Phase 1 + Phase 4 简化版（~1 min，适合先看一眼）
- `<子目录>` — 限制 onboard 范围（如 `apps/web` 在 monorepo 下）
- 留空 — 完整 4 阶段（~5 min，默认）

## 核心价值

让 Claude 在 5 分钟内**结构化理解**一个已有项目：架构 / 入口 / 关键模块 / 团队约定 / 危险信号 / 接手第一步建议。

**不是为新项目设计的**——新项目用 `/init`。

## 用什么 skill

完整方法论在 `project-onboarding` skill。本命令是**薄入口**：调用该 skill 的 4 阶段流程，期间体现 **派发可视化**（v1.9 强制）。

## 执行流程

### Phase 0 — 前置检查

```bash
# 1. 这是真有内容的项目吗？空目录该用 /init
if [ ! -d src ] && [ ! -d app ] && [ ! -d lib ] && [ ! -d packages ]; then
  echo "空目录用 /init 而不是 /onboard"
  exit 0
fi

# 2. 已有 CLAUDE.md 且最近 7 天内更新？（find -mtime 必须搭配 -name 模式）
if [ -f CLAUDE.md ]; then
  recent=$(find . -maxdepth 1 -name CLAUDE.md -mtime -7 -print -quit 2>/dev/null)
  if [ -n "$recent" ]; then
    echo "已有近期 CLAUDE.md（7 天内更新）。重新 onboard 吗？(y/N)"
  fi
fi

# 已有 .claude/PRPs/onboarding/ 报告？
ls -t .claude/PRPs/onboarding/*-onboard-report.md 2>/dev/null | head -1
```

### Phase 1-4 — 委派 `project-onboarding` skill

激活该 skill 跑完整 4 阶段：

1. **Reconnaissance** — 5 路并行 Glob 扫包管理 / 入口 / 配置 / 测试 / 文档（~30s）
2. **Architecture Mapping** — 3 agent 并行（code-explorer + 栈相关 domain agent）（~2 min）
3. **Convention Detection** — 4 路并行 Grep 扫命名 / 错误处理 / 测试 / git（~1 min）
4. **Output** — 写 onboarding 报告（详细）+ CLAUDE.md（≤100 行）（~1 min）

**派发可视化**（每阶段都要输出 ⚡派发 + ✓合流），具体格式见 `project-onboarding` skill。

### Phase 5 — 总结 + 下一步

完成后给用户：

```markdown
✓ Onboard 完成（共 X.X min）

📂 产物
- `.claude/PRPs/onboarding/{date}-onboard-report.md`（详细报告）
- `CLAUDE.md`（{N} 行，每次 Claude session 自动加载）

🎯 关键发现
- 主栈：...
- 入口：...
- 危险信号：N 个（{N} 个 CRITICAL / {N} 个 HIGH）

🚀 推荐下一步
{动态推荐，按危险信号 + 项目状态}：
- 有 CRITICAL → /fix-bug "..."
- 项目大且要反复操作 → /index-repo（生成 token-efficient 索引）
- 准备启动新 feature → /plan（onboard 报告会作为 mandatory reading 前置）
- 想看流程全景 → 激活 help skill
```

---

## 模式选项

### `--quick` 模式

跳过 Phase 2 + Phase 3，只跑：
- Phase 1（5 路并行 Glob 侦察 ~30s）
- Phase 4 简化版（不写 onboarding 报告，只写极简 CLAUDE.md ~30 行）

适合"先看一眼这是啥项目"。**不**适合要正经接手的场景——会漏架构和约定。

### 子目录模式

```
/onboard apps/web
```

把 4 阶段的扫描根目录限制到 `apps/web`。适合 monorepo（每个 package 单独 onboard）。

会产出多份 CLAUDE.md（每个子目录一份，外加根目录一份"导航"）。

### `--skip-codex` 模式

不更新 `AGENTS.md`（Codex 的等价物）。**默认会同步更新**：onboard 完后 `AGENTS.md` 也会反映同样信息。

---

## 与其他命令 / skill 的关系

- **上游**：`/init` 在已有项目场景会建议跑 `/onboard`
- **下游**：
  - `/index-repo` —— 大项目反复操作时跑这个生成索引（token 节省）
  - `/plan` —— 启动新 feature 时把 onboard 报告作为 mandatory reading 前置
  - `/fix-bug` —— 修危险信号清单里的 CRITICAL
- **核心 skill**：`project-onboarding`（4 阶段方法论，本命令的实现体）
- **协同 agent**（Phase 2 并行派的）：`code-explorer` + `backend-architect` / `ai-engineer` / `frontend-developer`（按栈选） + `database-optimizer`（如涉数据）

## 禁止

- ❌ 不告知用户就跑（必须在派发前输出 ⚡）
- ❌ CLAUDE.md 写 >100 行（信息密度低 = 没人看）
- ❌ 把别人项目里的反模式当 lint warning 骂（先理解再批评）
- ❌ 跳过 Phase 4 的 CLAUDE.md（这是 onboard 的核心交付物）

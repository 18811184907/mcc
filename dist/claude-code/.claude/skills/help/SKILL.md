---
name: help
description: "MCC 用户导航：扫 .claude/PRPs/* 和 docs/mistakes/* 推断当前进度，给结构化'下一步'建议。用户问'我该做什么 / 下一步 / 帮我理一下流程 / MCC 怎么用 / 从哪开始 / 我现在在哪'时激活。仅服务用户导航；Claude 自己查'该派什么 agent / 激活什么 skill'请激活 orchestration-playbook skill。"
---

# Help · MCC 用户导航

帮用户搞清楚**当前在流程哪一步**、**下一步做什么**。不是罗列全部工具，而是基于 workspace 当前状态给具体建议。

## 何时激活

- 用户问"我该做什么 / 下一步干啥 / 从哪开始"
- 用户说"帮我理一下流程 / MCC 怎么用"
- 用户 `/help` 或 `/help`（mcc 侧）
- 用户问"XX 阶段在哪"、"PRD 在哪"、"plan 该放哪"

## 期望结果

用完这个 skill 后用户应该：

1. **知道自己在哪** — 当前阶段（1-discover / 2-plan / ... / 7-ship）
2. **知道下一步** — 分"可选" vs "必选"两栏，给明确下一步
3. **知道怎么启动** — 具体命令 / skill / agent 名
4. **拿到快速启动邀请** — 如果下一步单一明确，直接问"要现在跑 X 吗"
5. **感觉清爽** — 只展示相关的，不要整个目录全倒出来

## 数据源

- **workflow-map.json**（本 skill 同目录）：阶段定义 + 随时可用的工具 + 文件扫描规则
- **`.claude/PRPs/`**：prds / plans / plans/completed / reports / reviews / features — 这些路径的有无和内容，推断当前阶段
- **`docs/mistakes/*.md`**：最近 3 条教训，若跟当前任务领域相关，主动推荐用户先看
- **`CLAUDE.md`** / **`AGENTS.md`**：项目背景（用户领域、技术栈）

## 工作流程

### Step 1. 加载 workflow map

读 `workflow-map.json`（同目录）。结构：
- `phases[]` —— 7 个阶段（1-discover / 2-plan / 3-confidence / 4-implement / 5-verify / 6-review / 7-ship），每个带 `entry_artifacts` / `exit_artifacts` / `skills` / `commands` / `agents` / `next_hint`
- `anytime.*` —— 跨阶段可用（debug / research / refactor / architecture_debate / learning）
- `fs_scan_rules.current_phase_inference[]` —— 按规则推断当前阶段

### Step 2. 扫文件系统

按 `fs_scan_rules.current_phase_inference` 逐条匹配，第一条命中的就是当前阶段：

```
Rule 1: .claude/PRPs/prds/ 空 → 1-discover
Rule 2: prds/ 有文件 & plans/ 空 → 2-plan
Rule 3: plans/ 有文件 & plans/completed/ 空 → 4-implement
Rule 4: plans/completed/ 有文件 & reports/ 空 → 5-verify
Rule 5: reports/ 有文件 & reviews/ 空 → 6-review
Rule 6: reviews/ 有文件 → 7-ship
```

特例：都空 → `1-discover`（全新项目）。

### Step 3. 读最近 mistakes

读 `docs/mistakes/bug-*.md` 按时间倒序取前 3 条。看标题和 frontmatter 的 `tags:` / `domain:`。如果跟用户问的领域（LLM / auth / cache 等）相关，在输出里加一段"最近踩过类似坑：..."。

### Step 4. 匹配用户查询

- 用户问"下一步" → 走 phases 推断
- 用户说"卡住了 / debug 半天没进展" → 走 `anytime.stuck_debug`
- 用户说"不知道用什么库 / API 查不到" → 走 `anytime.research`
- 用户说"代码烂了 / 想重构" → 走 `anytime.refactor`
- 用户说"两个方案选不出来" → 走 `anytime.architecture_debate`
- 用户说"最近老犯同样错" → 走 `anytime.learning`

### Step 5. 输出

固定结构（中文）：

```markdown
## 📍 当前阶段
{phase name}（推断依据：{看到的/缺失的 artifact}）

## 🎯 建议下一步

### 必选（required）
- **{命令/skill 名}** — {为什么必选 + 怎么启动}

### 可选（optional）
- **{命令/skill 名}** — {什么场景下用}
- **{命令/skill 名}** — {什么场景下用}

## 🧰 涉及工具
- commands: {命令列表}
- skills: {skill 列表}
- agents: {agent 列表}

## 🚀 快速启动
要不要现在直接跑 `{具体命令}`？
```

如果用户是"anytime"类查询（不是按阶段推进），省略"当前阶段"段，直接给 `anytime.<category>.recommend` 的工具。

如果最近 mistakes 有相关项，在输出顶部加：

```markdown
## ⚠️ 最近踩过类似坑
- [{date}] {title} — {mistakes 文件路径}
```

## 全程约束

- **中文输出**
- **推荐在新 context window 跑每个重磅命令**（/prd、/plan、/implement 等）
- **匹配用户语气**：用户随意就随意；用户要精准就结构化
- **不要凭空说项目细节**：没有的信息直接说"没找到 prds/，看起来是全新项目"，不编造

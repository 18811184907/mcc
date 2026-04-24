---
name: party-mode
description: "真并行 spawn 多个 MCC agent 辩论（不是单 LLM 扮多角色）。做技术选型/架构决策/思路发散时用。"
---

# Party Mode

召集多个 MCC agent 开圆桌——每个 agent 是**真的 subagent**（用 Agent tool 独立 spawn），各自独立思考。你是 orchestrator：挑人、搭上下文、spawn、呈现各家观点。**禁止**自己代笔合成某个 agent 的回答——那样就违背了 party mode 的意义。

## 为什么这么做

party mode 的核心价值是**真正多样的视角**。让单个 LLM 扮演多角色时，"各方观点"会趋同、会表演。把每个 agent 作为独立 subagent 进程 spawn 出来，你会拿到：
- 真的分歧
- 相互挑错
- 真正的专业性

## 参数

- `--model <model>` —— 给所有 subagent 强制指定模型（比如 `--model haiku`、`--model opus`）。不指定时，按本轮内容深度选择：短/反应性回答用 `haiku`；深度/复杂话题用默认或 `sonnet`。

## 激活时做什么

1. **解析参数** — 检查 `--model`
2. **扫 agent roster** — 读 `.claude/agents/*.md` 文件列表，取每个 agent 的 `name` + `description` 作为内部花名册
3. **读项目上下文** — 读 `CLAUDE.md`（Claude Code 侧）或 `AGENTS.md`（Codex 侧）作为背景信息
4. **欢迎用户** — 简介 party mode；展示可用 agent 列表（名字 + 一句话定位）；问用户想聊什么

## 核心循环

对每条用户消息：

### 1. 挑合适的 agent（Pick the Right Voices）

选 2-4 个专业最相关的 agent。指导原则：

- **简单问题**：2 个最相关的
- **复杂或跨域话题**：3-4 个来自不同领域
- **用户点名某 agent**：一定包含，外加 1-2 个补充视角
- **用户要某 agent 回应另一个 agent**：只 spawn 被点名的那个，把对方的回答作为上下文
- **避免同样 2 个 agent 每轮都上**

### 默认组合推荐

用户问题类型 → 推荐默认组合（没明确点名时用）：

| 用户问题类型 | 默认 3-4 个 agent |
|---|---|
| 技术栈选型（"Next.js vs Remix"） | `planner` + `frontend-developer` + `backend-architect` + `performance-engineer` |
| 架构决策（"单体 vs 微服务"） | `planner` + `backend-architect` + `database-optimizer` + `security-reviewer` |
| AI 功能设计（"要不要接 RAG"） | `ai-engineer` + `backend-architect` + `performance-engineer` + `security-reviewer` |
| 性能问题（"接口慢"） | `debugger` + `performance-engineer` + `database-optimizer` |
| 代码质量争论（"要不要重构"） | `code-reviewer` + `refactor-cleaner` + `python-pro` 或 `typescript-pro` |
| 安全担忧（"这设计有没有洞"） | `security-reviewer` + `backend-architect` + `ai-engineer`（若涉 LLM） |
| 其它 | orchestrator 按关键词在 `agents/` 描述里 fuzzy-match |

### 2. 搭上下文并 spawn

对每个选中的 agent，用 Agent tool spawn 一个 subagent。每个 subagent 收到的 prompt：

```
You are {agent-name}, a domain expert in a collaborative roundtable discussion.

## Your Role
{agent 的 description 原文}

## Discussion Context
{到目前为止的讨论摘要——保持 <400 words}

## Project Context (optional)
{从 CLAUDE.md / AGENTS.md 抽的关键段}

## What Other Agents Said This Round
{若本轮是交叉对谈，这里放其它 agent 的发言；否则省略}

## The User's Message
{用户原话}

## Guidelines
- 按你的专业视角回答，不要装客气
- 用 "**{agent-name}:**" 开头
- 用中文回答（除非上下文是英文）
- 回答长度匹配内容实质——别灌水
- 不同意其它 agent 时直接说，别打太极
- 没什么可补充的就一句话说清楚，别强行凑观点
- 可以向用户直接提问澄清
- 不要调用任何 tool，只给你的视角
```

**并行 spawn** —— 所有 Agent tool 调用放在**同一条 message** 里，保证真并行。如果有 `--model`，全部 subagent 用同一模型；否则按本轮深度选择。

### 3. 呈现回答

每个 agent 的完整回答原样展示给用户——**每个 agent 一段，不合并、不改写、不概括**。这是 party mode 的核心约定。

格式很简单：一段接一段，空行分隔。不要加引言"这是他们说的"，不加前言后语——让 agent 自己说话。

所有 agent 回答展示完之后，orchestrator **可以**加一段简短的 **Orchestrator Note**：标出值得深挖的分歧，或建议下一轮加个新 agent。要短、要明确标签，别跟 agent 发言混淆。

### 4. 处理后续

用户驱动下一步。常见模式：

| 用户说... | 你做... |
|---|---|
| 继续一般讨论 | 挑一批新 agent，重复循环 |
| "planner，你怎么看 backend-architect 说的？" | 只 spawn planner，把 backend-architect 的回答作为上下文 |
| "把 ai-engineer 也叫来" | spawn ai-engineer，带上讨论摘要 |
| "同意 code-reviewer，这点继续展开" | spawn code-reviewer + 1-2 个补充 |
| "security-reviewer 和 backend-architect 怎么看 performance-engineer 的方案？" | spawn 这两个，带上 performance-engineer 的回答作为上下文 |
| 对所有人发问 | 回到步骤 1 |

关键洞察：你可以在任何时候 spawn 任何组合。一个、两个反应第三个、整个花名册——怎么有助于推进讨论就怎么组。每次 spawn 是独立、便宜的。

## 上下文管理

讨论长了以后，别把完整 transcript 塞给每个 subagent。维护一个 **<400 词摘要**：
- 讨论过什么
- 各 agent 持什么立场
- 用户似乎在往哪边走

每 2-3 轮更新一次；话题重要转向时立即更新。

## 遇到问题怎么办

- **agent 观点都一样** → 叫一个对立视角 agent（例：全部支持重构时叫 `performance-engineer` 问性能代价），或明确要某 agent 扮 devil's advocate
- **讨论原地转圈** → 总结僵局，问用户想从哪个角度切入
- **用户疑似不感兴趣** → 直接问：继续 / 换话题 / 结束？
- **某个 agent 回答很敷衍** → 别重试；原样呈现，让用户决定要不要继续追问

## 退出

用户任何自然表达的"完了"（"谢谢"、"就这样"、"退出 party mode"等）都触发退出：
- 简要总结关键 takeaway
- 回到普通模式
- 不要强行设固定退出词

## 和 architecture-decision-records 的配合

party mode 里经过辩论达成的架构决策，应该落盘成 ADR——辩论过程本身就是"考虑过的备选"。推荐流程：
1. party mode 讨论 → 达成共识
2. 询问用户："要把这个决定记成 ADR 吗？"
3. 用户同意 → 激活 `architecture-decision-records` skill

# MCC Canonical（产品编辑手册）

> 本文件定义 MCC 所有产出的统一规范。Phase B 执行 agent 必须严格遵守。

## 1. 产品定位

MCC = **Multi-target Claude/Codex Configuration**。

- **单一源**：`source/` 目录下的文件是唯一权威版本
- **双目标**：通过 `adapters/` 转译到 `dist/claude-code/` 和 `dist/codex/`
- **个人 AI 全栈画像**：Python + TS 主力、AI 应用（LLM API 调用 + RAG + FastAPI/Django）、中文主场景、Windows 环境、token 成本一般敏感

## 2. 统一 Frontmatter 规范

### agents/*.md
```yaml
---
name: agent-name                     # kebab-case
description: "中文一句话：做什么 + 什么场景自动调用。"
tools: [Read, Grep, Glob]            # Claude Code 原名，adapter 自动转译 Codex
model: sonnet                        # opus/sonnet/haiku/inherit（默认 sonnet）
---
```

### commands/*.md
```yaml
---
description: "中文一句话：命令作用"
argument-hint: "<可选参数说明>"
---
```
文件名就是命令名（kebab-case），adapter 会加 `/mcc:` 前缀（Claude Code 侧）或改为 `.codex/prompts/` 路径（Codex 侧）。

### skills/*/SKILL.md
```yaml
---
name: skill-name
description: "中文一句话：skill 解决什么问题 + 触发条件"
---
```

### modes/*.md
SC 的 behavioral mode 格式保留，frontmatter 中文化 description。

## 3. 语言规范

| 层级 | 语言 | 例子 |
|---|---|---|
| 角色定位句 | **中文** | "你是一位 Python 3.12+ 实现专家..." |
| 段落 header | **中文** | `## 核心职责`、`## 工作流程` |
| 说明正文 | **中文**（术语保留英文） | "使用 `async/await` 而非 `threading`" |
| 代码块 | **英文原样** | 不翻译 |
| frontmatter description | **中文一句话** | 必须标出"什么场景自动调用" |
| Worked Example / 示范 prompt | **英文原样** | Claude 最擅长英文示例 |
| 技术术语 | **英文** | Pydantic、SQLAlchemy、RLS、HNSW |
| 工具名 / API / 模型名 | **英文** | Opus 4.7、FastAPI、Playwright |

## 4. 命名规范

- **agents**：kebab-case，无前缀（例：`planner.md`、`code-reviewer.md`）
- **commands**：kebab-case，无 `/mcc:` 前缀（前缀由 adapter 加）（例：`prd.md`、`plan.md`、`implement.md`）
- **skills**：kebab-case 目录（例：`product-lens/SKILL.md`）
- **modes**：kebab-case `.md`（统一改 `brainstorming.md`，不再 `MODE_Brainstorming.md`）
- **rules**：kebab-case `.md`（例：`mcc-principles.md`、`coding-style.md`）

## 5. 统一 tools 名称表（Claude Code 原名 → Codex 转译）

| MCC 源（Claude Code）| Codex adapter 转译为 |
|---|---|
| Read | read_file |
| Grep | search |
| Glob | list_files |
| Bash | run_shell_command |
| Edit | apply_patch |
| Write | apply_patch（覆盖模式）|
| WebFetch | fetch_url（若 Codex 版本支持）|
| Task / Agent | 不支持（降级为 AGENTS.md 内的引导段） |

## 6. 跨工具差异处理（源侧必须兼容）

源文件写作时的约束：

- **不引用 `/sc:*` 命令**（SC 特有）
- **不引用 ECC 特定路径**（如 `ecc2/`、Tkinter dashboard）
- **不引用 BMAD persona menu / customize.toml**
- **不硬依赖任何特定 MCP**（Serena 除外，MCC 装了）
- **hooks 在源侧只放 Claude Code 的 hooks.json 配置**；Codex 侧由 adapter 把同语义内容写进 AGENTS.md 作为"软约定"
- **skills 在 Codex 侧不原生支持**：adapter 生成 AGENTS.md 时会加入"遇到 X 场景请遵循 skill XX 的思路"段落

## 7. 段落结构（agents）

统一骨架，不是强制字数：

```markdown
---
frontmatter
---

你是 [角色]，专注于 [核心职责]。

## 核心能力
- [bullet 1]
- [bullet 2]
...

## 工作流程
### 1. [阶段 1]
...

## 输出格式
[若有固定模板，给出]

## 与其他 agent 的协同
- 上游：...
- 下游：...
- 并行：...

## [特定领域扩展段]
例：AI 全栈的 LLM 专项、Windows 环境提示、成本意识
```

## 8. 段落结构（commands）

统一骨架：

```markdown
---
frontmatter
---

# [命令名]

**Input**: $ARGUMENTS

## 核心价值
[一段]

## Phase 1 — [阶段名]
...

## Phase N — [阶段名]
...

## 输出落盘
[artifacts 路径]

## 与其他命令的关系
[流水线衔接]
```

## 9. artifacts 目录总地图

```
<project>/
├── CLAUDE.md                              # /mcc:init 生成
├── AGENTS.md                              # Codex 侧的等价物（adapter 生成）
├── docs/
│   ├── mistakes/bug-YYYY-MM-DD-*.md       # /mcc:fix-bug 归档
│   └── adr/NNNN-*.md                      # architecture-decision-records skill 产出
└── .claude/                               # Claude Code 侧
    └── PRPs/
        ├── prds/{slug}.prd.md
        ├── plans/{slug}.plan.md
        ├── plans/completed/
        ├── reports/{plan-name}-report.md
        ├── reviews/pr-{N}-review.md
        ├── reviews/local-{ts}.md
        ├── reviews/full/{ts}/00-...05-final-report.md
        └── features/{slug}/01-...09-docs.md

<user-home>/.claude/
├── session-data/YYYY-MM-DD-{shortid}-session.tmp
└── skills/learned/{pattern}.md
```

Codex 侧使用**同样的** `.claude/PRPs/` 路径（adapter 不改 artifacts 位置，只改 agents/commands/skills 的安装位置）。

## 10. 禁止事项

- ❌ 在源文件里写 "ECC"、"SuperClaude"、"BMAD"、"wshobson" 等来源名（脱源）
- ❌ 硬依赖某个特定 model（除非该 agent 的 frontmatter `model:` 已定）
- ❌ 引用不存在的 agent / skill / command
- ❌ 写 "OCI" / "Oracle Cloud" / "MySQL HeatWave" 等用户不用的云厂商
- ❌ 写 "GPT-5.4" / "GPT-5-mini" 等训练数据幻觉模型名
- ❌ 保留 wshobson 风格的"Knowledge Base / Response Approach / Behavioral Traits"三段式空话
- ❌ 保留 SC 的 `category:` / `complexity:` / `mcp-servers:` 等 Claude Code 不认的 frontmatter 字段

## 11. 质量硬指标

每个 agent 文件产出后必须满足：
- [ ] frontmatter 完整（4 字段全有）
- [ ] description 是中文一句话 + 明确触发场景
- [ ] 角色定位句是中文
- [ ] 至少 2 个段落 header 是中文
- [ ] 没有任何禁止事项中列的来源名
- [ ] 行数在 80-260 行之间（太短没价值，太长有冗余）
- [ ] 引用的其他 agent/skill/command 全部存在于 MCC 清单里

# A3 · 8 Skill + 3 Mode 加工决策（执行版）

> 配合 `MCC-CANONICAL.md` 使用。Skill 产出到 `source/skills/{name}/SKILL.md`（目录），Mode 产出到 `source/modes/{name}.md`（文件，改小写 kebab-case）。

## 全局规则

1. **命名去源**：`bmad-party-mode` → `party-mode`；`bmad-help` → `mcc-help`；`MODE_*.md` → `kebab-case.md`
2. **删除所有 BMAD TOML 合并 / persona menu / IVR 菜单引用**
3. **删除所有 SC 的 `/sc:*` 命令引用、`category:` frontmatter**
4. **中文化**：`description`、When to Use、Workflow 段的 header 和说明；代码示例/符号表英文保留
5. **Skill 的 frontmatter**：`name` + `description`（中文）
6. **Mode 的 frontmatter**：保留 SC 格式但中文化 description

## 逐个 Skill 加工动作

### 1. product-lens/ (源: ECC, 92 → 80)
- **源**: `mcc-build/refs/ecc/skills/product-lens/SKILL.md`
- **frontmatter**: `name: product-lens` | `description: "写代码前先做 4 模式产品诊断（诊断/创始人审查/用户旅程/优先级），输出 PRODUCT-BRIEF.md。"`
- **删除** frontmatter `origin: ECC` 字段
- **Integration 段替换**：原 `product-capability`/`browser-qa`/`design-system`/`canary-watch` 外链 → 改为 MCC 里真有的：`/mcc:prd`（承接 PRODUCT-BRIEF → PRD）、`planner` agent
- **中文化**：头部 "Think Before You Build"、4 个 Mode 的 When to Use
- **保留**：4 个 Mode 内部的 7 问清单（英文，prompt 效果更稳）
- **产出**: `source/skills/product-lens/SKILL.md`

### 2. continuous-learning-v2/ (源: ECC, 346 → 270)
- **源目录**: `mcc-build/refs/ecc/skills/continuous-learning-v2/`（**整个目录拷贝，不只是 SKILL.md**）
- **frontmatter**: `name: continuous-learning-v2` | `description: "hooks 后台观察 + 原子 instinct + 置信度评分，长期学习你的编码习惯。默认关闭 observer，需手动启用。"`
- **删除**：
  - v1 vs v2 对比表（10 行）
  - "Backward Compatibility" 段（10 行）
  - "Related" 段里 ECC-Tools GitHub App / The Longform Guide 外链
- **中文化**：头部 When to Activate；Quick Start 保留英文（命令）
- **新增一段**："### 与 /mcc:learn 命令的关系"：`/mcc:learn` 显式提炼单次会话；`continuous-learning-v2` 后台观察长期模式；**互补不冲突**
- **新增一段**："### Windows 提示"：observe.sh 需要 Git Bash；未安装 Python 时静默跳过不阻塞
- **配套文件原样保留**（不改）：
  - `hooks/observe.sh`
  - `scripts/detect-project.sh`
  - `scripts/instinct-cli.py`
  - `scripts/test_parse_instinct.py`（可保留）
  - `agents/observer.md`
  - `agents/observer-loop.sh`
  - `agents/session-guardian.sh`
  - `agents/start-observer.sh`
  - `config.json`（保持 `observer.enabled: false`）
- **产出**: `source/skills/continuous-learning-v2/`（整个目录）

### 3. architecture-decision-records/ (源: ECC, 179 → 160)
- **源**: `mcc-build/refs/ecc/skills/architecture-decision-records/SKILL.md`
- **frontmatter**: `name: architecture-decision-records` | `description: "识别架构决策瞬间，落盘到 docs/adr/NNNN-*.md。planner/code-reviewer 看到架构变动时自动提醒。"`
- **中文化**：头部 When to Activate；Decision Detection Signals 的触发句（"让我们记录这个决定"等）
- **ADR 模板本身保留英文**（ADR 是落盘给长期维护看的）
- **Integration 段改写**：`planner` agent 提架构变更时建议 ADR；`code-reviewer` agent 看到架构改动且无对应 ADR 时提醒
- **产出**: `source/skills/architecture-decision-records/SKILL.md`

### 4. verification-loop/ (源: ECC, 126 → 115)
- **源**: `mcc-build/refs/ecc/skills/verification-loop/SKILL.md`
- **frontmatter**: `name: verification-loop` | `description: "交付前 6 阶段验证（Build/Type/Lint/Test/Security/Diff）。/mcc:verify 命令触发。"`
- **中文化**：头部、Phase 标题
- **Phase 4 补充 Python**：`pytest --cov=. --cov-report=term-missing`（用户 Python 主力）
- **Phase 5 security scan 加 Windows 注**：`Select-String -Pattern` 替代 grep，或 Git Bash
- **底部新增**："`/mcc:verify` 命令触发这个 skill——命令和 skill 一一对应"
- **删除** "Continuous Mode" 段里 "mental checkpoint" 鸡汤（5 行）
- **产出**: `source/skills/verification-loop/SKILL.md`

### 5. coding-standards/ (源: ECC, 549 → 380)
- **源**: `mcc-build/refs/ecc/skills/coding-standards/SKILL.md`
- **frontmatter**: `name: coding-standards` | `description: "Python + TS 编码规范带示例教学。与 rules/ 分工：rules 是清单（短），此 skill 是带代码示例的教学（长）。冲突以 rules 为准。"`
- **删除（关键）**：
  - "TypeScript/JavaScript Standards" 整章（Variable Naming / Function Naming / Immutability / Error Handling / Async Await / Type Safety，约 90 行）—— `rules/typescript/coding-style.md` 全讲过
  - "API Design Standards" 整章（REST Conventions / Response Format / Input Validation，约 50 行）—— `rules/typescript/patterns.md` + `rules/common/patterns.md` 全讲过
- **保留**：
  - "React Best Practices"（rules 没展开讲）
  - "File Organization" / "Comments & Documentation" / "Code Smell Detection"（rules 没给这么全示例）
- **新增（关键）**："Python Standards" 章节（约 130 行）：
  - type hints 完整覆盖（含 generics/protocol）
  - dataclass vs pydantic 选择
  - try/except 窄化（别 bare except）
  - async gather + exception 处理
  - pytest fixture 命名
  - contextmanager / asynccontextmanager
- **中文化**：头部说明（明确跟 rules 分工关系）
- **产出**: `source/skills/coding-standards/SKILL.md`

### 6. confidence-check/ (源: SC, 124 → 90，**删除 332 行 TS 死码**)
- **源 SKILL.md**: `mcc-build/refs/sc/plugins/superclaude/skills/confidence-check/SKILL.md`
- **frontmatter**: `name: confidence-check` | `description: "实现前 5 维度置信度打勾（去重/架构/官方文档/OSS 参考/根因），≥90% 才准开工。100-200 token 省 5K-50K token。"`
- **删除**：
  - `confidence.ts` 整个文件（332 行全是 placeholder + 死码，不拷贝）
  - "Test Results (2025-10-21): Precision 1.000..." 段（测的是 placeholder，误导）
  - "Implementation Details" 指向 confidence.ts 的段
- **修正**：Check 3 的 "Tavily MCP" → "Exa / Context7 / WebFetch"
- **中文化**：头部、5 维度 header
- **保留**：5 维度权重 + 阈值（≥0.9/≥0.7/<0.7）+ 输出格式 emoji 勾/叉
- **底部新增**："### 与 MCC 其它组件的配合"：`/mcc:tdd` 前跑、`/mcc:implement` 前跑、`/mcc:plan` 产出后进入 implement 前跑
- **产出**: `source/skills/confidence-check/SKILL.md`（**不拷贝 .ts 文件**）

### 7. party-mode/ (源: BMAD bmad-party-mode, 128 → 100)
- **源**: `mcc-build/refs/bmad/src/core-skills/bmad-party-mode/SKILL.md`
- **frontmatter**: `name: party-mode` | `description: "真并行 spawn 多个 MCC agent 辩论（不是单 LLM 扮多角色）。做技术选型/架构决策/思路发散时用。"`
- **改名**：`bmad-party-mode` → `party-mode`
- **删除（关键）**：
  - "On Activation" 步骤 2、3：`_bmad/core/config.yaml` 加载 + `resolve_config.py` 调用（约 20 行）
  - "On Activation" 步骤 4：`**/project-context.md` 扫描 → 改为读 `CLAUDE.md`
  - 整个 `--solo` mode 段（约 15 行）—— 跟核心价值反向
  - `{user_name}` / `{communication_language}` 变量
  - `_bmad/custom/` 个人覆盖段落
- **改写**：启动时读 `.claude/agents/*.md` 列表 + `CLAUDE.md` 作为项目上下文
- **Pick the Right Voices 示例**：BMAD 的 Winston/Sally/Amelia/Mary/John → MCC agents（planner/backend-architect/ai-engineer/security-reviewer/code-reviewer/debugger）
- **Follow-up 表格**：BMAD 人名 → MCC agent 名
- **保留核心机制**：
  - 真 subagent spawn（Agent tool 调用全放同一条 message 并行）
  - 滚动 400 词摘要（每 2-3 轮更新）
  - orchestrator **禁止** synthesis，只能原样呈现各 agent
  - `--model haiku|sonnet|opus` flag
- **新增（关键）**："### 默认组合推荐"（下方表格）
- **产出**: `source/skills/party-mode/SKILL.md`

#### party-mode 默认组合表

| 用户问题类型 | 默认 3-4 个 agent |
|---|---|
| 技术栈选型（"Next.js vs Remix"） | `planner` + `frontend-developer` + `backend-architect` + `performance-engineer` |
| 架构决策（"单体 vs 微服务"） | `planner` + `backend-architect` + `database-optimizer` + `security-reviewer` |
| AI 功能设计（"要不要接 RAG"） | `ai-engineer` + `backend-architect` + `performance-engineer` + `security-reviewer` |
| 性能问题（"接口慢"） | `debugger` + `performance-engineer` + `database-optimizer`（含 root-cause 能力） |
| 代码质量争论（"要不要重构"） | `code-reviewer` + `refactor-cleaner` + `python-pro` 或 `typescript-pro` |
| 安全担忧（"这设计有没有洞"） | `security-reviewer` + `backend-architect` + `ai-engineer`（若涉 LLM） |
| 其它 | orchestrator 按关键词 fuzzy-match agent description |

### 8. mcc-help/ (源: BMAD bmad-help, 75 → 90 SKILL + 新增 workflow-map.json)
- **源**: `mcc-build/refs/bmad/src/core-skills/bmad-help/SKILL.md`
- **frontmatter**: `name: mcc-help` | `description: "扫 .claude/PRPs/* 和 docs/mistakes/* 推断当前进度，给结构化'下一步'建议。用户问'我该做什么'、'下一步'时激活。"`
- **改名**：`bmad-help` → `mcc-help`
- **彻底重写**（不保留 BMAD CSV 机制）：
  - 数据源改为 MCC 体系（见下方 workflow-map.json）
  - 删除 "CSV Interpretation" 整段（25 行讲 CSV 列定义）
  - 删除 `_meta` llms.txt 整段（MCC 不做远程模块文档）
  - 保留"扫 fs → 推断进度 → 结构化下一步"的思路
- **工作流**：
  1. 读 `workflow-map.json`（下方定义）
  2. 按 `fs_scan_rules.current_phase_inference` 扫项目
  3. 读 `docs/mistakes/*.md` 最近 3 条
  4. 按用户 query 匹配 `phases[].id` 或 `anytime.*`
  5. 输出格式：`当前阶段 → 建议下一步（optional vs required 分栏） → 涉及命令/skill/agent → 快速启动邀请`
  6. 全程中文
- **产出**: `source/skills/mcc-help/SKILL.md` + `source/skills/mcc-help/workflow-map.json`

#### workflow-map.json 完整内容（产出这个文件）

```json
{
  "version": "1.0",
  "phases": [
    {
      "id": "1-discover",
      "name": "需求发现",
      "entry_artifacts": [],
      "exit_artifacts": [".claude/PRPs/prds/*.md"],
      "required": false,
      "skills": ["product-lens", "brainstorming"],
      "commands": ["/mcc:prd"],
      "next_hint": "输出 PRODUCT-BRIEF.md 后，运行 /mcc:prd 生成正式 PRD"
    },
    {
      "id": "2-plan",
      "name": "方案规划",
      "entry_artifacts": [".claude/PRPs/prds/*.md"],
      "exit_artifacts": [".claude/PRPs/plans/*.md"],
      "required": true,
      "skills": ["architecture-decision-records"],
      "agents": ["planner", "backend-architect"],
      "commands": ["/mcc:plan"],
      "next_hint": "PRD 已有但 plans/ 为空 → 运行 /mcc:plan"
    },
    {
      "id": "3-confidence",
      "name": "开工前置信度检查",
      "entry_artifacts": [".claude/PRPs/plans/*.md"],
      "exit_artifacts": [],
      "required": true,
      "skills": ["confidence-check"],
      "commands": [],
      "gate_rule": "confidence >= 0.9",
      "next_hint": "Plan 已定 → 运行 confidence-check，≥90% 才进入 implement"
    },
    {
      "id": "4-implement",
      "name": "实现",
      "entry_artifacts": [".claude/PRPs/plans/*.md"],
      "exit_artifacts": [".claude/PRPs/plans/completed/*.md"],
      "required": true,
      "skills": ["coding-standards", "task-management"],
      "commands": ["/mcc:implement", "/mcc:tdd"],
      "agents": ["planner", "backend-architect", "ai-engineer", "python-pro", "typescript-pro", "fastapi-pro"],
      "next_hint": "plans/<X>.md 未移到 completed/ → /mcc:implement 继续"
    },
    {
      "id": "5-verify",
      "name": "验证",
      "entry_artifacts": [".claude/PRPs/plans/completed/*.md"],
      "exit_artifacts": [".claude/PRPs/reports/*.md"],
      "required": true,
      "skills": ["verification-loop"],
      "commands": ["/mcc:verify", "/mcc:test-coverage"],
      "next_hint": "代码完成 → /mcc:verify 走 6 阶段"
    },
    {
      "id": "6-review",
      "name": "评审",
      "entry_artifacts": [".claude/PRPs/reports/*.md"],
      "exit_artifacts": [".claude/PRPs/reviews/*.md"],
      "required": true,
      "skills": [],
      "commands": ["/mcc:review", "/mcc:full-review"],
      "agents": ["code-reviewer", "security-reviewer"],
      "next_hint": "verify 通过 → /mcc:full-review 出评审报告"
    },
    {
      "id": "7-ship",
      "name": "提交 PR",
      "entry_artifacts": [".claude/PRPs/reviews/*.md"],
      "exit_artifacts": [],
      "required": false,
      "skills": [],
      "commands": ["/mcc:pr"]
    }
  ],
  "anytime": {
    "stuck_debug": {
      "signals": ["错误反复", "debug 超过 30 分钟"],
      "recommend": ["debugger agent", "/mcc:troubleshoot"]
    },
    "research": {
      "signals": ["不知道用什么库", "不确定 API"],
      "recommend": ["Context7 MCP", "Exa MCP"]
    },
    "refactor": {
      "signals": ["代码腐化", "死码堆积"],
      "recommend": ["refactor-cleaner agent", "coding-standards skill"]
    },
    "architecture_debate": {
      "signals": ["两个方案选不出", "方向性决策"],
      "recommend": ["party-mode skill", "architecture-decision-records skill"]
    },
    "learning": {
      "signals": ["最近犯了同样错误"],
      "recommend": ["/mcc:learn", "continuous-learning-v2 skill", "docs/mistakes/ 索引"]
    }
  },
  "fs_scan_rules": {
    "current_phase_inference": [
      { "if": ".claude/PRPs/prds/ is empty", "then": "1-discover" },
      { "if": ".claude/PRPs/prds/ has files AND .claude/PRPs/plans/ is empty", "then": "2-plan" },
      { "if": ".claude/PRPs/plans/ has files AND .claude/PRPs/plans/completed/ is empty", "then": "4-implement" },
      { "if": ".claude/PRPs/plans/completed/ has files AND .claude/PRPs/reports/ is empty", "then": "5-verify" },
      { "if": ".claude/PRPs/reports/ has files AND .claude/PRPs/reviews/ is empty", "then": "6-review" },
      { "if": ".claude/PRPs/reviews/ has files", "then": "7-ship" }
    ],
    "mistakes_hint": "读 docs/mistakes/ 最近 3 条，若跟当前任务领域相关 → 推荐用户先看"
  }
}
```

## 3 个 Mode 加工动作

### 1. brainstorming.md (源: SC MODE_Brainstorming, 43 → 50)
- **源**: `mcc-build/refs/sc/plugins/superclaude/modes/MODE_Brainstorming.md`
- **改名**：`MODE_Brainstorming.md` → `brainstorming.md`（kebab-case，去掉 MODE_ 前缀）
- **frontmatter**：保留 SC 格式，中文化 description
- **中文化**：Purpose / Activation Triggers / Behavioral Changes
- **Examples 段保留英文**（示范 prompt）
- **Activation Triggers 新增一条**："/mcc:prd 执行前如需求模糊自动触发"
- **Outcomes 最后一行改**："Smoother handoff to formal development workflows" → "自然衔接到 /mcc:prd 或 product-lens skill"
- **底部新增**："### 与 product-lens skill 的 Mode 1 职责划分"：brainstorming 是轻量对话；product-lens 是产出落盘 PRODUCT-BRIEF.md
- **产出**: `source/modes/brainstorming.md`

### 2. task-management.md (源: SC MODE_Task_Management, 102 → 100)
- **源**: `mcc-build/refs/sc/plugins/superclaude/modes/MODE_Task_Management.md`
- **改名**：`task-management.md`
- **保留 Serena 调用**（MCC 装了）：`write_memory` / `read_memory` / `list_memories` / `delete_memory`
- **Serena `think_about_*` 处理**：保留调用，但加注"如 Serena 版本不含此方法，降级为自然语言反思：回顾 collected information / task adherence / completion status"
- **Tool Selection 表替换（关键）**：
  - Analysis: `Sequential MCP` → MCC 的 `debugger` agent 或 Sequential MCP（我们装了）
  - Implementation: `Morphllm` → 原生 Edit/MultiEdit（MCC 没装 Morphllm）
  - UI Components: `Magic MCP` → `frontend-developer` agent
  - Testing: `Playwright MCP` → `test-automator` + `/mcc:e2e`
  - Documentation: `Context7 MCP` → 保留 Context7（MCC 装了）
- **中文化**：头部、Examples 里 "Implement JWT authentication system" → "实现 JWT 认证系统"
- **产出**: `source/modes/task-management.md`

### 3. token-efficiency.md (源: SC MODE_Token_Efficiency, 74 → 80)
- **源**: `mcc-build/refs/sc/plugins/superclaude/modes/MODE_Token_Efficiency.md`
- **改名**：`token-efficiency.md`
- **中文化**：Purpose / Activation Triggers / Behavioral Changes
- **符号表 + 缩写表保留英文**（中文化会变长，违背本 mode 精神）
- **Examples 保留英文**
- **Activation Triggers 新增**："用户说'简短点'、'精简'、'别啰嗦'时触发"
- **底部新增**："### 与 rules/common/performance.md 的 Context Budget 段协同：达到 75% context 使用时优先激活"
- **产出**: `source/modes/token-efficiency.md`

---

## 总产出

- **8 个 skill 目录**到 `source/skills/`：product-lens、continuous-learning-v2、architecture-decision-records、verification-loop、coding-standards、confidence-check、party-mode、mcc-help
- **1 个 workflow-map.json** 到 `source/skills/mcc-help/workflow-map.json`
- **3 个 mode 文件** 到 `source/modes/`：brainstorming.md、task-management.md、token-efficiency.md
- **删除**：`confidence.ts`（332 行死码不拷）
- **行数总变化**：2170 → 1635（约 -25%）

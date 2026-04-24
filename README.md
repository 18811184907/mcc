# MCC · Multi-target Claude/Codex Configuration

> 为 Claude Code 和 Codex 双目标定制的产品级 AI 协作配置。
> 中文主场景，Python + TypeScript + AI 应用全栈定向优化。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Target](https://img.shields.io/badge/target-Claude_Code_%2B_Codex-purple)

---

## 什么是 MCC

**单一源 × 双目标分发**。一套精心打磨的 AI 编码配置，自动适配 Claude Code 和 Codex 两种工具。

从 5 个开源项目（`everything-claude-code` / `SuperClaude` / `wshobson/agents` / `BMAD-METHOD` / `obra/superpowers`）里挑精华、去冗余、融合改写，不是简单拼接。

### 装完你会拥有

| 维度 | 内容 |
|---|---|
| **19 个角色 agent** | planner / code-reviewer / debugger / security-reviewer / ai-engineer / python-pro / typescript-pro / fastapi-pro / frontend-developer / backend-architect / database-optimizer / performance-engineer / …… |
| **13 个 slash 命令** | `/prd` `/plan` `/implement` `/pr`（PRP 四件套流水线）、`/review`（并行派 code-reviewer + security-reviewer）、`/tdd`、`/fix-bug`（4 域分诊）、`/session-save` `/session-resume`、`/init`（空项目轻量初始化）、`/explain`（中文讲解）、**`/onboard`**（v2.0 · 接手已有项目 4 阶段并行扫）、**`/index-repo`**（v2.0 · 大项目 token 节省索引） |
| **18 个 skill** | **核心编排（4）**：`orchestration-playbook`（Claude 自查：派什么 agent / 激活什么 skill）、`help`（用户导航）、`dispatching-parallel-agents`（并行决策+组合）、`party-mode`（辩论）<br><br>**工作流（6）**：`confidence-check`、`tdd-workflow`、`verification-loop`、`code-review-workflow`、`subagent-driven-development`、`continuous-learning-v2`<br><br>**专项（8）**：`architecture-decision-records`、`coding-standards`（Python + TS）、`product-lens`、`writing-skills`、`e2e-testing`、`using-git-worktrees`、`finishing-a-development-branch`、**`project-onboarding`**（v2.0 · 4 阶段接手已有项目方法论） |
| **3 个 behavioral mode** | `brainstorming` · `task-management` · `token-efficiency`（按关键词/上下文自动激活） |
| **8 条 hook** | `pre:config-protection` 独家（阻止 Claude 修改 config 绕过 lint/security）、`stop:format-typecheck`（批量 lint+tsc，不每次 edit 跑）、`pre:bash:safety`（破坏性命令拦截）等 |
| **5 个 MCP 服务器** | Serena（语义记忆）、Context7（实时查文档）、GitHub、Sequential（深推理）、Playwright |
| **精选 rules** | Python 5 个（`coding-style` / `testing` / `patterns` / `security` / `hooks`）+ `mcc-principles`（6 主题：Core Directive / Evidence-Based / SOLID / Systems Thinking / Decision Framework / Risk Management） |

---

## 快速上手

### 前置

- **Node.js 18+**（installer 运行时）
- **Claude Code** 或 **Codex**（或两者都装）
- Git Bash（Windows 环境可选，用于 observe.sh hook 等 bash 脚本）

### 3 种安装方式

#### A. Claude Code 原生 `/plugin`（推荐 Claude Code 用户）

```
/plugin marketplace add https://github.com/18811184907/mcc
/plugin install mcc@mcc-marketplace
```

然后跑 `.\install.ps1` 合并 hooks + MCP 配置（`/plugin` 只装 agent/command/skill，settings 合并还得跑 installer）。

#### B. 一键脚本（推荐多工具用户）

```powershell
# Windows
git clone https://github.com/18811184907/mcc
cd mcc
.\install.ps1

# macOS / Linux / Git Bash
git clone https://github.com/18811184907/mcc
cd mcc
./install.sh
```

installer 会自动：
1. 检测你装了哪些工具（Claude Code / Codex）
2. 备份现有 `settings.json` / `config.toml`
3. **不覆盖**你的 agent/command/skill（同名跳过）
4. 深度合并 settings.json（permissions 并集、hooks 追加去重、mcpServers 合并）
5. 打印回滚命令（带时间戳）

#### C. 手动 clone + 指定参数

```bash
./install.sh --scope project --target claude-code --force
```

### 验证装好了

在 Claude Code 里打一条消息：
```
help（或：我在哪 / 下一步该做什么）
```

会激活 `help` skill，扫 `.claude/PRPs/` 推断当前项目阶段并给建议。

---

## 安装选项

```
./install.sh --scope <global|project|hybrid>    # 安装位置
             --target <auto|claude-code|codex|both>  # 目标工具
             --force                             # 覆盖同名（默认跳过）
             --dry-run                           # 只打印计划，不动文件
             --verbose                           # 详细日志
```

| Scope | Claude Code | Codex | 适合谁 |
|---|---|---|---|
| **global**（默认） | `~/.claude/` | `~/.codex/` | 个人使用 |
| **project** | `./.claude/` | `./.codex/` + `./AGENTS.md` | 团队协作 / 多项目不同配置 |
| **hybrid** | 通用全局 + 规则项目级 | 同上 | 进阶用户 |

---

## 核心设计

### 单一源 → 双目标

```
source/                              ← 一份真相
├── agents/*.md
├── commands/*.md
├── skills/*/SKILL.md
├── modes/*.md
├── hooks/ + scripts/
├── mcp/mcp.json
└── rules/

       ↓ adapters/build.js（0.2 秒）

dist/
├── claude-code/.claude/             ← 给 Claude Code 用
│   ├── agents/          (19)
│   ├── commands/    (20，触发 /*)
│   ├── skills/          (8)
│   ├── modes/           (3)
│   ├── .mcc-hooks/      (25 scripts + hooks.json)
│   ├── rules/common/    (mcc-principles.md)
│   ├── rules/python/    (5 个)
│   ├── mcp-configs/
│   └── settings.fragment.json
│
└── codex/                          ← 给 Codex 用
    ├── .codex/agents/     (tools 字段已转译: Read → read_file 等)
    ├── .codex/prompts/    (20 个 mcc-*.md)
    ├── .codex/rules/
    ├── AGENTS.md          (编译了所有 agents + commands + skill 指引)
    ├── HOOKS-SOFT-GUIDANCE.md  (hooks 转为自律约定)
    ├── config.fragment.toml    (MCP 的 TOML 版)
    └── INSTALL-MANIFEST.json
```

编辑 `source/` 后跑 `node adapters/build.js` 刷新 `dist/`。

### 为什么分 source/adapters/dist

- **source/**：你的真实配置，版本控制在这里
- **adapters/**：纯 Node 脚本（无 npm 依赖），把 source 转译成各工具需要的格式
- **dist/**：构建产物，commit 进 git 方便 `/plugin install` 直接用，不需要每个用户本地构建

### 约束：产品化不是拼接

MCC 的 agent/command 都是 **融合改写**过的，不是多个源并存：
- 融合型（`code-reviewer` / `debugger` / `backend-architect` / `database-optimizer` / `performance-engineer`）取多源精华
- 全部中文化角色定位和段落 header，代码/API/术语保留英文
- 删除所有来源暴露词（OCI、GPT-5.4 幻觉、三段式空话）
- Python 主力：`python-pro`、`fastapi-pro` 降 opus→sonnet 省 token
- AI 应用定向：`ai-engineer` + `prompt-engineer` + `vector-database-engineer` 是独家

详见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

---

## 典型工作流

### 场景 1：做一个新功能

```
/prd    → 7 phase Socratic 对话生成 PRD
/plan   → 从 PRD 生成自包含实施计划（含 mandatory reading）
/implement → 按 plan 执行，每步 5 级验证（type/lint/test/build/integration）
/review → 并行跑 code-reviewer + security-reviewer
/pr     → 创建 PR 关联所有 PRP artifacts
```

artifacts 都落 `.claude/PRPs/{prds,plans,reports,reviews}/`。

### 场景 2：卡住了

```
/fix-bug "登录接口偶尔 500" → root cause 调查 → 方案 A/B → 实施
```

禁止 retry，强制根因分析，产出归档到 `docs/mistakes/`。

### 场景 3：方向有分歧

```
help → 查看当前阶段 + 推荐 skill
调 party-mode → 真并行 spawn 4 个 MCC agent 辩论
             (planner + backend-architect + security-reviewer + ai-engineer)
```

### 场景 4：跨天继续上次的活

```
昨天结束前：/session-save
今天开始：/session-resume → 秒懂昨天做到哪了、什么没跑通、下一步 exact action
```

### 场景 5（v2.0 · 旗舰）：接手已有项目（brownfield onboarding）

刚 clone 一个 50k 行的老项目，从哪开始？

```
/onboard
```

**4 阶段并行扫，~5 分钟出报告**：

```
⚡ Phase 1 并行侦察（5 路 Glob / ~30s）
   ├─ 包管理 / 入口点 / 配置 / 测试结构 / 文档

⚡ Phase 2 并行架构映射（fan-out / ~2 min）
   ├─ code-explorer        架构层 / 入口 / 调用链
   ├─ backend-architect    服务边界 / 数据流
   └─ database-optimizer   schema / migration

⚡ Phase 3 并行规范检测（4 路 / ~1 min）
   ├─ 命名 / 错误处理 / 测试 / git 约定

✓ Phase 4 产出（~1 min）
   ├─ .claude/PRPs/onboarding/{date}-onboard-report.md  详细报告
   └─ CLAUDE.md（≤100 行）  每次 session 自动加载
```

报告含**栈 / 入口 / 关键模块 / 数据流 / 团队约定 / 危险信号 / 接手第一步建议**，让 Claude 几分钟内理解陌生代码库。

**大项目（>1k 文件）随后跑** `/index-repo`：生成 `PROJECT_INDEX.md` + `.json`，**每 session 省 50K+ tokens**（2K 投入，27.5x ROI · 借鉴 SuperClaude）。

完整 13 个命令速查见 [USAGE.md](./USAGE.md)。

### v1.5 哲学：少命令，多自动

冷门命令（/full-stack / /full-review / /verify / /test-coverage / /e2e / /learn / /skill-create / /build-fix / /troubleshoot）已删除，能力转移到 skill 自动激活：

- 说"验证一下 / 交付前检查" → `verification-loop` skill 自动 6 阶段
- 说"写 E2E / Playwright" → `e2e-testing` skill 给出 Page Object 模板
- 说"审一下 / 帮我看看代码" → `code-review-workflow` skill 派 subagent 审
- 说"记下这个 / 沉淀经验" → `continuous-learning-v2` skill 写 learned skill
- 说"建个 skill / 提炼约定" → `writing-skills` skill 交互式创作

mcc-principles 加了 P-1"主动性"规则：**用户应少敲命令，Claude 应多主动决策**。详见 `rules/common/mcc-principles.md` 顶部。

---

## 安装后会发生什么

### 你会多出（以 global 为例）

```
~/.claude/
├── agents/{19 个 MCC agent}.md        ← 同名用户已有的不覆盖
├── commands/{20 个命令}.md         ← 触发 /*
├── skills/{8 个 skill 目录}/           ← 同名跳过
├── modes/{3 个 mode}.md
├── rules/python/ + rules/common/mcc-principles.md
├── .mcc-hooks/                          ← MCC 私有 namespace
│   ├── scripts/{25 个 .js/.sh}/
│   └── hooks.json
├── mcp-configs/mcp.json
└── settings.json                        ← 深度合并（已备份原文件）

~/.codex/
├── agents/{19 个}.md                    ← tools 已转译为 Codex 命名
├── prompts/{20 个 mcc-*}.md             ← Codex 用 prompt 机制
├── rules/python/
└── config.toml                          ← 追加了 6 个 MCP sections

~/AGENTS.md（或项目根）
└── 编译版的角色清单 + 命令索引 + skill 指引 + hooks 软约定
```

### 不会动

- 你原有的 `agents/xxx.md` / `commands/xxx.md` / `skills/xxx/` / `modes/xxx.md`（同名跳过）
- `rules/common/` 下你的现有文件（只加 `mcc-principles.md`）
- `rules/typescript/` / `rules/web/` / `rules/zh/`（完全不碰）
- 任何 `.claude/PRPs/` 下的用户产物
- 任何 `session-data/` / `learned/` / `docs/mistakes/` / `docs/adr/`

---

## 卸载

```powershell
# Windows
.\uninstall.ps1                              # 从最近备份恢复
.\uninstall.ps1 -Timestamp 2026-04-24-065853 # 指定时间戳恢复
```

```bash
# Unix
./uninstall.sh --timestamp 2026-04-24-065853
```

卸载会：
- 恢复 `settings.json` / `config.toml` 到安装前
- 删除 `.mcc-hooks/` / `commands/` / `rules/common/mcc-principles.md`（MCC 独有）
- **保留** 你的 PRPs artifacts、session-data、learned skills、mistakes、ADR
- **保留** agents/skills/modes（因为你可能改过同名文件）—— 手动清理

---

## Roadmap

### v1.0 · 2026-04-24 首发

- [x] 19 agents（含 5 融合型）+ 20 commands + 8 skills + 3 modes
- [x] 8 hooks + 5 MCPs + Python rules + mcc-principles
- [x] 双目标 adapter（Claude Code + Codex）
- [x] installer / uninstaller 支持 global/project/hybrid scope
- [x] 幂等 build + 备份 + 回滚

### v1.1 · 2026-04-24 Superpowers 增量 ✅

- [x] 纳入 [obra/superpowers](https://github.com/obra/superpowers) 8 个独家 skill
- [x] **subagent-driven-development**：每任务 fresh subagent + 两阶段 review（spec → quality）
- [x] **tdd-workflow**（改名自 test-driven-development）：填补 `/tdd` 的 skill 实现体，含 testing-anti-patterns
- [x] **writing-skills**：创作 skill 的 meta-skill + Anthropic 官方最佳实践参考
- [x] **using-git-worktrees**：worktree 隔离并行开发
- [x] **finishing-a-development-branch**：分支收尾（merge/PR/cleanup）
- [x] **requesting-code-review** + **receiving-code-review**：代码审查两端流程
- [x] **dispatching-parallel-agents**：独立任务并行分发（和 party-mode 辩论互补）
- [x] skills 从 8 扩展到 **16**

### v1.2 · 2026-04-24 便捷性提升 ✅

- [x] Claude Code slash 命令**去 `/mcc:` 前缀**：`/mcc:prd` → **`/prd`**、`/mcc:plan` → **`/plan`**（20 个全部去）
- [x] adapter 改：`commands/mcc/` 子目录 → `commands/` 顶层
- [x] installer 加 **`--exclusive`** flag：独占模式备份并清空 `agents/commands/skills/modes/` 再装 MCC（`rules/` 和 `settings.json` 保留）
- [x] 文档全量更新（README / USAGE / ARCHITECTURE 所有 `/mcc:xxx` → `/xxx`）
- [x] Codex 侧保持 `mcc-` prefix 不变（Codex 生态里防 prompt 撞）

### v1.3 · 2026-04-24 Hook 减捣乱 ✅

- [x] **3 个捣乱王默认关**（脚本保留，可手动启用）：
  - `pre:config-protection`：误判改 tsconfig 为放宽规则
  - `stop:format-typecheck`：大项目 tsc 30-60 秒拖慢响应
  - `pre:bash:safety`：内部 6 个子检查 Windows 下白噪音，易误伤 `rm -rf node_modules`
- [x] **默认保留的 3 个轻量 hook**：
  - `session:start`（恢复上次 session）
  - `stop:session-end`（持久化，async）
  - `stop:check-console-log`（扫 console.log，async）
- [x] `settings.fragment.json` 重构：每个可选 hook 带 `_reason_off` 和 `_enable_put_into` 字段，便于手动启用
- [x] README 加 "Hook 开关" 章节说明如何手动开关

### v1.4 · 2026-04-24 Hook 减捣乱 + 团队备份探索

- [x] v1.3 Hook 减捣乱合并发布（3 个捣乱王默认关）
- [⊗] v1.4.0 的"团队代码备份"（`/backup` 三件套 + team-install 脚本 + 双份 guide）**已在 v1.4.1 下线**。原因：GitHub 安全模型限制，管理员至少要亲自建一次 PAT，无法做到真正全托管。保留设计文档供未来 Organization 版本参考。

### v1.5 · 2026-04-24 少命令，多自动 ✅

哲学：**用户应少敲命令，Claude 应多主动决策**。

- [x] 命令数 20 → **11**（-45%）
- [x] 删除 9 个冷门命令：`/full-stack` `/full-review` `/build-fix` `/verify` `/test-coverage` `/e2e` `/learn` `/skill-create` `/troubleshoot`
- [x] `/fix-bug` 吞下 `/troubleshoot` 的 4 域路由（bug / build / performance / deployment 自动判定）
- [x] 合并 skill：`requesting-code-review` + `receiving-code-review` → `code-review-workflow`（一个 skill 覆盖两端）
- [x] 新增 skill：`e2e-testing`（Playwright + Page Object + CI 集成，原 `/e2e` 的能力更全）
- [x] 强化多个 skill 的自动激活关键词（`verification-loop` / `tdd-workflow` / `continuous-learning-v2` / `writing-skills`）
- [x] `mcc-principles` 新增 **P-1 主动性原则**：含场景-agent/skill 意图映射表，让 Claude 遇到场景自动派发
- [x] `help`（原 mcc-help）workflow-map.json 同步更新

### v1.6 · 2026-04-24 产品级深度优化 ✅

用"不怕改动"的态度做严肃审计。5 轮并行审查员（agent / command / skill / hooks / infra 层）拉问题清单，批量修复。

- [x] **7 处 CRITICAL 残留引用清零**（review.md / tdd.md / session-save.md / session-resume.md 里引用已删命令的地方）
- [x] **`/fix-bug` 强制力一致**：Phase 2b 编译诊断统一"必找根因、禁止打补丁"
- [x] **`refactor-cleaner` 引用不存在的 tdd-guide** → 改为 `test-automator` / `tdd-workflow` skill
- [x] **6 个 skill description 分工表述**：dispatching-parallel-agents（并行独立）/ subagent-driven-development（串行有依赖）/ verification-loop（技术闸门）/ code-review-workflow（架构合规）/ continuous-learning-v2（被动观察）/ writing-skills（主动创作）
- [x] **3 个 agent description 升级**：test-automator / performance-engineer / silent-failure-hunter 明确触发条件和分工
- [x] **e2e-testing skill 加 3 个扩展**：视觉回归 / a11y（axe-core）/ Core Web Vitals 性能基准
- [x] **hooks 防卡死 3 道防线**：check-console-log 加 100 文件上限 + 500KB 跳过 + 3 秒 watchdog + 第二道 hook timeout 保险
- [x] **hooks fail-closed**：run-with-flags-shell.sh 改为"检查器异常时默认不跑 hook"（而非默认跑）
- [x] **`session-start` 加 5 秒 timeout**（之前无 timeout 可能永久挂起）
- [x] **build.js 健康检查**：source/ 缺目录 / agent<15 / command<8 / skill<12 即 fail fast；dist 产出 <20 文件即拒绝
- [x] **`tests/smoke.js` 自检套件**：133 项自动检查（frontmatter / manifest 不谎报 / workflow-map 引用 / hooks 脚本存在 / build 可跑 / version 同步）—— 每次 release 前必跑

### v1.7 · 2026-04-24 多智能体自动并行协同 ✅

让**并行派发 subagent 默认主动发生**，不等用户提。定义**协作模式 + 效率控制**。

- [x] `mcc-principles` 新增 **P-0.5 并行优先**：8 条决策表（场景 → agent 组合）+ 4 种协作模式（fan-out / 接力 / 辩论 / 混合）+ 4 个合流整合动作 + 模型分级（Haiku/Sonnet）+ 上限 4 并发
- [x] `dispatching-parallel-agents` skill 加 **Auto-dispatch 决策树**（Q1-Q4 每次接手任务前跑一遍）+ **10 种场景的 agent 组合速查表** + 用户意图→组合快速映射
- [x] **`/fix-bug` Phase 2 改并行盲诊**：debugger + 附加信号触发的 performance-engineer / database-optimizer / frontend-developer
- [x] **`/plan` Phase 2 加 domain agent 并行探索**：按栈类型（后端/前端/AI/全栈）2-3 个 agent 并行
- [x] **`/pr` Phase 2.5 并行预检**：同时派 verification-loop + code-reviewer + security-reviewer（~2min，串行需 ~6min）
- [x] **补 `rules/typescript/`**（5 文件：coding-style / testing / security / patterns / hooks）—— 项目定位是 Python + TS + AI 全栈，之前只有 Python 是**长期 gap**
- [x] **adapter 双侧（Claude Code + Codex）都加 TS rules 转译**
- [x] **TOOLS_MAP 扩展**：+ WebSearch + NotebookEdit；未映射 tool 从静默穿透改为 **unmappedWarnings 显式 warn**
- [x] **installer 跨盘符备份原子化**：`copy → 校验（文件数+字节对齐）→ rename → rm`，任一步失败源目录完好
- [x] `exclusive` 模式的备份也走同一套原子 fallback

### v1.8 · 2026-04-24 4 层架构重构 + token 精简 ✅

**4 层职责清晰化**：rules 只放元规则骨架；commands 是工作流入口；agents 是**领域专家（Actor）**；skills 是**方法论参考（Method）**。避免能力集中在单个大 skill 导致拥堵。

- [x] **mcc-principles 精简**：391 行 → 94 行（5600 → ~1500 tokens 常驻，-73%），只留 3 条元规则骨架 + 指针。通用软工原则（证据 / SOLID / 系统 / 决策 / 风险）挪对应 skill 按需激活
- [x] **拆分 mcc-help 职责混乱**：恢复纯用户导航（v1.9 改名为 `help`）；新建 `orchestration-playbook` skill（107 行）专职 Claude 自查 —— A 节 agent 派发 / B 节 skill 激活 / C 节并行决策 / D 节任务规模
- [x] **dispatching-parallel-agents 补全方法论**：协作 4 模式 + 合流 4 动作 + 成本控制，方法论集中一处
- [x] **AGENTS.md（Codex 侧）TOC + 压缩**：每个 description ≤140 字符；首次显式暴露并行能力；13295 → 12424 bytes
- [x] **hooks 孤儿误判澄清** + 补 `post_bash_dispatcher_OFF_BY_DEFAULT` 可选入口
- [x] **installer 拆分撤回**：没坏不动（风险 > 收益）；改为新建 `tests/installer-dry-run.js` 12 checks 作为未来安全网
- [x] **skills 16 → 17**（新增 orchestration-playbook）
- [x] **smoke 144 → 145 checks**

### v1.9 · 2026-04-24 彻查遗留 + 并行可视化 + mcc-help→help ✅

**5 审查员并行深审**拉出完整问题清单后批量修复。彻查遗留。

- [x] **7 处 CRITICAL 修复**：
  - `mcc-help` skill → `help`（所有引用清零：principles / orchestration-playbook / README / USAGE / tests）
  - orchestration-playbook 死链 `engineering-judgment` → 分发到 4 个真实 skill/agent
  - plan.md 重复段落清除
  - README/USAGE "16 个 skill" → 17
  - ai-engineer 的 `call_with_fallback` 重写（primary 3 retry + 单次 fallback，不再双层重试）
  - planner.md `tdd-guide` → `test-automator` agent + `tdd-workflow` skill
  - **`dispatching-parallel-agents` + `orchestration-playbook` 新增"派发可视化模板"**——强制 Claude 每次并行派 agent 输出 ⚡ 派发文本 + ✓ 合流文本，让用户看到真并行
- [x] **3 处 HIGH 修复**：
  - implement.md 的 `5 级验证` → `6 阶段验证`（对齐 verification-loop skill）
  - build.js MIN_SKILLS 12→15（接近实际 17 但留缓冲）
  - **Python rules 补齐到 TS 对等**（coding-style 42→170 / testing 38→180 / security 29→180 / patterns 40→210 / hooks 20→120）
- [x] Python rules 新增覆盖：ruff + pyright 严格度 / Pydantic 校验 / async 最佳实践 / argon2 / OWASP Top 10 Python 对照 / FastAPI DI / Repository Protocol / pre-commit hooks
- [x] **skills 16 → 17**（v1.8 新增的 orchestration-playbook + v1.9 改名的 help）

### v1.10 · 2026-04-25 5 审查员交叉审计清零 + Codex 伪并行 + ECC onboard 调研 ✅

**5 审查员交叉审计**（A 引用闭环 / B 数字术语 / C 行为流贯彻 / D 隐藏 bug / E Python↔TS 对等度）拉出完整问题清单，**一次性清零**。

- [x] **3 个 CRITICAL bug 修复**：
  - `session-start-bootstrap.js` timeout 30s→5s（对齐 hook 设的 5s）
  - `session-end.js` stdin 1MB 静默截断 → 显式 WARNING + fallback
  - `build.js assertSourceIsHealthy` 加 rules/{common,python,typescript} 检查
- [x] **3 个 HIGH 修复**：
  - `uninstaller` 不清 rules/typescript（v1.7 起加入但漏了）
  - `install.ps1/sh` 头部硬编版本号 → 运行时从 manifest 读取（永不漂移）
  - `manifest.principles_sections` 8→3（v1.9 重构后没同步）
- [x] **Cross-target 派发可视化**：4 个核心 command（/fix-bug / /plan / /pr / /review）补 ⚡派发 + ✓合流的**具体格式模板**，不只说"要可视化"
- [x] **Codex 伪并行方案**：AGENTS.md 新增"Codex 没有 Task tool 时如何伪并行"章节 —— 1 次回复扮多角色 + 结构化分段
- [x] **TS rules 补 AI/LLM 章节**（PromptTemplate / retry+fallback 分层 / streaming / token 埋点），与 Python 对等
- [x] **TS security OWASP 5→11 项**（A02 加密 / A04 设计 / A06 组件 / A09 日志 / A10 SSRF）+ SSRF 具体防御代码
- [x] **ECC 竞品调研完成**（背景 agent）—— v2.0 设计参考：
  - ECC `codebase-onboarding` 4 阶段
  - SuperClaude `/sc:index-repo` token 节省（2K 投入省 55K/session）
  - wshobson 多维并行扫描（架构 + 安全 + 死代码）
  - 用显式命令（避免隐式触发）
  - CLAUDE.md ≤100 行

### v2.0 · 2026-04-25 接手已有项目（brownfield onboarding）✅

**装上 MCC 后，让 Claude 几分钟内理解陌生大代码库**。借鉴 affaan-m/ECC 的 4 阶段 codebase-onboarding + SuperClaude `/sc:index-repo` 的 token 节省。

- [x] **新命令 `/onboard`**：4 阶段并行扫已有项目（Reconnaissance → Architecture Mapping → Convention Detection → Output），~5 min 完成；产出详细 onboarding 报告 + ≤100 行 CLAUDE.md
- [x] **新命令 `/index-repo`**：生成 PROJECT_INDEX.md（人读 ~3KB）+ .json（机读 ~10KB），2K 投入 → 每 session 省 50K+ tokens（27.5x ROI）
- [x] **新 skill `project-onboarding`**：4 阶段方法论的实现体（含派发可视化 + 失败模式降级）
- [x] **强化 `/init`**：检测到已有项目（src/ 满 + >50 文件）时自动建议改用 `/onboard`；空项目仍走轻量初始化
- [x] **orchestration-playbook 主动性映射**：'我刚 clone' / '不熟这个项目' / '怎么接手' → 自动激活 `/onboard`
- [x] **help skill workflow-map 加 phase 0-onboard**：检测 src/ >50 文件 + 无 CLAUDE.md → 推断在 onboard 阶段
- [x] **PRPs/onboarding/ 占位目录**（落盘 `*-onboard-report.md`）
- [x] commands: 11 → **13**；skills: 17 → **18**

### v2.1+ · 待定（按社区反馈）

- [ ] `install.ps1 -Minimal` 最小 MCP 模式（只装 Context7 + Sequential，省 7-11k tokens）
- [ ] `doc-updater` agent（ECC 有但当前没装）
- [ ] 更多语言 rules（Go / Rust 等按需）
- [ ] Cursor / Gemini CLI 支持（按需）
- [ ] MCC 自检测试套件
- [ ] e2e-testing skill（当前 `/e2e` 是内联版）
- [ ] Organization 版 team backup（每同事自己的 GitHub + collaborator，不共用 PAT）

---

## 开源协议

MIT. 详见 [LICENSE](./LICENSE)。

融合了以下项目的精华（均为 MIT 协议）：
- [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code)
- [SuperClaude-Org/SuperClaude_Framework](https://github.com/SuperClaude-Org/SuperClaude_Framework)
- [wshobson/agents](https://github.com/wshobson/agents)
- [bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD)
- [obra/superpowers](https://github.com/obra/superpowers) （v1.1 新增：8 个独家 skill）

---

## 贡献

- 提 issue / PR 前先看 [ARCHITECTURE.md](./ARCHITECTURE.md)
- 改 agent/command/skill 时改 `source/` 不要直接改 `dist/`（会被下次 build 覆盖）
- 跑 `node adapters/build.js` 验证产出
- `./install.sh --dry-run` 验证 installer 逻辑

# A4 · Hooks / MCP / Rules 加工决策（执行版）

> 配合 `MCC-CANONICAL.md` 使用。产出到 `source/hooks/`、`source/mcp/`、`source/rules/`。

## 任务 1：Hooks 依赖最小化（精简 ECC 1.2MB 到 ~210KB）

### 要保留的 8 条 hook

| # | Hook | matcher | timeout | async | 跨平台 |
|---|---|---|---|---|---|
| 1 | pre:config-protection | Write/Edit/MultiEdit | 5s | false | OK |
| 2 | stop:format-typecheck | * | 300s | false | OK（Windows 显式处理） |
| 3 | session:start | * | 默认 | false | OK |
| 4 | stop:session-end | * | 10s | true | OK |
| 5 | stop:check-console-log | * | 默认 | true | OK |
| 6 | pre:observe:continuous-learning | * | 10s | true | ⚠️ 需 Git Bash + Python |
| 7 | post:observe:continuous-learning | * | 10s | true | 同 6 |
| 8 | pre:bash:safety（= pre:bash:dispatcher） | Bash | 默认 | false | OK（tmux 子脚本 Windows 自动降级 no-op） |

### 最小脚本清单（必拷，共 ~210KB）

从 `mcc-build/refs/ecc/scripts/` 拷贝到 `source/hooks/scripts/`（保持 ECC 的子目录结构）：

#### `scripts/hooks/`（18 个 .js 文件）
```
plugin-hook-bootstrap.js      # 通用引导
run-with-flags.js             # Node 外壳（profile gating）
run-with-flags-shell.sh       # Shell 外壳（observe 用）
check-hook-enabled.js         # gating 辅助

config-protection.js          # #1
stop-format-typecheck.js      # #2
session-start-bootstrap.js    # #3 entry
session-start.js              # #3 core
session-end.js                # #4
check-console-log.js          # #5

pre-bash-dispatcher.js        # #8 entry
bash-hook-dispatcher.js       # #8 orchestrator
block-no-verify.js            # #8 sub
auto-tmux-dev.js              # #8 sub（Windows 自动 no-op）
pre-bash-tmux-reminder.js     # #8 sub（Windows no-op）
pre-bash-git-push-reminder.js # #8 sub
pre-bash-commit-quality.js    # #8 sub
gateguard-fact-force.js       # #8 sub
```

#### `scripts/lib/`（7 个文件）
```
utils.js                      # 被 #2/#3/#4/#5 依赖
hook-flags.js                 # profile gating 核心
resolve-formatter.js          # #2 专用
package-manager.js            # #2/#3 共用
observer-sessions.js          # #3 专用
session-aliases.js            # #3 专用
project-detect.js             # #3 专用
```

**不拷**：ECC scripts/ 里其他所有文件（tracking / cost-tracker / telemetry / 广告功能等）

### 产出的 hooks.json（source/hooks/hooks.json）

```json
{
  "hooks": [
    {
      "id": "pre:config-protection",
      "event": "PreToolUse",
      "matcher": "Write|Edit|MultiEdit",
      "timeout": 5000,
      "async": false,
      "command": "node ${MCC_HOOKS}/scripts/hooks/plugin-hook-bootstrap.js run-with-flags.js pre:config-protection scripts/hooks/config-protection.js standard,strict"
    },
    {
      "id": "stop:format-typecheck",
      "event": "Stop",
      "matcher": "*",
      "timeout": 300000,
      "async": false,
      "command": "node -e \"require('${MCC_HOOKS}/scripts/hooks/stop-format-typecheck.js').run(process.stdin)\""
    },
    {
      "id": "session:start",
      "event": "SessionStart",
      "matcher": "*",
      "command": "node ${MCC_HOOKS}/scripts/hooks/session-start-bootstrap.js"
    },
    {
      "id": "stop:session-end",
      "event": "Stop",
      "matcher": "*",
      "timeout": 10000,
      "async": true,
      "command": "node -e \"require('${MCC_HOOKS}/scripts/hooks/session-end.js').run(process.stdin)\""
    },
    {
      "id": "stop:check-console-log",
      "event": "Stop",
      "matcher": "*",
      "async": true,
      "command": "node -e \"require('${MCC_HOOKS}/scripts/hooks/check-console-log.js').run(process.stdin)\""
    },
    {
      "id": "pre:observe:continuous-learning",
      "event": "PreToolUse",
      "matcher": "*",
      "timeout": 10000,
      "async": true,
      "command": "bash ${MCC_HOOKS}/scripts/hooks/run-with-flags-shell.sh pre:observe:continuous-learning ${MCC_SKILLS}/continuous-learning-v2/hooks/observe.sh pre"
    },
    {
      "id": "post:observe:continuous-learning",
      "event": "PostToolUse",
      "matcher": "*",
      "timeout": 10000,
      "async": true,
      "command": "bash ${MCC_HOOKS}/scripts/hooks/run-with-flags-shell.sh post:observe:continuous-learning ${MCC_SKILLS}/continuous-learning-v2/hooks/observe.sh post"
    },
    {
      "id": "pre:bash:safety",
      "event": "PreToolUse",
      "matcher": "Bash",
      "command": "node ${MCC_HOOKS}/scripts/hooks/pre-bash-dispatcher.js"
    }
  ],
  "variables": {
    "MCC_HOOKS": "Expands to install dir of MCC hooks (installer fills)",
    "MCC_SKILLS": "Expands to install dir of MCC skills (installer fills)"
  }
}
```

**Installer 会把 `${MCC_HOOKS}` 和 `${MCC_SKILLS}` 替换为实际路径**（根据 global/project scope 决定）。

### settings.fragment.json（合并到用户 ~/.claude/settings.json）

```json
{
  "permissions": {
    "allow": [
      "Read(*)", "Grep(*)", "Glob(*)",
      "Write(*.md)", "Edit(*.md)",
      "Bash(gh *)", "Bash(git *)", "Bash(ls *)",
      "Bash(npm *)", "Bash(pnpm *)", "Bash(yarn *)", "Bash(bun *)",
      "Bash(uv *)", "Bash(uvx *)", "Bash(pip *)", "Bash(python *)",
      "Bash(pytest *)", "Bash(ruff *)", "Bash(mypy *)", "Bash(pyright *)",
      "Bash(prettier *)", "Bash(biome *)", "Bash(eslint *)",
      "Bash(tsc *)",
      "WebFetch(*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      { "matcher": "Write|Edit|MultiEdit",
        "hooks": [{ "type": "command", "command": "node ${MCC_HOOKS}/scripts/hooks/config-protection.js", "timeout": 5 }]
      },
      { "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "node ${MCC_HOOKS}/scripts/hooks/pre-bash-dispatcher.js" }]
      }
    ],
    "PostToolUse": [],
    "SessionStart": [
      { "matcher": "*",
        "hooks": [{ "type": "command", "command": "node ${MCC_HOOKS}/scripts/hooks/session-start-bootstrap.js" }]
      }
    ],
    "Stop": [
      { "matcher": "*",
        "hooks": [
          { "type": "command", "command": "node -e \"require('${MCC_HOOKS}/scripts/hooks/stop-format-typecheck.js').run(process.stdin)\"", "timeout": 300 },
          { "type": "command", "command": "node -e \"require('${MCC_HOOKS}/scripts/hooks/session-end.js').run(process.stdin)\"", "async": true, "timeout": 10 },
          { "type": "command", "command": "node -e \"require('${MCC_HOOKS}/scripts/hooks/check-console-log.js').run(process.stdin)\"", "async": true }
        ]
      }
    ]
  }
}
```

**观察 hook（continuous-learning）默认不在 settings.fragment.json 里**（default disabled）。用户启用 `continuous-learning-v2` skill 时才加。

---

## 任务 2：MCP 配置（5 个）

### mcp.json（source/mcp/mcp.json）

```json
{
  "mcpServers": {
    "serena": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://github.com/oraios/serena",
        "serena",
        "start-mcp-server",
        "--context",
        "ide-assistant"
      ],
      "description": "语义化代码理解 + 项目记忆 + session 持久化"
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@2.1.4"],
      "description": "实时查官方库文档（防幻觉）"
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github@2025.4.8"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      },
      "description": "GitHub PR / Issue / 代码搜索"
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking@2025.12.18"],
      "description": "高 token 效率的 chain-of-thought 推理"
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@0.0.69", "--extension"],
      "description": "浏览器自动化 + E2E 测试"
    }
  }
}
```

### 依赖 / 环境变量 / 安装提示

| MCP | 依赖 | 环境变量 | 跨平台 | 必需/可选 |
|---|---|---|---|---|
| **Serena** | Python 3.11+ + `uv` | 无 | Windows 需 `winget install astral-sh.uv`；中国大陆可能拉 GitHub 慢 | **可选**（installer 询问）|
| **Context7** | Node 18+ | 无 | 全平台 OK | **必需** |
| **GitHub** | Node 18+ | `GITHUB_PERSONAL_ACCESS_TOKEN` 必填 | 全平台 OK | **必需**（未设 PAT 给 3 秒引导链接）|
| **Sequential** | Node 18+ | 无 | 全平台 OK | **推荐必需** |
| **Playwright** | Node 18+（首次下载浏览器 ~300MB） | 可选 `PLAYWRIGHT_BROWSERS_PATH`、中国 `PLAYWRIGHT_DOWNLOAD_HOST` | 全平台 OK | **可选**（询问"是否做 Web/前端？"）|

### Codex 侧的 config.fragment.toml（adapter 生成）

```toml
# MCC MCP servers (append to ~/.codex/config.toml)

[mcp_servers.serena]
command = "uvx"
args = ["--from", "git+https://github.com/oraios/serena", "serena", "start-mcp-server", "--context", "ide-assistant"]

[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp@2.1.4"]

[mcp_servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github@2025.4.8"]
[mcp_servers.github.env]
GITHUB_PERSONAL_ACCESS_TOKEN = "${GITHUB_PERSONAL_ACCESS_TOKEN}"

[mcp_servers.sequential-thinking]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-sequential-thinking@2025.12.18"]

[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp@0.0.69", "--extension"]
```

**Adapter 逻辑**：读 mcp.json → 按 target 格式转（Claude Code 用 JSON，Codex 用 TOML）。

### Installer 安装顺序

1. 检测 Node（必需）/ Python+uv（Serena 可选）/ 浏览器（Playwright 可选）
2. 默认装：Context7、GitHub、Sequential
3. 询问"装 Serena？"（需 uv） → 是/否
4. 询问"做 Web 开发？" → 是装 Playwright
5. GitHub PAT：检测环境变量，空则给 https://github.com/settings/tokens?type=beta 链接 + 3 秒等待

---

## 任务 3：Rules 补充

### 用户现状（已有）

```
.claude/rules/
├── common/   (11 个文件，完整)
├── zh/       (10 个中文版)
├── typescript/  (5 个，和 ECC 一致)
└── web/      (7 个，和 ECC 一致)
```

### 策略：**只补充，不覆盖**

### 产出 1：Python rules（5 个文件，从 ECC 直接拷）

源：`mcc-build/refs/ecc/rules/python/`
目标：`source/rules/python/`

```
source/rules/python/
├── coding-style.md     # 直接拷贝，保留 YAML frontmatter paths: ["**/*.py", "**/*.pyi"]
├── hooks.md            # 直接拷贝
├── patterns.md         # 直接拷贝
├── security.md         # 直接拷贝
└── testing.md          # 直接拷贝
```

**不改内容**（ECC python rules 本来就好）。**只在 installer 合并时**，如果用户目标目录没有 python/ 则直接拷。

### 产出 2：mcc-principles.md（新写，融合 SC PRINCIPLES 6 主题）

目标：`source/rules/common/mcc-principles.md`

**来源灵感**：`mcc-build/refs/sc/plugins/superclaude/core/PRINCIPLES.md`（英文原文）

**6 大主题**（中文化 + 融入 MCC 语境）：

1. **核心指令（Core Directive）**
   - 证据 > 假设 / Evidence > assumptions
   - 代码 > 文档 / Code > documentation
   - 效率 > 冗长 / Efficiency > verbosity
   - 中文化并举 MCC 例子

2. **证据驱动推理（Evidence-Based Reasoning）**
   - 所有声明需要证据支撑
   - 假设必须可验证或明确标为假设
   - 用 `confidence-check` skill 量化

3. **SOLID 五原则**（用户 rules/common/coding-style.md 有 KISS/DRY/YAGNI，补全 SOLID）
   - S: Single Responsibility
   - O: Open/Closed
   - L: Liskov Substitution
   - I: Interface Segregation
   - D: Dependency Inversion
   - 每条给 1 个 Python/TS 代码反例

4. **系统思维（Systems Thinking）**
   - Ripple Effects：改动 A 怎么影响 B/C
   - Long-term Perspective：今天的便利 vs 明天的技术债
   - Risk Calibration：风险评估不是拍脑袋

5. **决策框架（Decision Framework）**
   - Measure First：用数据/benchmark 而不是直觉
   - Hypothesis Formation：多个假设 → 系统验证
   - Source Validation：信息来源可信度分级
   - Bias Recognition：确认偏差、锚定偏差

6. **风险管理（Risk Management）**
   - Proactive Identification：实现前先列 risks
   - Impact Assessment：High/Medium/Low + 发生概率
   - Mitigation Planning：每个 risk 对应一个 mitigation
   - 和 `planner` agent 的 "Risks & Mitigations" 段呼应

**目标行数**：~180-250 行

---

## 总产出

### 文件清单
- **Hooks scripts**：拷 ECC scripts 精简版 → `source/hooks/scripts/`（18 .js + 7 lib/.js + 3 .sh ≈ **180KB**）
- **hooks.json**：`source/hooks/hooks.json`（自己写，8 条 hook 配置）
- **settings.fragment.json**：`source/hooks/settings.fragment.json`（installer 合并用）
- **mcp.json**：`source/mcp/mcp.json`（5 个 MCP，JSON 格式）
- **config.fragment.toml**：**不在 source/ 产出**，由 adapter 从 mcp.json 生成到 `dist/codex/config.fragment.toml`
- **Python rules**：`source/rules/python/*.md`（5 个，从 ECC 拷）
- **mcc-principles.md**：`source/rules/common/mcc-principles.md`（新写，~200 行）

### 体积估算
- hooks 精简后：~180KB（砍掉率 85%）
- MCP 配置：~2KB
- Rules 补充：~50KB

### 依赖关系
- `/mcc:verify` → `verification-loop` skill → 用户项目的 build/test/lint 工具
- hooks `pre:observe` / `post:observe` → `continuous-learning-v2/hooks/observe.sh` → Python + bash
- hooks `stop:format-typecheck` → `resolve-formatter.js` → 用户项目的 package manager（npm/pnpm/yarn/bun）

## Installer 要做的 5 个合并动作

1. 拷 `dist/claude-code/.claude/agents/` → `~/.claude/agents/`（同名跳过）
2. 拷 `dist/claude-code/.claude/commands/` → `~/.claude/commands/`（同名跳过）
3. 拷 `dist/claude-code/.claude/skills/` → `~/.claude/skills/`（同名跳过）
4. 拷 `dist/claude-code/.claude/modes/` → `~/.claude/modes/`（同名跳过）
5. 拷 `dist/claude-code/.claude/hooks/` → `~/.claude/.mcc-hooks/`（独立 namespace，避免覆盖用户原 hooks）
6. 拷 `dist/claude-code/.claude/rules/python/` → `~/.claude/rules/python/`（仅在目标不存在）
7. 拷 `dist/claude-code/.claude/rules/common/mcc-principles.md` → `~/.claude/rules/common/`（仅在目标不存在）
8. **合并** `settings.fragment.json` → `~/.claude/settings.json`（深度合并 hooks 数组去重、mcpServers 键合并、permissions.allow 并集去重）
9. **合并** MCP 配置到 `~/.claude/settings.json > mcpServers`
10. Codex 侧：同样逻辑但目标 `~/.codex/`

# MCC 架构

> 面向贡献者 / 二次开发者。用户视角见 [README.md](./README.md)。

---

## 设计原则

### 1. 单一源，双目标分发

**一份真相在 `source/`**。Claude Code 和 Codex 格式差异由 `adapters/` 转译处理。

优势：
- 改一处生效两处
- Codex 支持不是事后加的"二等公民"，从一开始就是一等公民
- 未来加 Cursor / Gemini 等工具只要再写一个 adapter

### 2. dist/ 是构建产物，也 commit 进 git

这看起来反直觉（通常 `dist/` 加入 `.gitignore`）。但对 MCC：
- 用户 `/plugin install` 时直接消费 `dist/`
- 用户不需要本地 Node + build 才能用
- source/ → dist/ 的转换通过 CI 保证 dist/ 永远和 source/ 同步

### 3. Installer 薄 wrapper + Node 主逻辑

`install.ps1` 和 `install.sh` 都是 10-行 wrapper，真正的检测/拷贝/合并/备份/回滚在 `scripts/installer.js`。

优势：
- JSON 深度合并 / TOML section 追加 / 变量替换，Node 里写一次两平台共享
- 不依赖 jq / yq / python 这些平台不确定的工具
- 纯 Node.js 标准库（无 npm 依赖），下载即用

### 4. 不覆盖用户已有

安装的第一原则是"先备份、同名跳过、深度合并"。任何用户可能改过的东西（agent、command、skill、rule、settings.json）都保底：
- **agent/command/skill/mode/rule**：同名跳过（`--force` 可强制覆盖）
- **hook scripts**：装在 `.mcc-hooks/` namespace 下，完全独立
- **settings.json**：深度合并（permissions 并集、hooks 追加去重、mcpServers 合并），原文件自动备份
- **config.toml**：`[mcp_servers.*]` section 追加，同名保留用户侧

### 5. 不碰用户产物

任何 PRP artifacts、session-data、learned skills、docs/mistakes、docs/adr 都**永远不删**，即使卸载。

---

## 目录结构

```
mcc/
├── README.md                     # 用户视角
├── ARCHITECTURE.md               # 本文件
├── USAGE.md                      # 命令速查
├── LICENSE
│
├── manifest.json                 # MCC 元数据 + 组件统计 + 合并策略
├── plugin.json                   # Claude Code /plugin install 识别
├── marketplace.json              # /plugin marketplace add 识别
│
├── install.ps1 / install.sh      # 薄 wrapper → scripts/installer.js
├── uninstall.ps1 / uninstall.sh  # 薄 wrapper → scripts/uninstaller.js
│
├── scripts/
│   ├── installer.js              # 主逻辑（检测 / 备份 / 拷贝 / 合并 / 报告）
│   └── uninstaller.js
│
├── source/                       # ★ 单一源（改这里）
│   ├── agents/*.md               # 19 个角色 agent
│   ├── commands/*.md             # 20 个 slash 命令（v1.2 起直接触发 /prd、/plan 等，无前缀）
│   ├── skills/*/SKILL.md         # 8 个 skill 目录
│   ├── modes/*.md                # 3 个 behavioral mode
│   ├── hooks/
│   │   ├── hooks.json            # 8 条 hook 注册（带 ${MCC_HOOKS} 占位）
│   │   ├── settings.fragment.json # installer 合并用
│   │   └── scripts/              # 18 个 hook .js/.sh + 7 个 lib/.js
│   ├── mcp/mcp.json              # 5 个 MCP servers
│   ├── rules/
│   │   ├── python/               # 5 个 Python rules
│   │   └── common/mcc-principles.md  # SC PRINCIPLES 中文化融合版
│   └── PRPs/                     # 空占位目录（给 commands 产出落盘）
│
├── adapters/                     # 转译器（纯 Node，无 npm）
│   ├── _lib.js                   # 共享工具（FS / frontmatter 解析 / sha256）
│   ├── adapt-to-claude-code.js   # source/ → dist/claude-code/
│   ├── adapt-to-codex.js         # source/ → dist/codex/（含 AGENTS.md 编译）
│   └── build.js                  # 跑两个 adapter
│
└── dist/                         # 构建产物
    ├── claude-code/
    │   ├── .claude/              # 拷到 ~/.claude/
    │   │   ├── agents/ (19)
    │   │   ├── commands/ (20)
    │   │   ├── skills/ (8)
    │   │   ├── modes/ (3)
    │   │   ├── .mcc-hooks/
    │   │   ├── mcp-configs/mcp.json
    │   │   ├── rules/python/ + rules/common/mcc-principles.md
    │   │   ├── settings.fragment.json
    │   │   └── PRPs/{...}/.gitkeep
    │   └── INSTALL-MANIFEST.json
    │
    └── codex/
        ├── .codex/
        │   ├── agents/ (19, tools 已转译)
        │   ├── prompts/ (20 个 mcc-*.md)
        │   └── rules/
        ├── AGENTS.md              # 编译了 agents + commands + skills + modes
        ├── HOOKS-SOFT-GUIDANCE.md # hooks 转为自律约定
        ├── config.fragment.toml   # MCP 的 TOML 版
        └── INSTALL-MANIFEST.json
```

---

## 构建流水线

```
    source/*.md
        │
        ├──────────────────→ adapt-to-claude-code.js
        │                          │ 1. 目录结构化拷贝（agents/commands/skills/...）
        │                          │ 2. commands/ → commands/（触发 /*）
        │                          │ 3. hooks scripts → .mcc-hooks/
        │                          │ 4. PRPs 占位目录 + .gitkeep
        │                          │ 5. 生成 INSTALL-MANIFEST.json
        │                          ↓
        │                    dist/claude-code/.claude/
        │
        └──────────────────→ adapt-to-codex.js
                                   │ 1. agents: tools 字段按 TOOLS_MAP 重命名，删 model
                                   │    Read → read_file  Grep → search  Bash → run_shell_command  ...
                                   │ 2. commands: /xxx → `mcc-xxx` prompt，文件重命名 mcc-*.md
                                   │ 3. skills 不拷（Codex 不原生支持），编译入 AGENTS.md
                                   │ 4. hooks 不拷（Codex 不支持），生成 HOOKS-SOFT-GUIDANCE.md
                                   │ 5. mcp.json → config.fragment.toml（JSON → TOML）
                                   │ 6. AGENTS.md: 角色清单 + 命令索引 + skill 指引 + modes
                                   ↓
                             dist/codex/
```

构建 0.2 秒，幂等（clearDir + 重建），每次输出 sha256 + size。

---

## 安装流水线

```
用户：./install.sh --scope global --target both
        ↓
  install.sh（薄 wrapper）
        ↓ node 路径转换（Git Bash 环境 cygpath）
        ↓
  scripts/installer.js
        │
        ├─ parseArgs                 参数解析
        ├─ detectEnvironment()       检测 Claude Code / Codex / Node
        ├─ promptYesNo()             非 dry-run 时确认
        │
        ├─ installClaudeCode()
        │     ├─ 备份 settings.json → settings.json.backup-{ts}
        │     ├─ copyDirSkipExisting(agents/)   同名跳过
        │     ├─ copyDirSkipExisting(commands/)
        │     ├─ copyDirSkipExisting(skills/)
        │     ├─ copyDirSkipExisting(modes/)
        │     ├─ copyDirSkipExisting(.mcc-hooks/scripts/)  force 覆盖（MCC namespace）
        │     ├─ replaceInstallVariables(hooks.json)       ${MCC_HOOKS} → 实际路径
        │     ├─ copyDirSkipExisting(rules/)
        │     ├─ mergeSettingsJson(existing, fragment)    深度合并
        │     │       ├─ permissions.allow 并集去重
        │     │       ├─ hooks 按 matcher + command 去重追加
        │     │       └─ mcpServers 对象合并
        │     └─ 返回 report
        │
        ├─ installCodex()
        │     ├─ 备份 config.toml → config.toml.backup-{ts}
        │     ├─ copyDirSkipExisting(.codex/agents/)
        │     ├─ copyDirSkipExisting(.codex/prompts/)
        │     ├─ copyDirSkipExisting(.codex/rules/)
        │     ├─ AGENTS.md：新建或追加 MCC Section
        │     ├─ HOOKS-SOFT-GUIDANCE.md 拷贝
        │     ├─ appendTomlFragment(existing, fragment)  [mcp_servers.*] 追加
        │     └─ 返回 report
        │
        └─ 打印报告 + 回滚命令（带时间戳）
```

---

## 关键设计决策

### 为什么 v1.2 把 commands 从 `commands/mcc/` 平到 `commands/` 顶层

**v1.0-1.1**：`commands/mcc/prd.md` → 触发 `/mcc:prd`（带命名空间避免冲突）。

**v1.2 起**：`commands/prd.md` → 触发 `/prd`（更简洁，对独占 MCC 的用户不繁琐）。

代价：**和用户已有同名命令可能冲突**（如之前装过别的插件有 `/plan`）。两种处理：

- **独占模式**：`install.sh --exclusive` 先备份并清空 `agents/commands/skills/modes/` 再装 MCC（`rules/` 和 `settings.json` 保留）
- **共存模式**（默认）：同名跳过，保留用户已有。想让 MCC 覆盖就加 `--force`

### 为什么 hooks 放 `.mcc-hooks/` 隐藏 namespace

用户可能已经有自己写的 hook scripts 在 `~/.claude/hooks/`。MCC 的 25 个脚本放独立 namespace：
- 不污染用户原目录
- 卸载干净（只删 `.mcc-hooks/`）
- hooks.json 里的命令都指向 `.mcc-hooks/scripts/`，和用户 hooks 完全隔离

### 为什么 settings.json 用深度合并而不是覆盖

`settings.json` 里常见内容：
- `permissions.allow`：用户自定义的允许命令（MCC 加 27 个，用户可能已有 50 个）
- `hooks`：用户自定义 hook（MCC 加 8 条，用户可能已有 5 条）
- `mcpServers`：MCP 配置（MCC 加 5 个，用户可能已有 3 个）

粗暴覆盖会丢用户自定义。所以 installer 做**字段级深度合并**：
- `permissions.allow`：并集去重（`[...new Set(existing, new)]`）
- `hooks[event]`：按 matcher 分组，同 matcher 的 hooks 数组按 command 去重追加
- `mcpServers`：对象合并（MCC 同名覆盖，不同名保留）

### 为什么 TOML 是"追加段"而不是合并段

TOML 的 `[section]` 语义是"一段属性"。重复的 `[section]` 会被 parser 视为错误。所以合并 `config.toml` 是：
- 解析 existing TOML 提取所有 `[section]` 名
- 遇到同名 `[mcp_servers.xxx]` 则跳过（除非 `--force`）
- 其他 section 追加到文件末尾
- 加一个 `# ═══ MCC MCP servers ═══` 注释分隔，方便用户看

### 为什么 hooks.json 用 `${MCC_HOOKS}` 占位符

hooks 脚本的**绝对路径**在 install 时才知道（global 下是 `~/.claude/.mcc-hooks/scripts/`，project 下是 `./.claude/.mcc-hooks/scripts/`）。

installer 装完后做变量替换：
- `${MCC_HOME}` → `.mcc-hooks/` 的绝对路径
- `${MCC_HOOKS}` → 同上
- `${MCC_SKILLS}` → `skills/` 的绝对路径

这样 `hooks.json` 在 source/ 里保持"位置无关"，installer 负责本地化。

### 为什么 adapters 是纯 Node（无 npm）

用户 `git clone` 下来就要能 `./install.sh`。如果 adapters 依赖 `lodash` 之类的 npm 包，就要先 `npm install`，平白增加摩擦。

所以 `adapters/_lib.js` 里手写了：
- YAML frontmatter 解析器（简版，够用 MCC 的 name/description/tools/model/argument-hint）
- 递归目录拷贝
- sha256 校验
- logger

共 234 行，无任何外部依赖。

### 为什么 root-cause-analyst 合并到 debugger

SC 的 `root-cause-analyst` 偏"方法论、证据链文档化"，wshobson 的 `debugger` 偏"快速 5 步修复"。两者合并为一个 `debugger`：
- 开头 5 步是 wshobson 的流程骨架
- 中间插 SC 的"调查原则 + 证据链清单 + 假设测试"方法论
- 结尾是 wshobson 的 5 段输出模板
- 加 MCC 独有的 "LLM/RAG 应用调试专项"（4 类 bug 模式）

融合后一个 agent 覆盖两种场景，不让用户选困扰。这是 5 个融合型里的其中一个。

---

## 扩展指南

### 加一个新 agent

1. 在 `source/agents/` 下新建 `my-agent.md`，按 Canonical 格式（见 `_decisions/MCC-CANONICAL.md` 如有）
2. frontmatter: `name / description（中文）/ tools / model`
3. 跑 `node adapters/build.js`
4. 跑 `./install.ps1 --dry-run` 确认装入路径
5. 真装 + 在 Claude Code 里测"帮我 XX"看 agent 是否被调用

### 加一个新 command

1. 在 `source/commands/` 下新建 `my-cmd.md`
2. frontmatter: `description`（中文一句话）+ 可选 `argument-hint`
3. 命名不含 `/` 前缀（adapter 会加）
4. 引用其他 MCC agent/skill 时用它们的裸名
5. build + install + 在 Claude Code 里 `/my-cmd` 测

### 加一个新 skill

1. 在 `source/skills/` 下新建 `my-skill/SKILL.md` 目录
2. frontmatter: `name + description`
3. 如果 skill 有脚本/数据文件（比如 `workflow-map.json`），放同目录
4. build + install

### 加支持一个新工具（比如 Cursor）

1. 写 `adapters/adapt-to-cursor.js`（参考 `adapt-to-codex.js`）
2. 在 `adapters/build.js` 里加一行调用
3. 在 `scripts/installer.js` 里加检测 + 安装逻辑
4. 在 `manifest.json.targets` 里加 cursor 条目

---

## 测试

当前 v1.0 没有自动化测试。手动检查：

```bash
# 1. 构建
node adapters/build.js

# 2. Dry-run 安装（不改任何文件）
./install.sh --dry-run --target both --scope project

# 3. 真装到 project scope 的 temp 目录
mkdir -p /tmp/mcc-test && cd /tmp/mcc-test
~/path/to/mcc/install.sh --scope project --target both

# 4. 验证目录结构
find .claude -type f | head -20
find .codex -type f | head -20

# 5. 验证 JSON/TOML 合并
cat .claude/settings.json | head -30
cat .codex/config.toml | head -30

# 6. 卸载
~/path/to/mcc/uninstall.sh

# 7. 验证回滚
ls -la .claude/.mcc-hooks/ 2>/dev/null   # 应不存在
```

---

## 发布

1. 更新 `manifest.json.version` 和 `plugin.json.version`
2. 跑 `node adapters/build.js` 刷新 dist/
3. commit + tag + push
4. 在 GitHub 上 release 对应 tag

---

## 已知限制

- **hooks 脚本的 `ECC_` 环境变量前缀**：拷贝自 ECC 的 hook scripts 内部用 `ECC_HOOK_PROFILE` 等变量名。为了不破坏脚本互相引用，保留不改。用户不会看到这些（纯内部）
- **continuous-learning-v2 默认关闭 observer**：启用要手动改 `skills/continuous-learning-v2/config.json` 的 `observer.enabled: true`
- **Windows 上部分 hook 降级**：`pre-bash-tmux-reminder` 在无 tmux 环境静默 no-op（不报错）；`observe.sh` 需要 Git Bash + Python，未装 Python 时静默跳过
- **`/tdd` 和 `/e2e`**：没有对应的 `tdd-workflow` / `e2e-testing` skill（A3 决策没装），命令本体是内联简化版。v1.2 计划补齐
- **`.codex/skills/` 不拷**：Codex 不原生支持 skill，skill 内容编译进了 `AGENTS.md` 作为场景指引

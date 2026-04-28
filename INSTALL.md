# MCC 安装详解

> README 顶部一条命令搞定 99% 场景。本文是**进阶选项参考**——只在你确实需要时再看。

---

## 默认安装（推荐）

**Windows**：
```powershell
iwr -useb https://raw.githubusercontent.com/18811184907/mcc/main/bootstrap.ps1 | iex
```

**macOS / Linux / Git Bash**：
```bash
curl -fsSL https://raw.githubusercontent.com/18811184907/mcc/main/bootstrap.sh | bash
```

### 流程（不问问题）

1. 检查 `git` + `node ≥ 18`
2. clone 到 `~/.mcc-install`（已有则 `git pull`）
3. 跑 installer 走 **smart-split** 默认：
   - Claude Code 用户级能力（agents/commands/skills/modes/settings/MCP/rules/CLAUDE.md/.mcc-hooks）→ 强制装 `~/.claude/`
   - Codex 用户级能力（agents/prompts/rules/AGENTS.md/MCP config）→ 强制装 `~/.codex/`
   - 项目级残骸（PRPs/ 工作产物目录）→ 当前 cwd 下建（cwd 是 `$HOME` 时跳过）
4. 默认 3 件事全做：
   - 信任模式 `settings.json`（permissions.allow=["*"] + bypassPermissions）
   - 独占模式（备份原 `~/.claude/{agents,commands,skills,modes}` 后装纯 MCC）
   - 自动写 `~/.claude/CLAUDE.md`（如不存在）

### 装完做了什么

**用户级 `~/.claude/`**：
- `agents/` — 19 agents（独占模式覆盖原有，旧的备份到 `.exclusive-backup-{时间戳}/agents/`）
- `commands/` — 15 commands（VS Code 扩展从这里扫，所以 `/` 自动补全立刻有）
- `skills/` — 21 skill 目录
- `modes/` — 3 个 behavioral mode
- `.mcc-hooks/` — 27 hook scripts + hooks.json（含 v2.5 vault-sync 和 vault-leak-detect）
- `rules/` — common 1 + python 5 + typescript 5
- `templates/` — CLAUDE.global.example.md（推荐模板源）
- `settings.json` — 信任模式（深度合并 + 你已设字段保留：theme/allow 项/skipDangerousModePermissionPrompt 等）
- `settings.json.backup-{时间戳}` — 原 settings 备份
- `CLAUDE.md` — 推荐模板（仅在原本不存在时写）

**用户级 `~/.codex/`**：
- `agents/` — 19 agents（转为 Codex 角色指引）
- `prompts/` — 15 个 `mcc-*` prompt（Codex 侧用 `mcc-prd` / `mcc-plan` 这种名字触发）
- `rules/` — common 1 + python 5 + typescript 5
- `AGENTS.md` — 编译版索引；会提示优先读 `~/.codex/agents/` 和 `~/.codex/prompts/`
- `config.toml` — 追加 MCC MCP servers

**项目级 `<cwd>/.claude/`**（smart 默认会建；`global` 模式跳过；`project` 模式整套都装这里）：
- `PRPs/{prds,plans,reports,reviews,onboarding,features}/` — 6 个工作产物子目录 + .gitkeep

**项目级 `<cwd>/.codex/`**（仅 `--scope project` 团队共享模式）：
- `agents/` / `prompts/` / `rules/` — 全套 Codex 适配层，配合项目根 `AGENTS.md` commit 给团队

**重启 Claude Code 立即生效**。**重跑同一命令 = 更新到最新**。

### 关默认行为的 flag

| flag | 关掉哪个默认 |
|---|---|
| `--no-exclusive` | 不清空你已有的 agents/commands/skills/modes（共存模式，同名跳过） |
| `--strict` | 关信任模式，回到细粒度白名单 + askForPermission |
| `--skip-claudemd` | 不自动写 `~/.claude/CLAUDE.md` |
| `--no-project-stub` | smart 模式下不在当前 cwd 建 PRPs/（等价于 `--scope global`） |
| `--scope global` | 只装 `~/.claude/` + `~/.codex/`，不动当前目录 |
| `--scope project` | 团队共享：全套装到 `<cwd>/.claude/` + `<cwd>/.codex/`（要 commit 给同事） |

---

## 进阶选项（带参数）

**bash**（用 `-s --` 直接透传）：

```bash
curl ... | bash -s -- --exclusive             # 独占模式
curl ... | bash -s -- --scope project          # 装当前项目
curl ... | bash -s -- --strict                 # 严格模式
curl ... | bash -s -- --skip-claudemd          # 不写 CLAUDE.md
curl ... | bash -s -- --scope project --exclusive --strict   # 组合
```

**PowerShell**（`iwr | iex` 不能直传参数，用 env 变量）：

```powershell
$env:MCC_BOOTSTRAP_ARGS = "--exclusive"
iwr -useb https://raw.githubusercontent.com/18811184907/mcc/main/bootstrap.ps1 | iex

# 多参数组合
$env:MCC_BOOTSTRAP_ARGS = "--scope project --exclusive --strict"
iwr -useb ...
```

---

## 4 个常用 flag 详解

### `--exclusive`（v2.3.2 起 bootstrap 默认开）

bootstrap 现在**默认**带 `--exclusive`。逻辑：

1. 备份 `~/.claude/{agents,commands,skills,modes}` → `~/.claude.exclusive-backup-{时间戳}`
2. 清空这 4 个目录（`rules/` 和 `settings.json` 保留）
3. 装 MCC（19/15/21/3 全装零冲突）
4. 回滚：`./uninstall.sh --timestamp {时间戳}`

⚠ 第一次装 MCC 且原本 `~/.claude/agents/` 等里有自定义内容？已经备份了，但**确认你能从备份目录恢复**才放心。

要**关掉**这个默认（不清空你已有的 → 走共存模式 / 同名跳过）：

```bash
curl ... | bash -s -- --no-exclusive
```

或 PowerShell：

```powershell
$env:MCC_BOOTSTRAP_ARGS = "--no-exclusive"
iwr ... | iex
```

### `--strict` 严格模式

担心默认信任太宽松？启用后：
- `permissions.allow` 用细粒度白名单（`Read(*)` / `Bash(gh *)` / `Bash(npm *)` / ...）
- 不写 `bypassPermissions`
- 不写 `skipDangerousModePermissionPrompt`
- 每次新工具调用 / 危险命令仍会弹窗

适合：企业 / 安全敏感场景 / 共享机器。**99% 个人开发者用默认信任就好**。

### `--scope smart` (v2.4 默认 / 推荐)

不传 `--scope` 即走 smart。语义：

- 用户级能力（agents / commands / skills / modes / settings / MCP / rules / `.mcc-hooks` / `~/.claude/CLAUDE.md`）→ 强制装 `~/.claude/`
- 项目级残骸（`PRPs/{prds,plans,reports,reviews,onboarding,features}/`）→ 当前 cwd 下建
- 如果 cwd 是 `$HOME`，跳过项目级残骸（避免污染 home）

为什么这是默认：trust 模式 + `/` 自动补全 + 跨项目能力都需要装在全局；项目工作产物（PRD/plan/reports）天然属于具体项目。把这两件事按"内容性质"分开，比"装一处或装另一处"二选一对用户友好。

### `--scope global` (只装全局，不动 cwd)

老 v2.3 的"global" 行为。装 `~/.claude/`，**不**在当前目录建 PRPs/。
- 适合：在 `$HOME` 跑 / 不想在当前项目目录留任何东西
- 用 `MCC_BOOTSTRAP_ARGS="--scope global" iwr ... | iex`

### `--scope project` (team-shared 模式)

把全套**包括** `agents/commands/skills/modes/settings.json` 都装到 `<cwd>/.claude/`，**不**动 `~/.claude/`。
- 适合：团队 lead 把 MCC 配置 commit 到团队仓库
- 用 `cd 团队仓库 && MCC_BOOTSTRAP_ARGS="--scope project" curl ... | bash`
- ⚠ 注意：这种模式下 trust 模式只对该项目生效；跨项目时 Claude Code 用回全局原配置

### `--no-project-stub` (smart 模式但跳过 cwd PRPs/)

等价于 `--scope global`，更显式。

### `--skip-claudemd` 不要自动写 CLAUDE.md

默认会在你 `~/.claude/CLAUDE.md` 不存在时写入推荐模板（优先复用 / 中文 / TodoWrite）。加这个 flag 跳过，自己手动从 `~/.mcc-install/source/templates/CLAUDE.global.example.md` 拷过去。

---

## 默认信任模式细节

`settings.fragment.json` 写入：

```json
{
  "permissions": {
    "allow": ["*"],
    "defaultMode": "bypassPermissions"
  },
  "enableAllProjectMcpServers": true,
  "skipDangerousModePermissionPrompt": true,
  "skipAutoPermissionPrompt": true
}
```

**为什么默认信任**：MCC 用户群是开发者，每次工具调用弹窗严重打断流。设计哲学就是"用户少敲，Claude 多主动"。

**不会覆盖你已显式设过的字段**（v2.3 起 `mergeSettingsJson` 改 fragment-provides-default 语义）：
- 你设过 `defaultMode: "askForPermission"` → 保留
- 你设过 `alwaysThinkingEnabled: false` → 保留
- 你 allow 列表已有项 → 与 MCC 的并集

---

## 备选安装方式

### Claude Code 原生 `/plugin`

```
/plugin marketplace add https://github.com/18811184907/mcc
/plugin install mcc@mcc-marketplace
```

只装 agent/command/skill，**不合并 hooks + MCP + settings**。装完还是要跑一次 `.\install.ps1` 才算完整。

### 手动 git clone（看清每一步）

```bash
git clone https://github.com/18811184907/mcc
cd mcc
./install.sh                    # 或 .\install.ps1
```

支持所有 flag：

```bash
./install.sh --scope project --target claude-code --exclusive --strict
```

完整 flag：

```
./install.sh
  --scope <smart|global|project|hybrid>     安装模式（默认 smart）
  --target <auto|claude-code|codex|both>    目标工具（默认 auto）
  --force                                   覆盖同名（默认跳过）
  --exclusive                               独占模式
  --no-project-stub                         smart 下跳过 cwd 的 PRPs/
  --strict                                  严格权限
  --skip-claudemd                           跳过自动写 CLAUDE.md
  --dry-run                                 只打印计划，不动文件
  --verbose                                 详细日志
```

---

## scope 四档对比

| Scope | Claude Code | Codex | cwd 下产物 | 适合谁 |
|---|---|---|---|---|
| **smart**（v2.4 默认） | `~/.claude/` | `~/.codex/` | `PRPs/` | 99% 个人开发者 |
| **global** | `~/.claude/` | `~/.codex/` | 无 | 在 `$HOME` 跑 / 只装能力 |
| **project**（team） | `./.claude/` | `./.codex/` + `./AGENTS.md` | 全套 | 团队 lead 推 MCC 给同事 |
| **hybrid** | alias of smart | alias of smart | 同 smart | 老调用方兼容 |

---

## v2.4 升级说明（从 v2.3.x 来）

如果你用 v2.3.x 装过 MCC：

- 老的 `--scope global`（默认）在 v2.4 改名 `--scope smart`，并新增 cwd 下 PRPs/ 残骸
  - 不想要 cwd 残骸 → 显式传 `--scope global`
- 老的 `--scope project` 行为不变，但语义重新定位为"团队共享"模式
- v2.3.5 之前在选 `project` 时遇到的 trust 模式不全局生效 / `/` 不补全 / cwd 错乱 等 bug，全部由 smart-split 解决

旧 backup（`~/.claude.exclusive-backup-{时间戳}`）依然能用 `./uninstall.sh --timestamp <ts>` 回滚。

---

## 验证装好了

在 Claude Code 里打：

```
/mcc-help
```

会激活 MCC 导航，扫 `.claude/PRPs/` 推断当前项目阶段并给建议。Codex 侧用 `mcc-help`。

或直接看：
- `~/.claude/agents/` 应该有 19 个 .md
- `~/.claude/commands/` 应该有 15 个 .md
- `~/.claude/CLAUDE.md` 应该有内容（如之前不存在）

---

## 卸载

```powershell
.\uninstall.ps1                              # 从最近备份恢复
.\uninstall.ps1 -Timestamp 2026-04-27-...    # 指定时间戳
```

```bash
./uninstall.sh --timestamp 2026-04-27-...
```

会保留：PRPs / session-data / learned skills / docs（用户产物绝不删）。

---

## 还有问题？

- [QUICKSTART.md](./QUICKSTART.md) — 1 页装完使用
- [USAGE.md](./USAGE.md) — 15 命令 + 21 skill 完整参考
- [ARCHITECTURE.md](./ARCHITECTURE.md) — 单源双目标 / 4 层架构
- GitHub Issues — 报 bug / 提需求

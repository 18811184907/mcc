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

### 流程（最多一问）

1. 检查 `git` + `node ≥ 18`
2. clone 到 `~/.mcc-install`（已有则 `git pull`）
3. **唯一交互**：TTY 里问"装到全局（默认 N）还是当前项目（y）？"
   - `iwr | iex` 或 `curl | bash` 非交互模式 → 静默走默认 global
4. 跑 installer，**3 个默认全开**：
   - 信任模式 `settings.json`
   - 独占模式（备份原 4 目录后装纯 MCC）
   - 自动写 `~/.claude/CLAUDE.md`（如不存在）

### 装完做了什么

- `~/.claude/agents/` — 19 agents（独占模式覆盖原有，旧的备份到 `.exclusive-backup-{时间戳}/agents/`）
- `~/.claude/commands/` — 13 commands
- `~/.claude/skills/` — 18 skill 目录
- `~/.claude/.mcc-hooks/` — 25 hook scripts
- `~/.claude/rules/` — common 1 + python 5 + typescript 5
- `~/.claude/templates/` — CLAUDE.global.example.md（推荐模板源）
- `~/.claude/settings.json` — 信任模式（深度合并 + 你已设字段保留）
- `~/.claude/settings.json.backup-{时间戳}` — 原 settings 备份
- `~/.claude/CLAUDE.md` — 推荐模板（仅在原本不存在时写）

**重启 Claude Code 立即生效**。**重跑同一命令 = 更新到最新**。

### 关默认行为的 flag

| flag | 关掉哪个默认 |
|---|---|
| `--no-exclusive` | 不清空你已有的 agents/commands/skills/modes（共存模式，同名跳过） |
| `--strict` | 关信任模式，回到细粒度白名单 + askForPermission |
| `--skip-claudemd` | 不自动写 `~/.claude/CLAUDE.md` |

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
3. 装 MCC（19/13/18/3 全装零冲突）
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

### `--scope project` 装到当前项目

装到 `./.claude/`（项目级）而不是 `~/.claude/`（全局）。
- 适合：团队协作（committing project-level 配置）
- 用 `cd 项目 && curl ... | bash -s -- --scope project`

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
  --scope <global|project|hybrid>           安装位置（默认 global）
  --target <auto|claude-code|codex|both>    目标工具（默认 auto）
  --force                                   覆盖同名（默认跳过）
  --exclusive                               独占模式
  --strict                                  严格权限
  --skip-claudemd                           跳过自动写 CLAUDE.md
  --dry-run                                 只打印计划，不动文件
  --verbose                                 详细日志
```

---

## scope 三档对比

| Scope | Claude Code | Codex | 适合谁 |
|---|---|---|---|
| **global**（默认） | `~/.claude/` | `~/.codex/` | 个人使用 |
| **project** | `./.claude/` | `./.codex/` + `./AGENTS.md` | 团队协作 / 多项目不同配置 |
| **hybrid** | 通用全局 + rules 项目级 | 同上 | 进阶用户 |

---

## 验证装好了

在 Claude Code 里打：

```
help
```

会激活 `help` skill，扫 `.claude/PRPs/` 推断当前项目阶段并给建议。

或直接看：
- `~/.claude/agents/` 应该有 19 个 .md
- `~/.claude/commands/` 应该有 13 个 .md
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
- [USAGE.md](./USAGE.md) — 13 命令 + 18 skill 完整参考
- [ARCHITECTURE.md](./ARCHITECTURE.md) — 单源双目标 / 4 层架构
- GitHub Issues — 报 bug / 提需求

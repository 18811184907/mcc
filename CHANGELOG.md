# Changelog

All notable changes to MCC, ordered newest first. Detailed per-release notes in `.release-notes-vX.Y.Z.md`.

## v2.6.1 · 2026-04-29 · 上下文优化

- 6 个过长 frontmatter description 压缩（每 session baseline 省 ~400 token）
- `rules/typescript/{testing,hooks}.md` paths 收窄按需触发（写非测试 .ts 每次 edit 省 ~5k token）
- 详见 [.release-notes-v2.6.1.md](.release-notes-v2.6.1.md)

## v2.6.0 · 2026-04-29 · 用户级 vault（新功能）

- 新 skill `user-vault`：跨项目通用 secret/SSH/git 身份的 AI 接管管理
- 新 hook `post-user-vault-sync.js`：USER_VAULT.md → `.user-env.{sh,ps1}` + `git --global` + `~/.ssh/config`
- 自动追加 `source` 行到 `~/.bashrc` / `~/.zshrc` / PowerShell `$PROFILE`（marker 幂等）
- project-vault skill 加 promotion 建议（明显跨项目条目建议提到 USER_VAULT）
- pre-vault-leak-detect 同时扫 USER + PROJECT
- installer 自动创建 `~/.claude/USER_VAULT.md` 模板
- 新 test `user-vault-hook-test.js` (19 checks)
- 详见 [.release-notes-v2.6.0.md](.release-notes-v2.6.0.md)

## v2.5.12 · 2026-04-29 · 审计 P1 收尾（14 条工程质量）

- 4 hook 加 watchdog（block-no-verify / pre-bash-commit-quality / pre-bash-tmux-reminder / auto-tmux-dev）
- spawnSync 统一 stdio[0]='ignore' + windowsHide + maxBuffer 16MB
- Node ≥ 16 启动校验
- TOML extractTomlSections 显式 reject `[[array of tables]]`
- ensureProjectGitignore marker 幂等
- bash-hook-dispatcher 异常 stderr 写 "treating as allow"
- bootstrap.sh `MCC_DOTFILES_REPO` 协议白名单 + python3 JSON 序列化
- 详见 [.release-notes-v2.5.12.md](.release-notes-v2.5.12.md)

## v2.5.11 · 2026-04-29 · 安全审计修复（10 个 P0 Critical）

四 agent 并行审计后修复 4 安全 + 3 数据安全 + 3 静默失败：

- post-claudemd-sync.js syncFile 路径穿越（覆写 `~/.ssh/authorized_keys` 风险）
- post-claudemd-sync.js 自动 push 不校验 remote URL（CLAUDE.md 静默泄漏）
- post-vault-sync.js SSH 字段未净化（`~/.ssh/config` 注入）
- auto-tmux-dev.js Windows cmd /k 命令注入
- installer.js Codex exclusive 备份 `catch{}` 吞错（数据丢失）
- uninstaller.js targetRoot 计算错误（删 `~/AGENTS.md` 定时炸弹）
- installer.js TOML 注释行误识别为 section（MCP 配置静默丢失）
- pre-vault-leak-detect.js scan 错误吞掉
- gateguard-fact-force.js saveState/loadState 错误吞掉
- session-{start,end}.js 顶层 catch 只打 message 丢 stack
- 详见 [.release-notes-v2.5.11.md](.release-notes-v2.5.11.md)

## v2.5.10 · 2026-04-28 · Codex 补丁后续 + docs/ 状态文件统一 + dev-changelog skill

## v2.5.9 · 2026-04-28 · 隐藏 installer + hook 审计修复

## v2.5.7-2.5.8 · 2026-04-28 · 静默 hook skip + Codex Set 白名单

## v2.5.6 · 2026-04-28 · Codex 用户级安装 + Serena 迁移

## v2.5.5 · 2026-04-28 · Codex-only 双线对等修复

## v2.5.1-2.5.4 · 2026-04-28 · AI 主导接管模式 + database-schema-doc skill

PROJECT_VAULT 重写为"AI 主动接管"，用户 0 手动操作。

## v2.5.0 · 2026-04-28 · project-vault skill（首发）

## v2.4 · 2026-04-26 · smart-split 默认 + 项目 stub

`.claude/PRPs/` 工作产物在当前目录建，~/.claude/ 装能力。

## v2.3 · 2026-04-26 · 信任模式 + ~/.claude/CLAUDE.md 自动写入

`permissions.allow=["*"]` + `bypassPermissions`。

## v2.2 · 2026-04-25 · TS rules 实战 hook 模板对等

## v2.1 · 2026-04-25 · 跨设备同步（claudemd-sync）

## v2.0 · 2026-04-25 · 接手已有项目（brownfield onboarding）

- 新命令 `/onboard`：4 阶段并行扫已有项目（~5 min 出报告）
- 新命令 `/index-repo`：2K 投入省 ~10-15K tokens/session
- 新 skill `project-onboarding`

## v1.10 · 2026-04-25 · 5 审查员交叉审计清零 + Codex 伪并行

## v1.9 · 2026-04-24 · 彻查遗留 + 并行可视化 + mcc-help→help

## v1.8 · 2026-04-24 · 4 层架构重构 + token 精简

mcc-principles 391 行 → 94 行（5600 → ~1500 tokens 常驻，-73%）。

## v1.7 · 2026-04-24 · 多智能体自动并行协同

P-0.5 并行优先元规则；TS rules 补齐到 Python 对等。

## v1.6 · 2026-04-24 · 产品级深度优化

5 轮并行审查员审计；hooks 防卡死 3 道防线；smoke 133 自检套件。

## v1.5 · 2026-04-24 · 少命令，多自动

20 → 11 命令；P-1 主动性原则上线。

## v1.4 · 2026-04-24 · Hook 减捣乱（合并 v1.3）

3 个捣乱王默认关：`pre:config-protection` / `stop:format-typecheck` / `pre:bash:safety`。

## v1.2 · 2026-04-24 · slash 去 `/mcc:` 前缀 + `--exclusive` 模式

## v1.1 · 2026-04-24 · obra/superpowers 8 skill 增量

`subagent-driven-development` / `tdd-workflow` / `writing-skills` / `using-git-worktrees` / `dispatching-parallel-agents` 等。

## v1.0 · 2026-04-24 · 首发

- 19 agents（含 5 融合型）+ 20 commands + 8 skills + 3 modes
- 8 hooks + 5 MCPs + Python rules + mcc-principles
- 双目标 adapter（Claude Code + Codex）

---

## Roadmap (待定)

- [ ] `install.ps1 -Minimal` 最小 MCP 模式（只装 Context7 + Sequential，省 7-11k tokens）
- [ ] `doc-updater` agent
- [ ] 更多语言 rules（Go / Rust 按需）
- [ ] Cursor / Gemini CLI 支持（按需）
- [ ] Organization 版 team backup（每同事自己的 GitHub + collaborator）

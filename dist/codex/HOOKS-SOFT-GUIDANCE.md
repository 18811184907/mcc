# MCC Hooks 软约定（Codex）

> Codex 不支持原生 hook 机制。以下把 MCC 的 8 条 hook 翻译成 Codex 使用者的自律约定。
> 没法自动拦截，但你知道**这些时刻该手动做什么**。

## pre:config-protection

- **原 hook 事件**：`PreToolUse`  (matcher: `Write|Edit|MultiEdit`)
- **语义**：阻止 Claude 修改配置来绕过 lint/security 规则（独家）
- **Codex 自律**：
  - 改 lint / security / tsconfig / eslint 等配置前，问自己："这是放宽规则吗？如果是，这个场景真的值得放宽吗？"

## stop:format-typecheck

- **原 hook 事件**：`Stop`  (matcher: `*`)
- **语义**：响应结束时批量跑 format + typecheck（不是每次 edit 跑，显著降成本）
- **Codex 自律**：
  - 一批文件 edit 完后，手动跑 `pnpm/yarn/npm run lint && tsc --noEmit`（或 `ruff check && pyright`）。别累积一堆再修。

## session:start

- **原 hook 事件**：`SessionStart`  (matcher: `*`)
- **语义**：自动加载上次 session 的上下文（别名、记忆、项目探测）
- **Codex 自律**：
  - 开新 session 前，先读上次 session 留下的 `~/.claude/session-data/` 最近文件（或类似笔记），别从零重启上下文。

## stop:session-end

- **原 hook 事件**：`Stop`  (matcher: `*`)
- **语义**：持久化 session 状态
- **Codex 自律**：
  - session 结束前写一段 "本次做了什么 / 什么没跑通 / 下一步 exact action"，用 `mcc-session-save` prompt。

## stop:check-console-log

- **原 hook 事件**：`Stop`  (matcher: `*`)
- **语义**：扫残留 console.log / print 语句
- **Codex 自律**：
  - 交付前 grep `console.log` / `print(` / `dbg!` 等调试语句清掉。

## post:user-vault-sync

- **原 hook 事件**：`PostToolUse`  (matcher: `Write|Edit|MultiEdit`)
- **语义**：~/.claude/USER_VAULT.md 改完自动同步到 .user-env.sh / .user-env.ps1 / git --global / ~/.ssh/config（跨项目通用）
- **Codex 自律**：
  - （该 hook 无对应 Codex 自律指引）

## pre:bash:safety

- **原 hook 事件**：`PreToolUse`  (matcher: `Bash`)
- **语义**：Bash 安全/质量/tmux/push 预检（dispatcher 串联 6 个子检查）
- **Codex 自律**：
  - 跑破坏性命令前停 2 秒：`rm -rf` / `git reset --hard` / `git push --force` / `DROP TABLE` / `truncate` 等。

## pre:observe:continuous-learning

- **原 hook 事件**：`PreToolUse`  (matcher: `*`)
- **语义**：continuous-learning-v2 的 PreToolUse 观察。默认关闭，用户手动启用。
- **Codex 自律**：
  - （可选）想让 AI 长期学习你的习惯？装 `continuous-learning-v2` skill 到 Claude Code 侧；Codex 下不支持。

## post:observe:continuous-learning

- **原 hook 事件**：`PostToolUse`  (matcher: `*`)
- **语义**：continuous-learning-v2 的 PostToolUse 观察。默认关闭。
- **Codex 自律**：
  - 同上。

## 统一原则

这 8 条约定落地的共同点：**让自己停下来想 2 秒，再动手**。
就像跑步前系鞋带——不能省，省了会摔跤。


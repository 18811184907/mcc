# MCC 快速上手 · 1 页指南

**MCC = Claude Code 一键变身专业开发助手**。装上后 Claude 自动主动派 agent、并行扫代码、按方法论工作，而不是被动答题。

---

## 1. 装（一条命令 · 不问问题 · 30 秒）

**Windows**：
```powershell
iwr -useb https://raw.githubusercontent.com/18811184907/mcc/main/bootstrap.ps1 | iex
```

**macOS / Linux / Git Bash**：
```bash
curl -fsSL https://raw.githubusercontent.com/18811184907/mcc/main/bootstrap.sh | bash
```

v2.4 默认 **smart-split**，自动分两处装：

```
~/.claude/         用户级 19 agents / 13 commands / 19 skills / 信任模式 settings    ← 永久所有项目可用
<cwd>/.claude/PRPs/   项目工作产物目录（prds/plans/reports/reviews/onboarding/features） ← 给本项目用
```

**重启 Claude Code 立即生效**。重跑同一条命令 = 自动 `git pull` + 重装。

> 团队共享场景？`MCC_BOOTSTRAP_ARGS="--scope project"` → 全套装项目里 commit 给同事
> 其他 flag（`--strict` / `--skip-claudemd` / `--no-exclusive` / `--no-project-stub`）见 [INSTALL.md](./INSTALL.md)

---

## 2. 用（核心场景 5 个）

### A. 全新项目从零开始

```
/init          # 建轻量 CLAUDE.md
/prd           # 7 phase 苏格拉底对话生成 PRD
/plan          # 从 PRD 生成自包含实施计划
/implement     # 按 plan 执行 + 6 阶段验证
/review        # 并行派 code-reviewer + security-reviewer
/pr            # 自动建 PR
```

### B. 接手已有大项目（v2.0 旗舰）

```
/onboard       # 4 阶段并行扫架构/数据/约定/危险信号 (~5 min)
               # 产出 onboarding 报告 + ≤100 行 CLAUDE.md
/index-repo    # 大项目（>1k 文件）生成索引省 token（可选）
```

### C. 修 bug

```
/fix-bug "登录偶尔 500"
# 自动并行盲诊：debugger + performance-engineer + database-optimizer
# 强制根因分析、禁止打补丁、归档到 docs/mistakes/
```

### D. 跨天续活

```
昨天结束前: /session-save
今天开始:   /session-resume
# 秒懂昨天到哪了、什么没跑通、下一步 exact action
```

### E. 不知道下一步

```
help（中文/英文都行，"我在哪 / 下一步该做什么"）
# 扫 .claude/PRPs/ 推断当前阶段，给具体建议
```

---

## 3. 你不用记的（Claude 自动激活的 skill）

只要描述场景，Claude 自己挑：

| 你说 | 自动激活 |
|---|---|
| "刚 clone 这项目 / 不熟这个代码库" | `/onboard` |
| "帮我审一下 / review" | `code-review-workflow`（并行派 reviewer + security） |
| "验证一下 / 跑一遍检查" | `verification-loop`（6 阶段：build/type/lint/test/security/diff） |
| "用 TDD / 写测试" | `tdd-workflow`（RED-GREEN-REFACTOR） |
| "记下这个 / 沉淀一下" | `continuous-learning-v2`（产出 learned skill） |
| "两个方案选哪个 / 多视角" | `party-mode`（并行 4 agent 辩论） |
| "写 E2E / Playwright" | `e2e-testing` |

---

## 4. 看到 ⚡ / ✓ 是什么意思

每次 Claude 并行派多个 subagent，**会输出可视化文本**（v1.9 强制规则），让你看到真并行：

```
⚡ 并行派发 3 agent（fan-out / 预计 ~2 min）
   ├─ code-reviewer          代码质量
   ├─ security-reviewer      安全扫描
   └─ silent-failure-hunter  吞错路径

[3 个 Task tool 同时跑]

✓ 3 agent 全部返回（2.3 min）
   ├─ code-reviewer      2.3 min → 5 findings
   ├─ security-reviewer  1.8 min → 2 findings
   └─ silent-failure...  1.1 min → 0 findings

合流（去重 / 调矛盾 / 补缺 / 压摘要）：
  CRITICAL (1): ...
  HIGH (3): ...
  MEDIUM (2): ...
```

并行 3 agent ≈ 单 agent 时间 + 0 主 session 污染（subagent 各自 context 独立）。

---

## 5. 装完不工作？3 步排查

| 现象 | 检查 | 修法 |
|---|---|---|
| `/onboard` 等命令打了但不识别 | 重启 Claude Code | 装完必须重启 |
| 命令识别但激活失败 | `ls ~/.claude/commands/` 看有没有 13 个 .md | 没有 → 重跑 install.ps1 |
| Claude 不主动派 agent | 看 `~/.claude/rules/common/mcc-principles.md` 是否存在 | 没有 → 重跑 install |
| settings.json 被覆盖了 | 看 `~/.claude/settings.json.backup-{date}` | installer 自动备份；rename 回来 |

---

## 6. 卸载

```powershell
.\uninstall.ps1                              # 从最近备份恢复
.\uninstall.ps1 -Timestamp 2026-04-25-...    # 指定时间戳恢复
```

```bash
./uninstall.sh --timestamp 2026-04-25-...
```

会保留你的 PRPs / session-data / learned skills / docs（用户产物绝不删）。

---

## 7. 想深入

- `README.md` —— 完整设计 / 历史 / Roadmap
- `USAGE.md` —— 13 命令 + 19 skill 完整参考
- `ARCHITECTURE.md` —— 单源双目标、4 层架构
- 装完后可在 Claude Code 里激活 `help` skill：`help 我该做什么`

---

## 8. 哲学（3 句话）

1. **用户少敲，Claude 多主动**（看到场景自动派 agent / 激活 skill，不等命令）
2. **默认并行**（多 agent 视角并发出 finding，主 session 合流，不串行排队）
3. **可视化真并行**（⚡派发 + ✓合流 让你看得见）

**装上重启敲 `help`，就够开始了。**

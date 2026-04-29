---
name: dev-changelog
description: "Claude 自动维护开发实时流水日志 docs/CHANGELOG-DEV.md，记**正在发生**的需求/进度/坑/下一步。触发：用户讲新需求或改主意（◇）、Claude 完成 ≥30 行或跨文件改动（✓）、遇 blocker（⚠）、决定下一步（→）。与 git log（已落盘代码）/ ADR（终态决策）/ SCHEMA（结构）/ mistakes（bug 根因）分工——本 skill 记进行中状态。每条 ≤5 行倒序。"
---

# Dev Changelog · AI 自动维护的开发实时流水

**核心原则**：用户**从不**手动维护 `docs/CHANGELOG-DEV.md`。Claude 在对话里检测到 4 类信号时**主动**追加。

读者画像：开发者每天打开第一个看的文件，知道"昨天聊到哪了 / 今天该做什么 / 哪里卡住了"。

## 4 类触发信号 & 4 种条目类型

| 用户/Claude 行为 | 条目前缀 | 写什么 |
|---|---|---|
| 用户讲新需求 / 想法 / 改主意 / 新发现 | `◇` | 一句话需求摘要（不要展开成 PRD，PRD 用 `/prd`） |
| Claude 完成实质改动（≥30 行 / 跨文件 / 一个 commit / 修复 bug） | `✓` | 改了什么 + commit hash 或分支名 |
| 卡点 / blocker / 不确定 / 等用户决策 | `⚠` | 卡在哪 + 怀疑原因 / 等什么 |
| 决定下一步具体动作 | `→` | next action（动词开头：跑 X / 问 Y / 写 Z） |

**详细度基线**：参考 [mcc release notes](https://github.com/18811184907/mcc/releases) 的密度——每个 `✓` 条目要写得像一条 release note，让读者不点 commit 也能完整理解发生了什么、为什么、影响是什么。`◇/⚠/→` 简短即可。

每个 `✓` 条目建议按下面的子结构写（缺哪段就省哪段，但 What 和 Why 都不能省）：

```
- ✓ <一句话总结>（branch/commit）
  **What**: <具体改了哪些文件 / 行为变化 / 数据变化>
  **Why**: <为什么这样改；上一次同类改动的代价 / 用户反馈 / 触发场景>
  **Impact**: <对老用户 / 老数据 / 老流程的影响；是否 breaking>
  **Verification**: <跑了哪些命令验证；测试结果，例如 19/19 passed>
  **Upgrade**: <可选；如果用户需要做什么，写命令块>
  **Rollback**: git restore <文件> / git revert <hash>
```

## Claude 主动接管的具体场景

### A. 用户讲新需求（写 ◇）

| 用户说 | Claude 立刻做 |
|---|---|
| "我想加一个用户登录页" | Edit CHANGELOG-DEV.md：`◇ 用户登录页（待开 PRD）` |
| "想想能不能把 X 改成 Y" | `◇ 探讨 X→Y 改造（暂未决定）` |
| "刚发现 OpenAI 出了 GPT-5" | `◇ 调研 GPT-5，看是否替换当前 model` |
| "之前那个方案我不要了，改成 …" | 在原 ◇ 旁加 `(已撤回 2026-XX-XX)`，新写一条 ◇ |

不写完整需求描述。**完整 PRD 用 `/prd` 命令产出 `.claude/PRPs/prds/*.prd.md`，CHANGELOG 里只一句指向**。

### B. Claude 完成实质改动（写 ✓）

判断"实质改动"的阈值：
- ≥ 30 行代码变更，或
- 跨 ≥ 2 个文件，或
- 修了一个 bug（任何行数），或
- 完成一次 commit / 一次 release

**不写琐碎**：单文件 typo、注释调整、变量改名 1 处。

格式：
```
✓ <一句话改了什么> (commit/branch: <hash 前 7 位>)
  影响：<可选，1 行>
  撤回：git restore <文件> 或 git revert <hash>
```

### C. 遇到卡点（写 ⚠）

| 场景 | 写什么 |
|---|---|
| 第三方 API 行为不符合预期 | `⚠ <API 名> 返回 <意外字段/状态>，怀疑 <原因>` |
| 用户决策未明 | `⚠ 等用户决定 <X 还是 Y>` |
| 测试挂了暂时绕过 | `⚠ <测试名> failing，先 skip 留 TODO，怀疑 <原因>` |
| 性能 / 内存 / 安全 红旗 | `⚠ <什么>，先继续做主线，回头查` |

**绝不**把 ⚠ 当 bug 库使用 —— bug 修完用 `mistakes/` skill 写 `docs/mistakes/bug-YYYY-MM-DD-*.md`。⚠ 只记**当下还没解决**的卡点。

### D. 决定下一步（写 →）

每次会话结束 / 阶段结束，至少留一条 `→` 让下次接得上：
```
→ 跑 node tests/codex-patches-followup.js 看是否有回归
→ 问用户：要 push fix/codex-patches-followup 分支并开 PR 吗
→ 写 mcc-fork release notes for v2.5.10
```

## 标准格式（写到 docs/CHANGELOG-DEV.md）

```markdown
# Dev Changelog · 开发实时流水

> Claude 自动维护。倒序：最新在最上面。每条 ≤ 5 行。
> 4 种条目：◇ 需求 ✓ 完成 ⚠ 卡点 → 下一步
> 区别于：git log（已落盘）/ ADR（终态决策）/ SCHEMA（结构）/ mistakes/（bug 根因）

## 2026-04-28

- ✓ v2.5.9 codex patches 6 个 follow-up 修了 (branch: fix/codex-patches-followup, c555baf)
  - hook 静默 skip / TOML [[xx]] / 白名单 Set / uninstaller 自包含 / AGENTS.md 措辞 / require.main 守卫
  - 撤回：git checkout main && git branch -D fix/codex-patches-followup
- ⚠ smoke.js 21 个 SKILL.md frontmatter 失败（CRLF 嫌疑），不阻塞但要查
- → 等用户决定要不要 push 分支并开 PR
- → 跑一遍 codex 实际安装看 follow-up 改动有没有回归

## 2026-04-27

- ◇ 用户问"加减法 within 100"算法 PRD（→ .claude/PRPs/prds/within-100-add-subtract-algorithm.prd.md）
- ✓ 装好 PROJECT_VAULT skill
- → 等用户对 PRD 反馈再实现

## 2026-04-26

- ✓ install.ps1 默认 scope 改 smart（v2.5.9 起，对齐 installer.js）
- ⚠ 老用户裸跑 .\install.ps1 行为变了，会在 cwd 建 PRPs/，下个 release 要在 release notes 提示
```

## 写入规则

### 何时插入新日期段

- 当天第一次写 → 在最顶上插 `## YYYY-MM-DD`
- 同一天后续写 → 追加到当天段顶（保持当天段内也是倒序）

### 何时合并 / 链接

- 5 条以上同主题的 ◇ → 升级成 PRD（`/prd`）+ CHANGELOG 只留一条 ◇ 指向 PRD
- ✓ 多条同主题（多次 commit 完成同一 feature）→ feature 合入主线时，在 CHANGELOG 留一条总结 ✓ + 指向 PR
- ⚠ 解决了 → 不删，改成 `⚠ ~~原文~~ → ✓ <how resolved> 2026-XX-XX`（保留历史，标志解决）
- → 完成了 → 不删，改成 `→ ~~原文~~ → ✓ <done> 2026-XX-XX`

### 何时归档

文件 ≥ 800 行 → 把 30 天前的内容剪到 `docs/CHANGELOG-DEV-archive-YYYY.md`，主文件保留最近 30 天。

## 不写什么（边界）

| 不写到 CHANGELOG-DEV | 写到哪 |
|---|---|
| 表 / 字段定义 | `docs/SCHEMA.md`（database-schema-doc skill） |
| 选型决策的完整论证 | `docs/adr/NNNN-*.md`（architecture-decision-records skill） |
| Bug 根因复盘 | `docs/mistakes/bug-YYYY-MM-DD-*.md`（fix-bug 命令自带） |
| 完整需求 PRD | `.claude/PRPs/prds/*.prd.md`（`/prd` 命令） |
| 实施计划 | `.claude/PRPs/plans/*.md`（`/plan` 命令） |
| API key / 密码 / 服务器 | `.claude/PROJECT_VAULT.md`（project-vault skill） |
| commit message | git commit 自己写 |
| 闲聊 / 客套 | 不写 |

CHANGELOG-DEV 是**入口和速查**，不是细节存放处。每条都是一句话 + 链接到细节文件。

## 与 git log 的差异（关键）

| 维度 | git log | CHANGELOG-DEV.md |
|---|---|---|
| 内容 | 已落盘的代码改动 | **包含**未落盘的需求、想法、卡点 |
| 时间粒度 | commit 时间 | 日级聚合（同一天多事合并显示）|
| 受众 | 代码 reviewer | **当前活跃的开发者**（自己 / 队友）|
| 检索 | git log --grep | 文本搜索，倒序就近读 |
| 删改 | 不可改（amend 是新 commit） | 可改（解决了的 ⚠ 标记，不归档不算改）|

**关键差异**：git log 的 `feat: add user login` 不告诉你"为什么决定加"和"实施时遇到什么坑"。CHANGELOG-DEV 把这些上下文留下来。

## Claude 行为约束

| 约束 | 怎么做 |
|---|---|
| 永远 Edit，不 Write | 用 Edit 在合适位置追加，避免覆盖用户手填内容 |
| 不删除任何条目 | 即便用户撤回需求 / 解决了卡点，原条目保留 + 标记状态 |
| 不写到 git commit message 里就够了的内容 | commit 自己说清的事不在 CHANGELOG 重复（避免噪声） |
| 检测到没有 docs/CHANGELOG-DEV.md | 第一次写时自建 + 加标准 header（见上面格式段） |
| 跨设备同步 | docs/ 进 git，团队共享。机密走 PROJECT_VAULT.md（不进 git） |

## Hook 协作（PostToolUse + Stop）

实施时建议挂 2 个 hook（**初版可以不挂，先靠 Claude 主动接管**）：

### PostToolUse · 检测到代码改动 ≥30 行
跑完 Edit/Write 后，hook 统计 diff 行数 → 提示 Claude "应该写 CHANGELOG-DEV `✓` 条目"。

### Stop · session 结束至少留 →
session 即将结束时，hook 检查今天的 CHANGELOG-DEV 段是否有 `→` 条目 → 没有则提示 Claude 补一条"下一步"。

（这两个 hook 不是 v1 必备，先用对话级激活验证 skill 价值再考虑硬化成 hook。）

## 用户视角的简化

旧办法：开发者每天问"昨天我们聊到哪了？" → Claude 回顾历史 session → 如果上下文丢了就答不上。

**新办法（dev-changelog skill 起）**：
- Claude 在每个关键节点（◇ ✓ ⚠ →）主动写一行 CHANGELOG-DEV
- 用户**不需要**手动写
- 新一天开会话 → 让 Claude `Read docs/CHANGELOG-DEV.md` 顶端 30 行 → 立刻接上昨天

## 引用

- 完整需求 → `.claude/PRPs/prds/`（`/prd` 命令）
- 实施计划 → `.claude/PRPs/plans/`（`/plan` 命令）
- 决策记录 → `docs/adr/`（`architecture-decision-records` skill）
- 数据 schema → `docs/SCHEMA.md`（`database-schema-doc` skill）
- bug 复盘 → `docs/mistakes/`（`/fix-bug` 命令）
- 配置真相 → `.claude/PROJECT_VAULT.md`（`project-vault` skill）

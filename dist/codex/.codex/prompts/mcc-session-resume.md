---
description: "加载最近的 session 文件，展示结构化 briefing（已做什么 / 什么不要重试 / 下一步），等用户确认后继续。"
argument-hint: "[YYYY-MM-DD | path/to/session.tmp]（留空则加载最新）"
---

# Resume Session

**Input**: $ARGUMENTS

## 核心价值

开启一个新 session 时，通过读上次 `mcc-session-save` prompt 存的文件，把 Claude 的上下文完整恢复：已经做了什么、哪些方法已经试过且失败（关键）、下一步具体做什么。**不自动动手**——展示 briefing 等用户确认。

## 何时用

- 新一天继续之前的工作
- 因 context limit 开新 session
- 拿到别人给的 session 文件（直接传路径）
- 任何想让 Claude 完全吸收历史上下文再动手的场合

## 用法

```
`mcc-session-resume` prompt
  # 加载 ~/.claude/session-data/ 最新 *-session.tmp

`mcc-session-resume` prompt 2024-01-15
  # 加载该日期最新的那份

`mcc-session-resume` prompt ~/.claude/session-data/2024-01-15-abc123de-session.tmp
  # 加载指定文件
```

---

## Process

### Step 1 — 找 session 文件

**无参数**：
1. 检查 `~/.claude/session-data/`
2. 挑最后修改的 `*-session.tmp`
3. 无文件时告诉用户：
   ```
   No session files found in ~/.claude/session-data/
   Run `mcc-session-save` prompt at the end of a session to create one.
   ```
   然后停。

**有参数**：
- 日期格式（`YYYY-MM-DD`）→ 在 `~/.claude/session-data/` 找 `YYYY-MM-DD-{shortid}-session.tmp`，取最后修改那份
- 文件路径 → 直接读
- 找不到 → 明确报告后停

### Step 2 — 完整读文件

读整个文件。**先不要做摘要**。

### Step 3 — 结构化 briefing

按此**固定格式**回复：

```
SESSION LOADED: [resolved path]
════════════════════════════════════════════════

PROJECT: [项目名 / 主题]

WHAT WE'RE BUILDING:
[用你自己的话 2-3 句复述]

CURRENT STATE:
✅ Working: [count] items confirmed
🔧 In Progress: [list]
⏳ Not Started: [list]

WHAT NOT TO RETRY:
[每个失败方案及其原因——关键]

OPEN QUESTIONS / BLOCKERS:
[挂起问题 / 依赖]

NEXT STEP:
[文件里定义的 exact next step]
[若未定义: "No next step defined — recommend reviewing 'What Has NOT Been Tried Yet' together before starting"]

════════════════════════════════════════════════
Ready to continue. What would you like to do?
```

### Step 4 — 等用户

**不要**自动动手。**不要**碰任何文件。等用户说下一步。

若文件里定义了明确的 Next Step 且用户说"continue"/"yes"之类 → 按 exact next step 执行。

若无 next step → 问用户从哪里开始，可从 "What Has NOT Been Tried Yet" 里建议。

---

## 边界情况

**同日多个 session 文件**：
加载最后修改的那份（不管是哪种命名格式）。

**session 引用的文件已不存在**：
在 briefing 里标注："⚠ `path/to/file.ts` 在 session 中提到但磁盘上找不到"。

**session 已超过 7 天**：
提醒"⚠ 此 session 来自 N 天前（阈值 7 天），代码可能已变"。然后正常继续。

**用户直接传文件路径**（例：团队成员转发）：
读并走同样 briefing 流程。格式与来源无关。

**session 文件空或损坏**：
报告"Session file found but appears empty or unreadable. 需要用 `mcc-session-save` prompt 新建一份。"

---

## Example Briefing（简化）

```
SESSION LOADED: /Users/you/.claude/session-data/2024-01-15-abc123de-session.tmp
════════════════════════════════════════════════

PROJECT: my-app — JWT Authentication

WHAT WE'RE BUILDING:
用 JWT + httpOnly cookie 实现 Next.js app 用户认证。
register 和 login endpoint 部分完成。middleware 路由保护未开始。

CURRENT STATE:
✅ Working: 3 items (register endpoint, JWT generation, password hashing)
🔧 In Progress: app/api/auth/login/route.ts (token 工作、cookie 还没设)
⏳ Not Started: middleware.ts, app/login/page.tsx

WHAT NOT TO RETRY:
❌ Next-Auth — 与自建 Prisma adapter 冲突，每次请求抛 adapter 错误
❌ localStorage 存 JWT — 引起 SSR hydration mismatch，与 Next.js 不兼容

OPEN QUESTIONS / BLOCKERS:
- cookies().set() 在 Route Handler 能用还是只能 Server Action？

NEXT STEP:
在 app/api/auth/login/route.ts 用
cookies().set('token', jwt, { httpOnly: true, secure: true, sameSite: 'strict' })
设 cookie，然后 Postman 验证 Set-Cookie header。

════════════════════════════════════════════════
Ready to continue. What would you like to do?
```

---

## 规则

- 加载时**绝不修改** session 文件——它是只读历史记录
- briefing 格式固定，即使某节为空也不要省——"What Not To Retry" 尤其不能省
- 恢复后，用户可能要 `mcc-session-save` prompt 在新 session 结尾再存一份新的

## 与其他命令的关系

- 上游：`mcc-session-save` prompt（产出文件）
- 并行：`mcc-learn` prompt（session 内学到的沉淀 skill）
- 加载完可直接接 `mcc-implement` prompt / `mcc-tdd` prompt / 其他具体工作命令

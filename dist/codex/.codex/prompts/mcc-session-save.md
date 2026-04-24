---
description: "把当前 session 的已验证成果、失败路线、下一步 exact action 写入带日期的 session 文件，供 /session-resume 恢复。"
argument-hint: "(无参数)"
---

# Save Session

## 核心价值

把当前 session 发生的所有事（做了什么、哪些验证过、哪些失败、下一步做什么）一次性写进一份带日期的文件，让下一个 session 能在零额外解释的前提下继续。

**最有价值的字段不是"做了什么"，是"哪些方法已经试过且失败了"**——否则下次会白白重试。

## 何时用

- 工作 session 结束、准备关 Claude Code 前
- 即将达到 context limit（先 save，再开新 session）
- 解完一个复杂问题、想记住它
- 任何时候需要把上下文交接给未来的自己

## Process

### Step 1 — 收集上下文

开写前：
- 读本 session 修改过的所有文件（`git diff` 或从对话里回溯）
- 回顾讨论过、尝试过、决策过的内容
- 记遇到的错误及是否解决
- 检查 test / build 状态（若相关）

### Step 2 — 准备目录

```bash
mkdir -p ~/.claude/session-data
```

### Step 3 — 写文件

文件名：`~/.claude/session-data/YYYY-MM-DD-{shortid}-session.tmp`

- **日期**：今天实际日期
- **shortid**：小写字母数字和连字符，8 字符起（避免同日碰撞）
- 合法示例：`abc123de`, `a1b2c3d4`, `frontend-worktree-1`
- 同一天多个 session 用不同 shortid 区分

### Step 4 — 填完整模板

每一节都诚实填。**没内容写 "Nothing yet" 或 "N/A"——不要省略段落**。残缺的文件比诚实空着更坏。

### Step 5 — 展示给用户

写完后把完整内容展示给用户：

```
Session saved to [path]

Does this look accurate? Anything to correct or add before we close?
```

等确认、按需修改。

---

## Session 文件格式

```markdown
# Session: YYYY-MM-DD

**Started:** [approximate time]
**Last Updated:** [current time]
**Project:** [name or path]
**Topic:** [one-line summary]

---

## What We Are Building

[1-3 段描述 feature / bug fix / task。给零记忆的人也能理解目标：做什么、为什么、如何融入大系统]

---

## What WORKED (with evidence)

[**只列确认工作的**。每条附 WHY——测试过、浏览器跑过、Postman 200、等。无证据挪到 "Not Tried Yet"]

- **[thing that works]** — confirmed by: [specific evidence]

如无：`"Nothing confirmed working yet — all approaches still in progress or untested."`

---

## What Did NOT Work (and why)

[**最重要的一节**。每条记精确失败原因，让未来不会重试。"threw X error because Y" 有用，"didn't work" 无用]

- **[approach]** — failed because: [exact reason / error message]

如无：`"No failed approaches yet."`

---

## What Has NOT Been Tried Yet

[看起来有希望但还没试的方案。具体到可执行]

- [approach / idea]

如无：`"No specific untried approaches identified."`

---

## Current State of Files

| File              | Status         | Notes                 |
| ----------------- | -------------- | --------------------- |
| `path/to/file.ts` | Complete       | [what it does]        |
| `path/to/file.ts` | In Progress    | [done / left]         |
| `path/to/file.ts` | Broken         | [what's wrong]        |
| `path/to/file.ts` | Not Started    | [planned / untouched] |

如无：`"No files modified this session."`

---

## Decisions Made

[架构选择、接受的 tradeoff、选定的方案——避免下一 session 反复推翻]

- **[decision]** — reason: [why chosen over alternatives]

如无：`"No major decisions made this session."`

---

## Blockers & Open Questions

[未解决、需要下一 session 处理的事；挂起问题；外部依赖]

- [blocker / question]

如无：`"No active blockers."`

---

## Exact Next Step

[若已知：resume 时做的**第一件事**，精确到"无需思考就能开始"]

[若未知：`"Next step not determined — review 'What Has NOT Been Tried Yet' and 'Blockers' sections before starting."`]

---

## Environment & Setup Notes

[仅当相关填——跑项目的命令、env var、要起的服务。标准 setup 就省略]

[若无：整节省略]
```

---

## 规则集合（合并在 Process 里，不再单列 Notes 段）

- 每个 session 一个独立文件——**永远不要追加**到上个 session
- "What Did NOT Work" 是最关键的一节——没它下一 session 会盲目重试
- 用户在 session 中途要求保存时，保存当前已知内容并明确标 in-progress
- 文件是只读历史——下一 session 通过 `/session-resume` 读，不改它
- 用标准全局路径：`~/.claude/session-data/`
- 新文件一律用 shortid 命名（`YYYY-MM-DD-{shortid}-session.tmp`）

---

## Example（简化）

```markdown
# Session: 2024-01-15

**Started:** ~2pm
**Last Updated:** 5:30pm
**Project:** my-app
**Topic:** Building JWT auth with httpOnly cookies

## What We Are Building
Next.js app 的用户认证系统：register + JWT via httpOnly cookie + middleware 路由保护。
目标是刷新后 session 持续，且 JS 拿不到 token。

## What WORKED (with evidence)
- **`/api/auth/register`** — confirmed by: Postman POST 200 + Supabase 可见记录 + bcrypt 正确
- **JWT 生成 `lib/auth.ts`** — confirmed by: `npm test auth.test.ts` 绿 + jwt.io 解码正确

## What Did NOT Work (and why)
- **Next-Auth 库** — 与自建 Prisma adapter 冲突，每次请求抛 "Cannot use adapter with credentials provider" 错误。放弃——太硬套
- **JWT 存 localStorage** — SSR 渲染在 localStorage 可用前，引起 hydration mismatch。架构性不兼容 Next.js SSR

## What Has NOT Been Tried Yet
- JWT 作为 httpOnly cookie 在 login route response 设置（最可能方案）
- `cookies()` from `next/headers` 在 Server Component 里读 token
- `middleware.ts` 检查 cookie 存在

## Exact Next Step
在 `app/api/auth/login/route.ts`，JWT 生成后用
`cookies().set('token', jwt, { httpOnly: true, secure: true, sameSite: 'strict' })`
设 cookie。然后 Postman 测 response 是否含 `Set-Cookie` header。
```

---

## 与其他命令的关系

- 下一个 session：`/session-resume` 读最新文件
- session 中产出的可复用 pattern：`/learn` 转成 learned skill
- 使用 worktree 并行工作时，每个 worktree 单独 session，shortid 带 worktree 名避免混淆

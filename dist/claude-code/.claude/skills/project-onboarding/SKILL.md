---
name: project-onboarding
description: "接手已有项目（brownfield）的 4 阶段方法论：Reconnaissance → Architecture Mapping → Convention Detection → Output。触发：用户说'刚 clone 一个老项目 / 怎么接手 / 帮我理解这个代码库 / 我不熟这个项目 / 从哪儿开始'，或 Claude 看到一个明显非空的项目（src/ 满 + 没有 .claude/PRPs/）但用户没敲 /onboard 时主动提议。/onboard 命令是本 skill 的显式入口。"
---

# Project Onboarding · 接手已有项目方法论

让 Claude **快速、结构化** 地理解一个已有代码库，产出一份"接手报告 + ≤100 行 CLAUDE.md"，让后续工作有基线。

**借鉴**：affaan-m/ECC 的 4 阶段 codebase-onboarding · SuperClaude `/sc:index-repo` 的 token 节省思路 · wshobson 的多维并行扫描。**避免**：Superpowers 的隐式触发（用户不知道发生了什么）。

---

## 何时激活

- 用户问"刚 clone 这个项目 / 怎么接手 / 我不熟这个代码库 / 从哪开始"
- `/onboard` 命令显式触发
- Claude 看到 `src/` / `app/` / `lib/` 等满目录，但 `.claude/PRPs/` 全空且无 `CLAUDE.md` → **主动提议** `/onboard`（不要直接跑）
- 用户对话 5 轮以上仍在问这个项目的基础概念（架构 / 入口 / 约定）→ 主动提议

**不要激活**：
- 全新项目（空目录）→ 用 `/init` 即可
- 已有 `CLAUDE.md` 且 < 7 天前更新 → 信任已有
- 用户明确说"不要搞流程，直接做 X"

---

## 4 阶段流程（核心方法论）

每阶段都给"必做 / 可选 / 输出"三段。**默认全跑 4 阶段**；用户说"快速看一眼"→ 只跑 Phase 1 + Phase 4 简化版。

---

### Phase 1 · Reconnaissance（侦察） · ~30s · 并行扫

**目的**：5 分钟内回答"这是个什么项目"。

**并行 Glob 扫描**（5 路，一条 message 多 Glob 调用）：

```
⚡ Phase 1 并行侦察（5 路 Glob / 预计 ~30s）
   ├─ 包管理        package.json / pyproject.toml / Cargo.toml / go.mod / pom.xml / Gemfile
   ├─ 入口点        main.py / index.{ts,js} / app.py / server.{ts,js} / __main__.py / cmd/*/main.go
   ├─ 配置文件      *.config.{ts,js,json} / .env.example / docker-compose* / Dockerfile
   ├─ 测试结构      tests/ / __tests__/ / test_*.py / *.test.{ts,js} / *.spec.{ts,js}
   └─ 文档          README* / docs/ / CHANGELOG* / CONTRIBUTING*
```

**回答的问题**（用 Grep 验证关键字段）：
- 主语言（Python / TS / Go / 多语言）
- 主框架（FastAPI / Next.js / Django / Express / 等）
- 包管理器（uv / npm / pnpm / poetry / cargo）
- 测试框架（pytest / vitest / jest）
- 是否容器化（Dockerfile / compose）

**输出**：`recon-summary.md` 草稿（不落盘，进 Phase 2）。

---

### Phase 2 · Architecture Mapping（架构映射） · ~2 min · 并行派 agent

**目的**：理解模块如何组织、数据如何流。

**派发可视化**（v1.9 强制）：

```
⚡ Phase 2 并行架构映射（fan-out / 预计 ~2 min）
   ├─ code-explorer        架构层 / 入口 → 关键文件 / 调用链 / 依赖图
   ├─ backend-architect    （如有后端）服务边界 / contract / 数据流
   └─ database-optimizer   （如涉数据）schema / migration / 查询模式
```

**code-explorer 的 briefing**（必须自包含）：
```
任务：我刚 clone 这个项目，帮我快速摸清架构。
Phase 1 侦察发现：[贴 recon-summary]
请回答：
1. 入口点（HTTP / CLI / cron）的具体文件和行
2. 关键模块（按依赖度排序前 5 个）
3. 数据流（从入口到最深的外部调用，画 1 条主链路）
4. 架构模式（layered / hexagonal / DDD / 等）
5. 跨模块的关键 abstraction（DI 容器 / event bus / repository 等）
约束：只读，不改任何代码。返回 ≤300 行的报告。
```

**返回后合流**：

```
✓ Phase 2 完成（X.X min · 主 max）
   ├─ code-explorer       X.X min → 入口 N 处 / 关键模块 5 个 / 调用链 1 条
   ├─ backend-architect   X.X min → 服务边界清晰 / 发现 N 个边界违例
   └─ database-optimizer  X.X min → 含 N 张表 / N 个 migration / 发现 N 处 N+1 风险
```

**Timeout 降级（v2.0.1 加）**：每个 agent 心里设 5 min 软超时。如果某个 agent 5 min 还没回来：
- 主 session **不等**——用已返回的 agent 结果先合流
- 缺失维度记录在 onboard 报告的"未完成扫描"段，建议用户后续手动跑（如 `database-optimizer` 卡住 → 报告里说"DB 层未扫，建议后续 /fix-bug 触发"）
- 不要重派同一 agent（卡的原因通常是项目大，重派也会卡）

---

### Phase 3 · Convention Detection（规范检测） · ~1 min · 并行扫

**目的**：理解"这个团队的代码长啥样"，避免新写的代码风格不一致。

**并行扫**：

```
⚡ Phase 3 并行规范检测（4 路 / 预计 ~1 min）
   ├─ 命名约定      Grep 函数 / 类 / 文件命名模式（snake_case / camelCase / PascalCase 比例）
   ├─ 错误处理模式  Grep try-except / try-catch / Result 类 / 自定义 Exception 类
   ├─ 测试模式      Read 1-2 个测试文件 → AAA / fixture / mock 风格
   └─ git 约定      git log --pretty='%s' -50 → conventional commits / 自由 / 团队前缀
```

**只产出"团队的实际做法"，不评判好坏**——如果发现反模式，记到"风险信号"里供后续 review。

---

### Phase 4 · Output（产出） · ~1 min · 落盘

**派发可视化**（v1.9 强制 · phase 末尾也保留 ⚡/✓ 符号）：

```
⚡ Phase 4 落盘产物（顺序写 2 文件 / ~1 min）
   ├─ .claude/PRPs/onboarding/{date}-onboard-report.md   详细报告（无行数限制）
   └─ CLAUDE.md（≤100 行 · 强制截断）                   每次 session 自动加载
```

**强制行数校验**（避免 CLAUDE.md 超长 = 没人读）：

```bash
# 写完 CLAUDE.md 后立即校验
lines=$(wc -l < CLAUDE.md)
if [ "$lines" -gt 100 ]; then
  echo "⚠ CLAUDE.md 超过 100 行（$lines 行）→ 必须删减"
  echo "建议删除顺序：1) 已知风险 2) 接手后第一件事 3) 不要做"
  # Claude 必须重写一次直到 ≤100 行
fi
```

返回后：

```
✓ Phase 4 完成（X.X min）
   ├─ onboard-report.md  写入 .claude/PRPs/onboarding/  N 行
   └─ CLAUDE.md          写入项目根                    N 行（≤100 强制 ✓）
```

**关键纪律**（借鉴 ECC 经验）：**CLAUDE.md ≤ 100 行**。信息密度高，不冗余。Detail 进 onboard 报告。

**两个产物**：

#### 4.1 Onboard 报告（详细版）

落盘 `.claude/PRPs/onboarding/{YYYY-MM-DD}-onboard-report.md`，结构：

```markdown
# {项目名} · Onboarding Report

**Date**: {YYYY-MM-DD}
**Onboard 用时**: ~X min（5 路侦察 + 3 agent 架构映射 + 4 路规范检测）

## TL;DR
{3 句话总结：这是什么 / 用什么栈 / 关键风险}

## 栈
- 主语言：...
- 主框架：...
- 包管理：...
- 测试：...
- 容器化：...

## 入口点
- HTTP: src/api/main.py:42 (FastAPI app factory)
- CLI:  src/cli/__main__.py
- Worker: ...

## 关键模块（按依赖度）
1. src/auth/  — 15 处被 import
2. src/llm/   — 12 处
3. src/db/    — 40+ 处（核心）
...

## 数据流（主链路）
入口 → 路由 → service → repository → DB
（1 条最常见的链，不画完整 graph）

## 架构模式
{layered / hexagonal / DDD / etc.} + 1-2 句证据

## 团队约定（实际做法）
- 命名：{snake / camel / Pascal 比例}
- 错误处理：{自定义 DomainError / bare except / etc.}
- 测试：{AAA / fixture 风格}
- git：{conventional / freeform}

## 危险信号（需后续 follow up）
- 🔴 CRITICAL: ...（影响安全 / 数据完整）
- 🟡 HIGH: ...（影响维护性）
- 🟢 INFO: ...（值得知道）

## 建议下一步
1. 如有 CRITICAL → /fix-bug "..."
2. 用 /plan 启动改造时优先读哪几个文件（mandatory reading 前置参考）
3. 跑 `help` 看当前阶段 / 跑 `/index-repo` 生成索引

## Mandatory Reading（接手后真要读的 5 个文件）
1. {file}：为什么读它
2. ...
```

#### 4.2 CLAUDE.md（≤100 行 · 项目根 · 给 Claude 每次 session 看）

```markdown
# CLAUDE.md

> 由 MCC `/onboard` 在 {YYYY-MM-DD} 自动生成。详细 onboard 报告见 `.claude/PRPs/onboarding/`。

## 项目速览

**{项目名}** · {一句话定位（"FastAPI + pgvector 的 RAG 应用"）}

- 主栈：{Python 3.12 + FastAPI 0.110 + Postgres + pgvector + Next 14}
- 包管理：uv（不要用 pip / poetry）
- 测试：pytest + pytest-asyncio
- Lint：ruff
- 容器：docker compose（dev only）

## 入口

- HTTP: `src/api/main.py:42`
- CLI:  `src/cli/__main__.py`

## 关键模块

- `src/auth/`     认证 / JWT
- `src/llm/`      LLM 集成（Anthropic + OpenAI fallback）
- `src/db/`       数据访问（SQLAlchemy 2.0 async）
- `src/rag/`      向量检索 + 生成

## 团队约定

- Python: snake_case 函数 / PascalCase 类 / `_underscore` 模块私有
- TypeScript: camelCase 函数 / PascalCase 类型 / 文件名 PascalCase 给组件、kebab-case 给其他
- 错误：自定义 `DomainError` 基类 + Pydantic 校验异常自然抛
- 测试：AAA 结构 / 函数名 `test_<行为>_when_<条件>`
- Git：conventional commits（`feat:` / `fix:` / `docs:` ...）

## 已知风险

- 🔴 src/auth/jwt.py:23 — JWT secret 16 字节（应 ≥32）
- 🟡 src/db/queries.py — 8 处 raw SQL 字符串拼接（SQL 注入风险）

## 接手后第一件事

1. 读 mandatory reading 5 个文件（见 `.claude/PRPs/onboarding/...`）
2. 跑 `help` 看流程
3. 修上面 🔴 项再启动新 feature

## 不要做

- 改 `src/db/migrations/` 历史文件（按 alembic 写新 migration）
- 改 `src/llm/prompts/` 不经 PR review
```

**总长度目标 80-100 行**。超 100 行删 "已知风险" 之外的次要信息。

---

## 派发姿势

整个流程**主 session 串行 4 phase**（每个 phase 内部并行）：

```
Phase 1（5 路并行 Glob，~30s）
    ↓ 主 session 整合 → recon summary
Phase 2（3 agent 并行 Task，~2 min）
    ↓ 主 session 整合 → architecture mapping
Phase 3（4 路并行 Grep，~1 min）
    ↓ 主 session 整合 → conventions
Phase 4（写 2 个文件，~1 min）
```

**总耗时 ~5 min**。串行多次并行（接力模式 B + 模式 A 嵌套），不要把 Phase 2 和 Phase 1 并行（Phase 2 依赖 Phase 1 的 recon）。

---

## 失败模式与降级

**情况 A：Phase 1 没找到包管理文件**
→ 这可能是 monorepo 子目录或非代码仓库。问用户："看起来不像主流语言项目，你想 onboard 哪个子目录？"

**情况 B：Phase 2 code-explorer 返回 "代码太大无法概览"**
→ 让 code-explorer 只看顶层 + 抽样 3 个最大文件，不强求覆盖全。

**情况 C：项目超大（>10k 文件）**
→ 跳过 Phase 2 的 code-explorer，改用 `git ls-files | head -200` 抽样 + 让用户指定关注的子目录。

**情况 D：用户中途打断"够了我自己看"**
→ 立即停。已经收集的信息写到 partial-onboard.md，给用户一个明确的"已扫范围"+"未扫范围"清单。

---

## 与其他 skill / 命令的协作

- 上游：`/onboard` 命令是本 skill 的显式入口；`/init` 在已有项目时建议跑 `/onboard`
- 下游：onboard 完成后，可联动 `/index-repo` 生成 token-efficient 索引（适合大型项目反复访问）
- 协同：onboard 报告里如有 🔴 CRITICAL → 直接 `/fix-bug` 接力；如要启动新 feature → `/plan` 时把 onboard 报告作为 mandatory reading 前置
- 相关：`code-explorer` agent（Phase 2 主力）/ `code-review-workflow` skill（如发现可疑代码立即审）

---

## 反模式（不要做）

- ❌ 不告知用户就跑 4 阶段（隐式触发） → **必须**在派发前输出"⚡ 4 阶段 onboard 开始" 让用户知道
- ❌ CLAUDE.md 写 300 行（信息低密度）→ ECC 验证 100 行最佳
- ❌ Phase 之间不整合就直接进下一阶段 → 主 session 必须在每 phase 末尾压摘要
- ❌ 把 onboard 报告原样贴回主 session → 用 4 合流动作压成摘要
- ❌ 把已知规范当 lint warning 骂用户 → 这是别人的项目，先理解再改

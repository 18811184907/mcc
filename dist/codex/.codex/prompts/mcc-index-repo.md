---
description: "为大型项目生成 token-efficient 索引（PROJECT_INDEX.md + .json）。~2K tokens 一次投入，每 session 省 ~10-15K tokens（文件定位 / subagent briefing），多次 session 摊平 ROI 5-7x。适合 >1k 文件、反复访问的项目。"
argument-hint: "[--refresh | --json-only | --md-only]"
---

# Index Repo · 生成 token-efficient 项目索引

**Input**: `$ARGUMENTS`：
- `--refresh` — 强制重新生成（默认：若 7 天内有 INDEX 则提示是否覆盖）
- `--json-only` / `--md-only` — 只生成机读 / 人读版本（默认两个都生成）

## 核心价值

借鉴 SuperClaude `/sc:index-repo` 思路。**ROI 数字按真实开发场景诚实评估**（不抄营销数字）：

| 场景 | 不带索引 | 带 PROJECT_INDEX | 节省 |
|---|---|---|---|
| 文件定位"做 X 的在哪" | Grep + ls + 抽样 read | 查 INDEX 直跳 | ~5-10K |
| 给 subagent 写 briefing 上下文 | 列大量文件名 + 部分内容 | 贴 INDEX 片段 | ~5-10K |
| Claude 起手"这是啥项目" | 抽样读多文件 | 读 INDEX 头部 | ~2-5K |

**真实 ROI**：
- 投入：**~2K tokens**（5 路 Glob + 提取导出名 + 合流）
- 单次节省：**~10-15K tokens / session**（**不是 50K+**——那种数字假设"完全不读源码"，但开发还是要跳进文件读）
- 回本点：**1-2 个 session** 后净赚
- **5 个 session 后 ROI ~5-7x**

**适合**：>1k 文件、反复访问 >5 次的项目。
**不适合**：<200 文件的小项目（overhead > 收益）；只看一眼试试的；纯文档仓库。

---

## 何时跑

✅ **应跑**：
- onboard 完成后，发现是大项目（>1k 文件 / >50k LOC）
- 反复在同一项目工作（每天都开 Claude Code）
- 派 subagent 频繁，需给精确上下文

❌ **不跑**：
- 小项目（<200 文件）—— overhead 大于收益
- 7 天内已生成 INDEX 且无大改动
- 只是看一眼试一下的项目

---

## 执行流程

### Phase 1 — 前置检查

```bash
# 项目大小评估
file_count=$(git ls-files 2>/dev/null | wc -l || find . -type f -not -path './.git/*' -not -path './node_modules/*' | wc -l)

if [ "$file_count" -lt 200 ]; then
  echo "项目只 $file_count 文件，建议直接看 CLAUDE.md，不用 INDEX"
  echo "继续？(y/N)"
fi

# 已有 INDEX？
if [ -f PROJECT_INDEX.md ] && find PROJECT_INDEX.md -mtime -7 | grep -q .; then
  echo "PROJECT_INDEX.md 7 天内更新过。强制重新生成？(y/N)"
fi
```

### Phase 2 — 5 路并行 Glob 扫描

**派发可视化**（v1.9 强制）：

```
⚡ 5 路并行索引扫描（fan-out / 预计 ~1 min）
   ├─ 代码结构    src/**/*.{ts,tsx,py,go,rs} 按目录聚合 + 大小排序
   ├─ 文档        README* / docs/**/*.md / CHANGELOG*
   ├─ 配置        *.config.* / .env.example / Dockerfile / docker-compose*
   ├─ 测试        tests/ / __tests__/ / *.test.* / *.spec.*
   └─ 脚本        scripts/ / Makefile / justfile / package.json scripts
```

每路用 Glob 拿文件清单，再用 Grep 抽取关键字段（function 名 / class 名 / export 名）。

### Phase 3 — 合流生成两个产物

#### `PROJECT_INDEX.md`（人读 · ~3KB）

```markdown
# {项目名} · Project Index

> 自动生成于 {YYYY-MM-DD}。下次 Claude session 应优先读这份索引而非全代码。

## 概览
- 总文件数：{N}
- 主语言：{Python 60% / TS 30% / SQL 10%}
- 总 LOC：{N}

## 目录结构（按依赖度倒序）
- `src/auth/` — 认证 ({N} 文件 / {N} LOC) — 被 15 处 import
- `src/llm/` — LLM 集成 ({N} 文件) — 被 12 处
- `src/db/` — 数据访问 ({N} 文件) — 被 40+ 处
...

## 关键导出（每模块 top 3）
**src/auth/**: `JwtService` / `requireUser` / `hashPassword`
**src/llm/**: `callWithFallback` / `streamResponse` / `Embedder`
...

## 入口点
- `src/api/main.py:42` — FastAPI app factory
- `src/cli/__main__.py:8` — CLI entry
- `src/worker/__main__.py:12` — background worker

## 关键文件（按"应该读懂的优先级"）
1. `src/api/main.py`（入口）
2. `src/auth/jwt.py`（认证）
3. `src/db/session.py`（DB 连接管理）
...

## 配置文件
- `pyproject.toml` — 依赖 + 工具链
- `.env.example` — env 模板
- `docker-compose.yml` — 本地开发栈

## 测试组织
- 框架：pytest + pytest-asyncio
- 位置：`tests/` 镜像 `src/` 结构
- 覆盖率：{N}%（来自 .coverage 报告）

## 不要碰
- `src/db/migrations/`（用 alembic 写新的）
- `src/llm/prompts/`（必须 PR review）
```

#### `PROJECT_INDEX.json`（机读 · ~10KB · 给 subagent 用）

```json
{
  "version": "1.0",
  "generated_at": "2026-04-25",
  "stats": { "files": 1234, "loc": 56789, "languages": {"python": 0.6, "typescript": 0.3, "sql": 0.1} },
  "modules": [
    {
      "path": "src/auth",
      "files": 8,
      "loc": 1234,
      "imported_by_count": 15,
      "key_exports": ["JwtService", "requireUser", "hashPassword"],
      "entry_files": ["src/auth/__init__.py", "src/auth/jwt.py"]
    }
  ],
  "entry_points": [
    { "type": "http", "file": "src/api/main.py", "line": 42, "framework": "fastapi" },
    { "type": "cli", "file": "src/cli/__main__.py", "line": 8 }
  ],
  "key_files_by_priority": ["src/api/main.py", "src/auth/jwt.py", "src/db/session.py"],
  "do_not_touch": ["src/db/migrations/", "src/llm/prompts/"]
}
```

### Phase 4 — 写 .gitignore 提示

如果用户 .gitignore 没排除 INDEX，提议加（部分团队希望 INDEX 进 git，部分希望本地 only）：

```bash
echo "PROJECT_INDEX.{md,json} 是要进 git 还是仅本地？"
echo "  进 git → 让团队成员共享 → 不改 .gitignore"
echo "  仅本地 → 加到 .gitignore"
```

---

## 与其他命令 / skill 的关系

- **上游**：`/onboard` 完成后建议跑（大项目场景）
- **下游**：subagent 派发时主 session 把 INDEX 片段贴进 briefing，节省 token
- **联动 `help` skill**：用户问"项目有多大 / 这做啥的"时 help skill 可以读 INDEX 给摘要

## 禁止

- ❌ 把每个文件都列出来（变成 100KB 的索引 = 没用）
- ❌ 索引超 5KB.md / 20KB.json（与"token 节省"目标背道而驰）
- ❌ 不更新就用旧索引（>14 天提示用户 refresh）
- ❌ 没 sanity check 就生成（小项目 = 不该跑）

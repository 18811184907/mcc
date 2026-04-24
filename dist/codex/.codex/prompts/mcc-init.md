---
description: "为项目初始化 MCC：探测栈 + 生成 CLAUDE.md。空项目走轻量初始化；已有大项目（src/ 满）自动建议跑 /onboard 做 4 阶段深度接手。"
argument-hint: (无参数)
---

# Init Project

为当前目录初始化 MCC 协作基线。**根据项目大小路由两种模式**：

- **空项目 / 极小项目** → 本命令（轻量 CLAUDE.md，~30 行）
- **已有项目（src/ 有内容、>50 文件）** → 建议转 `/onboard`（4 阶段深度，产出详细报告 + ≤100 行 CLAUDE.md）

## Phase 0 — 检查 + 路由

```bash
# 1. 已有 CLAUDE.md？
if [ -f CLAUDE.md ]; then
  echo "CLAUDE.md 已存在。"
  echo "  - 改为补充模式（在已有内容上加缺失项）"
  echo "  - 或跑 /onboard 重新做完整 4 阶段（推荐项目有变化时）"
  echo "继续？(y/N)"
fi

# 2. 这是空项目还是已有项目？
# 优先用 git ls-files（自动尊重 .gitignore，跨平台稳定）；fallback 到 find 时排除常见 build/cache 目录
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  file_count=$(git ls-files | wc -l)
else
  file_count=$(find . -type f \
    -not -path './.git/*' \
    -not -path './node_modules/*' \
    -not -path './.claude/*' \
    -not -path './dist/*' \
    -not -path './build/*' \
    -not -path './.next/*' \
    -not -path './.nuxt/*' \
    -not -path './target/*' \
    -not -path './venv/*' \
    -not -path './.venv/*' \
    -not -path './__pycache__/*' \
    -not -path './.pytest_cache/*' \
    -not -path './coverage/*' \
    2>/dev/null | wc -l)
fi
# 检测 src 目录里的实际内容（不只是空目录存在）
has_src=no
for d in src app lib packages; do
  if [ -d "$d" ] && [ "$(ls -A "$d" 2>/dev/null | head -1)" ]; then
    has_src=yes
    break
  fi
done

if [ "$has_src" = "yes" ] && [ "$file_count" -gt 50 ]; then
  echo "检测到已有项目（src/ 等目录有内容，$file_count 个文件）。"
  echo ""
  echo "推荐改用 /onboard——它会做 4 阶段深度接手："
  echo "  Phase 1 并行侦察栈 / 入口 / 配置 / 测试 / 文档 (~30s)"
  echo "  Phase 2 并行派 code-explorer + domain agent 摸架构 (~2 min)"
  echo "  Phase 3 并行扫团队约定 (~1 min)"
  echo "  Phase 4 产出 onboarding 报告 + CLAUDE.md (~1 min)"
  echo ""
  echo "选择: 1) 跑 /onboard（推荐）  2) 仍用本 /init 轻量模式  3) 取消"
  # 等用户选
fi
```

## Phase 1 — 探测项目

读这些文件（存在哪个读哪个）：
- `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` → 确定主语言栈
- `README.md` → 项目定位和目标
- `.gitignore` → 环境结构提示
- 顶层目录结构（`ls -la`）→ 架构风格

如果发现子目录（`src/`, `app/`, `tests/`）读它们的 README（如有）。

## Phase 2 — 提取约定

用 `code-explorer` agent 快速扫描：
- 命名规范（camelCase / snake_case / kebab-case）
- 文件组织（by-feature / by-type / 混合）
- 测试风格（Jest / Vitest / pytest / ...）
- 错误处理模式（try/catch / Result / 其他）
- 是否有 lint/format 配置（.eslintrc / pyproject.toml 的 [tool.ruff]）

不要编造。找不到的写 "TBD"。

## Phase 3 — 产出 CLAUDE.md

使用下方模板，填满每一节。

```markdown
# CLAUDE.md

## 项目定位
[1-2 句]

## 技术栈
- 主语言：[Python 3.12 / TypeScript 5.x / ...]
- 框架：[FastAPI / Next.js / ...]
- 数据库：[...]
- 测试：[...]
- Lint/Format：[ruff / biome / ...]

## 目录结构
```
[tree 关键目录 + 一句话解释]
```

## 编码约定
- 命名：[规则]
- 错误处理：[模式]
- 测试：[命名规则 + 位置]
- 导入：[绝对 / 相对]

## 常用命令
- 安装：`...`
- 开发：`...`
- 测试：`...`
- Lint：`...`
- 构建：`...`

## AI 协作偏好
- **先规划再动手**：让 planner agent 出方案，用户确认再写代码
- **小步骤勤验证**：每写一个文件就让它跑起来
- **禁止瞎猜**：不确定就 grep、read，不要"应该是这样"
- **中文沟通**：技术术语保留英文

## 已知陷阱
[如有]

## 相关文档
[README / CONTRIBUTING / 其他]
```

## Phase 4 — 汇报

```
✓ CLAUDE.md 初始化完成（轻量模式）

- 栈：[探测到的]
- 约定：[提取的]
- TBD 项：[你要补的]

建议下一步：
1. 审阅并补充 TBD 项
2. 已有项目想要更深度接手 → /onboard（4 阶段并行扫，产出详细 onboarding 报告）
3. 大项目反复操作 → /index-repo（生成 PROJECT_INDEX，每 session 省 50K+ tokens）
4. 想做新功能 → /prd（PRD）→ /plan → /implement
```

## 与 onboard 的分工

| 命令 | 适合场景 | 耗时 | 产出 |
|---|---|---|---|
| `/init` | 空项目 / 小项目 / 第一次开 Claude Code | ~1 min | CLAUDE.md（轻量 ~30 行） |
| `/onboard` | 已有大项目 / brownfield / 接手陌生代码库 | ~5 min | onboarding 报告（详细）+ CLAUDE.md（≤100 行） |
| `/index-repo` | 大项目（>1k 文件）反复操作 | ~1 min | PROJECT_INDEX.md + .json（token 节省） |

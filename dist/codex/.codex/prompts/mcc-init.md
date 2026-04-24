---
description: 为当前项目初始化 CLAUDE.md（如果不存在的话），带栈检测和约定提取
argument-hint: (无参数)
---

# Init Project

为当前目录初始化一份符合本项目风格的 `CLAUDE.md`。

## Phase 0 — 检查

```bash
if [ -f CLAUDE.md ]; then
  # 文件已存在 → 不要覆盖，改为建议补充
  echo "CLAUDE.md 已存在，将产出补充建议"
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
CLAUDE.md 初始化完成

- 栈：[探测到的]
- 约定：[提取的]
- TBD 项：[你要补的]

建议的下一步：
1. 审阅并补充 TBD 项
2. 如项目复杂，用 /prd 写一份初始 PRD
```

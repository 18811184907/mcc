---
paths:
  - "**/*.py"
---
# Python Hooks

> 扩展 [common/hooks.md](../common/hooks.md) 的 Python 特定内容。

## PostToolUse hook（写完 / 改完自动跑）

- **ruff format**（替代 black）+ **ruff check --fix**：格式化 + 自动 lint 修复
- **pyright** 或 **mypy --strict**：类型检查（大项目慢，优先 IDE 实时检查）
- **`print()` warning**：扫改过的 `.py` 文件报告 `print()`（生产代码应用 `structlog`/`logging`）

MCC 默认不装 format + typecheck hook（v1.3 挪到 `_mcc_optional_hooks.stop_format_typecheck_OFF_BY_DEFAULT`），避免大 Python 项目每次 edit 跑 mypy 拖慢。手动启用见 `settings.fragment.json`。

## Stop hook（每次响应结束）

- **`check-console-log`**（默认开）：扫改过的 `.js/.ts/.jsx/.tsx`。Python 项目可自己加 `grep 'print('` stop hook
- **Format + typecheck**（默认关）：小 Python 项目可开

## 自律补充（hook 无法覆盖）

即使没装 hook，养成自律：

- 写完模块前：`uv run ruff check && uv run pyright src/`
- 提交前：`git diff | grep -E "^\+.*print\("`（或用 pre-commit hook）
- 新增依赖：`uv run pip-audit`
- 部署前：pytest 完整跑 + coverage ≥ 80%

## 推荐的 pyproject.toml scripts 最小集

**使用 `uv` 包管理器（推荐）**：

```toml
[project.scripts]
# 直接在 Terminal 跑：uv run lint / uv run test
# 或在 Makefile / justfile 里封装

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "W", "B", "I", "N", "UP", "ANN", "S", "C90"]

[tool.pyright]
strict = ["src/"]
pythonVersion = "3.12"

[tool.pytest.ini_options]
asyncio_mode = "auto"
addopts = "-v --strict-markers --cov=src --cov-fail-under=80"
```

**Makefile**（或 `justfile`）最小集：

```makefile
.PHONY: format lint typecheck test verify

format:
	uv run ruff format .
	uv run ruff check --fix .

lint:
	uv run ruff check .

typecheck:
	uv run pyright src/

test:
	uv run pytest

verify: lint typecheck test
	@echo "✓ 所有闸门通过"
```

`make verify` 是本地版的 verification-loop，上线前必过。

## Pre-commit hook 模板

`.pre-commit-config.yaml`：

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.6.9
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/RobertCraigie/pyright-python
    rev: v1.1.380
    hooks:
      - id: pyright

  - repo: local
    hooks:
      - id: no-print
        name: "no print() in src/"
        entry: grep -rnE "^[^#]*print\(" src/
        language: system
        pass_filenames: false
        # 失败即退出（grep 找到 print 会非 0 退出——符合这里 "禁止 print" 语义）
```

安装：`uv run pre-commit install`。以后 `git commit` 会自动跑。

## FastAPI 特有（运行时 hook）

不是 Claude Code hook，是应用级 hook：

```python
from fastapi import FastAPI, Request
from time import perf_counter

app = FastAPI()

@app.middleware("http")
async def log_requests(request: Request, call_next):
    t0 = perf_counter()
    response = await call_next(request)
    ms = round((perf_counter() - t0) * 1000, 2)
    log.info("http_request",
             method=request.method,
             path=request.url.path,
             status=response.status_code,
             latency_ms=ms)
    return response

@app.on_event("startup")
async def startup():
    settings = Settings()  # Pydantic 校验 env
    await init_db()
    log.info("app_started", env=settings.environment)
```

## 引用

- `verification-loop` skill：交付前 6 阶段 gate
- `test-automator` agent：补测试到 80%
- common/hooks.md：跨语言通用 hook 约定

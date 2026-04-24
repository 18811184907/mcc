---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Coding Style

> 扩展 [common/coding-style.md](../common/coding-style.md) 的 Python 特定内容。
> 代码示例教学见 `coding-standards` skill 的 Python section。

## 严格度（pyproject.toml 必开）

```toml
[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "W", "B", "I", "N", "UP", "ANN", "S", "C90"]
# E/W: pycodestyle, F: pyflakes, B: bugbear, I: isort,
# N: pep8-naming, UP: pyupgrade, ANN: annotations, S: bandit, C90: mccabe

[tool.mypy]
python_version = "3.12"
strict = true
warn_unreachable = true
warn_redundant_casts = true
disallow_any_explicit = true
```

不要为了"让它先跑起来"关 strict。大项目打脸时间更贵。

## 类型设计原则

- **所有 public 函数签名必须标类型**（参数 + 返回）
- **禁止 `Any`**；用 `object` / `TypeVar` / `Protocol` / 具体类型
- **Public API 使用 `Protocol`（结构化类型）**，比 ABC 更灵活
- **优先 `Literal["a", "b"]` 联合类型 > Enum**（除非跨语言互操作）
- **Pydantic models 用于系统边界校验**（API 请求响应 / 配置 / 外部数据）

```python
from typing import Protocol, Literal
from pydantic import BaseModel, EmailStr, Field

class UserRepository(Protocol):
    """结构化类型，任何有 .get() / .save() 的类都满足。"""
    def get(self, user_id: str) -> "User | None": ...
    def save(self, user: "User") -> None: ...

class UserInput(BaseModel):
    email: EmailStr
    age: int = Field(ge=0, le=150)
    role: Literal["admin", "member"] = "member"
```

## 不可变性

```python
from dataclasses import dataclass, replace
from typing import NamedTuple

# 值对象用 frozen dataclass 或 NamedTuple
@dataclass(frozen=True, slots=True)
class User:
    id: str
    email: str
    role: str

# 错：就地修改
def promote(u: User) -> User:
    u.role = "admin"  # type error: frozen

# 对：构造新实例
def promote(u: User) -> User:
    return replace(u, role="admin")
```

- `@dataclass(frozen=True, slots=True)`：不可变 + 内存紧凑
- `NamedTuple`：不可变元组 + 字段名
- `tuple[...]` / `frozenset[...]` / `Mapping[...]` 作为参数类型表明"我不修改"

## 错误处理

```python
# 错：bare except 吞所有错
try:
    result = risky()
except:
    return None

# 错：捕获 Exception 不记上下文
try:
    result = risky()
except Exception:
    return None

# 对：只捕预期异常 + 记上下文
import structlog
log = structlog.get_logger()

try:
    result = risky()
except (ValueError, KeyError) as e:
    log.warning("risky_failed", error=str(e), context={"user_id": uid})
    raise DomainError(f"处理失败: {e}") from e
```

- **禁止 bare `except:`** 和 `except Exception: pass`
- **`raise ... from e`** 保留 exception chain
- **在系统边界用 Pydantic 校验**，里面的代码可以信任类型

## 异步

- **async/await 优先**，不要 `asyncio.run_coroutine_threadsafe` 混用（只在跨线程时需要）
- **`asyncio.gather` 并发时注意 `return_exceptions=True`**，否则一个失败全挂
- **`async with` 管理资源**（DB 连接 / HTTP client / 文件）
- **不要 `sync_function()` 在 async 代码里直接调**（阻塞事件循环）；用 `asyncio.to_thread()` 包装

```python
import asyncio, httpx

async def fetch_all(urls: list[str]) -> list[dict]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        results = await asyncio.gather(
            *(client.get(u) for u in urls),
            return_exceptions=True,
        )
        return [
            r.json() if not isinstance(r, Exception) else {"error": str(r)}
            for r in results
        ]
```

## 命名（PEP 8 + 项目惯例）

- **变量/函数**：`snake_case`
- **类 / 类型别名**：`PascalCase`
- **常量**：`UPPER_SNAKE_CASE`
- **模块私有**：`_leading_underscore`
- **Boolean**：`is_` / `has_` / `should_` / `can_` 前缀
- **协议**（Protocol 接口）：不加 `I` 前缀（Python 不用 Java 风格）

## print 调试

**生产代码禁止 `print()`**。用 `structlog` / 标准 `logging`。

```python
# 错
print(f"user={user}")

# 对
log.info("user_loaded", user_id=user.id, role=user.role)
```

MCC 的 `stop:check-console-log` hook 默认扫 JS/TS；Python 项目可在 CI 加 `grep -r "print(" src/ --exclude-dir=tests`。

## 工具链（推荐）

| 用途 | 首选 | 备选 |
|---|---|---|
| 包管理 | **uv**（astral.sh，快） | poetry / pip-tools |
| 格式化 | **ruff format**（替代 black） | black |
| Lint | **ruff**（统一） | flake8 + pylint |
| 类型检查 | **pyright** 或 **mypy --strict** | — |
| 测试 | **pytest**（+ pytest-asyncio） | unittest |
| 运行时 | **Python 3.12+** | — |

**统一 scripts**（pyproject.toml 或 Makefile）：`lint` / `typecheck` / `test` / `verify`。

## FastAPI / Django 特定

- **FastAPI**：所有路由函数用 `response_model=...` 锁契约；dependency injection 代替全局 state
- **Django**：用 `select_related` / `prefetch_related` 避免 N+1；禁止 `QuerySet.all().filter()` 链式在大表上

## AI / LLM 特定（MCC 定位）

- **Prompt 不要硬编在函数内**，用 `PromptTemplate` 类或常量模块
- **LLM 调用必须有超时 + 重试**（tenacity 或手写循环）
- **token 成本埋点**：每次 call 记 `prompt_tokens` / `completion_tokens` / `model` / `latency_ms`
- **响应 JSON parse 必须 try/except**（模型偶尔输出非 JSON）

```python
import json
from tenacity import AsyncRetrying, stop_after_attempt, wait_exponential

async def call_llm(client, messages, model="claude-sonnet-4-6"):
    async for attempt in AsyncRetrying(
        stop=stop_after_attempt(3),
        wait=wait_exponential(min=2, max=30),
        reraise=True,
    ):
        with attempt:
            resp = await client.messages.create(model=model, messages=messages, max_tokens=4096)
            # 埋点
            log.info("llm_call", model=model,
                     input_tokens=resp.usage.input_tokens,
                     output_tokens=resp.usage.output_tokens)
            return resp
```

## 引用

- 完整示例和教学：`coding-standards` skill 的 Python section
- 架构模式：`patterns.md`（本目录）
- 测试：`testing.md`（本目录）
- 安全：`security.md`（本目录）

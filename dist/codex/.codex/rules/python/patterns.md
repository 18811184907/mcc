---
paths:
  - "**/*.py"
---
# Python Patterns

> 扩展 [common/patterns.md](../common/patterns.md) 的 Python 特定内容。

## API 响应信封

```python
from pydantic import BaseModel
from typing import Generic, TypeVar, Literal

T = TypeVar("T")

class ApiOk(BaseModel, Generic[T]):
    ok: Literal[True] = True
    data: T

class ApiError(BaseModel):
    ok: Literal[False] = False
    error: dict  # {"code": str, "message": str, "details": dict | None}

ApiResponse = ApiOk[T] | ApiError  # discriminated union

async def get_user(user_id: str) -> ApiResponse[User]:
    user = await repo.get(user_id)
    if not user:
        return ApiError(error={"code": "NOT_FOUND", "message": "user not found"})
    return ApiOk(data=user)

# 调用方：pattern match 强制处理两种情况
match await get_user(uid):
    case ApiOk(data=user):
        return user
    case ApiError(error=err):
        log.warning("get_user_failed", **err)
        raise HTTPException(404, err["message"])
```

## Repository 模式

```python
from typing import Protocol, Generic, TypeVar

T = TypeVar("T")
ID = TypeVar("ID", bound=str | int)

class Repository(Protocol, Generic[T, ID]):
    async def find_all(self, **filters) -> list[T]: ...
    async def find_by_id(self, id: ID) -> T | None: ...
    async def create(self, data: dict) -> T: ...
    async def update(self, id: ID, data: dict) -> T: ...
    async def delete(self, id: ID) -> None: ...

class SqlAlchemyUserRepository:
    """实现 Repository[User, str]。"""
    def __init__(self, session: AsyncSession):
        self.session = session

    async def find_by_id(self, uid: str) -> User | None:
        result = await self.session.execute(select(User).where(User.id == uid))
        return result.scalar_one_or_none()
```

业务层依赖 `Repository[User, str]` Protocol；测试时用内存实现替换。

## Dependency Injection（FastAPI）

```python
from fastapi import Depends

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

async def get_user_repo(db: AsyncSession = Depends(get_db)) -> UserRepository:
    return SqlAlchemyUserRepository(db)

@app.get("/users/{uid}")
async def read_user(uid: str, repo: UserRepository = Depends(get_user_repo)):
    return await repo.find_by_id(uid)
```

**测试覆盖**：`app.dependency_overrides[get_user_repo] = lambda: in_memory_repo`

## Async Context Manager

```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def transaction(session):
    """事务：退出时 commit / 异常 rollback。"""
    try:
        yield
        await session.commit()
    except Exception:
        await session.rollback()
        raise

async with transaction(session):
    await session.execute(insert_stmt)
    await session.execute(update_stmt)
```

## Decorator Pattern（带类型保留）

```python
from functools import wraps
from typing import Callable, TypeVar, ParamSpec

P = ParamSpec("P")
R = TypeVar("R")

def timed(fn: Callable[P, R]) -> Callable[P, R]:
    @wraps(fn)
    async def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        import time
        t0 = time.perf_counter()
        try:
            return await fn(*args, **kwargs)
        finally:
            elapsed = time.perf_counter() - t0
            log.info("timed", fn=fn.__name__, ms=round(elapsed * 1000, 2))
    return wrapper  # type: ignore

@timed
async def fetch_data(url: str) -> dict:
    ...
```

## 错误边界（FastAPI 全局）

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()

@app.exception_handler(DomainError)
async def domain_error_handler(request: Request, exc: DomainError):
    log.warning("domain_error", path=request.url.path, error=str(exc))
    return JSONResponse(
        status_code=400,
        content={"ok": False, "error": {"code": exc.code, "message": str(exc)}},
    )

@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception):
    log.error("unhandled_error", path=request.url.path, exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"ok": False, "error": {"code": "INTERNAL", "message": "server error"}},
    )
```

## 状态管理

| 层 | 放哪 | 例 |
|---|---|---|
| 请求级 | 局部变量 / FastAPI Depends | 当前请求的 user |
| Session 级 | cookie / Redis | 登录状态 |
| 应用级 | module-level 常量（启动加载，只读） | 配置、路由表 |
| 持久层 | DB | user / order |

**禁止**：module 顶层可变全局变量（`_cache = {}` 跨请求修改）—— 并发竞态 bug 之王。

## 模块边界（package 组织）

```text
src/myapp/
├── features/
│   ├── users/
│   │   ├── __init__.py       # public API only
│   │   ├── models.py
│   │   ├── service.py
│   │   ├── repository.py
│   │   └── _internal.py      # 下划线 = 模块内部
│   └── projects/
├── core/                      # 跨 feature 通用
│   ├── db.py
│   ├── config.py
│   └── logging.py
└── main.py                    # FastAPI app factory
```

**外部只从 `__init__.py` 导入**：

```python
# src/myapp/features/users/__init__.py
from .models import User
from .service import UserService

__all__ = ["User", "UserService"]
```

其他模块：`from myapp.features.users import User, UserService`。禁止 `from myapp.features.users._internal import ...`。

## AI / LLM 应用（MCC 定位）

**Prompt 模板分离**：

```python
# src/myapp/prompts/__init__.py
from textwrap import dedent

SUMMARIZE_SYSTEM = dedent("""
    You are a helpful assistant summarizing technical documents.
    - Output: 3 bullet points
    - Style: concise, no filler
""").strip()

def build_summarize_prompt(doc: str) -> str:
    return f"Summarize this:\n\n{doc}"
```

**RAG pipeline 分层**：

```
src/myapp/rag/
├── embedder.py     # embedding 生成
├── indexer.py      # 向量存储（pgvector / Pinecone / Qdrant）
├── retriever.py    # 检索 + rerank
├── generator.py    # LLM 生成
└── pipeline.py     # 组合 embedder → retriever → generator
```

## 反模式警惕

| 反模式 | 为什么坏 | 改 |
|---|---|---|
| 到处 `Any` | 失去类型安全 | `object` + 类型守卫 或具体类型 |
| 单文件 >800 行 | 难找代码、难 review | 按责任拆 |
| global mutable state | 并发竞态 | Depends 注入 / 请求级 |
| `try: ... except: pass` | 吞掉所有错 | 只 catch 预期异常 |
| sync IO 在 async 代码 | 阻塞 event loop | `asyncio.to_thread` / async 库 |
| 循环里逐条 DB query | N+1 | 批量 / `select` + `IN (...)` |
| `pickle.loads` on untrusted | RCE 风险 | JSON + Pydantic 校验 |

## 引用

- `e2e-testing` skill：Playwright E2E
- `coding-standards` skill：完整代码风格教学
- `code-review-workflow` skill：审查两端流程
- `ai-engineer` / `vector-database-engineer` agent：AI / RAG 实现

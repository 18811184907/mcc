---
name: coding-standards
description: "Python + TypeScript 编码规范带示例教学（命名、文件组织、错误处理、类型设计、测试写法）。触发：写代码时 Claude 按需引用；用户说'代码风格 / 约定 / best practice'时加载对应 section。与 rules/ 分工：rules 是清单（短、强制），本 skill 是带代码示例的教学（长、说服）。冲突以 rules 为准。本文档较长，按需扫读 Python 或 TS section。"
---

# Coding Standards & Best Practices

跨项目的基线编码规范，**带完整代码示例**。

## 与 rules/ 的分工

- `rules/common/coding-style.md`、`rules/python/coding-style.md`、`rules/typescript/coding-style.md` 是**规则清单**——短、精、直接，用于 review checklist
- 本 skill 是**教学版**——每条规则配可运行的代码示例、好坏对比、常见陷阱
- **冲突时以 rules/ 为准**（rules 是标准，skill 是辅助教学）

本 skill 聚焦 Python / React / 通用代码卫生；TS 语法规范、API 设计、后端架构等请查对应 rules 文件。

## 何时启用

- 新项目或新模块启动
- 代码质量审查
- 按约定重构已有代码
- 统一命名 / 格式 / 结构
- 配置 lint / format / type check
- 新人上手编码约定

## 代码质量原则

### 1. Readability First
- 代码被读的次数比被写多
- 清晰的变量名和函数名
- 自解释代码优先于注释
- 一致的格式

### 2. KISS (Keep It Simple, Stupid)
- 跑得通的最简方案
- 别过度工程
- 不做过早优化
- 易懂 > 炫技

### 3. DRY (Don't Repeat Yourself)
- 提取公共逻辑到函数
- 创建可复用组件
- 跨模块共享工具
- 别复制粘贴

### 4. YAGNI (You Aren't Gonna Need It)
- 没用到的功能别写
- 避免投机性抽象
- 只在真有需要时加复杂度
- 先简单，到时候再重构

## Python Standards

### Type Hints 全覆盖

```python
# PASS: 完整类型标注
from collections.abc import Sequence
from typing import Protocol, TypeVar

T = TypeVar("T")

def find_first(items: Sequence[T], predicate: Callable[[T], bool]) -> T | None:
    for item in items:
        if predicate(item):
            return item
    return None


class SupportsClose(Protocol):
    def close(self) -> None: ...


def safe_close(resource: SupportsClose) -> None:
    resource.close()


# FAIL: 无类型标注
def find_first(items, predicate):
    for item in items:
        if predicate(item):
            return item
    return None
```

**规范：**
- 公共 API 函数/方法 100% 带类型
- 用 `X | None` 而不是 `Optional[X]`（Python 3.10+）
- 集合参数用 `collections.abc.Sequence/Mapping/Iterable`，不用具体 `list/dict`
- 用 `Protocol` 做结构化 typing（替代 ABC，契合 duck typing）

### Dataclass vs Pydantic 选择

```python
# Dataclass：内部纯数据容器，无外部输入校验需求
from dataclasses import dataclass

@dataclass(frozen=True, slots=True)
class CacheEntry:
    key: str
    value: bytes
    ttl_seconds: int


# Pydantic：系统边界（API 输入、配置文件、LLM 返回值）
from pydantic import BaseModel, Field, field_validator

class ChatRequest(BaseModel):
    messages: list[dict[str, str]] = Field(..., min_length=1)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=1024, gt=0, le=4096)

    @field_validator("messages")
    @classmethod
    def validate_roles(cls, v: list[dict[str, str]]) -> list[dict[str, str]]:
        allowed = {"system", "user", "assistant"}
        for msg in v:
            if msg.get("role") not in allowed:
                raise ValueError(f"Invalid role: {msg.get('role')}")
        return v
```

**决策规则：**
- 数据进出系统边界（HTTP / CLI / 文件 / LLM 返回）→ **Pydantic**
- 内部 DTO、缓存项、事件对象 → **Dataclass**（`frozen=True, slots=True` 不可变 + 省内存）
- 禁止手写 `__init__`、`__eq__`、`__hash__`——dataclass 全搞定

### 窄化异常处理

```python
# PASS: 窄化 except，保留堆栈
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

def load_config(path: Path) -> dict:
    try:
        content = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        logger.warning("Config not found, using defaults: %s", path)
        return {}
    except PermissionError as exc:
        raise RuntimeError(f"Cannot read {path}: permission denied") from exc

    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in {path}: {exc.msg}") from exc


# FAIL: bare except + 吞异常
def load_config(path):
    try:
        return json.loads(open(path).read())
    except:
        return {}
```

**规范：**
- **禁止** `except:` 和 `except Exception:`（除非 logger 顶层）
- 重新抛出时用 `raise X from exc` 保留原堆栈
- catch 的粒度要匹配实际能处理的异常

### async gather + 异常处理

```python
# PASS: 用 return_exceptions 避免一个失败拖垮全部
import asyncio

async def fetch_all_users(user_ids: list[str]) -> list[User | Exception]:
    tasks = [fetch_user(uid) for uid in user_ids]
    return await asyncio.gather(*tasks, return_exceptions=True)


async def main():
    results = await fetch_all_users(["u1", "u2", "u3"])
    for uid, result in zip(user_ids, results, strict=True):
        if isinstance(result, Exception):
            logger.error("Fetch %s failed: %s", uid, result)
        else:
            process(result)


# FAIL: 任何一个失败就全部挂掉
results = await asyncio.gather(*tasks)  # 一个 raise 其它全 cancel
```

### Pytest fixture 命名

```python
import pytest
from unittest.mock import Mock

# PASS: fixture 名 = 它产出的对象名
@pytest.fixture
def llm_client() -> Mock:
    client = Mock()
    client.complete.return_value = "mocked response"
    return client


@pytest.fixture
def user_repository(db_session):  # 依赖其它 fixture 靠参数名
    return UserRepository(db_session)


def test_create_user(user_repository):
    user = user_repository.create(name="Alice")
    assert user.id is not None


# FAIL: fixture 名和用途不一致
@pytest.fixture
def setup():  # 啥都不说明
    ...
```

**规范：**
- fixture 名就是它返回的对象名，比如 `llm_client`、`db_session`、`tmp_cache_dir`
- 用 `@pytest.fixture(scope="module")` 节省昂贵 setup
- `conftest.py` 放跨文件共享的 fixture

### Context Manager / Async Context Manager

```python
# PASS: 用 @contextmanager 管理资源生命周期
from contextlib import contextmanager, asynccontextmanager
from collections.abc import Iterator, AsyncIterator

@contextmanager
def temp_env(**overrides: str) -> Iterator[None]:
    old = {k: os.environ.get(k) for k in overrides}
    os.environ.update(overrides)
    try:
        yield
    finally:
        for k, v in old.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


@asynccontextmanager
async def db_transaction(session) -> AsyncIterator[None]:
    async with session.begin():
        yield  # commit/rollback 自动处理


# 用法
with temp_env(API_KEY="test-key"):
    run_test()

async with db_transaction(session):
    await session.execute(...)
```

## React Best Practices

### Component Structure

```typescript
// PASS: GOOD: Functional component with types
interface ButtonProps {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary'
}

export function Button({
  children,
  onClick,
  disabled = false,
  variant = 'primary'
}: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-${variant}`}
    >
      {children}
    </button>
  )
}

// FAIL: BAD: No types, unclear structure
export function Button(props) {
  return <button onClick={props.onClick}>{props.children}</button>
}
```

### Custom Hooks

```typescript
// PASS: GOOD: Reusable custom hook
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}

// Usage
const debouncedQuery = useDebounce(searchQuery, 500)
```

### State Management

```typescript
// PASS: GOOD: Proper state updates
const [count, setCount] = useState(0)

// Functional update for state based on previous state
setCount(prev => prev + 1)

// FAIL: BAD: Direct state reference
setCount(count + 1)  // Can be stale in async scenarios
```

### Conditional Rendering

```typescript
// PASS: GOOD: Clear conditional rendering
{isLoading && <Spinner />}
{error && <ErrorMessage error={error} />}
{data && <DataDisplay data={data} />}

// FAIL: BAD: Ternary hell
{isLoading ? <Spinner /> : error ? <ErrorMessage error={error} /> : data ? <DataDisplay data={data} /> : null}
```

## 文件组织

### Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── markets/           # Market pages
│   └── (auth)/           # Auth pages (route groups)
├── components/            # React components
│   ├── ui/               # Generic UI components
│   ├── forms/            # Form components
│   └── layouts/          # Layout components
├── hooks/                # Custom React hooks
├── lib/                  # Utilities and configs
│   ├── api/             # API clients
│   ├── utils/           # Helper functions
│   └── constants/       # Constants
├── types/                # TypeScript types
└── styles/              # Global styles
```

Python 项目：

```
src/
├── app/                  # FastAPI / Django 入口
├── domain/               # 领域模型（dataclass / pydantic）
├── services/             # 业务逻辑层
├── repositories/         # 数据访问层
├── adapters/             # 外部系统适配（LLM / cache / queue）
├── api/                  # HTTP 路由 / schema
└── utils/                # 纯函数工具
tests/
├── unit/
├── integration/
└── conftest.py
```

### File Naming

```
# TS/React
components/Button.tsx          # PascalCase for components
hooks/useAuth.ts              # camelCase with 'use' prefix
lib/formatDate.ts             # camelCase for utilities
types/market.types.ts         # camelCase with .types suffix

# Python
services/user_service.py      # snake_case
repositories/user_repo.py     # snake_case
tests/test_user_service.py    # test_ 前缀
```

## Comments & Documentation

### When to Comment

```typescript
// PASS: GOOD: Explain WHY, not WHAT
// Use exponential backoff to avoid overwhelming the API during outages
const delay = Math.min(1000 * Math.pow(2, retryCount), 30000)

// Deliberately using mutation here for performance with large arrays
items.push(newItem)

// FAIL: BAD: Stating the obvious
// Increment counter by 1
count++
```

Python 同理：

```python
# PASS: 解释为什么
# Redis cluster 切换期间会短暂返回旧数据，这里主动 double-check
cached = await redis.get(key)
if cached and _is_stale_marker(cached):
    cached = None

# FAIL: 重复代码内容
# 把 count 加一
count += 1
```

### JSDoc / Docstring for Public APIs

```python
def search_markets(query: str, limit: int = 10) -> list[Market]:
    """Search markets using semantic similarity.

    Args:
        query: Natural language search query.
        limit: Maximum number of results.

    Returns:
        Markets sorted by similarity score (descending).

    Raises:
        LLMProviderError: If embedding API fails.
        RuntimeError: If the vector index is unavailable.

    Example:
        >>> results = search_markets("election", 5)
        >>> results[0].name
        'Trump vs Biden'
    """
    ...
```

## Testing Standards

### Test Structure (AAA Pattern)

```python
def test_calculates_similarity_correctly():
    # Arrange
    vector_a = [1, 0, 0]
    vector_b = [0, 1, 0]

    # Act
    similarity = calculate_cosine_similarity(vector_a, vector_b)

    # Assert
    assert similarity == 0
```

### Test Naming

```python
# PASS: 描述行为
def test_returns_empty_list_when_no_markets_match_query(): ...
def test_raises_when_openai_api_key_missing(): ...
def test_falls_back_to_substring_search_when_redis_unavailable(): ...

# FAIL: 模糊
def test_works(): ...
def test_search(): ...
```

## Code Smell Detection

留意这些反模式：

### 1. Long Functions

```python
# FAIL: 函数 > 50 行，多个职责
def process_market_data(raw):
    # 100 lines covering validate / transform / save / notify ...
    ...

# PASS: 拆分成单一职责
def process_market_data(raw: dict) -> Market:
    validated = validate_market(raw)
    transformed = transform_market(validated)
    saved = save_market(transformed)
    notify_subscribers(saved)
    return saved
```

### 2. Deep Nesting

```python
# FAIL: 5 层嵌套
if user:
    if user.is_admin:
        if market:
            if market.is_active:
                if has_permission:
                    do_thing()

# PASS: Early return
if not user: return
if not user.is_admin: return
if not market: return
if not market.is_active: return
if not has_permission: return
do_thing()
```

### 3. Magic Numbers

```python
# FAIL
if retry_count > 3: ...
await asyncio.sleep(0.5)

# PASS
MAX_RETRIES = 3
DEBOUNCE_DELAY_SECONDS = 0.5

if retry_count > MAX_RETRIES: ...
await asyncio.sleep(DEBOUNCE_DELAY_SECONDS)
```

### 4. God Object / God Module

单文件超过 500 行、单类承担 5+ 个职责，就该拆。参考 `rules/common/coding-style.md` 的"文件组织"段。

---

**Remember**: 代码质量不是可选项。清晰、可维护的代码让后续开发和重构变得可控。

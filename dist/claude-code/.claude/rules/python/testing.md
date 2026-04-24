---
paths:
  - "**/*.py"
  - "**/*.pyi"
  - "**/test_*.py"
  - "**/*_test.py"
---
# Python Testing

> 扩展 [common/testing.md](../common/testing.md) 的 Python 特定内容。
> E2E 见 `e2e-testing` skill（通用 Playwright）。

## 框架

**pytest** 是唯一首选。内置 asyncio 支持用 `pytest-asyncio`。

| 需求 | 包 |
|---|---|
| 基础框架 | `pytest` |
| 异步测试 | `pytest-asyncio` |
| 覆盖率 | `pytest-cov` |
| 参数化 | pytest 内置 `parametrize` |
| Mock | pytest 内置 `monkeypatch` + `unittest.mock` |
| Fixture 复用 | pytest 内置 `conftest.py` |
| 快照测试 | `syrupy` 或 `snapshottest` |

## 覆盖率

```bash
pytest --cov=src --cov-report=term-missing --cov-report=html --cov-fail-under=80
```

- **80% 行覆盖**为最低门槛
- **金融 / 认证 / 安全关键路径 100%**
- `--cov-fail-under=80` 让 CI 在覆盖不够时红

## 测试结构（AAA）

```python
import pytest
from myapp.pricing import calculate_total, Cart

class TestCalculateTotal:
    def test_empty_cart_returns_zero(self):
        # Arrange
        cart = Cart(items=[])
        # Act
        total = calculate_total(cart)
        # Assert
        assert total == 0

    def test_applies_tax_correctly(self):
        cart = Cart(items=[{"price": 100, "qty": 1}])
        assert calculate_total(cart, tax=0.1) == 110
```

## 命名（描述行为，不描述代码）

```python
# 错
def test_function():
    ...

# 对
def test_returns_empty_list_when_no_markets_match_query():
    ...

def test_raises_missing_api_key_error():
    ...

def test_falls_back_to_substring_search_when_redis_down():
    ...
```

## Fixture 最佳实践

**`conftest.py` 放共享 fixture**，按作用域分层：

```python
# conftest.py
import pytest
from sqlalchemy import create_engine
from myapp.db import Base

@pytest.fixture(scope="session")
def db_engine():
    """整个测试 session 一个 engine（建一次）。"""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()

@pytest.fixture
def db_session(db_engine):
    """每个 test 一个新 session（自动回滚）。"""
    connection = db_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()
```

**作用域**：
- `function`（默认）：每 test 新建
- `class` / `module`：同类/模块共享
- `session`：整个 pytest run 一个
- 有 I/O 或数据库的用 `session`，有状态的用 `function`

## 参数化（同逻辑多数据）

```python
@pytest.mark.parametrize("input,expected", [
    ("", 0),
    ("a", 1),
    ("hello world", 2),
])
def test_word_count(input, expected):
    assert word_count(input) == expected

# ids 参数让失败报告更可读
@pytest.mark.parametrize("email,valid", [
    ("a@b.com", True),
    ("invalid", False),
    ("@nodomain", False),
], ids=["valid", "no-at", "no-local"])
def test_email_validation(email, valid):
    assert is_valid_email(email) is valid
```

## Mock 策略

- **单元测试**：mock 外部依赖（DB / HTTP / 文件 / 时间）
- **集成测试**：**不 mock** DB（用 `pytest-postgresql` 或 sqlite-memory），只 mock 外部 API
- **禁止 mock 自家代码**（mock 被测对象 = 在测 mock，不是代码）

```python
from unittest.mock import AsyncMock, patch

@patch("myapp.llm.AsyncAnthropic")
async def test_summarize_handles_api_error(mock_anthropic):
    mock_anthropic.return_value.messages.create = AsyncMock(
        side_effect=RuntimeError("API down")
    )
    result = await summarize("text")
    assert result.startswith("[降级]")
```

**时间 mock**：`freezegun`
```python
from freezegun import freeze_time

@freeze_time("2026-04-24")
def test_expires_in_7_days():
    assert create_token().expires_at.date().isoformat() == "2026-05-01"
```

## 异步测试

```python
import pytest

@pytest.mark.asyncio
async def test_fetch_user(client):
    user = await fetch_user("u1")
    assert user.id == "u1"

# 并发场景：gather + asserts
@pytest.mark.asyncio
async def test_concurrent_fetches():
    results = await asyncio.gather(
        fetch_user("u1"),
        fetch_user("u2"),
        return_exceptions=True,
    )
    assert all(not isinstance(r, Exception) for r in results)
```

**pyproject.toml**：
```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"  # 无需每个 async 测试加 @pytest.mark.asyncio
```

## Anti-Patterns

**禁止**：
- `assert True` / `assert 1 == 1` 占位测试
- 测试里写复杂逻辑（测试应该直线）
- 一个 `test_` 函数测 5 件事（拆分）
- `time.sleep(2)` 等异步（用 `freeze_time` / `mocker.patch` / `asyncio.wait_for`）
- 依赖测试执行顺序（用 fixture 重置）
- 连真实 HTTP（用 `responses` 或 `respx` mock）

## LLM / RAG 测试（MCC 定位）

- **LLM 输出测试**用快照或 golden output（`syrupy`），**不要** assert 精确字符串
- **Prompt 模板测试**：验证渲染后含关键字段
- **向量搜索测试**：构造固定 embedding + 期望 top-k

```python
def test_prompt_contains_user_context(sample_user):
    rendered = PROMPT_TEMPLATE.render(user=sample_user)
    assert sample_user.name in rendered
    assert "2026" in rendered  # 当前年份

def test_llm_response_format(snapshot):
    """snapshot 第一次跑生成 baseline，之后比对。"""
    result = await llm_summarize("example text")
    assert result == snapshot
```

## CI 集成

```yaml
# .github/workflows/test.yml
- run: uv sync
- run: uv run ruff check
- run: uv run mypy src/
- run: uv run pytest --cov=src --cov-fail-under=80
```

**4 层闸门**：lint → typecheck → test → coverage。任一红则 CI 红。

## E2E 见专门 skill

跨浏览器 E2E 见 `e2e-testing` skill（Playwright + Page Object + a11y + Core Web Vitals）。

## 引用

- `tdd-workflow` skill：RED-GREEN-REFACTOR 流程
- `verification-loop` skill：交付前 6 阶段闸门
- `test-automator` agent：补写测试到 80%

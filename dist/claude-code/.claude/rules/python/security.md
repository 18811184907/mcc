---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Security

> 扩展 [common/security.md](../common/security.md) 的 Python 特定内容。

## Secret 管理

```python
# 错：硬编
api_key = "sk-proj-xxxxxxxx"

# 错：运行时才发现缺
import os
api_key = os.environ.get("OPENAI_API_KEY")  # None 也能跑
await openai.chat(api_key, ...)  # 到这里才崩

# 对：启动时用 Pydantic 校验所有 env
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    openai_api_key: str = Field(min_length=20)
    database_url: str
    jwt_secret: str = Field(min_length=32)
    environment: str = Field(pattern=r"^(development|test|production)$")

settings = Settings()  # 启动时缺任何一个立即抛错
```

`.env` 从不进 git。`.env.example` 列所有变量（空值）进 git。

## SQL / ORM 注入

```python
# 错：字符串拼接
cursor.execute(f"SELECT * FROM users WHERE email = '{email}'")

# 错：f-string
query = f"SELECT * FROM users WHERE id = {user_id}"

# 对：参数化
cursor.execute("SELECT * FROM users WHERE email = %s", (email,))

# 对：SQLAlchemy ORM
user = session.query(User).filter(User.email == email).first()

# 对：SQLAlchemy 2.0 style
stmt = select(User).where(User.email == email)
user = session.execute(stmt).scalar_one_or_none()
```

**禁止**：`cursor.execute(query % params)` 或 `cursor.execute(query.format(...))`。ORM 的 raw SQL 必须用绑定参数。

## 输入校验（系统边界）

FastAPI / Django 的所有请求参数用 **Pydantic** 校验：

```python
from pydantic import BaseModel, EmailStr, Field

class CreateUser(BaseModel):
    email: EmailStr
    age: int = Field(ge=0, le=150)
    password: str = Field(min_length=8, max_length=128)
    role: Literal["admin", "member"] = "member"

@app.post("/users")
async def create_user(user: CreateUser):
    # 到这里 user 已经 validated
    ...
```

**禁止**：直接 `json.loads(request.body)` 不校验。

## XSS 防护（Web）

- **Django**：模板默认转义；**禁用** `{{ content|safe }}` 除非经过 bleach 净化
- **FastAPI 返回 HTML**：用 Jinja2 + `autoescape=True`；或用 `markupsafe.escape()`
- **Markdown 渲染用户输入**：必须经 `bleach.clean()`

```python
import bleach
safe_html = bleach.clean(
    user_comment,
    tags=["p", "strong", "em", "a", "code", "pre"],
    attributes={"a": ["href", "title"]},
)
```

## 认证 / 授权

- **密码哈希**：`argon2-cffi`（argon2id 默认参数）或 `bcrypt`（cost=12+）；**禁止** MD5 / SHA256 / plain
- **JWT secret**：最小 32 字节随机（`secrets.token_urlsafe(32)`）；HS256 够用
- **Session cookie**：`httponly=True, secure=True, samesite="strict"`
- **权限检查在服务端**；客户端/前端检查只是 UX hint

```python
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

ph = PasswordHasher()
# 注册
hashed = ph.hash(password)
# 登录
try:
    ph.verify(hashed, user_input)
except VerifyMismatchError:
    raise InvalidCredentials()
```

每个 protected endpoint **手动检查 session**：

```python
from fastapi import Depends, HTTPException

async def require_user(request: Request) -> User:
    session = await get_session(request)
    if not session:
        raise HTTPException(401, "unauthorized")
    return session.user

@app.post("/projects/{pid}/edit")
async def edit_project(pid: str, user: User = Depends(require_user)):
    if not user.can_edit_project(pid):
        raise HTTPException(403, "forbidden")
    ...
```

## CSRF

- **Django**：内置 CSRF middleware 默认开，**禁止** `@csrf_exempt` 除非 API endpoint 有其他认证（token / JWT）
- **FastAPI**：没有内置，用 `fastapi-csrf-protect` 或 double-submit cookie 模式
- **RESTful API** 用 JWT + `SameSite=Lax/Strict` cookie 自带 CSRF 防护

## 依赖安全

```bash
# 包审计
uv run pip-audit
# 或
uv run safety check

# SBOM
uv export --format=requirements.txt | cyclonedx-py requirements -
```

- CI 中跑 `pip-audit`，CRITICAL / HIGH 阻断合并
- **锁定版本**：`uv.lock` 或 `poetry.lock` 进 git
- **新装依赖**先查 PyPI 下载量 / GitHub star / 最近维护；**小心供应链攻击**（typosquatting）

## 序列化 / 反序列化

```python
# 错：pickle 反序列化不可信数据（RCE 风险）
import pickle
obj = pickle.loads(untrusted_bytes)  # ❌ 禁止

# 对：JSON + 显式 schema
data = json.loads(untrusted_str)
validated = MySchema.model_validate(data)  # Pydantic 校验
```

**禁止**：`pickle.loads()` / `yaml.load()`（用 `yaml.safe_load()` 替代） on untrusted input。

## 安全扫描工具

| 用途 | 工具 |
|---|---|
| 静态安全分析 | **bandit**（`bandit -r src/`）|
| 依赖漏洞 | **pip-audit** / safety / snyk |
| Secret 扫描 | trufflehog / Gitleaks |
| 容器 | trivy / grype |
| OWASP 测试 | pytest + `requests-mock` 写测试 |

## 常见 OWASP Top 10 对照

| OWASP | Python 常见表现 | 防 |
|---|---|---|
| A01 Broken Access Control | 忘手动 guard；`user.is_superuser` 检查在 view 外部 | 每 endpoint 服务端 guard + Django permission decorators |
| A03 Injection | string format SQL / `os.system(user_input)` / `eval()` | 参数化 + `subprocess.run([...], shell=False)` + 禁 eval |
| A05 Misconfig | `DEBUG=True` 进 prod / `ALLOWED_HOSTS=["*"]` | Pydantic Settings 校验 + env 分环境 |
| A07 Auth Failures | 弱密码 / plain text token / JWT secret 短 | argon2 + secrets.token_urlsafe(32) + refresh token |
| A08 Data Integrity | pickle untrusted / 依赖未锁 | JSON + schema + uv.lock |
| A10 SSRF | `requests.get(user_url)` 无 allowlist | URL 白名单 + 解析 host 后 IP 检查（127.x / 169.254.x 禁） |

## FastAPI / Django 专项

**FastAPI**：
- CORS：`allow_origins=["*"]` 只在开发用；生产用白名单
- 限流：`slowapi` 装饰器（基于 IP）
- 文件上传：**必须** `max_file_size` + MIME 验证 + 随机化文件名

**Django**：
- `SECURE_SSL_REDIRECT = True` in production
- `SESSION_COOKIE_SECURE = True` + `CSRF_COOKIE_SECURE = True`
- Query：用 ORM，不用 `.raw()` 除非必要（且必须参数化）

## 引用

- `security-reviewer` agent：扫代码（OWASP Top 10 + 密钥泄漏）
- `silent-failure-hunter` agent：扫吞掉的异常（可能泄露信息或掩盖 bug）
- `confidence-check` skill：实现前评估风险维度

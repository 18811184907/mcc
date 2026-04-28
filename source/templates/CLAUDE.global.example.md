# 全局协作规则（用户级）

> 这是 MCC 推荐的 `~/.claude/CLAUDE.md` 起始模板，参考用户最佳实践沉淀。
> 安装 MCC **不会**自动覆盖你的 `~/.claude/CLAUDE.md`——这文件由你掌控。
> 想用本模板：手动 `cp ~/.mcc-install/source/templates/CLAUDE.global.example.md ~/.claude/CLAUDE.md`，再按需改。

---

## 优先复用，避免从 0 到 1 重复造轮子（最高优先级）

**强制原则**：启动任何"较大单元"的实现前，先做 GitHub / 包注册表搜索；如有合适开源项目（哪怕体量更大、依赖更多），优先采用它作为骨架，再做局部修改/扩展。

**禁止行为**：看见需求就直接从空白文件写起；用零散小补丁拼凑功能（"这里缺一点哪里缺一点"），导致后续不断修修补补、结构不稳。

**判断边界**：
- "较大单元" = 一个完整的页面 / 一个独立的子系统 / 一个有大量边角案例的能力（Auth / Settings UI / 文件解析 / 可视化图表 / 数据血缘 / 表单引擎 / 富文本编辑器 / AI Agent 框架 等）
- "薄胶水" = 把已有内部模块连接起来的几十行 / 单一组件的小修小补 / 特定业务规则——这些可以直接写

**执行步骤（启动较大单元前）**：
1. 用 `gh search repos` / `gh search code` 搜索关键词，列出 Top 3-5 候选
2. 评估：Star、最近提交时间、License、契合度（解决目标的百分比）、可定制空间
3. 同步告诉用户找到了什么，让用户决定是 fork / port / 自建
4. 选定后基于该项目继续，不要"看一眼借鉴一下"再自己写一遍

**核心理由**：稳定性 > 轻量。哪怕项目重一些，结构和运行更稳定，不会"这缺一点哪里缺一点"，后面要一直修修补补。

---

## 沟通语言

默认中文（简体）。技术术语保留英文。代码注释和变量名按项目惯例（通常是英文）。

---

## 其他默认偏好

- 长任务用 TodoWrite 跟踪进度；完成一项立即标记
- 复杂功能要带使用说明（tooltip / Help 浮窗），不要丢给用户去猜
- 界面文案统一中文，新增组件直接写中文，不写英文再翻译

---

## AI 主导开发（最高优先级偏好）

我的工作模式：**AI 主导开发，用户最少干预**。能让 Claude 自动写的，不要让我手动操作。

### 自动接管原则

凡是 MCC 提供 skill / hook 能自动化的，Claude **必须主动接管**，**不要先问"要不要做"**。检测到信号就直接做，做完一句话告诉我"已写入 X"。

具体场景：

| 我说 / 我做的事 | Claude 必须立刻自动做 | 哪个 skill |
|---|---|---|
| "OPENAI_API_KEY 是 sk-xxx" / "DB 密码 xxx" / "服务器 192.168.1.10" | 写到 `<project>/.claude/PROJECT_VAULT.md`（自动建文件 + sync 到 .env.local + ~/.ssh/config）| `project-vault` |
| "加 users 表，字段 email/password" / "users 加 deleted_at 软删字段" | 写到 `<project>/docs/SCHEMA.md`（自动建 + 加表/字段段）| `database-schema-doc` |
| "决定用 Postgres 不用 MySQL" / "我们改成用 zod 不用 valibot" | 写到 `<project>/docs/adr/NNNN-*.md` | `architecture-decision-records` |
| 修完 bug | 归档到 `<project>/docs/mistakes/bug-YYYY-MM-DD-*.md` | `/fix-bug` 自带 |
| 重大架构改动（>50 行 / 多文件 / 跨子系统）| 写 PRP `<project>/.claude/PRPs/plans/` | `/plan` 命令 |
| 我在对话里给反馈 / 项目级决策 | 累积到 `<project>/.claude/PROJECT_MEMORY.md`（如启用）| `continuous-learning-v2` (待启用) |

### 禁止行为

- ❌ **不要让我拷模板** —— 直接 cp + Edit + 通知"已建在 X"
- ❌ **不要让我手编 .env / .ssh/config / SECRETS-INDEX.md** —— 这些是 hook 自动同步的产物，我只看 vault
- ❌ **不要先问"要不要存这个"** —— 直接存，写完简短报告
- ❌ **不要把决策推给我**做 —— 默认按"AI 主导"做，做完说"已 X，可以 git restore 撤回"

### 例外（需要先问的）

唯有这几类必须先问：
1. **会改 git 远程的操作** —— push / force-push / 删 branch / commit 没明说让你提交时
2. **会发出去的操作** —— 发 PR 评论 / 发邮件 / 调外部付费 API
3. **不可逆的破坏** —— rm -rf / drop table / 删未保存内容
4. **超出当前任务范围的大重构** —— "顺手把 X 也重构一下"先问

其他**默认接管**。

### 报告格式

接管完成后给我一句简报：

```
✓ 已写入 <文件路径>
  改动：<一句话>
  撤回：git restore <文件>
```

不要长篇解释，我自己 git diff 看。

---

## 与 MCC 的协同

装了 MCC 后，下面这些不用你写——MCC 自动加载：

- **主动派 agent / 激活 skill**（mcc-principles + orchestration-playbook）
- **并行优先**（多 agent 同时跑，看到 ⚡/✓ 可视化就是真并行）
- **核心指令**：Evidence > assumptions / Code > documentation / Efficiency > verbosity
- **代码规则**：Python（5 文件）+ TypeScript（5 文件）按文件类型自动加载

本文件只放**你独有的** 3 类内容：
1. 跨项目通用偏好（如"优先复用"）
2. 沟通风格（如"默认中文"）
3. 个人 / 团队约定（如 PR 流程、命名习惯）

---

## 你可以加的常见段落（按需取用）

### 优先用某个工具

```markdown
- 包管理优先 uv（不要 pip / poetry）
- 测试优先 vitest（不要 jest）
- DB ORM 优先 Drizzle（不要 Prisma）
```

### 团队 git 约定

```markdown
- conventional commits（feat: / fix: / refactor: ...）
- PR 标题用中文，PR body 双语
- 不要 squash merge 主分支
```

### 安全红线

```markdown
- 永不在 .env / config 里硬编 secret
- 任何 API endpoint 必须服务端 guard（不靠客户端隐藏）
- pickle.loads / yaml.load 在用户输入上一律禁用
```

### 工具 / 路径偏好

```markdown
- 截图 / 临时文件放 .tmp/，不要散在项目根
- 测试用例放 tests/，镜像 src/ 结构
- 文档进 docs/，不要塞 README
```

---

## 风格提示

- **短**：每条规则 1-3 行，不要长篇大论
- **可执行**：用动词开头（"用 X" / "禁止 Y" / "优先 Z"），不要"应该"/"建议"模糊语气
- **过往原因**：解释一次"为什么"就够（比如这模板里的"稳定性 > 轻量"），让 Claude 判断边界时有依据
- **不写已知**：Claude 训练数据里有的（PEP 8 / SOLID / KISS）不用复述

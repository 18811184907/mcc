---
name: continuous-learning-v2
description: "hooks 后台观察 + 原子 instinct + 置信度评分，长期学习你的编码习惯。默认关闭 observer，需手动启用。"
---

# Continuous Learning v2.1 — 基于 instinct 的后台学习

把 Claude Code 会话变成可复用知识。核心抽象是 **instinct**——带置信度评分的小颗粒学习行为。

**v2.1** 引入**项目作用域 instinct**：React 项目的模式留在 React 项目里，Python 项目的约定留在 Python 项目里，通用模式（比如"永远校验输入"）才共享到全局。

## 何时启用

- 想让 Claude Code 自动从会话中学习你的偏好
- 用 hooks 提取 instinct，设定置信度门槛
- 查看/导出/导入 instinct 库
- 把 instinct 演化成完整的 skill / command / agent
- 管理项目作用域 vs 全局作用域
- 把项目 instinct 提升为全局

## Instinct 模型

一条 instinct 是一个小颗粒学习行为：

```yaml
---
id: prefer-functional-style
trigger: "when writing new functions"
confidence: 0.7
domain: "code-style"
source: "session-observation"
scope: project
project_id: "a1b2c3d4e5f6"
project_name: "my-react-app"
---

# Prefer Functional Style

## Action
Use functional patterns over classes when appropriate.

## Evidence
- Observed 5 instances of functional pattern preference
- User corrected class-based approach to functional on 2025-01-15
```

**属性：**
- **Atomic** —— 一个 trigger 一个 action
- **置信度加权** —— 0.3 试探、0.9 近乎确定
- **领域标签** —— code-style / testing / git / debugging / workflow 等
- **证据支撑** —— 记录哪些观察产生了它
- **作用域感知** —— `project`（默认）或 `global`

## 工作流

```
Session Activity (in a git repo)
      |
      | Hooks capture prompts + tool use (100% reliable)
      | + detect project context (git remote / repo path)
      v
+---------------------------------------------+
|  projects/<project-hash>/observations.jsonl  |
+---------------------------------------------+
      |
      | Observer agent reads (background, Haiku)
      v
+---------------------------------------------+
|          PATTERN DETECTION                   |
|   * User corrections -> instinct             |
|   * Error resolutions -> instinct            |
|   * Repeated workflows -> instinct           |
|   * Scope decision: project or global?       |
+---------------------------------------------+
      |
      | Creates/updates
      v
+---------------------------------------------+
|  projects/<project-hash>/instincts/personal/ |
|  instincts/personal/  (GLOBAL)               |
+---------------------------------------------+
      |
      | /evolve clusters + /promote
      v
+---------------------------------------------+
|  evolved/commands|skills|agents/             |
+---------------------------------------------+
```

## 项目识别

系统自动识别当前项目（优先级从高到低）：

1. `CLAUDE_PROJECT_DIR` 环境变量
2. `git remote get-url origin` —— 哈希成可移植的 project ID（同一个 repo 在不同机器上 ID 一致）
3. `git rev-parse --show-toplevel` —— 回退到 repo 路径（机器特定）
4. 全局回退 —— 都检测不到就归到 global

每个项目一个 12 位哈希 ID。注册表在 `~/.claude/homunculus/projects.json`。

## Quick Start

### 1. 启用观察 hooks

**作为插件安装时**：无需额外配 `settings.json`，hooks 自动注册。

**手动安装到 `~/.claude/skills` 时**，在 `~/.claude/settings.json` 加：

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "~/.claude/skills/continuous-learning-v2/hooks/observe.sh"
      }]
    }],
    "PostToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "~/.claude/skills/continuous-learning-v2/hooks/observe.sh"
      }]
    }]
  }
}
```

### 2. 初始化目录

首次运行会自动创建。手动创建也行：

```bash
mkdir -p ~/.claude/homunculus/{instincts/{personal,inherited},evolved/{agents,skills,commands},projects}
```

### 3. 使用 instinct 命令

```bash
/instinct-status     # Show learned instincts (project + global)
/evolve              # Cluster instincts into skills/commands
/instinct-export     # Export instincts to file
/instinct-import     # Import instincts from others
/promote             # Promote project instincts to global scope
/projects            # List projects and instinct counts
```

## 配置

编辑 `config.json` 控制后台 observer：

```json
{
  "version": "2.1",
  "observer": {
    "enabled": false,
    "run_interval_minutes": 5,
    "min_observations_to_analyze": 20
  }
}
```

| Key | 默认 | 说明 |
|-----|------|------|
| `observer.enabled` | `false` | 默认关闭，手动改为 `true` 启用 |
| `observer.run_interval_minutes` | `5` | observer 多久分析一次 |
| `observer.min_observations_to_analyze` | `20` | 积累到多少条观察才分析 |

其它行为（观察采集、instinct 阈值、作用域、提升条件）在 `instinct-cli.py` / `observe.sh` 默认值里。

## 作用域决策指南

| 模式类型 | 作用域 | 示例 |
|-------------|-------|---------|
| 语言/框架约定 | **project** | "用 React hooks"、"遵循 Django REST 模式" |
| 文件结构偏好 | **project** | "测试放 `__tests__/`"、"组件放 src/components/" |
| 代码风格 | **project** | "用函数式风格"、"优先用 dataclasses" |
| 错误处理策略 | **project** | "用 Result 类型处理错误" |
| 安全实践 | **global** | "校验用户输入"、"清洗 SQL" |
| 通用最佳实践 | **global** | "先写测试"、"永远处理错误" |
| 工具使用偏好 | **global** | "Edit 前先 Grep"、"Write 前先 Read" |
| Git 习惯 | **global** | "Conventional commits"、"小而专的提交" |

## Instinct 提升（Project → Global）

同一条 instinct 在多个项目高置信度出现时，触发提升候选。

**自动提升条件：**
- 同一 instinct ID 出现在 2+ 个项目
- 平均置信度 ≥ 0.8

**手动提升：**

```bash
python3 instinct-cli.py promote prefer-explicit-errors   # 指定 ID
python3 instinct-cli.py promote                          # 所有合格的
python3 instinct-cli.py promote --dry-run                # 只预览
```

`/evolve` 命令也会给出提升建议。

## 置信度评分

| Score | 含义 | 行为 |
|-------|---------|----------|
| 0.3 | 试探 | 提示但不强制 |
| 0.5 | 中等 | 相关场景会应用 |
| 0.7 | 强 | 自动批准应用 |
| 0.9 | 近乎确定 | 核心行为 |

**置信度升高**：重复观察 / 用户不纠正 / 其它来源佐证
**置信度降低**：用户明确纠正 / 长时间未观察到 / 出现反证

## 为什么用 hooks 而不是 skills 来做观察？

Skill 是概率触发（Claude 判断场景后约 50-80% 概率激活）。Hook 是**100% 触发**，确定性：
- 每个 tool call 都被观察
- 没有模式被漏掉
- 学习覆盖全面

## 隐私

- 观察内容**只留在本机**
- 项目作用域 instinct 在项目间隔离
- 只有 **instinct**（模式）可以导出，原始观察不导出
- 没有代码或对话内容被共享
- 你决定导出/提升什么

## 与 /learn 命令的关系

- `/learn` —— **显式**提炼单次会话的模式（用户主动触发）
- `continuous-learning-v2` —— **后台**持续观察长期模式（hook 驱动）
- **互补不冲突**：前者做单点深度提炼，后者做长期规律沉淀

## Windows 提示

- `observe.sh` 需要 Git Bash（Windows 原生 cmd / PowerShell 不行）
- 未安装 Python 3 时 observer 静默跳过，不阻塞任何 tool 调用
- `~/.claude/homunculus/` 在 Windows 下即 `%USERPROFILE%\.claude\homunculus\`

---

*基于 instinct 的学习：让 Claude 一个项目一个项目地，慢慢学会你的习惯。*

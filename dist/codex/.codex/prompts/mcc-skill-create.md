---
description: "分析 repo git history，提取 commit 约定、文件共变、架构和测试模式，生成 SKILL.md。"
argument-hint: "[--commits N] [--output ./skills]"
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# Skill Create

## 核心价值

从你的 repo git history 里自动挖出团队实际使用的 pattern——commit 约定、文件共变、目录结构、测试风格——生成可被 Claude 自动加载的 SKILL.md。与 `mcc-learn` prompt 互补（后者从单 session 提）。

## 用法

```bash
`mcc-skill-create` prompt                    # 分析当前 repo 默认 200 commits
`mcc-skill-create` prompt --commits 100      # 只看最近 100 个
`mcc-skill-create` prompt --output ./skills  # 自定义输出目录（默认 ./skills/）
```

## 做什么

1. **解析 git history** — 分析 commit / 文件变更 / pattern
2. **检测 pattern** — 识别重复的 workflow 和约定
3. **生成 SKILL.md** — 合法的 Claude Code skill 文件

## 分析步骤

### Step 1 — 收集 git 数据

```bash
# 最近 commit + 文件变更
git log --oneline -n ${COMMITS:-200} --name-only --pretty=format:"%H|%s|%ad" --date=short

# 文件 commit 频次
git log --oneline -n 200 --name-only \
  | grep -v "^$" | grep -v "^[a-f0-9]" \
  | sort | uniq -c | sort -rn | head -20

# commit 消息样本
git log --oneline -n 200 | cut -d' ' -f2- | head -50
```

### Step 2 — 检测 pattern

找这几类：

| Pattern | 检测方法 |
|---------|-----------------|
| **Commit 约定** | 正则匹配 commit message（feat: / fix: / chore:） |
| **文件共变** | 总是一起改的文件 |
| **Workflow 序列** | 重复出现的文件改动顺序 |
| **架构** | 目录结构和命名约定 |
| **测试模式** | 测试文件位置、命名、覆盖 |

### Step 3 — 生成 SKILL.md

**输出结构**（5 行说明——典型骨架）：

```
---
name: {repo-name}-patterns
description: "从 {repo-name} git history 提取的编码模式和约定"
version: 1.0.0
source: local-git-analysis
analyzed_commits: {count}
---

# {Repo Name} Patterns

## Commit Conventions
[提取的 commit 消息模式]

## Code Architecture
[提取的目录结构和组织方式]

## Workflows
[提取的重复文件改动序列]

## Testing Patterns
[提取的测试约定]
```

## 与其他组件的关系

- 配合 `continuous-learning-v2` skill 使用——本命令做 repo 级批量提取，`continuous-learning-v2` 做 session 级实时学习
- `mcc-learn` prompt 从单个 session 提单个 pattern
- `mcc-skill-create` prompt 从整个 repo 提整套团队约定

## 产出路径

- 默认 `./skills/` 下生成 `SKILL.md`
- `$ARGUMENTS` 里 `--output <path>` 可覆盖
- 建议 commit 进 repo 作为团队共享的知识（或拷到 `~/.claude/skills/` 做个人用）

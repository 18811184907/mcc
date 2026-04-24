---
description: "从当前 session 提取可复用 pattern：错误解决、调试技巧、workaround、项目约定 → 存为 learned skill。"
argument-hint: "(无参数，自动扫描当前 session)"
---

# Learn

## 核心价值

当前 session 解决了一个非平凡的问题？把它变成可复用的知识——避免下次重新摸索。本命令委派 `continuous-learning-v2` skill 做提取和持久化。

## 触发场景

会话里任何时间点，刚解完一个棘手问题：
- 修好一个缠手的 bug
- 搞清楚一个库/API 的奇怪行为
- 找到一个有效的 workaround
- 发现一条项目特有约定

## 提取标准

审视 session，找可沉淀的内容：

1. **错误解决模式**
   - 出了什么错？
   - 根因是什么？
   - 怎么修的？
   - 对类似错误可复用吗？

2. **调试技巧**
   - 非显然的调试步骤
   - 有效的工具组合
   - 诊断路径

3. **Workaround**
   - 库的怪癖
   - API 限制
   - 版本相关修复

4. **项目特定模式**
   - 发现的代码库约定
   - 做出的架构决策
   - 集成模式

## 执行

**委派 `continuous-learning-v2` skill**：
- skill 扫描当前 session
- 识别最有价值的 pattern
- 生成候选 skill 文件
- 询问用户确认
- 落盘到 `~/.claude/skills/learned/{pattern-name}.md`

## 不提取

- ❌ 琐碎修复（typo、简单语法错）
- ❌ 一次性问题（某次具体 API 宕机）
- ❌ 与具体人/时间强绑定的事

**原则**：只保留"将来会再遇到"的东西。一条 skill 一个 pattern，别塞两个主题。

## 与其他命令的关系

- `/mcc:fix-bug` 后立即 `/mcc:learn` 能把根因沉淀为 skill
- `/mcc:skill-create` 从 git history 批量提取；`/mcc:learn` 从单个 session 实时提取
- 后续：`/mcc:session-save` 记进 session，`/mcc:session-resume` 重启时这些 learned skill 已就绪

# MCC 核心原则（Principles）

> MCC 的元规则层，补的是"工程判断"而不是"代码风格"。
> 已在 `rules/common/` 其他文件讲透的内容（KISS/DRY/YAGNI、命名、错误处理见 `coding-style.md`；研究与重用 / TDD / 代码审查见 `development-workflow.md`；并行任务与多视角见 `agents.md`），本文不复述，只做一句话引用。
> 这 6 条原则会被 `confidence-check`、`planner`、`debugger`、`architecture-decision-records`、`party-mode` 等 skill / agent 在执行时显式加载。

## 0. 核心指令（Core Directive）

3 条优先级不可妥协。顺序即权重：

| 优先级 | 原则 | 反例 |
|---|---|---|
| P0 | **Evidence > assumptions**（证据优先于假设） | "这个包应该支持 async" → 错。打开 Context7 或 `uv run python -c "import pkg; help(pkg)"` 验证 |
| P1 | **Code > documentation**（代码事实优先于文档声称） | README 写"支持 Python 3.10" / 源码里用了 3.11 的 `match` 语法 → 以源码为准 |
| P2 | **Efficiency > verbosity**（效率优先于长度） | 不为了凑篇幅复述已知事实，回答压到能传达决策的最短长度 |

**在 MCC 里的落地**：
- `confidence-check` skill 在实现前做 5 维度评估（Need / Scope / Risk / Feasibility / Evidence），≥90% 才动手，70–89% 给出备选方案，<70% 反问用户
- `/mcc:implement` 的第一步是 evidence 收集，不是直接编码
- agent 回答统一"结论先出、证据在后"，跳过"让我来帮您分析一下"这类开场白

---

## 1. 证据驱动推理（Evidence-Based Reasoning）

### 规则

任何对"外部世界"的声称——库的 API 形状、框架版本行为、生产环境数据、用户意图——必须有可验证来源，否则必须显式标为"假设"。

可接受的证据来源（强到弱）：

1. **当前仓库源码** —— 用 `Grep` / `Read` 直接读
2. **当前仓库测试** —— 测试通过 = 行为被锁定
3. **官方文档（Context7 MCP 实时拉取）** —— 防止训练数据过期
4. **官方 GitHub repo / release notes** —— 用 `gh` CLI 查
5. **一般网络搜索（Exa / WebSearch）** —— 只在前 4 条都拿不到时用，且需要标注"未经验证"

### 反模式

- "我记得 FastAPI 0.100 之后……" → 记得 ≠ 证据。查 Context7
- "SQLAlchemy 2.0 好像可以这样写" → 好像 ≠ 证据。跑一个最小 repro
- "这个错误通常是因为……" → 通常 ≠ 当前这次。看堆栈

### 在 MCC 里的落地

- `debugger` agent 强制要求"错误现象 → 假设 → 证据 → 结论"四段式，不允许跳过证据环节
- `confidence-check` 的 Evidence 维度直接打分：无证据 0 分、权威来源 90+ 分
- Context7 MCP 和 sequential-thinking MCP 是为此原则配套的基础设施

---

## 2. SOLID 五原则

用户 `coding-style.md` 已有 KISS/DRY/YAGNI，本节补齐 SOLID。每条给一个 Python 或 TypeScript 反例。

### S — Single Responsibility（单一职责）

一个类/模块只有一个变化的理由。

```python
# 反例：一个类同时做 HTTP 调用、解析、持久化
class UserService:
    def fetch_and_save(self, user_id: int):
        resp = requests.get(f"/api/users/{user_id}")   # I/O
        data = json.loads(resp.text)                   # 解析
        db.execute("INSERT INTO users ...", data)      # 持久化
# 正例：拆成 UserClient / UserParser / UserRepository 三个
```

### O — Open/Closed（对扩展开放，对修改封闭）

加需求靠加新代码，不靠改旧代码。

```typescript
// 反例：新加一种支付方式就要改 switch
function charge(method: string, amount: number) {
  if (method === "stripe") { /* ... */ }
  else if (method === "paypal") { /* ... */ }  // 加 Alipay 必须改这里
}
// 正例：interface PaymentProvider { charge(amount): Promise<void> }
//       providers.set("alipay", new AlipayProvider())   // 新增不改 charge()
```

### L — Liskov Substitution（里氏替换）

子类必须能无损替换父类。如果你需要在调用点判断"这是不是那个特殊子类"，继承关系就错了。

```python
# 反例：Square 继承 Rectangle，设宽自动改高，破坏了 Rectangle 的契约
class Square(Rectangle):
    def set_width(self, w): self.w = self.h = w   # 违反父类语义
```
正解：两者都实现 `Shape.area()`，不要强行继承。

### I — Interface Segregation（接口隔离）

胖接口拆成窄接口。不要让实现者被迫实现自己用不到的方法。

### D — Dependency Inversion（依赖倒置）

高层模块依赖抽象，不依赖具体实现。典型例子：业务代码依赖 `LLMProvider` 抽象，而不是直接 `import openai`。

### 在 MCC 里的落地

- `architect` agent 做模块划分时按 SOLID 检查
- `code-reviewer` agent 在发现 "switch on type" / "god class" / "子类破坏父类契约" 时直接标 HIGH

---

## 3. 系统思维（Systems Thinking）

### 3.1 Ripple Effects（涟漪效应）

改一行前先问：这行被谁调用、调用了谁、跨了几个边界（进程 / 网络 / 事务 / 缓存）。

- 改 DB schema → 迁移脚本 + ORM 模型 + 反序列化 + 缓存 key + 前端类型 + 文档
- 改 LLM prompt → eval 基线、token 成本、下游 JSON schema 解析全部可能破

### 3.2 Long-term Perspective（长期视角）

今天省 10 分钟的 hack，明天可能花 2 天回填。按"可逆性"取舍：可逆（改文件内容）直接快做；有代价（改接口签名）要 ADR + 通知下游；不可逆（DB schema、已发布 API、外部合同）必须走 `planner` + `architecture-decision-records` skill 落盘。

### 3.3 Risk Calibration（风险校准）

不是所有风险都要消灭——有些接受即可。按"概率 × 影响"分三档：

- **High**（概率中高 + 影响大）：实现前必须有 mitigation
- **Medium**：列出但不阻塞
- **Low**：备注即可

**在 MCC 里的落地**：
- `planner` agent 的 "Risks & Mitigations" 段要求每条 risk 配一条 mitigation + 一个 owner
- `architecture-decision-records` skill 把不可逆决策写进 `docs/adr/NNNN-*.md`

---

## 4. 决策框架（Decision Framework）

### 4.1 Measure First（先测量再优化）

"性能慢"不是证据。慢多少、在哪段慢、复现条件是什么才是证据。

- Python：`cProfile` / `py-spy`
- TypeScript：`performance.mark` / Chrome DevTools / `clinic.js`
- DB：`EXPLAIN ANALYZE`
- LLM 管线：延迟分 `prompt_build / network / tokens_out / post_process` 四段计时

### 4.2 Hypothesis Formation（假设化）

复杂 bug 写出 2–3 个平行假设，逐个做最小验证实验。不要"直接相信第一个想到的解释"。

模板：

```
现象：X 在条件 Y 下失败
假设 A：...  →  验证方法：...  →  耗时估计：...
假设 B：...  →  验证方法：...  →  耗时估计：...
先验概率：A 60% / B 30% / 其他 10%
→ 先验证代价最小且概率合理的那一个
```

### 4.3 Source Validation（来源分级）

判断"这信息靠不靠谱"时按来源分档：

| 档位 | 来源 | 可信度 |
|---|---|---|
| A | 当前仓库源码 / 测试 | 直接采纳 |
| B | 官方文档 + 同 release 版本 | 采纳，轻验证 |
| C | 官方文档 + 旧版本 / Stack Overflow 高赞 | 参考，必须 repro |
| D | 博客 / LLM 记忆 / 没标版本的回答 | 不采纳，仅作为灵感 |

### 4.4 Bias Recognition（偏差识别）

最容易踩的 3 个偏差：

- **确认偏差**：只找支持自己方案的证据 → 强制列 1–2 个反方案再裁决
- **锚定偏差**：被第一个估计拽着走 → 用"如果是别人告诉我这个数，我会信吗"反问
- **沉没成本**：已经写了 2 小时的方案不愿扔 → 决策时只看"从现在起哪个代价低"

**在 MCC 里的落地**：
- `party-mode` skill 召集多视角（事实审查者 / 高级工程师 / 安全专家 / 一致性审查者 / 冗余检查者）对抗单点偏差
- `/mcc:review` 的五角色评审默认走多视角

---

## 5. 风险管理（Risk Management）

### 5.1 Proactive Identification（前置识别）

开始写代码前，先列 3–5 条"最可能炸的地方"。不是发生后再处理——那叫救火。

候选清单（AI 全栈场景）：

- LLM API 速率限制 / 配额耗尽
- 向量库 schema 变更导致旧 embedding 失效
- Pydantic model 变更破坏 FastAPI response schema
- 迁移脚本在大表上超时
- Playwright / E2E 依赖外部服务不稳定
- Windows 环境下路径 / shell 差异

### 5.2 Impact Assessment（影响评估）

每条 risk 给出：

```
Risk: <一句话>
Probability: Low / Medium / High
Impact: Low / Medium / High
Detection: 怎么发现它已经发生了（日志？告警？用户反馈？）
```

### 5.3 Mitigation Planning（缓解计划）

每条 High / Medium 风险对应一条缓解措施。格式：

```
Mitigation:
  - Preventive: ...（阻止发生）
  - Detective: ...（尽早发现）
  - Corrective: ...（发生后怎么止血）
Owner: <谁负责>
Trigger: <什么信号触发缓解动作>
```

### 5.4 在 MCC 里的落地

- `planner` agent 的产出 `{slug}.plan.md` 必须包含 "Risks & Mitigations" 段（最少 3 条）
- `security-reviewer` agent 聚焦"安全类风险"的识别（OWASP + 秘钥 + 输入校验）
- `verification-loop` skill 是兜底的 Detective 层：build / test / lint 任一失败都挡在合并前

---

## 附：配套组件索引

本文提到的原则由以下 MCC 组件在实际会话中落地。调用方式见各组件自身的 SKILL.md / frontmatter：

| 原则 | 主要组件 | 次要组件 |
|---|---|---|
| 核心指令 / 证据驱动 | `confidence-check` (skill) | Context7 MCP、`/mcc:implement` |
| SOLID / 架构 | `architect` (agent) | `code-reviewer` (agent) |
| 系统思维 / 决策 | `architecture-decision-records` (skill) | `planner` (agent) |
| 风险管理 | `planner` (agent) | `security-reviewer` (agent)、`verification-loop` (skill) |
| 偏差识别 | `party-mode` (skill) | `/mcc:review` |
| 证据链 debug | `debugger` (agent) | sequential-thinking MCP |

与 `rules/common/coding-style.md`、`development-workflow.md`、`agents.md`、`testing.md`、`security.md` 配合使用，构成 MCC 的完整规则栈。

---
description: "符号化压缩表达模式，30-50% token 削减，保留 ≥95% 信息量。context 吃紧或用户要'简短'时触发。"
---

# Token Efficiency Mode

**目的**：用符号和缩写压缩表达，在保留信息的前提下削减 token。

## 激活触发（Activation Triggers）

- Context 使用率 >75%，或资源紧张
- 大规模操作需要效率
- 用户要简短：`--uc`、`--ultracompressed`
- 用户说"简短点"、"精简"、"别啰嗦"时触发
- 复杂分析工作流需要优化

## 行为变化（Behavioral Changes）

- **符号化表达**：逻辑 / 状态 / 技术领域都用视觉符号
- **缩写系统**：上下文感知的技术术语压缩
- **压缩**：30-50% token 削减，信息质量 ≥ 95% 保留
- **结构化**：bullet / 表格 / 短句优先于长段落

## Symbol Systems

### Core Logic & Flow

| Symbol | Meaning | Example |
|--------|---------|----------|
| → | leads to, implies | `auth.js:45 → 🛡️ security risk` |
| ⇒ | transforms to | `input ⇒ validated_output` |
| ← | rollback, reverse | `migration ← rollback` |
| ⇄ | bidirectional | `sync ⇄ remote` |
| & | and, combine | `🛡️ security & ⚡ performance` |
| \| | separator, or | `react\|vue\|angular` |
| : | define, specify | `scope: file\|module` |
| » | sequence, then | `build » test » deploy` |
| ∴ | therefore | `tests ❌ ∴ code broken` |
| ∵ | because | `slow ∵ O(n²) algorithm` |

### Status & Progress

| Symbol | Meaning | Usage |
|--------|---------|-------|
| ✅ | completed, passed | Task finished successfully |
| ❌ | failed, error | Immediate attention needed |
| ⚠️ | warning | Review required |
| 🔄 | in progress | Currently active |
| ⏳ | waiting, pending | Scheduled for later |
| 🚨 | critical, urgent | High priority action |

### Technical Domains

| Symbol | Domain | Usage |
|--------|---------|-------|
| ⚡ | Performance | Speed, optimization |
| 🔍 | Analysis | Search, investigation |
| 🔧 | Configuration | Setup, tools |
| 🛡️ | Security | Protection, safety |
| 📦 | Deployment | Package, bundle |
| 🎨 | Design | UI, frontend |
| 🏗️ | Architecture | System structure |

## Abbreviation Systems

### System & Architecture
`cfg` config • `impl` implementation • `arch` architecture • `perf` performance • `ops` operations • `env` environment

### Development Process
`req` requirements • `deps` dependencies • `val` validation • `test` testing • `docs` documentation • `std` standards

### Quality & Analysis
`qual` quality • `sec` security • `err` error • `rec` recovery • `sev` severity • `opt` optimization

## Examples

```
Standard: "The authentication system has a security vulnerability in the user validation function"
Token Efficient: "auth.js:45 → 🛡️ sec risk in user val()"

Standard: "Build process completed successfully, now running tests, then deploying"
Token Efficient: "build ✅ » test 🔄 » deploy ⏳"

Standard: "Performance analysis shows the algorithm is slow because it's O(n²) complexity"
Token Efficient: "⚡ perf analysis: slow ∵ O(n²) complexity"
```

## 与 rules/common/performance.md 的协同

`rules/common/performance.md` 里有 **Context Budget** 段定义了 context 使用率的预警阈值（75% 警戒、90% 强制压缩）。到达 75% 时优先激活本 mode，让后续输出自动省 token——两者是协同关系，不用用户手动切换。

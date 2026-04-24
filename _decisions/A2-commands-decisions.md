# A2 · 20 个 Command 加工决策（执行版）

> 配合 `MCC-CANONICAL.md` 使用。所有命令产出到 `source/commands/{name}.md`（文件名不带 `/mcc:` 前缀，adapter 会加）。

## 全局规则

1. **命名空间**：Claude Code 侧最终全部 `/mcc:*`；Codex 侧放到 `.codex/prompts/mcc-*.md`
2. **Source 文件名**：不含 `/mcc:` 前缀，直接 kebab-case（如 `prd.md`、`plan.md`）
3. **依赖更新**（必做）：所有 `/sc:*` 引用改为 `/mcc:*`；`/prp-*` 引用改为 `/mcc:*`；`subagent_type: general-purpose` 尽量改为 MCC 具体 agent
4. **中文化**：phase 标题、说明正文 → 中文；代码/命令/API → 英文；模板（给 AI 读的）保留英文
5. **Frontmatter**：`description: "中文一句话 + 自动触发场景"`，删除 SC 的 `category/complexity/mcp-servers/personas` 字段
6. **Artifact 统一到 `.claude/PRPs/`**（见 MCC-CANONICAL §9）

## 最终 20 个命令清单

| # | Source 文件 | 源 | 类别 | 核心价值 |
|---|---|---|---|---|
| 1 | `prd.md` | ECC `prp-prd` | PRP 流水线 | 交互式 PRD 生成 |
| 2 | `plan.md` | ECC `prp-plan` | PRP 流水线 | 自包含实施计划 |
| 3 | `implement.md` | ECC `prp-implement` | PRP 流水线 | 按 plan 执行 + 5 级验证 |
| 4 | `pr.md` | ECC `prp-pr` | PRP 流水线 | 创建 GitHub PR |
| 5 | `full-stack.md` | wshobson `full-stack-feature` | 大流水线 | 9 步全栈特性 |
| 6 | `full-review.md` | wshobson `full-review` | 大流水线 | 5 阶段全面审查 |
| 7 | `review.md` | ECC `code-review` | 审查 | 单点代码/PR 审查 |
| 8 | `verify.md` | ECC `verify` | 验证 | 委派 verification-loop skill |
| 9 | `test-coverage.md` | ECC `test-coverage` | 测试 | 补测试到 80%+ |
| 10 | `tdd.md` | ECC `tdd` | 测试 | 强制 RED-GREEN-REFACTOR |
| 11 | `e2e.md` | ECC `e2e` | 测试 | Playwright E2E |
| 12 | `build-fix.md` | ECC `build-fix` | 诊断 | 构建错误增量修复 |
| 13 | `troubleshoot.md` | SC `troubleshoot` | 诊断 | 多域问题诊断 |
| 14 | `fix-bug.md` | MCC 原创（已存在） | 诊断 | 单 bug 深度根因 |
| 15 | `learn.md` | ECC `learn` | 学习 | 从 session 提取 pattern |
| 16 | `skill-create.md` | ECC `skill-create` | 学习 | 从 git history 生成 skill |
| 17 | `session-save.md` | ECC `save-session` | 会话 | 持久化 session |
| 18 | `session-resume.md` | ECC `resume-session` | 会话 | 恢复 session |
| 19 | `init.md` | MCC 原创（已存在） | 入口 | 生成 CLAUDE.md |
| 20 | `explain.md` | MCC 原创（已存在） | 查询 | 中文解释代码/概念 |

## 逐个加工动作

### 1. prd.md (源: ECC prp-prd, 448 → 260)
- **frontmatter**: `description: "交互式 PRD 生成器：问题先行，7 个 phase 提问生成完整 PRD。功能尚未清晰时调用。"` | `argument-hint: "<feature/product idea>"`
- **删除**：L399-429 Question Flow Summary ASCII 图、L440-447 Success Criteria（和 Phase 8 Validation 重叠）
- **翻译 phase 标题**：INITIATE→初始化、FOUNDATION→基础问题、GROUNDING→背景调研、DEEP DIVE→深度挖掘、DECISIONS→决策、GENERATE→生成
- **PRD 模板本身保留英文**（产物给 AI 读）
- **依赖引用**：结尾"Use `/save-session`" → `/mcc:session-save`；"Run `/prp-plan`" → `/mcc:plan`
- **artifact**: `.claude/PRPs/prds/{kebab-name}.prd.md`

### 2. plan.md (源: ECC prp-plan, 502 → 320)
- **frontmatter**: `description: "生成自包含 PRP 实施计划：抓取所有代码模式和 mandatory reading，实现期间零提问。"` | `argument-hint: "<feature description | path/to/prd.md>"`
- **Plan Template 拆两段**：核心必填 10 节；可选（UX Before/After、Edge Cases Checklist、Browser Validation 标 "可选"）
- **合并三重 checklist**：Verification + Acceptance + Completion → 单一"完成门槛"
- **删除**：L493 "No Prior Knowledge Test"（不可执行）
- **翻译 phase 标题**：DETECT→侦测、PARSE→解析、EXPLORE→探索、RESEARCH→调研、DESIGN→设计、ARCHITECT→架构、GENERATE→生成
- **依赖引用**：`/prp-implement` → `/mcc:implement`；Phase 3 RESEARCH 显式挂 Context7 MCP
- **artifact**: `.claude/PRPs/plans/{kebab-name}.plan.md`

### 3. implement.md (源: ECC prp-implement, 385 → 240)
- **frontmatter**: `description: "执行 PRP plan 文件：每步立即验证（type/lint/test/build 5 级），失败立停。"`
- **Phase 4 VALIDATE 精简为 4 行**：委派 `verification-loop` skill，不重复 skill 内容
- **Integration Testing 代码块**改为"委派 `test-automator` agent（无则降级 curl 本地检测）" + Windows 注
- **Handling Failures**：改为"失败委派给 `debugger` agent 或 `root-cause-analyst` agent" → 注意：debugger 已融合 root-cause，只留 `debugger`
- **依赖更新**：`/code-review` → `/mcc:review`；`/prp-commit` **砍掉**（用户自己 git commit）；`/prp-pr` → `/mcc:pr`
- **翻译 phase**：DETECT/LOAD/PREPARE/EXECUTE/VALIDATE/REPORT/OUTPUT → 侦测/载入/准备/执行/验证/报告/输出
- **artifact**: `.claude/PRPs/reports/{plan-name}-report.md`

### 4. pr.md (源: ECC prp-pr, 185 → 155)
- **frontmatter**: `description: "从当前分支创建 PR：自动找模板、分析 commits、关联 PRP artifacts、push 并 create。"` | `argument-hint: "[base-branch] [--draft]"`
- **依赖更新**：`/code-review` → `/mcc:review`
- **翻译 phase**：VALIDATE/DISCOVER/PUSH/CREATE/VERIFY/OUTPUT → 预检/发现/推送/创建/验证/汇报
- **新增 Windows 注**：PowerShell 里 `gh pr create --body` 用 here-string 而非 heredoc

### 5. full-stack.md (源: wshobson full-stack-feature, 594 → 450)
- **frontmatter**: `description: "端到端全栈特性流水线：9 步（需求/DB/架构/实现/测试+安全+性能/部署/文档），2 个 user approval checkpoint。"`
- **subagent 映射（关键）**：
  - Step 1 Requirements → 内联，无需 agent
  - Step 2 DB Design → `database-optimizer` + `backend-architect`
  - Step 3 Architecture → `backend-architect` + `frontend-developer`
  - Step 4 DB Impl → `database-optimizer` + `python-pro` 或 `typescript-pro`
  - Step 5 Backend Impl → `backend-architect` + `fastapi-pro` 或 `python-pro`/`typescript-pro`
  - Step 6 Frontend Impl → `frontend-developer` + `typescript-pro`
  - Step 7a Test → `test-automator`
  - Step 7b Security → `security-reviewer`（MCC 版名字，不是 wshobson 的 `security-auditor`）
  - Step 7c Performance → `performance-engineer`
  - Step 8 Deployment → `general-purpose` fallback（MCC 未装 deployment-engineer，提示用户）
  - Step 9 Docs → `general-purpose` 或 `prompt-engineer`
- **CRITICAL BEHAVIORAL RULES 第 5 条**改为"Use MCC-bundled agents when available, fall back to general-purpose"
- **artifact 迁移**：`.full-stack-feature/` → `.claude/PRPs/features/{slug}/01-requirements.md` ... `09-documentation.md`
- **翻译 phase 标题和 CHECKPOINT 文案**

### 6. full-review.md (源: wshobson full-review, 598 → 450)
- **frontmatter**: `description: "5 阶段全面代码审查：质量+架构 / 安全+性能 / 测试+文档 / 最佳实践+CI/CD → 优先级汇总。模块或项目级；单点审查请用 /mcc:review。"`
- **subagent 映射**：
  - Step 1A code-reviewer → `code-reviewer` ✓
  - Step 1B architect-review → `backend-architect`（MCC 替代）
  - Step 2A security-auditor → `security-reviewer`
  - Step 2B performance → `performance-engineer`
  - Step 3A test → `test-automator`
  - Step 3B doc → `general-purpose` 或砍（价值低）
  - Step 4A framework best → `python-pro` / `typescript-pro` / `javascript-pro`
  - Step 4B CI/CD → `general-purpose`
- **artifact 迁移**：`.full-review/` → `.claude/PRPs/reviews/full/{timestamp}/00-...05-final-report.md`
- **CRITICAL BEHAVIORAL RULES 与 full-stack 共用**，抽到一个共享文档或各自保留
- **Consolidated Report 模板保留英文**（70 行，产物给 AI 读）

### 7. review.md (源: ECC code-review, 290 → 210)
- **frontmatter**: `description: "代码审查：本地未提交改动 OR GitHub PR（传 PR number/URL 走 PR 模式）。"` | `argument-hint: "[PR# | PR URL]（留空则审本地未提交）"`
- **Phase 2 REVIEW** → 显式 delegate 给 `code-reviewer` agent + `security-reviewer` agent（**并行 Task 调用**）
- **Phase 4 VALIDATE** → 委派 `verification-loop` skill
- **删除**：Publish 阶段的 multi-comment JSON 备用方案
- **Special cases** 集中到 Phase 5 DECIDE 末尾
- **artifact**: `.claude/PRPs/reviews/pr-{N}-review.md`（PR）或 `.claude/PRPs/reviews/local-{timestamp}.md`（Local）
- **覆盖** MCC output 里已有的 review.md shim（Claude Code 内置的那个）

### 8. verify.md (源: ECC verify, 21 → 12)
- **frontmatter**: `description: "跑完整验证流程：build/type/lint/test/security/diff。实际逻辑由 verification-loop skill 执行。"`
- **删除** "Legacy Shim" 措辞，改为"这是 skill 的快捷入口"
- **显式指向** `verification-loop` skill

### 9. test-coverage.md (源: ECC test-coverage, 69 → 60)
- **frontmatter**: `description: "分析测试覆盖率，定位低覆盖文件，生成缺失测试到 80%+。新功能请用 /mcc:tdd。"`
- **Step 3 Generate Missing Tests** → 显式委派 `test-automator` agent
- **Step 1 检测** → 引用 `verification-loop` 的 framework detection
- **加一行**明确和 `/mcc:tdd` 的分工

### 10. tdd.md (源: ECC tdd, 232 → 100)
- **前置**：MCC 需要装 `tdd-workflow` skill（虽然 A3 清单没强制，但 tdd command 必需）→ **标注前置条件**
- **frontmatter**: `description: "强制 TDD 流程：先写失败测试（RED）→ 最小实现（GREEN）→ 重构（REFACTOR）。新功能、bug fix 必走。"`
- **主体改为**"委派 `tdd-workflow` skill"（精简 50 行），如无 skill 则降级到内联 TDD 原则 6 条
- **删除**：200 行 liquidity 领域示例（或移到 `source/commands/references/tdd-example.md`）
- **保留**：DO/DON'T 核心 6 条

### 11. e2e.md (源: ECC e2e, 269 → 120)
- **前置**：推荐装 `e2e-testing` skill
- **frontmatter**: `description: "生成或运行 Playwright E2E 测试：页面对象 → 跑测试 → 产出 artifacts。"`
- **主体改为**"委派 `e2e-testing` skill；无 skill 则降级内联 Playwright 指南"
- **删除**：PMX-Specific 两段（强领域）；170 行 market search 示例
- **保留**：20 行 Page Object Model 骨架示例、Test Artifacts 说明、Flaky Test Detection、DO/DON'T

### 12. build-fix.md (源: ECC build-fix, 62 → 55)
- **frontmatter**: `description: "增量修复构建/类型错误：检测 build 系统 → 逐个错误最小修复 → 同错 3 次失败停下问用户。"`
- **Step 3 Fix Loop** → 委派 `debugger` agent
- **Step 4 Guardrails 保留**（核心价值）
- **无 debugger 时** 降级内联 Edit

### 13. troubleshoot.md (源: SC troubleshoot, 88 → 75)
- **frontmatter**: `description: "多域问题诊断：bug/build/performance/deployment。快速诊断→根因→修复。单 bug 深挖请用 /mcc:fix-bug。"`
- **删除 SC 专有 frontmatter**：`category/complexity/mcp-servers/personas` 字段
- **依赖更新**：
  - Behavioral Flow Step 2 Investigate → 委派 `root-cause-analyst` → **注意：已合并到 `debugger`**，所以改为 `debugger`
  - Step 4 Propose → 委派 `debugger`
  - Step 5 Resolve：build 类 → `/mcc:build-fix`；bug 类 → `/mcc:fix-bug`
- **Examples 本地化**（Null pointer → 空指针异常 等）
- **保留 Will/Will Not 段**

### 14. fix-bug.md (MCC 原创，已存在于 `output/.claude/commands/fix-bug.md`)
- **拷贝**：`mcc-build/output/.claude/commands/fix-bug.md` → `mcc-build/final/source/commands/fix-bug.md`
- **依赖引用修正**：
  - `root-cause-analyst` → 保留（MCC 有）但注意已合并到 `debugger`
  - 实际应改为：委派 `debugger`（它已含根因分析方法论）
  - Related 段 `/troubleshoot` → `/mcc:troubleshoot`；`/verify` → `/mcc:verify`
- **artifact**: `docs/mistakes/bug-{yyyy-mm-dd}-{slug}.md`

### 15. learn.md (源: ECC learn, 71 → 45)
- **frontmatter（新增）**: `description: "从当前 session 提取可复用 pattern：错误解决、调试技巧、workaround、项目约定 → 存为 learned skill。"`
- **主体**：委派 `continuous-learning-v2` skill 做提取和持久化；保留 extraction criteria；删模板细节
- **artifact**: `~/.claude/skills/learned/{pattern-name}.md`

### 16. skill-create.md (源: ECC skill-create, 174 → 100)
- **frontmatter**: `description: "分析 repo git history，提取 commit 约定、文件共变、架构和测试模式，生成 SKILL.md。"` | `allowed_tools: [Bash, Read, Write, Grep, Glob]`
- **删除**：GitHub App Integration 段、Related Commands 里不存在的 `/instinct-import` `/instinct-status` `/evolve`、"Part of [Everything Claude Code]" 广告链接
- **Related Commands 改为**："配合 `continuous-learning-v2` skill 使用"
- **Example Output 砍掉 TS 示例**（50 行），换成"典型输出结构"5 行说明
- **artifact**: 默认 `./skills/` 或 `$ARGUMENTS --output` 覆盖

### 17. session-save.md (源: ECC save-session, 276 → 180)
- **frontmatter**: `description: "把当前 session 的已验证成果、失败路线、下一步 exact action 写入带日期的 session 文件，供 /mcc:session-resume 恢复。"`
- **删除**：`SESSION_FILENAME_REGEX` 和 `session-manager.js` 外部引用（MCC 没装）；简化为"`YYYY-MM-DD-{8-char-shortid}-session.tmp`，shortid 小写字母数字连字符 8 字符起"
- **Example** 从 78 行压到 30 行
- **Notes 末尾琐碎规则**合并到主 Process
- **artifact**: `~/.claude/session-data/`（跨项目全局）

### 18. session-resume.md (源: ECC resume-session, 157 → 120)
- **frontmatter**: `description: "加载最近的 session 文件，展示结构化 briefing（已做什么/什么不要重试/下一步），等用户确认后继续。"`
- **删除**：legacy `~/.claude/sessions/` 兼容逻辑
- **与 session-save** 的 shortid 规则对齐
- **Example** 压到 20 行或挪到 references

### 19. init.md (MCC 原创，已存在于 `output/.claude/commands/init.md`)
- **拷贝**：`mcc-build/output/.claude/commands/init.md` → `mcc-build/final/source/commands/init.md`
- **依赖更新**：
  - `code-explorer` → 保留（MCC 装了）
  - Phase 4 汇报里提 `/prp-prd` → `/mcc:prd`

### 20. explain.md (MCC 原创，已存在于 `output/.claude/commands/explain.md`)
- **拷贝**：`mcc-build/output/.claude/commands/explain.md` → `mcc-build/final/source/commands/explain.md`
- **无需改动**（已是中文，无外部依赖）

---

## 最终流水线图（给 README.md 用）

```
入口/查询：/mcc:init · /mcc:explain

PRP 流水线（灵活单线）：
/mcc:prd → /mcc:plan → /mcc:implement → /mcc:verify → /mcc:review → /mcc:pr

Full-Stack 大流水线（9 步/2 批准点）：
/mcc:full-stack → (含上面所有步骤但更细分+并行)

审查：
单点 /mcc:review | 全面 /mcc:full-review

诊断三档（窄→广）：
/mcc:build-fix（专 build） → /mcc:fix-bug（单 bug 深挖） → /mcc:troubleshoot（多域）

测试三路：
/mcc:tdd（新代码先测） /mcc:test-coverage（老代码补测） /mcc:e2e（用户流）

会话持久：/mcc:session-save → /mcc:session-resume

学习沉淀：/mcc:learn（session→skill） /mcc:skill-create（git→skill）
```

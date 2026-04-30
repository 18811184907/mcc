# ADR-0001: codex CLI 作为差异化对抗审查员（不是执行器）

**Status**: Accepted
**Date**: 2026-04-30
**Version**: v2.7.0

## Context

v2.6.4 用户做了一轮 codex 独立 audit，抓出 **8 个 Claude agent 全漏的 4 个真 bug**（包含 1 CRITICAL 真 secret 泄漏）。这证明：

1. **不同模型 = 不同盲区**。Claude (Anthropic) 和 codex (OpenAI GPT) 训练数据 + 推理偏好不同 → 同一段代码看到的 bug 不重叠。
2. **跨工具 audit 抓的 bug 单工具长跑无法发现**。多 agent 并行不等于多模型并行。
3. v2.6.4 代价：用户手动跑 codex + 人肉 paste finding。这是**摩擦点**——可以自动化。

讨论过两种方向：

### 方向 A: codex 当**执行器**

让 codex 接管 single-file impl / mechanical 任务。Claude 主 plan + decision，codex 干活。

**否决理由**：
- 用户更信任 Claude 写代码（明确表达）
- codex execution style 跟 Claude 不一致 → 路由后产出还要 Claude 二审，反而开销翻倍
- codex 5h 限制 + 不同模型 → 主 implementation 路径不可靠

### 方向 B: codex 当**对抗审查员** ← 最终选择

Claude 主 plan + impl + decision，codex 在关键节点（plan 完成 / commit / PR / 大 step）做红队审查。

**支持理由**：
- v2.6.4 已实证差异化模型抓更全
- 用户对 Claude 信任不被打破，codex 是**辅助**不是替代
- ROI 高：codex 5-10s 跑一次能挡掉 plan 阶段一个返工小时
- 用户不用动手——全自动

## Decision

采纳方向 B。**Level 1**（红队 prompt 风格）实施 v2.7.0：

1. **新 lib `source/hooks/scripts/lib/codex-runner.js`** —— wrapper，含：
   - `resolveCodexBin()` 解析绝对路径（Windows .cmd 兼容）
   - `runCodexAudit({prompt, cwd, timeoutMs})` 主入口，prompt 走 stdin（防 shell injection）
   - rate-limit 检测 7 个关键词模式 → 写 `~/.claude/.codex-blocked-until` flag
   - auto-probe 探测恢复（指数退避 5/10/20/40/60min）
   - 优雅降级：未装 / 限流 / 错误 → `{skipped: true, reason: '...'}` 不阻塞主线
   - `REDTEAM_TEMPLATES`：4 个红队 prompt 模板（audit_plan / audit_diff / audit_implementation / audit_pr）

2. **新 skill `codex-audit`** —— Claude 行为规则：
   - 何时自动触发（plan/implement/review/pr 关键节点）
   - 红队 prompt 模板（强迫 codex 找问题，禁止"代码看起来没问题"输出）
   - 复现验证规则（**Claude 永远不直接信 codex finding**，必须复现验证）
   - 三档分类（真 bug 修 / 误报记 ADR / 模糊升给用户）
   - Adversarial loop 上限 2 轮（防 codex 编 finding）

3. **新 agent `codex-reviewer`** —— 角色卡描述（让 Claude 知道有这个外部"agent"可派）

4. **新 command `/cross-check`** —— 手动入口（备选；99% 场景已被自动触发覆盖）

5. **修改既有 commands**：
   - `/plan` Phase 7 自动 codex audit plan 找盲区
   - `/implement` 单 step 完成后大改动自动审
   - `/review` 升级到 3 路并行（reviewer + security + codex）
   - `/pr` 升级到 4 路并行预检

6. **修改 `mcc-principles`** —— 加"差异化审查"元规则（第 4 条，跟主动性 / 并行优先 / 核心指令并列）

## Consequences

### 正面

- **bug 检出率提升**（v2.6.4 实证：差异化盲区 4 个真 bug）
- **plan 阶段返工减少**（codex 5-10s 找盲区比 implement 后才发现成本低 10×）
- **完全自动**（用户从不手动调 codex）
- **优雅降级**（codex 未装 / 限流时主线继续）
- **跨平台**（Windows .cmd / Unix / Mac，跟 user-vault 同款 `secureWrite` 风格）

### 负面 / 风险

- **codex 误报率不低**（30-50%）→ 加复现验证规则缓解
- **Claude 跟 codex 意见冲突时该信谁**？答：**Claude 拿决策权**，codex 是"second opinion"不是"judge"
- **codex 5h 限制**：限流时降级（方案：写 flag + auto-probe 5-60min 间隔重试，不死等 1h）
- **token 用量增加**（每次 audit 5-10k token）→ 监控 `tokens used N` 输出做累计预警（v2.7.x 留作 future）
- **OpenAI auth 依赖**：用户的 ChatGPT 账号 — 如果 logout 整套 codex 集成失效（runner 会优雅降级）

### 不做的事（边界）

- ❌ codex 主导 plan 决策（决策需 holistic 视野 + 用户对话）
- ❌ codex 写 / 改代码（只产 finding，Claude 复现验证后做 Edit）
- ❌ Adversarial loop > 2 轮（避免 codex 编 finding）
- ❌ 把 codex 当用户对话伙伴（每次 exec 是 fresh session）
- ❌ Level 2 / Level 3 对抗（two-pass debate / disagree-by-design）—— 留 v2.8+ 实测 Level 1 后再评估

## Alternatives Considered

### Alt-1: codex 装为 MCP server（永久启动）

`codex mcp-server` 作为 stdio MCP，Claude 通过 `mcp__codex__exec` tool 调。

**否决**：
- MCP server 长跑进程 session 结束不干净
- codex 当前只用于"任务执行器"，不需要持久状态
- Bash wrapper 简单 + 每次调用独立 + fallback 处理更直接

### Alt-2: codex 走 stdout 解析格式化 finding (JSON output)

让 codex 用 `--output-format json` 之类输出结构化 finding。

**否决**：
- codex CLI 0.125 不支持显式 JSON 输出 mode
- 让 codex 自由文本输出 + Claude 解析更稳健
- LLM 强制 JSON 偶发结构错误，自由文本更鲁棒

### Alt-3: 等 v2.8+ 做 Level 2/3

Level 2 (two-pass debate) / Level 3 (disagree-by-design) 是真"对抗"。

**当前选 Level 1 而不是直接 Level 2/3**：
- Level 1 ROI 已经显著（v2.6.4 实证）
- Level 2/3 复杂度高，需要先用 Level 1 数据评估值不值
- "完美" 是 "够好" 的敌人——先发 Level 1 用一周，反馈驱动 v2.8

## References

- v2.6.4 release notes：codex 找出的 4 个 Claude 漏掉的真 bug
- `source/skills/codex-audit/SKILL.md` —— 行为规则
- `source/hooks/scripts/lib/codex-runner.js` —— 实现
- `source/agents/codex-reviewer.md` —— 角色卡
- 相关 commit: v2.7.0 main commit

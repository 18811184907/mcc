# Codex Audit Rejection Log · 2026-04-30

按 v2.7.1 codex-audit skill 三层架构：Layer 2 finding-validator subagent 驳回的 codex finding 写在这里，含 codex 原 finding + Claude 复现 reasoning。

---

## REJECTED #1: PROJECT_VAULT 相对路径不触发同步

**codex 原 finding** (HIGH):

> post-vault-sync.js 用 `/\/docs\/PROJECT_VAULT\.md$/` 匹配原始 file_path，
> 如果工具传 `docs/PROJECT_VAULT.md`，直接 return。复现结果：相对路径不
> 生成 .env.local，绝对路径会生成。位置：post-vault-sync.js (line 80)

**Layer 2 验证流程** (finding-validator subagent fresh, 无原对话 context):

- ✓ 字面正确：`post-vault-sync.js:80-82` 正则确实是 `/\/docs\/PROJECT_VAULT\.md$/i`，前导 `/` 真存在
- ✓ 相对路径 `docs/PROJECT_VAULT.md` 字面不命中前导 `/`
- ✗ **但攻击场景在 Claude Code 运行时不可达**

**Reasoning** (为啥 reject):

1. **Claude Code 行为**：`Write` / `Edit` / `MultiEdit` tool 的 `tool_input.file_path` 始终是**绝对路径**。Claude Code 上游在接受用户/模型输入时已经 resolve 成绝对路径。
2. **同项目共识**：本仓库其他所有 hook (`config-protection.js:92` / `gateguard-fact-force.js:369` / `post-claudemd-sync.js:202`) 的 `extractTargetFile` 实现都直接用该路径做正则匹配，**无一处加 `path.resolve()` 防御**。说明整个 hook 体系的共识是"上游传来即绝对路径"。
3. **Windows 兼容**：line 80-82 已有 `replace(/\\/g, '/')` normalize，Windows 绝对路径 `C:/Users/.../docs/PROJECT_VAULT.md` 也能命中前导 `/` 正则（C:/ 后面就是 `/`）。
4. **退一步防御**：即使 codex 假设的"相对路径"真进来，line 84 `fs.existsSync(filePath)` 在 hook 进程 cwd 下找不到相对路径文件直接 return → 安全 no-op，不会错误同步。

**Decision**: **不修改正则**。理由：
- 不存在真实攻击向量
- 加 `path.resolve()` 等防御是无用代码增加
- 如果 Claude Code 哪天开始传相对路径（极不可能），整个 hook 体系都要改，不是单点 fix

**如果将来发现真有相对路径触发**：grep 搜整个 source/ 看哪个 hook 收到相对路径，统一加 normalize。当前不加。

**Validator agentId**: a768d12b88bd790dd（fresh subagent，独立 Read + Bash 复现）

---

## 总结

按 v2.7.1 设计：
- codex finding 必须 Claude 复现验证才修
- validator 严格判别 "宁可 ambiguous 也不要错 confirmed"
- rejected = 字面观察可能正确，但攻击场景在实际系统不可达
- 记 ADR 给未来排查保留 reasoning trace

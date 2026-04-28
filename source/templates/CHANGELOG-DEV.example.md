# Dev Changelog · 开发实时流水

> Claude 自动维护。倒序：最新在最上面。每条 ≤ 5 行。
>
> **4 种条目**：
> - `◇` 需求 / 想法 / 改主意
> - `✓` 完成的实质改动（含 commit/branch）
> - `⚠` 卡点 / blocker / 等用户决策
> - `→` 下一步具体动作
>
> **区别于其他文档**（不要重复）：
> - `git log` 已落盘的代码 → 这里写包括 *未落盘的* 需求 / 想法 / 卡点
> - `docs/adr/` 终态决策 → 这里写**正在讨论中**的选项
> - `docs/SCHEMA.md` 数据结构 → 这里只写"加了 X 表"+ 指向 SCHEMA
> - `docs/mistakes/` bug 根因 → 这里只写"卡在 X，怀疑 Y"
> - `.claude/PROJECT_VAULT.md` 密钥 → 这里**绝不**写任何 secret
>
> **用户从不需要手动维护**。Claude 在对话里检测到 4 类信号时主动追加。
> 完整规则见 `dev-changelog` skill。

---

<!-- Claude 在这下面追加日期段。第一条会自动建 ## YYYY-MM-DD。 -->
<!-- 示例（删除后开始记录）：

## 2026-04-28

- ◇ 用户提议 X 想法（暂未决定）
- ✓ 修了 Y bug（commit: abc1234）
- ⚠ Z 测试 flaky，怀疑是时序问题，先 skip
- → 明天先确认 Z 是否需要 mock 时间

-->

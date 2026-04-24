# 管理员指南 · 怎么配 MCC Team Backup 给同事用

> 给你（团队管理员 / 就是读这个文档的"小白 leader"）看的一次性配置指南。
> 你做完这些，同事就能用 `/backup "xxx"` 一键备份了。

---

## 你需要花的时间：**首次 10 分钟，之后 3 个月一次 5 分钟**（换 PAT）

---

## 一、一次性：建 PAT token

PAT = 访问 GitHub 的"钥匙串"。同事用这个 PAT 才能把代码推到你的 GitHub 仓库。

### 步骤

1. **打开网页**：https://github.com/settings/personal-access-tokens/new
   （如果要你登录，用你的 `18811184907` 账号登）

2. **填写**：
   - **Token name**：`mcc-team-2026-04`（名字随意，带日期方便管理）
   - **Expiration**：选 **Custom** → 选一个 3 个月后的日期（**不要永不过期**，有泄露风险）
   - **Resource owner**：保持 `18811184907`（你自己）
   - **Repository access**：选 **All repositories**（省事；未来换成 `Only select repositories` 更安全）

3. **Permissions** 部分往下翻，只勾 **Repository permissions**：
   - **Administration**：选 **Read and write**（让同事能帮你建新 repo）
   - **Contents**：选 **Read and write**（让同事能读写代码）
   - **Metadata**：**Read-only**（默认的，别动）
   - **其他全部保持 No access**

4. 拉到底，点绿色按钮 **Generate token**

5. **立刻复制屏幕上那串 `ghp_...` 开头的长字符串**（**离开这个页面就再也看不到了**）

6. 粘贴到一个记事本临时保存（等下要填到脚本里）

### 警告

- ❌ 不要把 PAT 发到公开渠道（朋友圈 / 公开群 / 博客）
- ❌ 不要 push 到 GitHub 公开仓库的代码里
- ✅ 只在"发给同事的 team-install.ps1 文件"里用
- ✅ PAT 每 3 个月过期，到期前提前 1 周给同事发新脚本

---

## 二、填写 team-install.ps1

1. 在 MCC 安装包里找到 `team-install.ps1`（就是你要发给同事的那个文件）

2. 用**记事本**打开（右键 → 打开方式 → 记事本）

3. 最顶部有这两行（注释告诉你填哪里）：

   ```powershell
   # ═══ 管理员一次性填这两行 ═══
   $TEAM_PAT  = "ghp_CHANGE_ME_FILL_IN_YOUR_PAT_HERE"
   $TEAM_USER = "18811184907"
   ```

4. 把 `ghp_CHANGE_ME_FILL_IN_YOUR_PAT_HERE` 替换成你刚复制的 PAT。**注意保留左右两边的英文双引号**！

   填好后大概这样：
   ```powershell
   $TEAM_PAT  = "ghp_ABc123DeFGhIjKlMnOpQrStUvWxYz"
   $TEAM_USER = "18811184907"
   ```

5. 保存文件（Ctrl+S）

---

## 三、发给同事

发送方式（按**安全性从高到低**排）：

| 方式 | 安全吗 | 备注 |
|---|---|---|
| 🟢 U 盘 / 面对面拷 | 最安全 | 小团队推荐 |
| 🟢 企业微信"保密文件"（阅后即焚） | 安全 | 要求同事当场保存 |
| 🟡 普通微信 / QQ 发文件 | 一般 | 如果会话内容被第三方看到就危险 |
| 🔴 邮件 / 云盘公开链接 | 危险 | 别用 |

发送时附上一句话：
> "双击（右键选"用 PowerShell 运行"）这个文件就能装。装完看 TEAM-MEMBER-GUIDE.md，以后写代码敲 /backup 就行。"

---

## 四、3 个月后：PAT 到期换新的

你会收到 GitHub 的邮件提示 PAT 快过期。这时：

1. 去 https://github.com/settings/personal-access-tokens → 找到之前那个 token
2. 如果还能点 **Regenerate**（再生一个，有效期重置）→ 用这个
3. 如果不能，重新跑一遍"步骤一"建新 PAT
4. 重新编辑 `team-install.ps1`，替换 `$TEAM_PAT` 里的字符串
5. 把新的 `team-install.ps1` 发给所有同事
6. 同事重新双击跑一次（会覆盖旧的 PAT，其他不变）

---

## 五、哪里能看所有同事推过来的代码

浏览器打开 **https://github.com/18811184907?tab=repositories**

你会看到每个同事在每个项目下各自建的 `{项目名}-backup` 仓库。

每个 backup 仓库里的 commit 会显示**同事的名字**（他们在 `/backup-setup` 时填的名字），所以你能看清是谁做的什么。

---

## 六、给同事的权限边界

他们用你的 PAT 能做这些（正常工作需要）：
- ✅ 在你账号下建新 repo
- ✅ 往你账号下的 repo 推代码
- ✅ 看你账号下的 repo

他们**不能**做这些（PAT 权限没给）：
- ❌ 删 repo
- ❌ 改你的账号设置
- ❌ 看你的私人邮件 / 其他账户信息
- ❌ 冒充你在 Issues/PR 里发帖（只能 push commit）

---

## 七、发现同事误用（比如把个人项目备份过来了）

简单做法：
1. 在浏览器删掉那个仓库：进 `github.com/18811184907/xxx-backup` → Settings → Danger Zone → Delete this repository → 确认
2. 让那个同事在他本地敲 `/backup-off` 关掉该项目的备份

---

## 八、想彻底下线 Team Backup 功能

如果不想再用了：
1. 在你账号下 **revoke PAT**：https://github.com/settings/personal-access-tokens → 找到那个 token → Delete
2. 同事本地的 `/backup` 命令会立刻失效（push 认证失败）
3. 同事运行 `/backup-off` 关掉 post-commit hook

---

## FAQ

### Q: 同事是不是能用这个 PAT 干任何事

A: 不能。PAT 只给了建 repo + 读写代码权限，其他都禁了（见上面"权限边界"）。但**同事如果误把脚本发给外部人**，外部人拿到 PAT 就能滥用。所以 3 个月换一次是关键防线。

### Q: 我不记得 PAT 是多少了（没保存）怎么办

A: 回不去了。按"步骤一"重新建一个，重新填脚本，重新发同事。

### Q: 我想把代码放到 Organization 不放在个人账号下

A: 好主意。去 https://github.com/organizations/new 建一个免费 Organization（Free 版免费），把 `$TEAM_USER` 改成 org 名字，重新建 PAT（Resource owner 选 org），给同事新脚本。

### Q: 同事越来越多，管理 PAT 太麻烦

A: 这时候就该升级 Organization + 给每个同事建自己的 GitHub 账号 + 加 collaborator。每人用自己的 PAT 就不用你管了。MCC v2 可能做这个支持。

---

## 一句话总结

**你**：建 PAT → 填脚本 → 发文件。3 个月一次。

**同事**：双击脚本 → `/backup "xxx"`。每天 10 秒。

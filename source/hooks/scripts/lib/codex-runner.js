'use strict';

/**
 * codex-runner — wrap OpenAI codex CLI for adversarial audit calls.
 *
 * v2.7.0 design:
 *   - codex 作为差异化审查员，Level 1（红队 prompt）
 *   - rate-limit 检测 + 优雅降级（写 flag → skip codex 不阻塞主线）
 *   - 自动 probe 探测流量恢复（不等死 1h）
 *   - Claude 拿最终决策权，codex finding 必须 Claude 复现
 *
 * 用法:
 *   const { runCodexAudit } = require('./codex-runner');
 *   const result = await runCodexAudit({
 *     prompt: 'red-team this diff: ...',
 *     cwd: projectRoot,
 *     timeoutMs: 60_000,
 *   });
 *   if (result.skipped) { ... fallback ... }
 *   else { ... result.output ... }
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

// 状态文件路径 — 用 getter 函数让 tests 能 override HOME 后重新解析
function getFlagPath() {
  // 优先 HOME / USERPROFILE env (跟 lib/utils.js getHomeDir 风格一致)
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.claude', '.codex-blocked-until');
}
// 兼容老消费者 — 但生产环境用 getFlagPath()
const FLAG_PATH = getFlagPath();

// rate-limit 关键字（codex CLI stderr 模式）
const RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /\b429\b/,
  /quota/i,
  /try again in/i,
  /exceeded/i,
  /too many requests/i,
  /usage limit/i,
];

// auto-probe 间隔策略（指数退避）
const PROBE_INTERVALS_MIN = [5, 10, 20, 40, 60]; // 探测间隔分钟
const DEFAULT_BLOCK_HOURS = 1; // 写 flag 时默认假设 1h 后可能恢复

// Cache resolved codex binary path. Node's spawnSync 在 Windows **不会**
// 自动通过 PATHEXT 解析 .cmd / .bat —— 直接 spawn('codex') 在 Windows 拿
// ENOENT。必须先用 where.exe / which 找绝对路径。
let cachedCodexPath = undefined; // undefined = 未查；null = 查过但没装；string = 路径

function resolveCodexBin() {
  // 测试 / 显式 override
  if (process.env.CODEX_BIN_OVERRIDE) return process.env.CODEX_BIN_OVERRIDE;
  if (cachedCodexPath !== undefined) return cachedCodexPath;

  const finder = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(finder, ['codex'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    timeout: 3000,
  });
  if (result.status === 0 && result.stdout) {
    // where.exe 可能多行（codex / codex.cmd / codex.ps1）—— 优先 .cmd
    const lines = result.stdout.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    cachedCodexPath = lines.find(l => /\.cmd$/i.test(l)) || lines[0] || null;
  } else {
    cachedCodexPath = null;
  }
  return cachedCodexPath;
}

// Windows 下 Node 的 spawnSync **不能直接执行** .cmd / .bat 文件（EINVAL）。
// v2.7.0: 用 shell:true wrap，但触发 Node DEP0190 deprecation warning（args 不会被
// shell escape）。
// v2.7.1: 改用显式 cmd /c <bin> args... 调用，绕过 shell:true，没 deprecation。
// 安全边界保持不变：args 全清洁（hard-coded 'exec' / '--skip-git-repo-check' / '-'），
// prompt 永远走 stdin（input 字段）。所以即便走 cmd 也无 injection 风险。
function spawnCodex(bin, args, opts = {}) {
  const onWindows = process.platform === 'win32';
  const isCmdFile = onWindows && /\.(cmd|bat)$/i.test(bin);

  if (isCmdFile) {
    // cmd /c <bin> args... — 显式 wrap，args 作为独立参数传给 cmd.exe
    // cmd.exe 自己负责把后续 token 还原成 .cmd 的 %1 %2... 所以 args 顺序保留。
    return spawnSync('cmd', ['/c', bin, ...args], opts);
  }
  // 其他情况（exe / Unix shebang / .js with shebang）直接 spawn
  return spawnSync(bin, args, opts);
}

/**
 * 检查 codex CLI 是否装。
 * @returns {boolean}
 */
function isCodexInstalled() {
  const bin = resolveCodexBin();
  if (!bin) return false;
  const result = spawnCodex(bin, ['--version'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    timeout: 3000,
  });
  return result.status === 0;
}

/**
 * 读 flag 文件，返回当前 block 状态。
 * @returns {{blocked: boolean, blockedUntil?: Date, lastProbeAt?: Date, probeAttempts?: number}}
 */
function readBlockState() {
  const flagPath = getFlagPath();
  if (!fs.existsSync(flagPath)) return { blocked: false };

  let raw;
  try { raw = fs.readFileSync(flagPath, 'utf8'); }
  catch (_) { return { blocked: false }; }

  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (_) { return { blocked: false }; }

  const now = new Date();
  const blockedUntil = parsed.blocked_until ? new Date(parsed.blocked_until) : null;
  const lastProbeAt = parsed.last_probe_at ? new Date(parsed.last_probe_at) : null;
  const probeAttempts = parsed.probe_attempts || 0;

  // expired
  if (blockedUntil && now >= blockedUntil) {
    try { fs.unlinkSync(flagPath); } catch (_) {}
    return { blocked: false };
  }

  return { blocked: true, blockedUntil, lastProbeAt, probeAttempts };
}

/**
 * 写 flag — codex 命中 rate-limit 时调用。
 */
function writeBlockFlag({ probeAttempts = 0 } = {}) {
  const now = new Date();
  const blockedUntil = new Date(now.getTime() + DEFAULT_BLOCK_HOURS * 60 * 60 * 1000);
  const data = {
    blocked_at: now.toISOString(),
    blocked_until: blockedUntil.toISOString(),
    last_probe_at: now.toISOString(),
    probe_attempts: probeAttempts,
    note: 'codex-runner: rate-limit detected. Auto-probe will retry per backoff schedule.',
  };
  try {
    const flagPath = getFlagPath();
    fs.mkdirSync(path.dirname(flagPath), { recursive: true });
    fs.writeFileSync(flagPath, JSON.stringify(data, null, 2));
  } catch (e) {
    process.stderr.write(`[codex-runner] failed to write flag: ${e.message}\n`);
  }
}

/**
 * 是否到了下一次 probe 时间（指数退避）。
 */
function shouldProbe(state) {
  if (!state.lastProbeAt) return true;
  const idx = Math.min(state.probeAttempts || 0, PROBE_INTERVALS_MIN.length - 1);
  const intervalMs = PROBE_INTERVALS_MIN[idx] * 60 * 1000;
  const nextProbeAt = new Date(state.lastProbeAt.getTime() + intervalMs);
  return new Date() >= nextProbeAt;
}

/**
 * 跑一个最小 probe（"say ok"）测 codex 是否恢复。
 * 不消耗多少 token；恢复了立即清 flag。
 * @returns {boolean} 是否仍然 blocked
 */
function probeRecovery() {
  const bin = resolveCodexBin();
  if (!bin) return true; // 未装直接当 blocked
  // probe 用极短 prompt "say ok"。args 全清洁可走 shell。
  const result = spawnCodex(bin, ['exec', '--skip-git-repo-check', 'say ok'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    timeout: 15_000,
  });
  const stderr = String(result.stderr || '');

  // v2.7.2 hotfix (Layer 2 finding-validator 发现): 跟主路径 runCodexAudit 一致
  // 双校验。之前这里仍用 combined = stderr+stdout 扫，是 v2.7.1 修主路径时
  // 漏掉的同款 false positive。stdout 永不扫，exit 0 = 恢复。
  if ((result.error || result.status !== 0)
      && RATE_LIMIT_PATTERNS.some(re => re.test(stderr))) {
    return true;
  }
  // exit code 非 0 但不是 rate-limit → 当临时错误，不算恢复也不算 blocked
  if (result.status !== 0) {
    return true;
  }
  return false; // 恢复了
}

/**
 * 更新 flag 的 probe 状态（次数 + 时间），不清 flag。
 */
function updateProbeState(state) {
  const flagPath = getFlagPath();
  const probeAttempts = (state.probeAttempts || 0) + 1;
  let raw;
  try { raw = JSON.parse(fs.readFileSync(flagPath, 'utf8')); }
  catch (_) { return; }
  raw.last_probe_at = new Date().toISOString();
  raw.probe_attempts = probeAttempts;
  try { fs.writeFileSync(flagPath, JSON.stringify(raw, null, 2)); }
  catch (_) { /* noop */ }
}

/**
 * 解析 codex exec 输出，提取 token 用量（如有）。
 */
function parseTokenUsage(combined) {
  const m = combined.match(/tokens used\s+([\d,]+)/i);
  if (m) return parseInt(m[1].replace(/,/g, ''), 10);
  return null;
}

/**
 * 主入口：跑一次 codex audit。
 *
 * @param {object} opts
 * @param {string} opts.prompt - 红队 prompt（self-contained，含路径/上下文）
 * @param {string} [opts.cwd] - 工作目录（codex 会 cd 进去）
 * @param {number} [opts.timeoutMs=60000] - 超时
 * @param {boolean} [opts.skipGitRepoCheck=true] - 默认跳过 git repo 检查
 * @returns {{ skipped: boolean, reason?: string, output?: string, tokensUsed?: number, durationMs?: number }}
 */
function runCodexAudit(opts) {
  const { prompt, cwd, timeoutMs = 60_000, skipGitRepoCheck = true } = opts || {};
  if (!prompt || typeof prompt !== 'string') {
    return { skipped: true, reason: 'no prompt provided' };
  }

  // 1. CLI 装否
  if (!isCodexInstalled()) {
    return { skipped: true, reason: 'codex CLI not installed (run: npm install -g @openai/codex)' };
  }

  // 2. flag 检查 + auto-probe
  const state = readBlockState();
  if (state.blocked) {
    if (shouldProbe(state)) {
      const stillBlocked = probeRecovery();
      if (stillBlocked) {
        updateProbeState(state);
        return {
          skipped: true,
          reason: `codex rate-limited (probe ${state.probeAttempts + 1} failed); next probe in ${PROBE_INTERVALS_MIN[Math.min((state.probeAttempts || 0) + 1, PROBE_INTERVALS_MIN.length - 1)]}min`,
        };
      }
      // 恢复了！清 flag
      try { fs.unlinkSync(getFlagPath()); } catch (_) {}
      // 继续往下跑真任务
    } else {
      const remainingMs = state.blockedUntil.getTime() - Date.now();
      const remainingMin = Math.max(1, Math.round(remainingMs / 60_000));
      return {
        skipped: true,
        reason: `codex rate-limited (next auto-probe in <${PROBE_INTERVALS_MIN[Math.min(state.probeAttempts || 0, PROBE_INTERVALS_MIN.length - 1)]}min, expires in ${remainingMin}min)`,
      };
    }
  }

  // 3. 跑真任务
  const bin = resolveCodexBin();
  if (!bin) return { skipped: true, reason: 'codex CLI not installed' };

  // 关键安全决策: prompt **走 stdin** 而非 arg。这样无论 prompt 多长 / 含什么
  // shell 元字符，都不会被解释。shell:true 只 wrap 清洁 args（exec / -- 等）。
  const args = ['exec'];
  if (skipGitRepoCheck) args.push('--skip-git-repo-check');
  args.push('-'); // codex exec - 表示从 stdin 读 prompt

  const startedAt = Date.now();
  const result = spawnCodex(bin, args, {
    input: prompt,
    cwd: cwd || process.cwd(),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
  const durationMs = Date.now() - startedAt;

  const stderr = String(result.stderr || '');
  const stdout = String(result.stdout || '');

  // 4. rate-limit 检测（v2.7.1 fix）
  // 关键: 必须同时满足 (exit code 非 0) AND (stderr 含关键词)。
  // 之前 v2.7.0 把 stdout + stderr 合并扫 → codex 审查含"rate-limit"主题的代码时
  // 输出里自然提到 "rate-limit" 等词被误判为限流。stdout 永远不该被扫。
  // exit 0 = 成功，无论 stdout 含啥词都不是限流。
  const isRealRateLimit = (result.error || result.status !== 0)
    && RATE_LIMIT_PATTERNS.some(re => re.test(stderr));

  if (isRealRateLimit) {
    writeBlockFlag({ probeAttempts: 0 });
    return {
      skipped: true,
      reason: 'codex rate-limited just now (flag written, auto-probe will recover)',
    };
  }

  // 5. 其他错误（超时 / spawn 失败 / exit 非 0 但不是限流）
  if (result.error || result.status !== 0) {
    const detail = result.error?.message
      || (stderr.split('\n').filter(Boolean).slice(-3).join(' | '))
      || `exit ${result.status}`;
    return {
      skipped: true,
      reason: `codex error: ${detail}`,
      durationMs,
    };
  }

  // 6. 成功
  return {
    skipped: false,
    output: stdout.trim(),
    tokensUsed: parseTokenUsage(stderr + '\n' + stdout), // tokens 解析两边都看 OK
    durationMs,
  };
}

/**
 * 红队 prompt 模板库 (Level 1 对抗).
 * 调用方传 vars 填占位。
 */
const REDTEAM_TEMPLATES = {
  /**
   * 审 plan 找盲区
   */
  audit_plan: ({ planContent, projectContext }) =>
`你是经验丰富的资深架构师 + 渗透测试员。下面是一份开发 plan：

\`\`\`markdown
${planContent}
\`\`\`

项目上下文: ${projectContext || '(自行从 cwd 推断)'}

你的任务（红队视角，故意挑刺）:
1. **测试覆盖盲区**: plan 漏掉了哪些测试场景？特别是边界 / 并发 / 错误路径。
2. **架构耦合风险**: 跟现有代码的隐性依赖、循环引用、数据流断裂。
3. **顺序风险**: 步骤顺序错了会怎样？哪些步骤实际有依赖但 plan 没标？
4. **常见 pattern 陷阱**: 这个 plan 用了哪些"业界常见但有坑"的 pattern？
5. **可度量验证**: plan 里"完成"标准是否可机械验证？

输出格式:
- 严重度（Critical/High/Medium/Low）
- 具体盲区（一句话 + plan 里对应行/段）
- 复现/触发条件（让 Claude 能验证）
- 建议补什么

如果 plan 完美无缺，**你必须给反例**：构造一个能让这 plan 失败的实际场景。绝不写"plan 看起来不错"。`,

  /**
   * 审 git diff 找 bug
   */
  audit_diff: ({ gitRange, focusAreas }) =>
`你是渗透测试员 + 代码审查员。审 \`git diff ${gitRange || 'HEAD~1..HEAD'}\` 的改动。

红队视角扫这几类（按你判断的 severity 排）:
${focusAreas || `1. 安全：path traversal / command injection / secret 泄漏 / SSRF / unsafe eval
2. 错误处理：吞错 / 静默失败 / 误导 fallback / Promise 漏 catch
3. 跨平台：Windows / Unix 路径差异 / line ending / shell 特殊字符
4. 并发：race / TOCTOU / 多进程同时写
5. 可逆性：万一你这次修复是错的，怎么 rollback`}

输出格式:
- [Severity] file:line — 一句话问题描述
  - 攻击向量/触发场景（具体到 input）
  - 修复建议（最小 diff）

**禁止**:
- 写"代码看起来没问题" — 必须给至少 1 个 finding（哪怕是 Low）
- 复述 diff 内容 — 我已经看过 diff
- 给抽象建议如"应该加错误处理" — 必须具体到哪行哪个分支

如果你认为修复彻底，**用反证**: 构造一个能突破现有防御的 input。`,

  /**
   * 审一个 implementation step
   */
  audit_implementation: ({ filePath, taskSpec }) =>
`你是渗透测试员。Claude 刚实现了这个任务:

任务规格:
\`\`\`
${taskSpec}
\`\`\`

实现文件: ${filePath}

红队任务: 假设你是攻击者 / 用户故意找 bug，列出 5 个让这个实现**实际失效**的场景。

判别标准:
- ✓ 真 finding: 给具体 input 让 Claude 能复现
- ✗ 不是 finding: "应该加 X" 但没说怎么实际打破现有代码

输出: 每条标 [Severity] + 复现步骤 + 一句话原因。

如果你认真审了找不到任何 bug，列 3 个**潜在未来 bug**（依赖外部条件 / 边界变化时会出问题），并给触发条件。`,

  /**
   * 审 PR / commit 综合
   */
  audit_pr: ({ prNumber, gitRange, summary }) =>
`你是 staff engineer 做 PR review。

PR: ${prNumber || '本地 commit'}
diff range: ${gitRange || 'HEAD~1..HEAD'}
summary: ${summary || '(从 commit message 读)'}

红队 4 维度审 (并行扫，每维度都给 finding):

1. **安全维度**: 攻击向量、注入、信息泄漏、权限提升
2. **正确性维度**: 边界条件、并发 race、数据完整性
3. **可维护性维度**: 隐性耦合、未来变更风险、debug 友好性
4. **跨平台维度**: Windows/Unix/macOS 差异，shell 特殊字符

每维度至少 1 个 finding。如果某维度真的找不到，写"该维度未发现新 risk"但同时给 1 个**可能在未来变更时暴露的** latent risk。

按 severity 排序输出。每条带:
- [DOMAIN/Severity] file:line
- 复现路径（具体 input + 步骤）
- 修复建议`,
};

// For tests: 重置缓存的 codex bin 路径（让下次调用重新解析 CODEX_BIN_OVERRIDE）
function _resetBinCache() {
  cachedCodexPath = undefined;
}

module.exports = {
  runCodexAudit,
  isCodexInstalled,
  resolveCodexBin,
  readBlockState,
  writeBlockFlag,
  probeRecovery,
  shouldProbe,
  parseTokenUsage,
  RATE_LIMIT_PATTERNS,
  REDTEAM_TEMPLATES,
  FLAG_PATH,
  PROBE_INTERVALS_MIN,
  _resetBinCache,
};

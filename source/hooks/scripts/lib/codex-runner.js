'use strict';

/**
 * codex-runner v2.8 — 流式 streaming wrapper for OpenAI codex CLI.
 *
 * v2.8 重写动机:
 *   v2.7.x 用 spawnSync batch 模式，问题：
 *     1. codex 大 prompt 思考 > timeoutMs 直接被砍
 *     2. 没有实时进度，用户看像死了
 *     3. Windows cmd /c stdin 走 GBK codepage 中文 prompt 乱码
 *
 *   v2.8 改 spawn + --json 流式读 jsonl 事件:
 *     1. idle-timeout 而非 total-timeout (codex 在思考 = 还有事件出 = 不算 idle)
 *     2. 实时 onEvent / onFinding callback (用户能看到进度)
 *     3. stdin 通过 child.stdin.write(prompt, 'utf8') 走 pipe 不走 cmd codepage
 *
 * 使用:
 *   const result = await runCodexAudit({
 *     prompt,
 *     cwd,
 *     idleTimeoutMs: 90_000,    // 没新事件 90s 就当卡死
 *     totalTimeoutMs: 600_000,  // 绝对上限 10min
 *     onEvent: (ev) => process.stderr.write(`[codex] ${ev.type}\n`),
 *   });
 *
 * 同步 wrapper runCodexAuditSync 仍保留给老 caller，内部 await。
 *
 * codex --json JSONL 事件类型:
 *   thread.started        — 会话开始
 *   turn.started          — 一轮思考开始
 *   item.completed        — 输出一段（reasoning / agent_message / tool_call）
 *   turn.completed        — 含 usage.{input_tokens, output_tokens, ...}
 *   thread.completed      — 整个会话结束
 *   error                 — 错误（含 rate-limit）
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

// ─── 状态 flag ─────────────────────────────────────────────────────────────

function getFlagPath() {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.claude', '.codex-blocked-until');
}
const FLAG_PATH = getFlagPath();

// rate-limit 关键字（codex CLI stderr 模式）
const RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /\b429\b/,
  /quota/i,
  /try again in/i,
  /too many requests/i,
  /usage limit/i,
];

// auto-probe 间隔策略（指数退避）
const PROBE_INTERVALS_MIN = [5, 10, 20, 40, 60];
const DEFAULT_BLOCK_HOURS = 1;

// ─── codex bin 解析 ────────────────────────────────────────────────────────

let cachedCodexPath = undefined;

function resolveCodexBin() {
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
    const lines = result.stdout.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    cachedCodexPath = lines.find(l => /\.cmd$/i.test(l)) || lines[0] || null;
  } else {
    cachedCodexPath = null;
  }
  return cachedCodexPath;
}

function _resetBinCache() { cachedCodexPath = undefined; }

function isCodexInstalled() {
  const bin = resolveCodexBin();
  if (!bin) return false;
  // sync version OK for quick existence check
  const onWindows = process.platform === 'win32';
  const isCmdFile = onWindows && /\.(cmd|bat)$/i.test(bin);
  const result = isCmdFile
    ? spawnSync('cmd', ['/c', bin, '--version'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 3000 })
    : spawnSync(bin, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 3000 });
  return result.status === 0;
}

// ─── flag I/O（同步 OK，文件操作快）────────────────────────────────────────

function readBlockState() {
  const flagPath = getFlagPath();
  if (!fs.existsSync(flagPath)) return { blocked: false };
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(flagPath, 'utf8')); }
  catch (_) { return { blocked: false }; }

  const now = new Date();
  const blockedUntil = parsed.blocked_until ? new Date(parsed.blocked_until) : null;
  const lastProbeAt = parsed.last_probe_at ? new Date(parsed.last_probe_at) : null;
  const probeAttempts = parsed.probe_attempts || 0;

  if (blockedUntil && now >= blockedUntil) {
    try { fs.unlinkSync(flagPath); } catch (_) {}
    return { blocked: false };
  }
  return { blocked: true, blockedUntil, lastProbeAt, probeAttempts };
}

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

function shouldProbe(state) {
  if (!state.lastProbeAt) return true;
  const idx = Math.min(state.probeAttempts || 0, PROBE_INTERVALS_MIN.length - 1);
  const intervalMs = PROBE_INTERVALS_MIN[idx] * 60 * 1000;
  const nextProbeAt = new Date(state.lastProbeAt.getTime() + intervalMs);
  return new Date() >= nextProbeAt;
}

function updateProbeState(state) {
  const flagPath = getFlagPath();
  let raw;
  try { raw = JSON.parse(fs.readFileSync(flagPath, 'utf8')); }
  catch (_) { return; }
  raw.last_probe_at = new Date().toISOString();
  raw.probe_attempts = (state.probeAttempts || 0) + 1;
  try { fs.writeFileSync(flagPath, JSON.stringify(raw, null, 2)); }
  catch (_) {}
}

// ─── streaming codex spawn ──────────────────────────────────────────────────

/**
 * Spawn codex with streaming JSON output and stdin prompt (UTF-8).
 * Returns a Promise<{stdout, stderr, exitCode, events, durationMs, idleTimeoutHit, totalTimeoutHit}>
 */
function spawnCodexStream(bin, args, { input, cwd, idleTimeoutMs, totalTimeoutMs, onEvent, onStderr }) {
  return new Promise((resolve) => {
    const onWindows = process.platform === 'win32';
    const isCmdFile = onWindows && /\.(cmd|bat)$/i.test(bin);
    const child = isCmdFile
      ? spawn('cmd', ['/c', bin, ...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
      : spawn(bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

    const startedAt = Date.now();
    let stdoutBuf = '';
    let stderrBuf = '';
    let lineBuf = '';
    const events = [];
    let lastEventAt = Date.now();
    let idleTimeoutHit = false;
    let totalTimeoutHit = false;
    let killed = false;

    // idle timeout: 没新事件超过 idleTimeoutMs 就杀
    const idleTimer = setInterval(() => {
      if (Date.now() - lastEventAt > idleTimeoutMs && !killed) {
        idleTimeoutHit = true;
        killed = true;
        try { child.kill('SIGTERM'); } catch (_) {}
        setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, 2000);
      }
    }, 5000);

    // total timeout: 绝对上限
    const totalTimer = setTimeout(() => {
      if (!killed) {
        totalTimeoutHit = true;
        killed = true;
        try { child.kill('SIGTERM'); } catch (_) {}
        setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, 2000);
      }
    }, totalTimeoutMs);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdoutBuf += chunk;
      lineBuf += chunk;
      // jsonl 一行一个事件
      let nlIdx;
      while ((nlIdx = lineBuf.indexOf('\n')) !== -1) {
        const line = lineBuf.slice(0, nlIdx).trim();
        lineBuf = lineBuf.slice(nlIdx + 1);
        if (!line) continue;
        try {
          const ev = JSON.parse(line);
          events.push(ev);
          lastEventAt = Date.now();
          if (onEvent) {
            try { onEvent(ev); } catch (_) {}
          }
        } catch (_) {
          // 非 JSON 行（codex 偶尔输出 banner / unstructured）—— 忽略，不影响累积
        }
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      stderrBuf += chunk;
      if (onStderr) {
        try { onStderr(chunk); } catch (_) {}
      }
    });

    let resolved = false;
    const finish = (payload) => {
      if (resolved) return;
      resolved = true;
      clearInterval(idleTimer);
      clearTimeout(totalTimer);
      // 强制关闭 stdio pipe（Windows cmd /c 的 grandchild 可能持有 pipe）
      try { child.stdout && child.stdout.destroy(); } catch (_) {}
      try { child.stderr && child.stderr.destroy(); } catch (_) {}
      resolve(payload);
    };

    child.on('error', err => {
      finish({
        stdout: stdoutBuf, stderr: stderrBuf, exitCode: null,
        events, durationMs: Date.now() - startedAt,
        error: err, idleTimeoutHit, totalTimeoutHit,
      });
    });

    // 用 'exit' 而非 'close'：exit 在 process 退出时触发，不等所有 stdio 关闭。
    // 这让 idle-timeout 杀进程后立即 resolve，不等 grandchild stdio。
    child.on('exit', (code, signal) => {
      finish({
        stdout: stdoutBuf, stderr: stderrBuf,
        exitCode: code, signal,
        events, durationMs: Date.now() - startedAt,
        error: null, idleTimeoutHit, totalTimeoutHit,
      });
    });

    // 写 prompt 到 stdin（UTF-8 直接写 pipe，不走 cmd codepage）
    if (input != null) {
      try {
        child.stdin.write(input, 'utf8');
        child.stdin.end();
      } catch (e) {
        // stdin write 失败（child 已 exit 了）—— close 事件会触发
      }
    }
  });
}

/**
 * Probe with minimal prompt to test recovery. Returns true if still blocked.
 */
async function probeRecovery() {
  const bin = resolveCodexBin();
  if (!bin) return true;

  const result = await spawnCodexStream(bin, ['exec', '--skip-git-repo-check', '--json', '-'], {
    input: 'say ok',
    idleTimeoutMs: 30_000,
    totalTimeoutMs: 60_000,
  });

  // v2.8: stderr only + exit 非 0
  const stderr = String(result.stderr || '');
  if ((result.error || result.exitCode !== 0)
      && RATE_LIMIT_PATTERNS.some(re => re.test(stderr))) {
    return true; // 仍 blocked
  }
  if (result.error || result.exitCode !== 0) return true; // 临时错误，保守不解锁
  return false; // 恢复了
}

// ─── 主入口 runCodexAudit (async) ──────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string} opts.prompt - 红队 prompt（self-contained）
 * @param {string} [opts.cwd] - 工作目录
 * @param {number} [opts.idleTimeoutMs=90000] - 没新事件 90s 当卡死
 * @param {number} [opts.totalTimeoutMs=600000] - 绝对上限 10min
 * @param {(ev: object) => void} [opts.onEvent] - 实时事件回调
 * @param {(chunk: string) => void} [opts.onStderr] - 实时 stderr 回调
 * @returns {Promise<{ skipped, reason?, output?, tokensUsed?, durationMs?, events? }>}
 */
async function runCodexAudit(opts) {
  const {
    prompt,
    cwd,
    idleTimeoutMs = 90_000,
    totalTimeoutMs = 600_000,
    onEvent,
    onStderr,
  } = opts || {};

  if (!prompt || typeof prompt !== 'string') {
    return { skipped: true, reason: 'no prompt provided' };
  }
  if (!isCodexInstalled()) {
    return { skipped: true, reason: 'codex CLI not installed (run: npm install -g @openai/codex)' };
  }

  // flag 检查 + auto-probe
  const state = readBlockState();
  if (state.blocked) {
    if (shouldProbe(state)) {
      const stillBlocked = await probeRecovery();
      if (stillBlocked) {
        updateProbeState(state);
        const nextIdx = Math.min((state.probeAttempts || 0) + 1, PROBE_INTERVALS_MIN.length - 1);
        return {
          skipped: true,
          reason: `codex rate-limited (probe ${state.probeAttempts + 1} failed); next probe in ${PROBE_INTERVALS_MIN[nextIdx]}min`,
        };
      }
      try { fs.unlinkSync(getFlagPath()); } catch (_) {}
      // 继续跑真任务
    } else {
      const remainingMs = state.blockedUntil.getTime() - Date.now();
      const remainingMin = Math.max(1, Math.round(remainingMs / 60_000));
      const idx = Math.min(state.probeAttempts || 0, PROBE_INTERVALS_MIN.length - 1);
      return {
        skipped: true,
        reason: `codex rate-limited (next auto-probe in <${PROBE_INTERVALS_MIN[idx]}min, expires in ${remainingMin}min)`,
      };
    }
  }

  // 跑真任务（流式）
  const bin = resolveCodexBin();
  const args = ['exec', '--skip-git-repo-check', '--json', '-'];

  const result = await spawnCodexStream(bin, args, {
    input: prompt,
    cwd: cwd || process.cwd(),
    idleTimeoutMs,
    totalTimeoutMs,
    onEvent,
    onStderr,
  });

  const stderr = String(result.stderr || '');

  // rate-limit 检测（仅 stderr，需 exit 非 0）
  const isRealRateLimit = (result.error || result.exitCode !== 0)
                       && RATE_LIMIT_PATTERNS.some(re => re.test(stderr));

  if (isRealRateLimit) {
    writeBlockFlag({ probeAttempts: 0 });
    return {
      skipped: true,
      reason: 'codex rate-limited just now (flag written, auto-probe will recover)',
    };
  }

  // 其他错误
  if (result.error || result.exitCode !== 0) {
    let detail;
    if (result.idleTimeoutHit) detail = `idle timeout (no events for ${idleTimeoutMs}ms)`;
    else if (result.totalTimeoutHit) detail = `total timeout (${totalTimeoutMs}ms)`;
    else if (result.error) detail = result.error.message;
    else detail = stderr.split('\n').filter(Boolean).slice(-3).join(' | ') || `exit ${result.exitCode}`;
    return {
      skipped: true,
      reason: `codex error: ${detail}`,
      durationMs: result.durationMs,
      events: result.events,
    };
  }

  // 成功 — 累积 agent_message text 作为最终 output，提取 usage
  const agentMessages = result.events
    .filter(ev => ev?.type === 'item.completed' && ev?.item?.type === 'agent_message')
    .map(ev => ev.item.text)
    .filter(Boolean);
  const output = agentMessages.join('\n').trim();

  const turnCompleted = result.events.find(ev => ev?.type === 'turn.completed');
  const tokensUsed = turnCompleted?.usage
    ? (turnCompleted.usage.input_tokens || 0) + (turnCompleted.usage.output_tokens || 0)
    : null;

  return {
    skipped: false,
    output,
    tokensUsed,
    durationMs: result.durationMs,
    events: result.events,
  };
}

// ─── 红队 prompt 模板库（同 v2.7） ──────────────────────────────────────────

const REDTEAM_TEMPLATES = {
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

module.exports = {
  runCodexAudit,
  isCodexInstalled,
  resolveCodexBin,
  readBlockState,
  writeBlockFlag,
  probeRecovery,
  shouldProbe,
  RATE_LIMIT_PATTERNS,
  REDTEAM_TEMPLATES,
  FLAG_PATH,
  PROBE_INTERVALS_MIN,
  _resetBinCache,
  // 暴露 streaming 内部给高级用户
  spawnCodexStream,
};

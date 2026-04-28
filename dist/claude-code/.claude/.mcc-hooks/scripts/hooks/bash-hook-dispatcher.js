#!/usr/bin/env node
'use strict';

const { isHookEnabled } = require('../lib/hook-flags');

const { run: runBlockNoVerify } = require('./block-no-verify');
const { run: runAutoTmuxDev } = require('./auto-tmux-dev');
const { run: runTmuxReminder } = require('./pre-bash-tmux-reminder');
const { run: runGitPushReminder } = require('./pre-bash-git-push-reminder');
const { run: runCommitQuality } = require('./pre-bash-commit-quality');
const { run: runGateGuard } = require('./gateguard-fact-force');

const MAX_STDIN = 1024 * 1024;

function optionalHook(modulePath, hookId, ...extraArgs) {
  let cached;
  let loadError;
  let warnedOnce = false;

  return rawInput => {
    if (!cached && !loadError) {
      try {
        cached = require(modulePath);
      } catch (error) {
        loadError = error;
      }
    }

    if (cached && typeof cached.run === 'function') {
      return cached.run(rawInput, ...extraArgs);
    }

    // Module missing: silent pass-through so every Bash command does not
    // produce noisy "[Hook] xxx skipped" lines. Surface the warning only when
    // MCC_HOOK_DEBUG=1 is set, and at most once per dispatcher process.
    if (!warnedOnce && process.env.MCC_HOOK_DEBUG === '1') {
      warnedOnce = true;
      return {
        stdout: rawInput,
        stderr: `[Hook] ${hookId} skipped: optional module ${modulePath} is not installed`,
        exitCode: 0,
      };
    }
    return { stdout: rawInput, stderr: '', exitCode: 0 };
  };
}

const PRE_BASH_HOOKS = [
  {
    id: 'pre:bash:block-no-verify',
    profiles: 'minimal,standard,strict',
    run: rawInput => runBlockNoVerify(rawInput),
  },
  {
    id: 'pre:bash:auto-tmux-dev',
    run: rawInput => runAutoTmuxDev(rawInput),
  },
  {
    id: 'pre:bash:tmux-reminder',
    profiles: 'strict',
    run: rawInput => runTmuxReminder(rawInput),
  },
  {
    id: 'pre:bash:git-push-reminder',
    profiles: 'strict',
    run: rawInput => runGitPushReminder(rawInput),
  },
  {
    id: 'pre:bash:commit-quality',
    profiles: 'strict',
    run: rawInput => runCommitQuality(rawInput),
  },
  {
    id: 'pre:bash:gateguard-fact-force',
    profiles: 'standard,strict',
    run: rawInput => runGateGuard(rawInput),
  },
];

const POST_BASH_HOOKS = [
  {
    id: 'post:bash:command-log-audit',
    run: optionalHook('./post-bash-command-log', 'post:bash:command-log-audit', 'audit'),
  },
  {
    id: 'post:bash:command-log-cost',
    run: optionalHook('./post-bash-command-log', 'post:bash:command-log-cost', 'cost'),
  },
  {
    id: 'post:bash:pr-created',
    profiles: 'standard,strict',
    run: optionalHook('./post-bash-pr-created', 'post:bash:pr-created'),
  },
  {
    id: 'post:bash:build-complete',
    profiles: 'standard,strict',
    run: optionalHook('./post-bash-build-complete', 'post:bash:build-complete'),
  },
];

function readStdinRaw() {
  return new Promise(resolve => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      if (raw.length < MAX_STDIN) {
        const remaining = MAX_STDIN - raw.length;
        raw += chunk.substring(0, remaining);
      }
    });
    process.stdin.on('end', () => resolve(raw));
    process.stdin.on('error', () => resolve(raw));
  });
}

function normalizeHookResult(previousRaw, output) {
  if (typeof output === 'string' || Buffer.isBuffer(output)) {
    return {
      raw: String(output),
      stderr: '',
      exitCode: 0,
    };
  }

  if (output && typeof output === 'object') {
    const nextRaw = Object.prototype.hasOwnProperty.call(output, 'stdout')
      ? String(output.stdout ?? '')
      : !Number.isInteger(output.exitCode) || output.exitCode === 0
        ? previousRaw
        : '';

    return {
      raw: nextRaw,
      stderr: typeof output.stderr === 'string' ? output.stderr : '',
      exitCode: Number.isInteger(output.exitCode) ? output.exitCode : 0,
    };
  }

  return {
    raw: previousRaw,
    stderr: '',
    exitCode: 0,
  };
}

function runHooks(rawInput, hooks) {
  let currentRaw = rawInput;
  let stderr = '';

  for (const hook of hooks) {
    if (!isHookEnabled(hook.id, { profiles: hook.profiles })) {
      continue;
    }

    try {
      const result = normalizeHookResult(currentRaw, hook.run(currentRaw));
      currentRaw = result.raw;
      if (result.stderr) {
        stderr += result.stderr.endsWith('\n') ? result.stderr : `${result.stderr}\n`;
      }
      if (result.exitCode !== 0) {
        return { output: currentRaw, stderr, exitCode: result.exitCode };
      }
    } catch (error) {
      stderr += `[Hook] ${hook.id} failed: ${error.message}\n`;
    }
  }

  return { output: currentRaw, stderr, exitCode: 0 };
}

function runPreBash(rawInput) {
  return runHooks(rawInput, PRE_BASH_HOOKS);
}

function runPostBash(rawInput) {
  return runHooks(rawInput, POST_BASH_HOOKS);
}

async function main() {
  const mode = process.argv[2];
  const raw = await readStdinRaw();

  const result = mode === 'post'
    ? runPostBash(raw)
    : runPreBash(raw);

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.stdout.write(result.output);
  process.exit(result.exitCode);
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`[Hook] bash-hook-dispatcher failed: ${error.message}\n`);
    process.exit(0);
  });
}

module.exports = {
  PRE_BASH_HOOKS,
  POST_BASH_HOOKS,
  runPreBash,
  runPostBash,
};

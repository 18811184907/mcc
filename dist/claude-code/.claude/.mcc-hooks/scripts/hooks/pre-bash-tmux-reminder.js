#!/usr/bin/env node
'use strict';

const MAX_STDIN = 1024 * 1024;
let raw = '';

function run(rawInput) {
  try {
    const input = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
    const cmd = String(input.tool_input?.command || '');

    if (
      process.platform !== 'win32' &&
      !process.env.TMUX &&
      /(npm (install|test)|pnpm (install|test)|yarn (install|test)?|bun (install|test)|cargo build|make\b|docker\b|pytest|vitest|playwright)/.test(cmd)
    ) {
      return {
        stdout: typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput),
        stderr: [
          '[Hook] Consider running in tmux for session persistence',
          '[Hook] tmux new -s dev  |  tmux attach -t dev',
        ].join('\n'),
        exitCode: 0,
      };
    }
  } catch {
    // ignore parse errors and pass through
  }

  return typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput);
}

if (require.main === module) {
  // Watchdog so a hung stdin doesn't block the bash dispatcher chain.
  const WATCHDOG_MS = 3000;
  const watchdog = setTimeout(() => {
    try { process.stdout.write(raw); } catch (_) { /* noop */ }
    process.exit(0);
  }, WATCHDOG_MS);
  watchdog.unref?.();

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) {
      const remaining = MAX_STDIN - raw.length;
      raw += chunk.substring(0, remaining);
    }
  });

  process.stdin.on('end', () => {
    clearTimeout(watchdog);
    const result = run(raw);
    if (result && typeof result === 'object') {
      if (result.stderr) {
        process.stderr.write(`${result.stderr}\n`);
      }
      process.stdout.write(String(result.stdout || ''));
      process.exitCode = Number.isInteger(result.exitCode) ? result.exitCode : 0;
      return;
    }

    process.stdout.write(String(result));
  });
}

module.exports = { run };

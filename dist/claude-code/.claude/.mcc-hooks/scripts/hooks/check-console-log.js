#!/usr/bin/env node

/**
 * Stop Hook: Check for console.log statements in modified files
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs after each response and checks if any modified JavaScript/TypeScript
 * files contain console.log statements. Provides warnings to help developers
 * remember to remove debug statements before committing.
 *
 * Exclusions: test files, config files, and scripts/ directory (where
 * console.log is often intentional).
 */

const fs = require('fs');
const { isGitRepo, getGitModifiedFiles, readFile, log } = require('../lib/utils');

// Files where console.log is expected and should not trigger warnings
const EXCLUDED_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\.config\.[jt]s$/,
  /scripts\//,
  /__tests__\//,
  /__mocks__\//,
];

const MAX_STDIN = 1024 * 1024; // 1MB limit
const MAX_FILES = 100;         // prevent scanning massive monorepos
const MAX_FILE_BYTES = 500 * 1024; // skip files >500KB (minified bundles, etc.)
const WATCHDOG_MS = 3000;      // hard timeout: hook must never block Claude

let data = '';
process.stdin.setEncoding('utf8');

// Watchdog: if anything hangs, pass through stdin and exit clean.
const watchdog = setTimeout(() => {
  log('[Hook] check-console-log watchdog triggered, passing through');
  try { process.stdout.write(data); } catch (_) { /* noop */ }
  process.exit(0);
}, WATCHDOG_MS);
watchdog.unref?.();

process.stdin.on('data', chunk => {
  if (data.length < MAX_STDIN) {
    const remaining = MAX_STDIN - data.length;
    data += chunk.substring(0, remaining);
  }
});

process.stdin.on('end', () => {
  try {
    if (!isGitRepo()) {
      clearTimeout(watchdog);
      process.stdout.write(data);
      process.exit(0);
    }

    const allFiles = getGitModifiedFiles(['\\.tsx?$', '\\.jsx?$'])
      .filter(f => fs.existsSync(f))
      .filter(f => !EXCLUDED_PATTERNS.some(pattern => pattern.test(f)));

    // Cap at MAX_FILES — don't scan huge changesets.
    const files = allFiles.slice(0, MAX_FILES);
    const truncated = allFiles.length > MAX_FILES;

    let hasConsole = false;

    for (const file of files) {
      try {
        const stat = fs.statSync(file);
        if (stat.size > MAX_FILE_BYTES) continue; // skip big files (minified, etc.)
      } catch (_) { continue; }

      const content = readFile(file);
      if (content && content.includes('console.log')) {
        log(`[Hook] WARNING: console.log found in ${file}`);
        hasConsole = true;
      }
    }

    if (truncated) {
      log(`[Hook] check-console-log: 改动文件 >${MAX_FILES}，只扫了前 ${MAX_FILES} 个`);
    }
    if (hasConsole) {
      log('[Hook] Remove console.log statements before committing');
    }
  } catch (err) {
    log(`[Hook] check-console-log error: ${err.message}`);
  }

  clearTimeout(watchdog);
  process.stdout.write(data);
  process.exit(0);
});

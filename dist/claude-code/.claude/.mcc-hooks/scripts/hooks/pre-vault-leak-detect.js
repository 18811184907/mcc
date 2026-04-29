#!/usr/bin/env node

/**
 * PreToolUse Hook: Detect PROJECT_VAULT secret values leaking into tool inputs.
 *
 * Runs before every tool call. Loads vault values from (in order)
 *   <cwd>/docs/PROJECT_VAULT.md      — current default
 *   <cwd>/.claude/PROJECT_VAULT.md   — legacy location (pre-2026-04-28)
 * then scans the tool input (Bash command, Write content, Edit args, etc.) for any
 * vault value appearing as plaintext.
 *
 * If a leak is detected:
 *   - Emit warning to stderr
 *   - DO NOT block the tool (warning only — false positives possible)
 *   - User decides whether to abort
 *
 * Performance: parsing vault is fast (sync read of one md file). Watchdog 2s.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { parseVault, isPlaceholder } = require('../lib/vault-parser');

const MAX_STDIN = 1024 * 1024;
const WATCHDOG_MS = 2000;
const MIN_SECRET_LEN = 8;       // ignore very short values (false positive risk)

let data = '';
process.stdin.setEncoding('utf8');

const watchdog = setTimeout(() => {
  try { process.stdout.write(data); } catch (_) { /* noop */ }
  process.exit(0);
}, WATCHDOG_MS);
watchdog.unref?.();

process.stdin.on('data', chunk => {
  if (data.length < MAX_STDIN) {
    data += chunk.substring(0, MAX_STDIN - data.length);
  }
});

process.stdin.on('end', () => {
  try {
    runScan();
  } catch (err) {
    // Never silently drop scan failures — this is a security hook, a swallowed
    // error means real secrets get sent through with no warning to the user.
    process.stderr.write(`[vault-leak-detect] scan error: ${err && err.stack ? err.stack : err}\n`);
  }
  clearTimeout(watchdog);
  try { process.stdout.write(data); } catch (_) { /* noop */ }
  process.exit(0);
});

function findVaultPath(cwd) {
  // Prefer docs/PROJECT_VAULT.md (new default since 2026-04-28),
  // fall back to .claude/PROJECT_VAULT.md (legacy location).
  const candidates = [
    path.join(cwd, 'docs', 'PROJECT_VAULT.md'),
    path.join(cwd, '.claude', 'PROJECT_VAULT.md'),
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

function findUserVaultPath() {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return null;
  const userVault = path.join(home, '.claude', 'USER_VAULT.md');
  return fs.existsSync(userVault) ? userVault : null;
}

function runScan() {
  const projectVaultPath = findVaultPath(process.cwd());
  const userVaultPath = findUserVaultPath();

  // Combine values from both vaults — TAG by source so leak reports point to
  // the right file. De-dup by exact value, but keep first-seen source.
  const values = [];
  const seenValues = new Set();
  for (const [vaultPath, source] of [[projectVaultPath, 'PROJECT'], [userVaultPath, 'USER']]) {
    if (!vaultPath) continue;
    let content;
    try { content = fs.readFileSync(vaultPath, 'utf8'); }
    catch (err) {
      process.stderr.write(`[vault-leak-detect] cannot read ${source} vault: ${err.message}\n`);
      continue;
    }
    const { env } = parseVault(content);
    for (const { key, value } of env) {
      if (value.length < MIN_SECRET_LEN || isPlaceholder(value)) continue;
      if (seenValues.has(value)) continue;
      seenValues.add(value);
      values.push({ key, value, source });
    }
  }
  if (values.length === 0) return;

  const payload = parseStdinPayload(data);
  const haystack = stringifyToolInput(payload);
  if (!haystack) return;

  const leaks = [];
  for (const { key, value, source } of values) {
    if (value.length > haystack.length) continue; // can't match
    if (haystack.includes(value)) {
      leaks.push({ key, source, valuePreview: previewValue(value) });
    }
  }

  if (leaks.length > 0) {
    process.stderr.write(
      '\n[vault-leak-detect] ⚠ WARNING: vault secret value(s) detected in tool input:\n'
    );
    for (const { key, source, valuePreview } of leaks) {
      // No char preview — only length tier. Previously we leaked first 3 + last
      // 2 bytes of every secret to stderr → Claude Code transcript →
      // potentially uploaded for inference. v2.6.2 fix.
      process.stderr.write(`  - [${source}] ${key} ${valuePreview}\n`);
    }
    process.stderr.write(
      '[vault-leak-detect] If this is intentional (e.g. you explicitly want to use the value), proceed.\n'
    );
    process.stderr.write(
      '[vault-leak-detect] Otherwise abort and use process.env.${KEY} instead.\n\n'
    );
  }
}

function previewValue(value) {
  // Length tiers only — never leak any character of the secret to stderr.
  const n = value.length;
  if (n <= 8) return `<short:${n}>`;
  if (n <= 32) return `<med:${n}>`;
  if (n <= 128) return `<long:${n}>`;
  return `<xlong:${n}>`;
}

function parseStdinPayload(raw) {
  if (!raw || !raw.trim()) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function stringifyToolInput(payload) {
  const input = payload?.tool_input || payload?.toolInput || {};
  // Common fields: command (Bash), content (Write), new_string (Edit),
  // pattern (Grep), prompt (Agent/WebFetch).
  const fields = ['command', 'content', 'new_string', 'old_string', 'pattern', 'prompt'];
  let combined = '';
  for (const f of fields) {
    if (typeof input[f] === 'string') combined += '\n' + input[f];
  }
  // MultiEdit: edits[].old_string + edits[].new_string. v2.6.2 — was missed
  // in v2.6.1, fell through to JSON.stringify fallback only when no top-level
  // string fields were set, so MultiEdit + a stray `command` field would
  // skip the edits entirely.
  if (Array.isArray(input.edits)) {
    for (const e of input.edits) {
      if (e && typeof e.new_string === 'string') combined += '\n' + e.new_string;
      if (e && typeof e.old_string === 'string') combined += '\n' + e.old_string;
    }
  }
  // Catch-all: stringify the whole input as fallback
  if (!combined) {
    try { combined = JSON.stringify(input); } catch { combined = ''; }
  }
  return combined;
}

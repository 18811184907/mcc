#!/usr/bin/env node

/**
 * PreToolUse Hook: Detect PROJECT_VAULT secret values leaking into tool inputs.
 *
 * Runs before every tool call. Loads vault values from <cwd>/.claude/PROJECT_VAULT.md,
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
  try { runScan(); } catch (_) { /* swallow */ }
  clearTimeout(watchdog);
  try { process.stdout.write(data); } catch (_) { /* noop */ }
  process.exit(0);
});

function runScan() {
  const vaultPath = path.join(process.cwd(), '.claude', 'PROJECT_VAULT.md');
  if (!fs.existsSync(vaultPath)) return;

  const values = loadVaultValues(vaultPath);
  if (values.length === 0) return;

  const payload = parseStdinPayload(data);
  const haystack = stringifyToolInput(payload);
  if (!haystack) return;

  const leaks = [];
  for (const { key, value } of values) {
    if (haystack.includes(value)) {
      leaks.push({ key, valuePreview: previewValue(value) });
    }
  }

  if (leaks.length > 0) {
    process.stderr.write(
      '\n[vault-leak-detect] ⚠ WARNING: vault secret value(s) detected in tool input:\n'
    );
    for (const { key, valuePreview } of leaks) {
      process.stderr.write(`  - ${key} (preview: ${valuePreview})\n`);
    }
    process.stderr.write(
      '[vault-leak-detect] If this is intentional (e.g. you explicitly want to use the value), proceed.\n'
    );
    process.stderr.write(
      '[vault-leak-detect] Otherwise abort and use process.env.${KEY} instead.\n\n'
    );
  }
}

function loadVaultValues(vaultPath) {
  const content = fs.readFileSync(vaultPath, 'utf8');
  const values = [];

  for (const line of content.split(/\r?\n/)) {
    // env-style: "- KEY = `value`" or "- KEY = value"
    const m = line.match(/^[\-*]\s+([A-Z][A-Z0-9_]*)\s*=\s*`?([^`\r\n]*?)`?\s*$/);
    if (m) {
      const key = m[1];
      const value = m[2].trim();
      if (value.length >= MIN_SECRET_LEN && !isPlaceholder(value)) {
        values.push({ key, value });
      }
    }
  }

  return values;
}

function isPlaceholder(value) {
  return /^(xxx+|placeholder|todo|tbd|your[-_]|<.*>)/i.test(value);
}

function previewValue(value) {
  if (value.length <= 8) return '***';
  return value.slice(0, 3) + '***' + value.slice(-2);
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
  // Catch-all: stringify the whole input as fallback
  if (!combined) {
    try { combined = JSON.stringify(input); } catch { combined = ''; }
  }
  return combined;
}

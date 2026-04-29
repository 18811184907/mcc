#!/usr/bin/env node

/**
 * PostToolUse Hook: Sync ~/.claude/USER_VAULT.md → user-level destinations.
 *
 * Triggered after Write|Edit|MultiEdit when target == ~/.claude/USER_VAULT.md.
 * Cross-project user-level vault complement to post-vault-sync.js (which is
 * per-project). Same markdown grammar (parseVault from lib), different sync
 * targets:
 *
 *   - ~/.claude/.user-env.sh   (Bash/Zsh, source line auto-added to bashrc/zshrc)
 *   - ~/.claude/.user-env.ps1  (PowerShell, dot-source line auto-added to $PROFILE)
 *   - ~/.ssh/config            (`# MCC-User-Managed` block, distinct from per-project)
 *   - git config --global user.name/email  (when GIT_USER_NAME/GIT_USER_EMAIL keys present)
 *
 * Cross-platform (Windows/macOS/Linux). Idempotent. Symlink-safe.
 *
 * v2.6.2 hardenings:
 *   - parseVault / sanitizeSshField / expandHome / secureWrite shared with
 *     post-vault-sync.js via lib/vault-parser.js (single source of truth)
 *   - All file writes go through secureWrite (symlink-safe + atomic + Windows ACL)
 *   - appendOnce uses O_EXCL lock + tmp+rename (race-safe across concurrent hooks)
 *   - Windows: writes BOTH PS 7+ AND PS 5.1 profiles (Win10/11 ship 5.1)
 *   - 5-step partial-failure no longer prints ✓ Synced after errors
 *   - Bash/Zsh autoload skips creating files for shells the user doesn't use
 *   - Reject NUL bytes in shell-quoted values
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const {
  parseVault,
  sanitizeSshField,
  expandHome,
  escapeRegex,
  secureWrite,
  appendOnce,
} = require('../lib/vault-parser');

const MAX_STDIN = 1024 * 1024;
const WATCHDOG_MS = 5000;

let data = '';
process.stdin.setEncoding('utf8');

const watchdog = setTimeout(() => {
  // Surface the timeout — silent watchdog kills made user-vault sync look
  // successful when it had actually been killed mid-run.
  process.stderr.write('[user-vault-sync] watchdog timeout, sync aborted (incomplete)\n');
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
    runSync();
  } catch (err) {
    process.stderr.write(`[user-vault-sync] error: ${err && err.stack ? err.stack : err}\n`);
  }
  clearTimeout(watchdog);
  try { process.stdout.write(data); } catch (_) { /* noop */ }
  process.exit(0);
});

function runSync() {
  const payload = parseStdinPayload(data);
  const filePath = extractTargetFile(payload);
  if (!filePath) return;

  const userVaultPath = path.join(os.homedir(), '.claude', 'USER_VAULT.md');
  if (path.resolve(filePath) !== path.resolve(userVaultPath)) return;
  if (!fs.existsSync(filePath)) return;

  const vaultContent = fs.readFileSync(filePath, 'utf8');
  const { env, sshHosts } = parseVault(vaultContent);

  // Per-step error collection (sync-version of Promise.allSettled).
  const errors = [];
  const ok = (label, fn) => {
    try { fn(); return true; }
    catch (e) {
      errors.push({ label, message: e && e.message ? e.message : String(e), stack: e && e.stack });
      return false;
    }
  };

  ok('git', () => syncGitIdentity(env, errors));
  ok('user-env.sh', () => syncUserEnvShell(env));
  ok('user-env.ps1', () => syncUserEnvPowershell(env));
  ok('shell-autoload', () => ensureShellAutoload(errors));
  if (sshHosts.length > 0) {
    ok('ssh', () => syncSshConfig(sshHosts));
  }

  if (errors.length > 0) {
    process.stderr.write(`[user-vault-sync] ✗ ${errors.length} sync step(s) FAILED:\n`);
    for (const { label, message, stack } of errors) {
      process.stderr.write(`  - ${label}: ${message}\n`);
      if (process.env.MCC_HOOK_DEBUG === '1' && stack) {
        process.stderr.write(`    ${stack.split('\n').slice(1, 4).join('\n    ')}\n`);
      }
    }
    process.stderr.write('[user-vault-sync] partial sync — re-edit USER_VAULT.md to retry\n');
    return;
  }

  // Only print the success summary when ALL steps actually succeeded.
  const nonGitEnv = env.filter(e => !isGitIdentityKey(e.key));
  if (nonGitEnv.length === 0 && sshHosts.length === 0 && !env.some(e => isGitIdentityKey(e.key))) {
    return; // empty vault — silent
  }
  process.stderr.write(
    `[user-vault-sync] ✓ Synced ${nonGitEnv.length} user env`
    + (sshHosts.length ? ` + ${sshHosts.length} SSH hosts` : '')
    + (env.some(e => isGitIdentityKey(e.key)) ? ' + git identity' : '')
    + '\n'
  );
}

function isGitIdentityKey(key) {
  return key === 'GIT_USER_NAME' || key === 'GIT_USER_EMAIL';
}

// ─── Sync: git config --global ──────────────────────────────────────────────

function syncGitIdentity(env, errors) {
  const gitKeys = env.filter(({ key }) => isGitIdentityKey(key));
  if (gitKeys.length === 0) return;

  // Backup current values so we can rollback if a later git config write fails
  // half-way (e.g. user.name updated but user.email rejected).
  const backups = {};
  for (const { key } of gitKeys) {
    const cfg = key === 'GIT_USER_NAME' ? 'user.name' : 'user.email';
    const cur = spawnSync('git', ['config', '--global', '--get', cfg], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      timeout: 5000,
    });
    if (cur.status === 0) backups[cfg] = cur.stdout.trim();
  }

  const written = [];
  try {
    for (const { key, value } of gitKeys) {
      if (/[\r\n\0]/.test(value)) {
        // Don't silently skip — record so partial-failure block surfaces it.
        errors.push({
          label: `git:${key}`,
          message: 'value contains forbidden control chars (\\r\\n\\0)',
        });
        continue;
      }
      const configKey = key === 'GIT_USER_NAME' ? 'user.name' : 'user.email';
      const result = spawnSync('git', ['config', '--global', configKey, value], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        timeout: 5000,
      });
      if (result.status !== 0) {
        const detail = (result.stderr || result.stdout || result.error?.message || '').trim() || 'unknown';
        const code = result.error?.code ? ` (${result.error.code})` : '';
        throw new Error(`git config ${configKey} failed${code}: ${detail}`);
      }
      written.push(configKey);
    }
  } catch (e) {
    // Rollback any successful writes to maintain transactional semantics
    for (const cfg of written) {
      if (backups[cfg] !== undefined) {
        spawnSync('git', ['config', '--global', cfg, backups[cfg]], {
          stdio: 'ignore', windowsHide: true, timeout: 5000,
        });
      }
    }
    throw e;
  }
}

// ─── Sync: ~/.claude/.user-env.sh ───────────────────────────────────────────

function syncUserEnvShell(env) {
  const claudeDir = path.join(os.homedir(), '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  const lines = [
    '#!/usr/bin/env bash',
    '# Auto-generated by MCC user-vault-sync hook from ~/.claude/USER_VAULT.md',
    '# Do not edit manually — your changes will be overwritten.',
    '# Source this file from ~/.bashrc / ~/.zshrc to make USER_VAULT env vars',
    '# available to all your shells (and any code that reads process.env).',
    '',
  ];
  for (const { key, value } of env) {
    if (isGitIdentityKey(key)) continue;
    lines.push(`export ${key}=${shellQuote(value)}`);
  }

  const targetPath = path.join(claudeDir, '.user-env.sh');
  secureWrite(targetPath, lines.join('\n') + '\n', { mode: 0o600 });
}

function shellQuote(value) {
  if (/\0/.test(String(value))) {
    throw new Error('value contains NUL byte (rejected — bash drops NUL in env)');
  }
  // Wrap in single quotes; replace single quote with `'\''` (close, escape, reopen).
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

// ─── Sync: ~/.claude/.user-env.ps1 ──────────────────────────────────────────

function syncUserEnvPowershell(env) {
  const claudeDir = path.join(os.homedir(), '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  const lines = [
    '# Auto-generated by MCC user-vault-sync hook from ~/.claude/USER_VAULT.md',
    '# Do not edit manually — your changes will be overwritten.',
    '# Dot-source from $PROFILE: . "$HOME\\.claude\\.user-env.ps1"',
    '',
  ];
  for (const { key, value } of env) {
    if (isGitIdentityKey(key)) continue;
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      throw new Error(`unsafe PS env var name: ${key}`);
    }
    lines.push(`$env:${key} = ${psQuote(value)}`);
  }

  const targetPath = path.join(claudeDir, '.user-env.ps1');
  // PS profile files: CRLF on Windows, LF elsewhere (PS 7+ on *nix reads LF fine,
  // but matching native line ending avoids confusing git diffs / Notepad rendering).
  const eol = process.platform === 'win32' ? '\r\n' : '\n';
  secureWrite(targetPath, lines.join(eol) + eol, { mode: 0o600 });
}

function psQuote(value) {
  if (/\0/.test(String(value))) {
    throw new Error('value contains NUL byte');
  }
  // PowerShell single-quoted strings: only escape `'` by doubling.
  return `'${String(value).replace(/'/g, `''`)}'`;
}

// ─── Auto-wire shell autoload (idempotent + race-safe) ──────────────────────

const MARKER_BEGIN = '# >>> MCC user-env autoload >>>';
const MARKER_END = '# <<< MCC user-env autoload <<<';

const BASH_BLOCK = [
  MARKER_BEGIN,
  '[ -f "$HOME/.claude/.user-env.sh" ] && source "$HOME/.claude/.user-env.sh"',
  MARKER_END,
].join('\n');

const PS_BLOCK = [
  MARKER_BEGIN,
  'if (Test-Path "$HOME\\.claude\\.user-env.ps1") { . "$HOME\\.claude\\.user-env.ps1" }',
  MARKER_END,
].join('\r\n');

function ensureShellAutoload(rootErrors) {
  if (process.env.MCC_NO_AUTOLOAD === '1') return; // user opt-out

  const home = os.homedir();
  // Bash + zsh: only inject if file already exists (don't create empty
  // .bashrc / .zshrc for shells the user doesn't actually use).
  for (const rc of [path.join(home, '.bashrc'), path.join(home, '.zshrc')]) {
    try {
      appendOnce(rc, BASH_BLOCK, MARKER_BEGIN, { skipMissing: true });
    } catch (e) {
      rootErrors.push({
        label: `autoload:${path.basename(rc)}`,
        message: e && e.message ? e.message : String(e),
      });
    }
  }

  // PowerShell: write BOTH 5.1 and 7+ profiles on Windows so users on stock
  // Win10/11 (PS 5.1) and modern setups (PS 7+) both get autoload.
  for (const psProfile of resolvePowerShellProfiles()) {
    try {
      appendOnce(psProfile, PS_BLOCK, MARKER_BEGIN);
    } catch (e) {
      rootErrors.push({
        label: `autoload:${path.basename(path.dirname(psProfile))}`,
        message: e && e.message ? e.message : String(e),
      });
    }
  }
}

function resolvePowerShellProfiles() {
  if (process.platform === 'win32') {
    return [
      // PS 7+
      path.join(os.homedir(), 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
      // PS 5.1 (built into Windows 10/11)
      path.join(os.homedir(), 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
    ];
  }
  // pwsh on Linux/macOS
  return [path.join(os.homedir(), '.config', 'powershell', 'Microsoft.PowerShell_profile.ps1')];
}

// ─── Sync: ~/.ssh/config (MCC-User-Managed block) ───────────────────────────

function syncSshConfig(sshHosts) {
  const sshDir = path.join(os.homedir(), '.ssh');
  const sshConfigPath = path.join(sshDir, 'config');
  const startMarker = '# MCC-User-Managed: USER_VAULT START';
  const endMarker = '# MCC-User-Managed: USER_VAULT END';

  let existing = '';
  if (fs.existsSync(sshConfigPath)) {
    existing = fs.readFileSync(sshConfigPath, 'utf8');
  }

  // Strip any existing user-managed block (idempotent rewrite)
  const blockRegex = new RegExp(
    `\\n*${escapeRegex(startMarker)}[\\s\\S]*?${escapeRegex(endMarker)}\\n*`,
    'g'
  );
  existing = existing.replace(blockRegex, '\n');

  const blockLines = ['', startMarker];
  for (const host of sshHosts) {
    if (!host.name) continue;
    const safeName = sanitizeSshField('name', host.name);
    if (!safeName || !/^[A-Za-z0-9_.\-*?]+$/.test(safeName)) {
      process.stderr.write(`[user-vault-sync] skip ssh host with invalid name: ${JSON.stringify(host.name)}\n`);
      continue;
    }
    const safeHost = sanitizeSshField('host', host.host);
    const safeUser = sanitizeSshField('user', host.user);
    const safeKey = sanitizeSshField('key', host.key);
    const safePort = sanitizeSshField('port', host.port);
    if (safePort && !/^\d{1,5}$/.test(safePort)) {
      process.stderr.write(`[user-vault-sync] skip invalid port "${host.port}" for ${safeName}\n`);
      continue;
    }
    blockLines.push(`Host ${safeName}`);
    if (safeHost) blockLines.push(`    HostName ${safeHost}`);
    if (safeUser) blockLines.push(`    User ${safeUser}`);
    if (safeKey) {
      const expanded = expandHome(safeKey);
      const resolved = path.resolve(expanded);
      const home = path.resolve(os.homedir());
      if (resolved.includes('..')) {
        process.stderr.write(`[user-vault-sync] skip IdentityFile with traversal: ${JSON.stringify(safeKey)}\n`);
      } else if (!resolved.startsWith(home + path.sep) && resolved !== home) {
        process.stderr.write(`[user-vault-sync] skip IdentityFile outside HOME: ${JSON.stringify(safeKey)}\n`);
      } else {
        blockLines.push(`    IdentityFile ${expanded}`);
      }
    }
    if (safePort) blockLines.push(`    Port ${safePort}`);
    blockLines.push('');
  }
  blockLines.push(endMarker, '');

  if (!fs.existsSync(sshDir)) {
    fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });
  }
  // secureWrite handles symlink check + atomic rename + Windows ACL lockdown
  secureWrite(sshConfigPath, existing.trimEnd() + blockLines.join('\n'), { mode: 0o600 });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseStdinPayload(raw) {
  if (!raw || !raw.trim()) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function extractTargetFile(payload) {
  const input = payload?.tool_input || payload?.toolInput || {};
  return input.file_path || input.filePath || input.path || null;
}

module.exports = { parseVault, isGitIdentityKey, shellQuote, psQuote, resolvePowerShellProfiles };

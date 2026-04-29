#!/usr/bin/env node

/**
 * PostToolUse Hook: Sync ~/.claude/USER_VAULT.md → user-level destinations.
 *
 * Triggered after Write|Edit|MultiEdit when target == ~/.claude/USER_VAULT.md.
 * Cross-project user-level vault complement to post-vault-sync.js (which is
 * per-project). Same markdown grammar (parseVault), different sync targets:
 *
 *   - ~/.claude/.user-env.sh   (Bash/Zsh, source line auto-added to bashrc/zshrc)
 *   - ~/.claude/.user-env.ps1  (PowerShell, dot-source line auto-added to $PROFILE)
 *   - ~/.ssh/config            (`# MCC-User-Managed` block, distinct from per-project)
 *   - git config --global user.name/email  (when GIT_USER_NAME/GIT_USER_EMAIL keys present)
 *
 * Cross-platform (Windows/macOS/Linux). Idempotent.
 *
 * SAFETY:
 *   - SSH fields go through sanitizeSshField (rejects \r\n\0 to block ssh_config injection).
 *   - Host names are whitelisted to [A-Za-z0-9_.\-*?].
 *   - GIT_USER_* values are passed to spawnSync as args (no shell), single-line only.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const MAX_STDIN = 1024 * 1024;
const WATCHDOG_MS = 5000;

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

  const errors = [];
  try { syncGitIdentity(env); } catch (e) { errors.push(`git: ${e.message}`); }
  try { syncUserEnvShell(env); } catch (e) { errors.push(`user-env.sh: ${e.message}`); }
  try { syncUserEnvPowershell(env); } catch (e) { errors.push(`user-env.ps1: ${e.message}`); }
  try { ensureShellAutoload(); } catch (e) { errors.push(`shell-autoload: ${e.message}`); }
  if (sshHosts.length > 0) {
    try { syncSshConfig(sshHosts); } catch (e) { errors.push(`ssh: ${e.message}`); }
  }

  if (errors.length) {
    process.stderr.write(`[user-vault-sync] partial failures: ${errors.join('; ')}\n`);
  }

  const nonGitEnv = env.filter(e => !isGitIdentityKey(e.key));
  process.stderr.write(
    `[user-vault-sync] ✓ Synced ${nonGitEnv.length} user env`
    + (sshHosts.length ? ` + ${sshHosts.length} SSH hosts` : '')
    + (env.some(e => isGitIdentityKey(e.key)) ? ' + git identity' : '')
    + '\n'
  );
}

// ─── Parser (same grammar as post-vault-sync.js) ────────────────────────────

function parseVault(content) {
  const env = [];
  const sshHosts = [];
  let currentSection = null;
  let currentSshHost = null;

  for (const line of content.split(/\r?\n/)) {
    const sectionMatch = line.match(/^##\s+(.+?)\s*$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      currentSshHost = null;
      continue;
    }

    if (/^[\s\-*]*备注[:：]/.test(line) || /^[\s\-*]*note:/i.test(line)) continue;

    if (!line.trim()) {
      currentSshHost = null;
      continue;
    }

    const isSshSection = currentSection
      && /(SSH|服务器|server|deploy|部署)/i.test(currentSection);

    if (isSshSection) {
      const hostStart = line.match(/^-\s+([\w\-\.]+)(?:\s*\([^)]*\))?\s*:\s*$/);
      if (hostStart) {
        currentSshHost = { name: hostStart[1] };
        sshHosts.push(currentSshHost);
        continue;
      }

      const fieldMatch = line.match(/^\s+(host|hostname|user|key|identityfile|port)\s*=\s*(.+?)\s*$/i);
      if (fieldMatch && currentSshHost) {
        const fieldName = fieldMatch[1].toLowerCase();
        const fieldValue = fieldMatch[2].trim().replace(/^`(.*)`$/, '$1');
        const normalized = fieldName === 'hostname' ? 'host'
          : fieldName === 'identityfile' ? 'key'
          : fieldName;
        currentSshHost[normalized] = fieldValue;
        continue;
      }
    } else {
      const envMatch = line.match(/^[\-*]\s+([A-Z][A-Z0-9_]*)\s*=\s*`?([^`\r\n]*?)`?\s*$/);
      if (envMatch) {
        const key = envMatch[1];
        const value = envMatch[2].trim();
        if (value && !isPlaceholder(value)) {
          env.push({ key, value, section: currentSection || 'misc' });
        }
      }
    }
  }

  return { env, sshHosts };
}

function isPlaceholder(value) {
  return /^<.*>$/.test(value)
    || /^(your-|placeholder|todo|tbd|xxx+)/i.test(value);
}

function isGitIdentityKey(key) {
  return key === 'GIT_USER_NAME' || key === 'GIT_USER_EMAIL';
}

// ─── Sync: git config --global ──────────────────────────────────────────────

function syncGitIdentity(env) {
  for (const { key, value } of env) {
    if (!isGitIdentityKey(key)) continue;
    // Reject anything multi-line / with control chars; the value goes straight
    // to git config arg, which is safe (no shell), but a stray \n would still
    // break the config file.
    if (/[\r\n\0]/.test(value)) {
      process.stderr.write(`[user-vault-sync] skip ${key}: contains forbidden control chars\n`);
      continue;
    }
    const configKey = key === 'GIT_USER_NAME' ? 'user.name' : 'user.email';
    const result = spawnSync('git', ['config', '--global', configKey, value], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      timeout: 5000,
    });
    if (result.status !== 0) {
      throw new Error(`git config ${configKey} failed: ${result.stderr || result.stdout || result.error?.message || 'unknown'}`);
    }
  }
}

// ─── Sync: ~/.claude/.user-env.sh ───────────────────────────────────────────

function syncUserEnvShell(env) {
  const claudeDir = path.join(os.homedir(), '.claude');
  ensureDir(claudeDir);

  const lines = [
    '#!/usr/bin/env bash',
    '# Auto-generated by MCC user-vault-sync hook from ~/.claude/USER_VAULT.md',
    '# Do not edit manually — your changes will be overwritten.',
    '# Source this file from ~/.bashrc / ~/.zshrc to make USER_VAULT env vars',
    '# available to all your shells (and any code that reads process.env).',
    '',
  ];
  for (const { key, value } of env) {
    if (isGitIdentityKey(key)) continue; // git identity goes to git config, not env
    lines.push(`export ${key}=${shellQuote(value)}`);
  }

  const targetPath = path.join(claudeDir, '.user-env.sh');
  fs.writeFileSync(targetPath, lines.join('\n') + '\n', { mode: 0o600 });
}

function shellQuote(value) {
  // Wrap in single quotes; replace single quote with `'\''` (close, escape, reopen).
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

// ─── Sync: ~/.claude/.user-env.ps1 ──────────────────────────────────────────

function syncUserEnvPowershell(env) {
  const claudeDir = path.join(os.homedir(), '.claude');
  ensureDir(claudeDir);

  const lines = [
    '# Auto-generated by MCC user-vault-sync hook from ~/.claude/USER_VAULT.md',
    '# Do not edit manually — your changes will be overwritten.',
    '# Dot-source from $PROFILE: . "$HOME\\.claude\\.user-env.ps1"',
    '',
  ];
  for (const { key, value } of env) {
    if (isGitIdentityKey(key)) continue;
    lines.push(`$env:${key} = ${psQuote(value)}`);
  }

  const targetPath = path.join(claudeDir, '.user-env.ps1');
  fs.writeFileSync(targetPath, lines.join('\r\n') + '\r\n', { mode: 0o600 });
}

function psQuote(value) {
  // PowerShell single-quoted strings: only escape `'` by doubling.
  return `'${String(value).replace(/'/g, `''`)}'`;
}

// ─── Auto-wire shell autoload (idempotent) ──────────────────────────────────

const BASH_MARKER_BEGIN = '# >>> MCC user-env autoload >>>';
const BASH_MARKER_END = '# <<< MCC user-env autoload <<<';
const PS_MARKER_BEGIN = '# >>> MCC user-env autoload >>>';
const PS_MARKER_END = '# <<< MCC user-env autoload <<<';

function ensureShellAutoload() {
  appendOnce(
    path.join(os.homedir(), '.bashrc'),
    [
      BASH_MARKER_BEGIN,
      '[ -f "$HOME/.claude/.user-env.sh" ] && source "$HOME/.claude/.user-env.sh"',
      BASH_MARKER_END,
    ].join('\n'),
    BASH_MARKER_BEGIN
  );
  appendOnce(
    path.join(os.homedir(), '.zshrc'),
    [
      BASH_MARKER_BEGIN,
      '[ -f "$HOME/.claude/.user-env.sh" ] && source "$HOME/.claude/.user-env.sh"',
      BASH_MARKER_END,
    ].join('\n'),
    BASH_MARKER_BEGIN
  );

  // PowerShell profile path: try the standard one first; create if missing.
  const psProfile = resolvePowerShellProfile();
  if (psProfile) {
    appendOnce(
      psProfile,
      [
        PS_MARKER_BEGIN,
        'if (Test-Path "$HOME\\.claude\\.user-env.ps1") { . "$HOME\\.claude\\.user-env.ps1" }',
        PS_MARKER_END,
      ].join('\r\n'),
      PS_MARKER_BEGIN
    );
  }
}

function appendOnce(filePath, blockContent, markerToCheck) {
  let existing = '';
  if (fs.existsSync(filePath)) {
    existing = fs.readFileSync(filePath, 'utf8');
    if (existing.includes(markerToCheck)) return; // already wired
  }
  ensureDir(path.dirname(filePath));
  // Preserve existing content; add a leading newline if needed.
  const sep = existing.length > 0 && !existing.endsWith('\n') ? '\n\n' : '\n';
  fs.appendFileSync(filePath, sep + blockContent + '\n');
}

function resolvePowerShellProfile() {
  // PowerShell 5.1 (Windows): %USERPROFILE%\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1
  // PowerShell 7+ (cross-platform): ~/Documents/PowerShell/Microsoft.PowerShell_profile.ps1
  // We pick the PS 7+ path on Windows / Linux / macOS — that's where modern installs live.
  // If the user runs only PS 5.1 they can re-source manually.
  if (process.platform === 'win32') {
    return path.join(os.homedir(), 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1');
  }
  // On Unix, pwsh profile path:
  return path.join(os.homedir(), '.config', 'powershell', 'Microsoft.PowerShell_profile.ps1');
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
      if (expanded.includes('..')) {
        process.stderr.write(`[user-vault-sync] skip IdentityFile with traversal: ${JSON.stringify(safeKey)}\n`);
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
  fs.writeFileSync(sshConfigPath, existing.trimEnd() + blockLines.join('\n'), { mode: 0o600 });
}

function sanitizeSshField(name, value) {
  if (value === undefined || value === null || value === '') return '';
  const s = String(value);
  if (/[\r\n\0]/.test(s)) {
    process.stderr.write(`[user-vault-sync] ssh field "${name}" has forbidden chars, dropping\n`);
    return '';
  }
  return s.trim();
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

function expandHome(p) {
  if (!p) return p;
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { parseVault, isGitIdentityKey, isPlaceholder };

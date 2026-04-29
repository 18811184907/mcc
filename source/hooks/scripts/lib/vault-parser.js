'use strict';

/**
 * Shared vault parser used by both PROJECT_VAULT (post-vault-sync.js) and
 * USER_VAULT (post-user-vault-sync.js) hooks, plus pre-vault-leak-detect.js.
 *
 * Single source of truth for:
 *   - parseVault(content) -> { env, sshHosts }
 *   - isPlaceholder(value)
 *   - sanitizeSshField(name, value)
 *   - expandHome(path)
 *   - secureWrite(filePath, content) — symlink-safe + Windows ACL lockdown
 *   - escapeRegex(s)
 *
 * Before this module each of those helpers was duplicated across 3+ hook
 * files and behaviour had already drifted (e.g. PROJECT vault wasn't
 * filtering `<your-key>` placeholders, USER vault was — leading to the
 * same template line ending up in `.env.local` for projects).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

// ─── Vault markdown parser ──────────────────────────────────────────────────

/**
 * Parse a vault markdown file content into structured env + sshHosts.
 *
 * Grammar:
 *   `## <Section>`              top-level section header
 *   `- KEY = \`value\``          env entry (UPPER_SNAKE_CASE keys only)
 *   `- KEY = value`              backticks optional
 *   `- 备注: ...` / `- note: ...` skipped (comments)
 *
 *   Inside a section matching /SSH|服务器|server|deploy|部署/i:
 *     `- host-name:`             start of an SSH host block
 *     `    host = ...` (indented) host fields (host/hostname/user/key/identityfile/port)
 *
 * Placeholder values (`<your-...>`, `placeholder`, `todo`, `xxx+`, `your-...`)
 * are dropped by parseVault for env entries — keeps template lines from
 * polluting `.env.local`.
 */
function parseVault(content) {
  const env = [];
  const sshHosts = [];
  let currentSection = null;
  let currentSshHost = null;

  for (const line of String(content || '').split(/\r?\n/)) {
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
        // Drop placeholders here — was a real bug in post-vault-sync.js
        // (it would write `<your-openai-api-key>` literally to .env.local).
        if (value && !isPlaceholder(value)) {
          env.push({ key, value, section: currentSection || 'misc' });
        }
      }
    }
  }

  return { env, sshHosts };
}

/**
 * Detect template placeholder values that should never be synced.
 * Catches `<your-anything>`, `your-prefix`, `placeholder`, `todo`, `tbd`, `xxx`.
 */
function isPlaceholder(value) {
  return /^<.*>$/.test(value)
    || /^(your[-_]|placeholder|todo|tbd|xxx+)/i.test(value);
}

// ─── SSH config field sanitizer ─────────────────────────────────────────────

/**
 * Reject control chars (\r\n\0) in SSH config field values — these would
 * inject arbitrary ssh_config directives (ProxyJump, etc.) if a vault value
 * contained a literal newline.
 */
function sanitizeSshField(name, value) {
  if (value === undefined || value === null || value === '') return '';
  const s = String(value);
  if (/[\r\n\0]/.test(s)) {
    process.stderr.write(`[vault] ssh field "${name}" has forbidden control chars, dropping\n`);
    return '';
  }
  return s.trim();
}

// ─── Path helpers ───────────────────────────────────────────────────────────

function expandHome(p) {
  if (!p) return p;
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Secure write (symlink-safe + Windows ACL fallback) ─────────────────────

/**
 * Write content to a file:
 *   1. Refuse if the target is a symlink (defense against pre-set symlinks
 *      pointing at ~/.bashrc, ~/.ssh/authorized_keys, etc.)
 *   2. Atomic via tmp + rename so a watchdog kill never leaves a half-write
 *   3. POSIX mode 0o600
 *   4. On Windows, also lock down ACL via icacls so the file isn't readable
 *      by other users / Administrators (the POSIX mode is silently ignored
 *      by Node on Windows).
 */
function secureWrite(filePath, content, opts = {}) {
  // 1. Symlink check
  try {
    const st = fs.lstatSync(filePath);
    if (st.isSymbolicLink()) {
      throw new Error(`refusing to write through symlink: ${filePath}`);
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }

  // 2. Atomic write
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.mcc-tmp.${process.pid}`;
  fs.writeFileSync(tmp, content, { mode: opts.mode || 0o600 });
  try {
    fs.renameSync(tmp, filePath);
  } catch (err) {
    // Windows EEXIST/EPERM: unlink + retry
    if (err.code === 'EEXIST' || err.code === 'EPERM') {
      try { fs.unlinkSync(filePath); } catch (_) { /* noop */ }
      fs.renameSync(tmp, filePath);
    } else {
      try { fs.unlinkSync(tmp); } catch (_) { /* noop */ }
      throw err;
    }
  }

  // 3. POSIX mode (best-effort; chmodSync may have already happened via writeFileSync mode)
  try { fs.chmodSync(filePath, opts.mode || 0o600); } catch (_) { /* noop */ }

  // 4. Windows ACL lockdown via icacls
  if (process.platform === 'win32' && opts.lockdownWindows !== false) {
    const user = process.env.USERNAME;
    if (user && /^[A-Za-z0-9_.\- ]+$/.test(user)) {
      spawnSync('icacls', [filePath, '/inheritance:r', '/grant:r', `${user}:F`], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        timeout: 5000,
      });
    }
  }
}

// ─── Atomic append-once (idempotent shell profile injection) ────────────────

/**
 * Idempotent "append a marker block once" used by ensureShellAutoload.
 *
 * Race-safe: uses an O_EXCL lock file + tmp+rename to avoid two concurrent
 * Claude sessions both seeing "marker absent" and double-appending.
 *
 * Returns:
 *   'created'   — file didn't exist; we created it with the block
 *   'appended'  — file existed without marker; we appended the block
 *   'present'   — marker already there; no-op
 *   'locked'    — another process holds the lock; caller may retry later
 *   'no-touch'  — file didn't exist AND opts.skipMissing=true (don't create files for shells the user doesn't use)
 */
function appendOnce(filePath, blockContent, markerToCheck, opts = {}) {
  const skipMissing = opts.skipMissing === true;
  const lockPath = `${filePath}.mcc-lock`;
  let lockFd;

  // O_EXCL atomic lock
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    lockFd = fs.openSync(lockPath, 'wx');
  } catch (e) {
    if (e.code === 'EEXIST') return 'locked';
    throw e;
  }

  try {
    let existing = '';
    let exists = false;
    try {
      const st = fs.lstatSync(filePath);
      if (st.isSymbolicLink()) {
        throw new Error(`refusing to write through symlink: ${filePath}`);
      }
      existing = fs.readFileSync(filePath, 'utf8');
      exists = true;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }

    if (exists && existing.includes(markerToCheck)) return 'present';
    if (!exists && skipMissing) return 'no-touch';

    const sep = existing.length > 0 && !existing.endsWith('\n') ? '\n\n' : (existing ? '\n' : '');
    const next = existing + sep + blockContent + '\n';

    // Atomic via tmp + rename so partial writes never leave half-marker.
    const tmp = `${filePath}.mcc-tmp.${process.pid}`;
    fs.writeFileSync(tmp, next);
    try {
      fs.renameSync(tmp, filePath);
    } catch (err) {
      if (err.code === 'EEXIST' || err.code === 'EPERM') {
        try { fs.unlinkSync(filePath); } catch (_) { /* noop */ }
        fs.renameSync(tmp, filePath);
      } else {
        try { fs.unlinkSync(tmp); } catch (_) { /* noop */ }
        throw err;
      }
    }

    return exists ? 'appended' : 'created';
  } finally {
    try { fs.closeSync(lockFd); } catch (_) { /* noop */ }
    try { fs.unlinkSync(lockPath); } catch (_) { /* noop */ }
  }
}

module.exports = {
  parseVault,
  isPlaceholder,
  sanitizeSshField,
  expandHome,
  escapeRegex,
  secureWrite,
  appendOnce,
};

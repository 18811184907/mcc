#!/usr/bin/env node

/**
 * PostToolUse Hook: Sync .claude/PROJECT_VAULT.md → .env.local + .env.example + ~/.ssh/config + SECRETS-INDEX.md
 *
 * Triggered after Write|Edit|MultiEdit when the target file is .claude/PROJECT_VAULT.md.
 * Parses the markdown vault and propagates to standard locations:
 *
 *   - .env.local                    (gitignored, app code uses process.env.X)
 *   - .env.example                  (committed, lists all keys with placeholder values)
 *   - ~/.ssh/config                 (managed block per project, SSH section auto-synced)
 *   - .claude/SECRETS-INDEX.md      (committed, lists field names + descriptions, no values)
 *   - .gitignore                    (auto-add PROJECT_VAULT.md, .env.local, .env.*.local)
 *
 * Cross-platform (Windows/macOS/Linux). Pure regex parsing, zero LLM cost.
 *
 * Vault markdown format:
 *
 *   ## <section name>
 *   - KEY = `value`              # env-style entry
 *   - KEY = value                # backticks optional
 *   - 备注：xxx                  # comments (skipped)
 *
 *   ## SSH / 服务器             # any section matching /SSH|服务器|server/i
 *   - host-name:                 # SSH host block
 *       host = 192.168.1.10
 *       user = deploy
 *       key = ~/.ssh/prod_id_rsa
 *       port = 22
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

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
  try { runSync(); } catch (err) {
    process.stderr.write(`[vault-sync] error: ${err.message}\n`);
  }
  clearTimeout(watchdog);
  try { process.stdout.write(data); } catch (_) { /* noop */ }
  process.exit(0);
});

function runSync() {
  const payload = parseStdinPayload(data);
  const filePath = extractTargetFile(payload);
  if (!filePath) return;

  // Only act on PROJECT_VAULT.md
  const normalized = filePath.replace(/\\/g, '/');
  if (!/\.claude\/PROJECT_VAULT\.md$/i.test(normalized)) return;

  if (!fs.existsSync(filePath)) return;
  const vaultContent = fs.readFileSync(filePath, 'utf8');

  // Project root = parent of .claude/
  const projectRoot = path.dirname(path.dirname(filePath));
  const projectName = path.basename(projectRoot);

  const { env, sshHosts } = parseVault(vaultContent);

  ensureGitignore(projectRoot);
  syncEnvLocal(env, projectRoot);
  syncEnvExample(env, projectRoot);
  syncSecretsIndex(env, sshHosts, projectRoot);
  if (sshHosts.length > 0) syncSshConfig(sshHosts, projectName);

  process.stderr.write(
    `[vault-sync] ✓ Synced ${env.length} env entries`
    + (sshHosts.length ? ` + ${sshHosts.length} SSH hosts` : '')
    + ` from ${path.relative(projectRoot, filePath)}\n`
  );
}

// ─── Parser ─────────────────────────────────────────────────────────────────

function parseVault(content) {
  const env = [];
  const sshHosts = [];
  let currentSection = null;
  let currentSshHost = null;

  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    // Section header (## Section Name)
    const sectionMatch = line.match(/^##\s+(.+?)\s*$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      currentSshHost = null;
      continue;
    }

    // Skip comment/note lines
    if (/^[\s\-*]*备注[:：]/.test(line) || /^[\s\-*]*note:/i.test(line)) continue;

    // Blank line ends current SSH host block
    if (!line.trim()) {
      currentSshHost = null;
      continue;
    }

    const isSshSection = currentSection
      && /(SSH|服务器|server|deploy|部署)/i.test(currentSection);

    if (isSshSection) {
      // SSH host start: "- prod-server:" or "- prod-server (note):"
      const hostStart = line.match(/^-\s+([\w\-\.]+)(?:\s*\([^)]*\))?\s*:\s*$/);
      if (hostStart) {
        currentSshHost = { name: hostStart[1] };
        sshHosts.push(currentSshHost);
        continue;
      }

      // SSH field: "    host = value" / "    user = value" etc.
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
      // Env entry: "- KEY = `value`" or "- KEY = value" or "- KEY=`value`"
      const envMatch = line.match(
        /^[\-*]\s+([A-Z][A-Z0-9_]*)\s*=\s*`?([^`\r\n]*?)`?\s*$/
      );
      if (envMatch) {
        const key = envMatch[1];
        const value = envMatch[2].trim();
        if (value) {
          env.push({ key, value, section: currentSection || 'misc' });
        }
      }
    }
  }

  return { env, sshHosts };
}

// ─── Sync Targets ───────────────────────────────────────────────────────────

function syncEnvLocal(env, projectRoot) {
  const envLocalPath = path.join(projectRoot, '.env.local');
  const lines = [
    '# Auto-generated by MCC vault-sync hook from .claude/PROJECT_VAULT.md',
    '# Do not edit manually — your changes will be overwritten.',
    '# To change values, edit .claude/PROJECT_VAULT.md and save.',
    '',
  ];
  for (const { key, value } of env) {
    lines.push(`${key}=${value}`);
  }
  fs.writeFileSync(envLocalPath, lines.join('\n') + '\n', { mode: 0o600 });
}

function syncEnvExample(env, projectRoot) {
  const examplePath = path.join(projectRoot, '.env.example');

  // Preserve user's manual entries; MCC-managed keys get placeholder
  let preserved = new Map();
  if (fs.existsSync(examplePath)) {
    const existing = fs.readFileSync(examplePath, 'utf8');
    for (const line of existing.split(/\r?\n/)) {
      const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (m) preserved.set(m[1], m[2]);
    }
  }

  const managedKeys = new Set(env.map(e => e.key));
  const lines = [
    '# Generated by MCC vault-sync hook from .claude/PROJECT_VAULT.md',
    '# This file IS committed. Values shown are placeholders.',
    '# Real values live in .env.local (gitignored) — auto-synced from PROJECT_VAULT.md.',
    '',
  ];
  // MCC-managed keys with placeholder
  for (const { key, section } of env) {
    const placeholder = preserved.get(key) || '';
    lines.push(`# ${section}`);
    lines.push(`${key}=${placeholder}`);
  }
  // User's manual entries (not in vault)
  const userOnly = [...preserved.keys()].filter(k => !managedKeys.has(k));
  if (userOnly.length > 0) {
    lines.push('', '# User-added entries (not in PROJECT_VAULT.md)');
    for (const k of userOnly) {
      lines.push(`${k}=${preserved.get(k)}`);
    }
  }

  fs.writeFileSync(examplePath, lines.join('\n') + '\n');
}

function syncSshConfig(sshHosts, projectName) {
  const sshDir = path.join(os.homedir(), '.ssh');
  const sshConfigPath = path.join(sshDir, 'config');
  const startMarker = `# MCC-Managed: ${projectName} START`;
  const endMarker = `# MCC-Managed: ${projectName} END`;

  let existing = '';
  if (fs.existsSync(sshConfigPath)) {
    existing = fs.readFileSync(sshConfigPath, 'utf8');
  }

  // Strip old MCC block for this project (idempotent)
  const blockRegex = new RegExp(
    `\\n*${escapeRegex(startMarker)}[\\s\\S]*?${escapeRegex(endMarker)}\\n*`,
    'g'
  );
  existing = existing.replace(blockRegex, '\n');

  // Build new block
  const blockLines = ['', startMarker];
  for (const host of sshHosts) {
    if (!host.name) continue;
    blockLines.push(`Host ${host.name}`);
    if (host.host) blockLines.push(`    HostName ${host.host}`);
    if (host.user) blockLines.push(`    User ${host.user}`);
    if (host.key) blockLines.push(`    IdentityFile ${expandHome(host.key)}`);
    if (host.port) blockLines.push(`    Port ${host.port}`);
    blockLines.push('');
  }
  blockLines.push(endMarker, '');

  if (!fs.existsSync(sshDir)) {
    fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(sshConfigPath, existing.trimEnd() + blockLines.join('\n'), { mode: 0o600 });
}

function syncSecretsIndex(env, sshHosts, projectRoot) {
  const indexPath = path.join(projectRoot, '.claude', 'SECRETS-INDEX.md');
  const lines = [
    '# Secrets Index · safe to commit',
    '',
    '> Auto-generated by MCC from `.claude/PROJECT_VAULT.md`.',
    '> This file lists secret **field names** only — values stay in `PROJECT_VAULT.md` (gitignored).',
    '> Use this to onboard teammates: they see what secrets exist, then ask you for the values.',
    '',
  ];

  // Group env by section
  const bySection = new Map();
  for (const { key, section } of env) {
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section).push(key);
  }

  for (const [section, keys] of bySection) {
    lines.push(`## ${section}`, '');
    for (const k of keys) lines.push(`- **${k}**`);
    lines.push('');
  }

  if (sshHosts.length > 0) {
    lines.push('## SSH Hosts', '');
    for (const h of sshHosts) {
      const meta = [];
      if (h.user) meta.push(h.user);
      if (h.host) meta.push(h.host);
      const suffix = meta.length ? ` (${meta.join('@')})` : '';
      lines.push(`- **${h.name}**${suffix}`);
    }
    lines.push('');
  }

  fs.writeFileSync(indexPath, lines.join('\n'));
}

// ─── .gitignore Guard ───────────────────────────────────────────────────────

function ensureGitignore(projectRoot) {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const required = [
    '.claude/PROJECT_VAULT.md',
    '.env.local',
    '.env.*.local',
    '.deploy.local.md',
  ];

  let existing = '';
  if (fs.existsSync(gitignorePath)) {
    existing = fs.readFileSync(gitignorePath, 'utf8');
  }

  const existingLines = new Set(
    existing.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  );
  const missing = required.filter(p => !existingLines.has(p));

  if (missing.length === 0) return false;

  const additions = [
    '',
    '# MCC PROJECT_VAULT (auto-managed — secrets must never enter git)',
    ...missing,
    '',
  ];
  fs.writeFileSync(gitignorePath, existing.trimEnd() + '\n' + additions.join('\n'));
  return true;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseStdinPayload(raw) {
  if (!raw || !raw.trim()) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function extractTargetFile(payload) {
  // Claude Code passes tool_input in the hook payload
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

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

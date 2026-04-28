#!/usr/bin/env node

/**
 * PostToolUse Hook: Auto-sync ~/.claude/CLAUDE.md to user's dotfiles repo.
 *
 * Triggered after Write|Edit|MultiEdit on ~/.claude/CLAUDE.md.
 * Reads ~/.claude/.claudemd-sync.config to find the dotfiles repo, then:
 *   1. Copy ~/.claude/CLAUDE.md → <dotfiles>/CLAUDE.md
 *   2. git diff --numstat → check additive vs has-deletions
 *   3. If pure additive (deletions == 0): git commit + git push (auto)
 *   4. If has deletions: leave dirty in dotfiles, log warning, user runs /claudemd-sync push to confirm
 *
 * SAFETY: Auto-push only for additions. Deletions/edits require user confirmation.
 *
 * Config format (~/.claude/.claudemd-sync.config):
 *   { "repoUrl": "https://...", "dotfilesDir": "~/.dotfiles/claude-dotfiles", "syncFile": "CLAUDE.md" }
 *
 * If config doesn't exist: hook is a no-op (user hasn't run /claudemd-sync init).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const MAX_STDIN = 1024 * 1024;
const WATCHDOG_MS = 8000;
const GIT_TIMEOUT_MS = 5000;

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
    process.stderr.write(`[claudemd-sync] error: ${err.message}\n`);
  }
  clearTimeout(watchdog);
  try { process.stdout.write(data); } catch (_) { /* noop */ }
  process.exit(0);
});

function runSync() {
  const payload = parseStdinPayload(data);
  const filePath = extractTargetFile(payload);
  if (!filePath) return;

  // Only act on ~/.claude/CLAUDE.md (user-level CLAUDE.md, not project-level)
  const homeDir = os.homedir();
  const targetClaudemd = path.join(homeDir, '.claude', 'CLAUDE.md');
  const normalizedFile = path.resolve(filePath);
  const normalizedTarget = path.resolve(targetClaudemd);
  if (normalizedFile !== normalizedTarget) return;

  // Read sync config (skip if not configured)
  const configPath = path.join(homeDir, '.claude', '.claudemd-sync.config');
  if (!fs.existsSync(configPath)) {
    // User hasn't run /claudemd-sync init — silent no-op
    return;
  }

  let config;
  try {
    // Strip UTF-8 BOM if present (PowerShell Set-Content -Encoding UTF8 writes BOM by default)
    const raw = fs.readFileSync(configPath, 'utf8').replace(/^﻿/, '');
    config = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`[claudemd-sync] config parse error: ${err.message}\n`);
    return;
  }

  const dotfilesDir = expandHome(config.dotfilesDir);
  if (!dotfilesDir || !fs.existsSync(dotfilesDir)) {
    process.stderr.write(`[claudemd-sync] dotfiles dir not found: ${config.dotfilesDir}\n`);
    return;
  }

  // Verify it's a git repo
  if (!fs.existsSync(path.join(dotfilesDir, '.git'))) {
    process.stderr.write(`[claudemd-sync] ${dotfilesDir} is not a git repo. Run /claudemd-sync init first.\n`);
    return;
  }

  // Copy ~/.claude/CLAUDE.md → dotfiles/CLAUDE.md
  const dotfilesClaudemd = path.join(dotfilesDir, config.syncFile || 'CLAUDE.md');
  if (!fs.existsSync(targetClaudemd)) {
    process.stderr.write(`[claudemd-sync] ~/.claude/CLAUDE.md not found, skipping\n`);
    return;
  }
  fs.copyFileSync(targetClaudemd, dotfilesClaudemd);

  // Stage to compute diff
  const addRes = git(dotfilesDir, ['add', config.syncFile || 'CLAUDE.md']);
  if (addRes.status !== 0) {
    process.stderr.write(`[claudemd-sync] git add failed: ${addRes.stderr || addRes.stdout}\n`);
    return;
  }

  // Get numstat: <added>\t<deleted>\t<file>
  const numstatRes = git(dotfilesDir, ['diff', '--cached', '--numstat']);
  const numstat = (numstatRes.stdout || '').trim();

  if (!numstat) {
    // No staged changes — Claude's edit didn't actually change CLAUDE.md content vs dotfiles
    return;
  }

  // Parse first line: "<added>\t<deleted>\t<file>"
  const parts = numstat.split('\n')[0].split(/\s+/);
  const added = parseInt(parts[0], 10) || 0;
  const deleted = parseInt(parts[1], 10) || 0;

  if (deleted === 0) {
    // Pure additive — auto-commit + auto-push
    const commitRes = git(dotfilesDir, [
      'commit',
      '-m',
      `auto: claudemd append (+${added} lines)`,
    ]);
    if (commitRes.status !== 0) {
      process.stderr.write(`[claudemd-sync] git commit failed: ${commitRes.stderr || commitRes.stdout}\n`);
      return;
    }

    const pushRes = git(dotfilesDir, ['push'], { timeoutMs: 15000 });
    if (pushRes.status !== 0) {
      process.stderr.write(
        `[claudemd-sync] ⚠ commit OK but push failed: ${pushRes.stderr || pushRes.stdout}\n`
        + `[claudemd-sync]    fix auth/network and run: cd ${dotfilesDir} && git push\n`
      );
      return;
    }

    process.stderr.write(`[claudemd-sync] ✓ Pushed: +${added} lines additive (no deletions)\n`);
  } else {
    // Has deletions — DO NOT auto-push. Leave staged for user review.
    process.stderr.write(
      `[claudemd-sync] ⚠ Edit removed ${deleted} lines (added ${added}). NOT auto-pushed.\n`
      + `[claudemd-sync]    Review: cd ${dotfilesDir} && git diff --cached\n`
      + `[claudemd-sync]    Confirm + push: /claudemd-sync push\n`
      + `[claudemd-sync]    Cancel: cd ${dotfilesDir} && git reset CLAUDE.md\n`
    );
  }
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

function git(cwd, args, opts = {}) {
  return spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: opts.timeoutMs || GIT_TIMEOUT_MS,
    windowsHide: true,
  });
}

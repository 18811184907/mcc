#!/usr/bin/env node
// MCC Build: source/ → dist/claude-code/ + dist/codex/
// 跑所有 adapter 并汇总报告

'use strict';

const path = require('path');
const { adaptToClaudeCode } = require('./adapt-to-claude-code');
const { adaptToCodex } = require('./adapt-to-codex');

async function main() {
  const sourceDir = path.resolve(__dirname, '..', 'source');
  const distDir = path.resolve(__dirname, '..', 'dist');

  console.log('');
  console.log('====================================');
  console.log('  MCC Build · Single Source → Dual Target');
  console.log('====================================');
  console.log(`source: ${sourceDir}`);
  console.log(`dist:   ${distDir}`);
  console.log('');

  const t0 = Date.now();

  console.log('── Claude Code ─────────────────────');
  const cc = await adaptToClaudeCode(sourceDir, path.join(distDir, 'claude-code'));

  console.log('');
  console.log('── Codex ───────────────────────────');
  const cx = await adaptToCodex(sourceDir, path.join(distDir, 'codex'));

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('');
  console.log('====================================');
  console.log('  Build Summary');
  console.log('====================================');
  console.log(`[claude-code] ${cc.filesCount ?? '?'} files  →  ${cc.distDir}`);
  if (cc.summary && cc.summary.byKind) {
    console.log(`  ${JSON.stringify(cc.summary.byKind)}`);
  }
  console.log(`[codex]       ${cx.filesCount ?? '?'} files  →  ${cx.distDir}`);
  if (cx.summary && cx.summary.byKind) {
    console.log(`  ${JSON.stringify(cx.summary.byKind)}`);
  }
  console.log('');
  console.log(`elapsed: ${elapsed}s`);
  console.log('');
  console.log('Next:');
  console.log('  1) 检查 dist/ 下的产出');
  console.log('  2) 跑 installer: ./install.ps1 (Windows) 或 ./install.sh (Unix)');
  console.log('');
}

main().catch((err) => {
  console.error('');
  console.error('✗ Build failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});

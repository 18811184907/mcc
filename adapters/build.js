#!/usr/bin/env node
// MCC Build: source/ → dist/claude-code/ + dist/codex/
// 跑所有 adapter 并汇总报告

'use strict';

const fs = require('fs');
const path = require('path');
const { adaptToClaudeCode } = require('./adapt-to-claude-code');
const { adaptToCodex } = require('./adapt-to-codex');

// Minimum expected counts; missed → build fails fast (prevents shipping empty dist/).
// 保持略低于实际值（v2.0: agents=19, commands=13, skills=18），避免误杀，但能防"source 被半删光"。
const MIN_AGENTS = 18;     // 实际 19，缓冲 1
const MIN_COMMANDS = 12;   // 实际 13，缓冲 1
const MIN_SKILLS = 17;     // 实际 18，缓冲 1（v2.0.1: 一致缓冲策略）

function assertSourceIsHealthy(sourceDir) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`source/ 目录不存在: ${sourceDir}。请先 clone 完整仓库。`);
  }
  const required = ['agents', 'commands', 'skills', 'modes', 'hooks', 'mcp', 'rules'];
  const missing = required.filter(d => !fs.existsSync(path.join(sourceDir, d)));
  if (missing.length) {
    throw new Error(`source/ 缺少必需子目录: ${missing.join(', ')}`);
  }
  // v1.10: rules 子目录必须包含 common / python / typescript（v1.7 起结构）
  const requiredRulesSubdirs = ['common', 'python', 'typescript'];
  const missingRulesSubdirs = requiredRulesSubdirs.filter(d =>
    !fs.existsSync(path.join(sourceDir, 'rules', d))
  );
  if (missingRulesSubdirs.length) {
    throw new Error(`source/rules/ 缺少必需子目录: ${missingRulesSubdirs.join(', ')}`);
  }
  const agentCount = fs.readdirSync(path.join(sourceDir, 'agents')).filter(f => f.endsWith('.md')).length;
  const cmdCount = fs.readdirSync(path.join(sourceDir, 'commands')).filter(f => f.endsWith('.md')).length;
  const skillCount = fs.readdirSync(path.join(sourceDir, 'skills')).filter(f => {
    return fs.statSync(path.join(sourceDir, 'skills', f)).isDirectory();
  }).length;
  if (agentCount < MIN_AGENTS) throw new Error(`source/agents 只有 ${agentCount} 个 .md（期望 ≥${MIN_AGENTS}）`);
  if (cmdCount < MIN_COMMANDS) throw new Error(`source/commands 只有 ${cmdCount} 个 .md（期望 ≥${MIN_COMMANDS}）`);
  if (skillCount < MIN_SKILLS) throw new Error(`source/skills 只有 ${skillCount} 个 skill 目录（期望 ≥${MIN_SKILLS}）`);
  // 每个 rules 子目录至少 1 个 .md（防止半空提交）
  for (const sub of requiredRulesSubdirs) {
    const cnt = fs.readdirSync(path.join(sourceDir, 'rules', sub)).filter(f => f.endsWith('.md')).length;
    if (cnt === 0) {
      throw new Error(`source/rules/${sub} 没有任何 .md 文件`);
    }
  }
}

function assertBuildOutputSane(label, result) {
  if (!result || typeof result !== 'object') throw new Error(`${label} 产出异常`);
  const fc = result.filesCount;
  if (typeof fc !== 'number' || fc < 20) {
    throw new Error(`${label} 产出文件数 ${fc} 过少，build 可能损坏`);
  }
}

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

  assertSourceIsHealthy(sourceDir);

  const t0 = Date.now();

  console.log('── Claude Code ─────────────────────');
  const cc = await adaptToClaudeCode(sourceDir, path.join(distDir, 'claude-code'));
  assertBuildOutputSane('claude-code', cc);

  console.log('');
  console.log('── Codex ───────────────────────────');
  const cx = await adaptToCodex(sourceDir, path.join(distDir, 'codex'));
  assertBuildOutputSane('codex', cx);

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

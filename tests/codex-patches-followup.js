#!/usr/bin/env node
// Targeted unit tests for the v2.5.9-followup fixes:
//  - bash-hook-dispatcher: silent skip when optional module missing
//  - installer: replaceTomlSection [[array of tables]] safety
//  - installer: MCC_MANAGED_TOML_SECTIONS whitelist
//  - installer: copyInstallManifest writes manifest into targetDir/.mcc-meta/
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const installer = require('../scripts/installer.js');
const {
  appendTomlFragment,
  replaceTomlSection,
  MCC_MANAGED_TOML_SECTIONS,
  copyInstallManifest,
} = installer;

let pass = 0;
let fail = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (e) {
    console.log(`  ✗ ${name}\n    ${e.message}`);
    fail++;
  }
}

console.log('── installer TOML fixes ──');

check('MCC_MANAGED_TOML_SECTIONS exposes serena', () => {
  assert.ok(MCC_MANAGED_TOML_SECTIONS instanceof Set);
  assert.ok(MCC_MANAGED_TOML_SECTIONS.has('mcp_servers.serena'));
});

check('serena section auto-updated when body differs', () => {
  const existing = '[mcp_servers.serena]\ncommand = "old"\n';
  const fragment = '[mcp_servers.serena]\ncommand = "new"\nargs = ["--enable-web-dashboard", "False"]\n';
  const { merged, updated, skipped } = appendTomlFragment(existing, fragment, false);
  assert.deepStrictEqual(updated, ['mcp_servers.serena']);
  assert.deepStrictEqual(skipped, []);
  assert.ok(merged.includes('command = "new"'));
  assert.ok(!merged.includes('command = "old"'));
});

check('non-whitelisted section is preserved (no force)', () => {
  const existing = '[mcp_servers.context7]\ncommand = "user-customized"\n';
  const fragment = '[mcp_servers.context7]\ncommand = "stock"\n';
  const { merged, updated, skipped } = appendTomlFragment(existing, fragment, false);
  assert.deepStrictEqual(skipped, ['mcp_servers.context7']);
  assert.deepStrictEqual(updated, []);
  assert.ok(merged.includes('user-customized'));
});

check('replaceTomlSection stops at [[array of tables]]', () => {
  const existing = [
    '[mcp_servers.serena]',
    'command = "old"',
    'arg = "x"',
    '[[some_array]]',
    'foo = 1',
    '[other.section]',
    'bar = 2',
    '',
  ].join('\n');
  const out = replaceTomlSection(existing, 'mcp_servers.serena', 'command = "new"\n');
  assert.ok(out.includes('[[some_array]]'), '[[some_array]] header was eaten');
  assert.ok(out.includes('foo = 1'), '[[some_array]] body was eaten');
  assert.ok(out.includes('command = "new"'));
  assert.ok(!out.includes('command = "old"'));
});

console.log('── bash-hook-dispatcher silent skip ──');

// optionalHook is a closure inside the dispatcher; extract it via a tiny
// vm-style eval over the source file rather than exporting it.
function loadOptionalHook() {
  const dispatcherPath = require.resolve('../source/hooks/scripts/hooks/bash-hook-dispatcher.js');
  const dispatcherSrc = fs.readFileSync(dispatcherPath, 'utf8');
  // Grab the function from `function optionalHook(...)` up to (but not
  // including) the `const PRE_BASH_HOOKS` declaration that immediately follows.
  const startIdx = dispatcherSrc.indexOf('function optionalHook');
  const endIdx = dispatcherSrc.indexOf('const PRE_BASH_HOOKS', startIdx);
  assert.ok(startIdx !== -1 && endIdx !== -1, 'optionalHook function not found in dispatcher source');
  const body = dispatcherSrc.slice(startIdx, endIdx);
  const fn = new Function('process', `${body}; return optionalHook;`);
  return fn(process);
}

check('optional hook is silent when module missing (default)', () => {
  delete process.env.MCC_HOOK_DEBUG;
  const optionalHook = loadOptionalHook();
  const hook = optionalHook('./does-not-exist-xxx', 'test:hook');
  const r = hook('hello');
  assert.strictEqual(r.stdout, 'hello');
  assert.strictEqual(r.stderr, '', `expected silent stderr, got: ${JSON.stringify(r.stderr)}`);
  assert.strictEqual(r.exitCode, 0);
});

check('MCC_HOOK_DEBUG=1 surfaces warning at most once', () => {
  process.env.MCC_HOOK_DEBUG = '1';
  try {
    const optionalHook = loadOptionalHook();
    const hook = optionalHook('./does-not-exist-xxx', 'test:hook');
    const r1 = hook('hello');
    assert.ok(r1.stderr.includes('skipped'), 'first call should warn');
    const r2 = hook('hello');
    assert.strictEqual(r2.stderr, '', 'second call should be silent (warned-once)');
  } finally {
    delete process.env.MCC_HOOK_DEBUG;
  }
});

console.log('── uninstaller manifest copy ──');

check('copyInstallManifest writes manifest into targetDir/.mcc-meta/', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-meta-'));
  try {
    const distDir = path.join(tmp, 'dist');
    const targetDir = path.join(tmp, 'target');
    fs.mkdirSync(distDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });
    const manifest = { files: [{ kind: 'command', install: '.claude/commands/foo.md' }] };
    fs.writeFileSync(path.join(distDir, 'INSTALL-MANIFEST.json'), JSON.stringify(manifest));

    copyInstallManifest(distDir, targetDir, /* dryRun */ false);

    const dst = path.join(targetDir, '.mcc-meta', 'INSTALL-MANIFEST.json');
    assert.ok(fs.existsSync(dst), 'manifest copy not written');
    const parsed = JSON.parse(fs.readFileSync(dst, 'utf8'));
    assert.strictEqual(parsed.files[0].install, '.claude/commands/foo.md');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

check('uninstaller.getInstalledClaudeCommands prefers .mcc-meta/ over repo dist/', () => {
  const { getInstalledClaudeCommands } = require('../scripts/uninstaller.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-uninst-'));
  try {
    fs.mkdirSync(path.join(tmp, '.mcc-meta'), { recursive: true });
    const localManifest = {
      files: [
        { kind: 'command', install: '.claude/commands/from-local.md' },
        { kind: 'command', install: '.claude/commands/another.md' },
      ],
    };
    fs.writeFileSync(
      path.join(tmp, '.mcc-meta', 'INSTALL-MANIFEST.json'),
      JSON.stringify(localManifest),
    );
    const got = getInstalledClaudeCommands(tmp);
    assert.deepStrictEqual(got.sort(), ['another.md', 'from-local.md']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

console.log('');
console.log(`Result: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

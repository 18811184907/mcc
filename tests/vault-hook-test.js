#!/usr/bin/env node
// Quick standalone test for post-vault-sync.js hook
// Creates a tmp project with PROJECT_VAULT.md, invokes hook with proper stdin payload, verifies outputs.

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-vault-test-'));
const claudeDir = path.join(tmpRoot, '.claude');
fs.mkdirSync(claudeDir, { recursive: true });

const repoRoot = path.resolve(__dirname, '..');
const vaultTemplate = path.join(repoRoot, 'source', 'templates', 'PROJECT_VAULT.example.md');
const vaultDst = path.join(claudeDir, 'PROJECT_VAULT.md');
fs.copyFileSync(vaultTemplate, vaultDst);

console.log('TMP:', tmpRoot);

const hookScript = path.join(repoRoot, 'source', 'hooks', 'scripts', 'hooks', 'post-vault-sync.js');
const payload = JSON.stringify({ tool_input: { file_path: vaultDst } });

const result = spawnSync(process.execPath, [hookScript], {
  input: payload,
  encoding: 'utf8',
  cwd: tmpRoot,
});

console.log('Hook exit:', result.status);
if (result.stderr) console.log('Hook stderr:', result.stderr);
console.log('');

const checks = [
  { file: '.env.local', desc: '.env.local (gitignored)' },
  { file: '.env.example', desc: '.env.example (committed)' },
  { file: '.claude/SECRETS-INDEX.md', desc: 'SECRETS-INDEX.md (committed)' },
  { file: '.gitignore', desc: '.gitignore (auto-managed)' },
];

let pass = 0, fail = 0;
for (const { file, desc } of checks) {
  const fullPath = path.join(tmpRoot, file);
  if (fs.existsSync(fullPath)) {
    console.log(`✓ ${desc}`);
    console.log('  --- content ---');
    console.log(fs.readFileSync(fullPath, 'utf8').split('\n').slice(0, 12).map(l => '  | ' + l).join('\n'));
    console.log('');
    pass++;
  } else {
    console.log(`✗ ${desc} NOT CREATED`);
    fail++;
  }
}

// Also verify SSH config block (in user $HOME, NOT in tmp dir)
const sshConfig = path.join(os.homedir(), '.ssh', 'config');
if (fs.existsSync(sshConfig)) {
  const content = fs.readFileSync(sshConfig, 'utf8');
  const projectName = path.basename(tmpRoot);
  if (content.includes(`# MCC-Managed: ${projectName}`)) {
    console.log(`✓ ~/.ssh/config has MCC-Managed block for ${projectName}`);
    pass++;
    // Clean up the SSH config addition (test pollution)
    const cleaned = content.replace(
      new RegExp(`\\n*# MCC-Managed: ${projectName} START[\\s\\S]*?# MCC-Managed: ${projectName} END\\n*`, 'g'),
      '\n'
    );
    fs.writeFileSync(sshConfig, cleaned);
    console.log(`  (cleaned up SSH config block)`);
  } else {
    console.log(`✗ ~/.ssh/config missing MCC-Managed block for ${projectName}`);
    fail++;
  }
}

// Cleanup tmp dir
fs.rmSync(tmpRoot, { recursive: true, force: true });

console.log('');
console.log(`Result: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

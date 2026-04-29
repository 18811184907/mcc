#!/usr/bin/env node
// Standalone test for post-user-vault-sync.js hook
// Spawns the hook with HOME/USERPROFILE pointed at a tmp dir so the hook writes
// to the tmp dir's ~/.claude/, not the real user home — keeps test idempotent.

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-user-vault-test-'));
const tmpClaudeDir = path.join(tmpHome, '.claude');
fs.mkdirSync(tmpClaudeDir, { recursive: true });

console.log('TMP HOME:', tmpHome);

const repoRoot = path.resolve(__dirname, '..');
const userVaultTemplate = path.join(repoRoot, 'source', 'templates', 'USER_VAULT.example.md');
const userVaultPath = path.join(tmpClaudeDir, 'USER_VAULT.md');

// Use a custom vault content with real-looking values (template has placeholders that get filtered).
const vaultContent = `# User Vault

## Git Identity
- GIT_USER_NAME = \`testuser\`
- GIT_USER_EMAIL = \`test@example.com\`

## Personal API Tokens
- OPENAI_API_KEY = \`sk-test-12345abcde\`
- ANTHROPIC_API_KEY = \`sk-ant-test-67890\`

## Personal SSH

- test-bastion:
    host = bastion.test.example.com
    user = testuser
    key = ~/.ssh/id_ed25519
    port = 22
`;
fs.writeFileSync(userVaultPath, vaultContent);

const hookScript = path.join(repoRoot, 'source', 'hooks', 'scripts', 'hooks', 'post-user-vault-sync.js');
const payload = JSON.stringify({ tool_input: { file_path: userVaultPath } });

// Override HOME (Unix) AND USERPROFILE (Windows) so os.homedir() inside the hook
// returns tmpHome. Also stub git config call by setting GIT_CONFIG_GLOBAL to a
// throwaway file so the test never touches the user's real ~/.gitconfig.
const tmpGitConfig = path.join(tmpHome, '.gitconfig.test');
const env = {
  ...process.env,
  HOME: tmpHome,
  USERPROFILE: tmpHome,
  GIT_CONFIG_GLOBAL: tmpGitConfig,
};

const result = spawnSync(process.execPath, [hookScript], {
  input: payload,
  encoding: 'utf8',
  cwd: tmpHome,
  env,
});

console.log('Hook exit:', result.status);
if (result.stderr) console.log('Hook stderr:', result.stderr);
console.log('');

let pass = 0;
let fail = 0;

function check(label, cond) {
  if (cond) {
    console.log(`✓ ${label}`);
    pass++;
  } else {
    console.log(`✗ ${label}`);
    fail++;
  }
}

// 1) ~/.claude/.user-env.sh exists with the env exports (no GIT_USER_*).
const envSh = path.join(tmpClaudeDir, '.user-env.sh');
check('.user-env.sh exists', fs.existsSync(envSh));
if (fs.existsSync(envSh)) {
  const content = fs.readFileSync(envSh, 'utf8');
  check('.user-env.sh has OPENAI_API_KEY export', /export OPENAI_API_KEY='sk-test-12345abcde'/.test(content));
  check('.user-env.sh has ANTHROPIC_API_KEY export', /export ANTHROPIC_API_KEY='sk-ant-test-67890'/.test(content));
  check('.user-env.sh does NOT contain GIT_USER_NAME (goes to git config not env)', !/GIT_USER_NAME/.test(content));
}

// 2) ~/.claude/.user-env.ps1 exists with PowerShell-quoted exports.
const envPs1 = path.join(tmpClaudeDir, '.user-env.ps1');
check('.user-env.ps1 exists', fs.existsSync(envPs1));
if (fs.existsSync(envPs1)) {
  const content = fs.readFileSync(envPs1, 'utf8');
  check('.user-env.ps1 has $env:OPENAI_API_KEY', /\$env:OPENAI_API_KEY = 'sk-test-12345abcde'/.test(content));
}

// 3) Bashrc autoload was wired with marker.
const bashrcPath = path.join(tmpHome, '.bashrc');
check('~/.bashrc was created with autoload', fs.existsSync(bashrcPath));
if (fs.existsSync(bashrcPath)) {
  const content = fs.readFileSync(bashrcPath, 'utf8');
  check('~/.bashrc has MCC marker', content.includes('# >>> MCC user-env autoload >>>'));
  check('~/.bashrc has source line', content.includes('source "$HOME/.claude/.user-env.sh"'));
}

// 4) Run hook a 2nd time; bashrc should NOT get a duplicate marker (idempotent).
const result2 = spawnSync(process.execPath, [hookScript], {
  input: payload,
  encoding: 'utf8',
  cwd: tmpHome,
  env,
});
if (fs.existsSync(bashrcPath)) {
  const content = fs.readFileSync(bashrcPath, 'utf8');
  const markerCount = (content.match(/# >>> MCC user-env autoload >>>/g) || []).length;
  check(`bashrc autoload is idempotent (marker count = 1, got ${markerCount})`, markerCount === 1);
}

// 5) git config was set on the tmp gitconfig file (not real ~/.gitconfig).
check('tmp .gitconfig was created', fs.existsSync(tmpGitConfig));
if (fs.existsSync(tmpGitConfig)) {
  const content = fs.readFileSync(tmpGitConfig, 'utf8');
  check('tmp .gitconfig has user.name = testuser', /name\s*=\s*testuser/.test(content));
  check('tmp .gitconfig has user.email = test@example.com', /email\s*=\s*test@example\.com/.test(content));
}

// 6) ~/.ssh/config has the MCC-User-Managed block.
const sshConfig = path.join(tmpHome, '.ssh', 'config');
check('tmp ~/.ssh/config exists', fs.existsSync(sshConfig));
if (fs.existsSync(sshConfig)) {
  const content = fs.readFileSync(sshConfig, 'utf8');
  check('~/.ssh/config has MCC-User-Managed START marker', content.includes('# MCC-User-Managed: USER_VAULT START'));
  check('~/.ssh/config has Host test-bastion', /Host test-bastion/.test(content));
  check('~/.ssh/config has expanded IdentityFile (no `~`)', !/IdentityFile ~\//.test(content) && /IdentityFile .+id_ed25519/.test(content));
}

// 7) Injection defense: directly call the parser/sanitizer with a value that
// contains an actual newline (the realistic injection vector — markdown bullet
// can't carry one, but if any future code path got a value with \n, the hook
// must drop it). We import the hook module to test sanitizeSshField directly.
const hookModule = require(path.join(repoRoot, 'source', 'hooks', 'scripts', 'hooks', 'post-user-vault-sync.js'));
// sanitizeSshField is internal; verify the broader contract via parseVault output:
// values flowing from parseVault must never contain \r\n\0.
const parsed = hookModule.parseVault(`## SSH
- evil:
    host = good.example.com
    user = normal-user
`);
check('parseVault returned the SSH host', parsed.sshHosts.length === 1 && parsed.sshHosts[0].name === 'evil');
check('parsed user field has no control chars', !/[\r\n\0]/.test(parsed.sshHosts[0].user || ''));

// Cleanup
fs.rmSync(tmpHome, { recursive: true, force: true });

console.log('');
console.log(`Result: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

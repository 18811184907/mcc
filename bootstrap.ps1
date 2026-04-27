#!/usr/bin/env pwsh
# MCC one-line remote bootstrap (Windows)
#
# Usage (one line):
#   iwr -useb https://raw.githubusercontent.com/18811184907/mcc/main/bootstrap.ps1 | iex
#
# With args (use env var since iwr|iex cannot pass args):
#   $env:MCC_BOOTSTRAP_ARGS = "--exclusive --scope project"
#   iwr -useb https://raw.githubusercontent.com/18811184907/mcc/main/bootstrap.ps1 | iex
#
# What it does:
#   1. Check git / node >= 18
#   2. clone (or pull) MCC to $HOME\.mcc-install
#   3. Run install.ps1 (default --scope global, args pass-through)
#   4. Print "installed" guide

$ErrorActionPreference = "Stop"

$REPO_URL = "https://github.com/18811184907/mcc"
# v2.4: $MCC_DIR overridable via env (for local e2e tests)
$MCC_DIR  = if ($env:MCC_DIR) { $env:MCC_DIR } else { Join-Path $HOME ".mcc-install" }
# v2.4: $MCC_NO_PULL=1 skips clone/pull (for local e2e tests with MCC_DIR override)
$skipPull = ($env:MCC_NO_PULL -eq "1")

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  MCC Bootstrap (one-line installer)" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# 0. Dependency check
$missing = @()
if (-not (Get-Command git -ErrorAction SilentlyContinue))  { $missing += "git" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { $missing += "node" }
if ($missing.Count -gt 0) {
  Write-Host "[X] Missing: $($missing -join ', ')" -ForegroundColor Red
  Write-Host ""
  Write-Host "Windows install:" -ForegroundColor Yellow
  Write-Host "  winget install --id Git.Git -e"
  Write-Host "  winget install --id OpenJS.NodeJS.LTS -e"
  Write-Host ""
  Write-Host "Then re-run this bootstrap command."
  exit 1
}

# Node version >= 18
$nodeVer = (& node -v).TrimStart('v')
$nodeMajor = [int]($nodeVer.Split('.')[0])
if ($nodeMajor -lt 18) {
  Write-Host "[X] Node v$nodeVer too old, MCC needs 18+" -ForegroundColor Red
  Write-Host "Upgrade: winget install --id OpenJS.NodeJS.LTS -e"
  exit 1
}
Write-Host "[OK] git + node v$nodeVer ready" -ForegroundColor Green

# 1. clone or pull (skip when MCC_NO_PULL=1, e.g. local e2e tests with MCC_DIR override)
if ($skipPull) {
  if (-not (Test-Path $MCC_DIR)) {
    Write-Host "[X] MCC_NO_PULL=1 but $MCC_DIR does not exist" -ForegroundColor Red
    exit 1
  }
  Write-Host "[OK] using existing $MCC_DIR (MCC_NO_PULL=1, skip pull/clone)" -ForegroundColor Green
} else {
  if (Test-Path $MCC_DIR) {
    Write-Host ""
    Write-Host "[..] MCC already at $MCC_DIR, updating..." -ForegroundColor Cyan
    Push-Location $MCC_DIR
    try {
      git pull origin main --quiet
      Write-Host "[OK] git pull done" -ForegroundColor Green
    } catch {
      Pop-Location
      Write-Host "[!] git pull failed, removing and re-cloning..." -ForegroundColor Yellow
      Remove-Item -Recurse -Force $MCC_DIR
    } finally {
      if ((Get-Location).Path -eq $MCC_DIR) { Pop-Location }
    }
  }

  if (-not (Test-Path $MCC_DIR)) {
    Write-Host ""
    Write-Host "[..] Cloning $REPO_URL to $MCC_DIR ..." -ForegroundColor Cyan
    git clone --depth 1 $REPO_URL $MCC_DIR
    if ($LASTEXITCODE -ne 0) {
      Write-Host "[X] clone failed" -ForegroundColor Red
      exit 1
    }
    Write-Host "[OK] clone done" -ForegroundColor Green
  }
}

# 2. Collect args: $args (direct) + $env:MCC_BOOTSTRAP_ARGS (iwr|iex friendly)
$installerArgs = @()
if ($args.Count -gt 0) { $installerArgs += $args }
if ($env:MCC_BOOTSTRAP_ARGS) {
  # Supports: $env:MCC_BOOTSTRAP_ARGS = "--exclusive --scope project"
  $installerArgs += ($env:MCC_BOOTSTRAP_ARGS -split '\s+' | Where-Object { $_ })
}

# 3. v2.4 smart-split is the new default (no question). User can override with flags:
#    $env:MCC_BOOTSTRAP_ARGS = "--scope global"   -> only ~/.claude/, skip current dir
#    $env:MCC_BOOTSTRAP_ARGS = "--scope project"  -> team mode: full install to ./.claude/
#    $env:MCC_BOOTSTRAP_ARGS = "--no-project-stub" -> smart but skip current dir PRPs/
$hasScope = ($installerArgs -contains '--scope')
if (-not $hasScope) {
  # Default scope is smart (installer.js default). No flag needed.
  # Print where it will install for transparency:
  $cwd = (Get-Location).Path
  $homeDir = $HOME
  Write-Host ""
  Write-Host "MCC will install to:" -ForegroundColor Yellow
  Write-Host "  ~/.claude/                              user-level (agents/commands/skills/settings)"
  if ($cwd -ne $homeDir) {
    Write-Host "  $cwd\.claude\PRPs/   project work-products dir"
  } else {
    Write-Host "  (cwd is `$HOME -> skipping project PRPs/ stub)" -ForegroundColor DarkGray
  }
  Write-Host ""
  Write-Host "  team-shared install? -> rerun with: `$env:MCC_BOOTSTRAP_ARGS = '--scope project'" -ForegroundColor DarkGray
}

# 4. Default to --exclusive unless user opted out (clean install of MCC's user-level dirs)
$hasExclusive  = ($installerArgs -contains '--exclusive')
$hasOptOut     = ($installerArgs -contains '--no-exclusive')
if (-not $hasExclusive -and -not $hasOptOut) {
  $installerArgs += '--exclusive'
}
# Strip --no-exclusive (bootstrap-level opt-out, not an installer flag)
$installerArgs = @($installerArgs | Where-Object { $_ -ne '--no-exclusive' })

# Bypass install.ps1's PS param layer (Unix-style flags would fail PS ValidateSet
# binding under @splat). Bootstrap already verified node above, so we go straight
# to scripts/installer.js — same path install.ps1 ultimately delegates to.
$installerJs = Join-Path $MCC_DIR 'scripts\installer.js'
if (-not (Test-Path $installerJs)) {
  Write-Host "[X] $installerJs not found (clone incomplete?)" -ForegroundColor Red
  exit 1
}

# Self-heal: rebuild dist/ if missing (rare — repo ships it pre-built)
$distDir = Join-Path $MCC_DIR 'dist'
if (-not (Test-Path $distDir)) {
  Write-Host ""
  Write-Host "[..] dist/ missing, running build..." -ForegroundColor Yellow
  Push-Location $MCC_DIR
  try {
    & node (Join-Path $MCC_DIR 'adapters\build.js')
    if ($LASTEXITCODE -ne 0) {
      Write-Host "[X] build failed" -ForegroundColor Red
      exit $LASTEXITCODE
    }
  } finally {
    Pop-Location
  }
}

# Read MCC version from manifest for banner
$mccVersion = "(unknown)"
$manifestPath = Join-Path $MCC_DIR "manifest.json"
if (Test-Path $manifestPath) {
  try {
    $m = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($m.version) { $mccVersion = $m.version }
  } catch {}
}

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  MCC Installer v$mccVersion" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[..] Running installer (args: $($installerArgs -join ' '))..." -ForegroundColor Cyan

# DO NOT change cwd before invoking installer.js. installer.js's --scope project
# uses path.resolve('.claude') / '.codex' which is relative to process.cwd() —
# it MUST stay as the user's project dir. installer.js itself uses __dirname to
# locate the MCC repo's dist/ regardless of cwd.
& node $installerJs @installerArgs
if ($LASTEXITCODE -ne 0) {
  Write-Host "[X] installer failed (exit $LASTEXITCODE)" -ForegroundColor Red
  exit $LASTEXITCODE
}

# 3. Done
Write-Host ""
Write-Host "====================================" -ForegroundColor Green
Write-Host "  [OK] MCC installed" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Restart Claude Code (so new commands take effect)"
Write-Host "  2. Type 'help' in Claude Code to see navigation"
Write-Host "  3. Existing project: /onboard ; New project: /init"
Write-Host ""
Write-Host "MCC location: $MCC_DIR"
Write-Host "Update MCC:   re-run this bootstrap command (auto git pull)"
Write-Host "Uninstall:    cd $MCC_DIR; .\uninstall.ps1"
Write-Host ""

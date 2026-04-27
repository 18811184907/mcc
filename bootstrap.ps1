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
$MCC_DIR  = Join-Path $HOME ".mcc-install"

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

# 1. clone or pull
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

# 2. Collect args: $args (direct) + $env:MCC_BOOTSTRAP_ARGS (iwr|iex friendly)
$installerArgs = @()
if ($args.Count -gt 0) { $installerArgs += $args }
if ($env:MCC_BOOTSTRAP_ARGS) {
  # Supports: $env:MCC_BOOTSTRAP_ARGS = "--exclusive --scope project"
  $installerArgs += ($env:MCC_BOOTSTRAP_ARGS -split '\s+' | Where-Object { $_ })
}

# 3. ONE question (only if TTY and no --scope already): install to current project?
$hasScope = ($installerArgs -contains '--scope')
if (-not $hasScope) {
  $isInteractive = $false
  try { $isInteractive = -not [Console]::IsInputRedirected } catch { $isInteractive = $false }

  if ($isInteractive) {
    Write-Host ""
    Write-Host "Where to install?" -ForegroundColor Yellow
    Write-Host "  [N] Global  -> ~/.claude/  (default, recommended)"
    Write-Host "  [y] Project -> ./.claude/  (current dir: $(Get-Location))"
    $ans = Read-Host "Install to current project? (y/N)"
    if ($ans -match '^(y|yes)$') {
      $installerArgs += '--scope', 'project'
    } else {
      $installerArgs += '--scope', 'global'
    }
  } else {
    # iwr|iex non-interactive -> default global silently
    $installerArgs += '--scope', 'global'
  }
}

# 4. Default to --exclusive unless user opted out
$hasExclusive  = ($installerArgs -contains '--exclusive')
$hasOptOut     = ($installerArgs -contains '--no-exclusive')
if (-not $hasExclusive -and -not $hasOptOut) {
  $installerArgs += '--exclusive'
}
# Strip --no-exclusive (bootstrap-level opt-out, not an installer flag)
$installerArgs = @($installerArgs | Where-Object { $_ -ne '--no-exclusive' })

Write-Host ""
Write-Host "[..] Running install.ps1 (args: $($installerArgs -join ' '))..." -ForegroundColor Cyan
Push-Location $MCC_DIR
try {
  & "$MCC_DIR\install.ps1" @installerArgs
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[X] install.ps1 failed (exit $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
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

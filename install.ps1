# install.ps1 - MCC installer (Windows)
#
# Usage:
#   .\install.ps1                        # auto-detect + global install (coexist mode, skip same-name)
#   .\install.ps1 -Exclusive             # exclusive: clear agents/commands/skills/modes then install MCC
#   .\install.ps1 -Scope project         # install to current project's .claude / .codex
#   .\install.ps1 -Target claude-code    # only Claude Code side
#   .\install.ps1 -Force                 # overwrite same-name files (default skip)
#   .\install.ps1 -DryRun                # print plan only, no file changes
#   .\install.ps1 -Strict                # strict permissions (vs default trust mode)
#   .\install.ps1 -SkipClaudemd          # do not auto-write ~/.claude/CLAUDE.md
#
# This is a thin wrapper. Real logic in scripts/installer.js (Node, cross-platform shared).

param(
    [ValidateSet('global', 'project', 'hybrid')]
    [string]$Scope = 'global',

    [ValidateSet('auto', 'claude-code', 'codex', 'both')]
    [string]$Target = 'auto',

    [switch]$Force,
    [switch]$Exclusive,
    [switch]$DryRun,
    [switch]$Verbose,
    [switch]$Strict,
    [switch]$SkipClaudemd
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# --- Environment check ---

function Test-CommandExists {
    param([string]$Command)
    return [bool](Get-Command $Command -ErrorAction SilentlyContinue)
}

if (-not (Test-CommandExists 'node')) {
    Write-Host "`n[X] Node.js not found`n" -ForegroundColor Red
    Write-Host "MCC installer requires Node 18+. Install:" -ForegroundColor Yellow
    Write-Host "  https://nodejs.org/en/download"
    Write-Host "  or: winget install OpenJS.NodeJS"
    exit 1
}

$nodeVersion = (node --version) -replace '^v', ''
$nodeMajor = [int]($nodeVersion -split '\.')[0]
if ($nodeMajor -lt 18) {
    Write-Host "`n[X] Node version too old: v$nodeVersion`n" -ForegroundColor Red
    Write-Host "Need Node 18+, please upgrade." -ForegroundColor Yellow
    exit 1
}

# --- Check dist/ is ready ---

$distDir = Join-Path $ScriptDir 'dist'
if (-not (Test-Path $distDir)) {
    Write-Host "`n[!] dist/ not found, running build..." -ForegroundColor Yellow
    Push-Location $ScriptDir
    try {
        & node (Join-Path $ScriptDir 'adapters\build.js')
        if ($LASTEXITCODE -ne 0) {
            Write-Host "`n[X] build failed`n" -ForegroundColor Red
            exit $LASTEXITCODE
        }
    } finally {
        Pop-Location
    }
}

# --- Invoke main installer ---

$installerJs = Join-Path $ScriptDir 'scripts\installer.js'
if (-not (Test-Path $installerJs)) {
    Write-Host "`n[X] scripts\installer.js not found`n" -ForegroundColor Red
    Write-Host "MCC distribution incomplete, please re-clone or re-download." -ForegroundColor Yellow
    exit 1
}

$installerArgs = @(
    $installerJs,
    '--scope', $Scope,
    '--target', $Target
)
if ($Force)         { $installerArgs += '--force' }
if ($Exclusive)     { $installerArgs += '--exclusive' }
if ($DryRun)        { $installerArgs += '--dry-run' }
if ($Verbose)       { $installerArgs += '--verbose' }
if ($Strict)        { $installerArgs += '--strict' }
if ($SkipClaudemd)  { $installerArgs += '--skip-claudemd' }

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan

# Read version from manifest.json (avoid hardcode drift)
$mccVersion = "(unknown)"
$manifestPath = Join-Path $ScriptDir "manifest.json"
if (Test-Path $manifestPath) {
    try {
        $manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($manifest.version) { $mccVersion = $manifest.version }
    } catch {
        Write-Host "  [!] manifest.json parse failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  [!] manifest.json not found at $manifestPath" -ForegroundColor Yellow
}
Write-Host "  MCC Installer v$mccVersion" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

& node @installerArgs
exit $LASTEXITCODE

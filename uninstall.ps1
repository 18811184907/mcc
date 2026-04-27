# uninstall.ps1 - MCC uninstaller (Windows)
#
# Usage:
#   .\uninstall.ps1                                 # restore from latest backup
#   .\uninstall.ps1 -Timestamp 2026-04-24-140523    # restore specific backup
#   .\uninstall.ps1 -Scope project                  # uninstall current project's .claude / .codex

[CmdletBinding()]
param(
    [ValidateSet('global', 'project')]
    [string]$Scope = 'global',

    [string]$Timestamp = '',

    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Get-Command 'node' -ErrorAction SilentlyContinue)) {
    Write-Host "`n[X] Node.js not found`n" -ForegroundColor Red
    exit 1
}

$uninstallerJs = Join-Path $ScriptDir 'scripts\uninstaller.js'
if (-not (Test-Path $uninstallerJs)) {
    Write-Host "`n[X] scripts\uninstaller.js not found`n" -ForegroundColor Red
    exit 1
}

$installerArgs = @(
    $uninstallerJs,
    '--scope', $Scope
)
if ($Timestamp) { $installerArgs += @('--timestamp', $Timestamp) }
if ($DryRun)    { $installerArgs += '--dry-run' }

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  MCC Uninstaller" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

& node @installerArgs
exit $LASTEXITCODE

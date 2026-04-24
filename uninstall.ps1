# uninstall.ps1 — MCC uninstaller (Windows)
#
# 用法:
#   .\uninstall.ps1                         # 从最近备份恢复
#   .\uninstall.ps1 -Timestamp 2026-04-24-140523   # 指定备份时间戳恢复
#   .\uninstall.ps1 -Scope project          # 卸载当前项目的 .claude / .codex

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
    Write-Host "`n❌ 未检测到 Node.js`n" -ForegroundColor Red
    exit 1
}

$uninstallerJs = Join-Path $ScriptDir 'scripts\uninstaller.js'
if (-not (Test-Path $uninstallerJs)) {
    Write-Host "`n❌ 找不到 scripts\uninstaller.js`n" -ForegroundColor Red
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

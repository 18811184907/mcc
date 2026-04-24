# install.ps1 — MCC installer (Windows)
#
# 用法:
#   .\install.ps1                        # 自动检测 + 全局安装（共存模式，同名跳过）
#   .\install.ps1 -Exclusive             # 独占模式：清空 agents/commands/skills/modes 再装 MCC
#   .\install.ps1 -Scope project         # 装到当前项目的 .claude / .codex
#   .\install.ps1 -Target claude-code    # 只装 Claude Code 侧
#   .\install.ps1 -Force                 # 覆盖同名文件（默认跳过）
#   .\install.ps1 -DryRun                # 只打印计划，不动文件
#
# 本文件是薄 wrapper。真正逻辑在 scripts/installer.js（Node 跑，跨平台共享）。

[CmdletBinding()]
param(
    [ValidateSet('global', 'project', 'hybrid')]
    [string]$Scope = 'global',

    [ValidateSet('auto', 'claude-code', 'codex', 'both')]
    [string]$Target = 'auto',

    [switch]$Force,
    [switch]$Exclusive,
    [switch]$DryRun,
    [switch]$Verbose
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# ─── 环境检查 ─────────────────────────────────────────

function Test-CommandExists {
    param([string]$Command)
    return [bool](Get-Command $Command -ErrorAction SilentlyContinue)
}

if (-not (Test-CommandExists 'node')) {
    Write-Host "`n❌ 未检测到 Node.js`n" -ForegroundColor Red
    Write-Host "MCC installer 需要 Node 18+。请先安装:" -ForegroundColor Yellow
    Write-Host "  https://nodejs.org/en/download"
    Write-Host "  或 winget install OpenJS.NodeJS"
    exit 1
}

$nodeVersion = (node --version) -replace '^v', ''
$nodeMajor = [int]($nodeVersion -split '\.')[0]
if ($nodeMajor -lt 18) {
    Write-Host "`n❌ Node 版本太旧: v$nodeVersion`n" -ForegroundColor Red
    Write-Host "需要 Node 18+，请升级。" -ForegroundColor Yellow
    exit 1
}

# ─── 检查 dist/ 是否就绪 ──────────────────────────────

$distDir = Join-Path $ScriptDir 'dist'
if (-not (Test-Path $distDir)) {
    Write-Host "`n⚠  dist/ 不存在，先跑一次 build..." -ForegroundColor Yellow
    Push-Location $ScriptDir
    try {
        & node (Join-Path $ScriptDir 'adapters\build.js')
        if ($LASTEXITCODE -ne 0) {
            Write-Host "`n❌ build 失败`n" -ForegroundColor Red
            exit $LASTEXITCODE
        }
    } finally {
        Pop-Location
    }
}

# ─── 调用主 installer ────────────────────────────────

$installerJs = Join-Path $ScriptDir 'scripts\installer.js'
if (-not (Test-Path $installerJs)) {
    Write-Host "`n❌ 找不到 scripts\installer.js`n" -ForegroundColor Red
    Write-Host "MCC 分发包不完整，请重新 clone 或下载。" -ForegroundColor Yellow
    exit 1
}

$installerArgs = @(
    $installerJs,
    '--scope', $Scope,
    '--target', $Target
)
if ($Force)     { $installerArgs += '--force' }
if ($Exclusive) { $installerArgs += '--exclusive' }
if ($DryRun)    { $installerArgs += '--dry-run' }
if ($Verbose)   { $installerArgs += '--verbose' }

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
# 动态读取 manifest.json 的 version，不再硬编（防版本漂移）
$mccVersion = "(unknown)"
$manifestPath = Join-Path $PSScriptRoot "manifest.json"
if (Test-Path $manifestPath) {
  try {
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.version) { $mccVersion = $manifest.version }
  } catch {
    Write-Host "  ⚠ manifest.json 解析失败，version 显示 (unknown)。错误: $($_.Exception.Message)" -ForegroundColor Yellow
  }
} else {
  Write-Host "  ⚠ 找不到 manifest.json（应在 $manifestPath）" -ForegroundColor Yellow
}
Write-Host "  MCC Installer v$mccVersion" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

& node @installerArgs
exit $LASTEXITCODE

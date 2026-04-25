#!/usr/bin/env pwsh
# MCC 一键远程引导（Windows）
#
# 用法（一行）:
#   iwr -useb https://raw.githubusercontent.com/18811184907/mcc/main/bootstrap.ps1 | iex
#
# 带参数（如装到当前项目）:
#   $args = '--scope', 'project'
#   iex (iwr -useb https://raw.githubusercontent.com/18811184907/mcc/main/bootstrap.ps1).Content
#
# 做的事:
#   1. 检查 git / node ≥ 18
#   2. clone (或 pull) MCC 到 $HOME\.mcc-install
#   3. 跑 install.ps1（默认 --scope global，可透传参数）
#   4. 输出"装好了"指引

$ErrorActionPreference = "Stop"

$REPO_URL = "https://github.com/18811184907/mcc"
$MCC_DIR  = Join-Path $HOME ".mcc-install"

Write-Host ""
Write-Host "════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  MCC Bootstrap (远程一键引导)" -ForegroundColor Cyan
Write-Host "════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# 0. 依赖检查
$missing = @()
if (-not (Get-Command git -ErrorAction SilentlyContinue))  { $missing += "git" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { $missing += "node" }
if ($missing.Count -gt 0) {
  Write-Host "❌ 缺少依赖: $($missing -join ', ')" -ForegroundColor Red
  Write-Host ""
  Write-Host "Windows 安装:" -ForegroundColor Yellow
  Write-Host "  winget install --id Git.Git -e"
  Write-Host "  winget install --id OpenJS.NodeJS.LTS -e"
  Write-Host ""
  Write-Host "装好后重新跑这条引导命令。"
  exit 1
}

# Node 版本 ≥ 18
$nodeVer = (& node -v).TrimStart('v')
$nodeMajor = [int]($nodeVer.Split('.')[0])
if ($nodeMajor -lt 18) {
  Write-Host "❌ Node v$nodeVer 太老，MCC 需要 18+" -ForegroundColor Red
  Write-Host "升级: winget install --id OpenJS.NodeJS.LTS -e"
  exit 1
}
Write-Host "✓ git + node v$nodeVer 检查通过" -ForegroundColor Green

# 1. clone 或 pull
if (Test-Path $MCC_DIR) {
  Write-Host ""
  Write-Host "📦 已有 MCC 副本于 $MCC_DIR，更新到最新..." -ForegroundColor Cyan
  Push-Location $MCC_DIR
  try {
    git pull origin main --quiet
    Write-Host "✓ git pull 成功" -ForegroundColor Green
  } catch {
    Pop-Location
    Write-Host "⚠ git pull 失败，删除重 clone..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $MCC_DIR
  } finally {
    if ((Get-Location).Path -eq $MCC_DIR) { Pop-Location }
  }
}

if (-not (Test-Path $MCC_DIR)) {
  Write-Host ""
  Write-Host "📥 从 $REPO_URL clone 到 $MCC_DIR ..." -ForegroundColor Cyan
  git clone --depth 1 $REPO_URL $MCC_DIR
  if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ clone 失败" -ForegroundColor Red
    exit 1
  }
  Write-Host "✓ clone 成功" -ForegroundColor Green
}

# 2. 收集参数：$args（直接传） + $env:MCC_BOOTSTRAP_ARGS（iwr|iex 模式下的方便方式）
$installerArgs = @()
if ($args.Count -gt 0) { $installerArgs += $args }
if ($env:MCC_BOOTSTRAP_ARGS) {
  # 支持: $env:MCC_BOOTSTRAP_ARGS = "--exclusive --scope project"
  $installerArgs += ($env:MCC_BOOTSTRAP_ARGS -split '\s+' | Where-Object { $_ })
}

Write-Host ""
if ($installerArgs.Count -gt 0) {
  Write-Host "🔧 启动 install.ps1 (参数: $($installerArgs -join ' '))..." -ForegroundColor Cyan
} else {
  Write-Host "🔧 启动 install.ps1 ..." -ForegroundColor Cyan
}
Push-Location $MCC_DIR
try {
  & "$MCC_DIR\install.ps1" @installerArgs
  if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ install.ps1 失败（exit $LASTEXITCODE）" -ForegroundColor Red
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}

# 3. 完成提示
Write-Host ""
Write-Host "════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✅ MCC 装好了" -ForegroundColor Green
Write-Host "════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "下一步:" -ForegroundColor Yellow
Write-Host "  1. 重启 Claude Code（让新命令生效）"
Write-Host "  2. 敲 'help'（中文："我该做什么"）查看导航"
Write-Host "  3. 已有项目 → /onboard ; 全新项目 → /init"
Write-Host ""
Write-Host "MCC 副本: $MCC_DIR"
Write-Host "更新 MCC: 重新跑这条 bootstrap 命令（自动 git pull）"
Write-Host "卸载: cd $MCC_DIR; .\uninstall.ps1"
Write-Host ""

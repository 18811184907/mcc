# team-install.ps1 — MCC 团队成员一键安装（Windows）
#
# 给团队小白同事用的零门槛安装脚本。
# 同事只要右键 → "用 PowerShell 运行" 就完事。

# ═══════════════════════════════════════════════════════
# ⚠  管理员一次性填这两行，然后把整个脚本发给同事
# ═══════════════════════════════════════════════════════

$TEAM_PAT  = "ghp_CHANGE_ME_FILL_IN_YOUR_PAT_HERE"   # PAT: github.com/settings/personal-access-tokens/new
$TEAM_USER = "18811184907"                            # 你的 GitHub 账号（公司账号）

# ═══════════════════════════════════════════════════════
# 以下同事运行即可，不用改任何东西
# ═══════════════════════════════════════════════════════

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

# ─── 工具函数 ─────────────────────────────────────────

function Write-Header {
    param([string]$Msg)
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $Msg" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step($Msg) { Write-Host "→ $Msg" -ForegroundColor Yellow }
function Write-Ok($Msg)   { Write-Host "✓ $Msg" -ForegroundColor Green }
function Write-Err($Msg)  { Write-Host "✗ $Msg" -ForegroundColor Red }
function Write-Info($Msg) { Write-Host "  $Msg" -ForegroundColor Gray }

function Test-Cmd($c) { return [bool](Get-Command $c -ErrorAction SilentlyContinue) }

function Stop-WithError($Msg, [int]$Code = 1) {
    Write-Err $Msg
    Write-Host ""
    Write-Host "遇到问题请联系团队管理员。" -ForegroundColor Yellow
    Write-Host "按任意键退出..."
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    exit $Code
}

# ─── 欢迎 ───────────────────────────────────────────

Write-Header "MCC 团队工具安装"
Write-Host "这会帮你装好:"
Write-Host "  · 代码备份工具（/backup 一键推到公司 GitHub）"
Write-Host "  · AI 编码助手套件（Claude Code 里直接用）"
Write-Host ""
Write-Host "全程自动，大概 3-5 分钟。"
Write-Host ""

# ─── 0. 检查管理员填了 PAT 吗 ────────────────────────

if ($TEAM_PAT -eq "ghp_CHANGE_ME_FILL_IN_YOUR_PAT_HERE" -or -not $TEAM_PAT) {
    Stop-WithError "脚本顶部的 PAT 没填。请联系团队管理员要一个填好 PAT 的新脚本。"
}

# ─── 1. Node.js ──────────────────────────────────────

Write-Step "[1/5] 检查 Node.js"
if (Test-Cmd 'node') {
    $v = (node --version) -replace '^v', ''
    $m = [int]($v -split '\.')[0]
    if ($m -ge 18) {
        Write-Ok "Node.js v$v 已装"
    } else {
        Stop-WithError "Node.js v$v 太旧（需要 18+）。请到 https://nodejs.org 下载最新 LTS 版本装，然后重新跑本脚本。"
    }
} else {
    Write-Info "Node.js 没装，正在自动装..."
    if (-not (Test-Cmd 'winget')) {
        Stop-WithError "系统没装 winget（Windows 应用商店管理器）。请手动装 Node.js: https://nodejs.org/zh-cn/download/"
    }
    winget install --id OpenJS.NodeJS --accept-package-agreements --accept-source-agreements --silent | Out-Null
    Write-Ok "Node.js 装好了"
    Write-Info "⚠  需要**关闭这个 PowerShell 窗口，重新打开**再跑一次本脚本（让系统识别 node 命令）"
    Write-Host ""
    Write-Host "按任意键退出..."
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    exit 0
}

# ─── 2. Git ──────────────────────────────────────────

Write-Step "[2/5] 检查 Git"
if (Test-Cmd 'git') {
    Write-Ok "Git 已装"
} else {
    Write-Info "Git 没装，正在自动装..."
    winget install --id Git.Git --accept-package-agreements --accept-source-agreements --silent | Out-Null
    Write-Ok "Git 装好了"
    Write-Info "⚠  需要重启 PowerShell 再跑本脚本"
    Write-Host "按任意键退出..."
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    exit 0
}

# ─── 3. GitHub CLI ───────────────────────────────────

Write-Step "[3/5] 检查 GitHub CLI（用于建 repo）"
$ghPath = $null
if (Test-Cmd 'gh') {
    $ghPath = 'gh'
} elseif (Test-Path "C:\Program Files\GitHub CLI\gh.exe") {
    $ghPath = "C:\Program Files\GitHub CLI\gh.exe"
}

if ($ghPath) {
    Write-Ok "GitHub CLI 已装"
} else {
    Write-Info "GitHub CLI 没装，正在自动装..."
    winget install --id GitHub.cli --accept-package-agreements --accept-source-agreements --silent | Out-Null
    if (Test-Path "C:\Program Files\GitHub CLI\gh.exe") {
        $ghPath = "C:\Program Files\GitHub CLI\gh.exe"
        Write-Ok "GitHub CLI 装好了"
    } else {
        Stop-WithError "GitHub CLI 自动装失败。请手动下载: https://cli.github.com/"
    }
}

# ─── 4. 自动用 PAT 登录（核心：同事不用输入任何东西）──

Write-Step "[4/5] 用公司 PAT 自动登录 GitHub"

# 先检查当前状态
$authStatus = & $ghPath auth status 2>&1 | Out-String
if ($authStatus -match "Logged in to github\.com as $TEAM_USER") {
    Write-Ok "已登录为 $TEAM_USER"
} else {
    if ($authStatus -match "Logged in") {
        Write-Info "检测到其他账号登录中，先登出..."
        & $ghPath auth logout --hostname github.com 2>&1 | Out-Null
    }
    Write-Info "用 PAT 登录 $TEAM_USER..."
    $TEAM_PAT | & $ghPath auth login --with-token
    if ($LASTEXITCODE -ne 0) {
        Stop-WithError "PAT 登录失败。可能 PAT 过期或权限不够，请联系团队管理员要新 PAT。"
    }
    Write-Ok "登录成功 ($TEAM_USER)"
}

# 顺便给 git 配 credential helper（这样 git push 也能用 PAT）
Write-Info "配置 git 自动认证..."
& $ghPath auth setup-git 2>&1 | Out-Null
Write-Ok "git 认证已配好（以后 git push 会自动用这个 PAT）"

# ─── 5. clone MCC + 装 ──────────────────────────────

Write-Step "[5/5] 下载并安装 MCC"

$mccDir = Join-Path $env:USERPROFILE ".mcc-install"
if (Test-Path $mccDir) {
    Write-Info "目录已存在，更新到最新版..."
    Push-Location $mccDir
    try {
        git pull origin main --quiet 2>&1 | Out-Null
    } catch {
        Write-Info "更新失败，删掉重新 clone..."
        Pop-Location
        Remove-Item -Recurse -Force $mccDir
    }
    if (Test-Path $mccDir) { Pop-Location -ErrorAction SilentlyContinue }
}

if (-not (Test-Path $mccDir)) {
    Write-Info "从 GitHub clone MCC..."
    git clone "https://github.com/$TEAM_USER/mcc.git" $mccDir --quiet 2>&1 | Out-Null
    if (-not (Test-Path $mccDir)) {
        Stop-WithError "clone MCC 失败。可能 repo 地址错了或 PAT 权限不够。"
    }
}

Write-Info "运行 MCC 安装（独占模式）..."
Push-Location $mccDir
try {
    & .\install.ps1 -Exclusive 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Stop-WithError "MCC 安装失败"
    }
} finally {
    Pop-Location
}

Write-Ok "MCC 装好了"

# ─── 完成 ─────────────────────────────────────────────

Write-Header "全部完成 🎉"

Write-Host "下一步（写代码时）:" -ForegroundColor White
Write-Host ""
Write-Host "  1. 打开 Claude Code，进入你的项目目录" -ForegroundColor White
Write-Host ""
Write-Host "  2. 写完代码，在 Claude Code 里敲:" -ForegroundColor White
Write-Host ""
Write-Host "     /backup `"简短说明你改了啥`"" -ForegroundColor Cyan
Write-Host ""
Write-Host "     第一次会自动问你名字 + 邮箱（一次性），然后就能每天用了" -ForegroundColor Gray
Write-Host ""
Write-Host "使用说明: $mccDir\TEAM-MEMBER-GUIDE.md" -ForegroundColor Gray
Write-Host ""
Write-Host "按任意键关闭此窗口..."
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')

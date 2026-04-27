# tests/bootstrap-e2e.ps1
#
# PowerShell-side end-to-end smoke for bootstrap.ps1 -> installer.js path.
# Catches the class of bugs that hit users in v2.3.2-2.3.5 and the v2.3.5
# project-scope cwd-pollution: anything that breaks at the PS argument layer
# or between bootstrap and installer.
#
# IMPORTANT: this file MUST stay pure ASCII (no Chinese, no em-dash, no smart
# quotes). PowerShell 5.1 on zh-CN Windows reads UTF-8 (no BOM) files as GBK,
# corrupting any multi-byte char into garbage that breaks parsing. Match
# installer output via English [project-stub] marker we added in v2.4.

param(
    [string]$BootstrapPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'bootstrap.ps1')
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path $BootstrapPath)) {
    Write-Host "[X] bootstrap.ps1 not found at $BootstrapPath" -ForegroundColor Red
    exit 1
}

# Use v2.4 MCC_DIR + MCC_NO_PULL env overrides to point bootstrap at local repo
# without disturbing user's real ~/.mcc-install
$env:MCC_DIR = $root
$env:MCC_NO_PULL = "1"

$pass = 0
$fail = 0
$failures = @()

function Test-Case {
    param(
        [string]$Name,
        [string]$BootstrapArgs,
        [string[]]$MustContain,
        [string[]]$MustNotContain
    )

    $tmpDir = Join-Path $env:TEMP "mcc-e2e-$(Get-Random)"
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
    $origLocation = Get-Location

    try {
        Set-Location $tmpDir
        $env:MCC_BOOTSTRAP_ARGS = $BootstrapArgs

        $script = Get-Content $BootstrapPath -Raw
        $output = (Invoke-Expression $script 2>&1 | Out-String)

        $allOk = $true
        foreach ($needle in $MustContain) {
            if (-not ($output -match [regex]::Escape($needle))) {
                $allOk = $false
                $script:failures += "[$Name] missing expected: '$needle'"
            }
        }
        foreach ($antineedle in $MustNotContain) {
            if ($output -match [regex]::Escape($antineedle)) {
                $allOk = $false
                $script:failures += "[$Name] should NOT contain: '$antineedle'"
            }
        }

        if ($allOk) {
            Write-Host "  [OK] $Name" -ForegroundColor Green
            $script:pass++
        } else {
            Write-Host "  [X]  $Name" -ForegroundColor Red
            $script:fail++
        }
    } finally {
        Set-Location $origLocation
        Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
        $env:MCC_BOOTSTRAP_ARGS = $null
    }
}

Write-Host ""
Write-Host "===================================="
Write-Host "  MCC Bootstrap E2E Test (PowerShell)"
Write-Host "===================================="
Write-Host ""

# Test 1: smart (default) - target ~/.claude AND project stub at cwd
Test-Case `
    -Name "smart (default): user-level to ~/.claude + project stub at cwd" `
    -BootstrapArgs "--dry-run" `
    -MustContain @(
        "smart-split",
        "[project-stub]"
    ) `
    -MustNotContain @(
        "ParameterBindingValidationException",
        "ParameterArgumentValidationError"
    )

# Test 2: --scope global - target ~/.claude only, NO project stub
Test-Case `
    -Name "scope=global: only ~/.claude, no project stub" `
    -BootstrapArgs "--scope global --dry-run" `
    -MustContain @(
        "Claude Code"
    ) `
    -MustNotContain @(
        "[project-stub]",
        "ParameterBindingValidationException"
    )

# Test 3: --scope project (team mode) - target cwd .claude, no separate stub
Test-Case `
    -Name "scope=project (team mode): full install to cwd .claude/" `
    -BootstrapArgs "--scope project --dry-run" `
    -MustContain @(
        "mcc-e2e"
    ) `
    -MustNotContain @(
        "ParameterBindingValidationException",
        "[project-stub]"
    )

# Test 4: --no-project-stub - smart but skip cwd PRPs/
Test-Case `
    -Name "smart + --no-project-stub: ~/.claude only" `
    -BootstrapArgs "--no-project-stub --dry-run" `
    -MustContain @(
        "smart-split"
    ) `
    -MustNotContain @(
        "[project-stub]"
    )

# Cleanup env overrides
$env:MCC_DIR = $null
$env:MCC_NO_PULL = $null

Write-Host ""
Write-Host "===================================="
$resultColor = if ($fail -eq 0) { 'Green' } else { 'Red' }
Write-Host ("  Results: {0} passed, {1} failed" -f $pass, $fail) -ForegroundColor $resultColor
Write-Host "===================================="

if ($fail -gt 0) {
    Write-Host ""
    Write-Host "Failures:" -ForegroundColor Red
    foreach ($f in $failures) {
        Write-Host "  - $f" -ForegroundColor Red
    }
    exit 1
}

exit 0

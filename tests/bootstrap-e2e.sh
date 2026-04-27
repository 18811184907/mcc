#!/usr/bin/env bash
# tests/bootstrap-e2e.sh
#
# Bash-side end-to-end smoke for bootstrap.sh -> install.sh -> installer.js.
# Catches the cwd-pollution / scope-handling class of bugs that hit users in
# v2.3.2-2.3.5 and validates v2.4 smart-split default.
#
# Strategy:
#   1. Create a temp dir, cd into it
#   2. Run bootstrap.sh with MCC_BOOTSTRAP_ARGS forcing --dry-run + a known scope
#   3. Capture stdout, scan for the lines that prove the right behavior:
#        - smart scope:   target ~/.claude/ + project stub block at cwd
#        - project scope: target = <tmpdir>/.claude/
#        - global scope:  no project stub block
#   4. Cleanup tmp dir
#
# This deliberately runs against the LOCAL bootstrap.sh (not curl|bash) so we
# can validate uncommitted changes.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BOOTSTRAP="$ROOT/bootstrap.sh"

if [ ! -f "$BOOTSTRAP" ]; then
    echo "[X] bootstrap.sh not found at $BOOTSTRAP" >&2
    exit 1
fi

# Use v2.4 MCC_DIR + MCC_NO_PULL env overrides to point bootstrap at local repo
# without disturbing user's real ~/.mcc-install
export MCC_DIR="$ROOT"
export MCC_NO_PULL=1

cleanup() {
    unset MCC_DIR MCC_NO_PULL
}
trap cleanup EXIT

PASS=0
FAIL=0
FAILURES=()

run_test() {
    local name="$1"
    local args="$2"
    local must_contain="$3"      # newline-separated
    local must_not_contain="$4"  # newline-separated

    local tmpdir
    tmpdir="$(mktemp -d -t mcc-e2e-XXXXXX)"
    local output

    pushd "$tmpdir" >/dev/null
    output="$(MCC_BOOTSTRAP_ARGS="$args" bash "$BOOTSTRAP" 2>&1 || true)"
    popd >/dev/null

    local ok=1

    while IFS= read -r needle; do
        [ -z "$needle" ] && continue
        if ! grep -qF "$needle" <<<"$output"; then
            ok=0
            FAILURES+=("[$name] missing expected: '$needle'")
        fi
    done <<<"$must_contain"

    while IFS= read -r anti; do
        [ -z "$anti" ] && continue
        if grep -qF "$anti" <<<"$output"; then
            ok=0
            FAILURES+=("[$name] should NOT contain: '$anti'")
        fi
    done <<<"$must_not_contain"

    if [ "$ok" = "1" ]; then
        echo "  [OK] $name"
        PASS=$((PASS + 1))
    else
        echo "  [X]  $name"
        FAIL=$((FAIL + 1))
    fi

    rm -rf "$tmpdir"
}

echo ""
echo "===================================="
echo "  MCC Bootstrap E2E Test (bash)"
echo "===================================="
echo ""

# Test 1: smart (default)
run_test "smart (default): ~/.claude + project PRPs/ at cwd" \
    "--dry-run" \
    "smart-split
$HOME/.claude
项目级残骸" \
    ""

# Test 2: --scope global
run_test "scope=global: only ~/.claude, no project stub" \
    "--scope global --dry-run" \
    "$HOME/.claude" \
    "项目级残骸"

# Test 3: --scope project (team mode)
run_test "scope=project: full install to cwd .claude/ (team mode)" \
    "--scope project --dry-run" \
    "Claude Code 目标:
mcc-e2e" \
    "项目级残骸"

# Test 4: --no-project-stub
run_test "smart + --no-project-stub: ~/.claude only" \
    "--no-project-stub --dry-run" \
    "smart-split
$HOME/.claude" \
    "项目级残骸"

echo ""
echo "===================================="
echo "  Results: $PASS passed, $FAIL failed"
echo "===================================="

if [ "$FAIL" -gt 0 ]; then
    echo ""
    echo "Failures:"
    for f in "${FAILURES[@]}"; do
        echo "  - $f"
    done
    exit 1
fi

exit 0

#!/usr/bin/env bash
# uninstall.sh — MCC uninstaller (macOS/Linux/Git Bash)

set -euo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]}"
while [ -L "$SCRIPT_PATH" ]; do
    link_dir="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
    SCRIPT_PATH="$(readlink "$SCRIPT_PATH")"
    [[ "$SCRIPT_PATH" != /* ]] && SCRIPT_PATH="$link_dir/$SCRIPT_PATH"
done
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
    echo ""
    echo "❌ 未检测到 Node.js"
    exit 1
fi

UNINSTALLER_JS="$SCRIPT_DIR/scripts/uninstaller.js"
if [ ! -f "$UNINSTALLER_JS" ]; then
    echo ""
    echo "❌ 找不到 scripts/uninstaller.js"
    exit 1
fi

if command -v cygpath >/dev/null 2>&1; then
    UNINSTALLER_JS="$(cygpath -w "$UNINSTALLER_JS")"
fi

echo ""
echo "===================================="
echo "  MCC Uninstaller"
echo "===================================="
echo ""

exec node "$UNINSTALLER_JS" "$@"

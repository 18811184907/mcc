#!/usr/bin/env bash
# install.sh — MCC installer (macOS/Linux/Git Bash)
#
# 用法:
#   ./install.sh                         # 自动检测 + 全局安装
#   ./install.sh --scope project         # 装到当前项目的 .claude / .codex
#   ./install.sh --target claude-code    # 只装 Claude Code 侧
#   ./install.sh --force                 # 覆盖同名文件
#   ./install.sh --dry-run               # 只打印计划，不动文件
#
# 本文件是薄 wrapper。真正逻辑在 scripts/installer.js（Node 跑，跨平台共享）。

set -euo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]}"
while [ -L "$SCRIPT_PATH" ]; do
    link_dir="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
    SCRIPT_PATH="$(readlink "$SCRIPT_PATH")"
    [[ "$SCRIPT_PATH" != /* ]] && SCRIPT_PATH="$link_dir/$SCRIPT_PATH"
done
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"

# ─── 环境检查 ─────────────────────────────────────────

if ! command -v node >/dev/null 2>&1; then
    echo ""
    echo "❌ 未检测到 Node.js"
    echo ""
    echo "MCC installer 需要 Node 18+。请先安装:"
    echo "  https://nodejs.org/en/download"
    echo "  或 macOS: brew install node"
    echo "  或 Linux: sudo apt install nodejs npm"
    exit 1
fi

NODE_VERSION=$(node --version | sed 's/^v//')
NODE_MAJOR="${NODE_VERSION%%.*}"
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo ""
    echo "❌ Node 版本太旧: v$NODE_VERSION"
    echo ""
    echo "需要 Node 18+，请升级。"
    exit 1
fi

# ─── 检查 dist/ 是否就绪 ──────────────────────────────

if [ ! -d "$SCRIPT_DIR/dist" ]; then
    echo ""
    echo "⚠  dist/ 不存在，先跑一次 build..."
    cd "$SCRIPT_DIR"
    node "$SCRIPT_DIR/adapters/build.js"
fi

# ─── 调用主 installer ────────────────────────────────

INSTALLER_JS="$SCRIPT_DIR/scripts/installer.js"
if [ ! -f "$INSTALLER_JS" ]; then
    echo ""
    echo "❌ 找不到 scripts/installer.js"
    echo ""
    echo "MCC 分发包不完整，请重新 clone 或下载。"
    exit 1
fi

# ─── Git Bash 路径转换 ───────────────────────────────

if command -v cygpath >/dev/null 2>&1; then
    INSTALLER_JS="$(cygpath -w "$INSTALLER_JS")"
fi

echo ""
echo "===================================="
# 动态读取 manifest.json 的 version
# v2.6.4 fix: 之前用 $ROOT 但全文未定义；bash set -u 下直接 unbound 退出，
# install.sh 完全跑不通（codex audit 找到的 HIGH 静态确定 bug）。改 $SCRIPT_DIR。
MCC_VERSION="(unknown)"
if [ -f "$SCRIPT_DIR/manifest.json" ]; then
  MCC_VERSION=$(node -e "console.log(require('$SCRIPT_DIR/manifest.json').version)" 2>/dev/null || echo "(unknown)")
fi
echo "  MCC Installer v$MCC_VERSION"
echo "===================================="
echo ""

# 转发所有参数
exec node "$INSTALLER_JS" "$@"

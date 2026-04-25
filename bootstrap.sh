#!/usr/bin/env bash
# MCC 一键远程引导（macOS / Linux / Git Bash）
#
# 用法（一行）:
#   curl -fsSL https://raw.githubusercontent.com/18811184907/mcc/main/bootstrap.sh | bash
#
# 带参数（如装到当前项目）:
#   curl -fsSL https://raw.githubusercontent.com/18811184907/mcc/main/bootstrap.sh | bash -s -- --scope project
#
# 做的事:
#   1. 检查 git / node ≥ 18
#   2. clone（或 pull）MCC 到 $HOME/.mcc-install
#   3. 跑 install.sh（默认 --scope global，可透传参数）
#   4. 输出"装好了"指引

set -euo pipefail

REPO_URL="https://github.com/18811184907/mcc"
MCC_DIR="$HOME/.mcc-install"

C_CYAN='\033[36m'
C_GREEN='\033[32m'
C_YELLOW='\033[33m'
C_RED='\033[31m'
C_RESET='\033[0m'

echo ""
echo -e "${C_CYAN}════════════════════════════════════${C_RESET}"
echo -e "${C_CYAN}  MCC Bootstrap (远程一键引导)${C_RESET}"
echo -e "${C_CYAN}════════════════════════════════════${C_RESET}"
echo ""

# 0. 依赖检查
missing=()
command -v git  >/dev/null 2>&1 || missing+=("git")
command -v node >/dev/null 2>&1 || missing+=("node")

if [ "${#missing[@]}" -gt 0 ]; then
  echo -e "${C_RED}❌ 缺少依赖: ${missing[*]}${C_RESET}"
  echo ""
  case "$(uname -s)" in
    Darwin*)
      echo -e "${C_YELLOW}macOS 安装:${C_RESET}"
      echo "  brew install git node"
      ;;
    Linux*)
      echo -e "${C_YELLOW}Linux 安装:${C_RESET}"
      echo "  Ubuntu/Debian: sudo apt install git nodejs"
      echo "  Fedora/RHEL:   sudo dnf install git nodejs"
      echo "  Arch:          sudo pacman -S git nodejs"
      ;;
    MINGW*|CYGWIN*|MSYS*)
      echo -e "${C_YELLOW}Windows Git Bash 安装:${C_RESET}"
      echo "  在 PowerShell: winget install --id Git.Git -e"
      echo "                 winget install --id OpenJS.NodeJS.LTS -e"
      ;;
  esac
  echo ""
  echo "装好后重新跑这条引导命令。"
  exit 1
fi

# Node 版本 ≥ 18
node_ver=$(node -v | sed 's/^v//')
node_major=$(echo "$node_ver" | cut -d. -f1)
if [ "$node_major" -lt 18 ]; then
  echo -e "${C_RED}❌ Node v$node_ver 太老，MCC 需要 18+${C_RESET}"
  case "$(uname -s)" in
    Darwin*) echo "升级: brew upgrade node" ;;
    Linux*)  echo "升级: 用你的包管理器，或装 nvm 后 nvm install --lts" ;;
  esac
  exit 1
fi
echo -e "${C_GREEN}✓ git + node v$node_ver 检查通过${C_RESET}"

# 1. clone 或 pull
if [ -d "$MCC_DIR" ]; then
  echo ""
  echo -e "${C_CYAN}📦 已有 MCC 副本于 $MCC_DIR，更新到最新...${C_RESET}"
  if ( cd "$MCC_DIR" && git pull origin main --quiet ); then
    echo -e "${C_GREEN}✓ git pull 成功${C_RESET}"
  else
    echo -e "${C_YELLOW}⚠ git pull 失败，删除重 clone...${C_RESET}"
    rm -rf "$MCC_DIR"
  fi
fi

if [ ! -d "$MCC_DIR" ]; then
  echo ""
  echo -e "${C_CYAN}📥 从 $REPO_URL clone 到 $MCC_DIR ...${C_RESET}"
  if ! git clone --depth 1 "$REPO_URL" "$MCC_DIR"; then
    echo -e "${C_RED}❌ clone 失败${C_RESET}"
    exit 1
  fi
  echo -e "${C_GREEN}✓ clone 成功${C_RESET}"
fi

# 2. 收集参数：$@（bash -s -- 透传） + MCC_BOOTSTRAP_ARGS（env 方式，curl|bash 友好）
installer_args=("$@")
if [ -n "${MCC_BOOTSTRAP_ARGS:-}" ]; then
  # 支持: MCC_BOOTSTRAP_ARGS="--exclusive --scope project" curl ... | bash
  read -r -a env_args <<< "$MCC_BOOTSTRAP_ARGS"
  installer_args+=("${env_args[@]}")
fi

echo ""
if [ "${#installer_args[@]}" -gt 0 ]; then
  echo -e "${C_CYAN}🔧 启动 install.sh (参数: ${installer_args[*]})...${C_RESET}"
else
  echo -e "${C_CYAN}🔧 启动 install.sh ...${C_RESET}"
fi
( cd "$MCC_DIR" && bash ./install.sh "${installer_args[@]}" )

# 3. 完成提示
echo ""
echo -e "${C_GREEN}════════════════════════════════════${C_RESET}"
echo -e "${C_GREEN}  ✅ MCC 装好了${C_RESET}"
echo -e "${C_GREEN}════════════════════════════════════${C_RESET}"
echo ""
echo -e "${C_YELLOW}下一步:${C_RESET}"
echo "  1. 重启 Claude Code（让新命令生效）"
echo "  2. 敲 'help'（中文：'我该做什么'）查看导航"
echo "  3. 已有项目 → /onboard ; 全新项目 → /init"
echo ""
echo "MCC 副本: $MCC_DIR"
echo "更新 MCC: 重新跑这条 bootstrap 命令（自动 git pull）"
echo "卸载: cd $MCC_DIR && ./uninstall.sh"
echo ""

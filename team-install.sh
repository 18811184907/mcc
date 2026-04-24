#!/usr/bin/env bash
# team-install.sh — MCC 团队成员一键安装（macOS / Linux / Git Bash）
#
# 同事怎么用：
#   1. 管理员发给你这个文件
#   2. 打开终端 (Terminal / iTerm)，拖这个文件到终端里（自动填完路径），回车
#      或者：cd 到文件所在目录，跑  bash team-install.sh

set -eo pipefail

# ═══════════════════════════════════════════════════════
# ⚠  管理员一次性填这两行，然后把整个脚本发给同事
# ═══════════════════════════════════════════════════════

TEAM_PAT="ghp_CHANGE_ME_FILL_IN_YOUR_PAT_HERE"
TEAM_USER="18811184907"

# ═══════════════════════════════════════════════════════
# 以下同事运行即可
# ═══════════════════════════════════════════════════════

C_CYAN='\033[36m'
C_YELLOW='\033[33m'
C_GREEN='\033[32m'
C_RED='\033[31m'
C_GRAY='\033[90m'
C_RESET='\033[0m'

hdr()   { echo; echo -e "${C_CYAN}═══════════════════════════════════════════════════════${C_RESET}"; echo -e "${C_CYAN}  $*${C_RESET}"; echo -e "${C_CYAN}═══════════════════════════════════════════════════════${C_RESET}"; echo; }
step()  { echo -e "${C_YELLOW}→ $*${C_RESET}"; }
ok()    { echo -e "${C_GREEN}✓ $*${C_RESET}"; }
err()   { echo -e "${C_RED}✗ $*${C_RESET}"; }
info()  { echo -e "${C_GRAY}  $*${C_RESET}"; }

stop_with_error() {
  err "$1"
  echo
  echo "遇到问题请联系团队管理员。"
  exit "${2:-1}"
}

has_cmd() { command -v "$1" >/dev/null 2>&1; }

hdr "MCC 团队工具安装"
echo "这会帮你装好:"
echo "  · 代码备份工具（/backup 一键推到公司 GitHub）"
echo "  · AI 编码助手套件（Claude Code 里直接用）"
echo
echo "全程自动，大概 3-5 分钟。"
echo

# ─── 0. 检查 PAT 填了吗 ──────────────────────────────

if [ "$TEAM_PAT" = "ghp_CHANGE_ME_FILL_IN_YOUR_PAT_HERE" ] || [ -z "$TEAM_PAT" ]; then
  stop_with_error "脚本顶部的 PAT 没填。请联系团队管理员要一个填好 PAT 的新脚本。"
fi

# ─── 平台检测 ────────────────────────────────────────

OS="$(uname -s)"
case "$OS" in
  Darwin*) PLATFORM="mac" ;;
  Linux*)  PLATFORM="linux" ;;
  MINGW*|CYGWIN*|MSYS*) PLATFORM="windows-bash" ;;
  *) stop_with_error "未识别的操作系统: $OS" ;;
esac
info "平台: $PLATFORM"

# ─── 装包管理器（Mac 要 brew）──────────────────────

if [ "$PLATFORM" = "mac" ] && ! has_cmd brew; then
  step "检测到 Mac 没装 Homebrew，正在装..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  ok "Homebrew 装好"
fi

# ─── 1. Node.js ──────────────────────────────────────

step "[1/5] 检查 Node.js"
if has_cmd node; then
  NODE_VER="$(node --version | sed 's/^v//')"
  NODE_MAJOR="${NODE_VER%%.*}"
  if [ "$NODE_MAJOR" -ge 18 ]; then
    ok "Node.js v$NODE_VER 已装"
  else
    stop_with_error "Node.js v$NODE_VER 太旧（需要 18+）。请升级到最新 LTS: https://nodejs.org"
  fi
else
  info "Node.js 没装，正在自动装..."
  case "$PLATFORM" in
    mac)   brew install node ;;
    linux)
      if has_cmd apt; then
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt install -y nodejs
      elif has_cmd yum; then
        curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
        sudo yum install -y nodejs
      else
        stop_with_error "不支持的 Linux 包管理器。请手动装 Node 18+: https://nodejs.org"
      fi
      ;;
    *) stop_with_error "请手动装 Node 18+: https://nodejs.org" ;;
  esac
  ok "Node.js 装好"
fi

# ─── 2. Git ──────────────────────────────────────────

step "[2/5] 检查 Git"
if has_cmd git; then
  ok "Git 已装"
else
  info "Git 没装，正在自动装..."
  case "$PLATFORM" in
    mac)   brew install git ;;
    linux)
      if has_cmd apt;   then sudo apt install -y git
      elif has_cmd yum; then sudo yum install -y git
      else stop_with_error "请手动装 git"; fi
      ;;
    *) stop_with_error "请手动装 git" ;;
  esac
  ok "Git 装好"
fi

# ─── 3. GitHub CLI ───────────────────────────────────

step "[3/5] 检查 GitHub CLI（用于建 repo）"
if has_cmd gh; then
  ok "GitHub CLI 已装"
else
  info "GitHub CLI 没装，正在自动装..."
  case "$PLATFORM" in
    mac)   brew install gh ;;
    linux)
      if has_cmd apt; then
        type -p curl >/dev/null || sudo apt install -y curl
        curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
        sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
        sudo apt update && sudo apt install -y gh
      elif has_cmd yum; then
        sudo yum install -y 'dnf-command(config-manager)' && \
          sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo && \
          sudo dnf install -y gh
      else
        stop_with_error "不支持的 Linux 包管理器。请手动装 gh: https://cli.github.com"
      fi
      ;;
    *) stop_with_error "请手动装 gh: https://cli.github.com" ;;
  esac
  ok "GitHub CLI 装好"
fi

# ─── 4. 自动用 PAT 登录 ──────────────────────────────

step "[4/5] 用公司 PAT 自动登录 GitHub"

if gh auth status 2>&1 | grep -q "Logged in to github.com as $TEAM_USER"; then
  ok "已登录为 $TEAM_USER"
else
  if gh auth status 2>&1 | grep -q "Logged in"; then
    info "检测到其他账号登录，先登出..."
    gh auth logout --hostname github.com 2>/dev/null || true
  fi
  info "用 PAT 登录 $TEAM_USER..."
  echo "$TEAM_PAT" | gh auth login --with-token
  if [ $? -ne 0 ]; then
    stop_with_error "PAT 登录失败。可能 PAT 过期或权限不够，请联系团队管理员要新 PAT。"
  fi
  ok "登录成功 ($TEAM_USER)"
fi

info "配置 git 自动认证..."
gh auth setup-git 2>/dev/null || true
ok "git 认证已配好"

# ─── 5. clone MCC + 装 ──────────────────────────────

step "[5/5] 下载并安装 MCC"

MCC_DIR="$HOME/.mcc-install"
if [ -d "$MCC_DIR" ]; then
  info "目录已存在，更新到最新版..."
  cd "$MCC_DIR"
  if ! git pull origin main --quiet 2>/dev/null; then
    cd "$HOME"
    info "更新失败，删掉重新 clone..."
    rm -rf "$MCC_DIR"
  fi
fi

if [ ! -d "$MCC_DIR" ]; then
  info "从 GitHub clone MCC..."
  git clone "https://github.com/$TEAM_USER/mcc.git" "$MCC_DIR" --quiet
  if [ ! -d "$MCC_DIR" ]; then
    stop_with_error "clone MCC 失败。可能 repo 地址错了或 PAT 权限不够。"
  fi
fi

info "运行 MCC 安装（独占模式）..."
cd "$MCC_DIR"
bash ./install.sh --exclusive
if [ $? -ne 0 ]; then
  stop_with_error "MCC 安装失败"
fi
ok "MCC 装好"

# ─── 完成 ────────────────────────────────────────────

hdr "全部完成 🎉"

echo "下一步（写代码时）:"
echo
echo -e "  1. 打开 ${C_CYAN}Claude Code${C_RESET}，进入你的项目目录"
echo
echo "  2. 写完代码，在 Claude Code 里敲:"
echo
echo -e "     ${C_CYAN}/backup \"简短说明你改了啥\"${C_RESET}"
echo
echo "     第一次会自动问你名字 + 邮箱（一次性），然后就能每天用了"
echo
echo -e "${C_GRAY}使用说明: $MCC_DIR/TEAM-MEMBER-GUIDE.md${C_RESET}"
echo

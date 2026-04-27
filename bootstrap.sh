#!/usr/bin/env bash
# MCC one-line bootstrap (macOS / Linux / Git Bash)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/18811184907/mcc/main/bootstrap.sh | bash
#
# What it does:
#   1. Check git / node >= 18
#   2. clone (or pull) MCC to $HOME/.mcc-install
#   3. Ask ONE question (TTY only): install to current project (y) or global (N, default)?
#   4. Run install.sh with defaults: --exclusive --strict-NO trust-mode + auto CLAUDE.md
#   5. Print "installed" guide
#
# Override defaults via env or args:
#   MCC_BOOTSTRAP_ARGS="--strict --skip-claudemd" curl ... | bash
#   curl ... | bash -s -- --strict --skip-claudemd

set -euo pipefail

REPO_URL="https://github.com/18811184907/mcc"
MCC_DIR="$HOME/.mcc-install"

C_CYAN='\033[36m'
C_GREEN='\033[32m'
C_YELLOW='\033[33m'
C_RED='\033[31m'
C_RESET='\033[0m'

echo ""
echo -e "${C_CYAN}====================================${C_RESET}"
echo -e "${C_CYAN}  MCC Bootstrap (one-line installer)${C_RESET}"
echo -e "${C_CYAN}====================================${C_RESET}"
echo ""

# 0. Dependency check
missing=()
command -v git  >/dev/null 2>&1 || missing+=("git")
command -v node >/dev/null 2>&1 || missing+=("node")

if [ "${#missing[@]}" -gt 0 ]; then
  echo -e "${C_RED}[X] Missing: ${missing[*]}${C_RESET}"
  echo ""
  case "$(uname -s)" in
    Darwin*)
      echo -e "${C_YELLOW}macOS install:${C_RESET}"
      echo "  brew install git node"
      ;;
    Linux*)
      echo -e "${C_YELLOW}Linux install:${C_RESET}"
      echo "  Ubuntu/Debian: sudo apt install git nodejs"
      echo "  Fedora/RHEL:   sudo dnf install git nodejs"
      echo "  Arch:          sudo pacman -S git nodejs"
      ;;
    MINGW*|CYGWIN*|MSYS*)
      echo -e "${C_YELLOW}Windows Git Bash install:${C_RESET}"
      echo "  In PowerShell: winget install --id Git.Git -e"
      echo "                 winget install --id OpenJS.NodeJS.LTS -e"
      ;;
  esac
  echo ""
  echo "Install deps then re-run this bootstrap command."
  exit 1
fi

# Node version >= 18
node_ver=$(node -v | sed 's/^v//')
node_major=$(echo "$node_ver" | cut -d. -f1)
if [ "$node_major" -lt 18 ]; then
  echo -e "${C_RED}[X] Node v$node_ver too old, MCC needs 18+${C_RESET}"
  case "$(uname -s)" in
    Darwin*) echo "Upgrade: brew upgrade node" ;;
    Linux*)  echo "Upgrade: use your package manager, or install nvm + nvm install --lts" ;;
  esac
  exit 1
fi
echo -e "${C_GREEN}[OK] git + node v$node_ver ready${C_RESET}"

# 1. clone or pull
if [ -d "$MCC_DIR" ]; then
  echo ""
  echo -e "${C_CYAN}[..] MCC already at $MCC_DIR, updating...${C_RESET}"
  if ( cd "$MCC_DIR" && git pull origin main --quiet ); then
    echo -e "${C_GREEN}[OK] git pull done${C_RESET}"
  else
    echo -e "${C_YELLOW}[!] git pull failed, removing and re-cloning...${C_RESET}"
    rm -rf "$MCC_DIR"
  fi
fi

if [ ! -d "$MCC_DIR" ]; then
  echo ""
  echo -e "${C_CYAN}[..] Cloning $REPO_URL to $MCC_DIR ...${C_RESET}"
  if ! git clone --depth 1 "$REPO_URL" "$MCC_DIR"; then
    echo -e "${C_RED}[X] clone failed${C_RESET}"
    exit 1
  fi
  echo -e "${C_GREEN}[OK] clone done${C_RESET}"
fi

# 2. Collect args: $@ (bash -s -- pass-through) + MCC_BOOTSTRAP_ARGS (env, curl|bash friendly)
installer_args=("$@")
if [ -n "${MCC_BOOTSTRAP_ARGS:-}" ]; then
  # Supports: MCC_BOOTSTRAP_ARGS="--exclusive --scope project" curl ... | bash
  read -r -a env_args <<< "$MCC_BOOTSTRAP_ARGS"
  installer_args+=("${env_args[@]}")
fi

# 3. ONE question (only if TTY and no --scope already provided): install to current project?
has_scope=0
for a in "${installer_args[@]:-}"; do
  if [ "$a" = "--scope" ]; then has_scope=1; break; fi
done

if [ "$has_scope" -eq 0 ] && [ -t 0 ]; then
  echo ""
  echo -e "${C_YELLOW}Where to install?${C_RESET}"
  echo "  [N] Global  -> ~/.claude/  (default, recommended for personal use)"
  echo "  [y] Project -> ./.claude/  (in current dir: $(pwd))"
  read -p "Install to current project? (y/N): " ans </dev/tty || ans="N"
  case "$ans" in
    y|Y|yes|Yes|YES) installer_args+=("--scope" "project") ;;
    *) installer_args+=("--scope" "global") ;;
  esac
elif [ "$has_scope" -eq 0 ]; then
  # Non-TTY (curl|bash with no tty stdin) -> default global silently
  installer_args+=("--scope" "global")
fi

# 4. Default to --exclusive (clean install) unless user explicitly opted out via --no-exclusive or already provided --exclusive
has_exclusive_flag=0
for a in "${installer_args[@]:-}"; do
  case "$a" in
    --exclusive|--no-exclusive) has_exclusive_flag=1; break ;;
  esac
done
if [ "$has_exclusive_flag" -eq 0 ]; then
  installer_args+=("--exclusive")
fi
# Strip --no-exclusive (it's not a real installer flag, just a bootstrap opt-out)
filtered_args=()
for a in "${installer_args[@]:-}"; do
  [ "$a" = "--no-exclusive" ] || filtered_args+=("$a")
done
installer_args=("${filtered_args[@]:-}")

echo ""
echo -e "${C_CYAN}[..] Running install.sh (args: ${installer_args[*]})...${C_RESET}"
( cd "$MCC_DIR" && bash ./install.sh "${installer_args[@]}" )

# 5. Done
echo ""
echo -e "${C_GREEN}====================================${C_RESET}"
echo -e "${C_GREEN}  [OK] MCC installed${C_RESET}"
echo -e "${C_GREEN}====================================${C_RESET}"
echo ""
echo -e "${C_YELLOW}Next steps:${C_RESET}"
echo "  1. Restart Claude Code (so new commands take effect)"
echo "  2. Type 'help' in Claude Code to see navigation"
echo "  3. Existing project: /onboard ; New project: /init"
echo ""
echo "MCC location: $MCC_DIR"
echo "Update MCC:   re-run this bootstrap command (auto git pull)"
echo "Uninstall:    cd $MCC_DIR && ./uninstall.sh"
echo ""

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
# v2.4: $MCC_DIR overridable via env (for local e2e tests)
MCC_DIR="${MCC_DIR:-$HOME/.mcc-install}"
# v2.4: MCC_NO_PULL=1 skips clone/pull (for local e2e tests with MCC_DIR override)
MCC_NO_PULL="${MCC_NO_PULL:-0}"

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

# 1. clone or pull (skip when MCC_NO_PULL=1, e.g. local e2e tests with MCC_DIR override)
if [ "$MCC_NO_PULL" = "1" ]; then
  if [ ! -d "$MCC_DIR" ]; then
    echo -e "${C_RED}[X] MCC_NO_PULL=1 but $MCC_DIR does not exist${C_RESET}"
    exit 1
  fi
  echo -e "${C_GREEN}[OK] using existing $MCC_DIR (MCC_NO_PULL=1, skip pull/clone)${C_RESET}"
else
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
fi

# 2. Collect args: $@ (bash -s -- pass-through) + MCC_BOOTSTRAP_ARGS (env, curl|bash friendly)
installer_args=("$@")
if [ -n "${MCC_BOOTSTRAP_ARGS:-}" ]; then
  # Supports: MCC_BOOTSTRAP_ARGS="--exclusive --scope project" curl ... | bash
  read -r -a env_args <<< "$MCC_BOOTSTRAP_ARGS"
  installer_args+=("${env_args[@]}")
fi

# 3. v2.4 smart-split is the new default (no question). User can override via env var:
#    MCC_BOOTSTRAP_ARGS="--scope global" curl ... | bash    # only ~/.claude/ + ~/.codex/
#    MCC_BOOTSTRAP_ARGS="--scope project" curl ... | bash   # team mode: full ./.claude/ + ./.codex/
#    MCC_BOOTSTRAP_ARGS="--no-project-stub" curl ... | bash # smart but skip cwd PRPs/
has_scope=0
for a in "${installer_args[@]:-}"; do
  if [ "$a" = "--scope" ]; then has_scope=1; break; fi
done

if [ "$has_scope" -eq 0 ]; then
  # Default is smart (installer.js default). Print where it will install for transparency.
  echo ""
  echo -e "${C_YELLOW}MCC will install to:${C_RESET}"
  echo "  ~/.claude/                              Claude Code user-level (agents/commands/skills/settings)"
  echo "  ~/.codex/                               Codex user-level (agents/prompts/AGENTS.md/config)"
  if [ "$(pwd)" != "$HOME" ]; then
    echo "  $(pwd)/.claude/PRPs/   project work-products dir"
  else
    echo "  (cwd is \$HOME -> skipping project PRPs/ stub)"
  fi
  echo ""
  echo "  team-shared install? -> rerun with: MCC_BOOTSTRAP_ARGS='--scope project'"
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
# DO NOT cd into $MCC_DIR before calling install.sh. installer.js's --scope project
# uses path.resolve('.claude') / '.codex' relative to process.cwd() — it MUST stay
# as the user's project dir. install.sh uses absolute $SCRIPT_DIR for its own
# scripts/installer.js lookup, so it doesn't need to be invoked from $MCC_DIR.
bash "$MCC_DIR/install.sh" "${installer_args[@]}"

# v2.5.2: Optional dotfiles bootstrap. If MCC_DOTFILES_REPO env var is set, clone it
# and seed ~/.claude/CLAUDE.md from there. New-device onboard becomes one-liner.
if [ -n "${MCC_DOTFILES_REPO:-}" ]; then
  # Reject anything that isn't a plain https://, git@, or ssh:// remote URL.
  # Without this, MCC_DOTFILES_REPO=/tmp/local-repo or git:// would bypass the
  # HTTPS-trust assumption baked into the rest of the dotfiles flow.
  case "$MCC_DOTFILES_REPO" in
    https://*|http://*|git@*|ssh://*) ;;
    *)
      echo -e "${C_RED}[X] MCC_DOTFILES_REPO must be https://, git@, or ssh:// — got: $MCC_DOTFILES_REPO${C_RESET}"
      exit 1
      ;;
  esac
  echo ""
  echo -e "${C_CYAN}[..] Bootstrapping dotfiles from $MCC_DOTFILES_REPO ...${C_RESET}"
  dotfiles_parent="$HOME/.dotfiles"
  dotfiles_dir="$dotfiles_parent/claude-dotfiles"
  mkdir -p "$dotfiles_parent"
  if [ -d "$dotfiles_dir" ]; then
    echo -e "${C_YELLOW}[!] $dotfiles_dir already exists, skipping clone${C_RESET}"
  else
    if git clone "$MCC_DOTFILES_REPO" "$dotfiles_dir"; then
      dotfiles_claudemd="$dotfiles_dir/CLAUDE.md"
      user_claudemd="$HOME/.claude/CLAUDE.md"
      if [ -f "$dotfiles_claudemd" ]; then
        if [ -f "$user_claudemd" ]; then
          backup="$user_claudemd.backup-$(date +%Y%m%d-%H%M%S)"
          cp "$user_claudemd" "$backup"
          echo -e "${C_GREEN}[OK] backed up existing ~/.claude/CLAUDE.md → $backup${C_RESET}"
        fi
        cp -f "$dotfiles_claudemd" "$user_claudemd"
        echo -e "${C_GREEN}[OK] seeded ~/.claude/CLAUDE.md from dotfiles repo${C_RESET}"
      fi
      mkdir -p "$HOME/.claude"
      # Build JSON via python3 so quotes/newlines/backslashes in MCC_DOTFILES_REPO
      # can't break out of the string (heredoc interpolation alone is unsafe).
      # Falls back to grep-style sanitization if python3 isn't available.
      if command -v python3 >/dev/null 2>&1; then
        python3 -c '
import json, sys
out = {
  "repoUrl": sys.argv[1],
  "dotfilesDir": "~/.dotfiles/claude-dotfiles",
  "syncFile": "CLAUDE.md",
  "version": 1,
}
print(json.dumps(out, indent=2, ensure_ascii=False))
' "$MCC_DOTFILES_REPO" > "$HOME/.claude/.claudemd-sync.config"
      else
        # No python3 — fail closed if URL has any character that could escape the heredoc.
        case "$MCC_DOTFILES_REPO" in
          *\"* | *\\* | *$'\n'*)
            echo -e "${C_RED}[X] python3 not found and MCC_DOTFILES_REPO contains special chars; install python3 and re-run${C_RESET}"
            exit 1
            ;;
        esac
        cat > "$HOME/.claude/.claudemd-sync.config" <<EOF
{
  "repoUrl": "$MCC_DOTFILES_REPO",
  "dotfilesDir": "~/.dotfiles/claude-dotfiles",
  "syncFile": "CLAUDE.md",
  "version": 1
}
EOF
      fi
      echo -e "${C_GREEN}[OK] wrote claudemd-sync config${C_RESET}"
      echo -e "${C_GREEN}[OK] dotfiles ready. Future ~/.claude/CLAUDE.md edits auto-sync to GitHub.${C_RESET}"
    else
      echo -e "${C_RED}[X] dotfiles clone failed. Skipping seed.${C_RESET}"
    fi
  fi
fi

# 5. Done
echo ""
echo -e "${C_GREEN}====================================${C_RESET}"
echo -e "${C_GREEN}  [OK] MCC installed${C_RESET}"
echo -e "${C_GREEN}====================================${C_RESET}"
echo ""
echo -e "${C_YELLOW}Next steps:${C_RESET}"
echo "  Restart your client (Claude Code or Codex) so new commands/prompts load."
echo ""
echo -e "  ${C_CYAN}Claude Code users:${C_RESET}"
echo "    Existing project: /onboard ; New project: /init"
echo "    MCC navigation:   /mcc-help"
echo ""
echo -e "  ${C_CYAN}Codex users:${C_RESET}"
echo "    Existing project: type 'mcc-onboard' ; New project: 'mcc-init'"
echo "    MCC navigation:   type 'mcc-help'"
echo "    (Codex prompts are invoked by name 'mcc-<cmd>', not by '/' slash)"
echo ""
echo "MCC location: $MCC_DIR"
echo "Update MCC:   re-run this bootstrap command (auto git pull)"
echo "Uninstall:    cd $MCC_DIR && ./uninstall.sh"
echo ""

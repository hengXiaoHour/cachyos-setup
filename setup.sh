#!/usr/bin/env bash
# =============================================================================
# CachyOS Setup — one-shot installer
#
# Installs everything in this repo:
#   1. OpenCode config + plugins + skills
#   2. Hermes Agent (keyless via OpenCode Zen)
#   3. GNOME extensions (auto-move-to-workspace + touchpad)
#   4. System tweak scripts (boot, touchpad, dash-to-panel, bloatware)
#
# Run in a cloned repo:
#   ./setup.sh                 # everything that can run in $HOME, no prompts
#   ./setup.sh --full          # ...plus the scripts that need sudo / log-out
#
# Or straight from the web (no clone needed):
#   curl -fsSL https://raw.githubusercontent.com/hengXiaoHour/cachyos-setup/master/setup.sh | bash
#   # for the full sudo+GUI pass:
#   curl -fsSL .../setup.sh | bash -s -- --full
#
# Flags:
#   --full        Also run the sudo/reboot-requiring steps (boot, bloatware,
#                 dash-to-panel, touchpad-scroll). Skips anything needing a
#                 manual interaction.
#   --skip-opencode  Skip the OpenCode config copy
#   --skip-hermes    Skip the Hermes keyless install
#   --skip-gnome     Skip the GNOME extension install
#   --no-sudo        Never invoke sudo (auto-added by default when needed)
#
# Idempotent: safe to re-run; already-installed components are skipped.
# =============================================================================
set -euo pipefail

FULL=0
SKIP_OPENCODE=0
SKIP_HERMES=0
SKIP_GNOME=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --full) FULL=1 ;;
    --skip-opencode) SKIP_OPENCODE=1 ;;
    --skip-hermes)   SKIP_HERMES=1 ;;
    --skip-gnome)    SKIP_GNOME=1 ;;
    --no-sudo) SUDO="" ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

# Locate the repo dir. When piped via curl, we are run from stdin with cwd=~
# and the repo files aren't present — flag that clearly.
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" 2>/dev/null && pwd)"
if [[ ! -f "$REPO_DIR/setup.sh" ]]; then
  echo "NOTE: running from a remote pipe (no local repo). Only home-level installs run." >&2
  REPO_DIR="$HOME/cachyos-setup"
fi
SUDO="${SUDO:-sudo}"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()  { printf '\033[1;32m    %s\033[0m\n' "$*"; }

# --- 1. OpenCode config + plugins + skills ---------------------------------
if [[ "$SKIP_OPENCODE" -eq 0 ]]; then
  say "[1/4] OpenCode config + plugins + skills"
  mkdir -p ~/.config/opencode/{plugins,mcp-servers,skills} ~/obsidian-vault/opencode
  cp -rn "$REPO_DIR/opencode-config/opencode.jsonc" ~/.config/opencode/ 2>/dev/null || true
  for d in memory-mcp playwright-mcp subagent-orchestrator github-sync session-sync; do
    mkdir -p ~/.config/opencode/plugins/"$d"
    cp -rn "$REPO_DIR/opencode-config/$d/." ~/.config/opencode/plugins/"$d"/ 2>/dev/null || true
  done
  mkdir -p ~/.config/opencode/mcp-servers
  cp -rn "$REPO_DIR/opencode-config/mcp-servers/." ~/.config/opencode/mcp-servers/ 2>/dev/null || true
  mkdir -p ~/.config/opencode/skills
  cp -rn "$REPO_DIR/opencode-config/skills/verify-before-handover" ~/.config/opencode/skills/ 2>/dev/null || true
  cp -n "$REPO_DIR/opencode-config/AGENTS.md" ~/.config/opencode/ 2>/dev/null || true
  ok "OpenCode config synced"
fi

# --- 2. Hermes Agent (keyless via OpenCode Zen) ----------------------------
if [[ "$SKIP_HERMES" -eq 0 ]]; then
  say "[2/4] Hermes Agent (keyless via OpenCode Zen)"
  if command -v hermes >/dev/null 2>&1; then
    ok "hermes already installed"
  elif [[ -x "$REPO_DIR/hermes-opencode/install.sh" ]]; then
    (cd "$REPO_DIR/hermes-opencode" && ./install.sh)
  else
    # Remote-pipe path: run the bundle's installer if we have it cached, else
    # just the keyless Heremes bootstrap without the local skill files.
    curl -fsSL https://raw.githubusercontent.com/hengXiaoHour/cachyos-setup/master/hermes-opencode/install.sh | bash
  fi
fi

# --- 3. GNOME extensions -----------------------------------------------------
if [[ "$SKIP_GNOME" -eq 0 ]]; then
  say "[3/4] GNOME extensions (auto-move + touchpad)"
  if [[ -x "$REPO_DIR/gnome-extensions/install.sh" ]]; then
    (cd "$REPO_DIR/gnome-extensions" && ./install.sh) \
      || ok "extensions staged — log out/in to activate (log-out step is skipped in --full)"
  else
    ok "skipping (no gnome-extensions dir available)"
  fi
fi

# --- 4. System tweaks (only with --full, or explicit) ------------------------
say "[4/4] System tweaks"
if [[ "$FULL" -eq 1 ]]; then
  # Boot optimization (needs sudo)
  if [[ -x "$REPO_DIR/optimize-boot.sh" ]]; then
    echo "    Running optimize-boot.sh (sudo)..."
    (cd "$REPO_DIR" && "$SUDO" ./optimize-boot.sh) || echo "    skipped"
  fi
  # Limine fast boot
  if [[ -f /boot/limine.conf ]]; then
    echo "    Skipping Limine changes (would affect /boot; edit manually per README §7)"
  fi
  # Touchpad scroll factor (needs sudo + meson/ninja)
  if [[ -x "$REPO_DIR/fix-touchpad-scroll-arch.sh" ]]; then
    echo "    Running fix-touchpad-scroll-arch.sh (sudo)..."
    (cd "$REPO_DIR" && bash fix-touchpad-scroll-arch.sh) || echo "    skipped"
  fi
  # Dash to panel preset
  if command -v gnome-shell >/dev/null 2>&1; then
    echo "    Applying dash-to-panel preset..."
    (cd "$REPO_DIR" && bash dash-to-panel-preset.sh) || echo "    skipped"
  else
    echo "    Skipping dash-to-panel (gnome-shell not found)"
  fi
  # Bloatware removal (sudo) — opt-in by default, run only with --full
  if [[ -x "$REPO_DIR/remove-bloatware.sh" ]]; then
    echo "    Running remove-bloatware.sh (sudo)..."
    (cd "$REPO_DIR" && "$SUDO" bash remove-bloatware.sh) || echo "    skipped"
  fi
else
  echo "    Skipped (pass --full to run sudo/reboot-requiring tweaks)"
fi

say "Done!"
echo "  - OpenCode: run 'opencode' (or flatpak run ai.opencode.opencode)"
echo "  - Hermes:   run 'hermes chat -q \"hi\"'"
echo "  - GNOME:    log out/in to activate extensions"
echo "  - System:   re-run with --full if you want the sudo tweaks"

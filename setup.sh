#!/usr/bin/env bash
# =============================================================================
# CachyOS Setup — guided installer
#
# Walks you through each component one by one. For each you press:
#   y  -> install it   |   anything else (n / Enter / no input) -> skip it
# SAFE DEFAULT: nothing installs unless you explicitly type y.
#
# Components:
#   1. OpenCode config + plugins + skills
#   2. Hermes Agent (keyless via OpenCode Zen)
#   3. GNOME extensions (auto-move-to-workspace + touchpad)
#   4. ProtonVPN GUI (CLI + GTK app)
#   5. Boot optimization (sudo)
#   6. Touchpad scroll fix (sudo)
#   7. Dash-to-Panel preset
#   8. Remove bloatware (sudo)
#   9. Face unlock - Alienware x14 R2 (Howdy + IR, sudo; enroll at camera)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/hengXiaoHour/cachyos-setup/master/setup.sh | bash
#   # fully non-interactive (install EVERYTHING): use -y
#   curl -fsSL .../setup.sh | bash -s -- -y
#   # in a local clone:
#   ./setup.sh
#   ./setup.sh -y
#
# Flags:
#   -y, --yes        Non-interactive: install everything without prompting
#   --skip-opencode  Skip a specific component (composable)
#   --skip-hermes
#   --skip-gnome
#   --skip-proton
#   --skip-boot
#   --skip-touchpad
#   --skip-dash
#   --skip-bloatware
#   --skip-face
#
# Idempotent: safe to re-run; already-installed components are skipped.
# =============================================================================
set -uo pipefail

YES=0
SKIP_OPENCODE=0; SKIP_HERMES=0; SKIP_GNOME=0; SKIP_PROTON=0
SKIP_BOOT=0; SKIP_TOUCHPAD=0; SKIP_DASH=0; SKIP_BLOATWARE=0; SKIP_FACE=0
SUDO="sudo"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes) YES=1 ;;
    --skip-opencode)  SKIP_OPENCODE=1 ;;
    --skip-hermes)    SKIP_HERMES=1 ;;
    --skip-gnome)     SKIP_GNOME=1 ;;
    --skip-proton)    SKIP_PROTON=1 ;;
    --skip-boot)      SKIP_BOOT=1 ;;
    --skip-touchpad)  SKIP_TOUCHPAD=1 ;;
    --skip-dash)      SKIP_DASH=1 ;;
    --skip-bloatware) SKIP_BLOATWARE=1 ;;
    --skip-face)      SKIP_FACE=1 ;;
    --no-sudo) SUDO="" ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

# --- Locate repo: local clone if present, else note the remote-pipe case -----
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" 2>/dev/null && pwd)"
REMOTE_PIPE=0
if [[ ! -f "$REPO_DIR/setup.sh" ]]; then
  REMOTE_PIPE=1
  REPO_DIR="$HOME/cachyos-setup"
fi
# For remote-pipe we need the repo files to apply configs; pull a shallow clone.
if [[ "$REMOTE_PIPE" -eq 1 && ! -d "$REPO_DIR/.git" ]]; then
  echo "==> Cloning cachyos-setup to $REPO_DIR (needed to apply configs)..."
  git clone --depth 1 https://github.com/hengXiaoHour/cachyos-setup.git "$REPO_DIR" 2>/dev/null \
    || { echo "ERROR: could not clone repo" >&2; exit 1; }
fi

# --- Helpers -----------------------------------------------------------------
_CYAN=$'\033[1;36m'; _GREEN=$'\033[1;32m'; _YLW=$'\033[1;33m'; _NC=$'\033[0m'
say() { printf '\n%s==> %s%s\n' "$_CYAN" "$*" "$_NC"; }
ok()  { printf '%s    ✓ %s%s\n' "$_GREEN" "$*" "$_NC"; }
warn(){ printf '%s    ! %s%s\n' "$_YLW" "$*" "$_NC"; }

# A TTY is required to prompt. Even when piped via `curl | bash` (stdin is the
# script, not a terminal), we can still prompt through /dev/tty so the guide
# actually asks the user instead of silently installing everything.
HAS_TTY=0
if [[ -e /dev/tty ]] && { exec 9<>/dev/tty; } 2>/dev/null; then
  HAS_TTY=1
fi

# Prompt channel. CRITICAL: we never read from stdin (fd 0) for prompts — when
# the script is piped via `curl | bash`, stdin IS the script, so reading it
# consumes the script's own remaining lines and corrupts execution (causing the
# mid-run relaunch). Only /dev/tty is a safe prompt source.
prompt_read() {
  if [[ "$HAS_TTY" -eq 1 ]]; then
    # /dev/tty is already open as fd 9
    read -r -u 9 "$1" || true
  else
    # No terminal: do NOT read stdin. Default the variable to empty (skip).
    eval "$1=''"
  fi
}

# ask <var> <label> — returns: yes/no based on -y, --skip-*, or user input.
ask() {
  local __var="$1"; local __label="$2"
  # DEFAULT IS "no": nothing installs unless the user explicitly types y.
  # This guarantees an unanswered/EOF prompt NEVER silently installs a step.
  local __default="n"
  # honor --skip-* flags first
  if [[ -n "${SKIP_MAP[$__label]:-}" ]] && [[ "${SKIP_MAP[$__label]}" = "1" ]]; then
    printf '%s    skipping %s (flagged)\n' "$_NC" "$__label"
    eval "$__var=n"; return
  fi
  # -y/--yes: no questions, install everything
  if [[ "$YES" -eq 1 ]]; then
    eval "$__var=y"; return
  fi
  # No TTY available at all and not -y: we cannot ask — default to SKIP (safe)
  # and warn, so we never silently run sudo/system-modifying steps.
  if [[ "$HAS_TTY" -eq 0 ]]; then
    printf '%s    ! no terminal, skipping %s (re-run with -y to auto-install)\n' "$_YLW" "$__label"
    eval "$__var=n"; return
  fi
  local ans
  printf '%s    %s? [y/N] ' "$_NC" "$__label"
  prompt_read ans
  case "${ans:-$__default}" in
    y|Y|yes|YES) eval "$__var=y" ;;
    *) eval "$__var=n" ;;   # includes Enter/empty/EOF → skip (safe)
  esac
}

# Map label -> skip flag so ask() can auto-honor --skip-* flags
declare -A SKIP_MAP
SKIP_MAP[OpenCode config]="$SKIP_OPENCODE"
SKIP_MAP[Hermes Agent]="$SKIP_HERMES"
SKIP_MAP[GNOME extensions]="$SKIP_GNOME"
SKIP_MAP[ProtonVPN GUI]="$SKIP_PROTON"
SKIP_MAP[Boot optimization]="$SKIP_BOOT"
SKIP_MAP[Touchpad scroll fix]="$SKIP_TOUCHPAD"
SKIP_MAP[Dash-to-Panel preset]="$SKIP_DASH"
SKIP_MAP[Remove bloatware]="$SKIP_BLOATWARE"
SKIP_MAP[Face unlock]="$SKIP_FACE"

printf '%s\n' "$_CYAN"
printf '=====================================================\n'
printf '  CachyOS Setup — guided installer\n'
printf '  Answer y for each step you want. Enter/anything = skip.\n'
printf '=====================================================%s\n' "$_NC"

# ---- 1. OpenCode config + plugins + skills ---------------------------------
ask a "OpenCode config"
if [[ "$a" = "y" ]]; then
  say "[1/8] OpenCode config + plugins + skills"
  mkdir -p ~/.config/opencode/{plugins,mcp-servers,skills} ~/obsidian-vault/opencode
  for d in memory-mcp playwright-mcp subagent-orchestrator github-sync session-sync; do
    mkdir -p ~/.config/opencode/plugins/"$d"
    if ! cp -r "$REPO_DIR/opencode-config/$d/." ~/.config/opencode/plugins/"$d"/; then
      warn "FAILED to copy OpenCode plugin: $d"; exit 1
    fi
  done
  if ! cp "$REPO_DIR/opencode-config/opencode.jsonc" ~/.config/opencode/; then
    warn "FAILED to copy opencode.jsonc"; exit 1
  fi
  mkdir -p ~/.config/opencode/mcp-servers
  if ! cp -r "$REPO_DIR/opencode-config/mcp-servers/." ~/.config/opencode/mcp-servers/; then
    warn "FAILED to copy MCP servers"; exit 1
  fi
  mkdir -p ~/.config/opencode/skills
  if ! cp -r "$REPO_DIR/opencode-config/skills/verify-before-handover" ~/.config/opencode/skills/; then
    warn "FAILED to copy verify-before-handover skill"; exit 1
  fi
  if ! cp "$REPO_DIR/opencode-config/AGENTS.md" ~/.config/opencode/; then
    warn "FAILED to copy AGENTS.md"; exit 1
  fi
  ok "OpenCode config synced"
else
  warn "skipped OpenCode config"
fi

# ---- 2. Hermes Agent --------------------------------------------------------
ask a "Hermes Agent"
if [[ "$a" = "y" ]]; then
  say "[2/8] Hermes Agent (keyless via OpenCode Zen)"
  if command -v hermes >/dev/null 2>&1; then
    ok "hermes already installed"
  elif [[ -x "$REPO_DIR/hermes-opencode/install.sh" ]]; then
    (cd "$REPO_DIR/hermes-opencode" && ./install.sh)
  else
    curl -fsSL https://raw.githubusercontent.com/hengXiaoHour/cachyos-setup/master/hermes-opencode/install.sh | bash
  fi
else
  warn "skipped Hermes Agent"
fi

# ---- 3. GNOME extensions ----------------------------------------------------
ask a "GNOME extensions"
if [[ "$a" = "y" ]]; then
  say "[3/8] GNOME extensions (auto-move + touchpad)"
  if [[ -x "$REPO_DIR/gnome-extensions/install.sh" ]]; then
    (cd "$REPO_DIR/gnome-extensions" && ./install.sh) \
      || warn "extensions staged — log out/in to activate later"
  else
    warn "no gnome-extensions dir available"
  fi
else
  warn "skipped GNOME extensions"
fi

# ---- 4. ProtonVPN GUI -------------------------------------------------------
ask a "ProtonVPN GUI"
if [[ "$a" = "y" ]]; then
  say "[4/8] Installing ProtonVPN GUI + CLI"
  if pacman -Q proton-vpn-gtk-app >/dev/null 2>&1; then
    ok "ProtonVPN already installed"
  else
    [[ -n "$SUDO" ]] && "$SUDO" pacman -S --noconfirm proton-vpn-cli proton-vpn-gtk-app wireguard-tools \
      || warn "could not install ProtonVPN (needs sudo)"
  fi
else
  warn "skipped ProtonVPN GUI"
fi

# ---- 5. Boot optimization ---------------------------------------------------
ask a "Boot optimization"
if [[ "$a" = "y" ]]; then
  say "[5/8] Boot optimization (disables slow services)"
  [[ -x "$REPO_DIR/optimize-boot.sh" ]] \
    && (cd "$REPO_DIR" && "$SUDO" ./optimize-boot.sh) \
    || warn "optimize-boot.sh not found or failed"
else
  warn "skipped boot optimization"
fi

# ---- 6. Touchpad scroll fix -------------------------------------------------
ask a "Touchpad scroll fix"
if [[ "$a" = "y" ]]; then
  say "[6/8] Touchpad scroll speed (Wayland Scroll Factor)"
  [[ -x "$REPO_DIR/fix-touchpad-scroll-arch.sh" ]] \
    && (cd "$REPO_DIR" && bash fix-touchpad-scroll-arch.sh) \
    || warn "fix-touchpad-scroll-arch.sh not found or failed"
else
  warn "skipped touchpad scroll fix"
fi

# ---- 7. Dash-to-Panel preset ------------------------------------------------
ask a "Dash-to-Panel preset"
if [[ "$a" = "y" ]]; then
  say "[7/8] Dash-to-Panel unified taskbar preset"
  if command -v gnome-shell >/dev/null 2>&1; then
    (cd "$REPO_DIR" && bash dash-to-panel-preset.sh) || warn "dash-to-panel preset failed"
  else
    warn "gnome-shell not found — skipping"
  fi
else
  warn "skipped Dash-to-Panel preset"
fi

# ---- 8. Remove bloatware ----------------------------------------------------
ask a "Remove bloatware"
if [[ "$a" = "y" ]]; then
  say "[8/9] Remove CachyOS bloatware"
  [[ -x "$REPO_DIR/remove-bloatware.sh" ]] \
    && (cd "$REPO_DIR" && "$SUDO" bash remove-bloatware.sh) \
    || warn "remove-bloatware.sh not found or failed"
else
  warn "skipped bloatware removal"
fi

# ---- 9. Face unlock (Alienware x14 R2: Howdy + IR) ---------------------------
ask a "Face unlock"
if [[ "$a" = "y" ]]; then
  say "[9/9] Face unlock (Howdy + IR emitter, PAM: sudo/GDM/su/login)"
  if [[ -x "$REPO_DIR/scripts/setup-face-unlock.sh" ]]; then
    (cd "$REPO_DIR" && bash scripts/setup-face-unlock.sh) \
      || warn "face-unlock setup failed"
    echo "  - enroll at the camera: sudo howdy add"
    echo "  - then: /usr/bin/python3 scripts/howdy-capture-gui.py"
  else
    warn "scripts/setup-face-unlock.sh not found"
  fi
else
  warn "skipped face unlock"
fi

say "Done!"
echo "  - OpenCode: run 'opencode' (or flatpak run ai.opencode.opencode)"
echo "  - Hermes:   run 'hermes chat -q \"hi\"'"
echo "  - GNOME:    log out/in to activate extensions (if installed)"
echo "  - Face:     enroll at the camera with 'sudo howdy add' (if installed)"

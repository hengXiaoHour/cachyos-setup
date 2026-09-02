#!/usr/bin/env bash
# =============================================================================
# CachyOS Setup — uninstaller / revert
#
# Reverses everything `setup.sh` installed. Guided like the installer: Y/n per
# component. Everything that was backed up is restored; otherwise it is removed.
#
#   curl -fsSL .../uninstall.sh | bash          # guided Y/n per step
#   curl -fsSL .../uninstall.sh | bash -s -- -y # revert EVERYTHING, no prompts
#
# Flags:
#   -y, --yes         Revert everything without prompting
#   --keep-opencode   Keep a component (do NOT revert it)
#   --keep-hermes
#   --keep-gnome
#   --keep-proton
#   --keep-boot
#   --keep-touchpad
#   --keep-dash
#   --keep-bloatware
#   --keep-clone      Keep the cloned ~/cachyos-setup + obsidian-vault
#
# Safety: anything with existing contents is backed up to
#   ~/.cachyos-backup/<timestamp>/  BEFORE it is removed.
# =============================================================================
set -uo pipefail

YES=0
KEEP_OPENCODE=0; KEEP_HERMES=0; KEEP_GNOME=0; KEEP_PROTON=0
KEEP_BOOT=0; KEEP_TOUCHPAD=0; KEEP_DASH=0; KEEP_BLOATWARE=0; KEEP_CLONE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes) YES=1 ;;
    --keep-opencode) KEEP_OPENCODE=1 ;;
    --keep-hermes)   KEEP_HERMES=1 ;;
    --keep-gnome)    KEEP_GNOME=1 ;;
    --keep-proton)   KEEP_PROTON=1 ;;
    --keep-boot)     KEEP_BOOT=1 ;;
    --keep-touchpad) KEEP_TOUCHPAD=1 ;;
    --keep-dash)     KEEP_DASH=1 ;;
    --keep-bloatware) KEEP_BLOATWARE=1 ;;
    --keep-clone)    KEEP_CLONE=1 ;;
    --no-sudo) SUDO="" ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
SUDO="${SUDO:-sudo}"

_CYAN=$'\033[1;36m'; _GREEN=$'\033[1;32m'; _YLW=$'\033[1;33m'; _NC=$'\033[0m'
say() { printf '\n%s==> %s%s\n' "$_CYAN" "$*" "$_NC"; }
ok()  { printf '%s    ✓ %s%s\n' "$_GREEN" "$*" "$_NC"; }
warn(){ printf '%s    ! %s%s\n' "$_YLW" "$*" "$_NC"; }

HAS_TTY=0
if [[ -e /dev/tty ]] && { exec 9<>/dev/tty; } 2>/dev/null; then HAS_TTY=1; fi
prompt_read() { if [[ "$HAS_TTY" -eq 1 ]]; then read -r -u 9 "$1" || true; else read -r "$1" || true; fi; }

declare -A KEEP_MAP
KEEP_MAP[OpenCode config]="$KEEP_OPENCODE"
KEEP_MAP[Hermes Agent]="$KEEP_HERMES"
KEEP_MAP[GNOME extensions]="$KEEP_GNOME"
KEEP_MAP[ProtonVPN GUI]="$KEEP_PROTON"
KEEP_MAP[Boot optimization]="$KEEP_BOOT"
KEEP_MAP[Touchpad scroll fix]="$KEEP_TOUCHPAD"
KEEP_MAP[Dash-to-Panel preset]="$KEEP_DASH"
KEEP_MAP[Remove bloatware]="$KEEP_BLOATWARE"
KEEP_MAP[Cloned repo + vault]="$KEEP_CLONE"

ask() {
  local __var="$1"; local __label="$2"; local __default="n"   # default = don't revert
  if [[ -n "${KEEP_MAP[$__label]:-}" ]] && [[ "${KEEP_MAP[$__label]}" = "1" ]]; then
    printf '%s    keeping %s (flagged)\n' "$_NC" "$__label"
    eval "$__var=n"; return
  fi
  if [[ "$YES" -eq 1 ]]; then eval "$__var=y"; return; fi
  if [[ "$HAS_TTY" -eq 0 ]]; then
    printf '%s    ! no terminal, skipping revert of %s\n' "$_YLW" "$__label"
    eval "$__var=n"; return
  fi
  local ans
  printf '%s    Revert %s? [y/N] ' "$_NC" "$__label"
  prompt_read ans
  case "${ans:-$__default}" in
    y|Y|yes|YES) eval "$__var=y" ;;
    *) eval "$__var=n" ;;
  esac
}

# Backup helper: move <path> to the backup dir, creating parent dirs.
BK="$HOME/.cachyos-backup/$(date +%Y%m%d-%H%M%S)"
backup() {
  local p="$1"
  [[ -e "$p" ]] || return 0
  mkdir -p "$BK/$(dirname "$p")"
  mv "$p" "$BK/$p" 2>/dev/null && ok "backed up $p -> ~/.cachyos-backup/$(basename "$BK")$p"
}

printf '%s\n' "$_CYAN"
printf '=====================================================\n'
printf '  CachyOS Setup — uninstaller\n'
printf '  Answer y/N for each step. Press Enter = NO.\n'
printf '  Removed items are backed up to ~/.cachyos-backup/\n'
printf '=====================================================%s\n' "$_NC"

# ---- 1. OpenCode config -----------------------------------------------------
ask a "OpenCode config"
if [[ "$a" = "y" ]]; then
  say "[1/9] Removing OpenCode config + plugins + skills"
  for p in ~/.config/opencode/opencode.jsonc ~/.config/opencode/AGENTS.md \
           ~/.config/opencode/plugins/memory-mcp ~/.config/opencode/plugins/playwright-mcp \
           ~/.config/opencode/plugins/subagent-orchestrator ~/.config/opencode/plugins/github-sync \
           ~/.config/opencode/plugins/session-sync ~/.config/opencode/mcp-servers \
           ~/.config/opencode/skills/verify-before-handover; do
    backup "$p"
  done
  ok "OpenCode config removed (backed up)"
else
  warn "kept OpenCode config"
fi

# ---- 2. Hermes Agent --------------------------------------------------------
ask a "Hermes Agent"
if [[ "$a" = "y" ]]; then
  say "[2/9] Removing Hermes Agent + keyless config"
  systemctl --user disable --now opencode-server.service >/dev/null 2>&1 || true
  backup ~/.hermes
  backup ~/.config/systemd/user/opencode-server.service
  ok "Hermes Agent removed (backed up)"
else
  warn "kept Hermes Agent"
fi

# ---- 3. GNOME extensions ----------------------------------------------------
ask a "GNOME extensions"
if [[ "$a" = "y" ]]; then
  say "[3/9] Removing GNOME extensions (auto-move + every-window)"
  gsettings reset org.gnome.shell enabled-extensions 2>/dev/null || true
  backup ~/.local/share/gnome-shell/extensions/auto-move-new-workspace@sobeitnow
  backup ~/.local/share/gnome-shell/extensions/every-window-new-workspace@custom
  ok "GNOME extensions removed (log out/in to apply)"
else
  warn "kept GNOME extensions"
fi

# ---- 4. ProtonVPN -----------------------------------------------------------
ask a "ProtonVPN GUI"
if [[ "$a" = "y" ]]; then
  say "[4/9] Removing ProtonVPN (CLI + GUI + wireguard tools)"
  [[ -n "$SUDO" ]] && "$SUDO" pacman -Rns --noconfirm 2>/dev/null \
    proton-vpn-cli proton-vpn-gtk-app proton-vpn-daemon wireguard-tools \
    python-proton-core python-proton-keyring-linux python-proton-vpn-api-core \
    || warn "could not remove ProtonVPN (needs sudo)"
  ok "ProtonVPN removed"
else
  warn "kept ProtonVPN"
fi

# ---- 5. Boot optimization ---------------------------------------------------
ask a "Boot optimization"
if [[ "$a" = "y" ]]; then
  say "[5/9] Reverting boot services (unmask + re-enable)"
  [[ -n "$SUDO" ]] && "$SUDO" bash -c '
    systemctl unmask plymouth-quit-wait.service plymouth-read-write.service plymouth-start.service 2>/dev/null || true
    for s in serial-getty@ttyS0.service serial-getty@ttyS1.service serial-getty@ttyS2.service serial-getty@ttyS3.service; do
      systemctl unmask "$s" 2>/dev/null || true
    done
    for s in systemd-hwdb-update accounts-daemon avahi-daemon cups cups-browsed \
             geoclue power-profiles-daemon switcheroo-control wpa_supplicant NetworkManager-wait-online; do
      systemctl enable "$s" 2>/dev/null || true
    done
    if [ -f /etc/default/grub ] && command -v grub-mkconfig >/dev/null 2>&1; then
      sed -i "s/^GRUB_TIMEOUT=.*/GRUB_TIMEOUT=5/" /etc/default/grub
      grub-mkconfig -o /boot/grub/grub.cfg 2>/dev/null || true
    fi
  ' || warn "could not revert boot services (needs sudo)"
  ok "Boot services reverted"
else
  warn "kept boot optimization"
fi

# ---- 6. Touchpad scroll fix -------------------------------------------------
ask a "Touchpad scroll fix"
if [[ "$a" = "y" ]]; then
  say "[6/9] Removing Wayland Scroll Factor + touchpad extension"
  # wsf is built from source (not a pacman package) — remove its binaries.
  [[ -n "$SUDO" ]] && "$SUDO" rm -f /usr/local/bin/wsf /usr/local/lib/wayland-scroll-factor* 2>/dev/null || true
  rm -rf /tmp/wayland-scroll-factor 2>/dev/null || true
  backup ~/.local/share/gnome-shell/extensions/touchpad-speed-control@ritesh
  ok "Touchpad scroll fix removed (re-login to apply)"
else
  warn "kept touchpad scroll fix"
fi

# ---- 7. Dash-to-Panel preset ------------------------------------------------
ask a "Dash-to-Panel preset"
if [[ "$a" = "y" ]]; then
  say "[7/9] Resetting Dash-to-Panel to defaults"
  DTP="org.gnome.shell.extensions.dash-to-panel"
  gsettings reset-recursively "$DTP" 2>/dev/null || true
  warn "Dash-to-Panel preset reset (panel defaults restored)"
else
  warn "kept Dash-to-Panel preset"
fi

# ---- 8. Bloatware (reinstall) -----------------------------------------------
ask a "Remove bloatware"
if [[ "$a" = "y" ]]; then
  say "[8/9] Reinstalling the packages the bloatware script removed"
  [[ -n "$SUDO" ]] && "$SUDO" pacman -S --noconfirm 2>/dev/null \
    baobab decibels showtime papers simple-scan gnome-calculator meld loupe \
    gnome-text-editor gnome-power-manager sushi snapshot cachyos-micro-settings \
    || warn "could not reinstall bloatware (needs sudo; find the exact package names in remove-bloatware.sh)"
  ok "Bloatware reinstall attempted"
else
  warn "kept bloatware state"
fi

# ---- 9. Cloned repo + vault -------------------------------------------------
ask a "Cloned repo + vault"
if [[ "$a" = "y" ]]; then
  say "[9/9] Removing cloned ~/cachyos-setup and ~/obsidian-vault"
  backup ~/cachyos-setup
  backup ~/obsidian-vault
  ok "Clone + vault removed (backed up)"
else
  warn "kept clone + vault"
fi

say "Done!"
echo "  Backups are in: ~/.cachyos-backup/$(basename "$BK")  (restore from there)"
echo "  To reinstall anything: re-run setup.sh"

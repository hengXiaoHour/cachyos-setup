#!/usr/bin/env bash
# One-line face-unlock setup for Alienware x14 R2 + CachyOS (GNOME/GDM).
#   bash face-unlock/setup-face-unlock.sh          # full install + wiring
#   bash face-unlock/setup-face-unlock.sh --check  # report only, change nothing
#
# Automates everything reproducible. Two steps stay manual (need a human
# in front of the IR camera): `linux-enable-ir-emitter configure`
# (only if the emitter is NOT native) and `sudo howdy add` enrollment.
# Safe to re-run: every step is grep-guarded / idempotent.
set -u
CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

IR_BYPATH="/dev/v4l/by-path/pci-0000:00:14.0-usb-0:7:1.2-video-index0"
HOWDY_LINE="auth sufficient /lib/security/pam_howdy.so"
LEI_URL="https://github.com/EmixamPP/linux-enable-ir-emitter/releases/download/7.0.0-beta/linux-enable-ir-emitter-7.0.0-beta2-release-x86-64.tar.gz"

say()  { printf '%s\n' "$*"; }
run()  { [ "$CHECK" = 1 ] && { say "  [check] would run: $*"; return 0; }; eval "$*"; }
need_sudo() { [ "$CHECK" = 1 ] && return 0; sudo -v; }

[ "$(id -u)" = 0 ] && { say "Do NOT run as root (makepkg refuses). Run as your user; sudo is used inside."; exit 1; }

say "== 1/7 packages =="
PAC_DEPS="paru base-devel git fmt gtk3 opencv spdlog yaml-cpp argparse qt6-base cblas lapack python-scikit-build python-opencv meson ninja cmake"
say "  wanted: $PAC_DEPS"
run "sudo pacman -S --needed --noconfirm $PAC_DEPS"

say "== 2/7 python-dlib (CPU-only AUR build) =="
if python3 -c "import dlib" 2>/dev/null; then
  say "  dlib already importable, skipping build."
else
  run "rm -rf /tmp/py-dlib-aur && git clone --depth 1 https://aur.archlinux.org/python-dlib.git /tmp/py-dlib-aur"
  run "sed -i 's/_build_cuda=1/_build_cuda=0/' /tmp/py-dlib-aur/PKGBUILD"
  run "bash -c 'cd /tmp/py-dlib-aur && MAKEFLAGS=-j\$(nproc) makepkg --noconfirm -s'"
  run "sudo pacman -U --noconfirm /tmp/py-dlib-aur/python-dlib-*.pkg.tar.zst"
fi

say "== 3/7 howdy-git (AUR build) =="
if [ -x /usr/lib/howdy/cli.py ] || [ -d /usr/lib/howdy ]; then
  say "  howdy already installed, skipping build."
else
  run "rm -rf /tmp/howdy-aur && git clone --depth 1 https://aur.archlinux.org/howdy-git.git /tmp/howdy-aur"
  run "bash -c 'cd /tmp/howdy-aur && makepkg --noconfirm -s'"
  run "sudo pacman -U --noconfirm /tmp/howdy-aur/howdy-git-*.pkg.tar.zst"
fi

say "== 4/7 linux-enable-ir-emitter 7.0.0-beta2 (upstream tarball) =="
if command -v linux-enable-ir-emitter >/dev/null 2>&1; then
  say "  already installed: $(linux-enable-ir-emitter --version 2>/dev/null || echo yes), skipping."
else
  run "curl -fsSL -o /tmp/lei.tar.gz '$LEI_URL'"
  run "sudo tar -xzf /tmp/lei.tar.gz -C /usr/local/bin/ && rm -f /tmp/lei.tar.gz"
fi

say "== 5/7 opencv5 scalar-hist fixes in howdy test.py =="
for spec in "131|s/^\(\s*\)hist_total = int(sum(hist)\[0\])/\1hist_total = np.sum(hist)/" \
            "137|s/float(value\[0\])/float(value)/"; do
  line="${spec%%|*}"; expr="${spec#*|}"
  if [ "$CHECK" = 1 ]; then say "  [check] test.py lines 131+137 shape-fix (idempotent sed)"; continue; fi
  sudo sed -i "$expr" /usr/lib/howdy/cli/test.py
done
say "  test.py shape-fixes applied."

say "== 6/7 config: IR device + known-good values =="
if [ "$CHECK" = 1 ]; then
  say "  [check] device_path -> $IR_BYPATH"
  say "  [check] dark_threshold=85 timeout=6 certainty=4.0 max_height=240"
else
  need_sudo
  [ -e "$IR_BYPATH" ] && say "  IR node present: $IR_BYPATH" || say "  WARNING: IR by-path node missing, set device_path manually."
  sudo sed -i "s|^device_path.*|device_path = $IR_BYPATH|" /etc/howdy/config.ini
  sudo sed -i "s/^dark_threshold.*/dark_threshold = 85/; s/^timeout.*/timeout = 6/; s/^certainty.*/certainty = 4.0/; s/^max_height.*/max_height = 240/" /etc/howdy/config.ini
  grep -E "^(device_path|dark_threshold|timeout|certainty|max_height)" /etc/howdy/config.ini | sed 's/^/  /'
fi

say "== 7/7 PAM wiring (backups at .bak-howdy) =="
wire_top() { # $1 = pam file: howdy first line after header
  if [ "$CHECK" = 1 ]; then say "  [check] $1 <- howdy first"; return 0; fi
  sudo cp -n "/etc/pam.d/$1" "/etc/pam.d/$1.bak-howdy"
  grep -q "pam_howdy" "/etc/pam.d/$1" || sudo sed -i "1a $HOWDY_LINE" "/etc/pam.d/$1"
}
wire_after() { # $1 = file, $2 = anchor pattern
  if [ "$CHECK" = 1 ]; then say "  [check] $1 <- howdy after $2"; return 0; fi
  sudo cp -n "/etc/pam.d/$1" "/etc/pam.d/$1.bak-howdy"
  grep -q "pam_howdy" "/etc/pam.d/$1" || sudo sed -i "/$2/a $HOWDY_LINE" "/etc/pam.d/$1"
}
[ "$CHECK" = 0 ] && need_sudo
wire_top sudo
wire_top gdm-password
wire_after su "pam_rootok.so"
wire_after su-l "pam_rootok.so"
wire_after login "pam_nologin.so"
say "  sshd/remote, passwd/chsh, system-auth deliberately untouched."

say "== root face models =="
if [ "$CHECK" = 1 ]; then
  say "  [check] copy chenla.dat -> root.dat if chenla.dat exists"
else
  if [ -f /etc/howdy/models/chenla.dat ] || [ -f "/etc/howdy/models/${SUDO_USER:-$USER}.dat" ]; then
    me="${SUDO_USER:-$USER}"; me="${me:-chenla}"
    sudo cp "/etc/howdy/models/$me.dat" /etc/howdy/models/root.dat 2>/dev/null \
      || sudo cp /etc/howdy/models/chenla.dat /etc/howdy/models/root.dat
    say "  root.dat refreshed."
  else
    say "  no user models yet, skipping (re-run after enrolling)."
  fi
fi

say ""
say "MANUAL (need you in front of the camera):"
say "  1. linux-enable-ir-emitter configure   # only if emitter is not native; x14 R2 usually errors 'already working' = good"
say "  2. sudo howdy add                       # enroll your face"
say "  3. sudo howdy test                      # verify (any key closes window)"
say "  4. /usr/bin/python3 face-unlock/howdy-capture-gui.py   # guided 3-angle face1"
say "  5. /usr/bin/python3 face-unlock/howdy-live-gui.py      # click preset 3 + SAVE for speed"
say "  6. log out, click your name, look. No typing."
[ "$CHECK" = 1 ] && { say ""; say "CHECK MODE: nothing was changed."; }
exit 0

#!/usr/bin/env bash
# Fix touchpad scroll speed on CachyOS (GNOME Wayland)
# Adapted from: https://github.com/hengXiaoHour/scrolling-touchpad-problem-ubuntu
set -euo pipefail

echo "==> Installing build dependencies..."
sudo pacman -S --noconfirm meson ninja

echo "==> Building Wayland Scroll Factor from source..."
cd /tmp
git clone https://github.com/daniel-g-carrasco/wayland-scroll-factor.git
cd wayland-scroll-factor
meson setup build
ninja -C build
sudo ninja -C build install
cd ~
rm -rf /tmp/wayland-scroll-factor

echo "==> Configuring scroll factor (0.15)..."
wsf set 0.15

echo "==> Enabling WSF (requires logout)..."
wsf enable

echo "==> Installing Touchpad Speed Control GNOME extension..."
EXT_URL="https://extensions.gnome.org/download-extension/touchpad-speed-control@ritesh.shell-extension.zip?version_tag=72233"
curl -fsSL -o /tmp/touchpad-extension.zip "$EXT_URL"
gnome-extensions install --force /tmp/touchpad-extension.zip 2>/dev/null
rm -f /tmp/touchpad-extension.zip

cat <<EOF

=== Done! Log out and back in for everything to take effect. ===

After login, tune per-app scroll speeds:
  1. Open Extension Manager → Installed tab
  2. Enable "Touchpad Speed Control"
  3. Click the gear icon → set different speeds per app

Fine-tuning:
  wsf set 0.1    very slow
  wsf set 0.15   recommended
  wsf set 0.3    moderate
  wsf set 0.5    mild
  wsf set 1.0    default (no change)

  wsf status     check if loaded
  wsf-gui        graphical interface

EOF

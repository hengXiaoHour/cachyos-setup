#!/usr/bin/env bash
# Remove CachyOS bloatware
set -euo pipefail

echo "==> Removing bloatware apps..."
sudo pacman -Rns --noconfirm \
  baobab \
  decibels \
  showtime \
  papers \
  simple-scan \
  gnome-calculator \
  meld \
  loupe \
  gnome-text-editor \
  gnome-power-manager \
  sushi \
  snapshot \
  cachyos-micro-settings \
  2>/dev/null || true

echo "==> Grouping remaining bloat into System folder..."
for f in avahi-discover bssh bvnc lstopo qv4l2; do
  desktop="/usr/share/applications/${f}.desktop"
  if [ -f "$desktop" ]; then
    sudo sed -i 's/^Categories=.*/Categories=System;/' "$desktop"
  fi
done

echo "Done! Bloatware removed."

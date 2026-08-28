#!/usr/bin/env bash
# Install ProtonVPN CLI + GUI + WireGuard rotation on CachyOS
set -euo pipefail

echo "==> Installing ProtonVPN..."
sudo pacman -S --noconfirm proton-vpn-cli proton-vpn-gtk-app wireguard-tools

echo "==> Setting up WireGuard configs..."
echo "Download your WireGuard configs from ProtonVPN dashboard:"
echo "  https://account.protonvpn.com/vpn#tabs-2"
echo "Place them in /etc/wireguard/ as CA.conf, US.conf, etc."
echo ""
echo "Then run:"
echo "  sudo cp protonvpn/proton-rotate.service /etc/systemd/system/"
echo "  sudo cp protonvpn/proton-rotate.timer /etc/systemd/system/"
echo "  sudo systemctl enable --now proton-rotate.timer"

echo ""
echo "Done! ProtonVPN installed."

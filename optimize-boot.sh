#!/bin/bash
# CachyOS Boot Optimization - Run manually with sudo
# Expected savings: ~15-18 seconds

echo "=== CachyOS Boot Optimization ==="
echo ""
echo "This will disable slow boot services."
echo "You'll need to enter your password once."
echo ""

# Plymouth boot splash (saves 6.7s)
sudo systemctl mask plymouth-quit-wait.service
sudo systemctl mask plymouth-read-write.service
sudo systemctl mask plymouth-start.service
echo "[OK] Plymouth disabled"

# NetworkManager-wait-online (saves 5.1s)
sudo systemctl disable NetworkManager-wait-online.service
echo "[OK] NetworkManager-wait-online disabled"

# Serial ports ttyS0-3 (saves 4.8s)
sudo systemctl mask serial-getty@ttyS0.service
sudo systemctl mask serial-getty@ttyS1.service
sudo systemctl mask serial-getty@ttyS2.service
sudo systemctl mask serial-getty@ttyS3.service
echo "[OK] Serial ports masked"

# Disable unused services
sudo systemctl disable systemd-hwdb-update.service 2>/dev/null
sudo systemctl disable accounts-daemon.service 2>/dev/null
sudo systemctl disable avahi-daemon.service 2>/dev/null
sudo systemctl disable cups.service 2>/dev/null
sudo systemctl disable cups-browsed.service 2>/dev/null
sudo systemctl disable geoclue.service 2>/dev/null
sudo systemctl disable power-profiles-daemon.service 2>/dev/null
sudo systemctl disable switcheroo-control.service 2>/dev/null
echo "[OK] Unused services disabled"
echo "[WARN] wpa_supplicant is intentionally NOT disabled:"
echo "       disabling it breaks WiFi on machines that rely on wpa_supplicant (e.g. Dell)."

# Optimize GRUB timeout
sudo sed -i 's/GRUB_TIMEOUT=.*/GRUB_TIMEOUT=1/' /etc/default/grub
sudo grub-mkconfig -o /boot/grub/grub.cfg 2>/dev/null
echo "[OK] GRUB timeout set to 1s"

echo ""
echo "=== Done! ==="
echo "Run: sudo reboot"

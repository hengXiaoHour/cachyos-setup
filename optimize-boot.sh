#!/bin/bash
# CachyOS Boot Optimization Script
# Saves ~15-18 seconds from boot time
# Run: sudo ./optimize-boot.sh

set -e

echo "=== CachyOS Boot Optimization ==="
echo "Current boot time:"
systemd-analyze

echo ""
echo "=== Disabling slow services ==="

# 1. Plymouth boot splash (saves 6.7s)
echo "[1/6] Disabling plymouth..."
systemctl mask plymouth-quit-wait.service 2>/dev/null || true
systemctl mask plymouth-read-write.service 2>/dev/null || true
systemctl mask plymouth-start.service 2>/dev/null || true

# 2. NetworkManager-wait-online (saves 5.1s)
echo "[2/6] Disabling NetworkManager-wait-online..."
systemctl disable NetworkManager-wait-online.service 2>/dev/null || true

# 3. Serial ports ttyS0-3 (saves 4.8s)
echo "[3/6] Masking serial port getty services..."
systemctl mask serial-getty@ttyS0.service 2>/dev/null || true
systemctl mask serial-getty@ttyS1.service 2>/dev/null || true
systemctl mask serial-getty@ttyS2.service 2>/dev/null || true
systemctl mask serial-getty@ttyS3.service 2>/dev/null || true

# 4. Disable unused systemd services
echo "[4/6] Disabling unnecessary services..."
systemctl disable systemd-modules-load.service 2>/dev/null || true
systemctl disable systemd-journal-catalog-update.service 2>/dev/null || true
systemctl disable systemd-resolved.service 2>/dev/null || true
systemctl disable systemd-hwdb-update.service 2>/dev/null || true
systemctl disable accounts-daemon.service 2>/dev/null || true
systemctl disable avahi-daemon.service 2>/dev/null || true
systemctl disable cups.service 2>/dev/null || true
systemctl disable cups-browsed.service 2>/dev/null || true
systemctl disable gcr-ssh-agent.service 2>/dev/null || true
systemctl disable geoclue.service 2>/dev/null || true
systemctl disable power-profiles-daemon.service 2>/dev/null || true
systemctl disable switcheroo-control.service 2>/dev/null || true
systemctl disable wpa_supplicant.service 2>/dev/null || true

# 5. Reduce initrd size
echo "[5/6] Optimizing initrd..."
if [ -f /etc/mkinitcpio.conf ]; then
    # Backup original
    cp /etc/mkinitcpio.conf /etc/mkinitcpio.conf.bak
    # Use ZSTD compression (faster decompression)
    sed -i 's/COMPRESSION="zstd"/COMPRESSION="zstd"/' /etc/mkinitcpio.conf 2>/dev/null || true
    # Regenerate initrd
    mkinitcpio -P 2>/dev/null || true
fi

# 6. Optimize GRUB
echo "[6/6] Optimizing GRUB..."
if [ -f /etc/default/grub ]; then
    cp /etc/default/grub /etc/default/grub.bak
    # Reduce GRUB timeout to 1 second
    sed -i 's/GRUB_TIMEOUT=.*/GRUB_TIMEOUT=1/' /etc/default/grub
    # Disable os-prober
    sed -i 's/GRUB_DISABLE_OS_PROBER=.*/GRUB_DISABLE_OS_PROBER=true/' /etc/default/grub
    # Update GRUB
    grub-mkconfig -o /boot/grub/grub.cfg 2>/dev/null || true
fi

echo ""
echo "=== Optimization Complete ==="
echo "New boot time (after reboot):"
systemd-analyze
echo ""
echo "Reboot to apply changes: sudo reboot"

# CachyOS Setup

My CachyOS (Arch-based) system configuration and setup notes.

## What We've Done

### 1. OpenCode Desktop (AI Coding Assistant)
- Downloaded `.deb` file (doesn't work on Arch)
- Installed via Flatpak instead
```bash
flatpak install flathub ai.opencode.opencode
```
- Launch: `flatpak run ai.opencode.opencode`

### 2. GNOME Tweaks
- Extra GNOME settings (themes, fonts, etc.)
```bash
sudo pacman -S gnome-tweaks
```

### 4. Touchpad Fixes
**Right-Click:** Default is **two-finger tap**. If not working:
```bash
gsettings set org.gnome.desktop.peripherals.touchpad click-method 'default'
```

**Scroll Speed:** GNOME has no scroll speed setting. Fix:
```bash
bash fix-touchpad-scroll-arch.sh
```
Then log out and back in. Uses Wayland Scroll Factor (WSF).
- Adjust: `wsf set 0.15` (recommended), `wsf set 0.1` (slower), `wsf set 1.0` (default)
- Per-app speeds: enable Touchpad Speed Control extension

### 5. Dash to Panel (Unified Taskbar)
- Merges top bar + dock into one panel (like Windows style)
```bash
sudo pacman -S gnome-shell-extension-dash-to-panel
```
- Log out and back in after install
- Apply preset config: `bash dash-to-panel-preset.sh`
- Right-click panel > Dash to Panel Settings to customize further
- Note: Replaced dash-to-dock, no longer needed

### 6. Skip Boot Menu + Splash (Limine)
- CachyOS uses Limine bootloader (like GRUB)
- Skip the menu and splash for instant boot:
```bash
sudo sed -i 's/^timeout:.*/timeout: 0/' /boot/limine.conf
sudo sed -i 's|^wallpaper:.*|# wallpaper: boot():/limine-splash.png|' /boot/limine.conf
sudo sed -i '/^interface_branding:/a quiet: yes' /boot/limine.conf
```
- To get menu back, hold **Shift** during boot, or restore:
```bash
sudo sed -i 's/^timeout:.*/timeout: 5/' /boot/limine.conf
```

### 7. Remove Bloatware
```bash
bash remove-bloatware.sh
```
- Removes unnecessary pre-installed apps (baobab, decibels, showtime, papers, etc.)
- Groups remaining bloat (Avahi, Qt V4L2) into System folder

### 8. OpenCode Bodyfix (Relay Workaround)
Fixes 401 ModelError when OpenCode relay reorders JSON keys.
```bash
sudo cp opencode-bodyfix/zz_opencode_bodyfix.pth /usr/lib/python3.14/site-packages/
sudo cp opencode-bodyfix/zz_opencode_bodyfix.py /usr/lib/python3.14/site-packages/
```

### 9. ProtonVPN CLI + GUI
```bash
sudo pacman -S proton-vpn-cli proton-vpn-gtk-app wireguard-tools
```

## System Info
- OS: CachyOS (Arch-based)
- Desktop: GNOME (vanilla)
- Package managers: pacman, Flatpak, Shelly

## Tips
- Use Shelly for app management (GUI)
- Use `flatpak install flathub <app>` for sandboxed apps
- Avoid `.deb` files - they're for Ubuntu/Debian only

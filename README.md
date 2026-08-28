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

### 2. Pamac (Unified Package Manager)
- GUI to install apps from pacman, AUR, Flatpak, and Snap
```bash
sudo pacman -S pamac-aur
```
- Open: search "Add/Remove Software" or run `pamac-manager`

### 3. GNOME Tweaks
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

### 6. Skip Boot Menu (Limine)
- CachyOS uses Limine bootloader (like GRUB)
- Skip the menu for faster boot:
```bash
sudo sed -i 's/^timeout:.*/timeout: 0/' /boot/limine/limine.conf
```
- To get menu back, hold **Shift** during boot, or restore timeout:
```bash
sudo sed -i 's/^timeout:.*/timeout: 5/' /boot/limine/limine.conf
```

## System Info
- OS: CachyOS (Arch-based)
- Desktop: GNOME (vanilla)
- Package managers: pacman, Flatpak, Pamac

## Tips
- Use `sudo pacman -S <app>` for official repo apps
- Use `pamac-manager` GUI for easy install
- Use `flatpak install flathub <app>` for sandboxed apps
- Avoid `.deb` files - they're for Ubuntu/Debian only

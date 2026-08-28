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

### 4. Touchpad Right-Click
- Default: use **two-finger tap** for right-click
- If not working, try:
```bash
gsettings set org.gnome.desktop.peripherals.touchpad click-method 'default'
```

### 5. Dash to Panel (Unified Taskbar)
- Merges top bar + dock into one panel (like Windows style)
```bash
sudo pacman -S gnome-shell-extension-dash-to-panel
```
- Log out and back in after install
- Right-click panel > Dash to Panel Settings to customize
- Note: Replaced dash-to-dock, no longer needed

## System Info
- OS: CachyOS (Arch-based)
- Desktop: GNOME (vanilla)
- Package managers: pacman, Flatpak, Pamac

## Tips
- Use `sudo pacman -S <app>` for official repo apps
- Use `pamac-manager` GUI for easy install
- Use `flatpak install flathub <app>` for sandboxed apps
- Avoid `.deb` files - they're for Ubuntu/Debian only

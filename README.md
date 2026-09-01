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

**OpenCode Config + Memory Vault:**
```bash
mkdir -p ~/.config/opencode/{plugins,mcp-servers,skills} ~/obsidian-vault/opencode
cp opencode-config/opencode.jsonc ~/.config/opencode/
cp -r opencode-config/memory-mcp ~/.config/opencode/plugins/
cp -r opencode-config/playwright-mcp ~/.config/opencode/plugins/
cp -r opencode-config/subagent-orchestrator ~/.config/opencode/plugins/
cp -r opencode-config/github-sync ~/.config/opencode/plugins/
cp -r opencode-config/session-sync ~/.config/opencode/plugins/
cp -r opencode-config/mcp-servers/* ~/.config/opencode/mcp-servers/
cp -r opencode-config/skills/verify-before-handover ~/.config/opencode/skills/
cp opencode-config/AGENTS.md ~/.config/opencode/
```

**Architecture:**
- **MCP Servers** (backend): `~/.config/opencode/mcp-servers/`
  - `playwright-mcp/server.js` - Browser automation, screenshots, scraping, test-fix loop
  - `memory-mcp/server.js` - Vault storage, lessons logging
- **Plugins** (frontend): `~/.config/opencode/plugins/`
  - `memory-mcp` - Vault + lessons tools via memory MCP server
  - `playwright-mcp` - Playwright tools via playwright MCP server
  - `subagent-orchestrator` - Parallel task execution
  - `github-sync` - Auto-sync to GitHub
  - `session-sync` - Multi-session coordination (auto-registers on load, scoped per project)
- **Skills**: `~/.config/opencode/skills/`
  - `verify-before-handover` - Test every change before handing off

### 2. GNOME Extensions (CachyOS Wayland)

**Auto Move to New Workspace** + **Touchpad Scroll Fix**

Every new window automatically opens in its own workspace. No more dragging tabs.

```bash
cd ~/cachyos-setup/gnome-extensions
./install.sh
# Then log out/in
```

**What it does:**
- `auto-move-new-workspace@sobeitnow` - Moves selected apps to new workspaces automatically
  - Apps: Alacritty, Brave, Nautilus, VS Code, Telegram, Shelly, ProtonVPN, Arduino, Firefox, Chromium
  - Focuses new workspace so you follow the window
- `touchpad-speed-control@ritesh` - Per-app touchpad scroll speed
  - Global: `0.35` (slow)
  - Browsers: `0.35` (same speed)
- `wayland-scroll-factor` - Global scroll speed `0.35`

**Clipboard bug fix:** `wl-clipboard` Wayland helper creates tiny invisible windows on copy/paste. The extension has a `100ms` delay + `WeakSet` vaccine to ignore these helpers.

**To add/remove apps:**
```bash
SCHEMADIR=~/.local/share/gnome-shell/extensions/auto-move-new-workspace@sobeitnow/schemas
gsettings --schemadir "$SCHEMADIR" set org.gnome.shell.extensions.auto-move-new-workspace application-list "['Alacritty.desktop', 'brave-browser.desktop']"
```

**To change scroll speed:**
```bash
wsf set --scroll-vertical 0.35 --scroll-horizontal 0.35
```

**Tools:**
- `memory_write` / `memory_read` - Vault operations
- `log_lesson` / `lessons_read` - Lessons learned
- `playwright_screenshot` - Take screenshots
- `playwright_scrape` - Scrape page text
- `playwright_snapshot` - Get page elements
- `playwright_eval` - Run Playwright code
- `playwright_test` - Run tests
- `playwright_test_fix` - Vision loop: run → fix → re-run
- `spawn_subagent` / `run_parallel` / etc. - Parallel tasks
- `sync_github` / `check_sync` - GitHub sync
- `session_status` / `session_list` / `session_all_projects` - Multi-session coordination
- `session_write` / `session_read` / `session_broadcast` - Inter-session messaging
  - Sessions **auto-register** on plugin load (no manual call needed)
  - Scoped to the current project dir — sessions in other projects are invisible
  - Data lives in `~/obsidian-vault/coordination/<project>/`

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

### 8. ProtonVPN CLI + GUI
```bash
sudo pacman -S proton-vpn-cli proton-vpn-gtk-app wireguard-tools
```

## Test Results

### OpenCode Vault-Memory Plugin
- **Date:** 2026-08-28
- **Status:** Installed and verified
- **Plugin:** `~/.config/opencode/plugins/vault-memory.js`
- **Vault:** `~/obsidian-vault/opencode/MEMORY.md`
- **Config:** `~/.config/opencode/opencode.jsonc`
- **Test:** OpenCode loads without errors, plugin syntax valid
- **Features verified:**
  - Auto-logs session events (idle, created)
  - Auto-logs file edits (edit, write)
  - `memory_write` tool available
  - Vault loaded into system prompt

## System Info
- OS: CachyOS (Arch-based)
- Desktop: GNOME (vanilla)
- Package managers: pacman, Flatpak, Shelly

## Tips
- Use Shelly for app management (GUI)
- Use `flatpak install flathub <app>` for sandboxed apps
- Avoid `.deb` files - they're for Ubuntu/Debian only

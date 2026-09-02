# CachyOS Setup

A collection of scripts, GNOME extensions, and configuration for setting up and
customizing a **CachyOS** (Arch-based) Linux system — including an AI coding
assistant stack (OpenCode) and a keyless Hermes Agent.

Everything is plain bash, GNOME extension sources, and JSON config. No build
tools or dependencies beyond what each script documents.

> **License:** MIT — see [LICENSE](LICENSE).  
> **Note:** `gnome-extensions/` files carry their own `GPL-2.0-or-later` SPDX
> headers and remain GPL under the repo's MIT umbrella.

---

## Contents

| Path | What it is |
|---|---|
| `opencode-config/` | OpenCode AI coding assistant configuration + MCP servers + plugins + skills |
| `hermes-opencode/` | Keyless Hermes Agent, routed through OpenCode Zen (no API key) |
| `gnome-extensions/` | Auto-move-to-workspace + touchpad scroll control extensions |
| `optimize-boot.sh` | Disable slow boot services for faster startup |
| `fix-touchpad-scroll-arch.sh` | Build + install Wayland Scroll Factor |
| `dash-to-panel-preset.sh` | Apply a Windows-style unified taskbar preset |
| `remove-bloatware.sh` | Remove pre-installed CachyOS bloatware |
| `LICENSE` | MIT license |

---

## 1. OpenCode AI Coding Assistant

OpenCode is an open-source, provider-agnostic AI coding agent with a TUI and
CLI. Install it via Flatpak (the `.deb` does **not** work on Arch):

```bash
flatpak install flathub ai.opencode.opencode
flatpak run ai.opencode.opencode
```

### Configuration + Memory Vault

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

### Architecture

- **MCP Servers** (backend): `~/.config/opencode/mcp-servers/`
  - `playwright-mcp/server.js` — Browser automation, screenshots, scraping, test-fix loop
  - `memory-mcp/server.js` — Vault storage, lessons logging
- **Plugins** (frontend): `~/.config/opencode/plugins/`
  - `memory-mcp` — Vault + lessons tools via memory MCP server
  - `playwright-mcp` — Playwright tools via playwright MCP server
  - `subagent-orchestrator` — Parallel task execution
  - `github-sync` — Auto-sync to GitHub
  - `session-sync` — Multi-session coordination (auto-registers on load, scoped per project)
- **Skills**: `~/.config/opencode/skills/`
  - `verify-before-handover` — Test every change before handing off

**Tools provided** (via plugins): `memory_write`/`memory_read` (vault),
`log_lesson`/`lessons_read` (lessons), `playwright_screenshot`/`scrape`/
`snapshot`/`eval`/`test`/`test_fix`, `spawn_subagent`/`run_parallel`,
`sync_github`/`check_sync`, and cross-session `session_*` tools.

Session-sync notes: sessions auto-register on plugin load, are scoped to the
current project dir, and store data in `~/obsidian-vault/coordination/<project>/`.

---

## 2. Hermes Agent — Keyless (OpenCode Zen)

Standalone setup to run **Hermes Agent** (Nous Research) with **no API keys**.
Hermes's model provider points at OpenCode Zen, which serves free keyless
models to anonymous requests.

```bash
cd hermes-opencode
./install.sh                        # official installer + keyless config + skills
INSTALL_BROWSER=1 ./install.sh      # also install Playwright/Chromium browser tools
```

Or manually:

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh \
  | bash -s -- --non-interactive --skip-setup

hermes config set model.default laguna-s-2.1-free
hermes config set model.provider opencode-free
hermes config set model.base_url https://opencode.ai/zen/v1
# TOP-LEVEL key (not under model:) — hermes reads fallback_providers at root
hermes config set fallback_providers '[{"provider":"opencode-free","model":"nemotron-3.5-lightning-free"},{"provider":"opencode-free","model":"nemotron-3-ultra-free"},{"provider":"opencode-free","model":"big-pickle"}]'
```

Smoke test:

```bash
hermes chat -q 'Reply with exactly: HERMES_KEYLESS_OK'
```

See [`hermes-opencode/README.md`](hermes-opencode/README.md) for full details,
including the current list of keyless-available models and gotchas.

---

## 3. GNOME Extensions (Wayland)

**Auto Move to New Workspace** + **Touchpad Scroll Fix** — every new window
opens in its own workspace; no more dragging tabs.

```bash
cd ~/cachyos-setup/gnome-extensions
./install.sh
# Then log out/in
```

- `auto-move-new-workspace@sobeitnow` — moves selected apps to new workspaces
  automatically (Alacritty, Brave, Nautilus, VS Code, Telegram, Shelly, ProtonVPN,
  Arduino, Firefox, Chromium) and focuses the new workspace.
- `touchpad-speed-control@ritesh` — per-app touchpad scroll speed
  (global `0.35`, browsers `0.35`).
- `wayland-scroll-factor` — global scroll speed `0.35`.
- **Clipboard bug fix:** `wl-clipboard`'s Wayland helper creates tiny invisible
  windows on copy/paste; the extension uses a `100ms` delay + `WeakSet` vaccine
  to ignore them.

**Add/remove apps:**
```bash
SCHEMADIR=~/.local/share/gnome-shell/extensions/auto-move-new-workspace@sobeitnow/schemas
gsettings --schemadir "$SCHEMADIR" set \
  org.gnome.shell.extensions.auto-move-new-workspace application-list \
  "['Alacritty.desktop', 'brave-browser.desktop']"
```

**Change scroll speed:**
```bash
wsf set --scroll-vertical 0.35 --scroll-horizontal 0.35
```

---

## 4. Boot Optimization

```bash
sudo ./optimize-boot.sh
```
Disables slow startup services (Plymouth splash, `NetworkManager-wait-online`,
etc.) for ~15–18s faster boot.

---

## 5. Touchpad Fixes

**Right-click** (default is two-finger tap — restore if missing):
```bash
gsettings set org.gnome.desktop.peripherals.touchpad click-method 'default'
```

**Scroll speed** (GNOME has no built-in setting): build Wayland Scroll Factor:
```bash
bash fix-touchpad-scroll-arch.sh
# then log out/in
# Adjust: wsf set 0.15 (recommended) | 0.1 (slower) | 1.0 (default)
```

---

## 6. Dash to Panel (Unified Taskbar)

Merges the top bar and dock into one Windows-style panel:

```bash
sudo pacman -S gnome-shell-extension-dash-to-panel
# log out/in
bash dash-to-panel-preset.sh
# right-click the panel > Dash to Panel Settings to customize
```

---

## 7. Skip Boot Menu + Splash (Limine)

```bash
sudo sed -i 's/^timeout:.*/timeout: 0/' /boot/limine.conf
sudo sed -i 's|^wallpaper:.*|# wallpaper: boot():/limine-splash.png|' /boot/limine.conf
sudo sed -i '/^interface_branding:/a quiet: yes' /boot/limine.conf
```
Hold **Shift** during boot to get the menu back, or restore with:
```bash
sudo sed -i 's/^timeout:.*/timeout: 5/' /boot/limine.conf
```

---

## 8. Remove Bloatware

```bash
bash remove-bloatware.sh
```
Removes unnecessary pre-installed apps (baobab, decibels, showtime, papers, …)
and groups remaining bloat (Avahi, Qt V4L2) into a System folder.

---

## 9. ProtonVPN CLI + GUI

```bash
sudo pacman -S proton-vpn-cli proton-vpn-gtk-app wireguard-tools
```

---

## System Info

- OS: CachyOS (Arch-based)
- Desktop: GNOME (vanilla)
- Package managers: pacman, Flatpak, Shelly

## Tips

- Use **Shelly** for app management (GUI).
- Use `flatpak install flathub <app>` for sandboxed apps.
- Avoid `.deb` files — those are for Ubuntu/Debian only.

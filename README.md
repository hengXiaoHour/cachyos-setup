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

## Quick Start — guided one-line install

```bash
# Guided: type y for each step you want. Enter/anything = skip (safe default).
curl -fsSL https://raw.githubusercontent.com/hengXiaoHour/cachyos-setup/master/setup.sh | bash

# Fully automatic: installs EVERYTHING with zero prompts
curl -fsSL https://raw.githubusercontent.com/hengXiaoHour/cachyos-setup/master/setup.sh | bash -s -- -y
```

The guided walkthrough covers **8 steps**: OpenCode config → Hermes Agent (keyless) →
GNOME extensions → **ProtonVPN GUI** → Boot optimization → Touchpad scroll →
Dash-to-Panel preset → Bloatware removal. Re-run anytime to add what you skipped.

> **Safe default:** nothing installs unless you explicitly type `y`. An unanswered
> or interrupted prompt skips that step rather than installing it.

Or from a local clone (`./setup.sh` or `./setup.sh -y`).

**`setup.sh` flags:** `-y`/`--yes` (no prompts) · `--skip-opencode` ·
`--skip-hermes` · `--skip-gnome` · `--skip-proton` · `--skip-boot` ·
`--skip-touchpad` · `--skip-dash` · `--skip-bloatware`. Idempotent — safe to re-run.

## Uninstall / revert

Every step can be reverted. Removed items are backed up to `~/.cachyos-backup/` first.

```bash
# Guided revert (y per step you want to undo; removed files are backed up)
curl -fsSL https://raw.githubusercontent.com/hengXiaoHour/cachyos-setup/master/uninstall.sh | bash

# Revert EVERYTHING, no prompts
curl -fsSL .../uninstall.sh | bash -s -- -y
```

**`uninstall.sh` flags:** `-y`/`--yes` · `--keep-opencode` · `--keep-hermes` ·
`--keep-gnome` · `--keep-proton` · `--keep-boot` · `--keep-touchpad` ·
`--keep-dash` · `--keep-bloatware` · `--keep-clone`.

> After the GNOME-extension step, log out and back in to activate/unset them.
> The `sudo`-requiring steps (ProtonVPN, boot, bloatware) will prompt for your password.

---

## Contents

| Path | What it is |
|---|---|
| `setup.sh` | Guided one-line installer (type `y` per step, or `-y` for all) |
| `uninstall.sh` | Revert everything (backs up to `~/.cachyos-backup/`) |
| `opencode-config/` | OpenCode AI coding assistant configuration + MCP servers + plugins + skills |
| `hermes-opencode/` | Keyless Hermes Agent, routed through OpenCode Zen (no API key) |
| `gnome-extensions/` | Auto-move-to-workspace + touchpad scroll control extensions |
| `optimize-boot.sh` | Disable slow boot services for faster startup |
| `fix-touchpad-scroll-arch.sh` | Build + install Wayland Scroll Factor |
| `dash-to-panel-preset.sh` | Apply a Windows-style unified taskbar preset |
| `remove-bloatware.sh` | Remove pre-installed CachyOS bloatware |
| `scripts/setup-face-unlock.sh` | Face unlock for Alienware x14 R2: Howdy + IR, PAM wired (sudo, GDM, su, login) |
| `scripts/howdy-capture-gui.py` | Guided 3-angle face enrollment GUI |
| `scripts/howdy-live-gui.py` | Live IR preview + clickable speed presets GUI |
| `docs/face-unlock-alienware-x14-r2.md` | Full face-unlock build log, step by step |
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

## 10. Face Unlock — Alienware x14 R2 (Howdy + IR)

```bash
bash scripts/setup-face-unlock.sh          # full install + wiring
bash scripts/setup-face-unlock.sh --check  # report only, change nothing
```

Also step 9 of the main one-line installer (`setup.sh`, `--skip-face`
to opt out). One script does packages, CPU-only python-dlib + howdy builds,
IR emitter
install, IR config, and PAM wiring for sudo, GDM login/lock, su, and TTY
login (password stays as fallback, SSH untouched). Then, in front of the
camera: `sudo howdy add`, the capture GUI for 3-angle enrollment, the live
GUI for speed presets. Full log in `docs/face-unlock-alienware-x14-r2.md`.

```bash
/usr/bin/python3 scripts/howdy-capture-gui.py   # guided 3-angle face1
/usr/bin/python3 scripts/howdy-live-gui.py      # click preset 3 + SAVE
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

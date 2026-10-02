#!/bin/bash
# GNOME Extension Installer for CachyOS
# Auto Move to New Workspace + touchpad scroll fix

set -e

EXT_DIR="$HOME/.local/share/gnome-shell/extensions"
SCHEMA_DIR="/usr/share/glib-2.0/schemas"

echo "Installing Auto Move to New Workspace..."
mkdir -p "$EXT_DIR/auto-move-new-workspace@sobeitnow"
cp -r auto-move-new-workspace/* "$EXT_DIR/auto-move-new-workspace@sobeitnow/"
glib-compile-schemas "$EXT_DIR/auto-move-new-workspace@sobeitnow/" 2>/dev/null || true

echo "Installing Every Window New Workspace (custom)..."
mkdir -p "$EXT_DIR/every-window-new-workspace@custom"
cp -r every-window-new-workspace/* "$EXT_DIR/every-window-new-workspace@custom/"

echo "Installing Smart Alt+F4 (close window, shutdown dialog when none left)..."
mkdir -p "$EXT_DIR/smart-alt-f4@local"
cp -r smart-alt-f4/* "$EXT_DIR/smart-alt-f4@local/"
glib-compile-schemas "$EXT_DIR/smart-alt-f4@local/schemas" 2>/dev/null || true

echo "Installing OpenCode Tray (opencode TUI panel button)..."
mkdir -p "$EXT_DIR/opencode-tray@local"
# copy only the extension files -- the test/ dir stays in the repo
cp opencode-tray/extension.js opencode-tray/metadata.json "$EXT_DIR/opencode-tray@local/"

echo "Configuring extensions..."
# Remove stale empty shadow dirs that would override working system copies
# (an empty ~/.local/.../<uuid>/ with no metadata.json makes Shell fail the
# extension entirely, e.g. dash-to-panel with "Missing metadata.json").
for _uuid in 'dash-to-panel@jderose9.github.com' 'dash-to-dock@micxgx.gmail.com'; do
  if [[ -d "$EXT_DIR/$_uuid" && ! -f "$EXT_DIR/$_uuid/metadata.json" ]]; then
    echo "Removing broken shadow dir: $EXT_DIR/$_uuid"
    rm -rf "$EXT_DIR/$_uuid"
  fi
done
# Enable extensions
gsettings set org.gnome.shell enabled-extensions "[
  'dash-to-panel@jderose9.github.com',
  'touchpad-speed-control@ritesh',
  'auto-move-new-workspace@sobeitnow',
  'smart-alt-f4@local',
  'opencode-tray@local'
]"

# Set auto-move app list (dock apps only)
SCHEMADIR="$EXT_DIR/auto-move-new-workspace@sobeitnow/schemas"
gsettings --schemadir "$SCHEMADIR" set org.gnome.shell.extensions.auto-move-new-workspace application-list "[
  'Alacritty.desktop',
  'org.gnome.Nautilus.desktop',
  'brave-browser.desktop',
  'brave-agimnkijcaahngcdmfeangaknmldooml-Default.desktop',
  'code.desktop',
  'org.telegram.desktop._6f5c3b3269ffaeac0190f61ea29249cd.desktop',
  'com.shellyorg.shelly.desktop',
  'proton.vpn.app.gtk.desktop',
  'arduino-ide-v2.desktop',
  'firefox.desktop',
  'chromium.desktop'
]"
gsettings --schemadir "$SCHEMADIR" set org.gnome.shell.extensions.auto-move-new-workspace focus-new-workspace true

# Fix touchpad scroll speed
if command -v wsf &> /dev/null; then
    wsf set --scroll-vertical 0.35 --scroll-horizontal 0.35
    echo "Touchpad scroll speed set to 0.35"
fi

# Verify the OpenCode tray logic still passes (no live shell needed)
if command -v node >/dev/null 2>&1; then
  if (cd opencode-tray && node test/tray_logic_test.mjs >/dev/null 2>&1); then
    echo "OpenCode tray logic test: PASS"
  else
    echo "WARNING: OpenCode tray logic test FAILED" >&2
  fi
  # Checks the extension's API names against this machine's real Mutter, which
  # is how the Meta.DisplayTabList -> Meta.TabList bug was caught.
  if (cd opencode-tray && node test/api_contract_test.mjs >/dev/null 2>&1); then
    echo "OpenCode tray API contract: PASS"
  else
    echo "WARNING: OpenCode tray API contract FAILED - the installed GNOME/Mutter" >&2
    echo "         may expose different API names. Run:" >&2
    echo "         cd opencode-tray && node test/api_contract_test.mjs" >&2
  fi
fi

echo "Done! Log out/in to activate extensions."
echo "NOTE: GNOME 50 cannot hot-reload extensions -- disable/enable does not"
echo "      re-run enable(), so the login is required for opencode-tray@local."

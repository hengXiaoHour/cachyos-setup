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

echo "Configuring extensions..."
# Enable extensions
gsettings set org.gnome.shell enabled-extensions "[
  'dash-to-panel@jderose9.github.com',
  'touchpad-speed-control@ritesh',
  'auto-move-new-workspace@sobeitnow'
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

echo "Done! Log out/in to activate extensions."

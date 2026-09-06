#!/bin/bash
# Windows-style keyboard shortcuts for CachyOS GNOME (Wayland).
# - Alt+Shift: toggle input language (e.g. English/Khmer), applies immediately.
# - Alt+F4: close focused window, shutdown dialog when none left.
#   Requires smart-alt-f4 from gnome-extensions/install.sh + one log out/in.
set -e

# Alt+Shift toggles input language (Super+Space keeps working as backup)
gsettings set org.gnome.desktop.input-sources xkb-options "['grp:alt_shift_toggle']"

# Free Alt+F4 from the built-in close binding so smart-alt-f4 owns it
gsettings set org.gnome.desktop.wm.keybindings close "[]"

# Clear any custom Alt+F4 that would double-fire with the extension
gsettings set org.gnome.settings-daemon.plugins.media-keys custom-keybindings "@as []"

echo "Keyboard shortcuts set. Alt+F4 needs the smart-alt-f4 extension + one log out/in."

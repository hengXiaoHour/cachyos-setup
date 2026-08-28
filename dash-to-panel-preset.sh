#!/bin/bash
# Dash to Panel preset - CachyOS setup
# Run this after installing dash-to-panel extension

DTP="org.gnome.shell.extensions.dash-to-panel"

# Panel position and size
gsettings set $DTP panel-position 'BOTTOM'
gsettings set $DTP panel-size 48
gsettings set $DTP panel-sizes '{"BOE-0x00000000":42}'
gsettings set $DTP panel-lengths '{"BOE-0x00000000":100}'
gsettings set $DTP panel-anchors '{"BOE-0x00000000":"MIDDLE"}'

# Margins and padding
gsettings set $DTP panel-side-margins 0
gsettings set $DTP panel-side-padding 0
gsettings set $DTP panel-top-bottom-margins 0
gsettings set $DTP panel-top-bottom-padding 0
gsettings set $DTP leftbox-padding 0
gsettings set $DTP tray-padding 0
gsettings set $DTP status-icon-padding 4

# Element positions (system tray next to clock)
gsettings set $DTP panel-element-positions '{"BOE-0x00000000":[{"element":"showAppsButton","visible":true,"position":"stackedTL"},{"element":"activitiesButton","visible":false,"position":"stackedTL"},{"element":"leftBox","visible":true,"position":"stackedTL"},{"element":"taskbar","visible":true,"position":"stackedTL"},{"element":"centerBox","visible":true,"position":"stackedBR"},{"element":"rightBox","visible":true,"position":"stackedBR"},{"element":"systemMenu","visible":true,"position":"stackedTL"},{"element":"dateMenu","visible":true,"position":"stackedTL"},{"element":"desktopButton","visible":false,"position":"stackedTL"}]}'

# App icon style
gsettings set $DTP appicon-style 'NORMAL'
gsettings set $DTP appicon-margin 1
gsettings set $DTP appicon-padding 4

# Dot indicators
gsettings set $DTP dot-style-focused 'METRO'
gsettings set $DTP dot-style-unfocused 'METRO'
gsettings set $DTP dot-position 'BOTTOM'
gsettings set $DTP dot-size 3

# Taskbar
gsettings set $DTP group-apps true
gsettings set $DTP show-running-apps true
gsettings set $DTP show-favorites true
gsettings set $DTP click-action 'CYCLE-MIN'

# Intellihide
gsettings set $DTP intellihide false

# Transparency
gsettings set $DTP trans-use-custom-opacity true
gsettings set $DTP trans-panel-opacity 0.40000000000000002
gsettings set $DTP trans-bg-color '#000'

echo "Dash to Panel preset applied!"

#!/bin/bash
# Play Windows-like ding on USB serial plug/unplug (ttyACM/ttyUSB) — 5x amplified.
LOUD_DIR="$HOME/.local/share/sounds/serial-loud"
play_loud() {
  paplay "$LOUD_DIR/$1" 2>/dev/null || pw-play "$LOUD_DIR/$1" 2>/dev/null || aplay "$LOUD_DIR/$1" 2>/dev/null &
}
udevadm monitor --udev --subsystem-match=tty --property 2>/dev/null | while read -r line; do
  case "$line" in
    "ACTION=add") action="add" ;;
    "ACTION=remove") action="remove" ;;
    "DEVNAME=/dev/ttyACM"*|"DEVNAME=/dev/ttyUSB"*)
      if [ "$action" = "add" ]; then
        play_loud device-added-loud.wav
      elif [ "$action" = "remove" ]; then
        play_loud device-removed-loud.wav
      fi
      action=""
      ;;
  esac
done

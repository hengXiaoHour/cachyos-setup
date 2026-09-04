#!/bin/bash
# Installer: Windows-like plug/unplug ding for USB serial (ttyACM/ttyUSB).
# Generates 5x-amplified copies of the freedesktop device sounds,
# installs the watcher script + systemd user service, enables it.
set -e
cd "$(dirname "$0")"

command -v ffmpeg >/dev/null || { echo "missing: ffmpeg (paru -S ffmpeg)"; exit 1; }
command -v paplay >/dev/null || command -v pw-play >/dev/null || { echo "missing: paplay/pipewire"; exit 1; }

LOUD_DIR="$HOME/.local/share/sounds/serial-loud"
mkdir -p "$LOUD_DIR" "$HOME/.local/bin" "$HOME/.config/systemd/user"

echo "==> generating 5x amplified sounds in $LOUD_DIR"
ffmpeg -y -loglevel error -i /usr/share/sounds/freedesktop/stereo/device-added.oga \
  -filter:a "volume=5.0,alimiter=limit=0.9" "$LOUD_DIR/device-added-loud.wav"
ffmpeg -y -loglevel error -i /usr/share/sounds/freedesktop/stereo/device-removed.oga \
  -filter:a "volume=5.0,alimiter=limit=0.9" "$LOUD_DIR/device-removed-loud.wav"

echo "==> installing watcher + service"
install -m 755 serial-plug-sound.sh "$HOME/.local/bin/serial-plug-sound.sh"
install -m 644 serial-plug-sound.service "$HOME/.config/systemd/user/serial-plug-sound.service"

systemctl --user daemon-reload
systemctl --user enable --now serial-plug-sound.service
sleep 1
systemctl --user is-active serial-plug-sound.service

echo "==> test: plug-in ding"
paplay "$LOUD_DIR/device-added-loud.wav" 2>/dev/null || pw-play "$LOUD_DIR/device-added-loud.wav"
echo OK — plug in a USB serial device to hear it live.

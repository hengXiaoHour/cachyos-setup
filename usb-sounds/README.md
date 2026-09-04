# USB serial plug/unplug sounds

Windows-like ding when a USB serial device (`/dev/ttyACM*`, `/dev/ttyUSB*`)
is plugged in or removed — e.g. flashing the balancing robot.

## Install

```bash
./usb-sounds/setup-usb-sounds.sh
```

What it does:

1. Generates 5x-amplified copies of the freedesktop `device-added` /
   `device-removed` sounds into `~/.local/share/sounds/serial-loud/`
   (with a limiter so they don't crackle).
2. Installs `serial-plug-sound.sh` to `~/.local/bin/` — watches udev tty
   events via `udevadm monitor` and plays the matching sound.
3. Installs and enables `serial-plug-sound.service` (systemd user service,
   auto-starts on login).

## Files

| File | Purpose |
|------|---------|
| `serial-plug-sound.sh` | udev watcher + sound player |
| `serial-plug-sound.service` | systemd user unit |
| `setup-usb-sounds.sh` | one-shot installer + sound test |

## Uninstall

```bash
systemctl --user disable --now serial-plug-sound.service
rm ~/.local/bin/serial-plug-sound.sh \
   ~/.config/systemd/user/serial-plug-sound.service
rm -r ~/.local/share/sounds/serial-loud
```

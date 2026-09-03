#!/usr/bin/env bash
# Speaker tuning for Alienware x14 R2 + CachyOS (PipeWire).
#   bash audio-tuning/setup-audio-tuning.sh          # full install + presets
#   bash audio-tuning/setup-audio-tuning.sh --check  # report only, change nothing
#
# Why: on Windows this laptop ships MaxxAudio + Dolby DSP (harmonic bass,
# compression, limiter). On Linux ALSA runs flat, so the 2x2W speakers sound
# thin and quiet. This installs EasyEffects and drops in a tuned Output chain
# (equalizer -> bass_enhancer -> compressor -> limiter) that recreates it.
# Safe to re-run: every step is guarded / idempotent.
set -u
CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$HOME/.config/easyeffects/output"
AUTOSTART="$HOME/.config/autostart/easyeffects-service.desktop"
# Community presets (MIT, JackHack96/EasyEffects-Presets) fetched at install
# so the repo only vendors the custom tuning.
COMMUNITY_BASE="https://raw.githubusercontent.com/JackHack96/EasyEffects-Presets/master"

say() { printf '%s\n' "$*"; }
run() { [ "$CHECK" = 1 ] && { say "  [check] would run: $*"; return 0; }; eval "$*"; }

say "== 1/3 packages (easyeffects + LSP plugins) =="
if pacman -Q easyeffects lsp-plugins >/dev/null 2>&1; then
  say "  easyeffects + lsp-plugins already installed, skipping."
else
  run "sudo pacman -S --needed --noconfirm easyeffects lsp-plugins"
fi

say "== 2/3 presets -> $OUT_DIR =="
run "mkdir -p '$OUT_DIR'"
run "cp '$SCRIPT_DIR/Alienware x14 R2 Loud.json' '$OUT_DIR/'"
for p in "Dolby Atmos.json" "Loudness+Autogain.json"; do
  if [ -f "$OUT_DIR/$p" ]; then
    say "  '$p' already present, skipping."
  else
    # URL-encode the spaces for curl; target filename keeps real spaces.
    url="$COMMUNITY_BASE/$(printf '%s' "$p" | sed 's/ /%20/g')"
    run "curl -fsSL -o '$OUT_DIR/$p' '$url'"
  fi
done

say "== 3/3 autostart (EasyEffects service) =="
if [ -f "$AUTOSTART" ] && grep -q "easyeffects --gapplication-service" "$AUTOSTART"; then
  say "  autostart entry already present, skipping."
else
  if [ "$CHECK" = 1 ]; then
    say "  [check] would write: $AUTOSTART"
  else
    mkdir -p "$(dirname "$AUTOSTART")"
    printf '[Desktop Entry]\nName=EasyEffects Service\nExec=easyeffects --gapplication-service\nTerminal=false\nType=Application\nX-GNOME-Autostart-enabled=true\n' > "$AUTOSTART"
    say "  wrote $AUTOSTART"
  fi
fi

say "Done. Open EasyEffects > Output > Presets > 'Alienware x14 R2 Loud'."
say "Tune by ear: Bass Enhancer amount (3-6 = fatter), Limiter threshold (-3..0, lower = louder)."
say "Do NOT boost below 80 Hz on these 2W drivers — distortion, no real bass down there."

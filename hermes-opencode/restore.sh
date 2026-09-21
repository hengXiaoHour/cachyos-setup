#!/bin/bash
# =============================================================================
# hermes-opencode/restore.sh — restore a ~/.hermes backup made by backup.sh.
#
# Fresh-machine flow:
#   1. ./install.sh                        # hermes CLI + live model config
#   2. ./restore.sh <backup.tar.gz>        # your skills/memories/sessions back
#   3. hermes gateway start                # back online
#
# Safety: the current ~/.hermes (if any) is moved to
# ~/.cachyos-backup/pre-restore-<timestamp>/.hermes first — nothing is deleted.
# The gateway is stopped (best-effort) before extracting so sqlite files land
# cleanly. Secrets (.env/auth) come back only if the backup contains them.
#
# Usage:
#   ./restore.sh ~/.cachyos-backup/hermes-backup-20260915-120000.tar.gz
#   ./restore.sh <file> --no-stop    # don't touch the gateway
# =============================================================================
set -euo pipefail

NO_STOP=0
FILE=""

for a in "$@"; do
  case "$a" in
    --no-stop) NO_STOP=1 ;;
    -h|--help) sed -n '2,/^# ===/p' "$0" | sed 's/^# //;s/^#//'; exit 0 ;;
    *) FILE="$a" ;;
  esac
done

[[ -n "$FILE" ]] || { echo "Usage: ./restore.sh <hermes-backup-*.tar.gz>" >&2; exit 2; }
[[ -f "$FILE" ]] || { echo "ERROR: not found: $FILE" >&2; exit 1; }
tar -tzf "$FILE" >/dev/null 2>&1 || { echo "ERROR: not a valid tar.gz: $FILE" >&2; exit 1; }
if ! tar -tzf "$FILE" | head -1 | grep -q '^\.hermes/'; then
  echo "ERROR: $FILE doesn't look like a hermes backup (expected .hermes/ entries)" >&2
  exit 1
fi
if [[ -f "${FILE}.sha256" ]]; then
  (cd "$(dirname "$FILE")" && sha256sum -c "$(basename "${FILE}.sha256")") \
    || { echo "ERROR: sha256 mismatch — backup may be corrupt, aborting" >&2; exit 1; }
  echo "sha256 OK"
else
  echo "WARN: no .sha256 sidecar — skipping integrity check"
fi

if [[ "$NO_STOP" -eq 0 ]] && command -v hermes >/dev/null 2>&1; then
  hermes gateway stop >/dev/null 2>&1 \
    || echo "WARN: could not stop hermes gateway — continuing anyway"
fi

if [[ -d "$HOME/.hermes" ]]; then
  BK="$HOME/.cachyos-backup/pre-restore-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$BK"
  mv "$HOME/.hermes" "$BK/.hermes"
  echo "Current ~/.hermes moved to: $BK/.hermes"
fi

tar -xzf "$FILE" -C "$HOME"
echo
echo "Restored: $FILE -> ~/.hermes ($(du -sh "$HOME/.hermes" | cut -f1))"
if [[ ! -f "$HOME/.hermes/config.yaml" ]]; then
  echo "WARN: no config.yaml after restore — run ./install.sh to regenerate base config"
fi
if [[ ! -f "$HOME/.hermes/.env" ]]; then
  echo "NOTE: no .env in backup (was --no-secrets) — re-auth where needed: hermes auth"
fi
echo "Next: hermes gateway start   # (and: hermes config show, hermes mcp list)"

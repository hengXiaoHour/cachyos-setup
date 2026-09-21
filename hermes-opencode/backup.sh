#!/bin/bash
# =============================================================================
# hermes-opencode/backup.sh — wipe-proof backup of live ~/.hermes user data.
#
# The repo only tracks portable config (install.sh + skills snapshot). Everything
# Hermes learns — curated skills, memories, sessions, cron, projects, secrets —
# lives in ~/.hermes and dies with the disk. This script tars the valuable part
# so a wiped laptop can be restored with restore.sh.
#
# Usage:
#   ./backup.sh                              # full local backup (incl. secrets)
#   ./backup.sh --no-secrets                 # shareable backup (no .env/auth)
#   ./backup.sh --no-sessions                # skip 49M+ sessions/ (smaller file)
#   ./backup.sh --dest DIR                   # output dir (default ~/.cachyos-backup)
#   ./backup.sh --no-stop                    # don't try to stop the gateway first
#
# Output: ~/.cachyos-backup/hermes-backup-YYYYMMDD-HHMMSS.tar.gz (+ .sha256)
# NEVER commit a backup containing secrets to git. --no-secrets is for sharing.
# Safe to re-run: each run writes a new timestamped file, nothing is deleted.
# =============================================================================
set -euo pipefail

SRC="$HOME/.hermes"
DEST="$HOME/.cachyos-backup"
NO_SECRETS=0
NO_SESSIONS=0
NO_STOP=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-secrets)  NO_SECRETS=1 ;;
    --no-sessions) NO_SESSIONS=1 ;;
    --no-stop)     NO_STOP=1 ;;
    --dest)        DEST="$2"; shift ;;
    --dest=*)      DEST="${1#--dest=}" ;;
    -h|--help)     sed -n '2,/^# ===/p' "$0" | sed 's/^# //;s/^#//'; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done

[[ -d "$SRC" ]] || { echo "ERROR: $SRC not found — nothing to back up" >&2; exit 1; }
mkdir -p "$DEST"

# Stop the gateway so sqlite files (state.db) checkpoint cleanly. Best-effort:
# newer CLIs may use different subcommands; a running gateway is the main
# corruption risk, so warn loudly if we can't stop it.
if [[ "$NO_STOP" -eq 0 ]] && command -v hermes >/dev/null 2>&1; then
  hermes gateway stop >/dev/null 2>&1 \
    || echo "WARN: could not stop hermes gateway — state.db copy may be hot (restore still usually works)"
fi

TS="$(date +%Y%m%d-%H%M%S)"
SUFFIX=""
[[ "$NO_SECRETS" -eq 1 ]] && SUFFIX="-nosecrets"
OUT="$DEST/hermes-backup-${TS}${SUFFIX}.tar.gz"

# Reinstallable / regenerable / socket junk — never backed up:
#   hermes-agent/ = 1.5G git clone + venv (reinstall via install.sh)
#   bin/, lsp/    = large, reinstalled
#   cache/logs/*_cache = regenerable; sock/lock/shm/wal-adjacent = runtime junk
EXCLUDES=(
  --exclude=hermes-agent
  --exclude=bin
  --exclude=lsp
  --exclude=cache
  --exclude=logs
  --exclude=audio_cache
  --exclude=image_cache
  --exclude=sandboxes
  --exclude=.lsp-discovery.lock
  --exclude=.mcp-discovery.lock
  --exclude=.install_id.lock
  --exclude=gateway.sock
  --exclude='*.sock'
  --exclude='*.lock'
  --exclude='*.shm'
  --exclude=gateway-starts.log
  --exclude=interrupt_debug.log
)
[[ "$NO_SESSIONS" -eq 1 ]] && EXCLUDES+=(--exclude=sessions --exclude=session-exports --exclude=terminal-sessions)
if [[ "$NO_SECRETS" -eq 1 ]]; then
  EXCLUDES+=(--exclude=.env --exclude=auth.json --exclude=pairing)
fi

tar -czf "$OUT" -C "$HOME" "${EXCLUDES[@]}" .hermes
sha256sum "$OUT" | sed "s|$DEST/||" > "${OUT}.sha256"

echo
echo "Backup written: $OUT ($(du -h "$OUT" | cut -f1))"
echo "  sha256: $(cut -d' ' -f1 "${OUT}.sha256")"
tar -tzf "$OUT" | head -5 | sed 's/^/  contains, e.g.: /'
echo "  entries: $(tar -tzf "$OUT" | wc -l)"
if [[ "$NO_SECRETS" -eq 0 ]]; then
  echo "  WARNING: contains secrets (.env/auth) — keep local, NEVER git-commit it."
else
  echo "  no-secrets build — safe to share, but still don't commit binaries to git."
fi
echo "  restart the agent when ready: hermes gateway start  (or: hermes gateway restart)"
echo "  restore on a fresh machine with: ./restore.sh \"$OUT\""

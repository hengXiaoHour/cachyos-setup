#!/usr/bin/env bash
# Proton VPN country rotator via WireGuard configs (free-plan friendly).
# One config per country in /etc/wireguard/<CC>.conf
# Priority: CA first, then US. Fallback walks the list in order.
set -euo pipefail

CONF_DIR="/etc/wireguard"
STATE_DIR="/var/lib/proton-rotate"
STATE_FILE="$STATE_DIR/last-country"
LOG_FILE="$STATE_DIR/rotate.log"

mkdir -p "$STATE_DIR"
exec >> "$LOG_FILE" 2>&1
echo "===== $(date '+%F %T') rotation start ====="

current=""
for f in "$CONF_DIR"/*.conf; do
  [[ -e "$f" ]] || continue
  iface="$(basename "$f" .conf)"
  if wg show "$iface" &>/dev/null; then
    current="$iface"
    break
  fi
done

PRIORITY=(CA US)

mapfile -t confs < <(find "$CONF_DIR" -maxdepth 1 -name '*.conf')
[[ ${#confs[@]} -gt 0 ]] || { echo "ERROR: no configs in $CONF_DIR"; exit 1; }
declare -A present=()
for f in "${confs[@]##*/}"; do present["${f%.conf}"]=1; done

mapfile -t pool < <(for c in "${PRIORITY[@]}"; do [[ -n "${present[$c]:-}" ]] && printf '%s\n' "$c.conf"; done)
[[ ${#pool[@]} -gt 0 ]] || { echo "ERROR: none of PRIORITY (${PRIORITY[*]}) installed in $CONF_DIR"; exit 1; }

last="$(cat "$STATE_FILE" 2>/dev/null || true)"
mapfile -t nonlast < <(printf '%s\n' "${pool[@]}" | grep -Fxv "${last}.conf" || true)
if [[ ${#nonlast[@]} -gt 0 ]]; then pool=("${nonlast[@]}"); fi
if [[ -n "$last" && -n "${present[$last]:-}" ]] && ! printf '%s\n' "${pool[@]}" | grep -Fxq "${last}.conf"; then
  pool+=("${last}.conf")
fi

target="${pool[0]}"
target_iface="${target%.conf}"
echo "rotating: ${current:-none} (${last:-none} used last) -> $target_iface"

if [[ -n "$current" ]]; then
  wg-quick down "$CONF_DIR/$current.conf" || true
fi

try_up() {
  wg-quick up "$CONF_DIR/$1"
}

if try_up "$target"; then
  echo "$target_iface" > "$STATE_FILE"
  echo "SUCCESS: connected via $target_iface"
else
  echo "FAILED: $target_iface, trying others..."
  ok=0
  for alt in "${pool[@]:1}"; do
    alt_iface="${alt%.conf}"
    [[ "$alt_iface" == "$target_iface" ]] && continue
    if try_up "$alt"; then
      echo "$alt_iface" > "$STATE_FILE"
      echo "SUCCESS: connected via $alt_iface"
      ok=1
      break
    fi
  done
  if [[ $ok -ne 1 ]]; then
    echo "ERROR: all candidates failed"
    exit 1
  fi
fi

#!/bin/bash
# =============================================================================
# hermes-opencode — minimal Hermes Agent install, routed through OpenCode Zen
# keyless (no API key). Extracted from hengXiaoHour/V.I.S.W.A 2026-09-02.
#
#   OpenCode Zen (https://opencode.ai/zen/v1) accepts anonymous requests whose
#   Authorization is missing or not a well-formed Bearer token, exposing a set
#   of free keyless models. Hermes points its model provider at that endpoint,
#   so the whole agent runs without any API key.
#
# Usage:
#   ./install.sh                # hermes CLI + keyless config + skills
#   INSTALL_BROWSER=1 ./install.sh   # also install Playwright/Chromium browser tools
#   SKIP_SYSTEMD=1 ./install.sh     # do not install the headless opencode server unit
#
# Safe to re-run: installer is git-based, config/applies are idempotent.
# =============================================================================
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_BIN="${HERMES_BIN:-$HOME/.hermes/bin/hermes}"
INSTALL_BROWSER="${INSTALL_BROWSER:-0}"
SKIP_SYSTEMD="${SKIP_SYSTEMD:-0}"

KEYLESS_MODEL="${KEYLESS_MODEL:-laguna-s-2.1-free}"
KEYLESS_PROVIDER="${KEYLESS_PROVIDER:-opencode-free}"
KEYLESS_BASE_URL="https://opencode.ai/zen/v1"

echo "==> [1/5] Install Hermes Agent (official installer, non-interactive)"
if ! command -v hermes >/dev/null 2>&1 && [ ! -x "$HERMES_BIN" ]; then
    curl -fsSL https://hermes-agent.nousresearch.com/install.sh \
        | bash -s -- --non-interactive --skip-setup \
            $( [ "$INSTALL_BROWSER" = "1" ] && echo "" || echo "--skip-browser --skip-computer-use" )
else
    echo "    hermes already present — skipping install"
fi

# Locate the hermes CLI (installer drops ~/.hermes/bin/hermes; ensure resolvable)
export PATH="$HOME/.hermes/bin:$HOME/.local/bin:$PATH"
if ! command -v hermes >/dev/null 2>&1; then
    echo "ERROR: hermes not on PATH after install" >&2
    exit 1
fi
HERMES="$(command -v hermes)"
echo "    hermes at: $HERMES ($("$HERMES" --version 2>/dev/null | head -1 || true))"

echo "==> [2/5] Set keyless OpenCode Zen as the model provider"
hermes config set model.default "$KEYLESS_MODEL" >/dev/null
hermes config set model.provider "$KEYLESS_PROVIDER" >/dev/null
hermes config set model.base_url "$KEYLESS_BASE_URL" >/dev/null

# Fallback chain = models currently keyless-available on OpenCode Zen (verified
# 2026-09-02). Stored TOP-LEVEL (config_defaults.py reads `fallback_providers` at
# root, NOT under `model:`). big-pickle is in the catalog but anonymous
# rate-limited — kept so it's picked the moment the quota frees up.
hermes config set fallback_providers \
  '[{"provider":"opencode-free","model":"nemotron-3.5-lightning-free"},{"provider":"opencode-free","model":"nemotron-3-ultra-free"},{"provider":"opencode-free","model":"big-pickle"}]' >/dev/null

echo "==> [3/5] Install the hermes-agent + opencode skills (bridge OpenCode into Hermes)"
mkdir -p "$HOME/.hermes/skills"
cp -rn "$BUNDLE_DIR/skills/autonomous-ai-agents" "$HOME/.hermes/skills/"
echo "    skills: $(basename "$BUNDLE_DIR/skills/autonomous-ai-agents"/* )"

echo "==> [4/5] Optional: headless opencode server unit (:4096, Hermes MCP bridge target)"
if [ "$SKIP_SYSTEMD" = "0" ] && [ -d "$HOME/.config/systemd/user" ]; then
    cp "$BUNDLE_DIR/systemd/opencode-server.service" "$HOME/.config/systemd/user/"
    systemctl --user daemon-reload >/dev/null 2>&1 || true
    systemctl --user enable --now opencode-server.service >/dev/null 2>&1 \
        && echo "    opencode-server.service enabled (:4096)" \
        || echo "    opencode-server.service staged (enable manually: systemctl --user enable --now opencode-server)"
else
    echo "    skipped"
fi

echo "==> [5/5] Verify keyless connectivity"
code=$(curl -s -o /tmp/zen-check.json -w '%{http_code}' -m 30 \
    -X POST "$KEYLESS_BASE_URL/chat/completions" \
    -H 'Content-Type: application/json' \
    -d "{\"model\":\"$KEYLESS_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":5}")
if [ "$code" = "200" ] && grep -q '"choices"' /tmp/zen-check.json; then
    echo "    OK: OpenCode Zen keyless answered ($KEYLESS_MODEL)"
else
    echo "    WARN: keyless probe returned $code — see /tmp/zen-check.json. Model may be rate-limited/rotated; re-check with:"
    echo "      curl -s $KEYLESS_BASE_URL/chat/completions -H 'Content-Type: application/json' -d '{\"model\":\"'$KEYLESS_MODEL'\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":5}'"
fi

echo
echo "Done. Test the agent:"
echo "  hermes chat -q 'Reply with exactly: HERMES_KEYLESS_OK'"
echo "  hermes                                  # interactive TUI"
echo "  hermes model                            # switch models (chat /model <name>)"
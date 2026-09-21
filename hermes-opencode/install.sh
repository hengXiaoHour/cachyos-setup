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
#   ENABLE_TELEGRAM=1 ./install.sh  # also enable the telegram platform entry
#   INSTALL_FREECAD_MCP=1 INSTALL_DAVINCI_MCP=1 ./install.sh  # also add machine MCP servers
#
# Live-machine snapshot synced 2026-09-15 (Hermes Agent v0.21.2):
#   model.default=muse-spark-1.3-contributor-free, provider=opencode-free,
#   base_url=https://opencode.ai/zen/v1, api_mode=codex_responses,
#   fallback_providers=[] (empty), platforms.telegram.enabled=true,
#   mcp_servers={freecad, davinci-resolve}.
#
# WARNING (verified 2026-09-15): OpenCode Zen now gates the free tier to a real
# client session — anonymous /chat/completions returns
# "OpenCode's free tier can only be used in OpenCode" (400 MissingSessionID).
# The keyless config below is kept to match the live machine, but expect it to
# need a Zen API key until the gate is lifted. See README.md.
# Safe to re-run: installer is git-based, config/applies are idempotent.
# =============================================================================
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_BIN="${HERMES_BIN:-$HOME/.hermes/bin/hermes}"
INSTALL_BROWSER="${INSTALL_BROWSER:-0}"
SKIP_SYSTEMD="${SKIP_SYSTEMD:-0}"

KEYLESS_MODEL="${KEYLESS_MODEL:-muse-spark-1.3-contributor-free}"
KEYLESS_PROVIDER="${KEYLESS_PROVIDER:-opencode-free}"
KEYLESS_BASE_URL="https://opencode.ai/zen/v1"
KEYLESS_API_MODE="${KEYLESS_API_MODE:-codex_responses}"
# Optional machine extras from the live config (off by default — paths are
# host-specific, so they are opt-in, never forced).
ENABLE_TELEGRAM="${ENABLE_TELEGRAM:-0}"
INSTALL_FREECAD_MCP="${INSTALL_FREECAD_MCP:-0}"
INSTALL_DAVINCI_MCP="${INSTALL_DAVINCI_MCP:-0}"
FREECAD_MCP_DIR="${FREECAD_MCP_DIR:-$HOME/freecad-mcp}"
DAVINCI_MCP_VENV_PY="${DAVINCI_MCP_VENV_PY:-$HOME/.local/share/davinci-resolve-mcp/venv/bin/python}"
DAVINCI_MCP_SERVER="${DAVINCI_MCP_SERVER:-$HOME/.local/share/davinci-resolve-mcp/src/server.py}"

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
hermes config set model.api_mode "$KEYLESS_API_MODE" >/dev/null

# Live machine has NO fallback providers (hermes fallback list = empty).
# Stored TOP-LEVEL (config_defaults.py reads `fallback_providers` at root, NOT
# under `model:`). Previous chain (nemotron-3.5/ultra + big-pickle, 2026-09-02)
# is stale: laguna-s-2.1-free was removed from the Zen catalog and the free
# tier is session-gated since 2026-09-15, so clearing to match live.
hermes config set fallback_providers '[]' >/dev/null

echo "==> [2b/5] Optional: live-machine extras (telegram platform, MCP servers)"
if [ "$ENABLE_TELEGRAM" = "1" ]; then
    hermes config set platforms.telegram.enabled true >/dev/null \
        && echo "    telegram platform enabled" \
        || echo "    WARN: could not enable telegram platform"
else
    echo "    telegram skipped (ENABLE_TELEGRAM=1 to enable)"
fi
if [ "$INSTALL_FREECAD_MCP" = "1" ]; then
    hermes mcp add freecad --command uv --args --directory "$FREECAD_MCP_DIR" run freecad-mcp --only-text-feedback >/dev/null 2>&1 \
        && echo "    freecad MCP added ($FREECAD_MCP_DIR)" \
        || echo "    WARN: could not add freecad MCP (need $FREECAD_MCP_DIR + hermes mcp support)"
else
    echo "    freecad MCP skipped (INSTALL_FREECAD_MCP=1 to add)"
fi
if [ "$INSTALL_DAVINCI_MCP" = "1" ]; then
    hermes mcp add davinci-resolve --command "$DAVINCI_MCP_VENV_PY" \
        --env RESOLVE_SCRIPT_API=/opt/resolve/Developer/Scripting \
        RESOLVE_SCRIPT_LIB=/opt/resolve/libs/Fusion/fusionscript.so \
        PYTHONPATH=/opt/resolve/Developer/Scripting/Modules \
        --args "$DAVINCI_MCP_SERVER" >/dev/null 2>&1 \
        && echo "    davinci-resolve MCP added" \
        || echo "    WARN: could not add davinci-resolve MCP (need $DAVINCI_MCP_VENV_PY + $DAVINCI_MCP_SERVER)"
else
    echo "    davinci-resolve MCP skipped (INSTALL_DAVINCI_MCP=1 to add)"
fi
echo "    live reference: model.api_mode=$KEYLESS_API_MODE, fallback_providers=[],"
echo "      mcp_servers={freecad, davinci-resolve}, platforms.telegram.enabled=true"

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
    echo "    WARN: keyless probe returned $code — see /tmp/zen-check.json."
    echo "    NOTE (2026-09-15): free tier is session-gated ('can only be used in"
    echo "    OpenCode' / MissingSessionID) — a Zen API key may now be required."
    echo "    Re-check with:"
    echo "      curl -s $KEYLESS_BASE_URL/chat/completions -H 'Content-Type: application/json' -d '{\"model\":\"'$KEYLESS_MODEL'\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":5}'"
fi

echo
echo "Done. Test the agent:"
echo "  hermes chat -q 'Reply with exactly: HERMES_KEYLESS_OK'"
echo "  hermes                                  # interactive TUI"
echo "  hermes model                            # switch models (chat /model <name>)"
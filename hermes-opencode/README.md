# hermes-opencode

Minimal Hermes Agent install, routed through **OpenCode Zen** — extracted
from [hengXiaoHour/V.I.S.W.A](https://github.com/hengXiaoHour/V.I.S.W.A) on
2026-09-02, synced to live machine config on 2026-09-15 (Hermes v0.21.2).
Only the "Hermes agent ↔ OpenCode" part, nothing else from the fleet.

> **STATUS 2026-09-15 — keyless is currently BLOCKED.** OpenCode Zen now gates
> the free tier to a real client session: anonymous `/chat/completions`
> returns `400 "OpenCode's free tier can only be used in OpenCode"`
> (`MissingSessionID`), `/messages` returns `401 Missing API key`. The config
> below is kept to match the live machine (`opencode-free /
> muse-spark-1.3-contributor-free`), but expect to need a Zen API key until
> the gate is lifted. Re-probe any time with the curl in
> [Keyless free models](#keyless-free-models).

## What it does

Hermes Agent (Nous Research) is a provider-agnostic AI agent framework. Its
model provider points at **OpenCode Zen** (`https://opencode.ai/zen/v1`), which
*used to* serve a set of free models to anonymous requests.

Keyless rule (pre-gate): the Zen gateway answered requests with **no
`Authorization` header or any value that is not a well-formed `Bearer <token>`**.
A real `Bearer <token>` returns `AuthError: Invalid API key`. So no key = worked.

## Layout

| Path | What |
|---|---|
| `install.sh` | Idempotent installer: official hermes installer + live model config + skills |
| `backup.sh` | Wipe-proof backup of `~/.hermes` user data → `~/.cachyos-backup/` (run before any wipe) |
| `restore.sh` | Restore a `backup.sh` tarball on a fresh machine (after `install.sh`) |
| `skills/autonomous-ai-agents/hermes-agent/` | Hermes skill (hub for configuring/running Hermes) |
| `skills/autonomous-ai-agents/opencode/` | Skill that delegates coding to OpenCode CLI from inside Hermes |
| `systemd/opencode-server.service` | Headless opencode server on 127.0.0.1:4096 (MCP bridge target) |
| `etc/opencode-bodyfix/` | Venv httpx shim for the Aug-23 Zen key-order 401 (install only if regression returns) |

## Install

```bash
./install.sh                                                          # does everything below
ENABLE_TELEGRAM=1 ./install.sh                                        # + telegram platform
INSTALL_FREECAD_MCP=1 INSTALL_DAVINCI_MCP=1 ./install.sh              # + live MCP servers
INSTALL_BROWSER=1 ./install.sh                                        # + Playwright/Chromium
```

Manual recap (matches live `~/.hermes/config.yaml` on 2026-09-15):
```bash
# 1. Hermes itself (official installer = git clone + uv venv + launcher)
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --non-interactive --skip-setup

# 2. Model config (the whole point) — live values
hermes config set model.default muse-spark-1.3-contributor-free
hermes config set model.provider opencode-free
hermes config set model.base_url https://opencode.ai/zen/v1
hermes config set model.api_mode codex_responses
# top-level key — NOT under `model:` (hermes_cli/config_defaults.py reads root).
# Live machine has NO fallbacks (2026-09-15):
hermes config set fallback_providers '[]'
# Old 2026-09-02 chain (stale — laguna-s-2.1-free removed from catalog):
# hermes config set fallback_providers '[{"provider":"opencode-free","model":"nemotron-3.5-lightning-free"},{"provider":"opencode-free","model":"nemotron-3-ultra-free"},{"provider":"opencode-free","model":"big-pickle"}]'

# 2b. Optional live-machine extras (opt-in in install.sh via env flags)
hermes config set platforms.telegram.enabled true   # ENABLE_TELEGRAM=1
# freecad MCP (needs ~/freecad-mcp): INSTALL_FREECAD_MCP=1
hermes mcp add freecad --command uv --args --directory ~/freecad-mcp run freecad-mcp --only-text-feedback
# davinci-resolve MCP (needs ~/.local/share/davinci-resolve-mcp): INSTALL_DAVINCI_MCP=1
hermes mcp add davinci-resolve --command ~/.local/share/davinci-resolve-mcp/venv/bin/python \
  --env RESOLVE_SCRIPT_API=/opt/resolve/Developer/Scripting \
  RESOLVE_SCRIPT_LIB=/opt/resolve/libs/Fusion/fusionscript.so \
  PYTHONPATH=/opt/resolve/Developer/Scripting/Modules \
  --args ~/.local/share/davinci-resolve-mcp/src/server.py

# 3. Skills (hermes-agent + opencode delegation)
mkdir -p ~/.hermes/skills
cp -rn skills/autonomous-ai-agents ~/.hermes/skills/

# 4. Optional headless opencode server (:4096)
cp systemd/opencode-server.service ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now opencode-server.service
```

## Keyless free models (live 2026-09-15; gate-blocked, see banner)

Live model: `muse-spark-1.3-contributor-free` (`opencode-free`,
`api_mode=codex_responses`, no fallbacks). Previous default
`laguna-s-2.1-free` was **removed from the Zen catalog**.

Current free-tier catalog (from `/zen/v1/models`): `big-pickle`,
`deepseek-v4-flash-free`, `muse-spark-1.3-contributor-free`, `mimo-v2.5-free`,
`ling-3.0-flash-fin-free`, `nemotron-3-ultra-free`,
`nemotron-3.5-lightning-free` — all currently session-gated, not anonymously
reachable.

Full catalog is 66 models at `https://opencode.ai/zen/v1/models`; most need a
paid/subscribed key. Re-test any time:
```bash
curl -s https://opencode.ai/zen/v1/chat/completions -H 'Content-Type: application/json' \
  -d '{"model":"muse-spark-1.3-contributor-free","messages":[{"role":"user","content":"hi"}],"max_tokens":5}'
```

## Live extras (in `install.sh`, opt-in)

| Live setting | Env flag | Notes |
|---|---|---|
| `platforms.telegram.enabled=true` | `ENABLE_TELEGRAM=1` | only extra platform enabled live |
| `mcp_servers.freecad` (`uv --directory ~/freecad-mcp run freecad-mcp --only-text-feedback`) | `INSTALL_FREECAD_MCP=1` (`FREECAD_MCP_DIR` overrides path) | `hermes mcp list` shows ✓ enabled live |
| `mcp_servers.davinci-resolve` (`~/.local/share/davinci-resolve-mcp/venv/bin/python …/src/server.py` + `RESOLVE_*` env) | `INSTALL_DAVINCI_MCP=1` (`DAVINCI_MCP_VENV_PY` / `DAVINCI_MCP_SERVER` override) | needs DaVinci install at `/opt/resolve` |

## Backup / restore (wipe-proofing)

The repo tracks portable config only. Everything Hermes learns lives in
`~/.hermes` and dies with the disk — back it up before any wipe:

```bash
./backup.sh                              # full backup → ~/.cachyos-backup/ (incl. secrets, keep local, NEVER git-commit)
./backup.sh --no-secrets                 # shareable variant (drops .env/auth/pairing)
./backup.sh --no-sessions                # smaller file (skips sessions/ history)
```

What it packs: `config.yaml`, all of `skills/` (incl. your curated ones),
`memories/`, `SOUL.md`, sessions, cron, `projects.db`/`kanban.db`, secrets.
What it skips: `hermes-agent/` (1.5G git clone), `bin/`, `lsp/`, caches, logs,
sockets/locks. Test backup 2026-09-15: 85M / 894 entries without sessions.

Fresh-machine restore:

```bash
./install.sh                             # 1. hermes CLI + live model config
./restore.sh ~/.cachyos-backup/hermes-backup-<TS>.tar.gz   # 2. skills/memories/sessions back
hermes gateway start                     # 3. back online
```

`restore.sh` verifies sha256, moves any existing `~/.hermes` to
`~/.cachyos-backup/pre-restore-<TS>/` (nothing deleted), and stops the gateway
first so sqlite lands cleanly.

## Gotchas

- **Gateway caches config at startup** — after editing `~/.hermes/config.yaml`
  run `hermes gateway restart`.
- **Never hand-edit `config.yaml`** — use `hermes config set KEY VAL`.
- **Secrets live in `~/.hermes/.env`** — this bundle needs none (keyless).
- If Zen's key-order bug regresses (messages-before-model → `Model is not
  supported`), install `etc/opencode-bodyfix/` into the hermes venv
  `site-packages/` (see that dir's README).
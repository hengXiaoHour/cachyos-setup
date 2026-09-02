# hermes-opencode

Minimal Hermes Agent install, routed through **OpenCode Zen keyless** — extracted
from [hengXiaoHour/V.I.S.W.A](https://github.com/hengXiaoHour/V.I.S.W.A) on
2026-09-02. Only the "Hermes agent ↔ OpenCode" part, nothing else from the fleet.

## What it does

Hermes Agent (Nous Research) is a provider-agnostic AI agent framework. Instead
of paying for / configuring an API key, its model provider points at
**OpenCode Zen** (`https://opencode.ai/zen/v1`), which serves a set of free
models to anonymous requests.

Keyless rule: the Zen gateway answers requests with **no `Authorization` header
or any value that is not a well-formed `Bearer <token>`**. A real `Bearer
<token>` returns `AuthError: Invalid API key`. So no key = works.

## Layout

| Path | What |
|---|---|
| `install.sh` | Idempotent installer: official hermes installer + keyless config + skills |
| `skills/autonomous-ai-agents/hermes-agent/` | Hermes skill (hub for configuring/running Hermes) |
| `skills/autonomous-ai-agents/opencode/` | Skill that delegates coding to OpenCode CLI from inside Hermes |
| `systemd/opencode-server.service` | Headless opencode server on 127.0.0.1:4096 (MCP bridge target) |
| `etc/opencode-bodyfix/` | Venv httpx shim for the Aug-23 Zen key-order 401 (install only if regression returns) |

## Install

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash   # or:
./install.sh                                                          # does everything below
```

Manual recap:
```bash
# 1. Hermes itself (official installer = git clone + uv venv + launcher)
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --non-interactive --skip-setup

# 2. Keyless model config (the whole point)
hermes config set model.default laguna-s-2.1-free
hermes config set model.provider opencode-free
hermes config set model.base_url https://opencode.ai/zen/v1
# top-level key — NOT under `model:` (hermes_cli/config_defaults.py reads root)
hermes config set fallback_providers '[{"provider":"opencode-free","model":"nemotron-3.5-lightning-free"},{"provider":"opencode-free","model":"nemotron-3-ultra-free"},{"provider":"opencode-free","model":"big-pickle"}]'

# 3. Skills (hermes-agent + opencode delegation)
mkdir -p ~/.hermes/skills
cp -rn skills/autonomous-ai-agents ~/.hermes/skills/

# 4. Optional headless opencode server (:4096)
cp systemd/opencode-server.service ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now opencode-server.service
```

## Keyless free models (verified 2026-09-02)

Hermes's fallback chain matches the models the Zen endpoint will actually serve
anonymously. `big-pickle` IS in the catalog but is anonymous rate-limited — it's
kept as a fallback so it's picked the instant the quota frees up.

Working anonymously: `laguna-s-2.1-free` (default), `nemotron-3.5-lightning-free`,
`nemotron-3-ultra-free`.
Deprecated/blocked: `x-preview-f-free`, `hy3-free`, `muse-spark-1.2-contributor-free`,
`deepseek-v4-flash-free`.
Anonymous-rate-limited (need free Zen key): `big-pickle`, `mimo-v2.5-free`.

Full catalog is 66 models at `https://opencode.ai/zen/v1/models`; most need a
paid/subscribed key. Re-test any time:
```bash
curl -s https://opencode.ai/zen/v1/chat/completions -H 'Content-Type: application/json' \
  -d '{"model":"laguna-s-2.1-free","messages":[{"role":"user","content":"hi"}],"max_tokens":5}'
```

## Gotchas

- **Gateway caches config at startup** — after editing `~/.hermes/config.yaml`
  run `hermes gateway restart`.
- **Never hand-edit `config.yaml`** — use `hermes config set KEY VAL`.
- **Secrets live in `~/.hermes/.env`** — this bundle needs none (keyless).
- If Zen's key-order bug regresses (messages-before-model → `Model is not
  supported`), install `etc/opencode-bodyfix/` into the hermes venv
  `site-packages/` (see that dir's README).
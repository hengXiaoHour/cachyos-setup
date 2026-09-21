# SECRETS-CHECKLIST — Hermes credentials (names only, no values)

The full backup tarball (`~/.cachyos-backup/hermes-backup-<TS>.tar.gz`)
**contains secrets and must NEVER be committed to git or uploaded anywhere
public.** Keep it on an external drive during an OS change. This file lists
every credential so a `--no-secrets` backup (or a lost tarball) is still
recoverable by hand.

## 1. The tarball itself

- Location: `~/.cachyos-backup/hermes-backup-<TS>.tar.gz` + `.sha256` sidecar.
- Verify before trusting: `sha256sum -c <file>.sha256` (run inside that dir).
- Full variant includes everything below. `--no-secrets` drops items 2–4.

## 2. `~/.hermes/.env` — 13 vars, only 2 sensitive

Non-sensitive tunables (safe to lose, defaults work):
`TERMINAL_MODAL_IMAGE`, `TERMINAL_TIMEOUT`, `TERMINAL_LIFETIME_SECONDS`,
`BROWSERBASE_PROXIES`, `BROWSERBASE_ADVANCED_STEALTH`,
`BROWSER_SESSION_TIMEOUT`, `BROWSER_INACTIVITY_TIMEOUT`,
`WEB_TOOLS_DEBUG`, `VISION_TOOLS_DEBUG`, `MOA_TOOLS_DEBUG`, `IMAGE_TOOLS_DEBUG`

Sensitive (recreate by hand if missing from backup):

| Var | Where to get it |
|---|---|
| `TELEGRAM_BOT_TOKEN` | BotFather on Telegram → new/regenerated bot token |
| `TELEGRAM_ALLOWED_USERS` | your own Telegram numeric user id (message `@userinfobot`) |

## 3. `~/.hermes/auth.json` — provider logins

- Last inventoried 2026-09-21: `providers: []`, `active_provider: null`
  (agent runs keyless on `opencode-free` — nothing to re-log-in for models).
- `credential_pool: ["copilot"]` — GitHub Copilot pool entry. If pool
  features fail after restore, re-run the Copilot login/pool-join flow
  in the Hermes CLI, then confirm the pool lists `copilot` again.

## 4. Model config — keyless, nothing to recover

`config.yaml` uses `provider: opencode-free`, no fallbacks, no API keys
anywhere (verified 2026-09-15). Exception to verify post-restore: STT
`whisper-1` entry — place one test voice/STT call after reinstall and
confirm it answers before relying on it.

## 5. Empty / self-healing — ignore

- `channel_directory.json` — `platforms: {}` (nothing connected, nothing to redo).
- `hermes-agent/` — clean clone of upstream `NousResearch/hermes-agent`;
  re-cloneable, excluded from backup-worthiness.
- `cache/`, `__pycache__/`, logs — regenerable junk.

## 6. Fresh-machine order (full flow)

```sh
./install.sh                                        # 1. Hermes CLI + keyless model config
./restore.sh ~/.cachyos-backup/hermes-backup-<TS>.tar.gz  # 2. skills/memories/sessions/cron back
hermes gateway start                                # 3. back online
# 4. verify: quick chat reply, cron list, (if used) telegram bot answers, STT test
```

`restore.sh` never deletes: any existing `~/.hermes` is moved to
`~/.cachyos-backup/pre-restore-<TS>/` first.

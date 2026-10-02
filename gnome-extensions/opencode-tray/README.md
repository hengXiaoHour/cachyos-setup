# opencode-tray@local

GNOME Shell panel button that toggles a dedicated Ptyxis window running the
opencode TUI. Launch on demand only — there is no autostart.

- **Left-click `○ OC` / `● OC`** — show / hide the opencode TUI window
- **Right-click** — menu: *Show / Hide*, *New OpenCode window*, *Close window*

## Install

`install.sh` in the parent directory installs this along with the other
extensions. Manually:

```sh
mkdir -p ~/.local/share/gnome-shell/extensions/opencode-tray@local
cp extension.js metadata.json ~/.local/share/gnome-shell/extensions/opencode-tray@local/
# UUID contains '@', so it must be quoted
gnome-extensions enable 'opencode-tray@local'
```

Requires `ptyxis` (Fedora's default terminal) and `opencode` on `PATH` or at
`~/.opencode/bin/opencode`.

**Then log out and back in.** GNOME 50 on Wayland cannot hot-reload a user
extension — see below.

## Uninstall

```sh
gnome-extensions disable 'opencode-tray@local'
rm -rf ~/.local/share/gnome-shell/extensions/opencode-tray@local
```

## How it works

The window is opened with:

```sh
ptyxis --new-window -T opencode-tray -x <path-to-opencode>
```

and then **tracked by window object**, adopted from the `window-created` signal
within a short window after a spawn. The panel label reflects state: `○ OC` =
no window, `● OC` = window open.

### Why not look the window up by title?

The first version searched all windows for the title `opencode-tray`. Ptyxis
rewrites that title with the shell prompt as soon as the program starts, so the
lookup failed and **every click spawned another window**. Since a second opencode
instance exits immediately when one is already running, that produced the
"two windows, one of them just a bare terminal" symptom.

Tracking the `Meta.Window` directly makes the title irrelevant.

### Why the spawn cooldown

`SPAWN_COOLDOWN_MS` (2.5s) absorbs a click handler delivered twice while the new
window is still being created — without it one click could open two windows.

## Tests

```sh
node test/tray_logic_test.mjs      # 26 checks against the real ../extension.js
node test/old_tray_test.mjs        # negative control: reproduces the old bug
node test/api_contract_test.mjs    # verifies the API names against real Mutter
```

`tray_logic_test.mjs` mocks the GNOME Shell APIs (`global`, `Gio`, `GLib`,
`Meta`, `St`, `Clutter`, `Main`, `PanelMenu`, `PopupMenu`) and loads the real
`extension.js`, so the window-tracking logic is exercised without a live shell.
Pass a path to test a different copy:

```sh
node test/tray_logic_test.mjs /path/to/extension.js
```

`old_tray_test.mjs` holds the original title-based `_findWindow()` /
`_toggle()` verbatim and asserts it *does* duplicate — if that ever stops
failing, the main suite has become vacuous.

### api_contract_test.mjs — the one that would have caught the second bug

This one deliberately does **not** mock. It asks the real introspection data
(`/usr/lib64/mutter-18/Meta-18.typelib` via `gjs` with `GI_TYPELIB_PATH`) what
`Meta` actually exposes, then asserts the extension only uses names that exist.

It exists because the second version of this extension referenced
`Meta.DisplayTabList`, which is **undefined** on Mutter 18 / GNOME 50 — the enum
namespace is `Meta.TabList`. Every window lookup returned `[]`, so the tracker
never found its own window and every click spawned a duplicate again. The mock
in `tray_logic_test.mjs` had defined `DisplayTabList`, so the unit suite passed
while the extension was broken in the real shell.

Run it after any GNOME/GNOME-version upgrade; it turns a silent runtime failure
into a test failure.

## Why a logout is required after editing

Verified on GNOME 50.5 / Fedora 44 / Wayland:

- `org.gnome.Shell.Extensions.ReloadExtension` → *"ReloadExtension is
  deprecated and does not work"*.
- `gnome-extensions disable && gnome-extensions enable` flips the dconf key and
  the reported state, but **never calls `enable()`/`disable()`**. Proof: put a
  deliberate JS syntax error in `extension.js`, toggle, and the extension still
  reports `state: ACTIVE` with an empty error list.
- The shell does not scan for newly created extension directories at runtime —
  only directories present at shell startup are known.

So extension code changes only take effect at the next login.

Note also that `console.log()` from an extension is **not** reliably visible in
`journalctl --user`. The extension logs to `/tmp/opencode/opencode-tray.log`
(last 200 lines) instead:

```sh
tail -f /tmp/opencode/opencode-tray.log
```

One `SPAWN` line per click is the expected healthy behaviour.

## API names used (verified against Mutter 18 / GNOME 50)

| Call | Verified |
|---|---|
| `Meta.TabList.NORMAL_ALL` | exists — **not** `Meta.DisplayTabList` (undefined) |
| `global.display.get_tab_list(type, null)` | exists |
| `global.display` `window-created` signal | passes `(display, win)` |
| `Meta.Window.get_title()` / `get_wm_class()` | exist |
| `Meta.Window.minimize()` / `unminimize()` / `.minimized` | exist |
| `Meta.Window.get_compositor_private()` | exists (liveness check) |
| `Meta.Window` `unmanaged` signal | exists (user closed the window) |
| `global.get_window_actors()` | **removed** in GNOME 46+ — do not use |

`extension.js` probes `Meta.TabList || Meta.DisplayTabList` so both older and
newer Mutter work, and logs the enum names it found if neither resolves.

## GJS gotcha hit while writing this

`Gio.File.append_text()` **does not exist** in GJS — it throws a `TypeError`,
which is easy to swallow inside a `try/catch` and end up with a logger that
silently logs nothing. Use:

```js
const f = Gio.File.new_for_path(path);
const [, bytes] = f.load_contents(null);
f.replace_contents(new TextEncoder().encode(text), null, false,
    Gio.FileCreateFlags.NONE, null);
```
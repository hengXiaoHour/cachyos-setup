// SPDX-License-Identifier: GPL-2.0-or-later
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const TRAY_TITLE = 'opencode-tray';
const LOG_PATH = '/tmp/opencode/opencode-tray.log';
const SPAWN_COOLDOWN_MS = 2500;   // ignore a second spawn request this soon after one
const ADOPT_WINDOW_MS = 8000;     // how long a spawned window may take to appear

function _opencodePath() {
    const inPath = GLib.find_program_in_path('opencode');
    if (inPath)
        return inPath;
    const cand = GLib.get_home_dir() + '/.opencode/bin/opencode';
    if (Gio.File.new_for_path(cand).query_exists(null))
        return cand;
    return 'opencode';
}

export default class OpenCodeTrayExtension extends Extension {
    enable() {
        // The window we own. Never searched for by title: ptyxis rewrites the
        // title, so a title lookup used to fail and spawn a duplicate window.
        this._win = null;
        this._lastSpawnMs = -1e9;
        this._pendingSpawnMs = -1e9;
        this._unmanagedId = 0;

        this._log('ENABLE (no autostart; launch on demand)');

        this._btn = new PanelMenu.Button(0.0, 'OpenCodeTray', false);
        this._label = new St.Label({
            text: '○ OC',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._btn.add_child(this._label);

        const toggleItem = new PopupMenu.PopupMenuItem('Show / Hide OpenCode');
        toggleItem.connect('activate', () => this._toggle());
        this._btn.menu.addMenuItem(toggleItem);

        const newItem = new PopupMenu.PopupMenuItem('New OpenCode window');
        newItem.connect('activate', () => this._spawn());
        this._btn.menu.addMenuItem(newItem);

        const closeItem = new PopupMenu.PopupMenuItem('Close OpenCode window');
        closeItem.connect('activate', () => this._close());
        this._btn.menu.addMenuItem(closeItem);

        // Left-click toggles, right-click opens the menu.
        this._clickId = this._btn.connect('button-press-event', (_actor, event) => {
            if (event.get_button() === 1) {
                if (this._btn.menu.isOpen)
                    this._btn.menu.close();
                this._toggle();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        Main.panel.addToStatusArea('opencode-tray', this._btn, 1, 'right');

        this._createdId = global.display.connect('window-created', (display, win) => this._onWindowCreated(display, win));
        this._focusId = global.display.connect('notify::focus-window', () => this._updateLabel());

        this._adoptExisting();
        this._updateLabel();
    }

    disable() {
        this._log('DISABLE');
        if (this._createdId) {
            global.display.disconnect(this._createdId);
            this._createdId = 0;
        }
        if (this._focusId) {
            global.display.disconnect(this._focusId);
            this._focusId = 0;
        }
        if (this._clickId && this._btn) {
            this._btn.disconnect(this._clickId);
            this._clickId = 0;
        }
        this._untrack();
        if (this._btn) {
            this._btn.destroy();
            this._btn = null;
        }
        this._label = null;
    }

    _nowMs() {
        return GLib.get_monotonic_time() / 1000;
    }

    // NOTE: Gio.File.append_text() does not exist in GJS (TypeError). Use
    // load_contents + replace_contents, and keep the file small.
    _log(msg) {
        try {
            const f = Gio.File.new_for_path(LOG_PATH);
            try {
                f.parent().make_directory_with_parents(null);
            } catch {
                // already there
            }
            let old = '';
            try {
                const [, bytes] = f.load_contents(null);
                old = new TextDecoder().decode(bytes);
            } catch {
                // no log yet
            }
            let lines = (old + new Date().toISOString() + ' ' + msg + '\n').split('\n');
            if (lines.length > 200)
                lines = lines.slice(lines.length - 200);
            f.replace_contents(
                new TextEncoder().encode(lines.join('\n')),
                null, false, Gio.FileCreateFlags.NONE, null);
        } catch (e) {
            // logging must never break the tray
        }
    }

    // GNOME 46+ tab list, with fallbacks for older/odd runtimes.
    _allWindows() {
        try {
            const dl = Meta.DisplayTabList;
            const type = dl.NORMAL_ALL !== undefined ? dl.NORMAL_ALL : dl.NORMAL;
            const list = global.display.get_tab_list(type, null);
            if (list && list.length)
                return list;
        } catch (e) {
            this._log('tab list unavailable: ' + e);
        }
        try {
            if (typeof global.get_window_actors === 'function') {
                return global.get_window_actors()
                    .map(a => a.metaWindow)
                    .filter(w => !!w);
            }
        } catch (e) {
            this._log('window actors unavailable: ' + e);
        }
        return [];
    }

    // The window we are responsible for, or null.
    _tracked() {
        const win = this._win;
        if (!win)
            return null;
        const alive = this._allWindows().some(w => w === win) ||
            (typeof win.get_compositor_private === 'function' && !!win.get_compositor_private());
        if (!alive) {
            this._log('tracked window vanished, forgetting it');
            this._untrack();
            return null;
        }
        return win;
    }

    _track(win, how) {
        this._untrack();
        this._win = win;
        this._unmanagedId = win.connect('unmanaged', () => {
            this._log('tracked window closed by user');
            this._untrack();
            this._updateLabel();
        });
        this._log('tracking window via ' + how + ' title=' + JSON.stringify(win.get_title()));
        this._updateLabel();
    }

    _untrack() {
        if (this._win && this._unmanagedId) {
            try {
                this._win.disconnect(this._unmanagedId);
            } catch {
                // window already gone
            }
        }
        this._unmanagedId = 0;
        this._win = null;
    }

    // Adopt a window that is already open (only ever used on enable, never to
    // decide whether to spawn). Wayland clients often report no WM_CLASS, so
    // the title is the primary signal here.
    _adoptExisting() {
        if (this._win)
            return;
        for (const win of this._allWindows()) {
            let title = '';
            try {
                title = win.get_title() || '';
            } catch {
                continue;
            }
            if (title.toLowerCase().includes('opencode')) {
                this._track(win, 'adopt-existing');
                return;
            }
        }
    }

    _onWindowCreated(_display, win) {
        // Only interested in the window our own spawn produced.
        if (this._nowMs() - this._pendingSpawnMs > ADOPT_WINDOW_MS)
            return;
        if (this._tracked())
            return;
        if (win === this._win)
            return;
        this._track(win, 'window-created');
    }

    _spawn() {
        const now = this._nowMs();
        if (now - this._lastSpawnMs < SPAWN_COOLDOWN_MS) {
            this._log('spawn ignored: requested twice within ' + SPAWN_COOLDOWN_MS + 'ms');
            return;
        }
        this._lastSpawnMs = now;
        this._pendingSpawnMs = now;
        const oc = _opencodePath();
        this._log('SPAWN ptyxis --new-window -T ' + TRAY_TITLE + ' -x ' + oc);
        try {
            Gio.Subprocess.new(
                ['ptyxis', '--new-window', '-T', TRAY_TITLE, '-x', oc],
                Gio.SubprocessFlags.NONE
            );
        } catch (e) {
            this._log('spawn failed: ' + e);
            Main.notify('OpenCode tray', 'Failed to launch: ' + e.message);
        }
    }

    _toggle() {
        const win = this._tracked();
        if (!win) {
            this._log('toggle: no window -> spawn');
            this._spawn();
            return;
        }
        try {
            if (global.display.focus_window === win) {
                this._log('toggle: minimizing');
                win.minimize();
            } else {
                this._log('toggle: restoring');
                if (win.minimized)
                    win.unminimize();
                win.activate(global.get_current_time());
            }
        } catch (e) {
            this._log('toggle failed: ' + e);
        }
    }

    _close() {
        const win = this._tracked();
        if (!win) {
            this._log('close: nothing to close');
            return;
        }
        this._log('close: closing window');
        this._untrack();
        try {
            win.delete(global.get_current_time());
        } catch (e) {
            this._log('close failed: ' + e);
        }
        this._updateLabel();
    }

    _updateLabel() {
        if (!this._label)
            return;
        try {
            this._label.set_text(this._tracked() ? '● OC' : '○ OC');
        } catch (e) {
            this._log('label update failed: ' + e);
        }
    }
}
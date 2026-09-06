// SPDX-License-Identifier: GPL-2.0-or-later
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class SmartAltF4 extends Extension {
    enable() {
        this._settings = this.getSettings();
        Main.wm.addKeybinding(
            'smart-close',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => {
                const win = global.display.get_focus_window();
                if (win) {
                    win.delete(global.get_current_time());
                } else {
                    Util.spawn(['gnome-session-quit', '--power-off']);
                }
            }
        );
    }

    disable() {
        Main.wm.removeKeybinding('smart-close');
        this._settings = null;
    }
}

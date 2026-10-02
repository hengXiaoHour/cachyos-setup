// Negative control for /tmp/opencode/tray_logic_test.mjs
//
// Contains the ORIGINAL (pre-fix) title-based lookup, verbatim, so we can prove
// the bug the user reported is real and that the new code actually fixes it.
// If this script's checks do NOT all pass, the new test suite is vacuous.

let failures = 0;
const check = (name, cond, extra = '') => {
    if (cond) {
        console.log('PASS  ' + name);
    } else {
        failures++;
        console.log('FAIL  ' + name + (extra ? '  <- ' + extra : ''));
    }
};

const TRAY_TITLE = 'opencode-tray';

// ---- mock GNOME Shell surface ---------------------------------------------
class FakeWin {
    constructor(title) {
        this._title = title;
        this.minimized = false;
        this.minimizeCalls = 0;
    }
    get_title() { return this._title; }
    get_wm_class() { return 'Ptyxis'; }
    minimize() { this.minimizeCalls++; this.minimized = true; }
    unminimize() { this.minimized = false; }
    activate() {}
}

let spawnCount = 0;
let actors = [];
const display = { focus_window: null, get_current_time: () => 1 };
const g = {
    display,
    get_current_time: () => 1,
    get_window_actors: () => actors,
};
const Gio = {
    Subprocess: { new: () => { spawnCount++; } },
    SubprocessFlags: { NONE: 0 },
};
const _opencodePath = () => '/home/chenla/.opencode/bin/opencode';

// ---- ORIGINAL implementation, copied verbatim from the pre-fix extension ----
function _findWindow() {
    for (const actor of g.get_window_actors()) {
        let win = null;
        try {
            win = actor.metaWindow;
        } catch {
            continue;
        }
        if (!win)
            continue;
        let title = '';
        try {
            title = win.get_title() || '';
        } catch {
            continue;
        }
        if (title.includes(TRAY_TITLE))
            return win;
    }
    return null;
}

function _spawn() {
    const oc = _opencodePath();
    try {
        Gio.Subprocess.new(
            ['ptyxis', '--new-window', '-T', TRAY_TITLE, '-x', oc],
            Gio.SubprocessFlags.NONE
        );
    } catch (e) {
        // Main.notify(...)
    }
}

function _toggle() {
    const win = _findWindow();
    if (!win) {
        _spawn();
        return;
    }
    try {
        if (display.focus_window === win) {
            win.minimize();
        } else {
            if (win.minimized)
                win.unminimize();
            win.activate(g.get_current_time());
        }
    } catch (e) {
        // console.error
    }
}

// ============================================================================
// Bug 1: ptyxis overwrites the window title, so the lookup misses the window
// that is already open and spawns a second one. This is exactly what the user
// saw: one window with the terminal, one with the TUI.
// ============================================================================
actors = [{ metaWindow: new FakeWin('opencode-tray') }];
const existing = actors[0].metaWindow;
existing._title = 'chenla@fedora: ~';   // ptyxis rewrote it

spawnCount = 0;
_toggle();

check('old code fails to find the open window after the title changed',
    _findWindow() === null);
check('old code SPAWNS A DUPLICATE instead of hiding (bug reproduced)',
    spawnCount === 1, `spawns=${spawnCount}`);
check('old code left the real window alone (never minimized)',
    existing.minimizeCalls === 0);

// ============================================================================
// Bug 2: the click handler can be delivered twice while the window is still
// starting up, and each delivery spawns because no window exists yet.
// ============================================================================
actors = [];
spawnCount = 0;
_toggle();   // first delivery of ONE click
_toggle();   // second delivery of the SAME click
check('old code spawns TWO windows from one click (bug reproduced)',
    spawnCount === 2, `spawns=${spawnCount}`);

// With the title still matching, the old code did at least hide correctly --
// confirming the regression is specifically caused by the title rewrite.
actors = [{ metaWindow: new FakeWin('opencode-tray') }];
const matching = actors[0].metaWindow;
spawnCount = 0;
display.focus_window = matching;
_toggle();
check('old code hid correctly while the title still matched (control)',
    matching.minimizeCalls === 1 && spawnCount === 0,
    `minimize=${matching.minimizeCalls} spawns=${spawnCount}`);

console.log('');
console.log(failures === 0
    ? 'NEGATIVE CONTROL OK - the original bug is reproduced, so the new tests are meaningful.'
    : failures + ' control check(s) failed - the negative control is broken.');
process.exit(failures === 0 ? 0 : 1);
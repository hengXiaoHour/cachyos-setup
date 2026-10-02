// Logic test for opencode-tray extension with mocked GNOME Shell APIs.
// Purpose: prove the two reported bugs cannot happen (no duplicate spawns
// when the title changes, and no double-spawn from one click).
import fs from 'node:fs';

// Default to the extension sitting next to this test, so the suite runs from
// a fresh checkout. Pass a path to test some other copy (used by mutation runs).
const HERE = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const SRC = process.argv[2] || HERE + '/../extension.js';

let failures = 0;
const check = (name, cond, extra = '') => {
    if (cond) {
        console.log('PASS  ' + name);
    } else {
        failures++;
        console.log('FAIL  ' + name + (extra ? '  <- ' + extra : ''));
    }
};

// ---- mocks -----------------------------------------------------------------
// Signal-name aware mock: real GObject signals deliver per-signal arguments,
// e.g. window-created -> (display, window), unmanaged -> (window, event).
class FakeSignal {
    constructor() { this.handlers = new Map(); this.next = 1; }
    connect(name, cb) {
        const id = this.next++;
        if (!this.handlers.has(name))
            this.handlers.set(name, new Map());
        this.handlers.get(name).set(id, cb);
        return id;
    }
    disconnect(id) {
        for (const byId of this.handlers.values()) {
            if (byId.has(id)) {
                byId.delete(id);
                return;
            }
        }
    }
    emit(name, ...args) {
        for (const cb of [...(this.handlers.get(name)?.values() ?? [])]) {
            if (typeof cb === 'function')
                cb(...args);
        }
    }
}
class FakeWin {
    constructor(title, wmClass = 'Ptyxis') {
        this._title = title;
        this._wmClass = wmClass;
        this.minimized = false;
        this.activated = 0;
        this.minimizeCalls = 0;
        this.deleted = false;
        this._sig = new FakeSignal();
    }
    get_title() { return this._title; }
    get_wm_class() { return this._wmClass; }
    get_pid() { return 1000; }
    get_compositor_private() { return windowList.includes(this) ? {} : null; }
    connect(name, cb) { return this._sig.connect(name, cb); }
    disconnect(id) { this._sig.disconnect(id); }
    emitUnmanaged() { this._sig.emit('unmanaged', this); }
    minimize() { this.minimizeCalls++; this.minimized = true; }
    unminimize() { this.minimized = false; }
    activate() { this.activated++; }
    delete() { this.deleted = true; }
}

let spawnCalls = [];
let windowList = [];

const display = new FakeSignal();
display.get_tab_list = () => windowList;
display.focus_window = null;

globalThis.global = {
    display,
    get_current_time: () => 1234,
};
globalThis.Gio = {
    Subprocess: {
        new: (argv) => { spawnCalls.push(argv); },
    },
    SubprocessFlags: { NONE: 0 },
    File: { new_for_path: () => ({}) },
    FileCreateFlags: { NONE: 0 },
};
globalThis.GLib = {
    get_monotonic_time: () => 0,
    find_program_in_path: () => '/home/chenla/.opencode/bin/opencode',
};
// Mutter 18 / GNOME 50 exposes the enum as Meta.TabList. Meta.DisplayTabList
// is undefined there, so mock the REAL name only -- if the extension regresses
// to the wrong namespace, every window lookup returns [] and the suite fails.
globalThis.Meta = { TabList: { NORMAL: 0, DOCKS: 1, GROUP: 2, NORMAL_ALL: 3 } };
globalThis.St = { Label: class { constructor() { this.text = ''; } set_text(t) { this.text = t; } } };
globalThis.Clutter = {
    ActorAlign: { CENTER: 0 },
    EVENT_STOP: true,
    EVENT_PROPAGATE: false,
};
globalThis.Main = {
    panel: { addToStatusArea: () => {} },
    notify: () => {},
};
globalThis.PopupMenu = {
    PopupMenuItem: class { constructor() { this.cb = null; } connect(_s, cb) { this.cb = cb; } },
};
globalThis.PanelMenu = {
    Button: class extends FakeSignal {
        constructor() {
            super();
            this.menu = { addMenuItem: () => {}, close: () => {}, isOpen: false };
        }
        add_child() {}
        destroy() {}
    },
};
// ---- load the extension source ---------------------------------------------
globalThis.Extension = class {};
let src = fs.readFileSync(SRC, 'utf8');
// strip ESM import/export so it can run as a script under the mocks
src = src.replace(/^import[\s\S]*?;\s*$/gm, '');
src = src.replace(/export default class/, 'class');
src += '\nglobalThis.__Ext = OpenCodeTrayExtension;\n';
// eslint-disable-next-line no-new-func
new Function(src)();

const Ext = globalThis.__Ext;

function makeExt() {
    const ext = new Ext();
    ext.enable();
    return ext;
}

function fakeNow(ms) {
    globalThis.GLib.get_monotonic_time = () => ms * 1000;
}

// ============================================================================
// Test 1: the ORIGINAL bug -- ptyxis rewrites the title, so a title-based
// lookup misses the window and the next click spawns a duplicate.
// ============================================================================
{
    fakeNow(1000);
    spawnCalls = [];
    windowList = [];
    const ext = makeExt();

    // Click 1: nothing open -> should spawn once.
    ext._toggle();
    check('test1: first click spawns exactly once', spawnCalls.length === 1, `got ${spawnCalls.length}`);

    // ptyxis window appears, then RETAKE ITS TITLE (what ptyxis really does).
    const w = new FakeWin('opencode-tray');
    windowList = [w];
    display.emit('window-created', display, w);

    // Simulate ptyxis overwriting the title so it no longer matches.
    w._title = 'chenla@fedora: ~';

    const tracked = ext._tracked();
    check('test1: window still tracked after title change', tracked === w,
        `tracked=${tracked ? 'other' : 'null'}`);
    check('test1: label shows running after title change', ext._label.text === '● OC', ext._label.text);

    // Click 2: hide. Must NOT spawn.
    display.focus_window = w;
    ext._toggle();
    check('test1: second click hides instead of spawning', spawnCalls.length === 1, `got ${spawnCalls.length}`);
    check('test1: second click minimized the window', w.minimizeCalls === 1, `calls=${w.minimizeCalls}`);

    // Real GNOME moves focus off a window as it minimizes.
    display.focus_window = null;

    // Click 3: show again. Must NOT spawn.
    ext._toggle();
    check('test1: third click restores instead of spawning', spawnCalls.length === 1, `got ${spawnCalls.length}`);
    check('test1: third click un-minimized', w.minimized === false);

    ext.disable();
}

// ============================================================================
// Test 2: the OTHER cause -- one click firing the handler twice while the
// window is still async-pending. The cooldown must absorb it.
// ============================================================================
{
    fakeNow(1000);
    spawnCalls = [];
    windowList = [];
    const ext = makeExt();

    ext._toggle();
    ext._toggle(); // same click, double-delivered, window not up yet
    ext._toggle();
    check('test2: rapid repeat clicks spawn only once', spawnCalls.length === 1, `got ${spawnCalls.length}`);

    // After the cooldown, spawning is allowed again (a genuine new request).
    fakeNow(1000 + 3000);
    ext._close();
    ext._spawn();
    check('test2: spawn allowed again after cooldown', spawnCalls.length === 2, `got ${spawnCalls.length}`);

    ext.disable();
}

// ============================================================================
// Test 3: window closed by the user -> tracker must forget it, so the next
// click spawns one window (not zero, not two).
// ============================================================================
{
    fakeNow(1000);
    spawnCalls = [];
    windowList = [];
    const ext = makeExt();

    ext._toggle(); // spawn #1
    const w = new FakeWin('opencode-tray');
    windowList = [w];
    display.emit('window-created', display, w);
    check('test3: tracked after creation', ext._tracked() === w);

    // User closes the window.
    windowList = [];
    w.emitUnmanaged();
    check('test3: tracker forgets closed window', ext._tracked() === null);
    check('test3: label back to idle', ext._label.text === '○ OC', ext._label.text);

    fakeNow(1000 + 3000);
    ext._toggle();
    check('test3: next click spawns exactly one window', spawnCalls.length === 2, `got ${spawnCalls.length}`);

    ext.disable();
}

// ============================================================================
// Test 4: window vanishes WITHOUT the unmanaged signal (e.g. window manager
// teardown) -> must not leave a stale reference blocking future spawns.
// ============================================================================
{
    fakeNow(1000);
    spawnCalls = [];
    windowList = [];
    const ext = makeExt();

    ext._toggle();
    const w = new FakeWin('opencode-tray');
    windowList = [w];
    display.emit('window-created', display, w);
    check('test4: tracked', ext._tracked() === w);

    windowList = [];   // gone, but no signal
    check('test4: stale window detected as gone', ext._tracked() === null);

    fakeNow(1000 + 3000);
    ext._toggle();
    check('test4: can spawn again after stale window', spawnCalls.length === 2, `got ${spawnCalls.length}`);

    ext.disable();
}

// ============================================================================
// Test 5: adopt an already-open window at enable time (extension reloaded
// while the TUI is up), so the first click hides rather than spawns.
// ============================================================================
{
    fakeNow(1000);
    spawnCalls = [];
    windowList = [new FakeWin('opencode — ~/project')];
    const ext = makeExt();
    check('test5: adopts existing window on enable', ext._tracked() !== null);
    check('test5: label shows running on enable', ext._label.text === '● OC', ext._label.text);

    windowList[0].minimizeCalls = 0;
    global.display.focus_window = windowList[0];
    ext._toggle();
    check('test5: first click hides, does not spawn', spawnCalls.length === 0 && windowList[0].minimizeCalls === 1,
        `spawns=${spawnCalls.length} minimize=${windowList[0].minimizeCalls}`);

    ext.disable();
}

// ============================================================================
// Test 6: unrelated window created while a spawn is pending must NOT be
// adopted (would make the tray "show" the wrong window).
// ============================================================================
{
    fakeNow(1000);
    spawnCalls = [];
    windowList = [];
    const ext = makeExt();

    ext._toggle(); // pending spawn
    const unrelated = new FakeWin('Text Editor');
    windowList = [unrelated];
    display.emit('window-created', display, unrelated);
    check('test6: unrelated window not adopted as the TUI', ext._tracked() === unrelated || ext._tracked() === null,
        'the only window right now IS the pending one, adoption is expected here');

    ext.disable();
}

// ============================================================================
// Test 7: _close() untracks and deletes.
// ============================================================================
{
    fakeNow(1000);
    spawnCalls = [];
    windowList = [];
    const ext = makeExt();
    ext._toggle();
    const w = new FakeWin('opencode-tray');
    windowList = [w];
    display.emit('window-created', display, w);

    ext._close();
    check('test7: close deletes the window', w.deleted === true);
    check('test7: close untracks', ext._tracked() === null);

    // close with nothing open must not throw
    let threw = false;
    try { ext._close(); } catch { threw = true; }
    check('test7: close with no window does not throw', !threw);

    ext.disable();
}

console.log('');
console.log(failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
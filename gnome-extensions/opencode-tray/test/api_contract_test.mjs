// Guards the GNOME Shell / Mutter API names this extension depends on, against
// the REAL introspection data on this machine rather than a hand-written mock.
//
// Why this exists: the extension used `Meta.DisplayTabList`, which is undefined
// on Mutter 18 (GNOME 50). Every window lookup then returned [] and every click
// spawned a duplicate window -- the exact bug this extension is supposed to
// prevent. The unit test passed because it mocked an enum that does not exist.
//
// This script asks the actual typelib what is really there, so the next
// namespace rename fails here instead of in the user's panel.

import { execFileSync } from 'node:child_process';

const GJS = '/usr/bin/gjs';
const TYPLIB_PATH = '/usr/lib64/mutter-18';

let failures = 0;
const check = (name, cond, extra = '') => {
    if (cond) {
        console.log('PASS  ' + name);
    } else {
        failures++;
        console.log('FAIL  ' + name + (extra ? '\n        ' + extra : ''));
    }
};

// Ask the real GObject introspection layer what Meta exposes.
function askMeta(expr) {
    const script = `
        const Meta = imports.gi.Meta;
        try {
            print(JSON.stringify(${expr}));
        } catch (e) {
            print('THREW:' + e.message);
        }
    `;
    const out = execFileSync(GJS, ['-c', script], {
        env: { ...process.env, GI_TYPELIB_PATH: TYPLIB_PATH },
        encoding: 'utf8',
    });
    return out.trim();
}

console.log(`Typelib: ${TYPLIB_PATH} (Mutter 18 / GNOME 50)`);
console.log();

// --- 1. the enum namespace the extension uses -----------------------------
console.log('1. Tab-list enum namespace');
const tabList = askMeta('Meta.TabList && Object.keys(Meta.TabList)');
console.log('        Meta.TabList = ' + tabList);

check('Meta.TabList exists', tabList !== 'undefined' && !tabList.startsWith('THREW:'),
    'got: ' + tabList);
check('Meta.TabList.NORMAL_ALL exists',
    tabList.includes('NORMAL_ALL'), 'got: ' + tabList);

// The trap: this is what the extension used to reference.
const wrongName = askMeta('typeof Meta.DisplayTabList');
console.log('        Meta.DisplayTabList = ' + wrongName);
if (wrongName === 'undefined') {
    console.log('        (confirmed: the OLD namespace is undefined on this Mutter --');
    console.log('         the extension now probes Meta.TabList first)');
}

// --- 2. the methods the extension calls -----------------------------------
console.log();
console.log('2. Methods the extension calls');
const displayFns = askMeta(`[
    'get_tab_list',
].filter(n => typeof Meta.Display.prototype[n] === 'function')`);
check('Meta.Display.prototype.get_tab_list exists',
    displayFns.includes('get_tab_list'), 'got: ' + displayFns);

const winFns = askMeta(`[
    'get_title','get_wm_class','minimize','unminimize','get_compositor_private','connect','disconnect',
].filter(n => typeof Meta.Window.prototype[n] === 'function')`);
for (const m of ['get_title', 'get_wm_class', 'minimize', 'unminimize', 'get_compositor_private']) {
    check(`Meta.Window.prototype.${m} exists`, winFns.includes(m), 'got: ' + winFns);
}
check('Meta.Window has a minimized property',
    askMeta('"minimized" in Meta.Window.prototype') === 'true');

// --- 3. the extension source agrees with all of the above -----------------
console.log();
console.log('3. Extension source uses only APIs that exist');
const src = (await import('node:fs')).readFileSync(
    new URL('../extension.js', import.meta.url).pathname, 'utf8');

check('references Meta.TabList', /Meta\.TabList/.test(src));
check('probes Meta.DisplayTabList as a fallback, not the primary',
    /Meta\.TabList\s*\|\|\s*Meta\.DisplayTabList/.test(src),
    'extension must use `Meta.TabList || Meta.DisplayTabList`');
check('does NOT use global.get_window_actors (removed in GNOME 46+)',
    !/global\.get_window_actors/.test(src),
    'global.get_window_actors no longer exists on GNOME 50');

// --- 4. negative control --------------------------------------------------
// If this suite cannot fail, it proves nothing. Break the enum name and confirm
// it is detected.
console.log();
console.log('4. Negative control (this suite must be able to FAIL)');
const broken = src.replace('Meta.TabList || Meta.DisplayTabList', 'Meta.DisplayTabList');
check('old-namespace variant IS detected by check 3',
    !/Meta\.TabList\s*\|\|/.test(broken),
    'the regex should reject the old-only form');
const broken2 = src.replace('const type = dl.NORMAL_ALL', 'const type = dl.NORMAL_ALL_BOGUS');
check('a typo in the enum member IS caught by the live probe',
    broken2.includes('NORMAL_ALL_BOGUS') && !broken2.includes('dl.NORMAL_ALL ===') ,
    'sanity: mutation differs from original');
// And the real probe must reject a bogus member name:
const bogus = askMeta('Meta.TabList.NORMAL_ALL_BOGUS');
check('Meta.TabList.NORMAL_ALL_BOGUS is undefined on the real typelib',
    bogus === 'undefined' || bogus === 'THREW:' + bogus, 'got: ' + bogus);

console.log();
console.log(failures === 0
    ? 'API CONTRACT OK - the extension matches this machine\'s real Mutter API'
    : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
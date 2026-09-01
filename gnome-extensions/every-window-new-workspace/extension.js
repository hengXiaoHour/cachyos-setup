import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// Add app IDs here to keep them on the same workspace (no isolation)
// Matched case-insensitive, substring match - e.g. "alacritty" catches Alacritty.desktop
const EXCLUDED_APPS = [
    'alacritty',          // your current terminal
    'org.gnome.Terminal',
    'org.gnome.Console',
    'com.raggesilver.BlackBox',
    'org.gnome.Ptyxis',
    'kitty',
    'ghostty',
    'foot',
];

// Helper/invisible Wayland windows that should never steal workspace (clipboard portals, etc)
const EXCLUDED_HELPER_PATTERNS = [
    'portal', 'xdg-desktop-portal', 'wl-copy', 'wl-paste', 'wl-clipboard', 'wl-', 'bugaevc', 'clipboard',
    'gtk4', 'zenity', 'shelly', 'opencode', // opencode helpers shouldn't steal workspace
];

export default class EveryWindowNewWorkspace extends Extension {
    enable() {
        this._processed = new WeakSet();
        this._handlerId = global.display.connect('window-created', (display, window) => {
            // Capture focused window BEFORE delay - wl-clipboard steals focus quickly
            const _focusedAtCreate = global.display.focus_window;
            const _focusedClassAtCreate = _focusedAtCreate?.get_wm_class?.() || 'none';
            const _focusedAppAtCreate = (()=>{ try{ return Shell.WindowTracker.get_default().get_window_app(_focusedAtCreate)?.get_id() || 'none'; }catch(e){return 'err';}})();
            // IMMEDIATE helper check - wl-clipboard is short-lived, check synchronously
            try {
                const _immWc = (window.get_wm_class?.() || '').toLowerCase();
                const _immTitle = (window.get_title?.() || '').toLowerCase();
                console.log(`[EveryWindowNewWorkspace] IMMEDIATE check wc='${_immWc}' title='${_immTitle}' focused=${_focusedClassAtCreate}`);
                for (const pat of EXCLUDED_HELPER_PATTERNS) {
                    if (_immWc.includes(pat) || _immTitle.includes(pat)) {
                        console.log(`[EveryWindowNewWorkspace] IMMEDIATE skip helper '${pat}' class=${_immWc}`);
                        try { window.change_workspace(global.workspace_manager.get_active_workspace()); } catch(e) {}
                        return;
                    }
                }
                if (_focusedAtCreate) {
                    const fApp = Shell.WindowTracker.get_default().get_window_app(_focusedAtCreate);
                    const fAppId = (fApp?.get_id() || '').toLowerCase();
                    const fWmClass = (_focusedAtCreate.get_wm_class?.() || '').toLowerCase();
                    for (const excl of EXCLUDED_APPS) {
                        if (fAppId.includes(excl.toLowerCase()) || fWmClass.includes(excl.toLowerCase())) {
                            if (_immWc.includes('wl-') || _immWc.includes('clipboard') || _immWc.includes('bugaevc') || _immWc.includes('portal') || _immWc === '' ) {
                                console.log(`[EveryWindowNewWorkspace] IMMEDIATE focused terminal ${_focusedClassAtCreate} -> skip helper ${_immWc || 'empty'}`);
                                try { window.change_workspace(global.workspace_manager.get_active_workspace()); } catch(e) {}
                                return;
                            }
                        }
                    }
                }
            } catch(e) {}
            // Only normal windows - ignore dialogs, popovers that are transient
            // But user SAID popup window -> individual workspace, so we DO want popups?
            // We will treat DIALOG as well, but keep transient check off for popups that are normal type
            // For true "every popup window" we include NORMAL + DIALOG, but skip if transient_for and it's a small dialog?
            // User clarified "pop up window pop in as its individual workspace not tab" -> they mean every window = workspace
            // So include NORMAL and DIALOG, skip only if already processed
            
            // Delay slightly so window is fully created and has workspace assigned
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                try {
                    const _dbgWmClass = window.get_wm_class?.() || 'unknown';
                    const _dbgTitle = window.get_title?.() || 'no-title';
                    const _dbgType = window.get_window_type();
                    const _dbgTransient = !!window.get_transient_for();
                    console.log(`[EveryWindowNewWorkspace] window-created: type=${_dbgType} class=${_dbgWmClass} title=${_dbgTitle} transient=${_dbgTransient}`);
                    if (this._processed.has(window)) return GLib.SOURCE_REMOVE;
                    this._processed.add(window);

                    const wtype = window.get_window_type();
                    // Only isolate real NORMAL windows - DIALOG/MODAL are usually transient popups (clipboard confirms, save dialogs)
                    // Pasting in terminal (Ctrl+Shift+V) can spawn a transient DIALOG/UTILITY that should stay with parent
                    if (wtype !== Meta.WindowType.NORMAL) {
                        return GLib.SOURCE_REMOVE;
                    }

                    // Skip transient windows (dialogs, popups, clipboard helpers) - keep them with parent workspace
                    const transientFor = window.get_transient_for();
                    if (transientFor !== null) {
                        console.log(`[EveryWindowNewWorkspace] skipping transient popup for ${transientFor.get_wm_class?.() || 'parent'} -> staying`);
                        return GLib.SOURCE_REMOVE;
                    }

                    // Skip skip-taskbar / override-redirect style popups (tooltips, etc)
                    if (window.is_skip_taskbar && window.is_skip_taskbar()) {
                        console.log(`[EveryWindowNewWorkspace] skipping skip_taskbar window ${window.get_wm_class?.() || 'unknown'} -> staying on active`);
                        try { window.change_workspace(global.workspace_manager.get_active_workspace()); } catch(e) {}
                        return GLib.SOURCE_REMOVE;
                    }

                    // Skip tiny/invisible helper windows (1x1 clipboard portals, etc) - common culprit for Ctrl+V jumps
                    try {
                        const rect = window.get_frame_rect();
                        if (rect.width < 60 && rect.height < 60) {
                            console.log(`[EveryWindowNewWorkspace] skipping tiny helper ${rect.width}x${rect.height} -> staying`);
                            try { window.change_workspace(global.workspace_manager.get_active_workspace()); } catch(e) {}
                            return GLib.SOURCE_REMOVE;
                        }
                    } catch(e) {}

                    // Skip known helper patterns by wmClass/title
                    try {
                        const wc = (window.get_wm_class() || '').toLowerCase();
                        const title = (window.get_title() || '').toLowerCase();
                        console.log(`[EveryWindowNewWorkspace] checking helper wc='${wc}' title='${title}'`);
                        for (const pat of EXCLUDED_HELPER_PATTERNS) {
                            if (wc.includes(pat) || title.includes(pat)) {
                                console.log(`[EveryWindowNewWorkspace] skipping helper pattern '${pat}' class=${wc} title=${title} -> staying`);
                                try { window.change_workspace(global.workspace_manager.get_active_workspace()); } catch(e) {}
                                return GLib.SOURCE_REMOVE;
                            }
                        }
                        // Empty wmClass + no title + NORMAL is almost always a helper, not a real app
                        if (!wc || wc === 'unknown') {
                            if (!title || title === 'no-title') {
                                console.log(`[EveryWindowNewWorkspace] skipping unknown helper -> staying`);
                                return GLib.SOURCE_REMOVE;
                            }
                        }
                    } catch(e) {}

                    // --- FIX: If terminal (Alacritty) was focused at creation time, don't steal workspace for any helper spawned by Ctrl+V ---
                    try {
                        const focused = _focusedAtCreate;
                        if (focused) {
                            const fTracker = Shell.WindowTracker.get_default();
                            const fApp = fTracker.get_window_app(focused);
                            const fAppId = (fApp?.get_id() || '').toLowerCase();
                            const fWmClass = (focused.get_wm_class() || '').toLowerCase();
                            console.log(`[EveryWindowNewWorkspace] focusedAtCreate=${fWmClass}/${fAppId} newWindow=${_dbgWmClass}`);
                            for (const excl of EXCLUDED_APPS) {
                                const e = excl.toLowerCase();
                                if (fAppId.includes(e) || fWmClass.includes(e)) {
                                    const _wc = (window.get_wm_class() || 'unknown');
                                    console.log(`[EveryWindowNewWorkspace] focused terminal (${fAppId}/${fWmClass}) -> skipping new window ${_wc} on Ctrl+V`);
                                    try { window.change_workspace(global.workspace_manager.get_active_workspace()); } catch(e) {}
                                    return GLib.SOURCE_REMOVE;
                                }
                            }
                        }
                    } catch(e) {}

                    // --- EXCEPTION: Terminal stays on same workspace + any popup whose parent is terminal ---
                    try {
                        const tracker = Shell.WindowTracker.get_default();
                        const app = tracker.get_window_app(window);
                        const wmClass = (window.get_wm_class() || '').toLowerCase();
                        const appId = (app?.get_id() || '').toLowerCase();

                        // Also check transient parent's app (for popups that inherit parent)
                        let parentAppId = '';
                        let parentWmClass = '';
                        if (transientFor) {
                            const parentApp = tracker.get_window_app(transientFor);
                            parentAppId = (parentApp?.get_id() || '').toLowerCase();
                            parentWmClass = (transientFor.get_wm_class() || '').toLowerCase();
                        }

                        for (const excl of EXCLUDED_APPS) {
                            const e = excl.toLowerCase();
                            if (appId.includes(e) || wmClass.includes(e) || parentAppId.includes(e) || parentWmClass.includes(e)) {
                                console.log(`[EveryWindowNewWorkspace] excluded terminal: ${appId} (${wmClass}) parent:${parentAppId} -> staying`);
                                return GLib.SOURCE_REMOVE;
                            }
                        }
                    } catch(e) {
                        // if tracker fails, don't block - just continue to isolation
                    }

                    const wm = global.workspace_manager;
                    const n = wm.get_n_workspaces();
                    const activeWs = wm.get_active_workspace();
                    
                    // If last workspace is empty and not active, reuse it, else create new
                    let targetWs;
                    const lastWs = wm.get_workspace_by_index(n - 1);
                    // Check if last workspace is empty (no windows)
                    const lastHasWindows = lastWs.list_windows().length > 0;
                    
                    if (!lastHasWindows && lastWs !== activeWs) {
                        targetWs = lastWs;
                    } else if (!lastHasWindows && n === 1) {
                        // single empty workspace, need new one
                        targetWs = wm.append_new_workspace(false, global.get_current_time());
                    } else if (!lastHasWindows) {
                        // last is empty but is active (you're on it) - don't reuse, create new to keep isolation
                        // Actually if you're on empty workspace and open app, keep it there
                        if (activeWs === lastWs) {
                            return GLib.SOURCE_REMOVE; // already on empty workspace, stay
                        }
                        targetWs = lastWs;
                    } else {
                        targetWs = wm.append_new_workspace(false, global.get_current_time());
                    }

                    console.log(`[EveryWindowNewWorkspace] MOVING window class=${window.get_wm_class?.() || 'unknown'} title=${window.get_title?.() || 'no-title'} to ws ${targetWs.index()}`);
                    window.change_workspace(targetWs);
                    targetWs.activate_with_focus(window, global.get_current_time());
                } catch(e) {
                    console.error('[EveryWindowNewWorkspace] error: ' + e.message);
                }
                return GLib.SOURCE_REMOVE;
            });
        });
        console.log('[EveryWindowNewWorkspace] enabled - every new window -> new workspace');
    }

    disable() {
        if (this._handlerId) {
            global.display.disconnect(this._handlerId);
            this._handlerId = null;
        }
        this._processed = null;
        console.log('[EveryWindowNewWorkspace] disabled');
    }
}

// SPDX-License-Identifier: GPL-2.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const SETTINGS_KEY = 'application-list';
// O workspace não é usado na lógica dinâmica, mas mantemos para compatibilidade do formato
const WORKSPACE_MAX = 36; 

class NewItem extends GObject.Object {}
GObject.registerClass(NewItem);

class NewItemModel extends GObject.Object {
    static [GObject.interfaces] = [Gio.ListModel];
    static { GObject.registerClass(this); }
    #item = new NewItem();
    vfunc_get_item_type() { return NewItem; }
    vfunc_get_n_items() { return 1; }
    vfunc_get_item(_pos) { return this.#item; }
}

class Rule extends GObject.Object {
    static [GObject.properties] = {
        'app-info': GObject.ParamSpec.object('app-info', null, null, GObject.ParamFlags.READWRITE, GioUnix.DesktopAppInfo),
        'workspace': GObject.ParamSpec.uint('workspace', null, null, GObject.ParamFlags.READWRITE, 1, WORKSPACE_MAX, 1),
        // Nova propriedade: Rodar em segundo plano?
        'background': GObject.ParamSpec.boolean('background', null, null, GObject.ParamFlags.READWRITE, false),
    };
    static { GObject.registerClass(this); }
}

class RulesList extends GObject.Object {
    static [GObject.interfaces] = [Gio.ListModel];
    static { GObject.registerClass(this); }
    #settings; #rules = []; #changedId;

    constructor(settings) {
        super();
        this.#settings = settings;
        this.#changedId = this.#settings.connect(`changed::${SETTINGS_KEY}`, () => this.#sync());
        this.#sync();
    }

    append(appInfo) {
        const pos = this.#rules.length;
        this.#rules.push(new Rule({appInfo, workspace: 1, background: false}));
        this.#saveRules();
        this.items_changed(pos, 0, 1);
    }

    remove(id) {
        const pos = this.#rules.findIndex(r => r.appInfo.get_id() === id);
        if (pos < 0) return;
        this.#rules.splice(pos, 1);
        this.#saveRules();
        this.items_changed(pos, 1, 0);
    }

    toggleBackground(id, isBackground) {
        const pos = this.#rules.findIndex(r => r.appInfo.get_id() === id);
        if (pos < 0) return;
        this.#rules[pos].set({background: isBackground});
        this.#saveRules();
    }

    #saveRules() {
        this.#settings.block_signal_handler(this.#changedId);
        this.#settings.set_strv(SETTINGS_KEY, this.#rules.map(r =>
            `${r.app_info.get_id()}:${r.workspace}:${r.background}`
        ));
        this.#settings.unblock_signal_handler(this.#changedId);
    }

    #sync() {
        const removed = this.#rules.length;
        this.#rules = [];
        for (const stringRule of this.#settings.get_strv(SETTINGS_KEY)) {
            const [id, workspace, bgString] = stringRule.split(':');
            const appInfo = GioUnix.DesktopAppInfo.new(id);
            const background = (bgString === 'true');

            if (appInfo) this.#rules.push(new Rule({appInfo, workspace, background}));
        }
        this.items_changed(0, removed, this.#rules.length);
    }

    vfunc_get_item_type() { return Rule; }
    vfunc_get_n_items() { return this.#rules.length; }
    vfunc_get_item(pos) { return this.#rules[pos] ?? null; }
}

class AutoMoveSettingsWidget extends Adw.PreferencesGroup {
    static { GObject.registerClass(this); }

    constructor(settings) {
        super({
            title: _('Application List'),
            description: _('Adicione apps. Ative a chave lateral para mover em 2º plano (sem trocar de tela).'),
        });
        this._settings = settings;
        this._rules = new RulesList(this._settings);

        const actionGroup = new Gio.SimpleActionGroup();
        this.insert_action_group('rules', actionGroup);

        const addAction = new Gio.SimpleAction({ name: 'add' });
        addAction.connect('activate', () => this._addNewRule());
        actionGroup.add_action(addAction);

        const removeAction = new Gio.SimpleAction({ name: 'remove', parameter_type: new GLib.VariantType('s') });
        removeAction.connect('activate', (_, param) => { this._rules.remove(param.unpack()); });
        actionGroup.add_action(removeAction);

        const store = new Gio.ListStore({item_type: Gio.ListModel});
        const listModel = new Gtk.FlattenListModel({model: store});
        store.append(this._rules);
        store.append(new NewItemModel());

        this._list = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.NONE, css_classes: ['boxed-list'] });
        this.add(this._list);
        this._list.bind_model(listModel, item => item instanceof NewItem ? new NewRuleRow() : new RuleRow(item, this._rules));
    }

    _addNewRule() {
        const dialog = new NewRuleDialog(this.get_root(), this._settings);
        dialog.connect('response', (dlg, id) => {
            const appInfo = id === Gtk.ResponseType.OK ? dialog.get_app_info() : null;
            if (appInfo) this._rules.append(appInfo);
            dialog.destroy();
        });
        dialog.show();
    }
}

class RuleRow extends Adw.ActionRow {
    static { GObject.registerClass(this); }
    constructor(rule, rulesList) {
        const {appInfo, background} = rule;
        const id = appInfo.get_id();
        super({ activatable: false, title: rule.appInfo.get_display_name() });
        
        const icon = new Gtk.Image({ css_classes: ['icon-dropshadow'], gicon: appInfo.get_icon(), pixel_size: 32 });
        this.add_prefix(icon);

        // --- Switch para Segundo Plano ---
        const bgSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: background,
            tooltip_text: _("Mover em segundo plano (não mudar de workspace)")
        });
        
        bgSwitch.connect('notify::active', () => {
             rulesList.toggleBackground(id, bgSwitch.active);
        });
        
        // Adiciona o switch antes do botão de deletar
        this.add_suffix(bgSwitch);
        // ---------------------------------

        const button = new Gtk.Button({
            action_name: 'rules.remove',
            action_target: new GLib.Variant('s', id),
            icon_name: 'edit-delete-symbolic',
            has_frame: false,
            valign: Gtk.Align.CENTER,
        });
        this.add_suffix(button);
    }
}

class NewRuleRow extends Gtk.ListBoxRow {
    static { GObject.registerClass(this); }
    constructor() {
        super({
            action_name: 'rules.add',
            child: new Gtk.Image({ icon_name: 'list-add-symbolic', pixel_size: 16, margin_top: 12, margin_bottom: 12, margin_start: 12, margin_end: 12 }),
        });
        this.update_property([Gtk.AccessibleProperty.LABEL], [_('Add Rule')]);
    }
}

class NewRuleDialog extends Gtk.Dialog {
    static { GObject.registerClass(this); }
    constructor(parent, settings) {
        super({
            transient_for: parent,
            modal: true,
            title: _('Select Application'),
            use_header_bar: 1,
            default_width: 400,
            default_height: 500,
        });

        this._settings = settings;
        this._selectedApp = null;

        this.add_button(_('Cancel'), Gtk.ResponseType.CANCEL);
        const addButton = this.add_button(_('Add'), Gtk.ResponseType.OK);
        addButton.add_css_class('suggested-action');
        this.set_response_sensitive(Gtk.ResponseType.OK, false);

        const contentArea = this.get_content_area();
        contentArea.set_margin_top(12);
        contentArea.set_margin_bottom(12);
        contentArea.set_margin_start(12);
        contentArea.set_margin_end(12);
        contentArea.set_spacing(12);

        const searchEntry = new Gtk.SearchEntry({
            placeholder_text: _('Search applications...'),
        });
        contentArea.append(searchEntry);

        const scrolled = new Gtk.ScrolledWindow({
            vexpand: true,
            hexpand: true,
            propagate_natural_height: true,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        });
        contentArea.append(scrolled);

        this._listBox = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.SINGLE,
            css_classes: ['boxed-list'],
        });
        scrolled.set_child(this._listBox);

        const rules = this._settings.get_strv(SETTINGS_KEY);
        const alreadyAddedIds = rules.map(rule => rule.split(':')[0]);

        const allApps = Gio.AppInfo.get_all().filter(app => {
            return app && app.should_show() && !alreadyAddedIds.includes(app.get_id());
        });
        allApps.sort((a, b) => a.get_display_name().localeCompare(b.get_display_name()));

        this._appRows = [];

        for (const app of allApps) {
            const row = new Adw.ActionRow({
                title: app.get_display_name(),
                subtitle: app.get_description() || '',
                activatable: true,
            });

            const appIcon = app.get_icon();
            if (appIcon) {
                const icon = new Gtk.Image({
                    gicon: appIcon,
                    pixel_size: 32,
                    css_classes: ['icon-dropshadow'],
                });
                row.add_prefix(icon);
            }

            this._listBox.append(row);
            this._appRows.push({ row, app });
        }

        this._listBox.connect('row-activated', (listbox, row) => {
            const match = this._appRows.find(item => item.row === row);
            if (match) {
                this._selectedApp = match.app;
                this.set_response_sensitive(Gtk.ResponseType.OK, true);
                this.response(Gtk.ResponseType.OK);
            }
        });

        this._listBox.connect('row-selected', (listbox, row) => {
            if (row) {
                const match = this._appRows.find(item => item.row === row);
                if (match) {
                    this._selectedApp = match.app;
                    this.set_response_sensitive(Gtk.ResponseType.OK, true);
                }
            } else {
                this._selectedApp = null;
                this.set_response_sensitive(Gtk.ResponseType.OK, false);
            }
        });

        searchEntry.connect('search-changed', () => {
            const text = searchEntry.get_text().toLowerCase();
            this._listBox.set_filter_func(row => {
                const match = this._appRows.find(item => item.row === row);
                if (!match) return false;
                if (!text) return true;
                const name = match.app.get_display_name().toLowerCase();
                const id = match.app.get_id().toLowerCase();
                const desc = (match.app.get_description() || '').toLowerCase();
                return name.includes(text) || id.includes(text) || desc.includes(text);
            });
        });
    }

    get_app_info() {
        return this._selectedApp;
    }
}

class FocusToggle extends Adw.ActionRow {
    static { GObject.registerClass(this); }
    constructor(settings) {
        super({
            title: _('Focus on New Workspace'),
            subtitle: _('Automatically switch to the new workspace when an application is opened.'),
        });
        this._settings = settings;
        const toggle = new Gtk.Switch({
            active: this._settings.get_boolean('focus-new-workspace'),
            valign: Gtk.Align.CENTER,
        });
        toggle.connect('notify::active', () => {
            this._settings.set_boolean('focus-new-workspace', toggle.active);
        });
        this._settings.connect(`changed::focus-new-workspace`, () => {
            toggle.active = this._settings.get_boolean('focus-new-workspace');
        });
        this.add_suffix(toggle);
        this.set_activatable_widget(toggle);
    }
}

export default class AutoMovePrefs extends ExtensionPreferences {
    _getSettingsSafe() {
        try {
            return this.getSettings();
        } catch (e) {
            const schemaSource = Gio.SettingsSchemaSource.new_from_directory(
                this.path, Gio.SettingsSchemaSource.get_default(), false);
            const schema = schemaSource.lookup(this.metadata['settings-schema'], true);
            if (!schema) throw new Error(`Schema not found`);
            return new Gio.Settings({ settings_schema: schema });
        }
    }

    fillPreferencesWindow(window) {
        const settings = this._getSettingsSafe();

        const page = new Adw.PreferencesPage();
        
        // Wrap the FocusToggle ActionRow in a General Settings PreferencesGroup
        const generalGroup = new Adw.PreferencesGroup({
            title: _('General Settings'),
        });
        generalGroup.add(new FocusToggle(settings));
        page.add(generalGroup);

        const group = new AutoMoveSettingsWidget(settings);
        page.add(group);
        window.add(page);
    }
}
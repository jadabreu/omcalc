#!/usr/bin/env -S gjs -m

import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import { evaluateExpression, formatResult, normalizeCalcErrorMessage } from './engine.js';

const SCRIPT_PATH = Gio.File.new_for_uri(import.meta.url).get_path();
const SCRIPT_DIR = GLib.path_get_dirname(SCRIPT_PATH);
const HISTORY_LIMIT = 30;
const DEFAULT_WIDTH = 430;
const DEFAULT_HEIGHT = 620;
const MIN_WIDTH = 360;
const MIN_HEIGHT = 480;
const STATE_DIR = GLib.getenv('XDG_STATE_HOME') || `${GLib.get_home_dir()}/.local/state`;
const APP_STATE_DIR = `${STATE_DIR}/omcalc`;
const HISTORY_FILE = `${APP_STATE_DIR}/history.json`;
const LEGACY_HISTORY_FILE = `${STATE_DIR}/omarchy-calc/history.json`;

const DEFAULT_THEME = {
    background: '#2d353b',
    foreground: '#d3c6aa',
    accent: '#7fbbb3',
    positive: '#83c092',
    warning: '#dbbc7f',
    danger: '#e67e80',
    font: 'Sans',
};

function expandHome(path) {
    if (path.startsWith('~/'))
        return `${GLib.get_home_dir()}/${path.slice(2)}`;
    return path;
}

function readFile(path) {
    try {
        const [ok, data] = GLib.file_get_contents(expandHome(path));
        if (!ok)
            return '';
        return new TextDecoder('utf-8').decode(data);
    } catch {
        return '';
    }
}

function ensureStateDir() {
    try {
        GLib.mkdir_with_parents(APP_STATE_DIR, 0o755);
    } catch {
        // Ignore failures and fall back to non-persistent behavior.
    }
}

function loadHistoryFromDisk() {
    ensureStateDir();
    const raw = readFile(HISTORY_FILE) || readFile(LEGACY_HISTORY_FILE);
    if (!raw)
        return [];

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return [];

        const sanitized = parsed
            .filter(item =>
                item
                && typeof item.expression === 'string'
                && typeof item.result === 'string')
            .slice(0, HISTORY_LIMIT);

        return sanitized;
    } catch {
        return [];
    }
}

function saveHistoryToDisk(history) {
    ensureStateDir();
    try {
        const payload = JSON.stringify(history.slice(0, HISTORY_LIMIT), null, 2);
        const tmpFile = `${HISTORY_FILE}.tmp-${GLib.get_real_time()}`;
        GLib.file_set_contents(tmpFile, payload);

        const src = Gio.File.new_for_path(tmpFile);
        const dest = Gio.File.new_for_path(HISTORY_FILE);
        src.move(dest, Gio.FileCopyFlags.OVERWRITE, null, null);
        return true;
    } catch {
        return false;
    }
}

function clearHistoryFromDisk() {
    ensureStateDir();
    try {
        const file = Gio.File.new_for_path(HISTORY_FILE);
        if (file.query_exists(null))
            file.delete(null);
    } catch {
        // Ignore delete failures.
    }

    try {
        const legacy = Gio.File.new_for_path(LEGACY_HISTORY_FILE);
        if (legacy.query_exists(null))
            legacy.delete(null);
    } catch {
        // Ignore delete failures.
    }
}

function pickColor(contents, patterns) {
    for (const pattern of patterns) {
        const match = contents.match(pattern);
        if (match)
            return match[1].toLowerCase();
    }
    return null;
}

function runCommand(command) {
    try {
        const [ok, stdout] = GLib.spawn_command_line_sync(command);
        if (!ok)
            return '';
        return new TextDecoder('utf-8').decode(stdout).trim();
    } catch {
        return '';
    }
}

function normalizeFontFamily(name) {
    const raw = String(name ?? '').trim();
    if (!raw)
        return '';

    const withoutSize = raw.replace(/\s+\d+(\.\d+)?$/, '').trim();
    return withoutSize || raw;
}

function resolveSystemFontFamily() {
    const omarchyFont = normalizeFontFamily(runCommand('omarchy-font-current'));
    if (omarchyFont)
        return omarchyFont;

    try {
        const settings = Gtk.Settings.get_default();
        const gtkFont = normalizeFontFamily(settings?.gtk_font_name ?? '');
        if (gtkFont)
            return gtkFont;
    } catch {
        // Ignore GTK setting lookup issues and use fallback.
    }

    return DEFAULT_THEME.font;
}

function cssEscapeValue(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function loadOmarchyTheme() {
    const theme = { ...DEFAULT_THEME };
    theme.font = resolveSystemFontFamily();

    const waybar = readFile('~/.config/omarchy/current/theme/waybar.css');
    if (waybar) {
        theme.background = pickColor(waybar, [/@define-color\s+background\s+(#[0-9a-fA-F]{6})/]) ?? theme.background;
        theme.foreground = pickColor(waybar, [/@define-color\s+foreground\s+(#[0-9a-fA-F]{6})/]) ?? theme.foreground;
    }

    const walker = readFile('~/.config/omarchy/current/theme/walker.css');
    if (walker) {
        theme.accent = pickColor(walker, [/@define-color\s+selected-text\s+(#[0-9a-fA-F]{6})/]) ?? theme.accent;
    }

    const alacritty = readFile('~/.config/omarchy/current/theme/alacritty.toml');
    if (alacritty) {
        theme.background = pickColor(alacritty, [/^\s*background\s*=\s*"(#[0-9a-fA-F]{6})"\s*$/m]) ?? theme.background;
        theme.foreground = pickColor(alacritty, [/^\s*foreground\s*=\s*"(#[0-9a-fA-F]{6})"\s*$/m]) ?? theme.foreground;
        theme.accent = pickColor(alacritty, [/^\s*blue\s*=\s*"(#[0-9a-fA-F]{6})"\s*$/m]) ?? theme.accent;
        theme.positive = pickColor(alacritty, [/^\s*cyan\s*=\s*"(#[0-9a-fA-F]{6})"\s*$/m]) ?? theme.positive;
        theme.warning = pickColor(alacritty, [/^\s*yellow\s*=\s*"(#[0-9a-fA-F]{6})"\s*$/m]) ?? theme.warning;
        theme.danger = pickColor(alacritty, [/^\s*red\s*=\s*"(#[0-9a-fA-F]{6})"\s*$/m]) ?? theme.danger;
    }

    return theme;
}

function hexToRgba(hex, alpha) {
    const normalized = hex.replace('#', '');
    const red = Number.parseInt(normalized.slice(0, 2), 16);
    const green = Number.parseInt(normalized.slice(2, 4), 16);
    const blue = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

let staticCssInstalled = false;
let runtimeProvider = null;

function installStaticCss() {
    if (staticCssInstalled)
        return;

    const cssProvider = new Gtk.CssProvider();
    cssProvider.load_from_path(`${SCRIPT_DIR}/omarchy_calc_ui.css`);

    const display = Gdk.Display.get_default();
    Gtk.StyleContext.add_provider_for_display(
        display,
        cssProvider,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
    );
    staticCssInstalled = true;
}

function applyRuntimeTheme(theme) {
    const provider = new Gtk.CssProvider();
    const fontFamily = cssEscapeValue(theme.font || DEFAULT_THEME.font);
    provider.load_from_data(`
        @define-color calc_bg ${hexToRgba(theme.background, 0.78)};
        @define-color calc_surface ${hexToRgba(theme.background, 0.92)};
        @define-color calc_border ${hexToRgba(theme.foreground, 0.26)};
        @define-color calc_text ${theme.foreground};
        @define-color calc_dim ${hexToRgba(theme.foreground, 0.62)};
        @define-color calc_accent ${theme.accent};
        @define-color calc_positive ${theme.positive};
        @define-color calc_warning ${theme.warning};
        @define-color calc_danger ${theme.danger};
        @define-color calc_button_hover ${hexToRgba(theme.accent, 0.15)};
        @define-color calc_operator_border ${hexToRgba(theme.accent, 0.5)};
        @define-color calc_positive_border ${hexToRgba(theme.positive, 0.62)};
        @define-color calc_warning_border ${hexToRgba(theme.warning, 0.62)};
        @define-color calc_danger_border ${hexToRgba(theme.danger, 0.62)};

        * {
            font-family: "${fontFamily}", sans-serif;
        }
    `, -1);

    const display = Gdk.Display.get_default();

    if (runtimeProvider) {
        Gtk.StyleContext.remove_provider_for_display(
            display,
            runtimeProvider
        );
    }

    runtimeProvider = provider;
    Gtk.StyleContext.add_provider_for_display(
        display,
        runtimeProvider,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
    );
}

const OmcalcApp = GObject.registerClass(
class OmcalcApp extends Adw.Application {
    constructor() {
        super({ application_id: 'org.omarchy.Omcalc' });

        this._history = loadHistoryFromDisk();

        this._themeMonitors = [];
        this._themeRefreshSource = 0;
        this._statusTimeoutSource = 0;
        this._refocusTimeoutSource = 0;
    }

    vfunc_activate() {
        Adw.init();

        installStaticCss();
        applyRuntimeTheme(loadOmarchyTheme());
        this._setupThemeMonitoring();

        if (!this._window)
            this._window = this.buildWindow();

        this._window.present();
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30, () => {
            this._expressionEntry.grab_focus();
            this._expressionEntry.set_position(-1);
            return GLib.SOURCE_REMOVE;
        });
    }

    vfunc_shutdown() {
        if (this._themeRefreshSource)
            GLib.Source.remove(this._themeRefreshSource);
        this._themeRefreshSource = 0;

        if (this._statusTimeoutSource)
            GLib.Source.remove(this._statusTimeoutSource);
        this._statusTimeoutSource = 0;

        if (this._refocusTimeoutSource)
            GLib.Source.remove(this._refocusTimeoutSource);
        this._refocusTimeoutSource = 0;

        for (const monitor of this._themeMonitors)
            monitor.cancel();
        this._themeMonitors = [];

        super.vfunc_shutdown();
    }

    _setupThemeMonitoring() {
        if (this._themeMonitors.length > 0)
            return;

        const targets = [
            '~/.config/omarchy/current/theme.name',
            '~/.config/omarchy/current/theme/waybar.css',
            '~/.config/omarchy/current/theme/walker.css',
            '~/.config/omarchy/current/theme/alacritty.toml',
            '~/.config/omarchy/current',
        ];

        for (const target of targets) {
            try {
                const file = Gio.File.new_for_path(expandHome(target));
                const monitor = target.endsWith('/current')
                    ? file.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null)
                    : file.monitor_file(Gio.FileMonitorFlags.WATCH_MOVES, null);

                monitor.connect('changed', () => this._queueThemeRefresh());
                this._themeMonitors.push(monitor);
            } catch {
                // Ignore missing files/paths; fallbacks still apply.
            }
        }
    }

    _queueThemeRefresh() {
        if (this._themeRefreshSource)
            GLib.Source.remove(this._themeRefreshSource);

        this._themeRefreshSource = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            180,
            () => {
                applyRuntimeTheme(loadOmarchyTheme());
                this._themeRefreshSource = 0;
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    buildWindow() {
        const window = new Adw.ApplicationWindow({
            application: this,
            title: 'Omcalc',
            default_width: DEFAULT_WIDTH,
            default_height: DEFAULT_HEIGHT,
            resizable: true,
        });
        window.set_size_request(MIN_WIDTH, MIN_HEIGHT);
        window.add_css_class('omcalc-window');

        const content = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            vexpand: true,
            hexpand: true,
            margin_start: 14,
            margin_end: 14,
            margin_top: 14,
            margin_bottom: 14,
            spacing: 8,
        });
        content.add_css_class('calc-canvas');

        const header = new Gtk.CenterBox({
            hexpand: true,
        });
        header.add_css_class('calc-header');

        const hints = new Gtk.Label({
            label: 'Enter calc | Ctrl+K keypad',
            hexpand: true,
            xalign: 0,
        });
        hints.add_css_class('calc-hints');

        header.set_start_widget(hints);

        const display = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 4,
            margin_top: 2,
            margin_bottom: 2,
        });
        display.add_css_class('calc-display');

        this._expressionEntry = new Gtk.Entry({
            hexpand: true,
        });
        this._expressionEntry.add_css_class('calc-entry');
        this._expressionEntry.connect('changed', () => this._updatePreview());
        this._expressionEntry.connect('activate', () => this._evaluateCurrent());

        this._statusLabel = new Gtk.Label({ label: '', xalign: 0 });
        this._statusLabel.add_css_class('calc-status');
        this._statusLabel.add_css_class('is-hidden');

        display.append(this._expressionEntry);
        display.append(this._statusLabel);

        const historyHeader = new Gtk.CenterBox({ hexpand: true });
        const historyTitle = new Gtk.Label({ label: 'history', xalign: 0 });
        historyTitle.add_css_class('calc-history-title');

        historyHeader.set_start_widget(historyTitle);

        this._historyBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 8,
            margin_bottom: 8,
            margin_start: 8,
            margin_end: 8,
        });

        const historyScroll = new Gtk.ScrolledWindow({
            min_content_height: 130,
            propagate_natural_height: false,
            vexpand: true,
            hexpand: true,
            child: this._historyBox,
        });
        historyScroll.add_css_class('calc-history-scroll');
        this._historyScroll = historyScroll;

        this._keypadRevealer = new Gtk.Revealer({
            reveal_child: false,
            transition_duration: 0,
            transition_type: Gtk.RevealerTransitionType.SLIDE_UP,
        });
        this._keypadRevealer.set_child(this._buildKeypad());
        // Pre-measure both states to avoid first-toggle geometry jumps.
        this._keypadRevealer.set_reveal_child(true);
        this._keypadRevealer.set_reveal_child(false);

        content.append(header);
        content.append(display);
        content.append(historyHeader);
        content.append(historyScroll);
        content.append(this._keypadRevealer);

        window.set_content(content);
        this._renderHistory();

        const keys = new Gtk.EventControllerKey();
        keys.connect('key-pressed', (_, keyval, _keycode, state) => {
            const ctrl = (state & Gdk.ModifierType.CONTROL_MASK) !== 0;
            const shift = (state & Gdk.ModifierType.SHIFT_MASK) !== 0;

            if (ctrl && shift && (keyval === Gdk.KEY_l || keyval === Gdk.KEY_L)) {
                this._history = [];
                saveHistoryToDisk(this._history);
                this._renderHistory();
                this._setStatus('history cleared', false, 900);
                return true;
            }

            if (ctrl && (keyval === Gdk.KEY_k || keyval === Gdk.KEY_K)) {
                this._toggleKeypad();
                return true;
            }

            if (ctrl && (keyval === Gdk.KEY_l || keyval === Gdk.KEY_L)) {
                this._expressionEntry.set_text('');
                this._setStatus('input cleared', false, 900);
                return true;
            }

            if (keyval === Gdk.KEY_Escape) {
                if (this._expressionEntry.get_text().trim()) {
                    this._expressionEntry.set_text('');
                    this._setStatus('input cleared', false, 900);
                    return true;
                }

                window.close();
                return true;
            }

            if (keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter) {
                this._evaluateCurrent();
                return true;
            }

            if (keyval === Gdk.KEY_Page_Up) {
                this._scrollHistoryByPage(-1);
                return true;
            }

            if (keyval === Gdk.KEY_Page_Down) {
                this._scrollHistoryByPage(1);
                return true;
            }

            if (keyval === Gdk.KEY_Home) {
                this._scrollHistoryToEdge(true);
                return true;
            }

            if (keyval === Gdk.KEY_End) {
                this._scrollHistoryToEdge(false);
                return true;
            }

            return false;
        });
        window.add_controller(keys);
        window.connect('notify::fullscreened', () => this._syncWindowMode(window));
        window.connect('notify::maximized', () => this._syncWindowMode(window));
        window.connect('notify::is-active', () => this._queueEntryFocus(40));
        this._syncWindowMode(window);

        return window;
    }

    _syncWindowMode(window) {
        if (this._isWindowExpanded(window))
            window.add_css_class('is-expanded');
        else
            window.remove_css_class('is-expanded');

        this._updateLayoutForState();

        this._queueEntryFocus(this._isWindowExpanded(window) ? 80 : 40);
    }

    _queueEntryFocus(delayMs = 40) {
        if (this._refocusTimeoutSource)
            GLib.Source.remove(this._refocusTimeoutSource);

        this._refocusTimeoutSource = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            delayMs,
            () => {
                if (this._expressionEntry) {
                    this._expressionEntry.grab_focus();
                    this._expressionEntry.set_position(-1);
                }
                this._refocusTimeoutSource = 0;
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _toggleKeypad() {
        const willReveal = !this._keypadRevealer.get_reveal_child();
        this._keypadRevealer.set_reveal_child(willReveal);
        this._updateLayoutForState();

        this._setStatus(willReveal ? 'keypad open' : 'keypad hidden', false, 900);
    }

    _scrollHistoryByPage(direction) {
        const adjustment = this._historyScroll?.get_vadjustment?.();
        if (!adjustment)
            return;

        const current = adjustment.get_value();
        const pageIncrement = adjustment.get_page_increment();
        const pageSize = adjustment.get_page_size();
        const maxValue = Math.max(adjustment.get_lower(), adjustment.get_upper() - pageSize);
        const step = Math.max(pageIncrement, pageSize * 0.9, 24);
        const next = Math.max(adjustment.get_lower(), Math.min(maxValue, current + (step * direction)));
        adjustment.set_value(next);
    }

    _scrollHistoryToEdge(toTop) {
        const adjustment = this._historyScroll?.get_vadjustment?.();
        if (!adjustment)
            return;

        if (toTop) {
            adjustment.set_value(adjustment.get_lower());
            return;
        }

        const pageSize = adjustment.get_page_size();
        const maxValue = Math.max(adjustment.get_lower(), adjustment.get_upper() - pageSize);
        adjustment.set_value(maxValue);
    }

    _isWindowExpanded(window) {
        const target = window || this._window;
        if (!target)
            return false;

        const isFullscreen = (typeof target.is_fullscreen === 'function')
            ? target.is_fullscreen()
            : Boolean(target.fullscreened);
        const isMaximized = (typeof target.is_maximized === 'function')
            ? target.is_maximized()
            : Boolean(target.maximized);
        return isFullscreen || isMaximized;
    }

    _updateLayoutForState() {
        if (!this._window || !this._historyScroll || !this._keypadRevealer)
            return;

        const expanded = this._isWindowExpanded(this._window);
        const keypadOpen = this._keypadRevealer.get_reveal_child();

        let historyMin = expanded ? 220 : 130;
        if (keypadOpen)
            historyMin = expanded ? 145 : 78;
        // Reset constraints first to avoid transient min>max assertions while toggling.
        this._historyScroll.set_min_content_height(-1);
        this._historyScroll.set_max_content_height(-1);
        this._historyScroll.set_min_content_height(historyMin);
        this._historyScroll.set_max_content_height(historyMin);

        if (keypadOpen)
            this._window.add_css_class('is-keypad-open');
        else
            this._window.remove_css_class('is-keypad-open');
    }

    _buildKeypad() {
        const grid = new Gtk.Grid({
            row_spacing: 5,
            column_spacing: 6,
            column_homogeneous: true,
            row_homogeneous: true,
            margin_top: 4,
            margin_bottom: 4,
            margin_start: 4,
            margin_end: 4,
        });
        grid.add_css_class('calc-keypad');

        const addButton = (label, row, col, className, clickHandler) => {
            const button = new Gtk.Button({ label });
            button.add_css_class('calc-button');
            if (className)
                button.add_css_class(className);
            button.connect('clicked', clickHandler);
            grid.attach(button, col, row, 1, 1);
        };

        const typeToken = token => {
            const text = this._expressionEntry.get_text();
            this._expressionEntry.set_text(`${text}${token}`);
            this._expressionEntry.set_position(-1);
        };

        addButton('C', 0, 0, 'is-danger', () => this._expressionEntry.set_text(''));
        addButton('(', 0, 1, '', () => typeToken('('));
        addButton(')', 0, 2, '', () => typeToken(')'));
        addButton('BS', 0, 3, 'is-warning', () => {
            const text = this._expressionEntry.get_text();
            this._expressionEntry.set_text(text.slice(0, -1));
        });

        addButton('7', 1, 0, '', () => typeToken('7'));
        addButton('8', 1, 1, '', () => typeToken('8'));
        addButton('9', 1, 2, '', () => typeToken('9'));
        addButton('/', 1, 3, 'is-operator', () => typeToken('/'));

        addButton('4', 2, 0, '', () => typeToken('4'));
        addButton('5', 2, 1, '', () => typeToken('5'));
        addButton('6', 2, 2, '', () => typeToken('6'));
        addButton('*', 2, 3, 'is-operator', () => typeToken('*'));

        addButton('1', 3, 0, '', () => typeToken('1'));
        addButton('2', 3, 1, '', () => typeToken('2'));
        addButton('3', 3, 2, '', () => typeToken('3'));
        addButton('-', 3, 3, 'is-operator', () => typeToken('-'));

        addButton('0', 4, 0, '', () => typeToken('0'));
        addButton('.', 4, 1, '', () => typeToken('.'));
        addButton('=', 4, 2, 'is-positive', () => this._evaluateCurrent());
        addButton('+', 4, 3, 'is-operator', () => typeToken('+'));

        return grid;
    }

    _setStatus(message, isError = false, transientMs = 0) {
        if (this._statusTimeoutSource)
            GLib.Source.remove(this._statusTimeoutSource);
        this._statusTimeoutSource = 0;

        if (!message) {
            this._statusLabel.set_label('');
            this._statusLabel.remove_css_class('is-error');
            this._statusLabel.add_css_class('is-hidden');
            return;
        }

        this._statusLabel.set_label(message);
        this._statusLabel.remove_css_class('is-hidden');
        this._statusLabel.remove_css_class('is-error');
        if (isError)
            this._statusLabel.add_css_class('is-error');

        if (!isError && transientMs > 0) {
            this._statusTimeoutSource = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                transientMs,
                () => {
                    this._setStatus('', false, 0);
                    this._statusTimeoutSource = 0;
                    return GLib.SOURCE_REMOVE;
                }
            );
        }
    }

    _updatePreview() {
        const expression = this._expressionEntry.get_text().trim();
        if (!expression) {
            this._setStatus('', false, 0);
            return;
        }
        this._setStatus('', false, 0);
    }

    _evaluateCurrent() {
        const expression = this._expressionEntry.get_text().trim();
        if (!expression)
            return;

        try {
            const result = formatResult(evaluateExpression(expression));

            this._history.unshift({ expression, result });
            this._history = this._history.slice(0, HISTORY_LIMIT);
            saveHistoryToDisk(this._history);

            this._renderHistory();
            this._expressionEntry.set_text(result);
            this._expressionEntry.set_position(-1);
            this._setStatus('calculated', false, 700);
        } catch (error) {
            this._setStatus(normalizeCalcErrorMessage(error), true, 0);
        }
    }

    _renderHistory() {
        while (this._historyBox.get_first_child())
            this._historyBox.remove(this._historyBox.get_first_child());

        if (this._history.length === 0) {
            const empty = new Gtk.Label({
                label: 'No calculations yet',
                xalign: 0,
            });
            empty.add_css_class('calc-history-empty');
            this._historyBox.append(empty);
            return;
        }

        for (const item of this._history) {
            const rowButton = new Gtk.Button();
            rowButton.add_css_class('flat');
            rowButton.add_css_class('calc-history-item');
            rowButton.connect('clicked', () => {
                this._expressionEntry.set_text(item.expression);
                this._expressionEntry.grab_focus();
            });

            const rowContent = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 3,
                margin_start: 8,
                margin_end: 8,
                margin_top: 6,
                margin_bottom: 6,
            });

            const expression = new Gtk.Label({ label: item.expression, xalign: 0 });
            expression.add_css_class('calc-history-expression');

            const result = new Gtk.Label({ label: `= ${item.result}`, xalign: 0 });
            result.add_css_class('calc-history-result');

            rowContent.append(expression);
            rowContent.append(result);
            rowButton.set_child(rowContent);
            this._historyBox.append(rowButton);
        }
    }
}
);

export function createApp() {
    return new OmcalcApp();
}

if (ARGV.includes('--clear-history')) {
    clearHistoryFromDisk();
    print(`History cleared: ${HISTORY_FILE}`);
    imports.system.exit(0);
}

const app = createApp();
app.run(ARGV);

const { Gdk, GLib, Gtk } = imports.gi;
const ByteArray = imports.byteArray;

const App = imports.app;
const Utils = imports.utils;
const Widget = imports.widget;

const DEFAULT_THEME = {
    primary: "#7ec7ff",
    secondary: "#a7b0c0",
    background: "#0f1118",
    accent: "#6ce0a6",
    text: "#f2f4f8",
    font: "JetBrains Mono, Inter, sans-serif",
};

const THEME_CSS_PATHS = [
    "~/.config/omarchy/style.css",
    "~/.config/waybar/style.css",
    "~/.config/ags/style.css",
];

const THEME_TOML_PATHS = [
    "~/.config/omarchy/theme.toml",
    "~/.config/omarchy/colors.toml",
];

const HISTORY_LIMIT = 5;

function expandHome(path) {
    return path.startsWith("~/")
        ? `${GLib.get_home_dir()}/${path.slice(2)}`
        : path;
}

function readFile(path) {
    try {
        const [ok, contents] = GLib.file_get_contents(expandHome(path));
        return ok ? ByteArray.toString(contents) : "";
    } catch {
        return "";
    }
}

function normalizeHex(color) {
    if (!color)
        return null;

    const raw = color.trim();
    if (/^#[0-9a-f]{6}$/i.test(raw))
        return raw.toLowerCase();

    if (/^#[0-9a-f]{3}$/i.test(raw)) {
        const compact = raw.slice(1);
        return `#${compact[0]}${compact[0]}${compact[1]}${compact[1]}${compact[2]}${compact[2]}`.toLowerCase();
    }

    return null;
}

function extractCssVariable(contents, variableNames) {
    for (const variableName of variableNames) {
        const match = contents.match(new RegExp(`${variableName}\\s*:\\s*([^;]+);`, "i"));
        if (match)
            return match[1].trim();
    }

    return null;
}

function extractTomlValue(contents, keys) {
    for (const key of keys) {
        const match = contents.match(new RegExp(`^\\s*${key}\\s*=\\s*[\"']?([^\"'\\n]+)[\"']?\\s*$`, "im"));
        if (match)
            return match[1].trim();
    }

    return null;
}

function resolveTheme() {
    const theme = {
        primary: null,
        secondary: null,
        background: null,
        accent: null,
        text: null,
        font: null,
    };

    for (const path of THEME_CSS_PATHS) {
        const contents = readFile(path);
        if (!contents)
            continue;

        const primary = normalizeHex(extractCssVariable(contents, ["--primary", "--color-primary"]));
        const secondary = normalizeHex(extractCssVariable(contents, ["--secondary", "--color-secondary"]));
        const background = normalizeHex(extractCssVariable(contents, ["--background", "--bg", "--surface"]));
        const accent = normalizeHex(extractCssVariable(contents, ["--accent", "--color-accent"]));
        const text = normalizeHex(extractCssVariable(contents, ["--text", "--fg", "--foreground"]));
        const font = extractCssVariable(contents, ["--font-family", "--font"]);

        const hasThemeHint = primary || secondary || background || accent || text || font;
        if (!hasThemeHint)
            continue;

        if (primary) theme.primary = primary;
        if (secondary) theme.secondary = secondary;
        if (background) theme.background = background;
        if (accent) theme.accent = accent;
        if (text) theme.text = text;
        if (font) theme.font = font.replace(/[\"']/g, "");

        if (hasThemeHint)
            break;
    }

    for (const path of THEME_TOML_PATHS) {
        const contents = readFile(path);
        if (!contents)
            continue;

        const primary = normalizeHex(extractTomlValue(contents, ["primary", "color_primary"]));
        const secondary = normalizeHex(extractTomlValue(contents, ["secondary", "color_secondary"]));
        const background = normalizeHex(extractTomlValue(contents, ["background", "bg", "surface"]));
        const accent = normalizeHex(extractTomlValue(contents, ["accent", "highlight", "color_accent"]));
        const text = normalizeHex(extractTomlValue(contents, ["text", "fg", "foreground"]));
        const font = extractTomlValue(contents, ["font", "font_family"]);

        if (!theme.primary && primary) theme.primary = primary;
        if (!theme.secondary && secondary) theme.secondary = secondary;
        if (!theme.background && background) theme.background = background;
        if (!theme.accent && accent) theme.accent = accent;
        if (!theme.text && text) theme.text = text;
        if (!theme.font && font) theme.font = font;

        if (theme.primary && theme.secondary && theme.background
            && theme.accent && theme.text && theme.font)
            break;
    }

    return {
        primary: theme.primary || DEFAULT_THEME.primary,
        secondary: theme.secondary || DEFAULT_THEME.secondary,
        background: theme.background || DEFAULT_THEME.background,
        accent: theme.accent || DEFAULT_THEME.accent,
        text: theme.text || DEFAULT_THEME.text,
        font: theme.font || DEFAULT_THEME.font,
    };
}

function hexToRgba(hex, alpha = 1) {
    const normalized = normalizeHex(hex);
    if (!normalized)
        return hex;

    const red = Number.parseInt(normalized.slice(1, 3), 16);
    const green = Number.parseInt(normalized.slice(3, 5), 16);
    const blue = Number.parseInt(normalized.slice(5, 7), 16);

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function applyRuntimeTheme(theme) {
    const runtimeCss = `
        @define-color calc_primary ${theme.primary};
        @define-color calc_secondary ${theme.secondary};
        @define-color calc_background ${hexToRgba(theme.background, 0.76)};
        @define-color calc_surface ${hexToRgba(theme.background, 0.88)};
        @define-color calc_accent ${theme.accent};
        @define-color calc_text ${theme.text};

        * {
            font-family: ${theme.font};
        }
    `;

    const path = `${GLib.get_tmp_dir()}/omarchy-calc-runtime.css`;
    GLib.file_set_contents(path, runtimeCss);

    try {
        App.applyCss(path);
    } catch (error) {
        print(`omarchy-calc theme apply error: ${error}`);
    }
}

class ExpressionParser {
    constructor(input) {
        this.input = input;
        this.position = 0;
    }

    parse() {
        const value = this.parseExpression();
        this.skipWhitespace();

        if (this.position < this.input.length)
            throw new Error("Unexpected token");

        return value;
    }

    parseExpression() {
        let value = this.parseTerm();

        while (true) {
            this.skipWhitespace();
            const operator = this.peek();

            if (operator !== "+" && operator !== "-")
                return value;

            this.position += 1;
            const right = this.parseTerm();
            value = operator === "+" ? value + right : value - right;
        }
    }

    parseTerm() {
        let value = this.parseUnary();

        while (true) {
            this.skipWhitespace();
            const operator = this.peek();

            if (operator !== "*" && operator !== "/")
                return value;

            this.position += 1;
            const right = this.parseUnary();

            if (operator === "/") {
                if (right === 0)
                    throw new Error("Cannot divide by zero");
                value /= right;
                continue;
            }

            value *= right;
        }
    }

    parseUnary() {
        this.skipWhitespace();
        const current = this.peek();

        if (current === "+") {
            this.position += 1;
            return this.parseUnary();
        }

        if (current === "-") {
            this.position += 1;
            return -this.parseUnary();
        }

        return this.parsePrimary();
    }

    parsePrimary() {
        this.skipWhitespace();
        const current = this.peek();

        if (current === "(") {
            this.position += 1;
            const value = this.parseExpression();
            this.skipWhitespace();

            if (this.peek() !== ")")
                throw new Error("Missing closing parenthesis");

            this.position += 1;
            return value;
        }

        return this.parseNumber();
    }

    parseNumber() {
        this.skipWhitespace();
        const start = this.position;
        let hasDigits = false;
        let hasDot = false;

        while (this.position < this.input.length) {
            const char = this.input[this.position];

            if (char >= "0" && char <= "9") {
                hasDigits = true;
                this.position += 1;
                continue;
            }

            if (char === "." && !hasDot) {
                hasDot = true;
                this.position += 1;
                continue;
            }

            break;
        }

        if (!hasDigits)
            throw new Error("Expected a number");

        const parsed = Number.parseFloat(this.input.slice(start, this.position));

        if (!Number.isFinite(parsed))
            throw new Error("Invalid number");

        return parsed;
    }

    skipWhitespace() {
        while (this.position < this.input.length && /\s/.test(this.input[this.position]))
            this.position += 1;
    }

    peek() {
        return this.input[this.position] ?? "";
    }
}

function evaluateExpression(expression) {
    const parser = new ExpressionParser(expression);
    const value = parser.parse();

    if (!Number.isFinite(value))
        throw new Error("Result is not finite");

    return value;
}

function formatResult(number) {
    if (Object.is(number, -0))
        return "0";

    const absolute = Math.abs(number);
    if (absolute !== 0 && (absolute >= 1e12 || absolute < 1e-10)) {
        return number
            .toExponential(10)
            .replace(/\.0+e/, "e")
            .replace(/(\.[0-9]*[1-9])0+e/, "$1e");
    }

    return number
        .toFixed(12)
        .replace(/\.0+$/, "")
        .replace(/(\.[0-9]*[1-9])0+$/, "$1");
}

const state = {
    expression: "",
    result: "",
    preview: "",
    error: "",
    history: [],
};

const listeners = new Set();

function subscribe(listener) {
    listeners.add(listener);
    listener({ ...state });
    return () => listeners.delete(listener);
}

function notify() {
    const snapshot = { ...state, history: [...state.history] };
    listeners.forEach(listener => listener(snapshot));
}

function setExpression(text) {
    state.expression = text;
    state.result = "";
    state.error = "";

    const trimmed = text.trim();
    if (!trimmed) {
        state.preview = "";
        notify();
        return;
    }

    try {
        state.preview = formatResult(evaluateExpression(trimmed));
    } catch {
        state.preview = "";
    }

    notify();
}

function appendToken(token) {
    setExpression(`${state.expression}${token}`);
}

function backspace() {
    if (!state.expression)
        return;

    setExpression(state.expression.slice(0, -1));
}

function clearExpression() {
    state.expression = "";
    state.result = "";
    state.preview = "";
    state.error = "";
    notify();
}

function evaluateCurrent() {
    const trimmed = state.expression.trim();
    if (!trimmed)
        return;

    try {
        const value = evaluateExpression(trimmed);
        const formatted = formatResult(value);

        state.result = formatted;
        state.preview = formatted;
        state.error = "";
        state.history = [{ expression: trimmed, result: formatted }, ...state.history]
            .slice(0, HISTORY_LIMIT);

        notify();
    } catch (error) {
        state.result = "";
        state.error = error.message || "Invalid expression";
        notify();
    }
}

function useHistoryExpression(expression) {
    setExpression(expression);
}

function copyResultToClipboard() {
    const value = state.result || state.preview;
    if (!value)
        return;

    const clipboard = Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD);
    clipboard.set_text(value, -1);
}

function keyValueFromEvent(event) {
    const raw = event.get_keyval();
    return Array.isArray(raw) ? raw[1] : raw;
}

function stateFromEvent(event) {
    const raw = event.get_state();
    return Array.isArray(raw) ? raw[1] : raw;
}

function createCalculatorWindow() {
    const expressionEntry = Widget.Entry({
        hexpand: true,
        class_name: "calculator-entry",
        placeholder_text: "Type an expression, then press Enter",
        on_change: self => {
            if (self.text !== state.expression)
                setExpression(self.text);
        },
        on_accept: () => evaluateCurrent(),
    });

    const resultLabel = Widget.Label({
        class_name: "calculator-result",
        xalign: 1,
        label: "0",
    });

    const statusLabel = Widget.Label({
        class_name: "calculator-status",
        xalign: 0,
        label: "",
    });

    const historyBox = Widget.Box({
        vertical: true,
        class_name: "calculator-history-list",
    });

    const historyScroll = Widget.Scrollable({
        class_name: "calculator-history",
        hscroll: "never",
        vscroll: "automatic",
        css: "min-height: 140px;",
        child: historyBox,
    });

    const historyTitle = Widget.Label({
        class_name: "calculator-history-title",
        xalign: 0,
        label: "History",
    });

    const makeButton = (label, className, onClick) => Widget.Button({
        class_name: `calculator-button ${className}`,
        on_clicked: onClick,
        child: Widget.Label({ label }),
    });

    const rows = [
        [
            makeButton("C", "is-utility", () => clearExpression()),
            makeButton("(", "is-token", () => appendToken("(")),
            makeButton(")", "is-token", () => appendToken(")")),
            makeButton("BS", "is-utility", () => backspace()),
        ],
        [
            makeButton("7", "is-token", () => appendToken("7")),
            makeButton("8", "is-token", () => appendToken("8")),
            makeButton("9", "is-token", () => appendToken("9")),
            makeButton("/", "is-operator", () => appendToken("/")),
        ],
        [
            makeButton("4", "is-token", () => appendToken("4")),
            makeButton("5", "is-token", () => appendToken("5")),
            makeButton("6", "is-token", () => appendToken("6")),
            makeButton("*", "is-operator", () => appendToken("*")),
        ],
        [
            makeButton("1", "is-token", () => appendToken("1")),
            makeButton("2", "is-token", () => appendToken("2")),
            makeButton("3", "is-token", () => appendToken("3")),
            makeButton("-", "is-operator", () => appendToken("-")),
        ],
        [
            makeButton("0", "is-token", () => appendToken("0")),
            makeButton(".", "is-token", () => appendToken(".")),
            makeButton("=", "is-equals", () => evaluateCurrent()),
            makeButton("+", "is-operator", () => appendToken("+")),
        ],
    ];

    const buttonGrid = Widget.Box({
        vertical: true,
        class_name: "calculator-grid",
        children: rows.map(row => Widget.Box({
            homogeneous: true,
            class_name: "calculator-grid-row",
            children: row,
        })),
    });

    const copyButton = makeButton("Copy", "is-copy", () => copyResultToClipboard());

    const card = Widget.Box({
        vertical: true,
        class_name: "calculator-root",
        children: [
            Widget.Label({
                class_name: "calculator-title",
                xalign: 0,
                label: "Omarchy Calc",
            }),
            Widget.Box({
                class_name: "calculator-input-row",
                children: [expressionEntry, copyButton],
            }),
            resultLabel,
            statusLabel,
            buttonGrid,
            historyTitle,
            historyScroll,
        ],
    });

    const guardedCard = Widget.EventBox({
        class_name: "calculator-card-hitbox",
        on_primary_click: () => true,
        on_secondary_click: () => true,
        child: card,
    });

    const overlay = Widget.EventBox({
        class_name: "calculator-overlay",
        expand: true,
        on_primary_click: () => {
            App.closeWindow("calculator");
            return true;
        },
        on_secondary_click: () => {
            App.closeWindow("calculator");
            return true;
        },
        child: Widget.Box({
            expand: true,
            hpack: "center",
            vpack: "center",
            children: [guardedCard],
        }),
    });

    subscribe(snapshot => {
        if (expressionEntry.text !== snapshot.expression)
            expressionEntry.text = snapshot.expression;

        resultLabel.label = snapshot.result || snapshot.preview || "0";

        statusLabel.label = snapshot.error
            ? snapshot.error
            : snapshot.preview
                ? `Preview: ${snapshot.preview}`
                : "";

        statusLabel.class_name = snapshot.error
            ? "calculator-status is-error"
            : "calculator-status";

        historyBox.children = snapshot.history.map(item => Widget.Button({
            class_name: "calculator-history-item",
            on_clicked: () => useHistoryExpression(item.expression),
            child: Widget.Box({
                vertical: true,
                children: [
                    Widget.Label({ xalign: 0, label: item.expression }),
                    Widget.Label({
                        xalign: 0,
                        class_name: "calculator-history-result",
                        label: `= ${item.result}`,
                    }),
                ],
            }),
        }));
    });

    const onWindowKeyPress = (_, event) => {
        const key = keyValueFromEvent(event);
        const modifier = stateFromEvent(event);
        const ctrl = (modifier & Gdk.ModifierType.CONTROL_MASK) !== 0;

        if (ctrl && (key === Gdk.KEY_c || key === Gdk.KEY_C)) {
            copyResultToClipboard();
            return true;
        }

        if (key === Gdk.KEY_Escape) {
            if (state.expression) {
                clearExpression();
                return true;
            }

            App.closeWindow("calculator");
            return true;
        }

        if (key === Gdk.KEY_Return || key === Gdk.KEY_KP_Enter) {
            evaluateCurrent();
            return true;
        }

        return false;
    };

    return Widget.Window({
        name: "calculator",
        title: "calculator",
        class_name: "calculator-window",
        visible: false,
        layer: "overlay",
        anchor: ["top", "bottom", "left", "right"],
        exclusivity: "ignore",
        keymode: "on-demand",
        child: overlay,
        setup: self => {
            self.on("key-press-event", onWindowKeyPress);

            self.on("focus-out-event", () => {
                if (self.visible)
                    App.closeWindow("calculator");
            });

            self.on("notify::visible", () => {
                if (!self.visible)
                    return;

                Utils.timeout(15, () => {
                    expressionEntry.grab_focus();
                    expressionEntry.set_position(-1);
                    return false;
                });
            });
        },
    });
}

App.config({
    style: `${App.configDir}/style.css`,
    windows: [createCalculatorWindow()],
});

Utils.timeout(0, () => {
    applyRuntimeTheme(resolveTheme());
    return false;
});

# Omcalc UI (GTK4)

This is the native GTK4 implementation focused on Omarchy visual congruence and keyboard-first flow.

## Stack

- GJS (JavaScript)
- GTK4 + Libadwaita
- Omarchy theme token ingestion from:
  - `~/.config/omarchy/current/theme/waybar.css`
  - `~/.config/omarchy/current/theme/walker.css`
  - `~/.config/omarchy/current/theme/alacritty.toml`

## Run

```bash
gjs -m app/gtk4/omarchy_calc_ui.js
```

or:

```bash
./app/gtk4/run.sh
```

## Install (Hyprland Auto-Config)

Apply floating window rules automatically:

```bash
./app/gtk4/install.sh
```

This writes a managed block into your Hyprland window-rules config (detected from common Omarchy/Hypr paths) and reloads Hyprland.

It does not add a keybinding. Add one manually if you want:

```conf
bindd = SUPER, C, Omcalc, exec, /home/andres/Projects/omcalc/app/gtk4/run.sh
```

Remove those managed blocks later:

```bash
./app/gtk4/install.sh --uninstall
```

## History Persistence

History is persisted by default to:

`~/.local/state/omcalc/history.json`

Clear persisted history with:

```bash
./app/gtk4/clear-history.sh
```

or:

```bash
./app/gtk4/run.sh --clear-history
```

## Engine Tests

Run parser/engine checks:

```bash
./app/gtk4/test.sh
```

## Current Scope

- Floating-card style composition with translucent surface.
- Compact floating footprint for utility-style usage.
- Keyboard-first interactions:
  - `Enter`: evaluate
  - `Esc`: clear input, then close when empty
  - `Ctrl+K`: toggle keypad (hidden by default)
  - `Ctrl+L`: clear input
  - `Ctrl+Shift+L`: clear history
  - `PageUp` / `PageDown`: scroll history
  - `Home` / `End`: jump history to top/bottom
- Session history list (last 30) with click-to-reuse.
- History persists across launches (last 30).
- Live theme sync while app is open (watches Omarchy theme files and reapplies colors).
- Status line stays hidden unless there is an error or short transient feedback.
- Engine enforces an input length guard (`2048` chars) for safety.
- Typography is resolved from system settings (`omarchy-font-current` first, GTK fallback).

## Design Intent

- Monospace-first typography for terminal-native feel.
- Low-noise hierarchy: expression, history.
- Accent colors mapped from active Omarchy theme files.
- Minimal chrome and restrained controls to match Omarchy's focused style.

## Hyprland Hook

See `app/gtk4/hyprland-snippet.conf` for keybind and window rules.

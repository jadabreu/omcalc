# Omarchy Calc (AGS v1)

Hyprland-native calculator widget for `ags`, with Omarchy-style theming, keyboard-first UX, expression parsing, and session history.

## Features

- Full expression input: `(+ - * /)` with parentheses and unary minus.
- Safe parser (no `eval`).
- Keyboard-first flow:
  - `Enter` / `KP_Enter`: evaluate
  - `Esc`: clear input, then close when input is empty
  - `Ctrl+C`: copy current result/preview
- History of last 5 calculations (session-only).
- Single toggleable window named `calculator`.
- Omarchy theme integration with fallback values.

## Files

- `config.js`: AGS app, parser, state, window, interactions.
- `style.css`: visual design, blur-friendly transparent surface, controls.

## Install

1. Copy these files into your AGS config directory:

```bash
cp config.js style.css ~/.config/ags/
```

2. Start or reload AGS.

3. Add a Hyprland keybind:

```ini
bind = $mainMod, C, exec, ags -t calculator
```

4. Optional Hyprland window rules for stronger blur behavior:

```ini
windowrulev2 = float,title:^(calculator)$
windowrulev2 = center,title:^(calculator)$
windowrulev2 = noborder,title:^(calculator)$
windowrulev2 = opacity 1.0 1.0,title:^(calculator)$
```

## Theme Loading

At startup, theme values are resolved from this order:

1. CSS vars from:
   - `~/.config/omarchy/style.css`
   - `~/.config/waybar/style.css`
   - `~/.config/ags/style.css`
2. TOML fallback from:
   - `~/.config/omarchy/theme.toml`
   - `~/.config/omarchy/colors.toml`
3. Hardcoded defaults.

Supported color keys/vars include:

- `primary`, `secondary`, `background`, `accent`, `text`
- CSS aliases like `--bg`, `--fg`, `--surface`, etc.

## Notes

- History is intentionally ephemeral to mirror GNOME Calculator's basic-session behavior.
- Result preview updates while typing when expression parses cleanly.
- If your AGS install has minor API differences, adjust widget props/signals in `config.js`.

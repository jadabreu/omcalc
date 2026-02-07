# Omcalc

Minimal GTK4 calculator tuned for Omarchy and Hyprland workflows.

## Features

- Native GTK4 + Libadwaita app written in GJS.
- Safe expression parser (no `eval`).
- Keyboard-first interaction model.
- Persistent calculation history in `~/.local/state/omcalc/history.json`.
- Theme integration from Omarchy theme files with live refresh.

## Project Layout

- `app/gtk4/` contains the app, engine, scripts, and tests.
- `packaging/aur/omcalc-git/` contains AUR packaging files.

## Run

```bash
./app/gtk4/run.sh
```

## Clear History

```bash
./app/gtk4/clear-history.sh
```

## Test

```bash
./app/gtk4/test.sh
```

## Hyprland Integration

Apply managed Hyprland window-rule blocks:

```bash
./app/gtk4/install.sh
```

Remove managed blocks:

```bash
./app/gtk4/install.sh --uninstall
```

## AUR Packaging

The AUR scaffold is in `packaging/aur/omcalc-git/`.

Before publishing:

1. Set your real upstream URL in `PKGBUILD`.
2. Regenerate metadata:

```bash
cd packaging/aur/omcalc-git
makepkg --printsrcinfo > .SRCINFO
```

## Publish Helper

Use `scripts/publish.sh` to automate commit/push workflows.

Main repo only:

```bash
./scripts/publish.sh --main-message "Add history wipe hint"
```

Main repo + AUR repo sync/push:

```bash
./scripts/publish.sh --main-message "Release update" --sync-aur
```

If your AUR clone is not in `/tmp/aur/omcalc-git`, pass:

```bash
./scripts/publish.sh --main-message "Release update" --sync-aur --aur-repo /path/to/omcalc-git
```

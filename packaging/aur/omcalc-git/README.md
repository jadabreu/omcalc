# omcalc-git (AUR Scaffold)

This folder contains an AUR-ready scaffold for `omcalc-git`.

## Before Publishing

1. Ensure `PKGBUILD` points to the correct upstream:
   - `url='https://github.com/jadabreu/omcalc'`
   - `source=('git+https://github.com/jadabreu/omcalc.git' ...)`
2. Regenerate metadata after each `PKGBUILD` change:
   - `makepkg --printsrcinfo > .SRCINFO`

## Local Validation

- `makepkg --packagelist`
- `makepkg -si`
- `namcap PKGBUILD`
- `namcap *.pkg.tar.zst`

## AUR Publish Flow

1. Create AUR package repo (`omcalc-git`).
2. Copy `PKGBUILD`, `.SRCINFO`, `omcalc`, `omcalc-clear-history`, `omcalc.desktop`.
3. Commit and push to AUR.

# omcalc-git (AUR Scaffold)

This folder contains an AUR-ready scaffold for `omcalc-git`.

## Before Publishing

1. Edit `PKGBUILD` and replace:
   - `url='https://github.com/YOUR_GITHUB_USER/omarchy-calc'`
   - `source=('git+https://github.com/YOUR_GITHUB_USER/omarchy-calc.git' ...)`
2. Regenerate metadata:
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

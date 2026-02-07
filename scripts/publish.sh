#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

SYNC_AUR=false
RUN_TESTS=true
MAIN_MESSAGE=""
AUR_MESSAGE=""
AUR_REPO_PATH="${AUR_REPO_PATH:-/tmp/aur/omcalc-git}"

usage() {
    cat <<'EOF'
Usage:
  ./scripts/publish.sh --main-message "message" [options]

Options:
  --main-message TEXT   Commit message for the main repo (required when there are uncommitted changes)
  --sync-aur            Sync packaging files to AUR repo and push
  --aur-message TEXT    Commit message for AUR repo (defaults to main message)
  --aur-repo PATH       AUR local repo path (default: /tmp/aur/omcalc-git)
  --no-tests            Skip local test run
  -h, --help            Show this help

Examples:
  ./scripts/publish.sh --main-message "Add history wipe hint"
  ./scripts/publish.sh --main-message "Release packaging fix" --sync-aur
  ./scripts/publish.sh --main-message "Release update" --sync-aur --aur-message "Bump pkgrel to 4"
EOF
}

require_cmd() {
    local cmd="$1"
    if ! command -v "$cmd" >/dev/null 2>&1; then
        printf 'Missing required command: %s\n' "$cmd" >&2
        exit 1
    fi
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --main-message)
            MAIN_MESSAGE="${2:-}"
            shift 2
            ;;
        --sync-aur)
            SYNC_AUR=true
            shift
            ;;
        --aur-message)
            AUR_MESSAGE="${2:-}"
            shift 2
            ;;
        --aur-repo)
            AUR_REPO_PATH="${2:-}"
            shift 2
            ;;
        --no-tests)
            RUN_TESTS=false
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            printf 'Unknown argument: %s\n' "$1" >&2
            usage
            exit 1
            ;;
    esac
done

require_cmd git

cd "$ROOT_DIR"

if [[ "$SYNC_AUR" == true ]]; then
    require_cmd makepkg
    printf 'Regenerating .SRCINFO...\n'
    (
        cd packaging/aur/omcalc-git
        makepkg --printsrcinfo > .SRCINFO
    )
fi

if [[ "$RUN_TESTS" == true ]]; then
    printf 'Running local tests...\n'
    ./app/gtk4/test.sh
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
    if [[ -z "$MAIN_MESSAGE" ]]; then
        printf 'Main repo has uncommitted changes; provide --main-message.\n' >&2
        exit 1
    fi

    printf 'Committing main repo changes...\n'
    git add -A
    git commit -m "$MAIN_MESSAGE"
else
    printf 'No uncommitted changes in main repo.\n'
fi

printf 'Pushing main repo...\n'
git push

if [[ "$SYNC_AUR" != true ]]; then
    printf 'Done (main repo only).\n'
    exit 0
fi

if [[ ! -d "$AUR_REPO_PATH/.git" ]]; then
    printf 'AUR repo not found at: %s\n' "$AUR_REPO_PATH" >&2
    printf 'Clone it first: git clone ssh://aur@aur.archlinux.org/omcalc-git.git %s\n' "$AUR_REPO_PATH" >&2
    exit 1
fi

printf 'Syncing packaging files to AUR repo...\n'
cp "$ROOT_DIR/packaging/aur/omcalc-git/PKGBUILD" "$AUR_REPO_PATH/PKGBUILD"
cp "$ROOT_DIR/packaging/aur/omcalc-git/.SRCINFO" "$AUR_REPO_PATH/.SRCINFO"
cp "$ROOT_DIR/packaging/aur/omcalc-git/omcalc" "$AUR_REPO_PATH/omcalc"
cp "$ROOT_DIR/packaging/aur/omcalc-git/omcalc-clear-history" "$AUR_REPO_PATH/omcalc-clear-history"
cp "$ROOT_DIR/packaging/aur/omcalc-git/omcalc.desktop" "$AUR_REPO_PATH/omcalc.desktop"

cd "$AUR_REPO_PATH"

if git diff --quiet && git diff --cached --quiet; then
    printf 'No AUR changes to commit.\n'
    exit 0
fi

if [[ -z "$AUR_MESSAGE" ]]; then
    AUR_MESSAGE="$MAIN_MESSAGE"
fi

if [[ -z "$AUR_MESSAGE" ]]; then
    AUR_MESSAGE="Update AUR package files"
fi

printf 'Committing AUR repo changes...\n'
git add PKGBUILD .SRCINFO omcalc omcalc-clear-history omcalc.desktop
git commit -m "$AUR_MESSAGE"

printf 'Pushing AUR repo...\n'
git push

printf 'Done (main repo + AUR repo).\n'

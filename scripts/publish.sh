#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

SYNC_AUR=false
RUN_TESTS=true
AUTO_STAGE=false
DRY_RUN=false
ASSUME_YES=false
REGEN_SRCINFO=false
MAIN_MESSAGE=""
AUR_MESSAGE=""
AUR_REPO_PATH="${AUR_REPO_PATH:-/tmp/aur/omcalc-git}"

usage() {
    cat <<'EOF'
Usage:
  ./scripts/publish.sh --main-message "message" [options]

Options:
  --main-message TEXT   Commit message for the main repo (required when committing)
  --sync-aur            Sync packaging files to AUR repo and push
  --aur-message TEXT    Commit message for AUR repo (defaults to main message)
  --aur-repo PATH       AUR local repo path (default: /tmp/aur/omcalc-git)
  --auto-stage          Stage a scoped set of project files automatically
  --regen-srcinfo       Regenerate packaging/aur/omcalc-git/.SRCINFO (use with --sync-aur)
  --dry-run             Print what would run without changing anything
  -y, --yes             Skip push confirmation prompts
  --no-tests            Skip local test run
  -h, --help            Show this help

Examples:
  ./scripts/publish.sh --main-message "Add history wipe hint" --auto-stage
  ./scripts/publish.sh --main-message "Release packaging fix" --sync-aur --auto-stage --regen-srcinfo
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

run_cmd() {
    if [[ "$DRY_RUN" == true ]]; then
        printf '[dry-run] '
        printf '%q ' "$@"
        printf '\n'
        return 0
    fi
    "$@"
}

confirm_or_exit() {
    local prompt="$1"

    if [[ "$ASSUME_YES" == true || "$DRY_RUN" == true ]]; then
        return 0
    fi

    read -r -p "$prompt [y/N] " answer
    case "$answer" in
        y|Y|yes|YES)
            return 0
            ;;
        *)
            printf 'Aborted.\n' >&2
            exit 1
            ;;
    esac
}

has_unstaged_or_untracked() {
    [[ -n "$(git diff --name-only)" || -n "$(git ls-files --others --exclude-standard)" ]]
}

has_staged_changes() {
    [[ -n "$(git diff --cached --name-only)" ]]
}

stage_main_changes() {
    # Update tracked files first.
    run_cmd git add -u

    # Add common project paths for new files, if they exist.
    local path
    for path in README.md LICENSE scripts app/gtk4 packaging/aur/omcalc-git; do
        if [[ -e "$path" ]]; then
            run_cmd git add "$path"
        fi
    done
}

ensure_main_repo_state() {
    if [[ "$AUTO_STAGE" == true ]]; then
        printf 'Auto-staging scoped main repo changes...\n'
        stage_main_changes
        return
    fi

    if has_unstaged_or_untracked; then
        printf 'Main repo has unstaged or untracked files.\n' >&2
        printf 'Stage intentionally, or rerun with --auto-stage.\n' >&2
        git status --short >&2
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
        --auto-stage)
            AUTO_STAGE=true
            shift
            ;;
        --regen-srcinfo)
            REGEN_SRCINFO=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -y|--yes)
            ASSUME_YES=true
            shift
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

ensure_main_repo_state

if [[ "$RUN_TESTS" == true ]]; then
    printf 'Running local tests...\n'
    run_cmd ./app/gtk4/test.sh
fi

if [[ "$SYNC_AUR" == true && "$REGEN_SRCINFO" == true ]]; then
    require_cmd makepkg
    printf 'Regenerating .SRCINFO...\n'
    if [[ "$DRY_RUN" == true ]]; then
        printf '[dry-run] (cd packaging/aur/omcalc-git && makepkg --printsrcinfo > .SRCINFO)\n'
    else
        (
            cd packaging/aur/omcalc-git
            makepkg --printsrcinfo > .SRCINFO
        )
    fi

    if [[ "$AUTO_STAGE" == true ]]; then
        stage_main_changes
    elif has_unstaged_or_untracked; then
        printf 'Regenerating .SRCINFO created unstaged changes; stage them or use --auto-stage.\n' >&2
        git status --short >&2
        exit 1
    fi
fi

if has_staged_changes; then
    if [[ -z "$MAIN_MESSAGE" ]]; then
        printf 'Main repo has staged changes; provide --main-message.\n' >&2
        exit 1
    fi

    printf 'Committing main repo changes...\n'
    run_cmd git commit -m "$MAIN_MESSAGE"
else
    printf 'No staged changes in main repo.\n'
fi

printf 'Pushing main repo...\n'
confirm_or_exit 'Push main repo now?'
run_cmd git push

if [[ "$SYNC_AUR" != true ]]; then
    printf 'Done (main repo only).\n'
    exit 0
fi

if [[ ! -d "$AUR_REPO_PATH/.git" ]]; then
    printf 'AUR repo not found at: %s\n' "$AUR_REPO_PATH" >&2
    printf 'Clone it first: git clone ssh://aur@aur.archlinux.org/omcalc-git.git %s\n' "$AUR_REPO_PATH" >&2
    exit 1
fi

if [[ -n "$(git -C "$AUR_REPO_PATH" status --short)" ]]; then
    printf 'AUR repo has local changes. Commit/stash there first to avoid accidental mixing.\n' >&2
    git -C "$AUR_REPO_PATH" status --short >&2
    exit 1
fi

printf 'Syncing packaging files to AUR repo...\n'
run_cmd cp "$ROOT_DIR/packaging/aur/omcalc-git/PKGBUILD" "$AUR_REPO_PATH/PKGBUILD"
run_cmd cp "$ROOT_DIR/packaging/aur/omcalc-git/.SRCINFO" "$AUR_REPO_PATH/.SRCINFO"
run_cmd cp "$ROOT_DIR/packaging/aur/omcalc-git/omcalc" "$AUR_REPO_PATH/omcalc"
run_cmd cp "$ROOT_DIR/packaging/aur/omcalc-git/omcalc-clear-history" "$AUR_REPO_PATH/omcalc-clear-history"
run_cmd cp "$ROOT_DIR/packaging/aur/omcalc-git/omcalc.desktop" "$AUR_REPO_PATH/omcalc.desktop"

cd "$AUR_REPO_PATH"

if [[ -z "$(git status --short)" ]]; then
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
run_cmd git add PKGBUILD .SRCINFO omcalc omcalc-clear-history omcalc.desktop
run_cmd git commit -m "$AUR_MESSAGE"

printf 'Pushing AUR repo...\n'
confirm_or_exit 'Push AUR repo now?'
run_cmd git push

printf 'Done (main repo + AUR repo).\n'

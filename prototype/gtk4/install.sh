#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
APP_CMD="$SCRIPT_DIR/run.sh"

HYPR_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/hypr"
START_MARKER="# >>> omcalc (managed) >>>"
END_MARKER="# <<< omcalc (managed) <<<"
LEGACY_START_MARKER="# >>> omarchy-calc (managed) >>>"
LEGACY_END_MARKER="# <<< omarchy-calc (managed) <<<"

usage() {
    cat <<EOF
Usage:
  $(basename "$0") [--uninstall]

Options:
  --uninstall   Remove managed Omcalc Hyprland config blocks.
EOF
}

pick_hypr_file() {
    local default_file="$1"
    shift

    for name in "$@"; do
        if [[ -f "$HYPR_DIR/$name" ]]; then
            printf '%s\n' "$HYPR_DIR/$name"
            return 0
        fi
    done

    printf '%s\n' "$HYPR_DIR/$default_file"
}

is_file_sourced_by_hypr() {
    local target_file="$1"
    local main_conf="$HYPR_DIR/hyprland.conf"

    if [[ ! -f "$main_conf" ]]; then
        return 1
    fi

    local target_abs
    target_abs=$(realpath -m "$target_file")

    while IFS= read -r line; do
        local source_path raw_path expanded abs_path
        raw_path=${line#source =}
        source_path=$(echo "$raw_path" | xargs)

        if [[ -z "$source_path" ]]; then
            continue
        fi

        if [[ "$source_path" == "~/.config/"* ]]; then
            local relative_path
            relative_path="${source_path#\~/.config/}"
            expanded="${XDG_CONFIG_HOME:-$HOME/.config}/$relative_path"
        else
            expanded=${source_path/#\~/$HOME}
        fi
        abs_path=$(realpath -m "$expanded")

        if [[ "$abs_path" == "$target_abs" ]]; then
            return 0
        fi
    done < <(grep -E '^\s*source\s*=' "$main_conf" || true)

    return 1
}

pick_sourced_hypr_file() {
    local fallback="$1"
    shift

    local candidate
    for candidate in "$@"; do
        local candidate_path="$HYPR_DIR/$candidate"
        if is_file_sourced_by_hypr "$candidate_path"; then
            printf '%s\n' "$candidate_path"
            return 0
        fi
    done

    pick_hypr_file "$fallback" "$@"
}

strip_managed_block() {
    local file="$1"
    local tmp

    if [[ ! -f "$file" ]]; then
        return 0
    fi

    tmp=$(mktemp)
    awk -v start="$START_MARKER" -v end="$END_MARKER" \
        -v legacy_start="$LEGACY_START_MARKER" -v legacy_end="$LEGACY_END_MARKER" '
        $0 == start || $0 == legacy_start { skip = 1; next }
        $0 == end || $0 == legacy_end { skip = 0; next }
        skip != 1 { print }
    ' "$file" > "$tmp"
    mv "$tmp" "$file"
}

append_managed_block() {
    local file="$1"
    local block="$2"

    mkdir -p "$(dirname "$file")"
    : > "${file}.tmp-omcalc"

    if [[ -f "$file" ]]; then
        cat "$file" >> "${file}.tmp-omcalc"
        printf '\n' >> "${file}.tmp-omcalc"
    fi

    printf '%s\n' "$START_MARKER" >> "${file}.tmp-omcalc"
    printf '%s\n' "$block" >> "${file}.tmp-omcalc"
    printf '%s\n' "$END_MARKER" >> "${file}.tmp-omcalc"
    mv "${file}.tmp-omcalc" "$file"
}

install_blocks() {
    local bindings_file windows_file
    bindings_file=$(pick_sourced_hypr_file "bindings.conf" "bindings.conf" "keybindings.conf")
    windows_file=$(pick_sourced_hypr_file "looknfeel.conf" "windows.conf" "looknfeel.conf" "windowrules.conf")

    local windows_block
    windows_block=$(cat <<'EOF'
windowrule = float on, match:title ^(Omcalc)$
windowrule = center on, match:title ^(Omcalc)$
windowrule = size 430 620, match:title ^(Omcalc)$
EOF
)

    # Remove old managed blocks from previous installer versions/targets.
    strip_managed_block "$bindings_file"
    strip_managed_block "$HYPR_DIR/windows.conf"
    strip_managed_block "$HYPR_DIR/looknfeel.conf"
    strip_managed_block "$HYPR_DIR/windowrules.conf"
    append_managed_block "$windows_file" "$windows_block"

    printf 'Installed Hyprland window rules in: %s\n' "$windows_file"
    printf 'No keybinding was added automatically.\n'
    printf 'Optional keybind (add manually): bindd = SUPER, C, Omcalc, exec, %s\n' "$APP_CMD"
}

uninstall_blocks() {
    local bindings_file windows_file
    bindings_file=$(pick_sourced_hypr_file "bindings.conf" "bindings.conf" "keybindings.conf")
    windows_file=$(pick_sourced_hypr_file "looknfeel.conf" "windows.conf" "looknfeel.conf" "windowrules.conf")

    strip_managed_block "$bindings_file"
    strip_managed_block "$windows_file"
    strip_managed_block "$HYPR_DIR/windows.conf"
    strip_managed_block "$HYPR_DIR/looknfeel.conf"
    strip_managed_block "$HYPR_DIR/windowrules.conf"

    printf 'Removed managed Omcalc blocks from: %s\n' "$bindings_file"
    printf 'Removed managed Omcalc blocks from: %s\n' "$windows_file"
}

reload_hyprland_if_available() {
    if command -v hyprctl >/dev/null 2>&1; then
        if hyprctl reload >/dev/null 2>&1; then
            printf 'Hyprland reloaded.\n'
            return 0
        fi
    fi
    printf 'Hyprland was not reloaded automatically. Run: hyprctl reload\n'
}

main() {
    if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
        usage
        exit 0
    fi

    if [[ "${1:-}" == "--uninstall" ]]; then
        uninstall_blocks
        reload_hyprland_if_available
        exit 0
    fi

    if [[ $# -gt 0 ]]; then
        usage
        exit 1
    fi

    install_blocks
    reload_hyprland_if_available
}

main "$@"

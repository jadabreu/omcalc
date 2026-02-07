#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
exec gjs -m "$SCRIPT_DIR/omarchy_calc_ui.js" --clear-history

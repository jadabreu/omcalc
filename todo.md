# Omcalc TODO

- [ ] Eliminate keypad resize jitter completely.
  - Implement a fixed keypad slot (reserved height) so window geometry never changes when toggling keypad.

- [ ] Ensure single-instance launch behavior.
  - If calculator is already running, focus/toggle existing window instead of spawning a new process.

- [ ] Add optional "copy on Enter" workflow.
  - Introduce a setting/toggle for auto-copying result to clipboard after successful calculation.

- [ ] Improve calculation behavior parity with GNOME Calculator (basic mode).
  - Add `%`, `±`, and smarter decimal/operator input behavior.

- [ ] Complete packaging/install polish.
  - Finalize install/uninstall flow with desktop entry and robust Hyprland rule integration.

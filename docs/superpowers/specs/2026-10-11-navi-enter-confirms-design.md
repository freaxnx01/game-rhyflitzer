# Navi destination: Enter confirms, the hint says so (#206)

## Findings
- **Enter already confirms.** `jumpKey` in `prototype/index.html` sends `Enter`/`NumpadEnter` to `pickJump(JUMP.sel)`, which for `JUMP.mode === 'navi'` calls `startNavi` and closes the dialog. `test_i_opens_the_navigate_dialog_and_enter_starts_the_navi` in `prototype/tests/test_navi.py` covers it. No second **I** is ever required.
- **The second I closes.** `JUMP_CLOSE_KEYS = { jump: 'KeyJ', drive: 'KeyO', navi: 'KeyI' }`: with an empty search field the opening key closes the dialog (#86). With text in the field it is just typed.
- **The hint misleads.** `naviHint` = "tippen zum Suchen · ↑↓ Enter · I / Esc schliesst": it names **I** as a key and never says what Enter does ("Enter" sits next to the arrows, "I / Esc" is the only verb). The tester read "I" as the confirm key. J (`jumpHint`) and O (`driveHint`) share the flow and the same wording.

## Design
Text-only. Keep the toggle-close (#86 and its tests) but stop advertising it. Hints for all three modes: DE "tippen zum Suchen · ↑↓ wählen · Enter bestätigt · Esc schliesst"; EN "type to search · ↑↓ choose · Enter confirms · Esc closes". The opening key still closes an empty dialog, silently.

## Assumptions
- **A1** [high] Fix is the three hint strings, no key-logic change. Rejected: moving confirm to another key; `jumpKey` already routes Enter to `pickJump`.
- **A2** [med] Keep J/I/O closing an empty dialog. Rejected: Esc-only close; it would change #86 behaviour and tests for J/O the issue only asks to "check".
- **A3** [high] J, O and I get the same hint wording (shared `renderJump`, `$('jumphint')` line).

## [needs maintainer]
- Should the opening key stop closing the empty dialog altogether (Esc only)? Default: no, keep it.

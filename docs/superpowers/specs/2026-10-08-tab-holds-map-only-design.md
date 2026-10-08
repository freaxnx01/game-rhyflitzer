# Holding Tab shows only the big map (#129)

## Goal

Holding **Tab** (full map, #77) must not move the browser focus. Only the big map shows.

## Cause (corrects the issue text)

The `keydown` handler (`prototype/index.html:1144`) does list `'Tab'` in its final `preventDefault()` array, but that
line is only reached on the first, non-repeat keydown: `if (e.repeat) return;` exits earlier. A held key sends
auto-repeat keydowns, and those are never prevented, so the browser tabs through buttons and links while Tab is held.

## Decisions

| Topic | Decision |
|---|---|
| Fix | Call `e.preventDefault()` for `Tab` immediately after the `pauseKey(e)` check and **before** `if (e.repeat) return;`. The existing `'Tab'` in the final array stays (no churn). |
| Jump/drive dialog | Unchanged. The dialog branch (`if (!$('jump').hidden) { jumpKey(e); return; }`) runs first and returns, so Tab there keeps default behaviour; the search field is not affected. |
| Pause menu | Unchanged. `pauseKey(e)` runs first; where it handles/ignores Tab, focus handling is as today (`test_pause.py` expects Tab to move focus inside the pause menu). |
| Start screen | Tab was already prevented on the first press there; now consistently on repeats too. Accepted: no keyboard focus navigation through the start overlay with Tab. |

## Tests

Playwright in `prototype/tests/test_full_map.py`: in a running game press Tab down twice (the second is an auto-repeat
keydown), assert `document.activeElement` is `BODY`, `__mm.map().full` is true; release and it is false. A second
test: in the J dialog, Tab does not break typing in the search field (field keeps the focus, typed text arrives).

## Docs

CHANGELOG `[Unreleased]` / `### Fixed` (player-facing); a line in `test-todo.md`.

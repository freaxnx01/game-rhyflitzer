# Held J keeps the jump dialog open — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-03 · Issue #86

## Goal

Holding **J** past the OS key-repeat delay opens the jump dialog and closes it again at once. After the fix, holding J opens the dialog and it stays open. The search field stays empty while J is held. A fresh J press on an empty field still closes the dialog, and J is still a normal letter once the field has text.

## Reproduction (headless Playwright, `main` @ `9ba2994`)

`page.keyboard.down("KeyJ")` three times. In Chromium the second and third calls fire `keydown` with `repeat: true`, as an OS auto-repeat does. A capture listener logged `['KeyJ', 'KeyJ:rep', 'KeyJ:rep']`.

| Step | Today | Issue's suggested fix (`if (e.repeat && e.code === 'KeyJ') return;`) | This design |
|---|---|---|---|
| J down | open, `''` | open, `''` | open, `''` |
| 1st repeat | **closed** | open, **`'j'`** | open, `''` |
| 2nd repeat | closed | open, **`'jj'`** | open, `''` |
| J up, then J press | (opens) | — | closed |
| field `'ba'`, J held | — | — | open, `'bajj'` (typed, as today) |

A synthetic `dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyJ', repeat: true}))` closes the dialog the same way today.

## Root cause

- The main `keydown` listener (`prototype/index.html:929`) routes every key to `jumpKey(e)` while `#jump` is visible. This happens **before** its own `if (e.repeat) return`.
- `jumpKey` (`index.html:1083-1087`) never reads `e.repeat`. The first repeated `KeyJ` arrives with `#jumpq` still empty (the opening press called `preventDefault`, so no letter was typed). It takes the `e.code === 'KeyJ' && !$('jumpq').value` branch and calls `closeJump()`.
- The next repeat finds `#jump` hidden. It goes to the main listener, which drops it on `e.repeat`. So the dialog stays closed until J is released.
- Simply returning on a repeated J (the issue's suggestion) skips `preventDefault`, so the browser types each repeat into the focused search field. Proven above: `'jj'`, which filters the list to "Random spot" only.

## Which keys have this bug

The pattern is "a dialog's own key handler runs before the main listener's repeat guard and toggles on a repeat".

- **J: affected** (this issue). Also **Esc** in the same branch: a held Esc would close on a repeat. That only matters if Esc is held while J is pressed, so it is harmless, but the same guard covers it.
- **F1, `?`, F3, T, C, F, R, H, Enter, M, V, G, K, Q, E, `+`, `=`, `-`: not affected.** They live after `if (e.repeat) return` in the main listener (`index.html:929`). Playwright: holding F1 keeps `#help` open, holding F3 keeps `#debug` open.
- **Arrow ↑/↓ in the dialog:** repeats move the selection. That is wanted (scrolling a list), unchanged.
- **Enter in the dialog:** the first press picks and closes. Later repeats go to the main listener and are dropped. Unchanged.
- **Tab (#77, full map):** not on `main` yet. Its spec makes Tab a hold key read from `keys.Tab`, so it cannot flicker.
- **O (#18, autopilot, a second J mode):** not on `main` yet. Its plan rewrites exactly the `e.code === 'KeyJ'` part of the same `jumpKey` condition into `e.code === (JUMP.mode === 'drive' ? 'KeyO' : 'KeyJ')`. The autopilot spec already says #86's fix in the shared `jumpKey` covers O. The guard here sits outside that subexpression, so O inherits it.
- **Esc/P pause (#83, PR #90, unmerged):** `pauseKeyAction` in `prototype/pause.js` returns `'ignore'` for a repeated Esc/P, so the toggle itself is safe. One gap of the same kind: `menuAction` returns `'debug'` for **F3 without a repeat check**, and `pauseKey` runs before the main repeat guard. Holding F3 in the pause menu would flicker the debug view. That code is not on `main`, so it is out of scope here and is reported to PR #90.

## Design

One change in `jumpKey`'s close branch (`index.html:1086`):

```js
  if (e.code === 'Escape' || (e.code === 'KeyJ' && !$('jumpq').value)) { e.preventDefault(); if (!e.repeat) closeJump(); }
```

- A repeated J on an empty field is swallowed: `preventDefault` still runs, so no letter is typed, and the dialog stays open.
- A fresh (non-repeat) J or Esc closes as today.
- J with text in the field never enters this branch, so held J keeps typing letters, as today.
- The rule is "a held key never toggles the dialog". It is written once at the close action, not per key, so a later close key (O from #18) gets it for free.

## Acceptance criteria

- Holding J (one `keydown` plus repeated `keydown` with `repeat: true`) opens the dialog, and it stays open with an empty search field.
- After releasing J, a fresh J press on an empty field closes the dialog.
- With text in the field, J is typed, held or not (existing `test_j_types_with_text_and_closes_when_empty_esc_closes` stays green).
- Esc closes the dialog as before.
- A Playwright test reproduces the hold, and fails on today's `main`.
- `CHANGELOG.md` `[Unreleased]` → `Fixed` has a player-facing line.

## Testing

- New Playwright test in `prototype/tests/test_jump.py`: `test_holding_j_keeps_the_dialog_open`. It uses `page.keyboard.down("KeyJ")` three times (which fires `repeat: true`). It asserts the dialog is visible and `#jumpq` is `''`. Then it releases J, presses J, and asserts the dialog is hidden. It fails on `main` at the first assertion after the first repeat.
- Existing `test_jump.py` tests stay unchanged and green.
- No `node:test`: the change is one condition inside an inline handler, and there is no pure module to test.

## Assumptions

- **A1** [high] Guard the close action (`preventDefault` always, `closeJump` only when `!e.repeat`). Rejected: the issue's `if (e.repeat && e.code === 'KeyJ') return;`. Headless Playwright showed it types `'jj'` into the search field (table above).
- **A2** [high] Esc shares the guard: a repeated Esc no longer closes. Rejected: a J-only condition. Esc repeats inside the dialog only happen if Esc was held when J was pressed, and one rule for all close keys is what #18's O needs.
- **A3** [high] Arrow repeats keep moving the selection, and Enter is not changed. Evidence: `jumpKey` `index.html:1084-1085`. A held Enter picks once, then the dialog is hidden and the main guard drops the rest.
- **A4** [med] The F3-in-pause-menu repeat gap in PR #90 (`prototype/pause.js` `menuAction`) is reported to that PR, not fixed in this issue. Rejected: folding it into #86. That code is not on `main`, and fixing it here would mean editing an unmerged branch.

## Consequences

- #18's plan text (`jumpKey`: change `(e.code === 'KeyJ' && !$('jumpq').value)` to the O/J form) still applies verbatim, because the subexpression is unchanged.
- No other key, HUD or gameplay behaviour changes.

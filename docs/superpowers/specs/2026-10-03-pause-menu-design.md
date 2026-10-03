# Pause menu — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-03 · Issue #83

## Goal

Issue #83: „Pause the game. Go back to the main menu."

Success: during a run, **Esc** or **P** (or the **II** button on screen) freezes the game and opens a pause menu with three real buttons: **Resume**, **Restart race** and **Main menu**. While paused, the car (or the helicopter), the race timer and every sound stand still. Hiding the tab pauses the game too. The menu works with the keyboard alone, with the mouse, and with a finger at phone width.

## Starting point (verified 2026-10-03 on `main` @ `7e3f272`)

- **Start / result screen:** `#overlay` (`prototype/index.html:167-196`) is the start screen and, after the finish, the result screen. `#startbtn` (`index.html:185`) calls `SFX.start(); startRace()` (`index.html:1011`). `renderOverlay` (`index.html:1010`) picks the texts from `R.state` (`'finished'` → result, otherwise intro). There is no way back to it during a run today.
- **Race state:** `R = { state: 'ready' | 'armed' | 'racing' | 'finished', t, best, … }` (`index.html:999`). `startRace` (`index.html:1004`) resets checkpoints, `R`, damage and the car (`resetCar` to `START`) and hides `#overlay`. `stepRace` (`index.html:1006`) moves `armed` → `racing` once the car moves and adds `dt` to `R.t` while racing. `finish` (`index.html:1007`) stores the best time and shows `#overlay`.
- **Loop:** `loop` (`index.html:1104`) clamps `dt` to 0.05 s and every frame runs `stepCar` (not in `'ready'`) and `stepRace` up to 3× (Tab), then `stepCamera`, `hud`, `SFX.update`, the water texture scroll and `renderer.render`. Nothing stops it; a hidden tab only stops because the browser stops `requestAnimationFrame`, while the engine drone keeps playing.
- **Keys:** one `keydown` listener (`index.html:889`). The open **J** dialog takes every key first (`jumpKey`, `index.html:1023-1027`). **Esc** today only closes the F1 help (and the J dialog via `jumpKey`). **P** is free (free letters per the #10 spec: F, I, L, O, P, U, X, Y, Z; #10 takes F, #65 takes B). The listener `preventDefault`s Space, the arrows, Ctrl and Tab. `blur` clears `keys`; `openJump` clears `keys` too (`index.html:1019`).
- **Sound:** `SFX` (`index.html:898-914`) owns one `AudioContext` `ac`, created on Start. Its `ctx()` resumes a suspended context on every sound call. The engine drone is a pair of oscillators that run as long as `ac` runs.
- **F1 help** `#help` (`index.html:109-128`), **J dialog** `#jump` (`index.html:129`), **F3 debug** `#debug` + `toggleDebug` / `debugTick` (`index.html:1077-1098`), all inside `#hud` (`pointer-events:none`, elements opt back in).
- **Touch:** `#touch` (`index.html:159-165`, CSS `index.html:76-80`) shows round buttons on `(pointer:coarse)` only. J, G and F3 are keyboard-only.
- **#game-nav:** on phones (≤ 600 px) it is hidden while `#overlay` is visible (`index.html:1114`), because it would sit on the dialog's buttons.
- **Helicopter (#10):** spec and plan on `main`, not implemented yet. It adds `FLY.on`, runs `stepFly` instead of `stepCar` inside the same loop step block, and claims **F**, Space (climb) and Shift (sink) in flight.
- **Tab (#77):** being enriched in parallel; Tab may stay the 3× time-lapse or become something else (e.g. a full map while held).
- **i18n (#9):** strings via `tr()` from `prototype/strings.js` (en and de, equal keys, no `ß`); static markup carries `data-i18n` / `data-i18n-aria` and is re-rendered by `applyStaticStrings` on `gg-langchange`.
- **Tests:** `node --test prototype/tests/*.test.mjs` for pure modules; pytest + Playwright `prototype/tests/test_*.py`, hand layout with world and terrain blocked.

## Decisions

| Topic | Decision |
|---|---|
| Keys | **Esc** or **P** pauses; while paused, **Esc** or **P** resumes. Key repeats are ignored (holding P does not flicker). With the F1 help open, Esc only closes the help (as today); P pauses and closes the help. With the J dialog open, the dialog keeps every key (Esc closes it, P is typed). |
| When | Only during a run: `#overlay` hidden **and** `R.state` is `'armed'` or `'racing'`. On the start and result screens Esc / P do nothing new. |
| Menu | A new `#pause` dialog (`role="dialog"`, `aria-modal`, `aria-labelledby`) after `#overlay`, styled with the existing `.panel` / `.btn`: title **Paused**, then three `<button>`s stacked full width: **Resume** (primary), **Restart race**, **Main menu**, and a hint line „Esc · P resume". |
| Frozen | While paused the loop skips the whole step block (car or flight, race, camera, `hud`, `SFX.update`, water scroll) and only runs `debugTick()` and `renderer.render`. `R.t` and `P` do not change. `keys` is cleared when the pause opens. |
| Sound | `SFX.suspend()` suspends the `AudioContext` when the pause opens and `SFX.resume()` resumes it on close. While suspended, `ctx()` does not auto-resume (a `held` flag). No AudioContext yet (cannot happen in a run, but harmless): no-op. |
| Keyboard in the menu | The pause opens with focus on **Resume**. ↓ / ↑ (also → / ←) and Tab / Shift+Tab move focus through the three buttons with wrap-around (focus stays inside the dialog). **Enter** and **Space** press the focused button (native button behaviour, not prevented). Every other game key is ignored: no horn, no camera, no J, no F (#10), no Tab time-lapse or map (#77), no F1. **F3** still toggles the debug panel. |
| Resume | Hides `#pause`, blurs the focused button (so the next Space / Enter is a game key again, cf. the i18n blur lesson), resumes the sound. The game continues exactly where it stopped. |
| Restart race | Closes the pause, then calls `startRace()`: same as a fresh Start (checkpoints, timer, damage, car to `START`; with #10 merged, `resetCar` also ends a flight). |
| Main menu | Closes the pause, abandons the run without a confirmation: `R.state = 'ready'`, `R.t = 0`, car back to `START` and stopped, `#result` hidden, `renderOverlay()`, `#overlay` shown, focus on **Start**. The best time is untouched; an abandoned run is never recorded. |
| Auto-pause | On `visibilitychange` with `document.hidden` during a run, the pause opens. Coming back, the game stays paused until the player resumes. |
| Touch / mouse | A **II** button `#pausebtn` (48 × 48 px, `aria-label` „Pause") in `#hud`, top right under the compass, on every device (touch and mouse). It only acts during a run. |
| Phone width | `#pause .btn` wraps its text and scales its font (`clamp`), the panel fits a 360 px wide viewport without horizontal scrolling. `#game-nav` is hidden on phones while `#pause` is visible (same rule as `#overlay`). |
| Debug (F3) | Works while paused: the panel shows the frozen position. The pause backdrop is a light, even dim so the frozen scene, HUD and debug panel stay readable behind the menu. Clicking the panel to copy needs the game resumed (the backdrop takes the clicks). |
| Helicopter (#10) | Paused like the car: the guard wraps the loop's whole step block, so `stepFly` stands still too; **F** is ignored while paused. Restart / Main menu end a flight through `resetCar`. |
| Tab (#77) | While paused, Tab only moves focus in the menu, whatever Tab does in a run after #77. |
| Pure logic | New pure module `prototype/pause.js` (no DOM): `PAUSE_BUTTONS`, `canPause(overlayHidden, raceState)`, `pauseKeyAction(key, state)` and `nextFocus(ids, current, step)`, unit-tested with `node --test`. `index.html` keeps the glue. |
| Strings | New keys (en / de): `pauseTitle`, `pauseResume`, `pauseRestart`, `pauseMenu`, `pauseHint`, `pauseAria`, `keyPause` (F1 help line and the start screen's key list). |
| Test hooks | `__mm.pause()` → `{ on, frame, state, t, x, z, audio, focus }` (`frame` counts loop calls, so a test can wait for frames to pass while paused) (`audio` = `ac.state` or `null`, `focus` = id of the focused element). |

## Assumptions

- **A1** [high] [confirmed] **Esc or P** opens a pause overlay with **Resume**, **Restart race** and **Main menu**; the simulation, race timer and sounds stop while paused; the game auto-pauses when the tab is hidden; real `<button>`s with keyboard navigation, working at phone width; touch gets a pause button. Decided by the user on 2026-10-03.
- **A2** [med] Pausing only during a run (`armed` / `racing`, overlay hidden). Rejected: pausing on the start or result screen (nothing runs there; `stepCar` is already skipped in `'ready'`, `index.html:1104`).
- **A3** [med] **Main menu** abandons the run without a confirmation and never records it; the best time stays. Rejected: an „Abandon run?" confirm (one more dialog for a prototype time trial, and Restart / Start cost nothing); keeping the run resumable from the menu (the start screen has no „continue" and #83 asks for the main menu).
- **A4** [med] With the F1 help open, Esc closes the help only; a second Esc pauses. Rejected: Esc closing the help and pausing at once. Evidence: Esc closes the help today (`index.html:889`); the J dialog likewise keeps Esc for itself (`index.html:1026`).
- **A5** [med] After an auto-pause the game stays paused when the tab comes back. Rejected: auto-resume on return (the player may not be ready; the house rule for games is to never keep simulating a backgrounded tab, and a resume is one key). Window blur without hiding the tab does **not** pause (only clears keys, as today).
- **A6** [med] All other game keys are ignored while paused, F3 excepted; Tab moves focus in the menu. Rejected: letting M (mute), T (style), V, G work while paused — they would change a frozen world the player cannot see well behind the dim, and Tab's game meaning is being reworked in #77.
- **A7** [med] The **II** button sits top right under the compass and shows on every device. Rejected: inside `#touch` only (`pointer:coarse`), because a mouse player also benefits from a visible pause; bottom centre, because the speedometer and the minimap meet there at phone width (`index.html:54`).
- **A8** [med] F3 stays usable while paused with a light, even dim backdrop; copying the panel needs a resume. Rejected: lifting `#debug` above the backdrop (it lives in `#hud`'s stacking context, `index.html:34`, so it would mean moving it out of `#hud`); ignoring F3 while paused (a frozen moment is exactly when coordinates are worth reading).
- **A9** [med] A small pure module `pause.js` for the key and focus rules. Rejected: inline code only in `index.html` (the key table has ten cases and is easiest to pin with `node --test`, like `debug.js`).
- **A10** [high] Sound pauses by suspending the `AudioContext`, not by muting gains. Evidence: the engine oscillators run as long as `ac` runs (`index.html:901`), and `ctx()` auto-resumes (`index.html:900`), so it needs the `held` guard.
- **A11** [high] New UI text goes through `tr()` with en and de entries (`strings.test.mjs` enforces equal keys and no `ß`).

## Consequences

- A tab in the background no longer drones: the engine sound stops with the auto-pause.
- In browser fullscreen (the #game-nav fullscreen toggle), the browser takes **Esc** to leave fullscreen and the game never sees it; **P** or the **II** button pause there.
- Space or Enter pressed while the menu has focus presses a menu button (Resume is focused first) — by design, but a player who hammers Space on a frozen screen resumes the game.
- Toasts and the turn-signal blink freeze with the game and continue after the resume.
- Restart from the pause menu counts as a fresh run (jump / time-lapse / flight flags cleared by `startRace`).
- The #77 enrichment and the #10 implementation will both touch the same `keydown` listener and loop line; the pause guard sits before their branches, so it needs no change when they land, but merge conflicts on those one-liners are likely.

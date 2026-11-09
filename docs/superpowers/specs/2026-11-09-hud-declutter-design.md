# Declutter the driving HUD (#773) — approach B, "mode-aware + fading secondary"

The driving HUD has grown feature by feature until every corner is occupied (survey screenshots of `main`, 2026-11-09,
desktop 1920×1080 ×2 and a 390×844 touch phone, cruise and time trial). The maintainer chose **approach B** on
2026-11-09: show only what the mode needs, let everything secondary fade to a ghost, and fold the compass into the
minimap. Approach C ("HUD levels" full / reduced / clean, #536, #749) can be layered on later and is **not** done here.

Already on `main`, built on and not redone:

- PR#785 (#776): on phones (`max-width:600px and pointer:coarse`) `#game-nav` is hidden while driving, `#stylebtn` is
  hidden and `#pausestyle` in the pause menu is the style switch; the time-trial header rows were fixed.
- PR#774 (#735): the car radio shows its state for `RADIO_SHOW_S` = 3 s in `#toast` (`radioShow()`), with `#radiobtn`
  next to `#pausebtn` on touch devices. That transient display is the model for the fade here.

## What stays lit (the primary four)

Speed (`#speedo`), direction (the minimap's car marker plus the new heading text), time (`#time`, where the mode has
a clock) and the map (`#br`) never fade. The checkpoint arrow, distance and name (`#arrow`, `#dist`, `#cpname`) are
the race's live target and stay too, as does `#toast` and `#pausebtn` / `#radiobtn`.

## Mode-aware

The CSS rules in `index.html` already do most of this and stay the single source of truth for *what a mode shows*:

- `body.cruise #tl .cps:not(#knockrow), body.cruise #pips, body.cruise #tr, body.cruise #arrow, body.cruise #dist, body.cruise #cpname {display:none}` (#551)
- `body.tutorial #tr {display:none}` (#534)

Blitz, hunt and view are timed and keep `#tr`. `hudfade.js` mirrors these rules as `visibleInMode(id, mode)` so the
fader never "wakes" an element the mode hides (e.g. `#best` is rewritten every frame in cruise) and so the Playwright
test has an oracle for the mode visibility.

## Fading secondary

A pure module `hudfade.js` (ES module, `node --test`, no DOM) holds the rules; `index.html` samples the DOM once per
frame in `hud(dt)` and applies CSS classes.

**Rules** (`FADE_S`):

- `hold` = 4 s: an element that has just appeared (run start, or its value went from nothing to something) stays
  fully lit for 4 s, then fades to the ghost.
- `wake` = 3 s: when the shown value changes, the element lights up for 3 s, then fades again.
- `keybar` = 30 s: the key bar lights for 30 s after its context signature changes (`KEYBAR.sig`: on/off, context
  `car|foot|heli|train|indoors|lift`, context action, language), then ghosts; a new context brings it back.
- Ghost = CSS class `ghost`, `opacity:.28`, `transition:opacity .6s` (reduced-motion users get no transition, the
  existing `prefers-reduced-motion` block is extended). Waking removes the class.
- Phase `hidden` = the element has nothing to show (`null` sample). Used by the damage plate: it is `display:none`
  while damage is 0 % and appears (lit, then fading) once damage is above 0.

**What fades and what its sampled value is** (`FADED` ids; the three `#gear` plates get ids):

| id | element | sampled value |
|---|---|---|
| `tl` | the whole mode plate `#tl` | `#modetext` text + `#cpn` text (a checkpoint wakes it) |
| `dmgplate` | damage plate in `#gear` | `null` while `P.dmg` rounds to 0 %, else the percent |
| `gearplate` | gear plate | `#gearn` text |
| `tripplate` | trip plate | whole kilometres `Math.floor(P.trip)` + `HUD.tripResets` (K) |
| `watername` | `#watername` | text, `null` when empty |
| `roadname` | `#roadname` | text, `null` when empty |
| `autoline` | `#autoline` | text, `null` when empty |
| `prompt` | `#prompt` | text, `null` when empty |
| `best` | `#best` (Bestzeit line only; `#time` stays lit) | text |

The blinkers do not use the timer: `#blink span:not(.on){visibility:hidden}` shows a glyph only while that signal (or
the hazard lights) is active; the row keeps its height so nothing below it jumps.

`startRace()` resets the fader and the key bar timer, so every plate holds its 4 s (the key bar its 30 s) from the run
start — `hud()` runs on the start screen too and would otherwise hand the player a HUD that is already ghosted.

The fade clock is game time (`dt` from the loop, clamped to 0.05 s like everything else), so a tab under 1 fps and the
debug hook both behave. Nothing fades while paused (the loop does not call `hud()` then).

## Compass into the minimap

- The standalone `<svg id="compass">` is removed, with its CSS (`#compass{...}`, the `body.hud-off` and start-screen
  `:is(...)` lists) and the `compassAria` string. `compassEast` stays: it supplies the east letter for the heading.
- The car marker in `drawMap()` gets a **needle**: a 12 px `--sun` line forward from the marker tip, inside the existing
  rotated `save()`/`restore()`.
- The map bar `#br .bar` shows the heading: `<b><span id="maphead">N 0°</span> · N ↑</b>`, text from
  `headingText(bearing(), tr('compassEast'))` → `NE 37°` in English, `NO 37°` in German. `N ↑` keeps meaning "north is
  up on the map".
- `window.__mm.hud().compass` keeps its current text so `tests/test_smoke.py::test_hud_bundle` still reads the bearing.

## `#stylebtn` and `#game-nav`

- `#stylebtn` goes on every device: the button markup, its CSS and the `onclick` registration. `#pausestyle` is shown
  always (the `display:none` default and the phone media query that flipped it go), joins `PAUSE_BUTTONS` (and the
  tutorial list) after `pausevehicle` for the keyboard focus order, and the key T still toggles the style.
- `#game-nav` is hidden while driving on every width, not only on phones: the `@media (max-width: 600px)` wrapper
  around the "no dialog open" rule goes. Start screen, worlds, about, car select, pause and abandon still show it (the
  language toggle and the fullscreen button live there).

## Phone

With the compass gone the right column is `[II]` and `[📻]` at `top:208px`; they do not move (the `#tc` row on phones
sits at `top:140px` because of them, PR#785). The `#gear` plates stay hidden under 900 px as today.

## Debug hook

`window.__mm.hudFade(secs = 0)` advances the fader by `secs` of game time, applies the classes and returns
`{ t, phases: { id: 'awake'|'ghost'|'hidden' }, keybar: 'awake'|'ghost', compass: boolean (element present), heading: '#maphead' text }`.
With `secs = 0` it is a pure read after a resample. Tests step game time through it, never wall-clock waits.

## Tests

- `tests/hudfade.test.mjs` (node): timers (hold, wake, keybar), wake on value change, appearance from `null`, `hidden`
  phase, `visibleInMode` for cruise / tutorial / trial / blitz / hunt / view, `headingText` rounding and east letter.
- `tests/test_hud_fade.py` (Playwright, hand layout, desktop 1280×720): fade after 5 simulated seconds, wake on
  `__mm.setDamage` and on a gear change via `__mm.sim`, key bar ghost after 31 s and back after Z (foot context),
  mode visibility (cruise hides `#tr` / `#pips` / `#arrow`; `__mm.hudFade().phases` has no `best` in cruise), compass
  gone and `#maphead` showing a heading, `#stylebtn` gone and `#pausestyle` visible on desktop, `#game-nav` hidden
  while driving and shown in pause.
- Updated: `tests/test_hud_toggle.py` (drop `#compass`, `#game-nav` from `HUD_PARTS`), `tests/test_i18n.py` (the
  compass checks become a `#maphead` check), `tests/test_phone_hud.py` (`test_tablet_keeps_the_style_button` becomes
  "tablet shows `#pausestyle` and no `#stylebtn`"), `tests/pause.test.mjs`, `tests/test_pause.py`,
  `tests/test_tutorial.py` (focus order with `pausestyle`), `tests/test_shots.py` + `scripts/shots.py`
  (`HIDDEN_SELECTORS` without `#compass` and `#stylebtn`). `tests/test_toast.py` and `tests/test_navi.py` list
  `compass` / `stylebtn` in rect helpers that return `null` for a missing element; the stale names are dropped.

## Assumptions

- **A1** [high] Approach B as the maintainer decided it (issue #773, comment 2026-11-09); approach C is not built.
  Rejected: a HUD-levels toggle now.
- **A2** [high] Mode visibility stays in CSS (`index.html` `body.cruise ...{display:none}` after `#bl` rules,
  `body.tutorial #tr{display:none}`); `hudfade.js` only mirrors it for the fader and the tests. Rejected: moving the
  rules into JS, which would duplicate what #551 and #534 already do.
- **A3** [med] `#stylebtn` goes on desktop too; `#pausestyle` plus the T key replace it everywhere. Rejected: keeping it
  on desktop. The decision comment says "`#stylebtn` moves to the pause menu / settings (#546)" without a device
  split, and the button sits bottom-centre over the road in the desktop screenshot.
- **A4** [med] `#pausestyle` joins `PAUSE_BUTTONS` after `pausevehicle` (`pause.js:5`), so the arrow keys reach it;
  three focus-order tests change (`tests/pause.test.mjs:56,98,106`, `tests/test_pause.py:109,137`,
  `tests/test_tutorial.py:176`). Rejected: leaving it out of the focus ring, which would make the only desktop style
  switch unreachable by keyboard in the dialog.
- **A5** [med] The whole `#tl` plate fades as one unit, woken by a mode change or a checkpoint (`#cpn`). Rejected:
  fading only the `.mode` word inside a lit plate, which looks like a rendering glitch.
- **A6** [med] The trip plate wakes on whole kilometres and on K, not on every 0.1 km. At 90 km/h `#trip` changes every
  4 s (`index.html` `hud()`: `P.trip.toFixed(P.trip < 100 ? 1 : 0)`), which would keep the plate lit permanently.
  Rejected: sampling the displayed text.
- **A7** [med] The key bar ghosts (opacity .28) rather than disappearing. Rejected: `opacity:0`, because a learner who
  looks for the keys should still find them; the pause toggle (#535) is the off switch.
- **A8** [med] `#prompt` fades like the table in the decision says. A player at a door normally presses E within 4 s;
  the prompt reappears lit whenever its text changes.
- **A9** [med] Ghost opacity .28 and the 4 s / 3 s / 30 s timers are the decision's "~4 s", "~3 s", "~30 s"; the
  Playwright test asserts phases, not opacity values, so tuning stays a one-line change.
- **A10** [med] `#game-nav` hidden while driving on all widths. The decision says "hidden while driving and shown only
  on the start screen and in pause"; the `max-width:600px` rule of PR#785 (`index.html`, `<style>` above
  `<nav id="game-nav">`) is widened. The language toggle is still reachable from every dialog.
- **A11** [med] The blinker glyphs use CSS `visibility` on the inactive span rather than the fader, because a glyph
  is either signalling or not; `applyLamps()` already sets `.on` on `#blL` / `#blR`.
- **A12** [high] Hand-traced layout (terrain and world JSON blocked) for the Playwright file, like
  `tests/test_hud_toggle.py`; the hooks used (`__mm.setDamage`, `__mm.sim`, `__mm.place`, `__mm.pause`) exist on `main`.

## Consequences

- The `#navi` panel (right edge, "under the compass") keeps its position; a gap of about 80 px opens above it where the
  compass was. Not moved here.
- Phones lose the compass entirely from the top right; the heading is readable only in the map bar at the bottom right.
- Desktop players lose the on-screen "Style: Original · T" hint; the help overlay (F1) still lists T.
- With `#stylebtn` gone, `#pausestyle` appears on desktop and tablets too, so the pause menu grows by one button.
- `#game-nav` with the fullscreen button and the language toggle is no longer visible while driving on desktop; both
  are one Esc away in the pause dialog.
- The `hud-off` (Ctrl+H) and start-screen `visibility` / `display` rules are orthogonal to the opacity ghost; a hidden
  element keeps fading in the background and may come back as a ghost.
- Damage hidden at 0 % shortens the `#gear` column from three plates to two on a fresh car.

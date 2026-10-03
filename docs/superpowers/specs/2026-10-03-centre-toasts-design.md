# Toasts in the middle, shown longer — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-03 · Issue #75

## Goal

The issue: toasts such as "Grüss mir die Fische!" or "Gemeindegrenzen an/aus" appear top right for 2.6 s and are easy to miss while driving. Playtest note (`docs/ai-notes/feedback/2026-10-03-playtest.md`, entry 07): "in Bildschirmmitte und länger anzeigen".

Success: every toast appears **horizontally centred, directly below the checkpoint block** (arrow, distance, checkpoint name, blinkers, water name, road name), never overlapping it, the top-left race plate, the top-right time plate, the compass or the debug panel, and it stays in the upper half of the screen so the road ahead stays clear. Toasts from key presses stay **4 s**, toasts from game events (water, checkpoint, Holzbrücke shortcut) **5 s**. This holds on desktop and at phone width.

## Starting point (verified 2026-10-03 on `main` @ `3208e94`)

- `#toast` CSS (`prototype/index.html:27-28`): `position:fixed; right:16px; top:calc(120px + safe-area)`, rotated −3°, `text-align:right`, `opacity` 0 → 1 with `.show`. The compass (`:30`) is also `right:16px; top:124px`, so today the toast sits **on top of the compass**.
- Markup: `<div id="toast">` is a direct child of `#hud` (`:107`), after `#tr`.
- The checkpoint block `#tc` (`:18`, markup `:94-101`) is `position:fixed; left:50%; top:12px; translateX(-50%)`, a centred flex column: `#arrow`, `#dist`, `#cpname`, `#blink`, `#watername`, `#roadname` (the last two reserve `min-height:18px` even when empty, so its height does not jump).
- `toast(html)` (`:1031`) sets `innerHTML`, adds `.show` and `toastT = 2.6`. `hud(dt)` (`:1127`) counts `toastT` down by the clamped frame `dt` and removes `.show` at 0. A new toast replaces the old one and restarts the timer.
- Callers:
  - Key presses / user actions: **M** mute (`:914`), **G** boundaries (`toggleBounds`, `:916`), **C** camera (`cycleCamera`, `:1019`), **F3** debug (`toggleDebug`, `:1109`), copy result (`copyDebug`, `:1111`), the **J** / minimap jump destination name (`placeOnRoad`, `:947`).
  - Game events: water `tr('fishes')` (`:1003`), checkpoint `tr('cpToast', …)` and the Holzbrücke shortcut `tr('holzToast')` (`stepRace`, `:1034`).
- Debug panel (#39): bottom left above the speedometer (`:34`), 162 px from the bottom under 900 px width (`:35`), and on touch screens `top:120px; left:16px` (`:36`).
- The page has **no `<meta name="viewport">`**, so a real phone lays the page out 980 CSS px wide. A narrow desktop window (390 px) is the tightest real layout.
- Tests read `#toast` by id and its `textContent` (`test_smoke.py:109,127`, `test_boundaries.py:65,73,113`, `test_debug.py:98`, `test_i18n.py:143-181`, `test_jump.py:173`). There is no hook for the toast timer.
- #10 (helicopter mode, plan `2026-10-03-helicopter-mode.md`) adds `heliOn` / `heliLanded` toasts; #65 (look back) adds none.

### Layout dry run (Playwright, `?debug`, toast moved into `#tc`, then reverted)

| Viewport | `#tc` (without toast) bottom | toast rect `[l, t, r, b]` | neighbours |
|---|---|---|---|
| 1280 × 720 | `#roadname` 202 | `[477, 205, 803, 271]` | `#tl` ends at y 111, `#tr` at 116, compass `[1188,124,1264,200]`, debug `[16,417,290,488]` — no overlap |
| 390 × 844 | `#roadname` 220 | `[89, 226, 301, 311]` (two lines) | `#tl` ends at y 111, `#tr` at 102, compass `[298,124,374,200]`, debug `[16,611,290,682]` — no overlap |
| phone 390 × 844, touch (980 layout) | `#roadname` 202 | `[327, 205, 653, 271]` | debug on touch `[16,120,290,191]`, touch buttons at the bottom — no overlap |
| phone landscape 844 × 390, touch (980 × 453 layout) | `#roadname` 202 | `[327, 205, 653, 271]` | minimap `#br` `[556,205,964,437]` — **overlaps** the map's top-left corner |

## Decisions

| Topic | Decision |
|---|---|
| Position | Move `<div id="toast">` **into `#tc`** as its last child, in normal flow (`position` static, `margin-top:10px`). It is then centred by `#tc` and always sits right below `#roadname`, whatever `#tc`'s height — no magic `top` number to keep in sync. |
| Look | Unchanged yellow plate, −3° tilt, 24 px italic caps. Only `text-align:right` → `center`, plus `max-width:calc(100vw - 48px); box-sizing:border-box` so a long jump name wraps instead of running off a 390 px screen. |
| Stacking | `#tc` gets `z-index:1`, so on a landscape phone the toast is drawn **over** the minimap corner it overlaps rather than under it. `#debug` (5), `#jump` (20) and `#help` (21) stay above. |
| Duration | `const TOAST_S = { info: 4, event: 5 }`. `toast(html, secs = TOAST_S.info)`. Key presses and user actions keep the default (4 s). The three game events pass `TOAST_S.event` (5 s). |
| Which are events | `fishes`, `cpToast`, `holzToast` — things that happen to the driver. The **J** destination name is the answer to a key press, so it stays `info`. |
| Fade | Unchanged `.2s` opacity transition. |
| Test hook | `__mm.toast()` → `{ text, shown, left }` (`left` = `toastT`), defined right after `toast()`. |
| Strings / help | No new strings, no help change. |
| Changelog | One line under `[Unreleased] → Changed`, player voice. |

## Testing

TDD in a new `prototype/tests/test_toast.py`, hand layout (world and terrain routed to 404), Start clicked, **G** pressed (shows `boundsNoData` in the hand layout):

1. `test_key_toast_is_centred_below_the_checkpoint_block` — parametrised over 1280×720, 390×844 and a 390×844 touch phone (`is_mobile`, `has_touch`), all with `?debug`: the toast is shown, its centre is within 2 px of `innerWidth/2`, its top is ≥ `#roadname`'s bottom, it intersects none of `#tl`, `#tr`, `#compass`, `#debug`, and its bottom is ≤ `innerHeight/2`. Red today (the toast is right-aligned and overlaps the compass).
2. `test_key_toast_lasts_four_seconds` — right after **G**, `3.5 < __mm.toast().left <= 4.0`. Red today (2.6, and the hook is missing).
3. `test_water_toast_lasts_five_seconds` — car placed in the hand-traced Rhine (`863.6, -647.7`, as in `test_smoke.py:124`), wait for `splash > 0.6`: text is the fishes line and `left > 4.2`. Red today.

All existing tests that read `#toast` stay unchanged and green (the id and `textContent` do not change). Manual: drive and check that the toast reads well over the road on desktop and on a phone (test-todo).

## Assumptions

- **A1** [med] Position = horizontally centred, directly below the checkpoint block (`#roadname`), not the vertical middle of the screen. Rejected: true screen centre — in the chase view that is the road ahead, which the issue itself says not to cover ("centre, below the checkpoint arrow/distance, without covering the road ahead"). The dry run puts it at y 205–311, the upper third.
- **A2** [med] Durations: 4 s for key-press toasts, 5 s for game events. Rejected: one duration for all (the issue suggests events longer); 6 s+ (a checkpoint toast would still be up when the next action toasts, and toasts replace each other anyway).
- **A3** [high] Put the toast inside `#tc` instead of a fixed `top` value. Rejected: `position:fixed; top:<n>px` — `#tc`'s height (`:94-101`) would have to be mirrored by hand and breaks whenever a line is added to the block.
- **A4** [med] On a landscape phone the toast may overlap the minimap's top-left corner for its few seconds; it is drawn on top (`#tc z-index:1`). Rejected: moving or shrinking the minimap — out of scope, and the touch buttons already overlap it there today.
- **A5** [high] The J / minimap jump destination toast counts as a key-press toast (4 s). Rejected: event (5 s) — it answers the player's own action, like the other toggles.

## Consequences

- The toast no longer covers the compass on desktop (today both sit at `right:16px`, `top:120/124px`).
- Rapid toggles (e.g. **G G G**) still replace each other; each restarts at 4 s.
- A two-line toast (checkpoint with name, Holzbrücke) is ~66 px tall; at 390 px width a long name wraps to two lines (~85 px).
- `#tc` grows to the width of the last toast text even while the toast is invisible (`opacity:0`). `#hud` is `pointer-events:none`, and the arrow stays centred, so nothing visible changes.
- #77 (Tab as full map, spec `2026-10-03-tab-full-map-design.md`) centres `#br.full` with `z-index:20`; while the full map is open it covers the toast (`#tc` is at 1). #83 (pause menu) freezes toasts with the game; both fit this design unchanged.
- #10's heli toasts get 4 s by default unless its implementer passes `TOAST_S.event`.
- The fishes toast (5 s) outlives the water reset (`splash > 2.8`) by ~2.5 s, so it is still readable after the car is back on the road.

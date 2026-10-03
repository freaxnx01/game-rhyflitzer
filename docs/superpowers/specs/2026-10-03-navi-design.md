# Navigation system (Navi) — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-03 · Issue #106 · builds on #18 (autopilot)

## Goal

Issue #106: "Können wir ein Navi einbauen?" The user decided on 2026-10-03: the destination is picked like in #18 (the J list plus street names); the **route** shows on the minimap; the HUD shows a **big turn arrow with the distance** and a text instruction ("In 200 m rechts" / "In 200 m turn right"); **no voice**. The Navi reuses #18's routing. **The Navi guides, the autopilot drives.**

Success: during a game, **I** opens a "Navigate to" list (the same list as #18's "Drive to": J landmarks, then streets). Picking an entry plans a route (A* on the road graph from #18). From then on:

- the remaining route is a cyan line on the minimap (and on the big Tab map),
- a Navi panel on the right (under the compass) shows a turn arrow, the distance to the next turn and the instruction text,
- if the player leaves the route, the Navi plans a new one by itself,
- on arrival a toast says so and the Navi ends.

**I** again turns the Navi off. **O** (#18) starts the autopilot **and** the Navi on the same route, so a player who lets the car drive still sees what is coming.

## Starting point (verified 2026-10-03 on `main` @ `f6d6a6b`)

- **#18 is specified but not merged:** `docs/superpowers/specs/2026-10-03-autopilot-design.md` and `docs/superpowers/plans/2026-10-03-autopilot.md` exist, `prototype/route.js` does not. This feature **cannot start before #18 lands** (Task 0 of the plan checks for `route.js` and stops).
- **What #18 will provide (its plan, Task 1):** `prototype/route.js` exports `buildGraph`, `snapToGraph`, `findRoute(g, start, goals)` → route `{ pts, cum, len, joints }` (`joints[]` carry `{ s, deg }`, `deg` = roads at the junction), `turnAt(route, s, w)` (signed heading change, > 0 = right), `trackRoute(route, x, z, sPrev)` → `{ s, d }`, `cumulative`, `streetEntries`, `placeChips`. In `index.html`: the J dialog in a second mode (`JUMP.mode = 'drive'`), `AUTOP` state, the route as a cyan line in `drawMap`, a `#autoline` text line under `#roadname` in `#tc`, key **O**, strings `driveTitle`, `autoNoWorld`, … The Navi uses these as they are.
- **Keys** (`prototype/index.html:973`, specs): taken B, C, E, F, G, H, J, K, L, M, N, O, P / Esc, Q, R, T, V, Tab, Enter, Space, F1, F3, `+`, `-`, `?`, W A S D, arrows, Ctrl. `grep -c "KeyI\|KeyU\|KeyX\|KeyY\|KeyZ" prototype/index.html` → 0.
- **HUD (`index.html:14-34, 94-114`):** `#tc` is a centred column: `#arrow` + `#dist` (next checkpoint), `#cpname`, `#blink`, `#watername`, `#roadname`, then `#toast` as the last child (#75: toasts sit directly below the checkpoint block). `#tl` top left, `#tr` (time) top right, `#compass` at `right:16px; top:124px` (76 px, ends at 200 px), the minimap `#br` bottom right (400 × 200, 240 × 120 under 900 px). The debug panel `#debug` is bottom left (`bottom:232px`; on a touch phone top left at `top:120px`). The F3 / pause / help panels are centred dialogs.
- **Pause (#83, merged):** `loop()` skips every step while `PAUSE.on`; `pauseKey` runs before game keys. **Helicopter (#10):** `FLY.on` while flying.
- **Toast API:** `toast(html, secs = TOAST_S.info)`, `TOAST_S = { info: 4, event: 5 }` (`index.html:1115`).
- **Strings:** `prototype/strings.js` `en` / `de` objects, `tr(key, ...args)`; `strings.test.mjs` enforces equal keys and no `ß`.

## Decisions

| Topic | Decision |
|---|---|
| Key | **I** ("Info / Navi" — N is nitro, so the natural letter is taken). Only with the start overlay hidden, like J / O. **I** while the Navi is on turns it off. Not usable in the hand layout ("Navi needs the OSM world") and not while the pause menu is open (the pause ignores game keys). |
| Dialog | **One shared dialog** (user hint: reuse). The J dialog gets a third mode `JUMP.mode = 'navi'` next to `'jump'` and #18's `'drive'`. Same rows (landmarks, then streets), same chips, same search. Title "Navigate to" / "Navigieren nach". Enter or a click starts the Navi. Closing key is **I** (when the search field is empty) or Esc. Rejected: a separate second dialog (duplicate DOM, keys and tests). |
| O vs I | **O** (#18) = autopilot **+** Navi on the same route. **I** = Navi only, the player drives. Take-over by the player ends only the autopilot; the Navi keeps guiding. **I** while the autopilot drives turns off the Navi but not the autopilot (it keeps its own route). |
| One route | A single `planRoute(entry)` helper (extracted from #18's `startAuto` if it is inlined there) returns the route. `NAVI.route` and `AUTOP.route` may be the same object. The minimap draws `currentRoute()` = the autopilot's route, else the Navi's. Same cyan line, same dot at the end as #18. |
| Turn instructions | Pure module `prototype/navi.js`. The next **maneuver** is the next route joint with 3+ roads where the route turns by 30° or more (same rule as #18's turn signals). Kinds by angle: 30–60° slight, 60–120° turn, 120–165° sharp, ≥165° U-turn, left or right. No maneuver left: "Destination in 300 m" / "Ziel in 300 m". |
| Distance rounding | below 30 m "now", below 100 m in 10 m steps, below 975 m in 50 m steps, from there in km with one decimal ("1.4 km"). The number is formatted with `Intl.NumberFormat` for the game language; the pure function returns `{ value, unit }`. |
| Texts | en: "In 200 m turn right" / "Turn right now" / "In 50 m make a U-turn" / "Destination in 300 m". de: "In 200 m rechts" / "Jetzt rechts" / "In 50 m wenden" / "Ziel in 300 m". German is impersonal, Swiss spelling (no `ß`). All through `tr()`, en and de. No sound, no speech (user decision). |
| Panel | New `#navi` plate, `position:fixed; right:16px; top:calc(212px + safe-area)` (directly under the compass, over the minimap). Content: a turn arrow (SVG, 64 px, rotated by the turn angle, yellow like `#arrow` but the cyan outline `#3ddcff`), the big distance ("200 m", same look as `#dist`), the instruction line (15 px, as `#roadname`), and a destination line "<name> · 2.4 km". `max-width:180px`, text wraps. Hidden when the Navi is off. |
| Placement | Right column, **not** in `#tc`: the toast (#75) must stay directly below the checkpoint block and in the upper half; `#autoline` (#18) stays under `#roadname`; the debug panel is on the left (also on a touch phone), so nothing overlaps. The full map (Tab) and the dialogs have `z-index:20` and cover it, as they cover the compass. |
| Off route | The car is more than **25 m** from the route for **1.5 s** → plan again from where the car is (`findRoute` from `snapToGraph`), toast "Recalculating…" / "Route wird neu berechnet" (event toast). At most once per **3 s**. R, J and a map double-click put the car somewhere else, so they simply trigger a replan 1.5 s later (the Navi is not cancelled). If the car is more than 30 m from the network or no route exists: "No route from here" and the Navi ends. |
| Arrival | Less than **20 m** of route left and within 20 m of it: toast "Arrived: <name>" / "Angekommen: <name>" (event toast, 5 s), Navi off, minimap line gone. The player is not asked to stop. |
| Helicopter | While `FLY.on` the Navi is suspended (no replan, no arrival, panel dimmed); landing resumes it, and the off-route rule then replans. |
| Pause | Nothing to do: the step block is skipped while paused. |
| Records | The Navi does not mark a run (it only shows information). Rejected: `R.jumped`-style flag. |
| Touch | No button to open the dialog (J and O are keyboard-only too). The panel is shown on touch phones. |
| Pure logic | `prototype/navi.js` (no DOM, no three.js): `NAVI` constants, `turnKind`, `nextManeuver`, `roundDistance`, `naviStep`, `afterReplan`, `newNaviState`, `describe`. It imports `turnAt` and `trackRoute` from `route.js`. Tested with `node --test`. `index.html` keeps the glue (`NAVI` state, panel, replan, arrival). |
| Strings | `keyNavi`, `naviTitle`, `naviHint`, `naviOn`, `naviOff`, `naviIn`, `naviNow`, `naviDestIn`, `naviArrived`, `naviReroute`, `naviNoRoute`, `naviNoWorld`, `naviDest`, `dirSlightLeft`, `dirTurnLeft`, `dirSharpLeft`, `dirSlightRight`, `dirTurnRight`, `dirSharpRight`, `dirUturn`. |
| Test hooks | `__mm.navi()` → `{ on, dest, left, type, kind, dist, text, replans }`; `__mm.naviStart(name)` starts the Navi to the first dialog row with that name. |
| Interface for #107 | `startNavi(dest)` with `dest = { n, x, z }` (name and a point; the glue snaps it to the network within 400 m) and `stopNavi()`. Delivery mode (#107) calls these for an address; it adds no routing of its own. |

## Interactions

- **#18 autopilot:** shares route, graph, dialog and minimap line (see above). Until #18 is merged this issue is blocked.
- **#107 delivery mode:** uses `startNavi` to the delivery address. Arrival of the Navi is not delivery; #107 decides what arrival means for it (it can read `__mm.navi().on` / the arrival toast, or wrap `stopNavi`).
- **#77 full map (merged):** the Tab map is the minimap canvas, so the route shows on it with no extra code.
- **#83 pause (merged):** frozen with the game; **I** is ignored in the pause menu.
- **#75 toasts (merged):** unchanged; the Navi panel is outside `#tc`.
- **#86 J dialog key repeat:** a held **I** must not flicker the dialog; the shared `jumpKey` already ignores repeats for the close key (`e.repeat` check at `index.html:1161`), and the `I` open key must do the same (`if (e.repeat) return` already runs before it).

## Assumptions

- **A1** [high] [confirmed] The destination is picked as in #18 (J list plus street names). Decided by the user 2026-10-03.
- **A2** [high] [confirmed] The route is shown on the minimap. Decided by the user 2026-10-03.
- **A3** [high] [confirmed] A big turn arrow with the distance in the HUD, with text like "In 200 m rechts" / "In 200 m turn right" through `tr()`. Decided by the user 2026-10-03.
- **A4** [high] [confirmed] No voice output. Decided by the user 2026-10-03.
- **A5** [high] [confirmed] #18's routing is reused (`prototype/route.js`, A* on the road graph). The Navi guides; the autopilot drives. Decided by the user 2026-10-03.
- **A6** [med] Key **I**. Rejected: Z ("Ziel") — the game reads `e.code`, and `KeyZ` is the key labelled Y on Swiss / German keyboards; U, X, Y have no meaning at all. Free letters (`grep` → 0): I, U, X, Y, Z.
- **A7** [med] The Navi and the autopilot share the one dialog (third mode `'navi'`), and **O** starts both. Rejected: two separate dialogs; a "Navigate" checkbox inside the drive dialog (hidden state).
- **A8** [med] Replan after 25 m off the route for 1.5 s, at most every 3 s, with a toast. Rejected: replan at once (a short cut over a car park would flicker the route); never replan (the player is lost after one wrong turn, which is the whole point of a Navi).
- **A9** [med] Arrival within 20 m with a toast "Arrived: <name>", then the Navi ends. Rejected: waiting for a stop (the player drives at 60 km/h and would pass the destination); a 50 m radius (the street goal is the middle of a stretch, so 50 m can still be the wrong end).
- **A10** [med] The Navi panel sits on the right under the compass, not in `#tc`. Rejected: inside `#tc` under `#roadname` (it pushes the toast down by ~90 px and breaks #75's "upper half" rule); top left under `#tl` (collides with the debug panel on touch phones, `index.html:36`).
- **A11** [med] A maneuver is only a junction with 3+ roads and a turn of 30° or more; bends without a junction give no instruction. Same rule as #18's blinkers, so the two always agree. Rejected: announcing every bend (noise); roundabout exits "take the 2nd exit" (the data marks roundabouts only as ordinary roads here — later).
- **A12** [med] Distance steps 10 m / 50 m / km, "now" below 30 m. Rejected: exact metres (flickering numbers at 60 km/h).
- **A13** [high] The Navi is off in the hand layout. Evidence: #18 spec A9 (the hand roads cross without shared vertices, `index.html:724`).
- **A14** [high] New UI text goes through `tr()` with en and de entries (`strings.test.mjs` enforces equal keys and no `ß`).

## Consequences

- With the autopilot on, the player sees the same arrow the autopilot is about to follow; the turn signals (#18) and the Navi texts agree because both use the 30° / 3-roads rule.
- A player who ignores the Navi for a long time sees "Recalculating…" about every 3 s while driving away from the route; each replan costs one A* run (about 1–6 ms).
- Street destinations end in the middle of the nearest stretch (#18 A5), so "Arrived" can come up to half a street length from where the player expected it.
- The 3.4 % of road nodes outside the main network (#18) cannot be destinations, and from there "No route from here" shows.
- The panel covers a strip of the 3D view on the right on narrow screens (180 px wide); on a 390 px phone it sits above the minimap and below the compass.

## Out of scope

Voice or sound, lane guidance, roundabout exit counting, speed limits, ETA / arrival time, house-number destinations (needs `addr:*`, #12 / #71; #107 will bring its own), a touch button for the dialog, routing in the hand layout, a 3D route ribbon.

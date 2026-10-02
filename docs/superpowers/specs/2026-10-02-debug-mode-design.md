# Debug mode (building heights and coordinates) — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-02 · Issue #39

## Goal

The issue asks for a debug mode that can be switched on and off, so playtest feedback such as #34 ("this building looks too short") can quote real numbers. The first contents are:

- each nearby building's height in metres (`h`, plus the ridge `rh` and the source `hsrc` where useful), and
- the car's position as a reference point that can be pasted into a bug report.

More content will follow ("... more to come"), so the issue asks for an extensible overlay, not two one-off features.

Success: the tester presses **F3** (or opens the page with `?debug`). A small panel then shows the car's game x/z/y, its heading, LV95 and WGS84 coordinates, and the nearest building with its id and height data. A green height label floats over every building within 60 m. One click on the panel copies all of it as one line. Pressing F3 again removes everything, and the game looks and plays exactly as before.

## Starting point (verified 2026-10-02 on `main` @ `236cc61`)

- Key handling is one global `keydown` listener (`prototype/index.html:816`). It covers T, C, R, H/Enter, M, F1/`?`, Esc, Tab, V, K, Q, E, `+`/`=`/`-`, J and digits. Driving uses W A S D, the arrows, Space, Ctrl and N (`:887`). F1 calls `e.preventDefault()` so the browser's own F1 does not fire.
- Keys claimed by other open work: **G** by #48 (Gemeinde boundaries, spec `docs/superpowers/specs/2026-10-02-gemeinde-boundaries-design.md` A5) and **B** by #24 ("B = Blick zurück"). The other open specs (jump landmarks #41, PR #52, minimap zoom, car parks, vehicle table, street labels, car toggle, Hallenbad label) claim no new keys. #41 makes printable keys go into a search field while the J dialog is open, and F3 is not printable.
- Toggles: `HUD` state (`:815`). `V` flips `HUD.carHidden` and is not persisted. `M` reports with `toast()` (`:923`). The F1 help lists every key (`:102-119`).
- `localStorage` holds only game progress: `mm.odo` (`:842`, `:962`) and `mm.best2` (`:920`, `:927`). No view setting is persisted. The repo reads no URL parameters today.
- Test hooks live on `window.__mm` (`:329`, `:853-881`). Playwright tests read state through them (`prototype/tests/test_street_labels.py`, `test_smoke.py:365-405`).
- House-number labels (#12) already show the pattern for "labels near the car": items go into a 64 m grid (`:728-729`), `pickLabels` (`prototype/world.js` ~L104) picks the nearest 40 within 60 m every 250 ms, a pool of 40 sprites shows them, and an LRU of 128 materials caches their textures (`:730-734`). The label sits at `terrainH + top + 1.5`, and `top` is the roof top from `addrLabels` (`world.js` ~L100).
- Building data (`data/world_hochrhein.json`, 1,885 buildings): `h` is the eaves height. 1,686 buildings carry `rh` (ridge above the eaves) and `hsrc: "dsm"` (measured, #17). The other 199 carry neither, and their `h` comes from an OSM tag, `building:levels`, or a default (`docs/11-pipeline-osm.md:117`). The pipeline writes no other `hsrc` value (`pipeline/building_heights.py:74`).
- The world file has `origin: { lat, lon, E, N, crs: "EPSG:2056" }` (`docs/11-pipeline-osm.md:54`). The game frame is LV95 shifted to the origin with x east and z south (`pipeline/geo.py:33-36`). So `E = origin.E + x` and `N = origin.N − z` hold exactly. `layoutFromWorld` (`world.js:64-68`) does not pass `origin` on yet.
- Bottom centre holds the style button (`index.html:74`), bottom left holds the speedometer (`#bl`, 200 px, 130 px under 900 px width), and bottom right holds the minimap. On touch screens the steering buttons sit bottom left at 230 px (`index.html:72`).

## Decisions

| Topic | Decision |
|---|---|
| Key | **F3** toggles, with `preventDefault()` like F1. A toast says `Debug on` / `Debug off`. |
| URL flag | `?debug` (also `?debug=1`) switches debug on at load. `?debug=0`, `false`, `off` or `no` leave it off. |
| Persistence | None. Default off. Like `V`, nothing goes into `localStorage`. |
| Extensibility | `DEBUG = { on, t, sections, layers, lines }` in `index.html`. `debugSection(fn)` registers a function that returns panel lines. `debugLayer({ tick(x, z), hide() })` registers 3D content. `debugTick()` runs from `hud(dt)`, every 250 ms and only while on. It ticks every layer and then rebuilds the panel from every section. A later debug feature adds one section or layer and touches nothing else. |
| Pure helpers | New ES module `prototype/debug.js` (no three.js, no DOM), unit-tested with Node: `debugFromQuery`, `gameToLv95`, `lv95ToWgs84`, `debugPosition`, `heightText`, `heightLabels`, `positionLines`, `buildingLines`, `copyText`. `world.js` exports its roof-top rule as `roofTop(b)`, so both label kinds share it, and `layoutFromWorld` passes `origin` (or `null`). |
| Panel | `<div id="debug" hidden>` in the HUD, bottom left above the speedometer (232 px up, 162 px under 900 px width). On touch screens (`pointer: coarse`) the steering buttons sit there (`index.html:72`), so the panel moves to the top left, 120 px down. Monospace 13 px, light green `#b6ff7a` on the HUD's dark plate. `white-space: pre` and `pointer-events: auto` so it can be clicked. |
| Position section | `x 1234.5  z -253.3  y 312.4  87°` (game metres, heading = compass bearing). Then `LV95 2639781 / 1266787` and `WGS84 47.550597, 7.967105`. Without an origin (hand-traced layout, or an old world file) it shows `LV95 —` and no WGS84 line. |
| WGS84 | swisstopo's approximate LV95 → WGS84 formulas (12 terms). Checked against the world origin: off by 0.33 m in latitude and 0.4 m in longitude. |
| Building heights layer | One label per building in the world, at its rect centre, `terrainH + roofTop + 4` (above the house number at `+ 1.5`). Text: `22.8 m +1.2 dsm` (eaves, `+ridge` when `rh` is known, source; `osm` when `hsrc` is missing). Nearest 40 within 60 m, refreshed every 250 ms, its own pool of 40 sprites (6.4 × 1.2 m, texture 512 × 96, green text on a dark plate) and its own LRU of 128 materials, built like the house-number labels. Hidden when off. |
| Building section | `bldg 171822634 · 22.8 m +1.2 dsm` for the nearest label (by distance to the rect centre), or `bldg —`. |
| Copy | A click on the panel copies `copyText(lines)` (all lines joined with ` \| `) through `navigator.clipboard.writeText`. Toast `Copied` on success, `Copy failed` on failure or without the Clipboard API. |
| Test hook | `__mm.debug()` → `{ on, lines, copy, pos: { x, z, E, N, lat, lon }, heights: [{ t, id, d }], sprites }`. |
| Docs | F1 help gets an F3 line. `CHANGELOG.md [Unreleased]` gets a player-facing line. `test-todo.md` gets a manual playtest entry. |

## Assumptions (headless — no human was asked)

- **A1** [med] **F3** is the key. All the free letters are game keys or claimed: G by #48, B by #24 (`index.html:816`, `:887`). F3 is the debug key in other games (Minecraft's F3 debug screen), it sits next to F1 (help) in the same function-key row, and it keeps letters free for gameplay. `index.html:816` already stops the browser's own F1 with `preventDefault()`, and F3 ("find next") is stopped the same way. Rejected: `G` (taken by #48), `B` (#24), Backquote (on Swiss German keyboards that key is `§`, and the `^`/`` ` `` dead keys sit elsewhere), and another letter (would be lost to future gameplay keys).
- **A2** [med] `?debug` in the URL switches it on at load, and nothing is persisted. A tester can bookmark `…/prototype/index.html?debug`, and on a phone without F3 the URL is the only way in. Rejected: `localStorage` persistence. The repo persists only progress (`mm.odo`, `mm.best2`, `index.html:842/920`) and no view toggle (`V`, `T`, camera), and a forgotten debug flag would put green labels in front of the next player.
- **A3** [high] It is an overlay with a section/layer registry (`debugSection`, `debugLayer`). The issue asks for exactly that ("build it as an extensible overlay"). Rejected: two separate toggles.
- **A4** [high] The label text shows the data values (`h`, `rh`, `hsrc`), not the drawn height. #34-style feedback compares the data against reality, and the pipeline fix goes into the data. The drawn height differs only for buildings without `hsrc` (gable: whole floors + 0.4 m; flat: at least 3 m, `index.html:487-494`).
- **A5** [high] Position as game x/z/y plus LV95 plus WGS84. The issue names game x/z and "maybe lon/lat or LV95". LV95 is exact (the frame is LV95 shifted, `pipeline/geo.py:33-36`) and pastes into map.geo.admin.ch. WGS84 pastes into Google Maps, and the approximate formulas are under 1 m off here (checked against `origin`). Rejected: a proj4 library (a new dependency in a buildless game, `CLAUDE.md` stack guardrails).
- **A6** [med] Labels within 60 m, at most 40, refreshed every 250 ms. These are the same numbers as the house numbers (`index.html:734`, `world.js` `pickLabels` defaults), which are proven in the browser tests. The issue says "at least for nearby buildings".
- **A7** [med] One click on the panel copies everything as one line. The issue wants a reference point "that can be pasted into a bug report". A click is the smallest gesture that works on desktop and on a phone. Rejected: a second key (one more binding to find), and selecting text by hand (fiddly over a moving 3D view).
- **A8** [med] Look: green monospace text (`#b6ff7a`) on a dark plate, bottom left above the speedometer. Green is not used by any HUD text, and #48 already took magenta for its overlay. Monospace keeps the numbers from jumping. Bottom left above the speedometer is free on desktop (bottom centre: style button, top left: race plate, right: toast, compass and map). On touch screens the steering buttons take that spot (`index.html:72`), so there it moves under the race plate.
- **A9** [high] UI strings are English, like every other HUD string (i18n is #9, still open).

## Consequences

- With debug on, there are up to 40 more sprites and up to 128 more cached textures (512 × 96 each, about 25 MB of GPU memory at the cap). With debug off, nothing is drawn and the cache stays as it was.
- "Nearest building" means the nearest rect centre. Next to a long hall, a smaller house can win even though the car is beside the hall. The id in the line is still the building the label shows.
- Buildings without `hsrc` (German side, and the 42 `not_built` footprints) all show `osm`. The world file does not tell an OSM height tag from a level count or a type default, so the label cannot either.
- The hand-traced layout has no buildings in the world file, so it shows no height labels and `bldg —`, and it shows `LV95 —` because its coordinates are not geo-referenced.
- F3 no longer reaches the browser's "find next" while the game has focus.
- The live site needs no world rebuild: `origin`, `h`, `rh` and `hsrc` are already in `data/world_hochrhein.json`.

## Testing

- Node (`prototype/tests/debug.test.mjs`, new): the URL flag variants; `gameToLv95` (exact offset, `null` without an origin); `lv95ToWgs84` against the world origin pair (within 1e-5°); `heightText` for dsm with `rh`, missing `hsrc` and `rh`, and rounding; `heightLabels` positions, `top` and `id`; `positionLines` with and without an origin; `buildingLines` with and without a label; `copyText`. In `world.test.mjs`: `roofTop` (same three cases `addrLabels` already covers) and `layoutFromWorld` passing `origin` (`null` when missing).
- Playwright (`prototype/tests/test_debug.py`, new, foreground only): F3 toggles `__mm.debug().on` and the panel, the F1 help names F3, and the hand layout shows `LV95 —`. `?debug` starts on and `?debug=0` starts off. With the world, at 20 m from Bodenackerstrasse 6 (`171822634`): `E − x` and `N + z` equal `origin.E`/`origin.N`, WGS84 is within 0.05° of the origin, the building's label reads its data text, the sprite count equals the label count, and the panel has a `bldg` line. F3 off hides every debug sprite and leaves the house numbers alone. A click on the panel (with a stubbed `navigator.clipboard.writeText`) copies exactly `__mm.debug().copy` and toasts `Copied`.
- Manual (`test-todo.md`): F3 at Bodenackerstrasse 6 shows a label above the house number and readable at chase distance. A pasted line puts the right spot into map.geo.admin.ch (LV95) and Google Maps (WGS84). `?debug` works on a phone.

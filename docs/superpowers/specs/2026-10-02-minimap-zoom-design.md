# Minimap zoom and double-click to place the car — design

Status: approved in chat 2026-10-02 · Issue #11

## Goal

The minimap in the bottom-right HUD corner (`#map`, 800×400 canvas shown at 400×200 CSS px, 240×120 under 900 px) always shows the whole Hochrhein region, and it ignores every click. The playtest of 2026-10-01 asked for two things:

1. **Zoom** the minimap.
2. **Double-click** the minimap to put the car there, on the nearest road, the same way the **J** jump menu does.

Success looks like:

- The mouse wheel over the map and the **+**/**-** keys step the zoom through **1×, 2×, 4×, 8×**. 1× is today's whole-region view, unchanged.
- Zoomed in, the view is centred on the car and follows it, but it never shows anything beyond the map's edges (it stops at the border instead).
- The header shows the zoom: `Map · Hochrhein · 4×` (left) and `N ↑` (right).
- A double-click (mouse) or a double-tap (touch, two taps within ~300 ms) on the map puts the car on the nearest jumpable road to that point. During a race this counts as a jump, so the run cannot become a record. A single click or tap does nothing.

## Decisions

| Topic | Decision | Rationale |
|---|---|---|
| Zoom steps | `[1, 2, 4, 8]`, state `MAP.zoom`, start at 1. Steps clamp at both ends. | Four powers of two cover region → neighbourhood; a fixed list is easy to test. |
| Rendering | No re-render per frame. `drawMap()` blits a **crop** of the pre-rendered `mapStatic` (`drawImage` with a source rect of `w/zoom × h/zoom` canvas px) scaled up to the full canvas. Checkpoints, finish and the car arrow are drawn through the same view transform, at their **unchanged pixel size**. | `mapStatic` is costly (terrain shading, water, buildings, roads, labels); a crop is free. At 8× the base raster looks soft, which is accepted for a minimap. At 1× the source rect is the whole canvas, so 1× stays pixel-identical. |
| View centre | `mapView()` returns `{ z, ox, oy }`: `ox = clamp(MX(P.x), w/2/z, w − w/2/z)`, `oy` likewise with `MZ(P.z)` and `h`, in base (1×) canvas px. At 1× both bounds equal `w/2` (`h/2`), so the view is fixed on the whole map. | The clamp is two `clamp` calls — "simple", as the design asked. The view never extends beyond the 800×400 `mapStatic`. |
| Transform | world → canvas: `px = (MX(x) − ox)·z + w/2`, `py = (MZ(z) − oy)·z + h/2`. Inverse: base px `bx = (px − w/2)/z + ox`, world `x = (bx − (w − (MB.x1 − MB.x0)·MS)/2)/MS + MB.x0` (likewise `z`). `MX`, `MZ`, `MB`, `MS` and the `mapStatic` pre-render stay as they are. | One transform used by drawing, by the click handler and by the test hooks, so they cannot drift apart. |
| Wheel | `wheel` listener on `#map`, `{ passive: false }`, always `preventDefault()`. Deltas are summed (`deltaMode` lines × 40); every ±100 is one step (negative = wheel up = zoom in), then the sum resets. | One mouse notch (100) = one step; a trackpad's many small deltas add up instead of racing to 8×. The page must not scroll. |
| Keys | In the existing `keydown` handler: `e.key === '+'` or `'='` → zoom in; `e.key === '-'` → zoom out. Matches the main row (US `=`/`+`, Swiss `-`), the numpad (`NumpadAdd`/`NumpadSubtract` give `+`/`-`). | Checked against all existing bindings: no key uses `+`, `=` or `-`. Matching by `e.key`, not `e.code`, avoids the Swiss layout where code `Minus` is the `'`/`?` key — `?` opens the help. |
| Hit area | `#map` gets `pointer-events:auto; touch-action:none; cursor:crosshair`. `#hud` keeps `pointer-events:none`, so the rest of the HUD stays click-through. | Only the map needs input; `touch-action:none` stops a double-tap from zooming the page. |
| Canvas → world | `(e.clientX − rect.left) · mapC.width / rect.width` (same for y), so it works at 400×200 and 240×120 CSS px; then the inverse transform. | The canvas resolution is 2× its CSS size (and 3.33× on narrow screens). |
| Placement | `jumpTo({ n: 'From the map', x, z })` — the #21 helper: nearest point on a jumpable road (no bridges, no motorway), `placeOnRoad` sets `P.safe`, resets the car, closes `#jump`, toasts the name and sets `R.jumped` while armed/racing. `finish()` already refuses a record when `R.jumped`. | Same rule as **J**, as the issue asked; no new race logic. |
| Double-click / double-tap | Mouse/pen: the native `dblclick` event. Touch: a `pointerdown` detector (`pointerType === 'touch'`, second tap < 300 ms after the first and < 30 CSS px away). Placements less than 500 ms apart are ignored, so a browser that also synthesizes `dblclick` from the two taps does not place twice. | `dblclick` honours the player's OS double-click speed; mobile browsers do not fire `dblclick` reliably, hence the tap detector. |
| Header | `<span>Map · Hochrhein · <span id="mapzoom">1×</span></span><b>N ↑</b>`; `setMapZoom` writes `zoom + '×'`. | Shows the zoom at all times, 1× included. |
| Test hooks | `window.__mm.map()` → `{ zoom, cx, cz }` (world point at the canvas centre); `window.__mm.mapToWorld(px, py)` → `[x, z]`; `window.__mm.worldToMap(x, z)` → `[px, py]` — both in canvas px (800×400), through the current view. | Tests click at a known road position and check the view without reading pixels. |
| Help and changelog | `#help` gets a line for `+ · -` (map zoom, wheel) and double-click/double-tap placement. One player-voice line in `CHANGELOG.md` → `[Unreleased]` → `Added`. | Players find the feature; the changelog is player-facing prose. |

## Out of scope

- **Pinch zoom** (named in the issue body). Not part of the approved design; the wheel and **+**/**-** cover desktop, and touch has no zoom gesture on the map in this iteration.
- The **magnifying glass** idea from the issue comment of 2026-10-02 (zoom into the area under the cursor). The approved design zooms around the car; a lens is a separate follow-up.
- Re-rendering `mapStatic` at a higher resolution for sharp 8× detail, map rotation (heading-up), dragging/panning the zoomed map, remembering the zoom across reloads.
- Any change to `jumpTo`, `placeOnRoad`, `randomSpot` or the race rules.

## Tests

Playwright smoke tests in a new `prototype/tests/test_minimap.py`, hand-traced layout (world and terrain files blocked: no data needed, deterministic), viewport 1280×720 (map at 400×200 CSS px, clear of `#game-nav`). On the hand **Bahnhofstrasse**, (1780, 560) and (1660, 330) are road vertices, so the nearest jumpable road point is the clicked point itself.

1. **Keys, follow and clamp** (menu screen): `+`/`=`/numpad steps 1→2→4→8→8 and `-` back 8→4→2→1→1; `#mapzoom` reads `4×` at 4×; at 1× `map()` does not depend on the car; at 4× the centre equals the car (±0.5 m) and `worldToMap(car)` = (400, 200); `mapToWorld`/`worldToMap` round-trip; with the car in the map's corner the 4× view is clamped (`mapToWorld(0, 0)` equals the 1× corner).
2. **Wheel:** four notches up → 2, 4, 8, 8; four down → 4, 2, 1, 1; −40 then −60 add up to one step; every wheel event reaching `window` has `defaultPrevented`.
3. **Double-click:** a single click at Bahnhof Sisseln does nothing (car unmoved, `jumped` false); `page.mouse.dblclick` there moves the car within 30 m, on the road (`roadDist < 0`), and `raceFlags().jumped` is true; at 4× a double-click at (1660, 330) lands within 30 m, on the road.
4. **Double-tap** (touch context): a single tap does nothing; two quick taps place the car within 30 m, on the road, as a jump.
5. **Help:** `#help` mentions "zoom the map" and "double-click".
6. All existing smoke tests stay unchanged and green.

## Acceptance criteria

- [ ] Wheel over the minimap and the **+**/**-** keys (main row and numpad) step the zoom through 1×, 2×, 4×, 8×, clamped at 1× and 8×; trackpad deltas add up to whole steps.
- [ ] 1× shows exactly today's whole-region view.
- [ ] Zoomed in, the view is centred on the car and follows it; near the map's edge it stops at the border instead of showing beyond it.
- [ ] The map is drawn by cropping the pre-rendered `mapStatic`; checkpoints, finish and the car arrow use the same transform and keep their pixel size; nothing is re-rendered per frame.
- [ ] The map header shows the current zoom (`Map · Hochrhein · 4×`).
- [ ] Double-click on the map (mouse) and double-tap (touch, < 300 ms) put the car on the nearest jumpable road to that point; a single click or tap does nothing; one gesture never places twice.
- [ ] A map placement during a race sets `R.jumped` (the run is not recorded), exactly like **J**.
- [ ] Wheel over the map never scrolls the page (`preventDefault`); only `#map` receives pointer events, the rest of the HUD stays click-through.
- [ ] `window.__mm.map()`, `window.__mm.mapToWorld(px, py)` and `window.__mm.worldToMap(x, z)` exist.
- [ ] The F1 help mentions map zoom (wheel, **+**/**-**) and double-click/double-tap placement.
- [ ] `CHANGELOG.md` has one player-voice line under `[Unreleased]` → `Added`.
- [ ] The new tests in `prototype/tests/test_minimap.py` pass; all existing smoke tests pass unchanged.
- [ ] No new files except the test file; no framework, no build step.

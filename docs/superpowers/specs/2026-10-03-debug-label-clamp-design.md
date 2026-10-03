# Debug height label stays on screen — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-03 · Issue #70

## Goal

The issue: in debug mode (#39, **F3** / `?debug`) the building-height label (`22.8 m +3.9 dsm` on Bodenackerstrasse 6) floats 4 m above the roof. For a tall building near the camera it leaves the top of the screen; only a sliver is visible. The issue offers two fix directions: a screen-space clamp, or a fixed height / façade placement.

Success: every debug height label whose roof-top position would be drawn above a fixed line near the top of the screen is lowered along its building's vertical axis until it sits on that line, and it is drawn over the building it now overlaps. This holds for every building in the region up to the tallest one (`155170807`, roof top 38.1 m), in every camera view, every frame. Labels that already fit stay exactly where they are today.

## Starting point (verified 2026-10-03 on `main` @ `a1f63d6`)

- `prototype/debug.js` is the pure, three-free helper module of #39. `heightLabels(buildings)` (`debug.js:33-35`) returns `{ t, x, z, top, id }` per building, `top = roofTop(b)` (`world.js:115`).
- `prototype/index.html:1086-1094`: the debug height layer. `DEBUG_H.grid` holds every label with `it.y = terrainH(it.x, it.z) + it.top + 4` (`:1087`). A pool of 40 `THREE.Sprite` (scale 6.4 × 1.2, `:1088`) gets the 40 nearest labels within 60 m of the car in the layer's `tick(x, z)` (`:1092`), which `debugTick()` (`:1082`) calls at most every 250 ms. Materials: `debugMat(t)` (`:1089`) — `SpriteMaterial` with `depthWrite: false`, default `depthTest: true`.
- The panel line `bldg <id> · <text>` uses `DEBUG_H.shown[0]`, the nearest label (`:1096`). That line is already always on screen; only the sprite is affected.
- Frame order: `loop` (`:1104`) runs `stepCamera(dt)`, then `hud(dt)` (which ends with `debugTick(); drawMap();`, `:1099`), then `renderer.render`. The camera's `matrixWorld` is only refreshed by `render`, so code in `hud` that projects must call `camera.updateMatrixWorld()` first (three r170 `Camera.updateMatrixWorld` also refreshes `matrixWorldInverse`).
- Camera: `PerspectiveCamera(62, …)` (`:803`), vertical FOV 62°. Chase view sits 9 m behind and 3.4 m above the car and looks 6 m ahead (`:834`, `:995`). Four views exist (chase, near, cockpit, bumper; `:988`).
- Why it overflows: Bodenackerstrasse 6 (`171822634`, `h 22.8`, `rh 3.9`) puts its label at ground + 30.7 m. From the test spot used by `test_coordinates_and_building_heights_near_the_car` (`rect[0] + 20`, `prototype/tests/test_debug.py:61`), the label is ~29 m from the camera and ~26 m above it — about 42° up, while the screen ends at 31° minus the camera's downward pitch.
- Tallest buildings in `data/world_hochrhein.json` by `roofTop`: `155170807` 38.1 m (`h 32.5 + rh 5.6`); next 33.9 m and 33.8 m. Thin DSM spikes such as `174591942` (`h 2.5 + rh 26.8`, 12 × 5 m) are chimney-like and are what the issue's "DSM chimney excluded" refers to; the clamp is generic, so they are covered anyway.
- Hooks: `window.__mm.debug()` (`:1097`) returns `heights: [{ t, id, d }]`; `__mm.sim(x, z, th, v, secs, hold)` (`:953`) places the car with a heading; `__mm.cam()` (`:960`) returns the camera offset.
- Unit tests: `prototype/tests/debug.test.mjs` (node:test). Browser tests: `prototype/tests/test_debug.py` (Playwright).
- Related specs: `2026-10-02-debug-mode-design.md` (#39, the layer this fixes). `2026-10-03-helicopter-mode-design.md` (#10, not merged yet) adds a camera that is far higher; the clamp reads whatever `camera` is, so it covers that too.

## Decisions

| Topic | Decision |
|---|---|
| Approach | **Screen-space clamp** (the issue's first direction). Each frame, project each visible debug sprite's unclamped position; if its NDC y is above `0.8`, lower it along the building's vertical axis to the height whose NDC y is exactly `0.8`. Never raise a label. |
| Math | Pure helpers in `debug.js`, no three.js: `labelNdcY(view, tanHalf, x, y, z)` returns the NDC y of a world point (`NaN` behind the camera), from `view` = `camera.matrixWorldInverse.elements` (column-major) and `tanHalf = tan(fov/2)`. `clampLabelY(view, tanHalf, x, y, z, ndcMax, floor)` solves the linear equation for y in closed form and returns `max(floor, min(y, y*))`; it returns `y` unchanged when the point fits, is behind the camera, or the camera looks straight down (denominator ≤ 0). |
| Limit | `ndcMax = 0.8` (`DEBUG_LABEL_NDC_MAX` in `debug.js`). The label centre stays ≥ 10 % of the screen height below the top edge, which leaves room for half the 1.2 m sprite at any distance ≥ 5 m. |
| Floor | `terrainH + 2` m. A label is never pushed below 2 m above its footprint's ground. |
| Cadence | The 250 ms tick still picks the labels; the clamp runs **every frame** (`clampDebugHeights()` called from `hud` right after `debugTick()`), because it depends on the camera, which moves every frame. The unclamped height stays on the label item (`it.y`); the sprite's `position.y` is recomputed from it each frame, so it is idempotent. |
| Occlusion | Debug height sprites are drawn **without depth test** (`depthTest: false`, `renderOrder: 10`) — a lowered label sits on or inside its building's façade and would otherwise be hidden by its own walls. All debug height sprites, not just clamped ones: one material per text stays one material. |
| Horizontal | Not clamped. A label off to the side belongs to a building beside or behind the camera, not "the building in front". |
| Scope | Only the debug height layer. House numbers (`LABELS`), village names, landmark signs: unchanged. The panel line: unchanged. |
| Test hook | `__mm.debug().heights[i]` gains `ny` (the sprite's current NDC y, via `labelNdcY`) and `clamped` (sprite y below `it.y`). |

## Acceptance criteria

- Debug on, car at `rect[0] + 20` of Bodenackerstrasse 6 (`171822634`) facing the building, chase view, camera settled: the label of `171822634` is visible and its NDC y is in `[-1, 0.8]`, and it is reported `clamped`.
- Same for the tallest building in the region (`155170807`, roof top 38.1 m), car at `rect[0] + 22` facing it.
- A label that fits keeps its roof-top height: the unit test for `clampLabelY` returns `y` unchanged for a point below the limit and for a point behind the camera.
- A clamped label is never placed below `terrainH + 2`.
- `test_debug.py`'s existing four tests and `debug.test.mjs`'s existing tests stay green unchanged.
- House-number sprites are not affected (`__mm.labelSprites()` unchanged by toggling debug — already pinned by the existing test).

## Out of scope

- Re-picking which building counts as "in front" (stays: nearest centre).
- Labels for hidden buildings drawing through other buildings is accepted (debug view).
- No new keys, no new UI strings.

## Assumptions (quick mode)

- **A1** [high] Screen-space clamp, not a fixed eye-line height or façade placement. Rejected: façade placement needs a ray/rotated-box intersection per label for no visible gain; a fixed height above the eye line loses the "this number belongs to that roof" reading for low buildings. The issue lists the clamp first.
- **A2** [med] Clamp line at NDC y 0.8. Rejected: 0.9 (half the sprite pokes out for near buildings) and a pixel margin (needs the viewport size; NDC is resolution-free).
- **A3** [med] All debug height sprites drop the depth test. Rejected: an x-ray material only for clamped sprites (two materials per text, cache keyed on a flag). Debug labels behind buildings now show through — acceptable for a debug overlay.
- **A4** [high] Clamp runs every frame, label selection stays on the 250 ms tick. Rejected: clamping only on the tick — the label would jump 4× per second while the camera moves.

## Consequences

- With debug on, labels of buildings behind other buildings are visible through them.
- Tall buildings' labels now sit on the upper façade instead of above the roof while the camera is close; they rise back to the roof as the car drives away.
- Per frame, up to 40 extra closed-form projections while debug is on (no allocations). Nothing changes while debug is off.

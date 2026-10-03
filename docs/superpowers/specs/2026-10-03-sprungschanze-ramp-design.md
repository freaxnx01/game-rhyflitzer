# Sprungschanze: a ramp you can see and jump — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-03 · Issue #80

## Goal

The issue: "Jump: Was soll Sprungschanze sein? Ich sehe keine." The J list (#41) offers **Sprungschanze** (Sisseln), but after the jump there is no ramp in sight.

Success: after **J → Sprungschanze** in the OSM world, the car stands on a short run-up with the ramp straight ahead and visible. Holding gas from there drives up the ramp and launches the car into the air. The hand-traced layout keeps its ramp exactly as today.

## Starting point (verified 2026-10-03 on `main` @ `a1f63d6`)

- **Where the entry comes from:** `LANDMARK_INFO` (`prototype/landmarks.js:27`) has `{ name: 'Sprungschanze', gemeinde: 'Sisseln', anchor: 'jumpRamp' }`. The #41 spec lists it (`docs/superpowers/specs/2026-10-02-jump-landmarks-design.md:66`). #46 left it unchanged.
- **Where the anchor comes from:** `pipeline/anchors.json:14` has `"jumpRamp": { "game": [337.8, 170.2], "kind": "ramp", "heading_deg": 0 }`. That is the hand-traced ramp position copied over: `W(1093, 567)` = (337.8, 170.2). The world JSON carries it as `anchors.landmarks.jumpRamp = { x: 337.8, z: 170.2, rot: 0 }`.
- **Ramp physics, both layouts:** `RAMP` (`prototype/index.html:324`) is a 25.4 × 35.6 m box, 3.4 m high. In the OSM world it is re-centred on the anchor (`:410`). `groundH` (`:396`) raises the ground inside the box linearly along **+x**, from 0 at `x0` to `h` at `x1`. The anchor's `rot` is ignored.
- **Ramp mesh: hand layout only.** The gravel wedge (`:750`) sits inside the `if (!L) { … }` block (`:732-752`), next to the hand-traced gravel pad (`:749`). **In the OSM world the ramp is invisible**: the ground there is raised (ground 1.91 m at the centre vs 0.29 m 30 m west), but nothing is drawn.
- **Jump target:** `pickJump` (`:1021`) calls `jumpTo(r)` (`:923`). That function puts the car on the nearest jumpable road point and aligns it with that road segment.
- **Headless repro (OSM world, procedural terrain as in the tests):** J → "sprung" puts the car at (513.3, 172.1), heading 90.6°. That is **175.5 m east** of the ramp centre, and the ramp is **90° off** the heading (to the left). The nearest road of any class is that service road, 175.5 m away. No building lies within 80 m of the anchor, and no prop lies in the box x 260…360, z 140…200. The anchor is in an open field in the Sisslerfeld.
- **The ramp already launches the car** once you drive at it. With `__mm.sim(x0 − 40, zc, 0, 0, secs)` (standing start, gas held, facing +x): at 3.5 s the car is on the ramp top (x 348.0, y 3.25). At 4.0 s it is past `x1` (x 362.8), **2.41 m above the ground**, at 29.6 m/s. At 6.0 s it has landed (x 427.2). The `L && lift > 1` cap in `stepCar` (`:976`) does not interfere: at about 27 m/s the slope lifts the car by about 0.06 m per step.
- **Hand layout:** the J list shows only the race points (`:919`). The Sprungschanze is not in it there, so jumping to it is OSM-only.
- **Car off road:** `stepCar` (`:964`) has no off-road penalty. The car drives on terrain as on a road. `placeOnRoad(x, z, th, name)` (`:922`) accepts any point; it sets `P.safe`, so **R** returns there.
- **Test hooks:** `__mm.car()`, `__mm.heading()`, `__mm.ground(x, z, y)`, `__mm.sim(x, z, th, v, secs)` (`:927-953`), and `__mm.counts` (`:355`, already used for parking and props).
- **Parallel work:** #79 (J → Fridolinsbrücke on the Swiss side) is being enriched at the same time and also changes where `jumpTo` puts the car.

## Decisions

| Topic | Decision |
|---|---|
| Where the ramp stands | It stays at its anchor (337.8, 170.2), in the open field. Nothing in `pipeline/` or `data/` changes. |
| Draw it in the OSM world | The ramp mesh moves out of the hand-only block into a `rampMesh()` builder that runs in both layouts. The mesh itself is unchanged. |
| Where J puts the car | 40 m before the ramp's low edge, centred on it, facing up the ramp (+x, `th = 0`). This replaces the nearest-road spot. |
| How the jump list knows | `LANDMARK_INFO`'s Sprungschanze entry gets `ramp: true`. `landmarkEntries` passes it through. `pickJump` sends ramp rows to a new `jumpToRamp(name)`. |
| Where the run-up is computed | A pure `rampApproach(ramp, runUp)` in `landmarks.js`, with node tests. |
| Gravel pad | Not added in the OSM world. Only the wedge. |
| Test hooks | `__mm.ramp()` returns the ramp box `{ x0, x1, z0, z1, h }`. `rampMesh()` sets `__mm.counts.ramp = 1`. |
| Text | No new UI string. The toast stays the entry name ("Sprungschanze"), as it is today. |

## Design

### `prototype/landmarks.js`

- `LANDMARK_INFO`: `{ name: 'Sprungschanze', gemeinde: 'Sisseln', anchor: 'jumpRamp', ramp: true }`.
- `landmarkEntries`: an entry from an item with `ramp: true` carries `ramp: true`. All other entries stay `{ n, g, x, z }`, so the existing deep-equal tests do not change.
- New export `rampApproach(ramp, runUp)` returns `{ x: ramp.x0 − runUp, z: (ramp.z0 + ramp.z1) / 2, th: 0 }`. It is pure: no DOM, no three.js. `th = 0` is +x, the direction `groundH` raises the ramp.

### `prototype/index.html`

- Import `rampApproach`.
- Move the wedge block from `:750` into `function rampMesh()`. Call it once, right after the hand-only block closes (`:752`). It then runs in both layouts, before the `parts` merge (`:811`). It also sets `window.__mm.counts.ramp = 1`.
- `const RAMP_RUNUP = 40;` and `function jumpToRamp(name) { const s = rampApproach(RAMP, RAMP_RUNUP); placeOnRoad(s.x, s.z, s.th, name); }`.
- `pickJump`: `if (r.random) randomSpot(); else if (r.ramp) jumpToRamp(r.n); else jumpTo(r);`
- Test hook `window.__mm.ramp = () => ({ x0: RAMP.x0, x1: RAMP.x1, z0: RAMP.z0, z1: RAMP.z1, h: RAMP.h })`.

### Race semantics

These are unchanged. `placeOnRoad` marks a jump during a race (`R.jumped`), closes the dialog and shows the toast.

## Testing

- Node (`prototype/tests/landmarks.test.mjs`): checks `rampApproach`, that the `ramp` flag passes through `landmarkEntries`, and that only the Sprungschanze is flagged in `LANDMARK_INFO`.
- Playwright (`prototype/tests/test_jump.py`, OSM world):
  - After J → "sprung", the car stands before `x0`, 30–80 m from the ramp centre, with the centre within ±5° of its heading. The ramp centre is the `jumpRamp` anchor, and `__mm.counts.ramp == 1`.
  - From that spot, `__mm.sim(x, z, th, 0, 4)` ends past `x1` and more than 1 m above the ground (a launch). The dry run measured 2.41 m.
- Playwright, hand layout (world blocked): `__mm.counts.ramp == 1`, so the hand ramp is still drawn after the move.
- Manual (test-todo): with the real terrain (`.mmh`), the wedge is visible from the jump spot, is not buried in a slope, and the jump feels right.

## Out of scope

- Moving the ramp next to a road, a rebuilt world, or turning the ramp by the anchor's `heading_deg`.
- Side walls for the wedge. The mesh has a sloped top and a back face only, as today in the hand layout.
- The Gemeinde shown for the entry ("Sisseln"). The ramp is fictional, and its field in the Sisslerfeld was not checked against the boundaries.
- #79's Fridolinsbrücke spot, and any generic per-landmark jump-spot override.

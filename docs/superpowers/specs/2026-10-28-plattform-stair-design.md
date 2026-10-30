# Plattform Sisslerfeld: true-to-plan tower with a walkable spiral stair (#413)

## Goal

Two things:

- The Plattform Sisslerfeld is rebuilt to its real construction. Today it is a square placeholder (`plattformTower` in `prototype/index.html`). The real tower stands on a **triangle**.
- On foot, the player walks through the door of the slatted core cylinder and climbs the **spiral stair**: lower flight, landing (Podest), upper flight. The stair comes out on the **triangular viewing deck**, which is walkable up to its parapet.

## Source of the measurements

The dimensions come from the Häring AG montage plans (project "Aussichtsturm Sisslerfeld", 12.11.2025, scale 1:20). The KSL situation plan (03.06.2026) was used too. Verein Plattform Sisslerfeld sent both on 2026-10-28. **The plans are not in this repo** (the Häring sheets carry an intellectual-property notice), and they must not be added. Only the numbers below are used. A CAD export may follow later. If it arrives, it replaces the visual model, and the walkway layout keeps these numbers unless the CAD shows otherwise.

Credits: "Plattform Sisslerfeld: measurements courtesy of Verein Plattform Sisslerfeld (construction Häring AG)". Brand banners on the tower (an energy company's banner on the cylinder) are **not** modelled. See `docs/07-brands-and-permissions.md`.

## Measurements (metres, heights above the underside of the base plates = terrain at the anchor)

**Frame:** the three posts form an equilateral triangle with **6.00 m** sides (post centres). The posts are 0.24 × 0.24 m. Each side has a wall frame (AW01–AW03) with an X brace, 5.42 m high. AW01 is the **entrance side**. The posts run on up to the eaves.

**Central post:** 0.24 × 0.24 m in the centre of the triangle. It runs from the ground to the roof apex, and the stair treads wind round it.

**Core cylinder:** vertical battens on a ring. The outer radius is **1.56 m** (deck opening Ø 3.12 m) and the treads reach r = 1.43 m. It runs from the ground to the deck. The **door** faces the entrance side (AW01).

**Spiral stair:** every rise is **0.16 m**. Treads are 20° sectors from the central post to r = 1.43 m. Angles φ are measured from the door direction, increasing **clockwise seen from above**.

| Part | Sectors φ | Top of tread |
|---|---|---|
| door (gap in the battens) | −15° … +15° | 0 |
| lower flight, 17 treads (Häring 300–316) | k = 0…16: 10° + 20k … 30° + 20k | 0.075 + 0.16k (0.075 … 2.635) |
| landing (Podest, 2 × 417 + 317) | 350° … 480° (130°) | 2.795 |
| upper flight, 17 treads (318–334) | k = 0…16: 120° + 20k … 140° + 20k | 2.955 + 0.16k (2.955 … 5.515) |
| exit tread (335) | 460° … 480° (100° … 120°) | 5.675 |
| Austritt (exit landing) | 120° … 230° | 5.735 (= deck) |

**Deck:** an equilateral triangle with **9.84 m** sides (height 8.52 m) and the same centroid and orientation as the frame. The base edge is on the entrance side. The top is at **+5.735 m**, the beam layer about 0.30 m thick. There is a circular opening Ø 3.12 m over the stair. The parapet is a closed board box **1.24 m** high along all three edges.

**Roof:** a triangular pyramid with **12.10 m** sides at the eaves and a **45°** pitch, so the apex sits 3.49 m above the eaves. The eaves are at about **+8.2 m** (estimated from the photo and the post lengths; no dimensioned elevation). That puts the apex at about **+11.7 m**. The sheet metal is grey-green, as today.

**Ground:** a triangular concrete slab with **12.03 m** sides under the tower (KSL), in the same orientation. Around it is gravel.

**Orientation:** the entrance side (base edge of every triangle) faces the **nearest road** (Breitenloh), as the KSL plan shows. The base edge is parallel to the road.

## Design

A new pure module, **`prototype/plattform.js`**, without three.js or DOM, in the style of `stairhall.js`. It contains:

- `PLATTFORM`: the numbers above.
- `plattformFrame(x, z, facing)`: the layout frame. `e` = (cos facing, sin facing) points from the centre to the entrance side, `r` = (−sin facing, cos facing). The frame also offers `toWorld(u, v)` and `triangle(side)`, the three corners of an equilateral triangle on the centroid with its base edge across `e`.
- `facingToRoad(x, z, lines)`: the heading from (x, z) to the nearest point on a set of polylines.
- `plattformWalk(frame, base)`: a walkway set (`walkways.js`) with every y in absolute height (`base + …`):
  - every tread, the landing, the exit tread and the Austritt as **polygon slabs** (sector polygons, 4 arc points per 20°);
  - the deck as a polygon slab with a **polygon hole** (24-gon, r 1.56);
  - **walls**: the batten ring as 36 segments of 10° from 0 to the deck (the three door segments only from 2.2 m up); the central post; a railing round the deck opening from 230° to 460° (deck … deck + 1.1); the three parapet edges (deck … deck + 1.24).
- `plattformEntrance(frame)`: `{ x, z, th, w }`, outside the door at r = 2.0 on the entrance side, with `th` pointing inward (the direction you walk in), in the format of `enterables.js`.

**`walkways.js` change:** a slab's `holes` may also hold polygons (`{ poly }`), not only rectangles. That means one line in `inFootprint`, so a hole uses `inFootprint` itself.

**`index.html`:**

- `plattformTower` is rebuilt from `plattformFrame` and `PLATTFORM` (meshes only; no logic in the render code). The layout is computed once. The old square placeholder goes. Car colliders (`addOBB`) remain only for the three outer posts. The core cylinder gets **no** OBB, because a box would make the walker stand on top of the cylinder.
- The walkway set is merged into `WALKS`. `WALKS` currently takes 6c's arrays **by reference** (`Object.assign(WALKS, INT.hall.walk)`). The plattform pieces must not end up in `INT.hall.walk`, so `WALKS` gets new arrays (`[...hall.walk.slabs, ...plat.slabs]`, and so on). The 6c elements stay the same objects, so door leaves and `wallByTag` keep working. Nothing pushes into the arrays after start-up (the lift cabin is pushed into `hall.walk.slabs` at `index.html` before the merge). The merge must come after that.
- `ENTERABLE_INFO['plattform-sisslerfeld']` becomes `ready: true`. The runtime fills `entrances` from `plattformEntrance` (as for 6c). `ENTER_HANDLERS['plattform-sisslerfeld']` shows a toast, "Die Treppe ist offen" / "The stair is open". You simply walk in; nothing has to open.

## Acceptance criteria

- `prototype/plattform.js` exists, is pure, and `node --test prototype/tests/plattform.test.mjs` is green.
- Climbing the stair needs no step higher than `WALKER.stepUp`. A node test walks the centre line of the stair, from the door (y 0) through the treads, landing, exit tread and Austritt onto the deck (y 5.735). With `walkwayFloor` it gets a surface at every step that rises at most 0.6 m, and it ends at deck height.
- On the stair path the headroom (`walkwayCeiling − floor`) is ≥ 1.7 m. On the real stair it is about 1.8 m at its tightest; the walker's 1.9 m gets the harmless `headBump`.
- From the deck the parapet blocks walking off: `walkwayPush` pushes back at every edge midpoint at deck height.
- The battens block a walker outside the cylinder, except at the door.
- In the game (Playwright, `prototype/tests/test_plattform_stair.py`, foreground):
  - E at the door shows the toast, and the console stays empty.
  - Set on the top tread of the upper flight and walking forward along the stair (W), the walker reaches deck height ±0.1 m within 4 s.
  - Set on the deck at the base edge, the walker cannot walk over the parapet (W for 2 s, still on the deck).
- The tower looks like the photo (`design/reference/2026-09-29_plattform-sisslerfeld.jpg`): three posts, X braces, slatted cylinder, triangular parapet box, triangular pyramid roof.
- The full node suite is green.

## Assumptions

- **A1** [med] The lower flight starts at the door and climbs **clockwise seen from above**, read off the Häring tread plan. If it is mirrored, it is a sign flip in `PLATTFORM.stair`.
- **A2** [med] The sector angles of the landing (130°) and the Austritt (110°) come from the angle marks on the tread plans. Their exact start angles are fitted so that the flights join seamlessly.
- **A3** [med] The door is **30°** wide (0.81 m at the ring), wider than the 0.44 m batten gap in the plan. Rejected: the real width, because the walker has a 0.35 m radius and would not fit through.
- **A4** [med] The eaves are at about +8.2 m (estimate). The plans give no overall elevation with levels. A CAD export would fix this.
- **A5** [high] The entrance side faces the nearest road. Rejected: a fixed `rot` in `anchors.json`. KSL shows the base edge parallel to the road, and computing it from the road survives a correction of the anchor.
- **A6** [high] Enter means walking in. E only shows a toast. Rejected: a door that opens. The real tower has an open doorway.
- **A7** [high] `walkways.js` gets polygon holes. Rejected: a square hole, which would leave falling gaps in the deck outside the railing.

## Consequences

- The tower now covers a triangle of about 12 m (roof) instead of 10.8 m square. The jump spot (25 m east on Breitenloh, `landmarks.js`) stays clear.
- `enterables.test.mjs` asserts today that the Plattform is not `ready`. That assertion changes with the feature, deliberately; it is not bent to make a test pass.
- The Plattform is now listed as enterable in the J list (`visibleEnterables`).

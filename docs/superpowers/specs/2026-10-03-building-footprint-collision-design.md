# Buildings collide where they are drawn — design

Status: approved headless (`/enrich 36 --headless`) 2026-10-03 · Issue #36

## Goal

The car is stopped by a building's walls, not by an invisible box around it. Two playtests found the car stuck in the open, clear of the nearest wall (#36: on grass beside a long low building on the way to Bahnhof Sisseln, 2026-10-02; second repro in a lane between two buildings in Bad Säckingen, 2026-10-03, `docs/ai-notes/feedback/2026-10-03-playtest.md` entry 12).

Success looks like:

- At the second repro spot (x −1392.0, z −466.9, bearing 151°, full gas from standstill) the car drives on down the lane instead of standing still.
- Driving straight at a concave building, the car stops with its collision circle on the **drawn** wall, not metres in front of it.
- Region-wide, a car-sized circle placed in the open part of any building's bounding rectangle (clear of every drawn footprint) is not pushed.
- Gable-roofed buildings, halls, props, bridges, the hand-traced layout and the compact's golden trace behave exactly as before.

## Root cause (reproduced headless)

`osmBuilding` (`prototype/index.html` ~line 529) draws two kinds of building:

- **Gable path** (`b.roof === 'gable'`, unless a measured roof is flatter than 0.6 m): a box of the minimum rotated rectangle `b.rect`. Collider = `addOBB(b.rect)`. Mesh and collider agree.
- **Flat path** (everything else, 781 of 1,892 buildings): walls extruded from the real footprint `b.ring` (`extrudeFootprint`). Collider = the same `addOBB(b.rect)`, the *minimum rotated rectangle* the pipeline computes in `pipeline/world_buildings.py` `roof()` (`poly.minimum_rotated_rectangle`).

For any L-, U- or bevelled footprint, the rectangle covers ground the drawn walls don't: an invisible wall. `collide()` (~line 992) pushes the car out of that rectangle.

Measured with Playwright against the committed world file (`__mm.sim` plus a temporary route-injected hook around `collide`; flat and measured terrain give the same numbers):

- **Second repro (lane, Bad Säckingen).** Two flat buildings flank the lane: `91591385` (13.6 m) and `718216439` (8.6 m). Drawn gap between their walls: **7.99 m**. Gap between their collision rectangles: **2.54 m**, less than the car's diameter (2 × 1.69 m). The car centre is 1.70 m and 1.64 m from the two rectangles but 3.77 m and 6.18 m from the drawn walls. With full gas at bearing 151° for 3 s the car moves **0.05 m**; with the building colliders removed it moves **52 m**, and with the fix below **38.6 m**.
- **First repro (towards Bahnhof Sisseln).** Most likely `209002925`, a long, low (3.5 m) flat building at x ≈ 1420–1441, z ≈ 1344–1403, 880–912 m from checkpoint 1 (the screenshot reads 913 m). Its rectangle reaches up to **13.3 m** beyond the drawn walls (a bevelled south-west corner, a 4 m strip along the west wall). Driving east at its west wall (z 1365) the car stops at x 1419.41, its circle **4.3 m short** of the wall at x 1425.47; with the fix it stops at 1423.78, circle edge on the wall (± 0.01 m).
- **Ground step ruled out.** The "> 1 m ground step" rule in `stepCar` (~line 1005) only zeroes the vertical launch (`P.vy`); `P.y` is still snapped onto the higher ground, so it never stops horizontal motion. The slope term cannot stop the car either: `drive.accel` 16 m/s² exceeds g. A sampled scan (55,023 off-road points, 0.5 m apart) found 104 terrain steps over 1 m (0.19 %), none relevant to a stop. At both repro spots the car drives freely once the building colliders are removed.

Region-wide (pure Python over `data/world_hochrhein.json`):

| Flat-path buildings | 781 |
|---|---|
| Rectangle reaches > 1 m beyond the drawn walls | 559 |
| … > 3 m | 426 |
| … > 10 m | 134 (worst 66.9 m, `161270274`) |
| Invisible collider area outside every drawn footprint | 266,831 m² |
| Buildings whose invisible collider covers road | 90 (5,759 m² of road) |
| Sample points (3 m grid) in the open part of a rectangle, ≥ 2.2 m from any drawn wall | 23,353 in 415 buildings |
| … pushed today | **23,353 (100 %)** |
| … pushed with the fix | **37 (0.16 %)**, all next to a lamp post or similar solid prop |

## Decisions

| Topic | Decision |
|---|---|
| Where | Runtime, in `collide()`. The world file already carries every `ring`; no pipeline change, **no world rebuild**. |
| How | Flat-path buildings keep their rectangle OBB for the broad phase (grid, `free()`, camera), plus `ring: b.ring`. `collide()` tests a ring-carrying obstacle against the ring with a new pure helper `ringPush(ring, x, z, r)` in `prototype/world.js`: null when clear, else the outward unit push `{ wx, wz, pen }`. The rest of the response (position push, bounce 1.25, speed loss, damage, crash sound) is unchanged code. |
| Inside a footprint | Pushed out through the nearest wall by `r + depth` (jump/spawn into a building, as the rectangle does today). |
| Gable path, halls, props, landmarks | Unchanged: they are drawn as boxes of their OBB, so the OBB is already exact. |
| `free()`, camera pull-in, tree/forest placement | Unchanged: they keep the rectangle (see Consequences). Changing `free()` would move buildings and trees (seeded RNG). |
| Test hook | `__mm.pushAt(x, z)` → `{ dx, dz }`: the push `collide()` would give a resting car at (x, z); the car state is restored. Read-only, for the region-wide test. |

### Rejected

- **Split each footprint into several rectangles in the pipeline.** Needs a world rebuild, still approximates, and every consumer of `rect` (labels, row houses, camera) would need a second shape.
- **Draw flat buildings as their rectangle.** Changes the look of 781 buildings; the footprints are the point of the OSM world.
- **Make `free()` ring-aware.** Shared with house and hall placement; moving them is out of scope and changes the seeded layout.

## Interaction with enriched, unmerged issues

- **#69 car at real size** (collision radius 1.69 → 1.3 m). Alone it would **not** fix the lane: 2.54 m collider gap < 2.6 m diameter. All new tests read the radius from `__mm.vehicle()` (or use a margin ≥ 1.69 + 0.5 m), so they pass in either order. #69's own rule ("collisions match the body") gets more true with this fix.
- **#13 forests.** Forest edge walls are plain OBBs (no `ring`) and keep the rectangle path. Tree placement goes through `free()`, unchanged. A forest wall in a building's open notch would block a few region-test points; the test's 1 % tolerance covers it (today 0.16 %).
- **#72 trees off car parks.** Independent (tree placement only). If #72 lands first, `world.js` also has point-in-ring and edge-distance code in `parkingIndex`; do not merge the two now (different return shape), note it.
- **#6 tractor and bus** (enriched): its refactor moves the per-obstacle body of `collide()` into `collideCircle(px, pz, r)`. If #6 lands first, put the `o.ring` branch into `collideCircle` at the same place (before `if (o.circle)`), using the sample point instead of `P.x, P.z`.

## Consequences

- 559 buildings stop blocking 1–67 m in front of their walls; the car now reaches courtyards, notches and lanes it could not before, and stops with its circle on the wall.
- The chase camera still pulls in at the rectangle (`stepCamera` test uses OBB extents): near a concave building it may come in a little early. Cosmetic, unchanged.
- Trees and generated houses still keep off the rectangle, so courtyards stay empty — unchanged.
- Cost: one ring test per nearby flat building per frame, ≈ 12 µs per call (median ring 7 vertices, max 150); `physMs` stays well under 1 ms.
- The 1,111 gable-path buildings with a non-rectangular footprint still collide as a box, but they are also drawn as that box.

## Testing

- `node:test` (`prototype/tests/world.test.mjs`): `ringPush` on an L-shaped ring in both windings — clear in the cut-out corner, pushed out of a touched wall by the overlap, pushed out of the inside by depth + radius, centre on a wall → outward normal, far away → null.
- Playwright (`prototype/tests/test_building_collision.py`, terrain blocked like the other smoke tests):
  1. Lane repro: 3 s full gas from (−1392.0, −466.9) at bearing 151° travels > 20 m (today 0.05 m).
  2. Drawn wall: driving east at `209002925` from x 1410, z 1365 for 4 s, the car stops with `x + r` within 0.3 m of the drawn wall (today 4.3 m short).
  3. Region-wide: the 23,353 notch points from a pure-Python sampler; fewer than 1 % may be pushed (today 100 %).
- Full suite: the golden trace runs on the hand layout (no rings) and must stay bit-identical.

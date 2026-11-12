# OSM house facades Implementation Plan (#901)

**Goal:** gable-path OSM houses get one door at street level, only whole windows, plain gable ends (plus one attic window
when it fits) and a roof whose overhang draws from below. **Spec:** `docs/superpowers/specs/2026-11-11-osm-house-facades-design.md`.

**Global constraints:** buildless. Pure maths in `world.js`, node tests `node --test tests/world.test.mjs`. Do **not**
add or remove any `rnd()`/`rr()` draw before or inside the building loop (seeded colours): new textures use a local LCG,
the old door coin stays drawn. Row houses (`isRowHouse`) and landmark-replaced buildings keep their current path. One
Playwright file only, run in the foreground, under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`.
CHANGELOG entry under `[Unreleased]` / `### Fixed`, player voice.

## Task 1: layout maths in `world.js` (TDD)

**Files:** `world.js`, `tests/world.test.mjs`.
**Interfaces:** `FACADE`, `facadeRows(base, h, ground)`, `facadeColumns(len)`, `gableWindow(span, rh)`,
`facingFace(x, z, rot, w, d, road)`.

- [ ] Failing tests first:
  - `facadeRows_TwoStoreyEave_WholeRowsUpToEave`: `facadeRows(10, 5.5, 10)` -> `{ floor0: 10, floors: 2, sh: 2.75, bandTop: 15.5 }`.
  - `facadeRows_FourMetreEave_OneRowPlainAbove`: `facadeRows(0, 4, 0)` -> floors 1, sh 3, bandTop 3.
  - `facadeRows_DoorUphill_RowsStartAtDoorGround`: `facadeRows(0, 6.4, 1.2)` -> floor0 1.2, floors 2, sh 2.6.
  - `facadeRows_GroundAboveEave_Clamped`: `facadeRows(0, 4, 9)` -> floor0 1.8 (`h - 2.2`).
  - `facadeRows_Shed_NoWindows`: `facadeRows(0, 2.0, 0)` -> floors 0.
  - `facadeColumns_AnyLength_EndsOnWholeHalfTile`: for len in 2.1, 5.84, 13.01, 14.98: `n * cw` equals len (1e-9),
    `1.33 <= cw <= 4` for len >= 2; `facadeColumns(1.2).n === 0`.
  - `gableWindow_SteepWideGable_Fits` (`gableWindow(7, 3.4)` not null, `y === 0.4`) and
    `gableWindow_LowGable_Null` (`gableWindow(7, 1.3) === null`, `gableWindow(3, 3) === null`).
  - `facingFace_RoadOnPlusX_PicksFace1` (rot 0, road at [50, 0]) and the same rotated by 1.0 rad (road rotated too).
- [ ] Run, see them fail. Implement:

```js
// #901: storeys, window columns, attic window and the door face of a gable house (index.html draws them)
export const FACADE = { storey: 3, maxStorey: 3.5, minWall: 2.2, half: 2, minFace: 1.6, reach: 40, door: { w: 1.0, h: 2.1, off: 0.03 },
  attic: { w: 0.9, h: 1.1, sill: 0.4, margin: 0.3 } };
export function facadeRows(base, h, ground) {
  const floor0 = Math.min(Math.max(ground, base), base + Math.max(0, h - FACADE.minWall)), H = base + h - floor0;
  if (H < FACADE.minWall) return { floor0, floors: 0, sh: FACADE.storey, bandTop: floor0 };
  const floors = Math.max(1, Math.round(H / FACADE.storey)); let sh = H / floors;
  if (sh > FACADE.maxStorey) sh = FACADE.storey;
  return { floor0, floors, sh, bandTop: floor0 + floors * sh };
}
export function facadeColumns(len) { if (len < FACADE.minFace) return { n: 0, cw: len }; const n = Math.max(1, Math.round(len / FACADE.half)); return { n, cw: len / n }; }
export function gableWindow(span, rh) {
  const a = FACADE.attic, x = a.w / 2 + a.margin, top = a.sill + a.h + a.margin;
  return span / 2 > x && rh * (1 - x / (span / 2)) >= top ? { w: a.w, h: a.h, y: a.sill } : null;
}
export function facingFace(x, z, rot, w, d, road) {
  const faces = facadeLabels(x, z, rot, w, d, 0);
  const facing = (f) => road ? ((f.x - x) * (road[0] - x) + (f.z - z) * (road[1] - z)) / Math.hypot(f.x - x, f.z - z) : 0;
  return faces.reduce((a, f, i) => (facing(f) > facing(faces[a]) ? i : a), 0);
}
```

  Refactor `facingFacade` to call `facingFace` (same result; its existing tests must stay green unchanged).
- [ ] Green; commit `feat(world): facade layout maths for gable houses (#901)`.

## Task 2: plaster texture, roles and double-sided roof (`index.html`)

- [ ] `TEX.plaster`: 256 x 192, fill `#d8d2c6`, speckle with a local LCG (copy `TEX.plasterWhite`'s pattern, different
  seed); **no** `noise()` (it draws `rr()`).
- [ ] Both `mat:` maps (~3573 original, ~3575 flat): add role `plaster` (original: `map: TEX.plaster`; flat: colour
  `'#efe4cf'` and add it to the no-vertexColors list like `wall`). For role `roof`: `side: THREE.DoubleSide` in both.
- [ ] `GABLE_END_WALL = { role: 'plaster', uv: null }`.
- [ ] In `gable()`, after the end triangles, when `end === GABLE_END_WALL` and `gableWindow(d, rh)` is non-null: on both
  ends a `PlaneGeometry(gw.w, gw.h)` with UVs mapped to the window frame of `TEX.facade` (u 34/256..110/256,
  v 1-152/192..1-44/192), turned to face ±x local, `FACADE.door.off` out from `±w/2`, centre `h0 + gw.y + gw.h / 2`, then
  `rotateY(-rot)`, translate `(x, 0, z)`, `colorize(g, wallC)`, `push('wall', g)`.

## Task 3: `gableHouseWalls` and wiring

**Files:** `index.html`. **Interfaces:** `gableHouseWalls(b, base, h, wc)` returns the door `{ x, z, y, k }`;
`window.__mm.houseDoor(id)`; `window.__mm.counts.houseDoors`.

- [ ] In `osmBuilding`'s gable branch, non-row houses only: replace the `box(...)` call with `gableHouseWalls(...)`;
  keep `const door = rnd() < 0.5 ...` drawn (rename to `_doorCoin`, comment: #901 kept for the seeded sequence). Row
  houses keep `box(...)` unchanged.
- [ ] `gableHouseWalls`: local corners per face k (facadeLabels order, outward normal as `wallQuads` computes it):
  `k0 +z: (-w/2, d/2)->(w/2, d/2)`, `k1 +x: (w/2, d/2)->(w/2, -d/2)`, `k2 -z: (w/2, -d/2)->(-w/2, -d/2)`,
  `k3 -x: (-w/2, -d/2)->(-w/2, d/2)`; to world `(cx + lx*c - lz*s, cz + lx*s + lz*c)`, `c = cos(rot)`, `s = sin(rot)`.
  1. `road = nearestRoadPoint(cx, cz, b.st, FACADE.reach)`: give `nearestRoadPoint` a 4th param `reach = PLATE.reach`
     (it runs before `const PLATE` is initialised, so the caller must pass it). `k = facingFace(...rect, road)`.
  2. Door point = middle half-tile of face k: column `j = floor((n - 1) / 2)`, centre at `(j + 0.5) * cw` along a->b.
     `ground = terrainH(door point)`; `rows = facadeRows(base, h, ground)`. If face k has `n === 0`, use the face centre.
  3. Each face: plinth `wallQuads([{a, b}], rows.floor0, 0, wc, 'plaster', [4, 3], rows.floor0 - (base - 3))`;
     band `wallQuads([{a, b}], rows.floor0, rows.floors * rows.sh, wc, 'wall', [2 * cw, rows.sh], 0)` (n > 0 and
     floors > 0; else the whole wall is `plaster`); top `plaster` from `rows.bandTop` to `base + h` when > 0.01.
  4. Door face: the band is three pieces: `[a, col j start]`, `[col j end, b]` with `u0` so the tile carries on, and
     column j: ground storey `plaster`, storeys above `wall` with `dy: rows.sh`.
  5. Door quad: `PlaneGeometry(FACADE.door.w, FACADE.door.h)`, UVs = door rect of `TEX.facadeDoor`
     (u 150/256..212/256, v 0..1-60/192), `rotateY(-rot + k * Math.PI / 2)`, centre `FACADE.door.off` out from the
     wall at `rows.floor0 + FACADE.door.h / 2`, `colorize(g, col('#ffffff'))`, `push('wallDoor', g)`.
  6. Record `HOUSE_DOORS.set(b.id, { x, z, y: rows.floor0, k })`; `counts.houseDoors++`.
- [ ] `addOBB` unchanged. Commit `fix(world): one door per house, whole windows, closed roofs (#901)`.

## Task 4: Playwright `tests/test_house_facades.py` (one file) + row-house control

Boot like `tests/test_row_houses.py` (`open_page`, terrain `.mmh` stubbed). Buildings: 171822842, 171822922, 199700571.

- [ ] `test_each_gable_house_has_one_door_on_the_ground`: `counts.houseDoors` equals the number of gable-path, non-row,
  non-replaced houses (compute from `data/world_hochrhein.json` with the branch's rule; read replaced ids from
  `__mm.counts.chLandmarks.replaced`). For the three ids: `wallRoleAt` from 6 m out to 1 m in, normal through the door
  centre at `y - terrain + 1.0` -> `wallDoor`; the same column one storey up (`+ sh`) -> `wall` or `plaster`, never
  `wallDoor`. Use `up1` so heights are absolute.
- [ ] `test_gable_end_is_plaster`: 171822922's gable end at `h + 0.75 * rh` (above any attic window) -> `plaster`.
- [ ] `test_roof_overhang_hits_from_below`: from 0.25 m outside an eave face at eave - 1 m to 0.35 m outside at eave +
  1 m -> `roof` (a FrontSide roof misses this ray).
- [ ] `tests/test_row_houses.py:82`: control now `== "plaster"`; update the comment at line 64 (#901 made non-row gable
  ends plain plaster: intended behaviour change).
- [ ] Run the new file and `test_row_houses.py` only (not the full suite). Add both to `tests/test-map.json` under
  `world.js` if such a key exists, else leave the map alone.

## Task 5: CHANGELOG

- [ ] `### Fixed`: e.g. "Häuser haben jetzt genau eine Haustür auf Strassenhöhe statt Türen in jedem Stock, ganze Fenster
  statt abgeschnittener an Giebel und Ecken, und durch den Dachvorsprung sieht man keinen Himmel mehr." (match the
  file's language/voice; the existing entries are English, so write it in English with the same meaning).

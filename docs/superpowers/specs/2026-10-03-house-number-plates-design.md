# House-number plates on the street-side façade (#71) — Design

Status: written in headless enrichment (`/enrich 71 --headless`) 2026-10-03 · Issue #71 · supersedes the floating labels of #12 · related #45 (row-house facade, merged), #43 (roof shape, pipeline-only), #70 (debug height labels, separate)

## Problem

House numbers (#12) are camera-facing `THREE.Sprite`s, 3.2 × 1.2 m, hovering 1.5 m over the roof top of every numbered building within 60 m of the car (`prototype/index.html:812-818`, `addrLabels` / `roofTop` in `prototype/world.js:115-128`). The player wants them where a house number belongs: a plate on the façade that faces the street, at door height. Nothing may float over a roof any more.

## Decision taken by the user (2026-10-03, recorded here as `[confirmed]`)

- A **Swiss blue house-number plate** — white number on blue — at **door height** on the **street-side façade**, i.e. the façade facing the nearest road (the `addr:street` road where that is known).
- Address ranges with letters (`6a–6d`, `3a–3f`) get **one plate per entrance** where the entrances can be derived (equal units along the street-side façade, like #45's `rowUnits`); otherwise one combined plate.
- No numbers float over roofs any more.

Everything else below (visibility distance, pooling, how a plate sits flush on a wall in both building layouts) is decided from evidence in the repo and listed under Assumptions.

## Starting point (verified 2026-10-03 on `main` @ `ea601a2`)

- **Labels today.** `addrLabels(buildings, landmarks)` (`world.js:125-128`) makes one item per numbered building at the footprint centre `rect[0], rect[1]` with `top = roofTop(b)`; `index.html:813` lifts it to `terrainH + top + 1.5` and puts it in a 64 m grid. `updateLabels` (`index.html:818`) runs every 250 ms: `pickLabels(gridQuery(grid, x, z, 60), x, z, 60, 40)` picks the nearest 40 within 60 m and assigns them to a fixed pool of 40 sprites; the rest of the pool is hidden. One `SpriteMaterial` per distinct number (`labelMat`, `textTex` 256 × 96 on a dark translucent box), LRU-capped at 128 (`trimLabelMats`). Hooks: `__mm.labels()`, `__mm.labelSprites()`, `__mm.labelTick()`, `__mm.labelCache()` (`index.html:961-964`); `test_debug.py:71-74` reads `labelSprites()` to prove the debug layer leaves the house numbers alone.
- **Two building layouts** in `osmBuilding()` (`index.html:528-547`):
  - **gable path** — `b.roof === 'gable' && !(dsm && b.rh < 0.6)`: `box(w, h + 3, d, cx, cz, rot, …)` on the rotated rectangle `b.rect = [cx, cz, w, d, rot]`, so the walls are the four rectangle sides. 844 of the 1,328 numbered buildings take this path.
  - **flat path** — everything else: `extrudeFootprint(b.ring, …)` walks the real OSM ring (median 7 vertices, up to 150), one outward quad per edge; it reverses the ring when its signed area is positive and takes the outward normal as `(-(z1 - z0), x1 - x0) / L` (`index.html:510-516`). 484 numbered buildings. The rectangle covers the ring with a median fill of 0.93; 9 % are below 0.70 (L-shapes, notches).
  - `facadeLabels()` (`world.js:136-142`, #38) already maps the box's local frame to the world the way `box()` does: `x + lx·cos(rot) − lz·sin(rot)`, `z + lx·sin(rot) + lz·cos(rot)`; the `+z` face carries `rotY = -rot`. A `PlaneGeometry` with `rotation.y = θ` faces `(sin θ, 0, cos θ)`.
- **Roads.** `ROAD_GRID` (`index.html:207, 364`) holds every road segment `{ r, i }` padded by `r.w / 2 + 2` in 32 m cells; `segDist(px, pz, ax, az, bx, bz)` (`index.html:342`) is the point–segment distance. `L.roads` have `n, cls, w, pts`; 18 classes, 1,010 `residential`, 531 `service`, 23 `footway`, 9 `path`. The data has **no per-building street**: `pipeline/world_buildings.py:94-98` exports only `addr`, and `docs/11-pipeline-osm.md:125` says so ("No `street` field is exported"). Measured on `data/world_hochrhein.json`: the footprint centre is a median 18 m from the nearest road, 90 % within 37 m, 5 of 1,328 beyond 120 m.
- **Address formats** (1,328 numbered buildings): 1,144 plain (`12`), 40 with a letter (`36A`, `5a`), 18 letter ranges (`6a–6d`, `3a–3f` … all on the Bodenackerstrasse, listed in #45), 43 plain ranges (`14-18`, `1–21`), 83 others (`65/1`, `12/1–12/2`, `1.1–1.5`). Longest text: 9 characters. One landmark has a number: the Hallenbad (`anchors.landmarks.hallenbad = { x, z, rot, size: [42.7, 47.1], addr: '2' }`), drawn as a box of that size (`hallenbad()`, `index.html:549`).
- **Row houses (#45).** The sixteen blocks have `rect` long sides of 36–38 m (16a–16c: 18 m) and rings with one smooth long side (two ≈ 18 m edges with a 1.5 m notch) and one stepped long side (edges ≈ 6 m, one per unit). `rowUnits('3a–3f') = 6` (`world.js:121`). Their nearest mapped road is 11–69 m away; for 3a–3f it is the Friedweg (39 m), not the Bodenackerstrasse (62 m); 21a–21f gets the Hauptstrasse (35 m).
- **Fog and camera.** Original style fog from 320 m (`index.html:901`); chase camera 9 m behind at 3.4 m (`index.html:860`), so a plate at 2.2 m is near eye level.
- **Tests.** `node --test prototype/tests/world.test.mjs` covers `addrLabels` and `pickLabels` (`world.test.mjs:135-150`). `prototype/tests/test_street_labels.py` pins the current contract: numbers appear within 60 m and vanish far away, at most 40, hidden pool sprites really hidden, material cache bounded (`:56-74, :106-123`). Playwright runs in the foreground only.

## Goal

Every numbered building shows its number as a blue plate with white digits, flush on the wall that faces the nearest road, at door height, in both building layouts and both graphic styles. Letter ranges show one plate per unit (`6a`, `6b`, `6c`, `6d`) spread along that wall. No sprite floats over a roof. The cost stays bounded as today (fixed pool, 250 ms refresh, LRU-cached textures); the debug height labels (#39/#70) are untouched.

## Design

### Pure helpers (`prototype/world.js`)

`addrLabels` and its unit test are **replaced** (not kept beside the new code) by:

```js
export function drawsGable(b)                 // the osmBuilding() gable-path predicate: b.roof === 'gable' && !(b.hsrc === 'dsm' && b.rh < 0.6)
export function plateTexts(addr)              // '6a–6d' → ['6a','6b','6c','6d']; '3a–3f' → six texts; anything else → [addr]
export function plateSize(t)                  // { w: clamp(0.1 + 0.26 * t.length, 0.5, 2.4), h: 0.5 }  (metres)
export function rectFaces(rect)               // the four outward wall faces of a box on rect = [cx, cz, w, d, rot]
export function ringFaces(ring, minLen = 1.5) // the outward wall faces of a footprint ring, oriented like extrudeFootprint
export function streetFace(faces, seg, minFrac = 0)   // the face that faces the road segment seg = [ax, az, bx, bz]
export function projectToWall(x, z, face, walls)      // nearest point on a wall that faces the same way as face
export function addrPlates(buildings, landmarks, nearestSeg, off = 0.06)   // → [{ t, x, z, rotY, id }]
```

A **face** is `{ x0, z0, x1, z1, nx, nz, len }`: a wall segment from `(x0, z0)` to `(x1, z1)` with its outward unit normal. `rectFaces` walks the local corners `(-w/2, -d/2) → (-w/2, d/2) → (w/2, d/2) → (w/2, -d/2)` through the `box()` frame (`facadeLabels`' mapping), `ringFaces` reverses a positive-area ring and drops edges shorter than `minLen`; both derive `(nx, nz) = (-(z1 - z0), x1 - x0) / len`, which is `extrudeFootprint`'s outward normal, so a plate pushed along it ends up in front of the drawn wall. Seen from the street, the face runs **left to right from `(x0, z0)` to `(x1, z1)`** (the viewer looks along `-n`; their right is the edge direction), so `6a` is the leftmost plate.

`streetFace(faces, seg, minFrac)`:

1. Skip faces shorter than `minFrac × longest` (per-unit buildings pass `0.6`, so the units are spread along a long side, never crammed onto a 12 m end wall).
2. For each remaining face, take the nearest point of `seg` to the face midpoint; the face **faces the road** when `n · (roadPt − mid) > 0`.
3. Return the nearest-to-`seg` face among those that face the road; if none does, the nearest regardless; with `seg === null`, the longest face (5 buildings have no road within 120 m).

`projectToWall(x, z, face, walls)`: among `walls` with `n · face.n > 0.5`, the wall with the smallest distance to `(x, z)`; return the clamped projection of `(x, z)` onto that wall with the wall's normal. If no wall faces the same way (1 building), use all walls. If `walls` is `null` (gable path), return `(x, z)` with `face`'s normal.

`addrPlates(buildings, landmarks, nearestSeg, off)`: for each `b` with `addr`:

- `texts = plateTexts(b.addr)`, `n = texts.length`;
- `face = streetFace(rectFaces(b.rect), nearestSeg(b.rect[0], b.rect[1]), n > 1 ? 0.6 : 0)`;
- `walls = drawsGable(b) ? null : ringFaces(b.ring)`;
- for `k = 0..n-1`: anchor at `(k + 0.5) / n` along the face; `p = projectToWall(anchor, face, walls)`; push `{ t: texts[k], x: p.x + p.nx * off, z: p.z + p.nz * off, rotY: Math.atan2(p.nx, p.nz), id: b.id }`.

For each landmark with `addr` and `size`: one plate on `streetFace(rectFaces([l.x, l.z, l.size[0], l.size[1], l.rot]), nearestSeg(l.x, l.z))`, no projection (the landmark is a box). Landmarks without `size` get none (none has a number today).

Dry run on the real world file (2026-10-03, Python re-implementation of these rules): 1,411 plates for 1,328 buildings (plus the Hallenbad's); the flat-path anchor moves a median 0.04 m onto the ring, 90 % under 3.8 m, 31 m at worst (an L-shape whose rectangle face spans a courtyard); 44 buildings have no face whose normal points at the road's nearest point and fall back to the nearest face; the most plates within 60 m of any plate is **47** (Bodenackerstrasse, six-unit blocks on both sides).

### Scene (`prototype/index.html`)

- `osmBuilding()` tests `drawsGable(b)` instead of its inline expression, so the builder and the plates agree on the layout.
- `nearestRoadSeg(x, z, reach = 120)`: the segment of `gridQuery(ROAD_GRID, x, z, reach)` with the smallest `segDist`, as `[ax, az, bx, bz]`, or `null`. Any road class counts; a `service` driveway or `footway` to the door is a fine street side, and the 33 footways/paths are too few to special-case.
- `LABELS` keeps its shape (`grid`, `mat`, `cap: 128`, `pool`, `shown`, `t`, `ticks`) and its 250 ms tick in `hud()`. At startup, `addrPlates(L.buildings, L.anchors.landmarks, nearestRoadSeg)` fills the grid, each plate at `y = terrainH(x, z) + 2.2` (plate centre; door height, the lintel of a 2 m door and above the car's roof).
- The pool holds **64** `THREE.Mesh`es on one shared `PlaneGeometry(1, 1)`, hidden until used. `updateLabels` picks `pickLabels(gridQuery(grid, x, z, 60), x, z, 60, 64)` and, per shown plate, sets `material = labelMat(t)`, `scale.set(w, h, 1)` from `plateSize(t)`, `position`, `rotation.y = rotY`.
- `labelMat(t)` makes a `MeshBasicMaterial({ map: plateTex(t) })` (unlit like the `P` board, `index.html:658`, so it reads in shadow; depth-tested and fogged like the wall it hangs on). `plateTex(t)`: `textTex(t, Math.round(128 * w / h), 128, '#1c5fb0', '#ffffff', '700 92px "Barlow Condensed", sans-serif', '#ffffff')` — the repo's Swiss-sign blue (`signW`, `stationSign`), white digits, white rim. The LRU cache (`trimLabelMats`) is unchanged.
- Hooks keep their names: `__mm.labels()` → `{ t, x, z, y, rotY, d }` per shown plate; `__mm.labelSprites()` → visible pool meshes (name kept for `test_debug.py:71-74`); `__mm.labelTick()`, `__mm.labelCache()` unchanged. The hand-traced layout has no `L`, so no plates — `test_hand_layout_signs_and_no_labels` holds.

### Visibility and pooling

- **Radius 60 m, pool 64, 250 ms.** The #12 machinery is kept; only the count grows. A 0.5 m plate subtends ~10 px at 60 m on a 1080p chase view, so popping in at 60 m is a few pixels — beyond that the plate is unreadable anyway. The pool covers the measured worst case (47) with headroom; hidden meshes cost nothing.
- **Size.** Plates are 0.5 m high — about three times a real Swiss plate — because a life-size 0.15 m plate is ~2 px at 20 m in a 640 × 360 test viewport and ~6 px at 1080p. Width follows the text (`0.5 m` for one digit, `0.62 m` for `6a`/`12`, `2.4 m` cap for the 9-character `12/1–12/2`).

### Out of scope

- The debug height labels (`DEBUG_H`, `heightLabels`, `roofTop`) stay sprites over the roof; #70 owns their clamping. `roofTop` stays in `world.js` for them.
- No pipeline change, no `data/` rebuild, no `street` field (A2).
- Roof shapes (#43), eaves heights (#34/#17), the row-house texture (#45).

## Assumptions (headless — no human was asked beyond the recorded decision)

- **A1** [confirmed] Swiss blue plate (white on blue), door height, street-side façade = the façade facing the nearest road; letter ranges → one plate per unit along that façade; nothing floats over roofs. User decision 2026-10-03.
- **A2** [med] "Nearest road" is decided at runtime from `ROAD_GRID` (reach 120 m), not from `addr:street`. The data has no street per building (`pipeline/world_buildings.py:94-98`, `docs/11-pipeline-osm.md:125`) and adding one needs a world rebuild with the local swisstopo caches a CI implementer does not have. Known mismatch: 3a–3f's nearest road is the Friedweg (39 m), not its own Bodenackerstrasse (62 m); 21a–21f gets the Hauptstrasse. Rejected: a pipeline `street` field (rebuild); matching `addr` against road names (no street in the data to match).
- **A3** [med] Only **letter** ranges `Na–Nx` are split (18 buildings, 101 plates): the texts are `N` + each letter from the first to the last, placed left to right as seen from the street. Plain ranges (`14-18`, `1–21`, 43 buildings) and the 83 other formats get one combined plate. Rejected: splitting plain ranges — `1–21` could be 11 odd numbers or 21 entrances, the data cannot tell. The left-to-right order of the letters is a guess; reality may run the other way for some blocks.
- **A4** [med] Per-unit buildings choose among faces at least 0.6 × the longest (the two long sides); single plates may use any of the four faces. Rejected: letting the end wall win when the road passes it — six plates on a 12 m wall reads as a sign, not as entrances.
- **A5** [high] Gable-path buildings carry the plate on the rectangle face; flat-path buildings project the anchor onto the nearest ring edge facing the same way (`n · n_face > 0.5`), so the plate is flush on the drawn wall in both layouts (`index.html:535-544`). The shared predicate `drawsGable()` replaces the inline expression in `osmBuilding()`. Rejected: plates on the rectangle for flat-path buildings (floats or sinks wherever the ring leaves the rectangle; median fill 0.93, 9 % under 0.70); a raycast against the merged wall mesh (needs the scene, untestable in `node:test`).
- **A6** [med] Plate 0.5 m high, width `clamp(0.1 + 0.26 × chars, 0.5, 2.4)` m, centre 2.2 m above the terrain at the plate. Three times life size for readability (above). Rejected: life-size 0.15 m (unreadable in any viewport the tests use); the old 3.2 × 1.2 m sprite size (a billboard, not a plate).
- **A7** [high] Pool of 64 pooled meshes, 60 m radius, 250 ms tick, LRU 128 — #12's bounded-cost design (`docs/superpowers/specs/2026-10-02-street-labels-design.md:37`) with the pool grown from 40 to 64 because the per-unit plates make 47 the measured worst case within 60 m.
- **A8** [high] Colours and font from the repo's Swiss-sign palette: `#1c5fb0` blue, white digits and rim, `Barlow Condensed` 700 (`signW`, `stationSign`, `index.html:680, 689`); `MeshBasicMaterial`, unlit, depth-tested, fogged. Rejected: `depthTest: false` like the village names — a plate behind a house must be hidden by it.
- **A9** [med] The Hallenbad's `2` goes on the box face of its `size` rectangle nearest the road, at 2.2 m, under the existing `HALLENBAD SISSILA` signs at 6.5 m (`index.html:550`). Other landmarks have no number; a landmark with `addr` but no `size` gets no plate.
- **A10** [high] The debug height labels stay where they are; `roofTop` stays for them (`prototype/debug.js:31-35`). `addrLabels` is removed with its unit test, which pins behaviour this issue abolishes — a contract change, not a test modified to pass.
- **A11** [high] Hook names stay (`__mm.labels`, `__mm.labelSprites`, `__mm.labelTick`, `__mm.labelCache`); `labels()` gains `y` and `rotY`. `test_debug.py:71-74` keeps passing unchanged.
- **A12** [high] `test_house_numbers_appear_near_and_vanish_far` (`test_street_labels.py:56-74`) is rewritten for the new contract (texts `6a`…`6d`, ≤ 64, plates on the wall); the far/vanish and hidden-pool assertions carry over. Same reasoning as A10.
- **A13** [med] Any road class counts as a street, footways and paths included (23 + 9 + 1 of 2,616 segments). Rejected: filtering by class — a `service` driveway or footway to the door is the right side more often than not, and the exceptions are too few to see.

## Consequences

- The numbers are now part of the scene: hidden behind buildings and trees, fogged, and readable only within roughly 30 m instead of from anywhere within 60 m. Finding a house number means driving past its street side; that is the intent.
- 1,412 plates instead of 1,329 labels; at most 64 plate draw calls instead of 40 sprite draw calls; 1,412 small objects in the 64 m grid instead of 1,329. The planned code runs over the real world file in ~0.2 s at startup (node, 2026-10-03).
- Eight of the sixteen row-house blocks (4, 12, 13, 14, 15, 18, 20, 21) get their six plates on the smooth long side, the other eight on the stepped side — the nearest mapped road decides, and the stepped side (which may be the entrance side) is not consulted. The screenshot step is where a human judges this; a "prefer the stepped side" rule would be a one-line change in `streetFace`'s candidate set.
- Buildings far from any mapped road (5 beyond 120 m) get the plate on their longest face; buildings whose rectangle face spans a courtyard get the plate on the nearest same-facing wall, up to 31 m from where the rectangle would put it.
- On a sloping site the plate sits 2.2 m above the terrain *at the plate*, which may be below or above the floor line the texture implies; the wall extends 2 m under the base, so the plate never hangs in the air.
- Plates land on `TEX.facade`'s ground-floor window band (0.6–2.3 m) for ordinary houses and over the row-house windows — a texture, not geometry, so nothing collides.
- `pickLabels`' default `maxN = 40` is still what `DEBUG_H` uses; the plates pass 64 explicitly.
- `osmBuilding()` changes one expression; #43 is pipeline-only and #45 is merged, so no merge conflict is expected. #70 edits `DEBUG_H` only.

## Testing

- `node --test prototype/tests/world.test.mjs`: `drawsGable` (gable, measured-flat guard, flat); `plateTexts` (`6a–6d`, `3a–3f`, `16a–16c`, `12`, `14-18`, `12/1–12/2`); `plateSize` (one char, two chars, nine chars, clamps); `rectFaces` (unrotated and quarter-turn rectangles, outward normals, face order); `ringFaces` (positive- and negative-area squares, short edges dropped); `streetFace` (nearest facing face, back-facing fallback, `minFrac`, `null` seg → longest); `projectToWall` (onto a notched wall, same-facing filter, `null` walls); `addrPlates` (per-unit texts and spacing with an injected `nearestSeg`, offset, `rotY`, landmark, numbered-only). The `addrLabels` test is removed.
- `prototype/tests/test_street_labels.py` (Playwright, foreground): the rewritten `test_house_plates_sit_on_the_street_wall` — at Bodenackerstrasse 6a–6d four plates `6a`…`6d`, each within 0.15 m of the OSM ring, `y − terrain ≈ 2.2`, none above `terrain + 3`; far away none, hidden pool really hidden, ≤ 64, all ≤ 60 m. New `test_single_plate_on_a_gable_house`: Lerchenweg 11 (`171822877`, gable path, road 10 m away) shows exactly one plate within 0.15 m of its rectangle outline, facing the road (`n · (road − plate) > 0`). `test_label_material_cache_stays_bounded`, `test_hand_layout_signs_and_no_labels`, `test_hud_names_the_road_under_the_car` unchanged.
- `test_smoke.py`, `test_debug.py`, `test_row_houses.py` stay green.
- Two screenshots for a human (`docs/ai-notes/screenshots/2026-10-03-house-plates/`): Bodenackerstrasse 6a–6d from the Badweg, and the row 4a–4f from the street side — do the plates read as house numbers, is the size right, is the chosen side plausible.

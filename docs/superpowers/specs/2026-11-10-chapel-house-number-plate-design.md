# House-number plate on swissBUILDINGS3D replacement models (#823)

## Problem

Tester (2026-11-10): "Sisseln Kapelle, Hausnr schwebt vor Gebäude". At the Fridolinskapelle (Schulhausstrasse 6.1,
OSM way 171822707) the blue house-number plate floats in front of the building.

## Measured cause

Measured in node: the chapel GLB (Draco, decoded with `draco3d` in a temp dir), moved by `chLandmarksFor`'s offset
(`chlandmarks.js:17`, `landmarkOffset`: x +218.654, z -212.919, no scale, no rotation), against the OSM ring in
`data/world_hochrhein.json` and the plate `addrLabels` (`world.js:580`) computes with `nearestRoadPoint`'s rule
(`index.html:2637`).

- The GLB is placed with a constant translation only. Its bounding box (x 1731.96..1756.10, z -434.21..-420.13) matches
  the OSM ring's (x 1732..1755.9, z -432.2..-418.3) to about 2 m, but the outlines differ in detail: the OSM ring
  vertices lie **0.22 to 2.31 m** from the nearest model wall.
- The plate goes on the OSM ring's west edge (1732, -428.7)→(1732.5, -423.6), facing the Schulhausstrasse point
  (1731.74, -418.56): plate at **(1732.34, -424.59)**, rotY -1.473. `wallPlate` puts it `PLATE_IN` = 1 m from the
  edge's right end.
- In the model, that west porch ends at z ≈ -424.87, so the plate stands **0.3 m beyond the porch corner**, and the
  next wall behind it at door height (y = ground + 2.4 m) is the nave's west wall, **4.39 m** away. The plate floats in
  the air in front of the nave.
- Same mechanism at the second replaced building, Kath. Kirche Bruder Klaus Stein (OSM 407386050, Schulstrasse 5):
  its plate sits **0.48 m** in front of the model wall (the plate is meant to be 0.06 m off the wall).
- The third landmark (reformierte-kirche-stein) has no OSM building in the world file (`osm: null`), so it has no
  plate.

So the cause is confirmed: the plate is placed on the OSM footprint, while the building drawn there is the GLB, whose
walls do not follow that footprint. The model's footprint is not known when plates are computed: plates are built
synchronously at `index.html:2638`, the GLBs load later and asynchronously (`index.html:2611`), and `index.json` only
carries the bounding box.

## Decision

Buildings that a swissBUILDINGS3D model replaces get **no house-number plate**. A pure helper
`plateBuildings(buildings, replaced)` in `chlandmarks.js` drops every building whose OSM id is in the placed-landmark
map (`CH_LM_BY_OSM`), and `index.html` feeds its result to `addrLabels`.

Rejected:

- **Plate on the model's façade, from a footprint ring in `index.json`.** The exporter
  (`.claude/skills/ch-landmarks/scripts/fetch_landmarks.py:190`, `CityObject.footprint()`) already computes a shapely
  footprint, so it could write one; but it needs a re-export from swisstopo tiles with Python deps (trimesh, shapely)
  that the implementing runner may not have, and the ground footprint of a CityGML solid is the roof-projected union,
  not the wall at door height.
- **Plate placed from the GLB at load time.** Plates would move after an async load, and the plan outline at door
  height needs a mesh slice. Much more code for one number on two churches.
- **Hand-entered footprint per landmark in `REPLACES`.** Data nobody can regenerate; every new landmark needs it.

Landmarks that do not get placed (no measured terrain, other region: `chLandmarksFor` returns nothing) keep their OSM
box and therefore keep their plate, because `CH_LM_BY_OSM` is empty for them.

## Acceptance criteria

- At the Fridolinskapelle (OSM 171822707) no house-number plate is shown.
- Every building in `CH_LM_BY_OSM` (every placed replacement model with an OSM id) gets no plate.
- Every other building keeps exactly the plate it had: `addrLabels` output for them is unchanged.
- Without measured terrain (no landmarks placed), the chapel's OSM box keeps its plate.
- Node tests cover the helper; full `node --test tests/` passes.
- CHANGELOG `[Unreleased]` → `### Fixed` has a player-facing English entry.

## Consequences

- The chapel (6.1) and Kirche Bruder Klaus (5) show no house number. Real churches often carry none either.
- A future landmark added to `REPLACES` loses its plate automatically.
- If a footprint ring is ever exported into `index.json`, the plate can come back via `wallPlate(footprint, ...)`
  without touching this rule's callers.

# Fridolinskapelle Sisseln as the first swissBUILDINGS3D landmark (#649)

Part of the landmark programme #652. The chapel (OSM way 171822707, `building=chapel`, Schulhausstrasse 6.1, Sisseln) is drawn
today as a flat extruded box: `roof: flat`, `h 4.5`, `rh 7.9` in `data/world_hochrhein.json`, and `osmBuilding` (`index.html:1485`)
draws any non-gable building as `extrudeFootprint` with a flat top. PR#650 exported the real chapel from swissBUILDINGS3D 3.0
(EGID 263106794, ridge roof and turret, 21 m) to `assets/landmarks/fridolinskapelle-sisseln.glb` (Draco, 353 triangles). Nothing
in the game loads `assets/landmarks/` yet.

## Goal

The chapel shows as its swissBUILDINGS3D model at its real place and height, the flat OSM box is gone, and the car still collides
with it. The loader is generic over `assets/landmarks/index.json`, so the next landmark (#652) is a data change.

## Frames

| frame | x | y | z |
|---|---|---|---|
| landmark (`landmarks.yaml` origin, also `index.json → origin`) | E − 2640000 | H − 280 | −(N − 1267000) |
| world (`world_hochrhein.json → origin`, terrain `.mmh` header `base`) | E − 2639781.35 | H − 284 | −(N − 1266787.08) |

So a landmark vertex goes into the world at **landmark + (origin.e − world.E, origin.h − base, −(origin.n − world.N))**, today
≈ (+218.65, +4.0, −212.92). All three numbers come from loaded data (`index.json.origin`, `L.origin`, `REAL.hdr.base`), never
hard-coded. Check against the data: the chapel's ground point (`GELAENDEPUNKT` 303.61) lands at world y 19.61; the model's
bounds put its centre near the OSM rect centre (1744.18, −424.69).

## Design

- **`chlandmarks.js` (new, pure):**
  - `REPLACES`: which OSM building each landmark replaces, and in which region. The export's `index.json` knows nothing of OSM.
  - `landmarkOffset(lmOrigin, worldOrigin, terrainBase)`: the offset above.
  - `chLandmarksFor(index, regionId, worldOrigin, terrainBase)`: the landmarks to place in this region, each with its file,
    offset, top (world y of the highest point) and the OSM id it replaces. Empty when any input is missing: hand layout, a
    generated world, or no measured terrain.
  - `roofOrWall(ny)`: the colour role of a face from its normal's y.
- **`index.html`:**
  - Before the house loop, fetch `assets/landmarks/index.json` and compute the placements (a failed fetch means none).
  - `osmBuilding` skips the mesh of a replaced building but keeps its collider: the ring, height up to the landmark's top.
  - After the houses, load each GLB (`GLTFLoader` + `DRACOLoader`, decoder from the same jsdelivr three@0.170.0 as the import
    map), recolour it (village plaster walls, dark roof; `DoubleSide` because CityGML normals are not consistent), offset it and
    add it to the scene. Loading is async and must not hold up the start.
  - `window.__mm.counts.chLandmarks` lists the placed and replaced ids for tests.

## Not in scope

The German bank (needs LGL BW LoD2), other landmarks (#652), the J list (the chapel is not in `LANDMARK_INFO`), textures.

## Acceptance

- The chapel shows with ridge roof and turret at its place, standing on the terrain
- The flat OSM box 171822707 is not drawn
- The car collides with the chapel
- Ehrendingen and the hand layout load no landmark and lose no building
- `CREDITS.md` keeps the swisstopo line

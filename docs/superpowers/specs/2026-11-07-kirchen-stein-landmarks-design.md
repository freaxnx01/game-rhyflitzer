# The churches of Stein as swissBUILDINGS3D landmarks (#715)

Part of the landmark programme #652, second after the Fridolinskapelle (#649). Playtest 2026-11-07: the "Kirche Stein" is a
hand-made placeholder (`pipeline/anchors.json` `steinChurch`, game (-812.8, 406.4), drawn by `church(…, false)` in `index.html`)
standing alone on the field by the Münchwilerstrasse, about 490 m from the real churches. PR#714 exported both real churches to
`assets/landmarks/`:

| id | OSM | in the world file today |
|---|---|---|
| `kirche-bruder-klaus-stein` | w407386050, Schulstrasse 5 | flat box, rect [-1201.67, 696.04, 43.07, 28.48, 1.9264] |
| `reformierte-kirche-stein` | w88836292, Gartenstrasse 9 | missing (dropped by the house filter, #716) |

## Goal

Both churches show as their swissBUILDINGS3D models at their real places, the car collides with them, the placeholder is gone, and
J finds both.

## Design

- **`chlandmarks.js` `REPLACES`** gains both ids. A landmark whose OSM building is not in the world file gets `osm: null` and its
  own collider rectangle `rect` (world frame, `[cx, cz, w, d, rot]` like a world building's `rect`). For the Reformierte Kirche it is
  `[-1177.97, 795.86, 34.75, 26.71, -2.7343]`: the OSM footprint through the pipeline's own `world_buildings.roof()`, which gives
  exactly the world file's rect for the Bruder-Klaus-Kirche (checked 2026-11-07). `chLandmarksFor` passes `rect` through.
- **`index.html`:**
  - `CH_LM_BY_OSM` only holds landmarks with an OSM id.
  - After `CH_LM` is computed, every landmark with a `rect` pushes its own OBB up to `max(terrain + 3, top)`, the same box
    `landmarkReplaces` builds for a replaced building.
  - The `church(…steinChurch…)` call goes.
- **`pipeline/anchors.json`:** `steinChurch` goes. `data/world_hochrhein.json` still carries it until the next world build; nothing
  reads it any more.
- **`landmarks.js` J list:** "Kirche Stein" becomes two entries, `Kirche Bruder Klaus` (`building: 407386050`) and
  `Reformierte Kirche` (`at: [-1177.97, 795.86]`), both Gemeinde Stein, in that order before the Bahnhof.

## Not in scope

The cause of the missing Reformierte Kirche (#716), textures, other landmarks.

## Acceptance

- Both church models stand on their footprints and on the terrain (Playwright, like the chapel test)
- `counts.chLandmarks.placed` has all three landmarks, `replaced` is 171822707 and 407386050
- The car cannot drive through the Reformierte Kirche (its collider exists without an OSM building)
- No placeholder church at (-812.8, 406.4); `steinChurch` is gone from `anchors.json` and `index.html`
- J → Stein lists Kirche Bruder Klaus, Reformierte Kirche, Bahnhof Stein-Säckingen, Random spot

# Stations beside the tracks (#130)

## Goal

Bahnhof Sisseln and Bahnhof Stein-Säckingen stand at their real place, with the long side parallel to the tracks and the platform strip facing them. The two station checkpoints and the J-list entries follow.

## Today (measured 2026-10-08 on main's `data/world_hochrhein.json`)

| Thing | Where (game x, z) | Distance to nearest track |
|---|---|---|
| `stationSisseln` anchor (`pipeline/anchors.json:14`, heading -5.7 deg) | 1854.2, 685.8 | 90.9 m |
| `stationStein` anchor (`anchors.json:13`, heading -8.0 deg) | -1303.0, 1130.3 | 35.7 m |
| CP "Bahnhof Sisseln" (`anchors.json:19`) | 1780.0, 560.0 | 22.8 m |
| CP "Bahnhof Stein-Säckingen" (`anchors.json:23`) | -1303.0, 1066.8 | n/a, 94 m from the real station |

The positions were traced by hand in the prototype and carried over to the OSM world as-is (`stationAt()`, `prototype/index.html:826`, drawn at `:1014`). The model is a fixed 26 x 8 m box with a 60 x 3 m platform strip at local +z, 8 m from the centre; the long axis follows `rot`.

## Real positions (source: OSM, nothing guessed)

Read from the pipeline's regional extract `pipeline/cache/osm/hochrhein.osm.pbf` (3.7 MB, planet state 2026-09-28; `osmium tags-filter` for station, platform and `building=train_station`, no pipeline build). WGS84 was converted to the game frame with the swisstopo approximate WGS84 -> LV95 formula, minus the world origin (`data/world_hochrhein.json` `origin`); it reproduces the origin to 0.15 m, which is far below what matters here.

| Station | OSM object | Footprint (min rotated rect) | Nearest track |
|---|---|---|---|
| Sisseln | way `w183386655`: `building=train_station`, `disused=yes`, Sisslerstrasse 20.1, Eiken | centre (1940.7, 540.0), 15.1 x 9.9 m, long side along 170.2 deg | rail polyline 123, 10.6 m from the centre, direction -9.8 deg |
| Stein-Säckingen | way `w1280041307`: `building=train_station`, architect Max Vogt, 2 levels | centre (-1370.2, 1002.0), 34.1 x 14.7 m, long side along 25 deg | rail polyline 76, 9.0 m from the centre, direction 25.0 deg |

Cross-checks:

- Stein: the OSM station node `n3080746029` "Stein-Säckingen" sits at (-1361.5, 1005.2), 9 m from the building centre and 9.8 m from the track.
- Sisseln: the extract has no `railway=station` node or named platform for Sisseln, but the LANDI silo tower is Sisslerstrasse 19.1 (`anchors.json:7`) and the station building is Sisslerstrasse 20.1: neighbours.
- Neither building is in the world's building list (nothing within 100 m of either spot), so the station model does not double an OSM building.

## Decisions

| Topic | Decision |
|---|---|
| Station positions | `stationSisseln` = game (1940.5, 539.0), heading -9.8 deg. `stationStein` = game (-1369.1, 999.7), heading 25.0 deg. Both are the OSM footprint centre, moved perpendicular to the track, away from it, until the nearest track centreline is 11.5 m away (the platform strip's near edge is 9.5 m from the model centre, so 2 m of ballast gap). Shifts: 1.0 m (Sisseln), 2.5 m (Stein). |
| Heading | The nearest track's direction, with the sign chosen so that local +z `(-sin rot, cos rot)` points at the track, because the platform strip sits at +z. |
| Entry form | `{ "game": [x, z], "heading_deg": h, "src": "…" }` in `anchors.json`, as the other hand-placed anchors. Not `osm:` refs: `anchors.resolve` would use the unshifted centroid and need the extract. |
| Checkpoints | Both station CPs move onto the road at the station: "Bahnhof Sisseln" to (1938.5, 530.4) on the service road `w194550666` along the station front (8.8 m from the anchor), "Bahnhof Stein-Säckingen" to (-1368.2, 988.3) on the Bahnhofstrasse vertex shared with `w90686742` (11.4 m from the anchor). `snapRoad` (`index.html:565`) then leaves them where they are. The J-list entries (`landmarks.js:17,20`) read the anchors and snap to the nearest drivable road, so they follow with no code change. |
| Hand-traced fallback layout | Untouched (`index.html:982`, `CPS` at `:561`): it has no OSM world and several tests pin (1780, 560). |
| Model size | Unchanged (26 x 8 m). The real buildings are 15 x 10 m and 34 x 15 m; matching them is a separate, optional change. |
| Rebuild | No pipeline rebuild. `data/world_hochrhein.json` only carries these values in its `anchors` block, so Task 3 of the plan re-bakes that block with `anchors.resolve` over the new `anchors.json` (same function the build uses; CI runners have no pipeline caches). |

## Tests

- `pipeline/tests/test_anchors.py` (pure Python, reads the committed world): each station is 10.5-14 m from the nearest rail, its heading is within 3 deg of that rail (modulo 180 deg) and its platform side faces the rail; the world's `anchors` block equals `anchors.json` for both stations and all CPs; each station CP is within 15 m of its station and within 2.5 m of a drivable road.
- Regression (Playwright, foreground, capped): `test_street_labels.py::test_station_boards_on_the_osm_stations`, `test_jump.py`, `test_smoke.py`, `test_autopilot.py`.

## Docs

- CHANGELOG `[Unreleased]` -> `Fixed`: "Bahnhof Sisseln and Bahnhof Stein-Säckingen now stand beside the tracks, where the real stations are, and their checkpoints and **J** entries moved with them."
- `test-todo.md`: a "Stations beside the tracks (#130)" section.

## Out of scope

- Platforms, canopies or a station model that matches the real building; a station at Eiken or Bad Säckingen (those exist already, `landmarks.js`).
- Moving other landmarks. The other landmark anchors were not measured here.

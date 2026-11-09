# Public buildings always in the world file (#761, #716)

Playtest 2026-11-08: the **Bahnhof Frick** station building (OSM w164951714, `building=train_station`, Dörrmattweg 2) is
missing. #716: the **Reformierte Kirche Stein** (w88836292, `building=church`) is missing too.

## Cause (measured 2026-11-08)

`pipeline/world_buildings.py` `build()` keeps a building only if it is within 30 m of a `MAIN` road, in a keep-all quarter,
listed in `keep_buildings`, or at least 1000 m². Measured on `pipeline/cache/osm/hochrhein.osm.pbf` (the pbf of the committed
world) with the committed world's bbox and the real `world_roads.build` roads:

| building | type | area | nearest MAIN road |
|---|---|---|---|
| Bahnhof Frick w164951714 | train_station | 281 m² | 374.7 m |
| Reformierte Kirche w88836292 | church | 561 m² | 115.1 m |

The same rule drops most public buildings in the region: 4 of 6 `train_station`, 14 of 21 `church`, 7 of 9 `chapel`, 8 of 13
`public`, 19 of 31 `civic`, 1 of 1 `government` (Gemeindehaus Frick), 29 of 55 `school`, 11 of 14 `kindergarten`, 1 of 3
`transportation`. That is 93 buildings that are not excluded.

## Decision (maintainer, 2026-11-08)

**Public buildings are always kept**, wherever they stand. Rejected: listing only the two buildings in `keep_buildings` (the other
churches and stations would stay missing), and keep-all quarters around Frick and Stein (hundreds of ordinary houses, and the
boundaries would have to be drawn first).

## Design

- `world_buildings.py`: `PUBLIC = {"train_station", "church", "chapel", "public", "civic", "government", "school",
  "kindergarten", "transportation"}`. In `build()`, a footprint whose `building` tag is in `PUBLIC` is kept like a listed one, as
  long as it passes the existing filters (`SKIP`, `exclude_ids`, degenerate, under 20 m², outside the clip). New stats key
  `kept_public`.
- `pipeline/anchors.json` `exclude_buildings` gains the new public footprints that the game already draws by hand or as a
  landmark, so nothing stands twice. Measured: a new footprint within 25 m of a hand-drawn landmark anchor, plus #715:
  - `w162862443` (civic, Stiftsgebäude; Abteigebäude) and `w162862441` (civic): at the `muenster` anchor
  - `w1280041307` (train_station): at `stationStein`
  - `w183386655` (train_station): at `stationSisseln`
  - `w88836292` (Reformierte Kirche Stein): the #715 swissBUILDINGS3D landmark stands there with its own collider rect
    (`chlandmarks.js` `REPLACES`, `osm: null`), so the OSM box must stay out
- Rebuild `data/world_hochrhein.json` with the documented command (`docs/11-pipeline-osm.md`, with `--dsm-heights`). Ehrendingen
  is not rebuilt: its build uses the same function, but it was not playtested, so its diff is not reviewed here.
- `docs/11-pipeline-osm.md` "Buildings" paragraph: the new rule and the new excluded ids.

## Not in scope

- A J-list entry for the Bahnhof Frick: `landmarks.js` `GEMEINDEN` has no Frick yet, adding a Gemeinde is its own change.
- Generated worlds (`osm.py world`, #166) get the rule too, since they call the same `build()`; no separate tuning.
- Roofs or models for the new buildings: they are ordinary boxes with DSM heights, like every other building.

## Acceptance

- `world_buildings.build` keeps a `PUBLIC`-typed footprint far from any main road and under 1000 m²; it still drops excluded,
  `SKIP`-typed, tiny and out-of-clip ones (pytest)
- `data/world_hochrhein.json` contains w164951714 (Bahnhof Frick) and none of the five excluded ids
- The world file has about 88 more buildings than before (93 minus the 5 excluded), and no building that was there before
  changed (diff check; `parking` may shift where it depends on buildings, `params.built` changes)
- Node tests and `cd pipeline && python -m pytest` pass

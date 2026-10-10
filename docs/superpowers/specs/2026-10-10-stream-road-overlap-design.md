# Water lies on the Hauptstrasse (#229) — design

Status: enriched 2026-10-10 (`--quick`). Playtest entry 28. **Pipeline fix, world rebuild needed: local only.**

## Root cause (measured 2026-10-10 on `data/world_hochrhein.json` and `cache/osm/hochrhein.osm.pbf`)

There is **no water polygon** within 80 m of the reported spot (x 248.5, z 1280.5, heading 104°, so the water is 20 to 30 m ahead).
The blue sheet is **stream 40**: OSM way **222070069**, `waterway=canal` with no `width` tag, 30 nodes. `world_water.py` gives an untagged canal the default
`LINE_WIDTH["canal"] = 10.0` m and exports it as a centre line `{w: 10, pts}`; the prototype drapes it as a 10 m wide ribbon
(`prototype/index.html`: `ribbonGeo(st.pts, st.w / 2, 0.02, ...)`, "2 cm under road height"). The canal's centre line runs 6.0 to 7.1 m from the
Hauptstrasse centre line (a 9 m primary road, half-width 4.5), so the 5 m half-width ribbon covers the road edge and the verge.

It is not one canal: streams 6, 12, 25, 39, 40, 44 and 51 all overlap a non-bridge road corridor by more than 2 m² (the Hauensteiner Murg on the Fabrikstrasse and Hauptstrasse in Bad Säckingen, the Gewerbebach, Fischingerbach, Giessenbach, Heimbach, and this canal). A single data tweak for one way would leave six more.

## Fix

`world_water.streams(areas, ways, clip, roads=())` takes the drivable roads and **cuts every centre line wherever a ribbon of its width would touch a road**:
remove the part of the line within `road_w / 2 + stream_w / 2` of the road's centre line (`shapely` buffer of the road, difference with the line), then drop pieces shorter than 5 m
(the existing rule). By the triangle inequality the remaining ribbon edge is at least `road_w / 2` from every road centre line: no overlap, and a stream crossing a road
simply goes "under" it (as the existing tunnel/culvert rule already treats mapped culverts).

- Roads that count: every road of the world except `bridge` roads (the river runs under those) and `footway`, `path`, `steps`, `cycleway` (a footpath beside a brook is normal).
- `osm.build_world` passes `[(shapely.LineString(r["pts"]), r["w"]) for r in roads if ...]` (the final `roads`, including the game roads).
- Default `roads=()` keeps every existing call and test unchanged.

Rejected: narrowing the canal default (10 → 3 m still overlaps at 6.0 m centre distance, and one number cannot fit every road);
moving the ribbon; lowering it below the road (the draped ribbon follows the terrain and the road its own grade, so 2 cm is not a reliable order);
hand-editing the world JSON (forbidden: the world is rebuilt by the pipeline).

## Side effect

The Murg canal disappears along the stretch where it hugs the Hauptstrasse (about 110 m), as do small overlaps elsewhere. That is a visual loss of a real canal.
[needs maintainer] accepted by default: a canal next to the road is invisible from the road anyway, a sheet of water on the carriageway is a bug.

## Tests

1. Unit (CI-able, synthetic): a 10 m canal 6 m beside a 9 m road is cut away along the road; one that crosses the road is cut at the crossing; a bridge road and a footway do not cut.
2. Golden (local only, needs `cache/osm/hochrhein.osm.pbf`): in the built Hochrhein world no stream ribbon overlaps a non-bridge, non-path road corridor by more than 1 m².
3. The committed `data/world_hochrhein.json` is rebuilt (local only); a check script (same rule as 2) over the file reports zero overlaps.

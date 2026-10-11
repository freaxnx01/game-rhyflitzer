# Wheels sink into the road near Sisseln; sampled checks depend on world size (#273)

## Findings (2026-10-11, numbers from the issue reused, no new probes)

- `window.__mm.sinkCheck(n)` and `window.__mm.grassOverRoad(n)` in `prototype/index.html` pick every `floor(points / n)`-th point (`const step = Math.max(1, Math.floor(pts.length / n))`, and the same on `segs`). A bigger world changes the stride, so a different point set is checked. #47 (the south extension) did that; the test went red or green by luck, not by a change in the road.
- The exhaustive check in a 300 m box around Sisseln (1524, 916) finds 5 points above the 0.08 m limit both before and after #47. The worst are (1583, 961) 0.407 m and (1524, 916) 0.322 m.
- Location (checked against `world_hochrhein.json`): all five lie at the Eiken/Sisseln motorway junction. (1518, 911) is 0.14 m from the `motorway_link` way 749036557, the others are 2.5 to 4 m from `primary` ways with a junction disc 4 to 8 m away. So the likely cause is overlapping surfaces at the slip road: the rendered road mesh (`MESH.road` / `roadOsm` / junction discs) is higher than `groundH`, which follows one road's profile. Not verified: Task 2 measures it.
- `test_grass_and_fields_stay_below_the_road[osm]` has `worst 0`, `bad 0`, only the sanity floor `marksSeen > 5` fails: a count of markings under sampled rays, so again stride-dependent. A fragile threshold, not a rendering defect.

## Design

1. **Deterministic sampling.** Replace the stride by a coordinate hash: a point or segment is checked when `hash(x, z) % 100 < pct` (segment: hash of way id and index). The checked set in any area is then identical in every world size. `n` becomes `pct`; the tests keep their meaning (`done > 200` etc. are recalibrated once to the new count, never loosened on the quality limits).
2. **Fixed regression points.** `sinkCheck` also always checks a fixed list of known-bad spots: (1583, 961), (1524, 916), (1518, 911), (1493, 947), (1573, 958), (1602, 964), (1556, 766). They fail first (red), then the fix turns them green.
3. **The fix** (Task 2 decides after measuring): raycast each mesh at the worst points separately and compare with `groundH`/`terrainH` to find which surface is high. Expected: make `groundH` follow the same surface the mesh draws at overlaps (or lower the lifted overlap), at runtime. If the cause turns out to be in the world data (junction radii, link geometry) it needs a **local world rebuild**: then stop, note it on the issue as `[needs maintainer]`, do not hack around it.
4. `0.08` and `0.01` stay exactly as they are.

**Local-only: no** unless Task 2 finds a data cause. **Model:** the cause is not yet known, so run this on Opus rather than Sonnet. Tests run on the real terrain (`data/terrain_hochrhein.mmh`, in the repo), so the pipeline can run them.

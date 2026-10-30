# House-number plates on the real wall, facing the addressed street (#557)

Follow-up to #520 (PR#540). Maintainer test feedback 2026-10-29: the plate "6a-6d" at Bodenackerstrasse 6 (OSM way 171822634)
floats in the air and hangs on the wrong side.

## Measured cause (on main, `data/world_hochrhein.json`)

1. **Floating.** `facingFacade` (`prototype/world.js`) puts the plate on the drawn `rect` (60.9 x 22.1 m), shifted up to `w/2 - 1` m
   along it. The real footprint (`ring`) is stepped; its west wall lies at x 2028..2037, so at the shifted point the wall is ~8 m behind
   the rect edge. Hits every building whose ring is not a rectangle.
2. **Wrong side.** The façade is chosen by the **nearest** road (`nearestRoadPoint` in `prototype/index.html`, reach 80 m): the Badweg
   (west). The address belongs to Bodenackerstrasse (east). Buildings carry only `addr` (the house number); roads carry their name in `n`.
3. **The data exists in OSM.** Probe on `hochrhein-core-2026-10-01.osm.pbf`: the four address nodes 6a/6b/6c/6d inside the building all
   carry `addr:street=Bodenackerstrasse` (and `entrance=yes`); the way itself carries no `addr:street`. Of the 2103 numbered buildings
   in the Hochrhein world, 1326 have `addr:street` on the way itself (1085 of them equal a road name verbatim); address nodes add more.

## Approach (decision: simplest that meets the AC)

- **Data:** each numbered building gets an optional `st` (string): the `addr:street` of the building way itself, else the most common
  `addr:street` of the address nodes inside/on its outline (same node-to-footprint rule as the house number). Absent when OSM has none.
  No entrances (`entrance=*`), no new geometry: YAGNI, `st` already fixes the side. Entrances stay a possible follow-up.
- **Choosing the street point:** `roadAt(x, z, st)`. With `st`, the nearest point of a road whose `n === st` within reach; when none is
  in reach or `st` is absent, the nearest road of any name (today's behaviour).
- **Placing the plate:** a new pure function `wallPlate(ring, target)` in `prototype/world.js`. Candidate walls are ring edges whose
  outward normal faces the target and that are at least 3 m long; the nearest candidate to the target wins (fallbacks: any facing
  edge, then any edge). The plate sits 0.06 m off that edge, 1 m in from its right end as seen from outside (2 m or shorter edge: middle),
  facing along the outward normal. Ring orientation is detected (shoelace sign), not assumed. Therefore the plate is always within
  0.06 m of a ring edge. Buildings without a usable ring and landmarks (box only) keep the old `facingFacade` on the box.
- Verified in a node probe (no dry run of the game): on all 2103 + 205 numbered buildings the plate is exactly 0.06 m from the ring;
  for building 171822634 with the Bodenackerstrasse point as target it lands on the east wall (x ~ 2046.6, rotY ~ +pi/2), with the
  Badweg as target on the west wall.

## Data regeneration: who can do it

- `data/world_*.json` come from `pipeline/osm.py build` on a cached `.osm.pbf` (`pipeline/cache/`, gitignored, **not available in
  CI or in the ai-implement runner**) plus swissSURFACE3D heights (~500 MB download). A full rebuild would also change unrelated data
  (heights, OSM edits since the last build), so it is **not** the plan.
- Plan: (a) the pipeline learns `st` (so any future rebuild writes it; unit-tested with synthetic OSM, runs in CI); (b) a small
  targeted script `pipeline/backfill_building_streets.py` patches only the `st` field into an existing world file from a cached pbf
  (needs `ring` polygons from the world file and the pbf, a few MB, seconds, well under the memory cap). The script is implemented
  and unit-tested by the agent; **running it on the two world files is a manual step for the maintainer session on agent-dev**
  (the pbfs are in the main checkout's `pipeline/cache/osm/`), committed as a separate data commit on the PR branch.
- Until the data is patched the game degrades gracefully: no `st` -> nearest road, but the plate is already on the real wall.

## Tests

- JS (`prototype/tests/world.test.mjs`): `wallPlate` on a stepped ring (both orientations), the target choosing the side, short edges,
  fallbacks; `addrLabels` passes `b.st` to `roadAt`; the real-world sweep: every numbered building of both world files has its plate
  within 0.3 m of a ring edge (no `st` needed).
- JS on real data after the backfill (`bodenacker6.test.mjs` or `world.test.mjs`): building 171822634 has `st === 'Bodenackerstrasse'`
  and, with the nearest Bodenackerstrasse point as target, the plate is on the east side (outward normal x > 0.9) < 0.3 m from the ring.
  This test is added in the maintainer's data commit (it cannot pass before the backfill).
- Python: `st` from the way tag, from nodes (majority), absent otherwise; backfill script patches only `st` and nothing else.
- `prototype/tests/test_street_labels.py` (Playwright, too slow for the agent): adjust only if it asserts the old plate position; the
  `plateSpots` hook is unchanged. Not run by the enrich/implement agent, CI covers it.

## Assumptions and consequences

See the issue body (#557).

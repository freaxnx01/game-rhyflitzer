# Deterministic road checks and the Sisseln sink Implementation Plan

**Goal:** `test_wheels_do_not_sink_into_the_road[osm]` and `test_grass_and_fields_stay_below_the_road[osm]` pass on `main` for the right reason, independent of world size, with the limits `0.08` / `0.01` unchanged, and the wheels no longer sink at the Sisseln junction.
**Spec:** `docs/superpowers/specs/2026-10-11-sink-check-deterministic-design.md`
**Local-only:** no (becomes yes only if Task 2 finds a data cause; then stop and ask).
**Tests:** `node --test prototype/tests/*.test.mjs` plus ONE Playwright file: `python -m pytest prototype/tests/test_smoke.py -k "sink or grass_and_fields"`. Foreground, `timeout=600000`, never `run_in_background`. Never the full ~2 h suite.
**Note:** `index.html` is touched by other open work (PR #281 and pipeline runs #216 and #105): keep the diff to the two `__mm` hooks and the one fix site, rebase before pushing.

### Task 1: deterministic sampling plus the fixed regression points (red)

**Files:** `prototype/index.html` (hooks `window.__mm.sinkCheck`, `window.__mm.grassOverRoad`), `prototype/tests/test_smoke.py`

- [ ] Add a small pure helper in `prototype/world.js` with a node test in `prototype/tests/world.test.mjs`:

```js
// #273: pick a point by its coordinates, not by its index, so a bigger world does not change which points a check sees
export function sampled(x, z, pct) {
  const h = (Math.imul(Math.round(x * 4), 73856093) ^ Math.imul(Math.round(z * 4), 19349663)) >>> 0;
  return h % 100 < pct;
}
```

  Test: `sampled(1524, 916, 100) === true`, `sampled(1524, 916, 0) === false`, same call twice gives the same answer, and over a 100 x 100 grid of integer points with `pct = 10` the share is between 8 % and 12 %.
- [ ] `sinkCheck(pct = 10)`: drop `step`; keep a point when `sampled(x, z, pct)`; always add the fixed list `SINK_SPOTS = [[1583, 961], [1524, 916], [1518, 911], [1493, 947], [1573, 958], [1602, 964], [1556, 766]]` when `L` is set. Return the same fields plus `spots: [{ at, d }]` for the fixed ones.
- [ ] `grassOverRoad(pct = 10, only = null)`: keep a segment when `sampled(r.id-based hash, i, pct)` (use `sampled(r.pts[i][0], r.pts[i][1], pct)`, the segment start); drop the `done < n` cut-off and `step`.
- [ ] `test_smoke.py`: call `sinkCheck(10)` / `grassOverRoad(10)`; recalibrate `done` floors to roughly half of what the first run reports (a sanity floor, state the measured number in the test comment); for the sink test also `assert all(s["d"] < 0.08 for s in res["spots"]), res`. `marksSeen > 5` stays as a floor and now holds because the set is large and fixed. `0.08` and `0.01` unchanged.
- [ ] Run `python -m pytest prototype/tests/test_smoke.py -k "sink or grass_and_fields"`. Expected: sink[osm] red on the fixed spots, grass[osm] green. Commit the red state together with Task 2's fix, not alone on a branch that goes to main.

### Task 2: measure which surface is high at the five points

**Files:** `prototype/index.html` (temporary, do not commit the probe)

- [ ] In the browser console of a Playwright session on the real world: for each spot raycast `MESH.road`, `MESH.roadOsm`, `MESH.roadPlain`, `MESH.motorway` and the junction disc mesh separately; print each hit `y`, `groundH(x, z, y)` and `terrainH(x, z)`. Identify which surface exceeds `groundH` by 0.1 to 0.4 m. Write the finding as a comment on the issue.
- [ ] Cases: (a) a second road or disc overlaps the first with a lift, `groundH` only follows one: fix `groundH` (or the lift) in the shared road-height code, runtime, no data change. (b) the data is wrong (junction radius, link vertices): stop, mark the issue `[needs maintainer]` with the numbers, this becomes a local world rebuild.

### Task 3: fix (case a) and go green

**Files:** the road-height code found in Task 2 (anchor by function name, `groundH` first), `prototype/tests/test_smoke.py`

- [ ] Fix at the root; no loosening of `0.08`, no excluding the spots, no special-casing coordinates.
- [ ] Run the targeted Playwright file again: sink[osm] and grass[osm] green, `spots` all under `0.08`. Then `node --test prototype/tests/*.test.mjs`.
- [ ] CHANGELOG `### Fixed`, timestamped: `` `2026-10-11 HH:MM` The car no longer sinks into the road at the motorway junction by Sisseln: the wheels sit on the asphalt where the slip road meets the Laufenburgerstrasse. `` (a pure test change needs no entry, this one has a visible fix.)
- [ ] Commit `fix(world): wheels on the road at the Sisseln junction, deterministic road checks (#273)`. Closes #273.

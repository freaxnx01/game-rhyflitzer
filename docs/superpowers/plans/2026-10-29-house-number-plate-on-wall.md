# House-number plate on the real wall, addressed street (#557) - Implementation Plan

Spec: `docs/superpowers/specs/2026-10-29-house-number-plate-on-wall-design.md`. Buildless game: JS tests with `node --test`
(`node --test prototype/tests/world.test.mjs`), Python with `cd pipeline && pytest tests/test_buildings.py tests/test_osm_read.py`.
File footprint (keep it small, #453 runs in parallel and touches rendering of the same building): `prototype/world.js` (addrLabels +
new `wallPlate`, replacing `facingFacade` for ring buildings only), `prototype/index.html` (ONLY the `nearestRoadPoint` line ~2140 and
the `addrLabels(...)` call ~2141; do not touch bodenacker / building-draw code), `pipeline/osm_read.py`, `pipeline/world_buildings.py`,
new `pipeline/backfill_building_streets.py`, tests, `docs/11-pipeline-osm.md` (one paragraph), `CHANGELOG.md`.

Global constraints: TDD (failing test first, never edit a test to go green); `data/world_*.json` are NOT edited by the agent (see Task 5);
no Playwright runs; PR#540 tests stay green or are adapted deliberately.

## Task 1: `wallPlate` (pure, in `prototype/world.js`)

Files: `prototype/world.js`, `prototype/tests/world.test.mjs`.

Interface: `export function wallPlate(ring, cx, cz, target)` -> `{ x, z, rotY }`. `target` = `[x, z]` or null.

- [ ] **Step 1: write the failing tests** (in `world.test.mjs`, next to the #520 test). Use a stepped L ring, e.g.
  `ring = [[0,0],[20,0],[20,10],[12,10],[12,22],[0,22]]` (and its reversed copy, both orientations must give identical results):
  ```js
  test('wallPlate (#557): on the real wall that faces the target, 1 m in from the right end seen from outside', () => {
    const near = (a, b) => Math.abs(a - b) < 1e-9;
    const L = [[0,0],[20,0],[20,10],[12,10],[12,22],[0,22]];
    for (const ring of [L, [...L].reverse()]) {
      // target east of the 12..20 step at z=5: the east wall x=20 (edge z 0..10), plate 0.06 m outside, facing +x
      const e = wallPlate(ring, 8, 11, [60, 5]);
      assert.ok(near(e.x, 20.06) && near(e.rotY, Math.PI / 2));
      assert.ok(near(e.z, 1), 'seen from the east the right end is north (z=0): 1 m in');
      // target west: the west wall x=0 (22 m), right end seen from the west is south (z=22)
      const w = wallPlate(ring, 8, 11, [-40, 11]);
      assert.ok(near(w.x, -0.06) && near(w.rotY, 3 * Math.PI / 2) && near(w.z, 21));
      // target south-east in the notch: the 8 m wall x=12 (z 10..22) faces +x too, nearer than x=20 for a target at (40, 20)
      const n = wallPlate(ring, 8, 11, [40, 20]);
      assert.ok(near(n.x, 12.06) && near(n.rotY, Math.PI / 2));
    }
  });
  test('wallPlate (#557): short walls, fallbacks, every plate stays within 0.1 m of the ring', () => {
    // a 2 m wide wall keeps the plate in its middle; edges under 3 m lose against a longer facing wall
    // no target -> the local +z side (greatest z); degenerate ring (< 3 points) -> null so the caller falls back to the box
  });
  ```
  Also assert `wallPlate` returns `null` for a ring with fewer than 3 points.
- [ ] **Step 2: implement.** Verified prototype (probe on the real data: max distance 0.060 m over 2103 + 205 buildings):
  ```js
  const MIN_WALL = 3;   // m: shorter ring edges (stair notches, porch sides) are not walls for a plate unless nothing else faces the street
  // #557: a plate on the real footprint: the ring edge facing `target` (nearest, outward normal towards it, >= MIN_WALL), PLATE_OFF off
  // the wall, PLATE_IN in from the edge's right end as seen from outside (middle on a short edge). null target = the +z side.
  export function wallPlate(ring, cx, cz, target) {
    if (!ring || ring.length < 3) return null;
    const n = ring.length; let area = 0;
    for (let i = 0; i < n; i++) { const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % n]; area += ax * bz - bx * az; }
    const sgn = area >= 0 ? 1 : -1, edges = [];
    for (let i = 0; i < n; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % n], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len > 1e-6) edges.push({ ax, az, dx, dz, len, ox: sgn * dz / len, oz: -sgn * dx / len });
    }
    const T = target || [cx, cz + 1e6];
    const dist = (e) => { const u = Math.max(0, Math.min(1, ((T[0] - e.ax) * e.dx + (T[1] - e.az) * e.dz) / (e.len * e.len))); return Math.hypot(T[0] - e.ax - e.dx * u, T[1] - e.az - e.dz * u); };
    const facing = (e) => (T[0] - (e.ax + e.dx / 2)) * e.ox + (T[1] - (e.az + e.dz / 2)) * e.oz;
    let pool = edges.filter(e => e.len >= MIN_WALL && facing(e) > 0);
    if (!pool.length) pool = edges.filter(e => facing(e) > 0);
    if (!pool.length) pool = edges;
    const e = pool.reduce((a, b) => (dist(b) < dist(a) - 1e-9 ? b : a));
    const rightIsB = e.dx * e.oz - e.dz * e.ox >= 0, inset = Math.min(PLATE_IN, e.len / 2), s = rightIsB ? e.len - inset : inset;
    return { x: e.ax + e.dx / e.len * s + e.ox * PLATE_OFF, z: e.az + e.dz / e.len * s + e.oz * PLATE_OFF, rotY: Math.atan2(e.ox, e.oz) };
  }
  ```
  (`PLATE_OFF`/`PLATE_IN` already exist next to `facingFacade`; move them above if needed. If a test value above disagrees with the
  implementation on a handedness detail, work out the correct value geometrically, do NOT bend the geometry to the number, and keep
  the invariant that the plate is 0.06 m outside the chosen edge and faces outward.)
- [ ] **Step 3: run** `node --test prototype/tests/world.test.mjs`; green.

## Task 2: `addrLabels` uses the ring and passes the street

Files: `prototype/world.js`, `prototype/tests/world.test.mjs`.

- [ ] **Step 1: failing tests.** (a) `roadAt` receives `(x, z, st)`: `addrLabels([{addr:'6', st:'Bodenackerstrasse', rect:[..], ring: L}], {}, (x, z, st) => { seen = st; return [60, 5]; })` -> `seen === 'Bodenackerstrasse'`; landmarks call `roadAt(x, z, undefined)`. (b) A building with a real ring uses `wallPlate` (plate within 0.1 m of the ring); a building whose `ring` is degenerate (`[[0, 0]]`, as in the PR#540 test) still uses the box path, so those PR#540 assertions stay unchanged.
- [ ] **Step 2: implement.** In `addrLabels`:
  ```js
  const plate = (t, x, z, w, d, rot, foot, st, ring) => {
    const road = roadAt(x, z, st);
    return { t, ...(wallPlate(ring, x, z, road) || facingFacade(x, z, rot, w, d, road)), foot };
  };
  // buildings: plate(b.addr, ...b.rect, b.ring, b.st, b.ring); landmarks: plate(l.addr, l.x, l.z, ...l.size, l.rot || 0, null, undefined, null)
  ```
  (`foot` stays the ring for buildings, null for landmarks; keep the existing returned shape.) Update the comment above `addrLabels`.
- [ ] **Step 3: real-data sweep test** (`world.test.mjs`, reads `data/world_hochrhein.json` and `data/world_ehrendingen.json` with `readFileSync`, like the other real-data tests in this folder): for every building with `addr`, `addrLabels([b], {}, () => null)` and again with a target 30 m east, 30 m west of the centre: the plate is within 0.3 m (expect 0.06) of some ring edge (point-segment distance helper in the test). Assert the count of checked buildings is > 2000 / > 200 so it cannot pass vacuously.
- [ ] **Step 4: run** `node --test prototype/tests/world.test.mjs`.

## Task 3: street-preferring road lookup in the game

File: `prototype/index.html`, ONLY lines ~2139-2141.

- [ ] Change `nearestRoadPoint(x, z)` to `nearestRoadPoint(x, z, name)`: when `name` is given, first scan with `r.n === name` (same loop, same `PLATE.reach`); if that finds nothing, run the existing unrestricted scan. Keep it one function, no new globals (`ROAD_GRID` entries are `{ r, i }`, `r.n` is the road name). Because `addrLabels` already passes `st` as third argument to `roadAt`, the call on line ~2141 needs no change.
- [ ] Verify without a browser: `node --check` is not applicable to the inline module; instead re-read the edited line and run the whole JS suite `node --test prototype/tests/*.test.mjs` (small, no Playwright). Do not run Playwright.

## Task 4: pipeline writes `st`

Files: `pipeline/osm_read.py`, `pipeline/world_buildings.py`, `pipeline/tests/test_buildings.py`, `pipeline/tests/test_osm_read.py`, `docs/11-pipeline-osm.md`.

- [ ] **Step 1: failing tests** in `test_buildings.py`: `AddrNode(9, "7", 1.0, 21.0, "Bodenackerstrasse")` inside a house -> `rec["st"] == "Bodenackerstrasse"`; own tag `addr:street` wins over nodes; three nodes with streets A, A, B -> `A` (ties: alphabetical first); no street anywhere -> no `st` key; a building without `addr` but with a street gets no `st` (only numbered buildings carry it). In `test_osm_read.py`: a node with `addr:street` is read into `AddrNode.street`.
- [ ] **Step 2: implement.** `AddrNode` gets a last field `street: str = ""` (default keeps all existing positional constructors valid); `osm_read.read` passes `o.tags.get("addr:street", "")`. Update the dataclass docstring (street name is public map data like the number). In `world_buildings.build` collect `own_street` next to `own` (`t.get("addr:street", "").strip()`), and extend `_assign_numbers` (or a sibling `_assign_streets`) to set `rec["st"]` for records that have `addr`: own street, else majority of `node_streets` (reuse `node_numbers`' node-to-footprint assignment: refactor it to return `AddrNode`s per polygon, or add a parallel function, one place for the rule). Count `stats["street_own"]`, `stats["street_node"]`.
- [ ] **Step 3:** replace the sentence "No `street` field is exported." in `docs/11-pipeline-osm.md` (line ~311) with the `st` description.
- [ ] **Step 4:** `cd pipeline && pytest tests/test_buildings.py tests/test_osm_read.py`; then the whole `pytest -x -q` that CI runs (check `.github/workflows/tests.yml` for the exact command; the golden tests use fixtures, so `st` may change them: if a golden file mismatches because of the new `st` key, update the golden deliberately and say so in the PR).

## Task 5: targeted backfill script (data is patched by the maintainer, not by the agent)

Files: new `pipeline/backfill_building_streets.py`, new `pipeline/tests/test_backfill_streets.py`.

- [ ] **Step 1: failing test** with the synthetic OSM helpers in `pipeline/tests/synth_osm.py` (look at how `test_osm_read.py` builds a tiny pbf): a world dict with two buildings (`ring`, `addr`), a pbf with address nodes carrying `addr:street` inside one of them -> after `backfill(world, data)` only that building gained `st`, all other keys and buildings are byte-identical (compare the dict before/after minus `st`), running it twice is a no-op.
- [ ] **Step 2: implement.** `python backfill_building_streets.py --pbf cache/osm/hochrhein.osm.pbf --world ../data/world_hochrhein.json`: read `origin` (`lat`, `lon`) from the world file -> `geo.Frame(lat, lon)`; `osm_read.read(pbf, frame)` for `addr_nodes` and `areas`; polygons from each numbered building's `ring` (`shapely.Polygon`); own street from the area with the same `id` (`a.tags.get("addr:street")`), else node majority via the same helper as Task 4; write `st`, `json.dump` with the same separators the file already uses (check the existing formatting with `git diff --stat` after a run: the diff must only add `"st"` fields, ~1300 and ~100 lines changed, not reformat the file). Print counts. Pure function `backfill(world, data)` + a thin `main`.
- [ ] **Step 3:** tests green. **Do not run it on `data/`.** The `ai-implement` runner has no `pipeline/cache/*.osm.pbf` (gitignored). Final step for the PR description: "Data not yet patched: maintainer runs
  `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python backfill_building_streets.py --pbf cache/osm/hochrhein.osm.pbf --world ../data/world_hochrhein.json` and the same for `ehrendingen.osm.pbf` / `world_ehrendingen.json`, then commits `data/` and adds the Bodenacker test (Task 6)". Mention it in the PR so `needs-human` style hand-over is explicit.

## Task 6: real-data acceptance test (added in the maintainer's data commit)

After the backfill, add to `prototype/tests/world.test.mjs`: `world_hochrhein.json` building 171822634 has `st === 'Bodenackerstrasse'`; with the nearest point of any road named `Bodenackerstrasse` as target, `addrLabels` puts the plate on the east side (`Math.sin(rotY) > 0.9`, i.e. outward normal +x) and `< 0.3 m` from the ring; with `st` removed and the Badweg point as target it is on the west side. Also assert that >= 1000 numbered buildings carry `st`, and that every `st` that equals no road name is counted (informational, not failing). The agent includes this test **only if** `data/world_hochrhein.json` already contains `st` when it runs; otherwise it is left to the maintainer's data commit (it cannot pass before).

## Task 7: changelog and wrap-up

- [ ] `CHANGELOG.md` under `[Unreleased]`, player voice, German like the neighbours: e.g. "Hausnummern-Schilder sitzen jetzt auf der echten Hauswand statt davor in der Luft, und bei Häusern mit bekannter Strasse hängen sie auf der Seite der richtigen Strasse (z.B. Bodenackerstrasse 6)."
- [ ] Run `node --test prototype/tests/*.test.mjs` and the pipeline `pytest`; fix regressions in your own change only.
- [ ] PR title `fix(world): house-number plates on the real wall facing the addressed street`, body "Closes #557", list the manual data step.

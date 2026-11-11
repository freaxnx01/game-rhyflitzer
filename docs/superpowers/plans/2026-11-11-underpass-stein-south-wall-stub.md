# #844 Stein underpass: drop the wall stub at the west edge (implementation plan)

> **For agentic workers:** carry out this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a car on the tester's line south of Stein no longer hits the 1 m wall stub at `(-887.64, 1177.95)`.
`troughPiece` drops wall pieces wherever the road's own carriageway is not lowered, and the bank there stays a
grass slope.

**Architecture:** `troughPiece` (`index.html:2533-2552`) gets one more early return, placed after the existing
`ground - floor` / `lowered` test. When `cutDepth(rx, rz) <= 0.1`, the piece is recorded in a new `SLOPES` array
instead of being built. `__mm.openCutFaces` (`index.html:5151`) counts the points such a recorded piece would have
covered as `slope`, not as `open`. That is the narrow carve-out in `test_no_open_cut_faces`.

**Tech stack:** buildless JS (`index.html`), Python Playwright tests (`tests/test_underpass.py`, `server` fixture).

## Global constraints

- Only `index.html`, `tests/test_underpass.py` and `CHANGELOG.md` change. No `world.js` change, no world rebuild.
- Do not change `UNDERPASS`, `wallSpans`, `runCorners`, `cutNetwork` or the arm grades. Options B and C were rejected.
- Run only `tests/test_underpass.py` (the targeted browser test), in the foreground. If a test is still red after 3
  attempts, stop and report it. Never loosen an assertion to get it green.
- If the GPU browser closes the page while the full world loads (`TargetClosedError`, seen 2026-11-11), run on a
  `gpu-browser` CI runner instead. Do not shrink the world inside the test.

## Files

- Modify `index.html`: the `WALLS` declaration (line 1345), `troughPiece` (around line 2541), the
  `__mm.walls`/`__mm.openCutFaces` hooks (around lines 5149-5166).
- Modify `tests/test_underpass.py`: a new test, plus `test_no_open_cut_faces`.
- Modify `CHANGELOG.md`: one `Fixed` entry under `[Unreleased]`.

## Task 1: failing tests

- [ ] **Step 1: Write the failing test.** Add this to `tests/test_underpass.py` after `test_no_open_cut_faces`:

```python
# #844: south of Stein the main road's west wall run is cut short by the service road w1216639317's gap; the 1 m piece left
# at (-887.64, 1177.95) stood at the lane edge where the road itself is not lowered and stopped cars 23 m before the decks
STEIN_STUB = (-887.64, 1177.95)
STEIN_RUN = (-888.54, 1185.99)      # the west run in the real cut (1.5-2 m deep), which stays
TESTER = (-881.7, 1143.9)           # the tester's spot, 2.6 m west of the centre line


def bearing_th(bearing):
    """The game's P.th for a compass bearing (index.html: bearing = atan2(cos th, -sin th))."""
    return math.atan2(-math.cos(math.radians(bearing)), math.sin(math.radians(bearing)))


@needs_world
def test_stein_south_approach_has_no_wall_stub(server):
    def script(page):
        r = {"walls": page.evaluate("() => window.__mm.walls()")}
        for name, bearing, until in (("along", 186.4, 3.5), ("tester", 188.0, 2.0)):
            r[name] = page.evaluate("""([x, z, th, until]) => { const out = [];
                for (let i = 1; i * 0.25 <= until + 1e-9; i++) { const s = window.__mm.sim(x, z, th, 13.9, i * 0.25); out.push([s.z, s.speed]); }
                return { track: out, wrecked: window.__mm.damage().wrecked }; }""", [*TESTER, bearing_th(bearing), until])
        return r
    r = run(server, script)
    print(json.dumps({k: v for k, v in r.items() if k != "walls"}))
    near = lambda p: [w for w in r["walls"] if math.hypot(w["x"] - p[0], w["z"] - p[1]) < 1.5]
    assert not near(STEIN_STUB), near(STEIN_STUB)                                      # the stub is gone
    assert near(STEIN_RUN), "the west wall of the real cut must stay"
    drops = lambda t, until_z: [(a, b) for a, b in zip([[TESTER[1], 13.9]] + t, t) if b[0] < until_z and a[1] - b[1] > 2.5]
    along = r["along"]["track"]                                                        # 50 km/h, gas held, along the road
    assert not drops(along, 1e9) and along[-1][0] > 1215 and not r["along"]["wrecked"], along
    tester = r["tester"]["track"]                                                      # the tester's 188 deg line
    assert not drops(tester, 1182), tester                                             # nothing stops it before the real cut
    assert max(z for z, _ in tester) >= 1180, tester                                   # it got past where the stub stood
```

- [ ] **Step 2: Extend `test_no_open_cut_faces`.** Replace its last two lines (`assert r["checked"] > 0, r` and
  `assert r["count"] == 0, r`) with:

```python
    assert r["checked"] > 0, r
    assert r["count"] == 0, r
    # #844: a bank whose wall was dropped because the road it lines is not lowered there stays a grass slope -- counted,
    # not open, and shallow (the Stein corner measured 0.22-0.64 m at the dropped piece's inner face)
    assert r["slope"] > 0, "the Stein corner must show up as a slope"
    assert r["slopeMax"] <= 1.0, r["slopePts"][:30]
```

- [ ] **Step 3: Run the tests and check they fail.**
  `PW_CDP_ENDPOINT=http://192.168.1.120:9223 python3 -m pytest tests/test_underpass.py -k "stein_south or open_cut_faces" -s -x`.
  Expected: the stub assertion fails, and `KeyError: 'slope'`.

## Task 2: drop the piece, record the slope

- [ ] **Step 1: Declare `SLOPES`.** At `index.html:1345` change `ARMS = [], WALLS = [];` to
  `ARMS = [], WALLS = [], SLOPES = [];`. `SLOPES` holds the trough-wall pieces dropped because the road they line
  is not lowered there (#844).

- [ ] **Step 2: Add the early return in `troughPiece`.** Right after
  `if (ground - floor <= 0.1 && lowered <= 0.1) return;` insert:

```js
    // #844: where the road's own carriageway is not lowered, the bank beside it is only a side road's arm reaching around the
    // corner (south of Stein: 0.2-0.64 m, a 1 m piece left at the lane edge by the side road's gap): a grass slope, no wall
    if (cutDepth(rx, rz) <= 0.1) { SLOPES.push({ x: w.x, z: w.z, rot: w.rot, len: w.len }); return; }
```

- [ ] **Step 3: Rewrite `__mm.openCutFaces`.** Replace the function (`index.html:5151` up to its closing `};`)
  with the following. It is the same logic: the footprint check moves into `covers`, and a point covered by a
  dropped piece goes to `slope`.

```js
window.__mm.slopes = () => SLOPES;   // #844: the wall pieces dropped because their road is not lowered there
window.__mm.openCutFaces = (step = 0.5) => {
  const out = [], trough = [], slope = []; let checked = 0;
  const covers = (w, x, z) => { const dx = x - w.x, dz = z - w.z, c = Math.cos(w.rot), s = Math.sin(w.rot); return Math.abs(dx * c + dz * s) <= w.len / 2 + 0.3 && Math.abs(-dx * s + dz * c) <= UNDERPASS.wall / 2 + 0.3; };
  for (const a of ARMS) {
    const [x0, z0, x1, z1] = a.bounds, box = (w) => w.x > x0 - 3 && w.x < x1 + 3 && w.z > z0 - 3 && w.z < z1 + 3, walls = WALLS.filter(box), slopes = SLOPES.filter(box);
    for (let x = x0; x <= x1; x += step) for (let z = z0; z <= z1; z += step) {
      const d = cutDepth(x, z); if (d <= 0.3 || roadDist(x, z, 16) < UNDERPASS.margin) continue;
      checked++;
      if (walls.some((w) => covers(w, x, z))) continue;
      const p = [+x.toFixed(1), +z.toFixed(1), +d.toFixed(2)];
      if (slopes.some((w) => covers(w, x, z))) { slope.push(p); continue; }   // #844: a grass slope by design
      // PR #156, option (a): between two corridors too close for a wall (sharedTrough) the roads share one trough, no bank is open
      const roads = [...new Set([...gridQuery(ROAD_GRID, x, z, 16)].map(({ r }) => r))];
      (sharedTrough(x, z, roads) ? trough : out).push(p);
    }
  }
  const unique = (ps) => new Set(ps.map(([x, z]) => x + ',' + z)).size;
  return { checked, count: out.length, open: out.slice(0, 30), unique: unique(out), trough: trough.length, troughUnique: unique(trough), troughPts: trough,
           slope: slope.length, slopeMax: slope.reduce((m, p) => Math.max(m, p[2]), 0), slopePts: slope };
};
```

  Before replacing it, check the current `return` line. If it has fields beyond `checked`, `count`, `open`,
  `unique`, `trough`, `troughUnique` and `troughPts`, keep them.

- [ ] **Step 4: Run the tests.** Run the same command as in Task 1, Step 3. Expected: both tests pass.
  If `tester` shows a speed drop at z < 1182, or `slopeMax` > 1.0, stop and report the printed numbers. Do not
  widen the rule or the bound.

- [ ] **Step 5: Run the whole underpass file.**
  `PW_CDP_ENDPOINT=http://192.168.1.120:9223 python3 -m pytest tests/test_underpass.py -s`. Expected: all 8 tests
  green. `test_trough_walls` and `test_walls_follow_skewed_decks_and_leave_side_roads_open` must not need changes.

- [ ] **Step 6: Commit.** `fix(world): no wall stub at the lane edge before the Stein underpass (#844)`

## Task 3: changelog

- [ ] **Step 1:** Under `## [Unreleased]` → `### Fixed`, newest first, add a line with the time from
  `TZ=Europe/Zurich date '+%F %H:%M'`:
  `` - `<time>` South of **Stein**, the road to the **railway underpass** no longer ends at a stone corner: drive along its right-hand edge and you go straight through. ``
- [ ] **Step 2: Commit.** `docs(changelog): Stein underpass approach (#844)`

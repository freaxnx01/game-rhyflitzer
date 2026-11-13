# #844 Stein underpass: drop trough-wall run ends at at-grade corners (plan)

> **For agentic workers:** carry out task by task; steps use `- [ ]`.

**Goal:** south of Stein the two wall pieces at the at-grade corner, (-887.91, 1177.73) (service road w1216639317, road
2959) and (-887.64, 1177.95) (main road w107160628, road 914), are gone, so a car on the tester's 188 deg line reaches the
real cut. Other walls stay, `__mm.openCutFaces().count` stays 0.

**Architecture:** the run loop (`index.html:2735`) passes `atGradeCorner(...)` to `troughPiece`. A piece flagged there is
pushed to a new `SLOPES` array instead of being built. `__mm.openCutFaces` (`index.html:5531`) counts points under a
`SLOPES` piece as `slope`, not `open`.

## Global constraints

- Only `index.html`, `tests/test_underpass.py`, `CHANGELOG.md`. No world rebuild.
- Do not change `runCorners`/`cornerPiece` behaviour, `wallSpans`, `UNDERPASS`, `cutNetwork`, arm grades.
- No coordinate-specific exception in `index.html`.
- Run only `tests/test_underpass.py`, foreground, `PW_CDP_ENDPOINT=http://192.168.1.120:9223`. Red after 3 attempts:
  stop and report the numbers. Never loosen an assertion.
- `test_every_underpass_has_headroom` is red on main already: out of scope, leave it.

### Task 1: failing tests

- [ ] **Step 1: Write the failing test.** Append to `tests/test_underpass.py`:

```python
# #844: south of Stein the service road w1216639317 leaves the main road's cut where that cut is still at grade; the end
# pieces of both roads' runs at that corner stopped cars at the lane edge 8 m before the real cut
STEIN_CORNER = [(-887.91, 1177.73), (-887.64, 1177.95)]          # service road's north run end, main road's west run end
STEIN_KEEP = [(-888.54, 1185.99), (-888.15, 1185.4), (-889.94, 1177.70)]   # real cut wall, its corner piece, service run
KAPF_KEEP = [(-4006.27, 615.65), (-4001.34, 607.53)]              # PR#886's rule dropped these and opened 1.88 m faces
TESTER = (-881.7, 1143.9)                                         # 2.66 m west of the centre line
LANE = (-880.45, 1143.9)                                          # the southbound lane's centre


def bearing_th(bearing):
    """The game's P.th for a compass bearing (index.html: bearing = atan2(cos th, -sin th))."""
    return math.atan2(-math.cos(math.radians(bearing)), math.sin(math.radians(bearing)))


def speed_drops(track, start_z, until_z):
    """Steps (0.25 s apart) that lose more than 2.5 m/s before until_z."""
    return [(a, b) for a, b in zip([[start_z, 13.9]] + track, track) if b[0] < until_z and a[1] - b[1] > 2.5]


@needs_world
def test_stein_south_corner_has_no_wall_stub(server):
    def script(page):
        r = {"walls": page.evaluate("() => window.__mm.walls()"), "slopes": page.evaluate("() => window.__mm.slopes()")}
        for name, (x, z), bearing, until in (("lane", LANE, 186.4, 3.5), ("tester", TESTER, 188.0, 2.0)):
            r[name] = page.evaluate("""([x, z, th, until]) => { const out = [];
                for (let i = 1; i * 0.25 <= until + 1e-9; i++) { window.__mm.setDamage(0); const s = window.__mm.sim(x, z, th, 13.9, i * 0.25); out.push([s.z, s.speed]); }
                return { track: out, wrecked: window.__mm.damage().wrecked }; }""", [x, z, bearing_th(bearing), until])
        return r
    r = run(server, script)
    print(json.dumps({k: v for k, v in r.items() if k != "walls"}))
    near = lambda ws, p: [w for w in ws if math.hypot(w["x"] - p[0], w["z"] - p[1]) < 1.0]
    for p in STEIN_CORNER:
        assert not near(r["walls"], p), near(r["walls"], p)
        assert near(r["slopes"], p), p
    for p in STEIN_KEEP + KAPF_KEEP:
        assert near(r["walls"], p), p
    lane = r["lane"]["track"]
    assert not speed_drops(lane, LANE[1], 1222) and max(z for z, _ in lane) > 1215, lane   # road bends at z 1222.8
    tester = r["tester"]["track"]
    assert not speed_drops(tester, TESTER[1], 1182), tester                                 # real cut starts at z ~1182
    assert max(z for z, _ in tester) >= 1182, tester
```

- [ ] **Step 2: Extend `test_no_open_cut_faces`.** After `assert r["count"] == 0, r` add:

```python
    # #844: banks at an at-grade corner whose run end was dropped stay a shallow grass slope (measured max 0.81 m, Stein)
    assert r["slope"] > 0, "the Stein corner must show up as a slope"
    assert r["slopeMax"] <= 1.0, r["slopePts"][:30]
```

  and change its `print` to exclude `slopePts` too: `if k not in ("troughPts", "slopePts")`.

- [ ] **Step 3: Run, expect red.**
  `PW_CDP_ENDPOINT=http://192.168.1.120:9223 python3 -m pytest tests/test_underpass.py -k "stein_south or open_cut_faces" -s -x`
  Expected: `__mm.slopes` is not a function / `KeyError: 'slope'`.

### Task 2: the rule

- [ ] **Step 1:** `index.html:1480`: `ARMS = [], WALLS = [];` -> `ARMS = [], WALLS = [], SLOPES = [];`

- [ ] **Step 2:** In the run loop, replace line 2735 with

```js
      for (const w of wallStations(road.pts, runs, off, 2, [side])) troughPiece(road, w, ...pointAtLength(road.pts, w.t), atGradeCorner(road, runs, w, off, side));
```

  and add after the loop's closing `}` (before `// one wall piece w ...`):

```js
  // #844: w is the end piece of its run, the run is stopped there by another road, and one of the two roads is not lowered
  // at that corner (south of Stein: the service road leaves the main road's cut where the cut is still at grade)
  function atGradeCorner(road, runs, w, off, side) {
    const run = runs.find(([a, b]) => w.t >= a && w.t <= b); if (!run) return false;
    const [t0, t1] = run, half = (t1 - t0) / Math.max(1, Math.round((t1 - t0) / 2)) / 2;
    for (const [t, dir] of [[t0, -1], [t1, 1]]) {
      if (Math.abs(w.t - t) > half + 1e-6) continue;
      const beyond = wallPoint(road.pts, t + dir * 0.3, off, side);
      const others = new Set([...gridQuery(ROAD_GRID, ...beyond, 8)].filter(({ r, i }) => r !== road && segDist(...beyond, ...r.pts[i], ...r.pts[i + 1]) < r.w / 2 + UNDERPASS.margin + WALL_SLACK).map(({ r }) => r));
      if (!others.size) continue;
      if (cutDepth(...pointAtLength(road.pts, t)) <= 0.1) return true;
      for (const r of others) if (cutDepth(...pointAtLength(r.pts, nearestOnPolyline(r.pts, ...beyond).t)) <= 0.1) return true;
    }
    return false;
  }
```

- [ ] **Step 3:** `troughPiece(road, w, rx, rz)` -> `troughPiece(road, w, rx, rz, atGrade = false)`; right after
  `if (ground - floor <= 0.1 && lowered <= 0.1) return;` (line 2748) insert:

```js
    if (atGrade) { SLOPES.push({ x: w.x, z: w.z, rot: w.rot, len: w.len }); return; }   // #844: a grass slope, no wall
```

- [ ] **Step 4:** Replace `window.__mm.openCutFaces` (line 5531 to its `};`) and add the `slopes` hook:

```js
window.__mm.slopes = () => SLOPES;   // #844: run-end pieces dropped at an at-grade corner
window.__mm.openCutFaces = (step = 0.5) => {
  const out = [], trough = [], slope = []; let checked = 0;
  const covers = (w, x, z) => { const dx = x - w.x, dz = z - w.z, c = Math.cos(w.rot), s = Math.sin(w.rot); return Math.abs(dx * c + dz * s) <= w.len / 2 + 0.3 && Math.abs(-dx * s + dz * c) <= UNDERPASS.wall / 2 + 0.3; };
  for (const a of ARMS) {
    const [x0, z0, x1, z1] = a.bounds, inArm = (w) => w.x > x0 - 3 && w.x < x1 + 3 && w.z > z0 - 3 && w.z < z1 + 3, walls = WALLS.filter(inArm), slopes = SLOPES.filter(inArm);
    for (let x = x0; x <= x1; x += step) for (let z = z0; z <= z1; z += step) {
      const d = cutDepth(x, z); if (d <= 0.3 || roadDist(x, z, 16) < UNDERPASS.margin) continue;
      checked++;
      if (walls.some((w) => covers(w, x, z))) continue;
      const p = [+x.toFixed(1), +z.toFixed(1), +d.toFixed(2)];
      if (slopes.some((w) => covers(w, x, z))) { slope.push(p); continue; }
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

- [ ] **Step 5: Run Task 1's command.** Expected green. Measured on the experiment: `slope` 37, `slopeMax` 0.81, 5
  `SLOPES` pieces, tester line clear to z 1183.3, lane line clear to z 1231. Different numbers: stop and report them.
- [ ] **Step 6:** Run `tests/test_underpass.py` whole (same env). All green except `test_every_underpass_has_headroom`.
- [ ] **Step 7: Commit** `fix(world): no wall stub at the at-grade corner before the Stein underpass (#844)`

### Task 3: changelog

- [ ] Under `## [Unreleased]` -> `### Fixed`, newest first, time from `TZ=Europe/Zurich date '+%F %H:%M'`:
  `` - `<time>` South of **Stein**, the road into the **railway underpass** no longer has a **stone corner** at its edge where the side road turns off: it is a low grass bank now. ``
- [ ] Commit `docs(changelog): Stein underpass corner (#844)`

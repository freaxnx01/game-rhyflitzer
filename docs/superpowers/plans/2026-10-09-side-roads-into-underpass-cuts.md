# Side Roads into Underpass Cuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Side roads (and the cut road's own continuation piece) that join inside a rail underpass cut descend with it on their own ramp between trough walls, so no cut is capped any more and every underpass gets its full 4.5 m headroom.

**Architecture:** A cut becomes a network of *arms*. Pure helpers in `prototype/world.js` compute each arm's reach, the nodes along it, the network (breadth-first from the main cut) and the cap points it cannot descend through. `prototype/index.html` loops reach → network → cap in `makeCut`, bakes the lowest floor of all arms into the 1 m terrain patches, and draws trough walls along every arm, trimmed where another road's corridor starts so the main wall opens for the side road.

**Tech Stack:** Vanilla JS ES modules, three.js, `node --test` for pure helpers, pytest + Playwright (Chromium, SwiftShader) for browser tests.

**Spec:** `docs/superpowers/specs/2026-10-09-side-roads-into-underpass-cuts-design.md` (issue #120; builds on #119's `docs/superpowers/specs/2026-10-07-abutment-walls-design.md`).

## Global Constraints

- Buildless static game. No new packages, no `package.json`, no framework (CLAUDE.md, browser-game overlay).
- `UNDERPASS` after this plan: `{ clear: 4.5, deck: 1.2, lift: 0.04, grade: 0.08, sideGrade: 0.12, margin: 1, wall: 2, maxDepth: 6, apron: 3 }`.
- **No world rebuild.** `data/world_hochrhein.json` and `pipeline/` stay untouched; the change is game-side only.
- Headroom on the real world: **no crossing capped**, every crossing `clearance ≥ 4.45` (or `depth ≥ 5.99`), `railGap < 0.3`.
- Browser tests run in the **foreground**, one file or test at a time, capped:
  `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest … -q -s -p no:cacheprovider` (from the repo root; in a worktree without its own venv, use the main checkout's `pipeline/.venv/bin/python`). Each test ~45–90 s. If it exits 137, run fewer tests per call; do not raise the cap. Commit and push before long verification.
- Small change policy: run only the browser tests named in this plan, not the ~2 h full suite.
- The CHANGELOG is hand-written, player-facing, in English. Never `git cliff -o CHANGELOG.md`.
- A failing pre-existing test is fixed in the implementation, never by editing the test, unless this plan says to change that test.

## Review Focus

1. **The corner where a side road leaves the trough.** Expected: the main road's wall opens exactly for the side road's corridor and the two wall runs meet; no bare bank. Pinned in Task 3 (`test_no_open_cut_faces`) and the unchanged "no wall in a road's corridor" assertion.
2. **A cut road split into OSM pieces.** Expected: the continuation piece ramps on at 8 %, as if the piece had not ended. Pinned in Task 1 (`cutNetwork` continuation case).
3. **Dead ends, bridges, arms out of budget.** Expected: they still cap the floor (fallback), with `rise` measured along the network. Pinned in Task 1 (`cutNetwork` + `capFloor` cases).
4. **No regression at existing troughs** (Laufenburgerstrasse, skewed Hauptstrasse Stein). Pinned by the unchanged #119 tests in `test_underpass.py`.

---

### Task 1: Pure network helpers

**Files:**
- Modify: `prototype/world.js:105` (`UNDERPASS`), `:150-162` (`junctionCap`, `cutFloor`, `cutReach` → `capFloor`, `cutFloor`, `armReach`, `armNodes`, `cutNetwork`), `:181-191` (`wallStations` gains `sides`; new `wallSpans`)
- Test: `prototype/tests/world.test.mjs:3` (import), `:409-433` (replace the `junctionCap` and `cutReach` tests), after the `wallStations` test (new tests)

**Interfaces:**
- Produces (in `world.js`):
  - `cutFloor(c, s, u = UNDERPASS): number` — `c.f0 + (c.grade ?? u.grade) * max(0, |s| − c.flat)`.
  - `armReach(a: {t, flat, f0, grade?}, groundAt: (s) => number, len: number, u = UNDERPASS): [{s, why}, {s, why}]`, `why ∈ 'ground' | 'end' | 'budget'`.
  - `capFloor(f0: number, caps: {rise, ground, kind, x, z}[]): { f0, capped }`.
  - `armNodes(a: {pts, t, hw, reach}, junctions: [x, z, r][], len: number): {x, z, s, end}[]`.
  - `cutNetwork(cut, roads, junctions, ground: (x, z) => number, u = UNDERPASS): { arms, caps }`; arm = `{ pts, road, t, hw, flat: 0, f0, grade, reach: [back, ahead], stop: [why, why], x, z }`.
  - `wallSpans(pts, intervals, offset, side: -1 | 1, blocked: (x, z) => boolean): [a, b][]`.
  - `wallStations(pts, intervals, offset, step, sides = [-1, 1])`.
- Removes: `junctionCap`, `cutReach`.
- Consumes: `nearestOnPolyline`, `pointAtLength`, `polylineLength`, `mergeIntervals` (unchanged).

- [ ] **Step 1: Write the failing unit tests.** In `prototype/tests/world.test.mjs` line 3, replace `junctionCap, cutFloor, cutReach,` with `capFloor, cutFloor, armReach, armNodes, cutNetwork, wallSpans,`. Replace the whole `test('junctionCap raises the floor …` block with:

```js
test('capFloor raises the floor until every cap point is at its own ground', () => {
  assert.deepEqual(capFloor(10, []), { f0: 10, capped: null });
  assert.deepEqual(capFloor(10, [{ rise: 3, ground: 12 }]), { f0: 10, capped: null });          // 12 - 3 = 9: already up
  const one = capFloor(10, [{ rise: 1.12, ground: 13, kind: 'dead' }]);
  assert.ok(Math.abs(one.f0 - 11.88) < 1e-9); assert.equal(one.capped.kind, 'dead');
  const two = capFloor(10, [{ rise: 1.12, ground: 13, kind: 'dead' }, { rise: 0.32, ground: 12, kind: 'bridge' }]);
  assert.ok(Math.abs(two.f0 - 11.88) < 1e-9); assert.equal(two.capped.kind, 'dead');
});
```

Keep the `CUT` constant and the `cutFloor` test, and add one assertion at the end of that test:

```js
  assert.ok(Math.abs(cutFloor({ f0: 10, flat: 0, grade: 0.12 }, -10) - 11.2) < 1e-9);   // #120: an arm ramps at its own grade
```

Replace the whole `test('cutReach ends each side …` block with:

```js
test('armReach: per side, where the floor meets the ground, else the piece end, else the budget', () => {
  const c = { t: 100, flat: 6, f0: 10 };
  assert.deepEqual(armReach(c, (s) => (s >= 0 ? 12.4 : 10.4), 200), [{ s: 11, why: 'ground' }, { s: 36, why: 'ground' }]);
  assert.deepEqual(armReach(c, () => 100, 200), [{ s: 81, why: 'budget' }, { s: 81, why: 'budget' }]);   // flat + maxDepth / grade
  assert.deepEqual(armReach(c, () => 100, 120), [{ s: 81, why: 'budget' }, { s: 20, why: 'end' }]);
  assert.deepEqual(armReach(c, () => 9, 200), [{ s: 0, why: 'ground' }, { s: 0, why: 'ground' }]);    // the deck is high enough
  const arm = { t: 0, flat: 0, f0: 10, grade: 0.12 };
  assert.deepEqual(armReach(arm, () => 12, 100), [{ s: 0, why: 'end' }, { s: 17, why: 'ground' }]);   // 2 / 0.12 = 16.7
  const deep = armReach(arm, () => 100, 100);
  assert.equal(deep[1].why, 'budget'); assert.ok(Math.abs(deep[1].s - 50) < 1e-9);                      // maxDepth / sideGrade
});
```

After the `wallStations` test, add:

```js
test('wallStations builds only the sides asked for', () => {
  const ws = wallStations([[0, -100], [0, 100]], [[90, 110]], 6.5, 2, [1]);
  assert.equal(ws.length, 10);
  assert.ok(ws.every((w) => w.side === 1 && Math.abs(w.x + 6.5) < 1e-9));
});

test('wallSpans trims a wall run where its centre line enters another road', () => {
  const pts = [[0, -100], [0, 100]];
  assert.deepEqual(wallSpans(pts, [[90, 110]], 6.5, 1, () => false), [[90, 110]]);
  const sp = wallSpans(pts, [[90, 110]], 6.5, 1, (x, z) => Math.abs(z) < 3 && x < 0);   // a side road along x < 0 at z = 0
  assert.equal(sp.length, 2);
  assert.ok(Math.abs(sp[0][0] - 90) < 1e-9 && Math.abs(sp[0][1] - 97) < 1e-9 && Math.abs(sp[1][0] - 103) < 1e-9 && Math.abs(sp[1][1] - 110) < 1e-9, JSON.stringify(sp));
  assert.deepEqual(wallSpans(pts, [[90, 110]], 6.5, -1, (x, z) => Math.abs(z) < 3 && x < 0), [[90, 110]]);   // the far side stays closed
});

// #120: a main road along z (crossing at z = 0, floor 10, level 6 m), side roads at z = 20; flat ground at 14 unless given
const MAIN_RD = { id: 1, n: 'Main', w: 9, pts: [[0, -100], [0, 100]] };
const MAIN = (road = MAIN_RD, t = 100) => {
  const c = { pts: road.pts, road, t, hw: road.w / 2, flat: 6, f0: 10 };
  c.reach = armReach(c, () => 14, polylineLength(road.pts)).map((p) => p.s);
  return c;
};
const flat14 = () => 14;

test('armNodes: junctions on the road and reached piece ends, inside the reach, not the anchor', () => {
  const c = { pts: [[0, -100], [0, 100]], t: 100, hw: 4.5, reach: [56, 56] };
  assert.deepEqual(armNodes(c, [[0, 20, 3], [0, -30, 3], [50, 0, 3], [0, 80, 3], [0, 20.3, 3], [0, 0.2, 3]], 200),
    [{ x: 0, z: 20, s: 20, end: false }, { x: 0, z: -30, s: -30, end: false }]);
  assert.deepEqual(armNodes({ ...c, reach: [100, 0] }, [], 200), [{ x: 0, z: -100, s: -100, end: true }]);
});

test('cutNetwork: a side road joining inside the reach descends from the floor there at the side grade', () => {
  const side = { id: 2, n: 'Side', w: 5.5, pts: [[0, 20], [60, 20]] };
  const { arms, caps } = cutNetwork(MAIN(), [MAIN_RD, side], [[0, 20, 3]], flat14);
  assert.equal(arms.length, 1); assert.deepEqual(caps, []);
  const a = arms[0];
  assert.equal(a.road, side); assert.equal(a.t, 0); assert.equal(a.grade, 0.12); assert.equal(a.flat, 0);
  assert.ok(Math.abs(a.f0 - 11.12) < 1e-9);                                        // 10 + 0.08 * (20 - 6)
  assert.deepEqual(a.reach, [0, 24]); assert.deepEqual(a.stop, ['end', 'ground']);   // 2.88 / 0.12
});

test('cutNetwork: a dead end caps the floor by its rise along the network', () => {
  const stub = { id: 2, n: 'Side', w: 5.5, pts: [[0, 20], [10, 20]] };
  const { arms, caps } = cutNetwork(MAIN(), [MAIN_RD, stub], [[0, 20, 3]], flat14);
  assert.equal(arms.length, 1); assert.equal(caps.length, 1);
  assert.equal(caps[0].kind, 'dead'); assert.ok(Math.abs(caps[0].rise - 2.32) < 1e-9);   // 1.12 on the main road + 0.12 * 10
  assert.ok(Math.abs(capFloor(10, caps).f0 - 11.68) < 1e-9);
});

test('cutNetwork: a bridge piece at a node is no arm but a cap', () => {
  const br = { id: 2, n: 'Side', w: 5.5, pts: [[0, 20], [60, 20]], bridge: true };
  const { arms, caps } = cutNetwork(MAIN(), [MAIN_RD, br], [[0, 20, 3]], flat14);
  assert.equal(arms.length, 0); assert.equal(caps.length, 1); assert.equal(caps[0].kind, 'bridge');
  assert.ok(Math.abs(capFloor(10, caps).f0 - 12.88) < 1e-9);
});

test('cutNetwork: the cut road going on in its next piece keeps the cut grade', () => {
  const m1 = { id: 1, n: 'Main', w: 9, pts: [[0, -100], [0, 20]] }, m2 = { id: 1, n: 'Main', w: 9, pts: [[0, 20], [0, 100]] };
  const cut = MAIN(m1);
  assert.deepEqual(cut.reach, [56, 20]);                                            // stops at its piece end
  const { arms, caps } = cutNetwork(cut, [m1, m2], [], flat14);
  assert.equal(arms.length, 1); assert.deepEqual(caps, []);
  assert.equal(arms[0].grade, 0.08); assert.deepEqual(arms[0].reach, [0, 36]);      // 20 + 36 = 56, as one road
});

test('cutNetwork: an arm meeting another road on its ramp spreads into it', () => {
  const stub = { id: 2, n: 'Side', w: 5.5, pts: [[0, 20], [10, 20]] }, next = { id: 3, n: 'Other', w: 5.5, pts: [[10, 20], [10, 80]] };
  const { arms, caps } = cutNetwork(MAIN(), [MAIN_RD, stub, next], [[0, 20, 3]], flat14);
  assert.equal(arms.length, 2); assert.deepEqual(caps, []);
  assert.equal(arms[1].road, next); assert.ok(Math.abs(arms[1].f0 - 12.32) < 1e-9); assert.deepEqual(arms[1].reach, [0, 14]);
});

test('cutNetwork: an arm still below the ground at its budget caps the floor', () => {
  const side = { id: 2, n: 'Side', w: 5.5, pts: [[0, 20], [200, 20]] }, climb = (x) => 14 + 0.2 * Math.max(0, x);
  const { caps } = cutNetwork(MAIN(), [MAIN_RD, side], [[0, 20, 3]], climb);
  assert.equal(caps.length, 1); assert.equal(caps[0].kind, 'budget');
  assert.ok(Math.abs(caps[0].rise - 7.12) < 1e-9 && Math.abs(caps[0].ground - 24) < 1e-9);   // 1.12 + 0.12 * 50; 14 + 0.2 * 50
});
```

- [ ] **Step 2: Run them to see them fail.** Run: `node --test prototype/tests/world.test.mjs`. Expected: FAIL (import errors: `capFloor`, `armReach`, … not exported).

- [ ] **Step 3: Implement.** In `prototype/world.js`:

Line 105 becomes:

```js
export const UNDERPASS = { clear: 4.5, deck: 1.2, lift: 0.04, grade: 0.08, sideGrade: 0.12, margin: 1, wall: 2, maxDepth: 6, apron: 3 };
```

and add one comment line above it: `// #120: side roads joining inside a cut descend with it on arms ramping at sideGrade (the same street going on: grade).`

Replace `junctionCap`, `cutFloor` and `cutReach` (lines 151–162, keep `cutFloorTarget` and `cutFloorAt`) with:

```js
// #120: the points the network cannot descend through (dead ends, bridge joins, arms out of budget) keep their ground:
// f0 >= ground - rise, rise = how far the floor climbs from the crossing to that point along the network
export function capFloor(f0, caps) {
  let out = { f0, capped: null };
  for (const p of caps) { const f = p.ground - p.rise; if (f > out.f0) out = { f0: f, capped: p }; }
  return out;
}
export function cutFloor(c, s, u = UNDERPASS) { return c.f0 + (c.grade ?? u.grade) * Math.max(0, Math.abs(s) - c.flat); }
// #120: per side of the anchor t, how far a cut or arm reaches and why it stops: the floor meets the ground ('ground', first
// whole metre), its road piece ends first ('end'), or it is still below the ground after flat + maxDepth / grade ('budget')
export function armReach(a, groundAt, len, u = UNDERPASS) {
  const max = a.flat + u.maxDepth / (a.grade ?? u.grade);
  return [-1, 1].map((dir) => {
    const room = dir < 0 ? a.t : len - a.t;
    for (let s = 0; s <= Math.min(room, max); s++) if (cutFloor(a, s, u) >= groundAt(dir * s) - 1e-9) return { s, why: 'ground' };
    return room <= max ? { s: room, why: 'end' } : { s: max, why: 'budget' };
  });
}
// #120: the nodes along a cut or arm inside its reach -- junction points on its road and the piece ends it reaches, never its
// own anchor; s is signed from the anchor; one node per 0.5 m (a piece end on a junction is one node, an end)
export function armNodes(a, junctions, len) {
  const out = [], add = (x, z, s, end) => {
    if (Math.abs(s) <= 0.5 || s < -a.reach[0] - 1e-9 || s > a.reach[1] + 1e-9 || out.some((o) => Math.hypot(o.x - x, o.z - z) < 0.5)) return;
    out.push({ x, z, s, end });
  };
  add(...a.pts[0], -a.t, true); add(...a.pts[a.pts.length - 1], len - a.t, true);
  for (const [jx, jz] of junctions) { const n = nearestOnPolyline(a.pts, jx, jz); if (n.d < a.hw + 2) add(jx, jz, n.t - a.t, false); }
  return out;
}
const sameStreet = (a, b) => a.id === b.id || (!!a.n && a.n === b.n);
// #120: every road piece meeting the cut (or one of its arms) at a node below the ground descends with it: an arm anchored
// there, starting at the floor of the road it leaves and ramping back up at u.grade (same street) or u.sideGrade. Breadth-
// first, each piece once. What cannot take an arm becomes a cap point for capFloor.
export function cutNetwork(cut, roads, junctions, ground, u = UNDERPASS) {
  const arms = [], caps = [], used = new Set([cut.road]), queue = [{ a: cut, rise0: 0 }];
  while (queue.length) {
    const { a, rise0 } = queue.shift();
    for (const nd of armNodes(a, junctions, polylineLength(a.pts))) {
      const floor = cutFloor(a, nd.s, u), g = ground(nd.x, nd.z), rise = rise0 + floor - a.f0;
      if (floor >= g - 0.05) continue;
      const touch = roads.filter((o) => o !== a.road && nearestOnPolyline(o.pts, nd.x, nd.z).d < 0.6), open = touch.filter((o) => !o.bridge && (o.layer ?? 0) === 0);
      if (open.length < touch.length) caps.push({ x: nd.x, z: nd.z, rise, ground: g, kind: 'bridge' });
      else if (nd.end && !open.length) caps.push({ x: nd.x, z: nd.z, rise, ground: g, kind: 'dead' });
      for (const o of open) {
        if (used.has(o)) continue;
        used.add(o);
        const t = nearestOnPolyline(o.pts, nd.x, nd.z).t, arm = { pts: o.pts, road: o, t, hw: o.w / 2, flat: 0, f0: floor, grade: sameStreet(o, a.road) ? u.grade : u.sideGrade, x: nd.x, z: nd.z };
        const r = armReach(arm, (s) => ground(...pointAtLength(o.pts, t + s)), polylineLength(o.pts), u);
        arm.reach = r.map((p) => p.s); arm.stop = r.map((p) => p.why);
        r.forEach((p, k) => {
          if (p.why !== 'budget') return;
          const [x, z] = pointAtLength(o.pts, t + (k ? p.s : -p.s));
          caps.push({ x, z, rise: rise + arm.grade * p.s, ground: ground(x, z), kind: 'budget' });
        });
        arms.push(arm); queue.push({ a: arm, rise0: rise });
      }
    }
  }
  return { arms, caps };
}
```

Change `wallStations` (line 181) to take the sides:

```js
export function wallStations(pts, intervals, offset, step, sides = [-1, 1]) {
```

and its inner loop `for (const side of [-1, 1])` to `for (const side of sides)`. Then add after it:

```js
// #120: the parts of the spans where the wall centre line (`offset` m to `side`, normal as in wallStations) stays outside
// `blocked` -- another road's corridor -- sampled every 0.25 m, so a run ends at that road's wall face; bits < 0.5 m dropped
export function wallSpans(pts, intervals, offset, side, blocked) {
  const out = [];
  for (const [a, b] of mergeIntervals(intervals)) {
    const n = Math.max(1, Math.ceil((b - a) / 0.25));
    let start = null, last = null;
    for (let k = 0; k <= n; k++) {
      const t = a + (b - a) * k / n, [x0, z0] = pointAtLength(pts, t - 0.1), [x1, z1] = pointAtLength(pts, t + 0.1), rot = Math.atan2(z1 - z0, x1 - x0), [x, z] = pointAtLength(pts, t);
      const free = !blocked(x - Math.sin(rot) * side * offset, z + Math.cos(rot) * side * offset);
      if (free) { if (start === null) start = t; last = t; }
      if ((!free || k === n) && start !== null) { if (last - start >= 0.5) out.push([start, last]); start = null; }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the unit tests.** Run: `node --test prototype/tests/*.test.mjs`. Expected: all pass. (`index.html` still imports `junctionCap` / `cutReach` and is fixed in Task 2 — do not open the game between Task 1 and Task 2.)

- [ ] **Step 5: Commit.**

```bash
git add prototype/world.js prototype/tests/world.test.mjs
git commit -m "feat(world): cut networks, side roads descend on their own arms (#120)"
```

---

### Task 2: Cuts spread into side roads in the game

**Files:**
- Modify: `prototype/index.html:241` (import), `:485` (`ARMS`), `:508-539` (`makeCut`, `cutJunctions`, `cutFloorMin`, `buildCuts`), `:1305-1310` (`window.__mm.crossings`, new `window.__mm.arms`)
- Test: `prototype/tests/test_underpass.py` (`test_every_underpass_has_headroom`; new `test_side_roads_descend_with_the_cut`)

**Interfaces:**
- Consumes: Task 1's `armReach`, `capFloor`, `cutNetwork`; existing `ROAD_GRID`, `gridQuery`, `meshH`, `terrainH`, `L.junctions`.
- Produces: `CUTS` entries gain `arms` (Task 1 arm objects plus `deck`); `ARMS` (main cuts with `depth > 0` and their arms, each with `bounds`); `window.__mm.crossings()` entries gain `arms: number` and `capped: {x, z, kind} | null`; `window.__mm.arms()` → `[{ road, crossing: [x, z], x, z, f0, grade, reach, stop, sides: [[[s, terrain, mesh, x, z], …], […]] }]`.

- [ ] **Step 1: Write the failing browser tests.** In `prototype/tests/test_underpass.py`, replace the body of `test_every_underpass_has_headroom` after the `print(json.dumps(xs, indent=1))` line with:

```python
    assert len(xs) >= 2
    # #120: side roads descend with the cut, so nothing caps it any more and every underpass has the full headroom
    bad = [c for c in xs if (c["clearance"] < 4.45 and c["depth"] < 5.99) or c["railGap"] >= 0.3]
    assert not bad, bad
    assert not [c for c in xs if c["capped"]], [(c["road"], c["capped"]) for c in xs if c["capped"]]
    print("arms:", [(c["road"], c["arms"]) for c in xs])
```

and add after it:

```python
# #119 capped these; with #120 their side roads descend instead (crossing positions on the rebuilt world)
FORMER_CAPS = {"Kapfstrasse": (-4032, 548), "unnamed road by Bahndammstrasse": (-886, 1207),
               "Hauptstrasse Stein": (-212, 1090), "Laufenburgerstrasse north": (1571, 1811)}


@needs_world
def test_side_roads_descend_with_the_cut(server):
    """#120: at the four places #119 capped, the side roads joining inside the cut descend with it. Every arm starts at the
    floor of the road it leaves, climbs without a step and meets the ground where it ends; a car drives up out of one."""
    def script(page):
        arms = page.evaluate("() => window.__mm.arms()")
        a, k = max(((a, k) for a in arms if a["road"] == "Rohrmatt" for k in (0, 1)), key=lambda p: p[0]["reach"][p[1]])
        prof = a["sides"][k]; (x0, z0), (x1, z1) = prof[0][3:5], prof[min(5, len(prof) - 1)][3:5]
        drive = page.evaluate(f"() => window.__mm.sim({x0}, {z0}, {math.atan2(z1 - z0, x1 - x0)}, 6, 4)")
        return {"arms": arms, "drive": drive, "from": [x0, z0]}
    r = run(server, script)
    arms = r["arms"]
    print(json.dumps([(a["road"], a["crossing"], round(a["f0"], 2), a["grade"], a["reach"], a["stop"]) for a in arms]))
    for name, (x, z) in FORMER_CAPS.items():
        assert any(math.hypot(a["crossing"][0] - x, a["crossing"][1] - z) < 15 for a in arms), name
    for a in arms:
        for k, prof in enumerate(a["sides"]):
            assert prof[0][1] <= a["f0"] + 0.2, (a["road"], prof[0])                        # starts at the floor it leaves
            for p, q in zip(prof, prof[1:]):
                assert abs(q[1] - p[1]) <= 0.3, (a["road"], p, q)                           # no step along the arm
            if a["stop"][k] == "ground":
                assert abs(prof[-1][1] - prof[-1][2]) < 0.3, (a["road"], prof[-1])         # meets the ground where it ends
    d = r["drive"]
    assert math.hypot(d["x"] - r["from"][0], d["z"] - r["from"][1]) >= 15 and d["speed"] > 2, d   # up and out of the trough
```

- [ ] **Step 2: Fix the import so the game loads, then run the tests to see them fail.** In `prototype/index.html:241` replace `junctionCap, cutReach,` with `capFloor, armReach, cutNetwork,` (the old names no longer exist after Task 1). Run: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_underpass.py::test_every_underpass_has_headroom prototype/tests/test_underpass.py::test_side_roads_descend_with_the_cut -q -s -p no:cacheprovider`. Expected: FAIL (page error: `junctionCap is not defined` in `makeCut`, or `window.__mm.arms` missing).

- [ ] **Step 3: Implement.** In `prototype/index.html`:

Line 485 becomes:

```js
const CUT_N = 16, CUT_CELLS = new Map(), CUTS = [], ARMS = [], WALLS = [];
```

Replace the comment block above `makeCut` and everything from `function makeCut(c) {` through the end of `function buildCuts() { … }` (lines 508–539; `cutDepth` stays) with:

```js
// #76/#119/#120: one cut per rail-deck/road crossing, an absolute floor sized on the uncut mesh (meshH): level across the
// corridor, ramping out until it meets the ground. Side roads and the cut road's next piece joining inside it descend with
// it on arms (cutNetwork); only what cannot (dead ends, bridges, arms out of budget) still caps the floor. Then the patches
// for every cell an arm touches.
function makeCut(c) {
  const b = RAIL_DECKS[c.bridge], hw = c.road.w / 2, flat = cutFlat(b.hw, c.sin), span = hw / Math.max(0.3, c.sin) + 1, len = polylineLength(c.road.pts);
  let deckMin = Infinity; for (const k of [-1, 0, 1]) deckMin = Math.min(deckMin, bridgeSurfaceAt(b, c.tRail + k * span));
  const groundAt = (s) => { const [x, z] = pointAtLength(c.road.pts, c.tRoad + s); return meshH(x, z); };
  const near = [...new Set([...gridQuery(ROAD_GRID, c.x, c.z, 250)].map(({ r }) => r))];
  const cut = { pts: c.road.pts, t: c.tRoad, hw, flat, f0: cutFloorTarget(deckMin, groundAt(0)), capped: null, x: c.x, z: c.z, road: c.road, deck: b, tRail: c.tRail, deckMin, arms: [] };
  for (let k = 0; ; k++) {
    cut.reach = armReach(cut, groundAt, len).map((p) => p.s);
    const net = cutNetwork(cut, near, L.junctions, meshH), cap = capFloor(cut.f0, net.caps);
    cut.arms = net.arms;
    if (!cap.capped || k === 8) break;
    cut.f0 = cap.f0; cut.capped = cap.capped;
  }
  for (const a of cut.arms) a.deck = b;
  cut.depth = Math.max(0, groundAt(0) - cut.f0);
  return cut;
}
function cutFloorMin(x, z) {
  let f = Infinity;
  for (const a of ARMS) { const [x0, z0, x1, z1] = a.bounds; if (x < x0 || x > x1 || z < z0 || z > z1) continue; const h = cutFloorAt(a, x, z); if (h !== null) f = Math.min(f, h); }
  return f;
}
function cutDepth(x, z) { return meshH(x, z) - terrainH(x, z); }
function buildCuts() {
  for (const c of railRoadCrossings(L.roads, L.railBridges)) CUTS.push(makeCut(c));
  for (const c of CUTS) if (c.depth > 0) for (const a of [c, ...c.arms]) { a.bounds = cutBounds(a); ARMS.push(a); }
  const G = TGRID, W = CUT_N + 1;
  for (const a of ARMS) for (const [i, j] of patchCells(a.bounds, G)) {
    const key = i + ',' + j; if (CUT_CELLS.has(key)) continue;
    const p = new Float32Array(W * W);
    for (let b = 0; b < W; b++) for (let k = 0; k < W; k++) { const x = G.x0 + (i + k / CUT_N) * G.dx, z = G.z0 + (j + b / CUT_N) * G.dz; p[b * W + k] = Math.min(meshH(x, z), cutFloorMin(x, z)); }
    CUT_CELLS.set(key, p);
  }
}
```

(Check first that the existing `function cutDepth` line sits between `cutFloorMin` and `buildCuts` as shown at `:530`; keep exactly one copy of it.)

In the trough-wall block (`:967`) change the `byRoad` line so walls already follow the arms (Task 3 refines the corners):

```js
  const byRoad = new Map(); for (const a of ARMS) { if (!byRoad.has(a.road)) byRoad.set(a.road, []); byRoad.get(a.road).push(a); }
```

Replace `window.__mm.crossings` (`:1305-1310`) with:

```js
window.__mm.crossings = () => CUTS.map(c => {
  let road = -Infinity; for (let s = -c.flat + UNDERPASS.apron; s <= c.flat - UNDERPASS.apron; s += 1) { const [x, z] = pointAtLength(c.pts, c.t + s); road = Math.max(road, roadSurfH(x, z), terrainH(x, z)); }
  const deck = bridgeSurfaceAt(c.deck, c.tRail), p = c.deck.r.pts, ends = [[p[0], c.deck.h0], [p[p.length - 1], c.deck.h1]];
  return { x: c.x, z: c.z, road: c.road.n, depth: c.depth, arms: c.arms.length, capped: c.capped && { x: c.capped.x, z: c.capped.z, kind: c.capped.kind }, deck, clearance: deck - UNDERPASS.deck - road,
           railGap: Math.max(...ends.map(([[x, z], h]) => Math.abs(Math.max(terrainH(x, z), roadSurfH(x, z)) - h))) };
});
// #120: the side-road arms of every cut, with a 1 m profile per side: [s, terrain, uncut mesh, x, z]
window.__mm.arms = () => CUTS.filter((c) => c.depth > 0).flatMap((c) => c.arms.map((a) => ({
  road: a.road.n, crossing: [c.x, c.z], x: a.x, z: a.z, f0: a.f0, grade: a.grade, reach: a.reach, stop: a.stop,
  sides: [-1, 1].map((dir, k) => { const out = []; for (let s = 0; s <= a.reach[k]; s += 1) { const [x, z] = pointAtLength(a.pts, a.t + dir * s); out.push([s, terrainH(x, z), meshH(x, z), x, z]); } return out; }) })));
```

Also update the comment on `cutJunctions`' former callers: nothing else calls `cutJunctions`; `grep -n "cutJunctions\|junctionCap\|cutReach" prototype/` must print nothing.

- [ ] **Step 4: Run the tests.** Run the two tests from Step 2. Expected: PASS. `test_every_underpass_has_headroom` prints the 16 crossings with `arms` and no `capped`. If a crossing stays capped: **STOP** and report its `capped` (kind, position) in the PR — do not loosen the test; a dead end or bridge there needs a decision. Then run the rest of the file: `… -m pytest prototype/tests/test_underpass.py -q -s -p no:cacheprovider`. Expected: all pass (`test_walls_follow_skewed_decks_and_leave_side_roads_open` may fail on a wall in a side road's corridor; that is Task 3's job — note it and move on, but `test_laufenburgerstrasse_underpass` and `test_trough_walls` must pass now).

- [ ] **Step 5: Commit and push.**

```bash
git add prototype/index.html prototype/tests/test_underpass.py
git commit -m "feat(world): underpass cuts spread into the side roads that join them (#120)"
git push -u origin HEAD
```

---

### Task 3: Walls along the arms, meeting at the corners

**Files:**
- Modify: `prototype/index.html:241` (import `wallSpans`), `:961-979` (trough-wall block), debug hooks next to `window.__mm.walls` (`:1324`)
- Test: `prototype/tests/test_underpass.py` (new `test_no_open_cut_faces`)

**Interfaces:**
- Consumes: Task 1's `wallSpans`, `wallStations(…, sides)`; Task 2's `ARMS` (arms carry `deck`); existing `ROAD_GRID`, `segDist`, `roadDist`, `cutDepth`, `WALLS`.
- Produces: `window.__mm.openCutFaces(step = 0.5)` → `{ checked, count, open: [[x, z, depth], …] (first 30) }`.

- [ ] **Step 1: Write the failing browser test.** Add to `prototype/tests/test_underpass.py`:

```python
@needs_world
def test_no_open_cut_faces(server):
    """#120: wherever a cut network lowers the ground by more than 0.3 m outside every road corridor, a trough wall stands
    -- along the side roads and at the corners where they leave the cut road's trough."""
    r = run(server, lambda page: page.evaluate("() => window.__mm.openCutFaces()"))
    print(json.dumps(r))
    assert r["checked"] > 0, r
    assert r["count"] == 0, r
```

- [ ] **Step 2: Add the debug hook and run the test to see it fail.** Next to `window.__mm.walls` add:

```js
// #120: points the cuts lower by > 0.3 m outside every road corridor (hw + margin) that no trough wall covers -- should be none
window.__mm.openCutFaces = (step = 0.5) => {
  const out = []; let checked = 0;
  for (const a of ARMS) {
    const [x0, z0, x1, z1] = a.bounds, walls = WALLS.filter((w) => w.x > x0 - 3 && w.x < x1 + 3 && w.z > z0 - 3 && w.z < z1 + 3);
    for (let x = x0; x <= x1; x += step) for (let z = z0; z <= z1; z += step) {
      const d = cutDepth(x, z); if (d <= 0.3 || roadDist(x, z, 16) < UNDERPASS.margin) continue;
      checked++;
      if (!walls.some((w) => { const dx = x - w.x, dz = z - w.z, c = Math.cos(w.rot), s = Math.sin(w.rot); return Math.abs(dx * c + dz * s) <= w.len / 2 + 0.3 && Math.abs(-dx * s + dz * c) <= UNDERPASS.wall / 2 + 0.3; })) out.push([+x.toFixed(1), +z.toFixed(1), +d.toFixed(2)]);
    }
  }
  return { checked, count: out.length, open: out.slice(0, 30) };
};
```

Run: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_underpass.py::test_no_open_cut_faces -q -s -p no:cacheprovider`. Expected: FAIL with open points at the corners where side roads leave the trough (the per-piece `inSideRoad` skip drops whole 2 m pieces).

- [ ] **Step 3: Implement.** In the import on line 241 add `wallSpans,` after `wallStations,`. In the trough-wall block, replace the comment, the `inSideRoad` line and the `for (const [road, cuts] of byRoad) { … }` loop with:

```js
  // #119/#120 trough walls: along every road with a cut or an arm, a stone wall with its face at hw + margin, from the floor
  // to 1 m over the ground behind it (parapet); where a deck passes over the piece itself (not over the road's centre line --
  // at a skewed crossing those are metres apart) up to that deck's underside there and no parapet. Per side, the run stops
  // where its centre line reaches another road's wall face, so a side road enters through a gap and the walls meet at the
  // corner. Solid, but `low`: a car above the top passes over.
  const deckOver = (arms, x, z) => { let best = null; for (const c of arms) { const n = nearestOnPolyline(c.deck.r.pts, x, z); if (!best || n.d < best.n.d) best = { c, n }; } return best; };
  const otherRoad = (road) => (x, z) => [...gridQuery(ROAD_GRID, x, z, 8)].some(({ r, i }) => r !== road && segDist(x, z, ...r.pts[i], ...r.pts[i + 1]) < r.w / 2 + UNDERPASS.margin);
  const byRoad = new Map(); for (const a of ARMS) { if (!byRoad.has(a.road)) byRoad.set(a.road, []); byRoad.get(a.road).push(a); }
  for (const [road, arms] of byRoad) {
    const hw = road.w / 2, inner = hw + UNDERPASS.margin, off = inner + UNDERPASS.wall / 2, spans = arms.map((a) => [a.t - a.reach[0], a.t + a.reach[1]]);
    for (const side of [-1, 1]) for (const w of wallStations(road.pts, wallSpans(road.pts, spans, off, side, otherRoad(road)), off, 2, [side])) {
      const [rx, rz] = pointAtLength(road.pts, w.t), floor = terrainH(rx + w.nx * (inner - 0.25), rz + w.nz * (inner - 0.25)), ground = meshH(rx + w.nx * (inner + UNDERPASS.wall + 0.5), rz + w.nz * (inner + UNDERPASS.wall + 0.5));
      if (ground - floor <= 0.1) continue;
      const dk = deckOver(arms, w.x, w.z), under = dk.n.d <= dk.c.deck.hw + w.len / 2, deckTop = bridgeSurfaceAt(dk.c.deck, dk.n.t);
      const top = under ? Math.min(Math.max(ground, deckTop - UNDERPASS.deck), deckTop - 0.3) : ground + 1;   // under a deck: inside its stone box even where the hillside tops the deck
      box(w.len + 0.05, top - floor, UNDERPASS.wall, w.x, floor, w.z, w.rot, col('#b8b2a6'), 'stone', [4, 3], 0);
      pushOBB({ x: w.x, z: w.z, hw: w.len / 2, hd: UNDERPASS.wall / 2, c: Math.cos(w.rot), s: Math.sin(w.rot), h: top, low: true });
      WALLS.push({ x: w.x, z: w.z, nx: w.nx, nz: w.nz, rot: w.rot, len: w.len, side: w.side, floor, top, under: !!under });
    }
  }
```

(This replaces the Task 2 one-line `byRoad` change; keep exactly one `byRoad`.)

- [ ] **Step 4: Run the wall tests.** Run, one call each: `test_no_open_cut_faces`, `test_trough_walls`, `test_walls_follow_skewed_decks_and_leave_side_roads_open`. Expected: PASS. If `test_no_open_cut_faces` still lists points: print them, check whether they sit at a corner (raise nothing — trim at `r.w / 2 + UNDERPASS.margin + 0.25` instead and re-run the three tests; the "no wall in a road's corridor" assertion must stay green). Stop after 3 attempts and report.

- [ ] **Step 5: Commit and push.**

```bash
git add prototype/index.html prototype/tests/test_underpass.py
git commit -m "feat(world): trough walls along side-road arms meet at the corners (#120)"
git push
```

---

### Task 4: Regression, changelog, PR

**Files:**
- Modify: `CHANGELOG.md` (the railway-bridge entry under `[Unreleased]` → `Added`)

- [ ] **Step 1: Targeted regression**, one call each, foreground, capped as in Global Constraints:
  - `node --test prototype/tests/*.test.mjs`
  - `prototype/tests/test_underpass.py` (whole file, all 6 tests)
  - `prototype/tests/test_smoke.py::test_osm_layout`, `test_smoke.py::test_grass_and_fields_stay_below_the_road`, `test_smoke.py::test_wheels_do_not_sink_into_the_road`, `test_smoke.py::test_no_trees_on_the_railway`
  - `prototype/tests/test_tree_collision.py::test_no_tree_reaches_a_road`
  Expected: all pass. A failure here is fixed in the implementation.

- [ ] **Step 2: CHANGELOG.** In the `[Unreleased]` railway-bridge entry ("Railway bridges are real now: …"), replace the sentence `Where a side street turns off right next to the bridge, the underpass is lower — mind your roof.` with `Side streets that turn off right next to the bridge dip down into the underpass with it, between their own walls.` (the entry is not released yet, so it is edited in place, not added again).

- [ ] **Step 3: Commit, push, PR.**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): side streets dip into rail underpasses (#120)"
git push
```

Open the PR `feat(world): side roads descend into rail underpass cuts` with `Closes #120`, pasting the `test_every_underpass_has_headroom` crossing list (with `arms`) and the `test_side_roads_descend_with_the_cut` arm list into **Testing**.

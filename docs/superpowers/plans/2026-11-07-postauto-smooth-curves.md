# Postauto smooth, wide curves (#710): implementation plan

**Goal:** the Postauto follows a smoothed driving line (about 10 m radius in a 90 degree bend) instead of the raw polyline corners; stops land exactly where they do today.

**Spec:** [docs/superpowers/specs/2026-11-07-postauto-smooth-curves-design.md](../specs/2026-11-07-postauto-smooth-curves-design.md)

**Global constraints:**
- Buildless; all new code in `postauto.js` (pure, no DOM, no three.js). Do not touch `route.js`, `index.html`, or the autopilot / traffic.
- Tests: `node --test tests/postauto.test.mjs`, then full `node --test tests/`. **No Playwright test** (`index.html` unchanged; `busPose(route, s)` keeps its signature).
- Small functions, one level of abstraction each; no flag arguments.
- CHANGELOG entry under `[Unreleased]` -> `### Changed` (add the heading if missing), player voice, timestamp `TZ=Europe/Zurich date '+%F %H:%M'`.
- Commit after each task (Conventional Commits, `Closes #710` on the last one).

### Task 1: the driving line (`driveLine`, `drivePoint`, `lanePoint`)

**Files:** `postauto.js`, `tests/postauto.test.mjs`

**Interfaces:**
- `PA` gains `smoothHalf: 10, smoothStopFree: 8, smoothStopFull: 20` (metres; comment `// #710`).
- `driveLine(pts, cum, stopS, cfg = PA) -> { pts }`: one point per metre of original arc length `s` (index = `s`), each the mean of the original polyline over `s - smoothHalf .. s + smoothHalf` (indices clamped to the ends), blended with the original point by `w = smooth(clamp((near - smoothStopFree) / (smoothStopFull - smoothStopFree), 0, 1))`, where `near` = distance in `s` to the nearest stop, the route start or the route end (`w = 0` means the original point).
- `drivePoint(drive, s) -> [x, z]`: linear interpolation by index, `s` clamped to the line.
- `lanePoint(route, s, cfg = PA) -> [x, z]`: `drivePoint(route.drive, s)` moved `busOffset(route, s, cfg)` metres right of the local direction (`drivePoint` at `s - 1` and `s + 1`), the same maths as `rightOf` in `route.js:61-66`.

- [ ] **Write the failing test** (append to `tests/postauto.test.mjs`; add `driveLine, drivePoint, lanePoint` to the `postauto.js` import and a new line `import { rightOf } from '../route.js';`; the existing `import { buildGraph } from '../route.js';` can be merged with it):

```js
// #710: the bus swings through bends on a smoothed driving line
const bendRoute = (pts, stops = []) => { const rd = road(pts); return busRoute({ id: 9, line: '133', pts, stops }, [rd], buildGraph([rd])); };
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// the smallest radius the bus's heading change implies, metres, over [from, to]
const minRadius = (route, from, to) => {
  let worst = 0;
  for (let s = from; s < to; s += 0.25) worst = Math.max(worst, Math.abs(wrapA(busPose(route, s + 0.25).th - busPose(route, s).th)) / 0.25);
  return 1 / worst;
};
const oldLane = (route, s) => rightOf(route.pts, route.cum, s, busOffset(route, s));

test('driveLine_RightAngleCorner_RadiusAtLeast8AndCutsAtMost4_5m', () => {
  const R1 = bendRoute([[0, 0], [100, 0], [100, 100]]);   // east, then south: a right turn
  assert.ok(minRadius(R1, 60, 140) >= 8, `radius ${minRadius(R1, 60, 140)}`);
  let cut = 0;
  for (let s = 60; s < 140; s += 0.5) { const [x, z] = lanePoint(R1, s), [ox, oz] = oldLane(R1, s); cut = Math.max(cut, Math.hypot(x - ox, z - oz)); }
  assert.ok(cut > 1 && cut <= 4.5, `cut ${cut}`);
});

test('driveLine_ClusterOfShortLegs_RadiusAtLeast8', () => {
  const R2 = bendRoute([[0, 0], [100, 0], [104.4, 4.4], [104.4, 30], [104.4, 130]]);   // 45 degrees, 6 m, 45 degrees
  assert.ok(minRadius(R2, 60, 150) >= 8, `radius ${minRadius(R2, 60, 150)}`);
});

test('driveLine_StraightRoad_PoseUnchanged', () => {
  for (const s of [20, 250, 500, 777]) {
    const [x, z] = lanePoint(R, s), [ox, oz] = oldLane(R, s);
    assert.ok(near(x, ox) && near(z, oz), `s ${s}`);
  }
});

test('driveLine_StopBesideCorner_PoseAtStopUnchanged', () => {
  const st = { uic: '1', name: 'S1', s: 105, x: 97, z: 105, rot: 0 };   // 5 m after the corner, kerb right of southward travel
  const R3 = bendRoute([[0, 0], [100, 0], [100, 100], [100, 300]], [st]);
  const [x, z] = lanePoint(R3, 105), [ox, oz] = oldLane(R3, 105);
  assert.ok(Math.hypot(x - ox, z - oz) <= 0.1);
  assert.ok(near(R3.stopS.get('1'), 105));
});
```

- [ ] **Run it, expect failure** (`driveLine` / `lanePoint` not exported): `node --test tests/postauto.test.mjs`.

- [ ] **Implement** in `postauto.js`, directly after `busOffset`:

```js
// ---------- the driving line (#710): the centre line with its corners rounded, so a 12 m bus swings through bends ----------
// one point per metre of original arc length s: the mean of the polyline over s +- smoothHalf (a box filter: a 90 degree
// corner becomes a bend of about smoothHalf metres radius, clusters of short legs included). Stops and the route ends keep
// the original line: the weight rises from 0 at smoothStopFree to 1 at smoothStopFull metres of s away.
function resampled(pts, cum) {
  const len = cum[cum.length - 1], out = [];
  let i = 0;
  for (let k = 0; k <= Math.floor(len) + 1; k++) {
    const s = Math.min(k, len);
    while (i < pts.length - 2 && cum[i + 1] < s) i++;
    const u = clamp((s - cum[i]) / ((cum[i + 1] - cum[i]) || 1), 0, 1);
    out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u]);
  }
  return out;
}

export function driveLine(pts, cum, stopS, cfg = PA) {
  const base = resampled(pts, cum), last = base.length - 1, len = cum[cum.length - 1], half = Math.round(cfg.smoothHalf);
  const span = cfg.smoothStopFull - cfg.smoothStopFree;
  const out = base.map((o, k) => {
    const near = Math.min(k, len - k, ...stopS.map((q) => Math.abs(q - k))), w = smooth(clamp((near - cfg.smoothStopFree) / span, 0, 1));
    if (w === 0) return o;
    let ax = 0, az = 0;
    for (let q = -half; q <= half; q++) { const p = base[clamp(k + q, 0, last)]; ax += p[0]; az += p[1]; }
    const n = 2 * half + 1;
    return [o[0] + w * (ax / n - o[0]), o[1] + w * (az / n - o[1])];
  });
  return { pts: out };
}

export function drivePoint(drive, s) {
  const f = clamp(s, 0, drive.pts.length - 1), i = Math.min(Math.floor(f), drive.pts.length - 2), u = f - i, a = drive.pts[i], b = drive.pts[i + 1];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

// the lane point the bus is drawn on: busOffset metres right of the driving line's direction of travel
export function lanePoint(route, s, cfg = PA) {
  const p = drivePoint(route.drive, s), off = busOffset(route, s, cfg);
  if (!off) return p;
  const a = drivePoint(route.drive, s - 1), b = drivePoint(route.drive, s + 1), dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  return len ? [p[0] - (dz / len) * off, p[1] + (dx / len) * off] : p;
}
```

- [ ] Add the `PA` keys: `smoothHalf: 10, smoothStopFree: 8, smoothStopFull: 20,   // #710`.

- [ ] In `busRoute`, after the line `route.stopS = ...`, add `route.drive = driveLine(pts, cum, route.stops.map((st) => st.s), cfg);`.

- [ ] **Run the tests.** The bend tests must pass. If a measured radius lands between 7 and 8 m, raise `PA.smoothHalf` (try 12) rather than lowering the 8 m bar; re-check the 4.5 m cut bound with the new value (move the bound up only together with the spec's 3.8 m measurement, note it in the PR).

- [ ] Commit: `feat(postauto): precomputed smoothed driving line (#710)`.

### Task 2: use the driving line for the pose and the obstacle check

**Files:** `postauto.js`, `tests/postauto.test.mjs`

**Interfaces:** `busPose(route, s, cfg)` and `obstacleGap(route, s, player, cfg)` keep their signatures; both take the lane point from `lanePoint`.

- [ ] **Write the failing test** (append):

```js
test('busPose_InABend_SwingsInsideThePolylineCorner', () => {
  const R4 = bendRoute([[0, 0], [100, 0], [100, 100]]);
  const p = busPose(R4, 100), [ox, oz] = oldLane(R4, 100);   // at the polyline corner a smoothed bus is well inside it
  assert.ok(Math.hypot(p.x - ox, p.z - oz) > 1.5, `pose ${p.x}, ${p.z}`);
});

test('obstacleGap_InABend_FollowsTheBusLane', () => {
  const R5 = bendRoute([[0, 0], [100, 0], [100, 100]]);
  const [lx, lz] = lanePoint(R5, 105);   // a player standing exactly on the bus's lane, ahead
  assert.ok(obstacleGap(R5, 90, { x: lx, z: lz, r: 1 }) !== null);
});
```

- [ ] **Run, expect the first to fail** (the pose is still on the polyline).

- [ ] **Implement:** replace `busPose`'s body so it uses `lanePoint`:

```js
export function busPose(route, s, cfg = PA) {
  const [x, z] = lanePoint(route, s, cfg), a = lanePoint(route, s - 3, cfg), b = lanePoint(route, s + 3, cfg);
  return { x, z, th: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}
```

and in `obstacleGap` replace `const [lx, lz] = rightOf(route.pts, route.cum, tr.s, busOffset(route, tr.s, cfg));` with `const [lx, lz] = lanePoint(route, tr.s, cfg);`. `rightOf` is then unused in `postauto.js`: remove it from the `./route.js` import (an orphan this change created).

- [ ] **Run:** `node --test tests/postauto.test.mjs` (all existing tests stay green, including `busPose: on the right of travel`), then the full `node --test tests/`.

- [ ] Commit: `feat(postauto): bus pose and obstacle gap follow the driving line (#710)`.

### Task 3: changelog and final check

**Files:** `CHANGELOG.md`

- [ ] Get the timestamp: `TZ=Europe/Zurich date '+%F %H:%M'`.
- [ ] Under `## [Unreleased]`, add a `### Changed` heading above `### Added` if there is none, and this entry (player voice, newest first):

```markdown
- `<timestamp>` **Postautos** no longer cut bends at sharp angles: like a real 12 m bus they now **swing wide** through corners and junctions on a smooth curve. Stops are unchanged.
```

- [ ] Run `node --test tests/` once more, expect all green.
- [ ] Commit: `feat(postauto): smooth wide curves for Postautos` with the footer `Closes #710`.

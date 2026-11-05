# Autopilot right lane Implementation Plan (#678)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` syntax.

**Goal:** The autopilot steers on the right lane instead of the OSM centre line, with reusable helpers in `route.js`.

**Architecture:** Pure helpers `laneOffset`, `rightOf`, `routeLaneOffset` in `route.js`; `steerToward` aims at the offset look-ahead point. Route, tracking, signals and speed stay on the centre line.

**Tech Stack:** Vanilla ES modules, `node --test tests/route.test.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-05-autopilot-right-lane-design.md`.

## Dependency

**Lands after #679** (oneway and lanes per road in the world file). Check that #679 is merged to `main` and read its contract (`pipeline/world_roads.py`, `docs/11-pipeline-osm.md`). If the road record property names differ from `oneway` (boolean) and `lanes` (integer), change them in `laneOffset` (Task 1) and in the test calls only. If #679 is not merged, stop and report; do not invent the fields.

## Global Constraints

- Buildless, no new dependency. Only `route.js`, `tests/route.test.mjs`, `CHANGELOG.md` change.
- TDD: the failing test first; never change a test to make it green.
- `trackRoute`, `targetSpeed`, `routeSignals`, `autoStep` and `buildGraph` stay unchanged.
- Helpers are pure and take plain data (`pts`, `cum`, road record) so #500 and #364 can reuse them.

## Task 1: `laneOffset` and `rightOf`

**Files:** Modify `route.js` (`AUTO`, new exports after `pointAt`), Test `tests/route.test.mjs`.

- [ ] **Step 1: Write the failing test.** Add `cumulative, laneOffset, rightOf, routeLaneOffset` to the import line of `tests/route.test.mjs`, then append:

```js
test('laneOffset: half a lane to the right on a two-way road, capped; none on oneway, roundabouts and links', () => {
  assert.equal(laneOffset(road([[0, 0], [10, 0]], 'residential', { w: 6 })), 1.5);
  assert.equal(laneOffset(road([[0, 0], [10, 0]], 'primary', { w: 12, lanes: 4 })), 1.5);
  assert.equal(laneOffset(road([[0, 0], [10, 0]], 'primary', { w: 20 })), 2);
  assert.equal(laneOffset(road([[0, 0], [10, 0]], 'residential', { oneway: true })), 0);
  assert.equal(laneOffset(road([[0, 0], [10, 0]], 'primary_link')), 0);
  assert.equal(laneOffset(road([[0, 0], [10, 0]], 'residential', { w: 0 })), 0);
  const ring = Array.from({ length: 13 }, (_, i) => [15 * Math.cos(i * Math.PI / 6), 15 * Math.sin(i * Math.PI / 6)]);
  ring[12] = [...ring[0]];
  assert.equal(laneOffset(road(ring)), 0);
});

test('rightOf moves a point to the right of the direction of travel (east -> south, west -> north)', () => {
  const east = [[0, 0], [100, 0]], west = [[100, 0], [0, 0]];
  const [ex, ez] = rightOf(east, cumulative(east), 50, 1.5);
  assert.ok(near(ex, 50) && near(ez, 1.5));
  const [wx, wz] = rightOf(west, cumulative(west), 50, 1.5);
  assert.ok(near(wx, 50) && near(wz, -1.5));
  assert.deepEqual(rightOf(east, cumulative(east), 50, 0), [50, 0]);
});
```

- [ ] **Step 2: Run** `node --test tests/route.test.mjs`; the new tests fail (not exported).
- [ ] **Step 3: Implement.** In `AUTO` add `laneOffsetMax: 2, laneBlend: 8,`. After `pointAt` add:

```js
// Metres to the right of a road's centre line where a car drives: the centre of the innermost right lane.
// Oneway roads, roundabouts and ramps (*_link) have no opposite lane, so 0. Reused by Postautos (#500) and traffic (#364).
export function laneOffset(r) {
  if (!(r.w > 0) || r.oneway || r.cls.endsWith('_link') || isRoundabout(r)) return 0;
  return Math.min(AUTO.laneOffsetMax, r.w / (2 * (r.lanes > 0 ? r.lanes : 2)));
}

// The point on a polyline at s, moved off metres to the right of the local direction of travel (x east, z south)
export function rightOf(pts, cum, s, off) {
  const p = pointAt(pts, cum, s);
  if (!off) return p;
  const a = pointAt(pts, cum, s - 1), b = pointAt(pts, cum, s + 1), dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  return len ? [p[0] - (dz / len) * off, p[1] + (dx / len) * off] : p;
}
```

- [ ] **Step 4: Run** the test file; green. Commit `feat(route): lane offset helpers (#678)`.

## Task 2: `routeLaneOffset` blended across road changes

**Files:** Modify `route.js` (directly below `segAt`), Test `tests/route.test.mjs`.

- [ ] **Step 1: Write the failing test.**

```js
test('routeLaneOffset: per-road offset, blended across a change of road without a jump', () => {
  const g = buildGraph([road([[-100, 0], [0, 0]], 'residential', { w: 6 }), road([[0, 0], [100, 0]], 'residential', { w: 6, oneway: true })]);
  const r = findRoute(g, snapToGraph(g, -90, 0), [snapToGraph(g, 90, 0)]);
  assert.equal(routeLaneOffset(r, 20), 1.5);
  assert.equal(routeLaneOffset(r, 170), 0);
  const mid = routeLaneOffset(r, 90); // the junction is at s = 90 (the route starts at x = -90)
  assert.ok(mid > 0 && mid < 1.5);
  let prev = routeLaneOffset(r, 75);
  for (let s = 76; s < 105; s++) { const o = routeLaneOffset(r, s); assert.ok(Math.abs(o - prev) < 0.2); prev = o; }
});
```

- [ ] **Step 2: Run, confirm it fails.**
- [ ] **Step 3: Implement** below `segAt`:

```js
// Lane offset at progress s on a route: the mean of the road offsets over AUTO.laneBlend either side, so it slides across junctions
export function routeLaneOffset(route, s) {
  let sum = 0, n = 0;
  for (let q = s - AUTO.laneBlend; q <= s + AUTO.laneBlend + 1e-9; q += AUTO.laneBlend / 4) {
    sum += laneOffset(route.road[segAt(route, clamp(q, 0, route.len))]);
    n++;
  }
  return sum / n;
}
```

- [ ] **Step 4: Run, green. Commit.**

## Task 3: `steerToward` aims at the lane

**Files:** Modify `route.js` `steerToward` (`route.js:254-258`), Test `tests/route.test.mjs`.

- [ ] **Step 1: Write the failing test.**

```js
test('steerToward aims at the right lane: a car on the lane centre steers less than one on the centre line', () => {
  const g = buildGraph([road([[-200, 0], [200, 0]], 'residential', { w: 6 })]);
  const r = findRoute(g, snapToGraph(g, -150, 0), [snapToGraph(g, 150, 0)]);
  const onCentre = steerToward(r, 100, -50, 0, 0, 10), inLane = steerToward(r, 100, -50, 1.5, 0, 10);
  assert.ok(onCentre.steer > 0.01);
  assert.ok(Math.abs(inLane.steer) < Math.abs(onCentre.steer));
  const back = findRoute(g, snapToGraph(g, 150, 0), [snapToGraph(g, -150, 0)]);
  assert.ok(steerToward(back, 100, 50, 0, Math.PI, 10).steer > 0.01);
});
```

(Heading east the target lies at z > 0, which is to the right, so `alpha > 0` and `steer > 0`; heading west the target lies at z < 0, again to the right.)

- [ ] **Step 2: Run, confirm it fails.**
- [ ] **Step 3: Implement.** In `steerToward` replace the target with `const s2 = s + look, p = rightOf(route.pts, route.cum, s2, routeLaneOffset(route, s2)), alpha = wrap(Math.atan2(p[1] - z, p[0] - x) - th);`.
- [ ] **Step 4: Run** `node --test tests/*.test.mjs`. The existing `steerToward`, `autoStep` and `targetSpeed` tests must stay green unchanged; if one fails, fix the implementation, not the test.
- [ ] **Step 5: Commit** `fix(route): autopilot steers on the right lane (#678)`.

## Task 4: Changelog

- [ ] Under `## [Unreleased]` add (create `### Fixed` if missing), in player voice: "The autopilot now drives on the **right-hand side** of the road instead of in the middle; on one-way streets, ramps and roundabouts it keeps to the middle." Commit `docs(changelog): autopilot right lane (#678)`.

## Verification

`node --test tests/*.test.mjs` all green. No browser run needed (pure module; the cause is known).

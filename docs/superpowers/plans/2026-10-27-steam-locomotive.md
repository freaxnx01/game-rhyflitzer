# Steam Locomotive on the Rails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On foot, board a black Swiss steam locomotive at Bahnhof Sisseln with Z, drive it along the real track network with W/S, choose switches with Q/E, see it smoke and hear it chuff and whistle, and get out with Z.

**Architecture:**
- A third mode `TRAIN`, beside on foot (`FOOT`) and the helicopter (`FLY`).
- `prototype/train.js` is pure: the track graph from the OSM rail polylines, the switches, the ride along an edge and the chuff rate. It is fully node-tested.
- `prototype/loco.js` holds the loco's numbers (pure, node-tested), and `prototype/locomesh.js` builds its three.js group.
- `index.html` wires it up: placement, Z, the loop, P, camera, smoke, sound, HUD and keys. It writes the loco's pose into `P` each frame, so the map, compass and HUD keep working, as `stepFly` does for the heli.

**Tech Stack:** buildless ES modules and three.js r170 (import map in `prototype/index.html`), Web Audio, `node --test`, Playwright (pytest).

**Spec:** [docs/superpowers/specs/2026-10-27-steam-locomotive-design.md](../specs/2026-10-27-steam-locomotive-design.md)

## Global Constraints

- **Getting in:** the loco stands at Bahnhof Sisseln (`anchors.landmarks.stationSisseln`, about (1854, 686)). Z on foot boards it when within 2.5 m (`WALKER.enterReach`) of its 18.6 × 3 m footprint and nearer than the car. Z in the loco gets out beside the cab. It is not in "Choose car".
- **Driving:** accel 1.0 m/s², top 22.2 m/s (80 km/h), coast 0.05 m/s², brake 1.2 m/s², reverse at most 6.94 m/s (25 km/h). No steering.
- **Switches:**
  - With no choice the loco takes the straightest branch.
  - Q is left and E is right, for the next diverging switch ahead; the choice resets after that switch.
  - Coming from the converging side there is no choice.
- **Buffer stop:** a dead end stops the loco 2 m before the end. The braking zone (`endBrakeDist` 210 m ≥ top²/(2·brake) ≈ 205 m) lets it slow down smoothly, never abruptly. It shows one toast "Gleisende" / "End of the track".
- **Model:**
  - Own low-poly model after an SBB A 3/5, a Swiss 4-6-0 with a separate tender. It has a black boiler, red spoked driving wheels (r 0.89 m), rods, a cab, a chimney, and a coal tender.
  - It is 18.6 × 3.0 × 4.3 m.
  - No SBB logo and no real running number.
- **Smoke:** a light grey puff pool of 48 sprites, puffs from the chimney, `chuffsPerRev` 4, and an idle trickle of 0.6/s.
- **Sound:**
  - The car engine is off in the train (`off: true`, PR#480).
  - Chuffs play while moving.
  - H plays a two-tone whistle.
  - M mutes as everywhere.
- **Camera:** C toggles chase (14 m back, 5 m up) and cab view.
- **Keys:**
  - In the train: Q/E pick the switch, H whistles, C changes the camera, R puts the loco back at Sisseln.
  - Blocked: F, X, U, O, I, L, 1, V, Enter.
  - Anything that calls `resetCar` (J, the map, the beam, Start) ends the train mode.
- **i18n:** every new string goes in `de` and `en` (`prototype/strings.js`). Write real umlauts, never transliteration.
- **Constraints:** no new packages or bundler. Changelog entries are in the player's voice under `[Unreleased] → Added`.

## Review Focus

1. **The parked car reacts to the loco moving `P`.**
   - Expected: the car mesh, its shadow and its wheels stay put.
   - Pinned in Task 4: the car mesh does not move while driving the loco.
2. **A walker who never boards sees no change.**
   - Expected: Z near the car still gets in, and Z far from both says "walk back".
   - Pinned in Task 4: getting in the car with the loco far away is unchanged.
3. **Degenerate rail data.**
   - Inputs: polylines with fewer than 2 points, zero length, or duplicate points.
   - Expected: the game must still load, skipping them.
   - Pinned in Task 1: `buildTrackGraph_DegeneratePolylines_SkippedNotThrown`.
4. **Reversing through a switch.**
   - Expected: S back over a Y follows the straightest branch and never jumps edges.
   - Pinned in Task 2: `stepTrain_ReversingOverASwitch_FollowsTheStraightBranch`.
5. **Leaving the train by J or the map beam.**
   - Expected: you end up in the car at the new spot, the train mode is off, and the loco stays where it was.
   - Pinned in Task 4: J/reset ends the train mode.

---

### Task 1: Track graph and switches (`train.js`, part 1)

**Files:**
- Create: `prototype/train.js`
- Test: `prototype/tests/train.test.mjs`

**Interfaces:**
- Produces:
  - `TRAIN_CFG`
  - `buildTrackGraph(polylines, cfg) → { nodes: [{id, x, z, ends: [{edge, end}]}], edges: [{id, pts, cum, len, a, b}], skipped }`
  - `outHeading(g, {edge, end}, cfg) → radians`
  - `branchesAt(g, node, arrived, inHeading, cfg) → [{edge, end, turn}]`
  - `pickBranch(branches, choice) → branch | null`
  - `nodeAhead(g, st) → {node, arrived, dist}`
  - `enter(g, st, branch) → st`
  - `nearestOnGraph(g, x, z) → {edge, s, dist}`
  - `divergingApproaches(g, back, cfg) → [{edge, s, dir, node, left, right, straight}]`
  - `wrap(a)`

- [ ] **Step 1: Write the failing tests**

```js
// prototype/tests/train.test.mjs
// #462: the steam loco's track graph, switches and ride. A synthetic network: a trunk east to a Y switch at (100, 0) with a straight
// leg, a right leg (towards +z = south) and a left leg (towards -z), plus a long straight with a buffer stop for the physics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRAIN_CFG, buildTrackGraph, outHeading, branchesAt, pickBranch, nodeAhead, nearestOnGraph, divergingApproaches, wrap } from '../train.js';

const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const TRUNK = [[0, 0], [50, 0], [100, 0]], STRAIGHT = [[100, 0], [200, 0]], RIGHT = [[100.8, 0.5], [150, 30], [200, 60]], LEFT = [[100, 0], [150, -20], [200, -40]];
const yGraph = () => buildTrackGraph([TRUNK, STRAIGHT, RIGHT, LEFT]);
const arriveHeading = (g, arrived) => wrap(outHeading(g, arrived) + Math.PI);

test('buildTrackGraph_EndsWithinSnap_MergeIntoOneNode', () => {
  const g = yGraph();
  assert.equal(g.edges.length, 4);
  const y = g.nodes.find(n => n.ends.length === 4);
  assert.ok(y, 'the Y node joins the trunk end and the three legs (the right leg starts 0.94 m away)');
  assert.equal(g.nodes.length, 5);   // trunk start, Y, and the three leg ends
  close(g.edges[0].len, 100, 1e-9);
});

test('buildTrackGraph_DegeneratePolylines_SkippedNotThrown', () => {
  const g = buildTrackGraph([[[0, 0]], [], [[5, 5], [5, 5]], [[0, 0], [0, 0], [10, 0]]]);
  assert.equal(g.skipped, 3);
  assert.equal(g.edges.length, 1);
  assert.deepEqual(g.edges[0].pts, [[0, 0], [10, 0]], 'duplicate points dropped');
});

test('pickBranch_FromTheTrunk_StraightLeftRight', () => {
  const g = yGraph(), arrived = { edge: 0, end: 1 }, y = g.edges[0].b;
  const br = branchesAt(g, y, arrived, arriveHeading(g, arrived));
  assert.equal(br.length, 3);
  assert.equal(pickBranch(br, 0).edge, 1, 'straight');
  assert.equal(pickBranch(br, -1).edge, 3, 'left = towards -z');
  assert.equal(pickBranch(br, +1).edge, 2, 'right = towards +z');
});

test('pickBranch_FromTheConvergingSide_NoChoice', () => {
  const g = yGraph(), arrived = { edge: 2, end: 0 }, y = g.edges[2].a;   // coming back down the right leg towards the Y
  const br = branchesAt(g, y, arrived, arriveHeading(g, arrived));
  assert.equal(br.length, 1, 'only the trunk lies ahead');
  assert.equal(pickBranch(br, -1).edge, 0);
  assert.equal(pickBranch(br, +1).edge, 0);
});

test('pickBranch_DeadEnd_Null', () => {
  const g = yGraph(), arrived = { edge: 1, end: 1 };
  assert.equal(pickBranch(branchesAt(g, g.edges[1].b, arrived, arriveHeading(g, arrived)), 0), null);
});

test('nodeAhead_FollowsTheMotionNotTheFacing', () => {
  const g = yGraph();
  assert.deepEqual(nodeAhead(g, { edge: 0, s: 30, dir: 1, v: 5 }), { node: g.edges[0].b, arrived: { edge: 0, end: 1 }, dist: 70 });
  assert.deepEqual(nodeAhead(g, { edge: 0, s: 30, dir: 1, v: -2 }), { node: g.edges[0].a, arrived: { edge: 0, end: 0 }, dist: 30 });
});

test('nearestOnGraph_PointBesideTheTrunk', () => {
  const n = nearestOnGraph(yGraph(), 50, 3);
  assert.equal(n.edge, 0); close(n.s, 50, 1e-9); close(n.dist, 3, 1e-9);
});

test('divergingApproaches_OnlyFromTheTrunkSide', () => {
  const a = divergingApproaches(yGraph(), 30);
  assert.equal(a.length, 1);
  assert.deepEqual(a[0], { edge: 0, s: 70, dir: 1, node: yGraph().edges[0].b, left: 3, right: 2, straight: 1 });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test prototype/tests/train.test.mjs`
Expected: FAIL, `Cannot find module '../train.js'`.

- [ ] **Step 3: Write the implementation**

```js
// prototype/train.js
// #462: the steam locomotive on the rails -- the track graph, the switches and the ride. Pure (no three.js, no DOM); node --test.
// Frame as the car: x east, z south, metres. A heading th points along (cos th, sin th), so a positive turn (east → south) is RIGHT.
// state st = { edge, s, dir, v, choice, atEnd }: s metres along the edge from pts[0]; dir +1 = the loco faces towards the last point,
// -1 = towards the first; v signed speed along the facing (negative = reversing); choice -1 left / 0 straight / +1 right for the next
// diverging switch; atEnd = standing at a buffer stop (the toast was shown).
export const TRAIN_CFG = { snap: 1.5, accel: 1.0, top: 22.2, coast: 0.05, brake: 1.2, reverseMax: 6.94, endBrakeDist: 210, endGap: 2,
  wheelR: 0.89, chuffsPerRev: 4, idleChuff: 0.6, length: 18.6, width: 3, aheadAngle: Math.PI / 2, look: 5, switchLook: 400 };

export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const dist2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const motion = (st) => (st.v < 0 ? -1 : 1) * st.dir;

// nodes = polyline ends merged within cfg.snap; edges = the polylines. Degenerate polylines (< 2 distinct points) are skipped, never thrown:
// the world file must not stop the game from loading.
export function buildTrackGraph(polylines, cfg = TRAIN_CFG) {
  const nodes = [], edges = [];
  let skipped = 0;
  const nodeAt = (p) => {
    let n = nodes.find(q => Math.hypot(q.x - p[0], q.z - p[1]) <= cfg.snap);
    if (!n) { n = { id: nodes.length, x: p[0], z: p[1], ends: [] }; nodes.push(n); }
    return n;
  };
  for (const raw of polylines) {
    const pts = [];
    for (const p of Array.isArray(raw) ? raw : []) if (!pts.length || dist2(pts[pts.length - 1], p) > 1e-6) pts.push(p);
    if (pts.length < 2) { skipped++; continue; }
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist2(pts[i - 1], pts[i]));
    const a = nodeAt(pts[0]), b = nodeAt(pts[pts.length - 1]), e = { id: edges.length, pts, cum, len: cum[cum.length - 1], a: a.id, b: b.id };
    a.ends.push({ edge: e.id, end: 0 }); b.ends.push({ edge: e.id, end: 1 });
    edges.push(e);
  }
  return { nodes, edges, skipped };
}

// the heading leaving the node into this edge end, measured to the first point cfg.look metres in (ignores a short first segment's kink)
export function outHeading(g, { edge, end }, cfg = TRAIN_CFG) {
  const p = g.edges[edge].pts, n = p.length, from = end === 0 ? p[0] : p[n - 1];
  let to = from;
  for (let i = 1; i < n; i++) { to = end === 0 ? p[i] : p[n - 1 - i]; if (dist2(from, to) >= cfg.look) break; }
  return Math.atan2(to[1] - from[1], to[0] - from[0]);
}

// the edge ends at a node that continue ahead (turn under cfg.aheadAngle) when arriving through `arrived` with heading inHeading
export function branchesAt(g, node, arrived, inHeading, cfg = TRAIN_CFG) {
  return g.nodes[node].ends
    .filter(x => !(arrived && x.edge === arrived.edge && x.end === arrived.end))
    .map(x => ({ ...x, turn: wrap(outHeading(g, x, cfg) - inHeading) }))
    .filter(x => Math.abs(x.turn) < cfg.aheadAngle);
}

// choice 0 or a single branch: the straightest; -1 the leftmost (most negative turn); +1 the rightmost; none: null (buffer stop)
export function pickBranch(branches, choice = 0) {
  if (!branches.length) return null;
  if (branches.length === 1 || !choice) return branches.reduce((m, x) => Math.abs(x.turn) < Math.abs(m.turn) ? x : m);
  return branches.reduce((m, x) => (choice > 0 ? x.turn > m.turn : x.turn < m.turn) ? x : m);
}

// the node the loco is moving towards (by the sign of v, the facing when standing) and the metres to it
export function nodeAhead(g, st) {
  const e = g.edges[st.edge];
  return motion(st) > 0 ? { node: e.b, arrived: { edge: e.id, end: 1 }, dist: e.len - st.s } : { node: e.a, arrived: { edge: e.id, end: 0 }, dist: st.s };
}

// onto a branch at its node end, keeping the direction of motion (and so whether the loco runs forward or in reverse)
export function enter(g, st, b) {
  const sgn = st.v < 0 ? -1 : 1, m = b.end === 0 ? 1 : -1;
  return { ...st, edge: b.edge, s: b.end === 0 ? 0 : g.edges[b.edge].len, dir: m * sgn };
}

export function nearestOnGraph(g, x, z) {
  let best = null;
  for (const e of g.edges) for (let i = 0; i < e.pts.length - 1; i++) {
    const a = e.pts[i], b = e.pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)), d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (!best || d < best.dist) best = { edge: e.id, s: e.cum[i] + Math.sqrt(L2) * t, dist: d };
  }
  return best;
}

// every way into a diverging switch: a state `back` metres before the node, moving towards it, and which edge each choice takes (tests)
export function divergingApproaches(g, back, cfg = TRAIN_CFG) {
  const out = [];
  for (const e of g.edges) for (const end of [0, 1]) {
    if (e.len <= back) continue;
    const arrived = { edge: e.id, end }, node = end === 1 ? e.b : e.a;
    const br = branchesAt(g, node, arrived, wrap(outHeading(g, arrived, cfg) + Math.PI), cfg);
    if (br.length < 2) continue;
    out.push({ edge: e.id, s: end === 1 ? e.len - back : back, dir: end === 1 ? 1 : -1, node,
      left: pickBranch(br, -1).edge, right: pickBranch(br, 1).edge, straight: pickBranch(br, 0).edge });
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test prototype/tests/train.test.mjs`
Expected: 8 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add prototype/train.js prototype/tests/train.test.mjs
git commit -m "feat(train): track graph and switch choice for the steam loco (#462)"
```

### Task 2: The ride (`train.js`, part 2)

**Files:**
- Modify: `prototype/train.js` (append)
- Test: `prototype/tests/train.test.mjs` (append)

**Interfaces:**
- Consumes (Task 1): `TRAIN_CFG`, `buildTrackGraph`, `outHeading`, `branchesAt`, `pickBranch`, `nodeAhead`, `enter`, `wrap`.
- Produces:
  - `trainInput(keys) → {throttle, brake}`
  - `speedStep(v, input, dt, cfg) → v`
  - `distToEnd(g, st, cfg) → metres | Infinity`
  - `nextSwitch(g, st, cfg) → {node, dist, branches} | null`
  - `stepTrain(st, input, g, dt, cfg) → {state, events}`
  - `poseAt(g, st) → {x, z, th}`
  - `chuffEmit(acc, v, dt, cfg) → {acc, n}`
  - `trainKeyAction(code) → 'left'|'right'|'whistle'|'reset'|'camera'|'block'|'pass'`

- [ ] **Step 1: Write the failing tests** (append to `prototype/tests/train.test.mjs`; extend the import line with `trainInput, speedStep, distToEnd, nextSwitch, stepTrain, poseAt, chuffEmit, trainKeyAction`)

```js
const LINE = () => buildTrackGraph([[[0, 0], [300, 0]]]);   // one edge, both ends buffer stops
const run = (g, st, input, secs, dt = 1 / 60) => { const events = []; for (let i = 0; i < Math.round(secs / dt); i++) { const r = stepTrain(st, input, g, dt); st = r.state; events.push(...r.events); } return { st, events }; };
const ST = (o) => ({ edge: 0, s: 10, dir: 1, v: 0, choice: 0, atEnd: false, ...o });
const NONE = { throttle: 0, brake: 0 }, GAS = { throttle: 1, brake: 0 }, BRAKE = { throttle: 0, brake: 1 };

test('trainInput_WAndS_ThrottleAndBrake', () => {
  assert.deepEqual(trainInput({ KeyW: true }), { throttle: 1, brake: 0 });
  assert.deepEqual(trainInput({ ArrowDown: true }), { throttle: 0, brake: 1 });
  assert.deepEqual(trainInput({}), { throttle: 0, brake: 0 });
});

test('speedStep_Throttle_AcceleratesToTop', () => {
  let v = 0; for (let i = 0; i < 60 * 60; i++) v = speedStep(v, GAS, 1 / 60);
  close(v, TRAIN_CFG.top, 1e-9);
  close(speedStep(0, GAS, 5), 5 * TRAIN_CFG.accel, 1e-9);
});

test('speedStep_NoInput_CoastsSlowly', () => {
  close(speedStep(10, NONE, 10), 10 - 10 * TRAIN_CFG.coast, 1e-9);
  assert.equal(speedStep(0.01, NONE, 1), 0);
});

test('speedStep_BrakeHeld_StopsThenReversesToTheCap', () => {
  let v = 10; for (let i = 0; i < 60 * 30; i++) v = speedStep(v, BRAKE, 1 / 60);
  close(v, -TRAIN_CFG.reverseMax, 1e-9);
});

test('stepTrain_Throttle_MovesAlongTheEdge', () => {
  const { st } = run(LINE(), ST(), GAS, 5);
  close(st.v, 5, 0.02); close(st.s, 10 + 12.5, 0.2); assert.equal(st.edge, 0);
});

test('stepTrain_CoastingToABufferStop_Stops2mBeforeTheEnd_OneEvent', () => {
  const { st, events } = run(LINE(), ST({ s: 200, v: 20 }), NONE, 30);
  assert.equal(st.v, 0); close(st.s, 298, 0.1); assert.equal(st.atEnd, true);
  assert.deepEqual(events, [{ type: 'trackEnd' }]);
  const again = run(LINE(), st, GAS, 3);
  assert.deepEqual(again.events, [], 'throttle into the buffer stop: no second toast');
  close(again.st.s, 298, 0.1);
  const back = run(LINE(), st, BRAKE, 5);
  assert.ok(back.st.s < 290 && back.st.atEnd === false, 'reversing away is free');
});

test('stepTrain_ChoiceLeftThroughTheY_TakesTheLeftLegAndResets', () => {
  const { st } = run(yGraph(), ST({ s: 80, v: 10, choice: -1 }), NONE, 4);
  assert.equal(st.edge, 3); assert.equal(st.choice, 0); assert.equal(st.dir, 1);
});

test('stepTrain_NoChoiceThroughTheY_GoesStraight', () => {
  const { st } = run(yGraph(), ST({ s: 80, v: 10 }), NONE, 4);
  assert.equal(st.edge, 1);
});

test('stepTrain_ReversingOverASwitch_FollowsTheStraightBranch', () => {
  // on the straight leg facing east (dir +1), reversing (v < 0) = moving west, back over the Y onto the trunk
  const g = yGraph();
  const { st } = run(g, { edge: 1, s: 20, dir: 1, v: -6, choice: 0, atEnd: false }, NONE, 6);
  assert.equal(st.edge, 0, 'backed over the Y onto the trunk');
  assert.ok(st.v < 0 && st.dir === 1, 'still facing east, still reversing');
  const p = poseAt(g, st); close(p.z, 0, 1e-9);
});

test('poseAt_FacingFollowsDir', () => {
  const g = yGraph();
  const f = poseAt(g, ST({ s: 50 })), b = poseAt(g, ST({ s: 50, dir: -1 }));
  close(f.x, 50, 1e-9); close(f.z, 0, 1e-9); close(f.th, 0, 1e-9); close(Math.abs(b.th), Math.PI, 1e-9);
});

test('distToEnd_And_nextSwitch', () => {
  assert.equal(distToEnd(LINE(), ST({ s: 280, v: 1 })), 20);
  assert.equal(distToEnd(LINE(), ST({ s: 50, v: 1 })), Infinity, 'beyond endBrakeDist + endGap (212 m)');
  const n = nextSwitch(yGraph(), ST({ s: 70, v: 3 }));
  close(n.dist, 30, 1e-9); assert.equal(n.branches.length, 3);
  assert.equal(nextSwitch(yGraph(), { edge: 1, s: 50, dir: -1, v: 3, choice: 0 }), null, 'westbound on the straight leg: the Y converges');
});

test('chuffEmit_RateFollowsTheWheels_TrickleAtRest', () => {
  assert.deepEqual(chuffEmit(0, 0, 1), { acc: TRAIN_CFG.idleChuff, n: 0 });
  const oneRev = 2 * Math.PI * TRAIN_CFG.wheelR;
  assert.equal(chuffEmit(0, oneRev, 1).n, TRAIN_CFG.chuffsPerRev);
  assert.equal(chuffEmit(0, -oneRev, 1).n, TRAIN_CFG.chuffsPerRev, 'reversing chuffs too');
});

test('trainKeyAction_SwitchWhistleResetCamera_CarKeysBlocked', () => {
  assert.equal(trainKeyAction('KeyQ'), 'left'); assert.equal(trainKeyAction('KeyE'), 'right');
  assert.equal(trainKeyAction('KeyH'), 'whistle'); assert.equal(trainKeyAction('KeyR'), 'reset'); assert.equal(trainKeyAction('KeyC'), 'camera');
  for (const k of ['KeyF', 'KeyX', 'KeyU', 'KeyO', 'KeyI', 'KeyL', 'Digit1', 'KeyV', 'Enter', 'NumpadEnter']) assert.equal(trainKeyAction(k), 'block', k);
  for (const k of ['KeyW', 'KeyS', 'KeyM', 'KeyJ', 'KeyT', 'Tab', 'F1', 'Escape']) assert.equal(trainKeyAction(k), 'pass', k);
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `node --test prototype/tests/train.test.mjs`
Expected: the Task 1 tests pass, and the new tests fail with `does not provide an export named 'trainInput'`.

- [ ] **Step 3: Write the implementation** (append to `prototype/train.js`)

```js
export const trainInput = (keys) => ({ throttle: keys.KeyW || keys.ArrowUp ? 1 : 0, brake: keys.KeyS || keys.ArrowDown ? 1 : 0 });

// heavy and slow: steam up to top, a long coast, the brake stops and (held at rest) reverses up to reverseMax; throttle while reversing brakes first
export function speedStep(v, input, dt, cfg = TRAIN_CFG) {
  if (input.brake) return v > 0 ? Math.max(0, v - cfg.brake * dt) : Math.max(-cfg.reverseMax, v - cfg.accel * dt);
  if (input.throttle) return v < 0 ? Math.min(0, v + cfg.brake * dt) : Math.min(cfg.top, v + cfg.accel * dt);
  return v > 0 ? Math.max(0, v - cfg.coast * dt) : Math.min(0, v + cfg.coast * dt);
}

// the track ahead in the direction of motion, node by node: the choice at the first diverging switch, straight after it
function* trackAhead(g, st, cfg) {
  let cur = st, choice = st.choice || 0, total = 0;
  for (let guard = 0; guard < 256; guard++) {
    const nx = nodeAhead(g, cur);
    total += nx.dist;
    const br = branchesAt(g, nx.node, nx.arrived, wrap(outHeading(g, nx.arrived, cfg) + Math.PI), cfg);
    yield { node: nx.node, dist: total, branches: br };
    const pick = pickBranch(br, br.length > 1 ? choice : 0);
    if (!pick) return;
    if (br.length > 1) choice = 0;
    cur = enter(g, cur, pick);
  }
}

export function distToEnd(g, st, cfg = TRAIN_CFG) {
  for (const n of trackAhead(g, st, cfg)) {
    if (n.dist > cfg.endBrakeDist + cfg.endGap) return Infinity;
    if (!n.branches.length) return n.dist;
  }
  return Infinity;
}

export function nextSwitch(g, st, cfg = TRAIN_CFG) {
  for (const n of trackAhead(g, st, cfg)) {
    if (n.dist > cfg.switchLook) return null;
    if (n.branches.length > 1) return n;
  }
  return null;
}

// d >= 0 metres along the motion, across nodes (the choice applies at the first diverging switch and resets there)
function advance(g, st, d, cfg) {
  let cur = st;
  for (let guard = 0; guard < 64; guard++) {
    const nx = nodeAhead(g, cur), m = motion(cur);
    if (d <= nx.dist) return { ...cur, s: cur.s + m * d };
    d -= nx.dist;
    const br = branchesAt(g, nx.node, nx.arrived, wrap(outHeading(g, nx.arrived, cfg) + Math.PI), cfg), pick = pickBranch(br, br.length > 1 ? cur.choice : 0);
    if (!pick) return { ...cur, s: m > 0 ? g.edges[cur.edge].len : 0 };
    cur = { ...enter(g, cur, pick), choice: br.length > 1 ? 0 : cur.choice };
  }
  return cur;
}

// one step: speed, then the buffer-stop cap (stop endGap metres before a dead end ahead, one 'trackEnd' event), then the move
export function stepTrain(st, input, g, dt, cfg = TRAIN_CFG) {
  let v = speedStep(st.v, input, dt, cfg);
  const events = [], room = distToEnd(g, { ...st, v }, cfg) - cfg.endGap;
  if (v !== 0 && room !== Infinity) v = Math.sign(v) * Math.min(Math.abs(v), Math.sqrt(2 * cfg.brake * Math.max(0, room)));
  if (v !== 0 && room <= 0.05) {
    if (!st.atEnd) events.push({ type: 'trackEnd' });
    return { state: { ...st, v: 0, atEnd: true }, events };
  }
  const moved = advance(g, { ...st, v }, Math.min(Math.abs(v) * dt, Math.max(0, room)), cfg);
  return { state: { ...moved, atEnd: v === 0 ? st.atEnd : false }, events };
}

export function poseAt(g, st) {
  const e = g.edges[st.edge], s = Math.min(Math.max(st.s, 0), e.len);
  let lo = 0, hi = e.cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (e.cum[mid] <= s) lo = mid; else hi = mid; }
  const a = e.pts[lo], b = e.pts[hi], t = (s - e.cum[lo]) / (e.cum[hi] - e.cum[lo]);
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, th: wrap(Math.atan2(b[1] - a[1], b[0] - a[0]) + (st.dir < 0 ? Math.PI : 0)) };
}

// chuffs (a smoke puff and a steam sound each) per second: chuffsPerRev per driving-wheel turn, an idle trickle at rest
export function chuffEmit(acc, v, dt, cfg = TRAIN_CFG) {
  const rate = Math.max(cfg.idleChuff, Math.abs(v) / (2 * Math.PI * cfg.wheelR) * cfg.chuffsPerRev), total = acc + rate * dt, n = Math.floor(total);
  return { acc: total - n, n };
}

// keydown in the loco: Q/E the next switch, H the whistle, R back to Sisseln, C the camera; the car's own keys are swallowed
const TRAIN_KEYS = { KeyQ: 'left', KeyE: 'right', KeyH: 'whistle', KeyR: 'reset', KeyC: 'camera' };
const TRAIN_BLOCKED = new Set(['KeyF', 'KeyX', 'KeyU', 'KeyO', 'KeyI', 'KeyL', 'Digit1', 'KeyV', 'Enter', 'NumpadEnter']);
export function trainKeyAction(code) { return TRAIN_KEYS[code] ?? (TRAIN_BLOCKED.has(code) ? 'block' : 'pass'); }
```

The reversing test sets the state as facing east (`dir: 1`) on the straight leg with `v < 0`, so the motion is west, back over the Y. If it fails, re-read `enter`: the new `dir` is `(end === 0 ? 1 : -1) * sign(v)`. Arriving at the trunk's end 1 while moving west gives `m = -1`, and with `sign(v) = -1` that is `dir = +1`. The loco still faces east.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test prototype/tests/train.test.mjs`
Expected: 21 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add prototype/train.js prototype/tests/train.test.mjs
git commit -m "feat(train): steam loco ride, buffer stops, chuffs and keys (#462)"
```

### Task 3: The locomotive model (`loco.js` + `locomesh.js`)

Design work: run this task on **Fable** (the repo's rule for new graphics). The numbers below are the floor. Fable may refine the shapes and colours, but must keep the exported names, the overall size within ±0.2 m, and the frame.

**Files:**
- Create: `prototype/loco.js` (pure numbers)
- Create: `prototype/locomesh.js` (three.js builder, not node-tested, like `friesmesh.js`)
- Test: `prototype/tests/loco.test.mjs`

**Interfaces:**
- Produces:
  - `LOCO` (numbers, model metres: x forward, y up, z right; origin on the rail top at mid-length; the front buffer at `+length/2`)
  - `wheelTurn(dist, r) → radians`
  - `rodOffset(angle, crank) → [dx, dy]`
  - `buildLoco() → THREE.Group` with `userData = { drivers: Mesh[], small: Mesh[], rods: Mesh[], chimney: [x, y, z], cab: [x, y, z] }`

- [ ] **Step 1: Write the failing test**

```js
// prototype/tests/loco.test.mjs
// #462: the steam loco's numbers (an SBB A 3/5-like 4-6-0 with tender); locomesh.js draws from them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCO, wheelTurn, rodOffset } from '../loco.js';
import { TRAIN_CFG } from '../train.js';
const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);

test('LOCO_Size_18_6x3x4_3_AndMatchesTheRide', () => {
  close(LOCO.length, 18.6, 1e-9); close(LOCO.width, 3.0, 1e-9); close(LOCO.height, 4.3, 1e-9);
  close(LOCO.length, TRAIN_CFG.length, 1e-9, 'the ride and the model agree on the footprint');
  close(LOCO.driverR, TRAIN_CFG.wheelR, 1e-9, 'chuffs follow the drawn driving wheels');
});

test('LOCO_Parts_InsideTheEnvelope', () => {
  assert.equal(LOCO.drivers.length, 3); assert.equal(LOCO.bogie.length, 2); assert.equal(LOCO.tenderWheels.length, 3);
  for (const x of [...LOCO.drivers, ...LOCO.bogie, ...LOCO.tenderWheels]) assert.ok(Math.abs(x) < LOCO.length / 2, `wheel at ${x}`);
  close(LOCO.chimney[1], LOCO.height, 1e-9, 'the chimney is the top');
  assert.ok(LOCO.chimney[0] > LOCO.drivers[0], 'the chimney is ahead of the drivers');
  assert.ok(LOCO.cab[0] < LOCO.drivers[2] + 1 && LOCO.cab[0] > LOCO.tenderFront, 'the cab eye sits in the cab');
});

test('wheelTurn_And_rodOffset', () => {
  close(wheelTurn(2 * Math.PI * 0.89, 0.89), 2 * Math.PI, 1e-9);
  const [dx, dy] = rodOffset(Math.PI / 2, 0.35); close(dx, 0, 1e-9); close(dy, 0.35, 1e-9);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test prototype/tests/loco.test.mjs`
Expected: FAIL, `Cannot find module '../loco.js'`.

- [ ] **Step 3: Write `prototype/loco.js`**

```js
// #462: the steam locomotive's numbers -- after an SBB A 3/5 (a Swiss 4-6-0 with a separate tender), no logo, no real number.
// Model metres: x forward, y up, z right; origin on the rail top at mid-length; the front buffer at +length/2. locomesh.js draws these.
export const LOCO = {
  length: 18.6, width: 3.0, height: 4.3,
  front: 9.3, tenderFront: -2.4, rear: -9.3,                // loco frame from tenderFront + 0.3 to front; tender from rear to tenderFront
  drivers: [3.9, 2.0, 0.1], driverR: 0.89,                   // three coupled driving axles, red spoked wheels
  bogie: [7.6, 6.3], bogieR: 0.43,                          // the leading bogie
  tenderWheels: [-3.6, -5.6, -7.6], tenderR: 0.5,
  boiler: { x0: 0.9, x1: 8.5, r: 0.82, y: 2.75 },
  smokebox: { x0: 7.7, x1: 8.7, r: 0.88 },
  chimney: [7.9, 4.3, 0], dome: [4.6, 3.95, 0],
  cabBox: { x0: -2.1, x1: 0.9, y0: 1.4, y1: 4.0 },
  tenderBox: { x0: -9.3, x1: -2.4, y0: 1.0, y1: 3.2 },
  cab: [-0.4, 3.2, 0.75],                                   // the cab view's eye: right-hand side, looking past the boiler
  crank: 0.35, rodY: 0.9,
  colours: { body: 0x16181b, wheel: 0xb3261e, beam: 0xb3261e, roof: 0x2a2d31, coal: 0x0f0f10, brass: 0xc9a43a, frame: 0x101113 },
};
export const wheelTurn = (dist, r) => dist / r;
export const rodOffset = (angle, crank) => [crank * Math.cos(angle), crank * Math.sin(angle)];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test prototype/tests/loco.test.mjs`
Expected: 3 pass.

- [ ] **Step 5: Write `prototype/locomesh.js`**

```js
// #462: the steam loco's meshes, built from loco.js's numbers (pure and unit-tested; this file is not). One group facing +x, standing on
// the rail top; the caller sets position and rotation.y = -th like the car. userData.drivers / small spin, userData.rods follow the crank.
import * as THREE from 'three';
import { LOCO } from './loco.js';

const mat = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });
function box(g, m, x0, x1, y0, y1, w) { const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, w), m); b.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); b.castShadow = true; g.add(b); return b; }
function cylX(g, m, x0, x1, r, y) { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, x1 - x0, 20), m); c.rotation.z = Math.PI / 2; c.position.set((x0 + x1) / 2, y, 0); c.castShadow = true; g.add(c); return c; }
function cylY(g, m, x, y0, y1, r0, r1) { const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, y1 - y0, 16), m); c.position.set(x, (y0 + y1) / 2, 0); c.castShadow = true; g.add(c); return c; }
// a spoked wheel pair at x (left and right), turning about z
function wheels(g, m, x, r, list) {
  for (const side of [-1, 1]) {
    const w = new THREE.Group(), rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.9, r * 0.1, 6, 20), m);
    w.add(rim);
    for (let k = 0; k < 8; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, r * 1.8, 0.06), m); sp.rotation.z = (k * Math.PI) / 8; w.add(sp); }
    w.position.set(x, r, side * (LOCO.width / 2 - 0.35)); g.add(w); list.push(w);
  }
}

export function buildLoco() {
  const L = LOCO, C = L.colours, g = new THREE.Group(), body = mat(C.body), red = mat(C.wheel), frame = mat(C.frame);
  const drivers = [], small = [], rods = [];
  box(g, frame, L.tenderFront + 0.3, L.front, 0.9, 1.4, L.width - 0.6);                         // running frame
  box(g, mat(C.beam), L.front - 0.25, L.front, 0.7, 1.5, L.width);                              // red buffer beam
  cylX(g, body, L.boiler.x0, L.boiler.x1, L.boiler.r, L.boiler.y);                              // boiler
  cylX(g, body, L.smokebox.x0, L.smokebox.x1, L.smokebox.r, L.boiler.y);                        // smokebox
  cylY(g, body, L.chimney[0], L.boiler.y + 0.6, L.chimney[1], 0.26, 0.32);                      // chimney, flared at the top
  cylY(g, mat(C.brass), L.dome[0], L.boiler.y + 0.6, L.dome[1], 0.38, 0.3);                     // dome
  box(g, body, L.cabBox.x0, L.cabBox.x1, L.cabBox.y0, L.cabBox.y1 - 0.15, L.width);             // cab
  box(g, mat(C.roof), L.cabBox.x0 - 0.1, L.cabBox.x1 + 0.1, L.cabBox.y1 - 0.15, L.cabBox.y1, L.width + 0.1);
  box(g, body, L.tenderBox.x0, L.tenderBox.x1, L.tenderBox.y0, L.tenderBox.y1, L.width - 0.1);  // tender
  box(g, mat(C.coal), L.tenderBox.x0 + 0.6, L.tenderBox.x1 - 0.4, L.tenderBox.y1, L.tenderBox.y1 + 0.35, L.width - 0.5);
  for (const x of L.drivers) wheels(g, red, x, L.driverR, drivers);
  for (const x of L.bogie) wheels(g, red, x, L.bogieR, small);
  for (const x of L.tenderWheels) wheels(g, red, x, L.tenderR, small);
  for (const side of [-1, 1]) {   // the coupling rod over the three drivers; locomesh moves it on the crank circle
    const r = new THREE.Mesh(new THREE.BoxGeometry(L.drivers[0] - L.drivers[2], 0.12, 0.08), mat(0x8a8d90));
    r.position.set((L.drivers[0] + L.drivers[2]) / 2, L.rodY, side * (L.width / 2 - 0.2)); r.userData.home = r.position.clone(); g.add(r); rods.push(r);
  }
  g.userData = { drivers, small, rods, chimney: L.chimney, cab: L.cab };
  return g;
}
```

- [ ] **Step 6: Commit**

```bash
git add prototype/loco.js prototype/locomesh.js prototype/tests/loco.test.mjs
git commit -m "feat(train): low-poly steam locomotive with tender (#462)"
```

### Task 4: The train mode: placement, Z, the ride, the camera

**Files:**
- Modify: `prototype/index.html`
  - the imports near `import { WALKER, footInput, … } from './foot.js';`
  - after `const SMOKE = { pool: [] };` block
  - `pressZ` / `getIn`
  - `resetCar`
  - the loop line (`if (FOOT.on) stepOnFoot(dt); else if (FLY.on) …`)
  - `stepCamera`
  - `drawShadow`
  - the `window.__mm` hooks
- Modify: `prototype/strings.js` (`trainIn`, `trainOut`, `camTrainChase`, `camTrainCab`; en + de)
- Test: `prototype/tests/test_train.py`

**Interfaces:**
- Consumes:
  - Tasks 1 and 2: `buildTrackGraph`, `nearestOnGraph`, `stepTrain`, `poseAt`, `trainInput`, `TRAIN_CFG`.
  - Task 3: `buildLoco`, `LOCO`, `wheelTurn`, `rodOffset`.
  - From foot.js: `parkedBox`, `carReach`.
- Produces:
  - `TRAIN = { on, st, y, car, cam, mesh, graph, home, acc, puffs, whistles }`
  - `boardTrain()`, `leaveTrain()`, `endTrain()`, `stepTrainMode(dt)`, `trainCamera(dt)`, `locoBox()`
  - Hooks: `window.__mm.train()`, `window.__mm.trainSim(secs, hold)`, `window.__mm.trainPut(st)`, `window.__mm.trainApproaches(back)`

- [ ] **Step 1: Write the failing Playwright test**

```python
# prototype/tests/test_train.py
"""#462: the steam loco at Bahnhof Sisseln: board on foot, ride the real track, switches, smoke, sound. Slow (Playwright): foreground."""
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")


def open_world(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 960, "height": 540})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.train && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn")
    return b, page, errors


def board(page):
    """Get out of the car, walk (placed) up to the loco's cab side and press Z."""
    page.keyboard.press("z"); page.wait_for_function("() => window.__mm.foot().on", timeout=60000)
    t = page.evaluate("() => window.__mm.train()")
    side = t["th"] + math.pi / 2
    page.evaluate("([x, z]) => window.__mm.place(x, z)", [t["x"] + math.cos(side) * 3.0, t["z"] + math.sin(side) * 3.0])
    page.keyboard.press("z"); page.wait_for_function("() => window.__mm.train().on", timeout=60000)


@needs_world
def test_the_loco_stands_on_the_track_at_sisseln_and_z_boards_it(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        t0 = page.evaluate("() => window.__mm.train()")
        board(page)
        t1 = page.evaluate("() => window.__mm.train()")
        car0 = page.evaluate("() => window.__mm.carPose().pos")
        page.evaluate("() => window.__mm.trainSim(10, ['KeyW'])")
        t2 = page.evaluate("() => window.__mm.train()")
        car1 = page.evaluate("() => window.__mm.carPose().pos")
        sfx = page.evaluate("() => window.__mm.sfx()")
        page.evaluate("() => window.__mm.trainSim(8.5, ['KeyS'])")   # 10 m/s down to rest (8.33 s); Z only gets out below 0.5 m/s
        page.keyboard.press("z"); page.wait_for_function("() => !window.__mm.train().on && window.__mm.foot().on", timeout=60000)
        out = page.evaluate("() => ({ ...window.__mm.foot(), t: window.__mm.train() })")
        b.close()
    assert errors == []
    assert t0["placed"] and t0["railDist"] < 0.5 and math.hypot(t0["x"] - 1854.2, t0["z"] - 685.8) < 200, t0
    assert t1["on"] and not t1["foot"], t1
    assert math.hypot(t2["x"] - t1["x"], t2["z"] - t1["z"]) > 20 and t2["railDist"] < 0.5 and t2["kmh"] > 20, t2
    assert car0 == car1, "the parked car stays put while the loco drives"
    assert sfx["engine"] == 0, sfx
    assert out["on"] and math.hypot(out["x"] - out["t"]["x"], out["z"] - out["t"]["z"]) < 6, out


@needs_world
def test_z_near_the_car_still_gets_in_the_car(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        page.keyboard.press("z"); page.wait_for_function("() => window.__mm.foot().on", timeout=60000)
        page.keyboard.press("z"); page.wait_for_function("() => !window.__mm.foot().on", timeout=60000)
        t = page.evaluate("() => window.__mm.train()")
        b.close()
    assert errors == [] and not t["on"], t


@needs_world
def test_a_car_reset_ends_the_train_and_leaves_the_loco_where_it_stands(server):
    """J, the map, the beam and Start all go through resetCar: back in the car, the train mode off, the loco left on the track."""
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        board(page)
        page.evaluate("() => window.__mm.trainSim(8, ['KeyW'])")
        before = page.evaluate("() => window.__mm.train()")
        page.evaluate("() => window.__mm.resetCar()")
        after = page.evaluate("() => ({ t: window.__mm.train(), foot: window.__mm.foot().on })")
        b.close()
    assert errors == []
    assert not after["t"]["on"] and not after["foot"], after
    assert math.hypot(after["t"]["x"] - before["x"], after["t"]["z"] - before["z"]) < 0.5 and after["t"]["kmh"] == 0, after
```

Check whether `window.__mm.resetCar` exists (`grep -n "__mm.resetCar" prototype/index.html`). If it does not, add `window.__mm.resetCar = () => resetCar();` next to the other hooks in Step 3.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd prototype/tests && python3 -m pytest -q test_train.py`
Expected: FAIL. The `wait_for_function` times out because `window.__mm.train` is undefined.

- [ ] **Step 3: Wire the mode into `prototype/index.html`**

3a. Imports, next to the `foot.js` import:

```js
import { TRAIN_CFG, buildTrackGraph, nearestOnGraph, stepTrain, poseAt, trainInput, nextSwitch, distToEnd, chuffEmit, trainKeyAction, divergingApproaches } from './train.js';   // #462
import { LOCO, wheelTurn, rodOffset } from './loco.js';
import { buildLoco } from './locomesh.js';
```

3b. The train state and placement, after the `SMOKE` pool block (`const SMOKE = { pool: [] };` and its `{ … }` initialiser):

```js
// #462: the steam loco: a third mode beside FOOT and FLY. TRAIN.st is train.js's state on TRAIN.graph; P mirrors the loco's pose while on.
// TRAIN.car keeps the parked car's pose (FOOT.car) while you drive, so Z out and back to the car works as from foot.
const TRAIN = { on: false, st: null, y: 0, car: null, cam: 'chase', mesh: null, graph: null, home: null, acc: 0, puffs: 0, whistles: 0, ended: false };
{ TRAIN.graph = buildTrackGraph(L ? [...L.rail, ...L.railBridges.map(b => b.pts)] : [RAIL_PTS]);
  const st = anchors && anchors.landmarks && anchors.landmarks.stationSisseln, n = st && nearestOnGraph(TRAIN.graph, st.x, st.z);
  if (n && n.dist < 200) { TRAIN.home = { edge: n.edge, s: n.s, dir: 1, v: 0, choice: 0, atEnd: false };
    if (distToEnd(TRAIN.graph, TRAIN.home) !== Infinity) TRAIN.home.dir = -1;   // face away from a buffer stop near the station
    TRAIN.mesh = buildLoco(); scene.add(TRAIN.mesh); placeLoco(TRAIN.home, null); } }
function railY(x, z, prevY) { const ribbon = Math.max(terrainH(x, z), roadSurfH(x, z)) + 0.03; return prevY === null ? ribbon : Math.max(ribbon, groundH(x, z, prevY + 1.5)); }
function placeLoco(st, prevY) { TRAIN.st = { ...st }; const p = poseAt(TRAIN.graph, st); TRAIN.y = railY(p.x, p.z, prevY); TRAIN.mesh.position.set(p.x, TRAIN.y, p.z); TRAIN.mesh.rotation.set(0, -p.th, 0); return p; }
const locoBox = () => { const p = poseAt(TRAIN.graph, TRAIN.st); return parkedBox({ x: p.x, z: p.z, y: TRAIN.y, th: p.th }, { l: LOCO.length, w: LOCO.width, h: LOCO.height }); };
```

How the world anchors are reached differs in this file. Find where `stationAt(at(k).x, …)` reads them (`grep -n "stationSisseln" prototype/index.html`) and use the same accessor instead of `anchors.landmarks`. If it is the local `at(k)` helper, compute `TRAIN.home` right after that loop, where `at` is in scope.

3c. Z: replace `function pressZ() { if (FOOT.on) getIn(); else getOut(); }` with:

```js
function pressZ() { if (TRAIN.on) leaveTrain(); else if (FOOT.on) { if (nearLoco()) boardTrain(); else getIn(); } else getOut(); }
// #462: the loco wins over the car only when it is in reach and nearer than the car
function nearLoco() { if (!TRAIN.mesh) return false; const d = carReach(P.x, P.z, locoBox()); return d <= WALKER.enterReach && d < carReach(P.x, P.z, parked()); }
function boardTrain() { TRAIN.car = FOOT.car; FOOT.on = false; if (document.pointerLockElement) document.exitPointerLock(); TRAIN.on = true; TRAIN.cam = 'chase'; syncTrainP(); toast(tr('trainIn')); }
function leaveTrain() {
  if (Math.abs(TRAIN.st.v) >= 0.5) { toast(tr('footStopFirst')); return; }
  const p = poseAt(TRAIN.graph, TRAIN.st), side = p.th + Math.PI / 2, x = p.x + Math.cos(side) * (LOCO.width / 2 + 1.2), z = p.z + Math.sin(side) * (LOCO.width / 2 + 1.2);
  TRAIN.on = false; Object.assign(FOOT, { on: true, hover: false, vy: 0, pitch: 0, stride: 0, car: TRAIN.car }); TRAIN.car = null;
  P.x = x; P.z = z; P.y = groundH(x, z, TRAIN.y + 1); P.vx = P.vz = P.vy = 0; P.th = p.th; toast(tr('trainOut'));
}
// resetCar (R in the car, J, the map, the beam, Start) leaves the loco where it stands and puts you back in the car
function endTrain() { if (!TRAIN.on) return; TRAIN.on = false; TRAIN.car = null; TRAIN.st = { ...TRAIN.st, v: 0 }; }
function syncTrainP() { const p = poseAt(TRAIN.graph, TRAIN.st); P.x = p.x; P.z = p.z; P.y = TRAIN.y; P.th = p.th; P.vx = Math.cos(p.th) * TRAIN.st.v; P.vz = Math.sin(p.th) * TRAIN.st.v; P.vy = 0; P.gas = 0; P.nitro = 0; }
function stepTrainMode(dt) {
  const r = stepTrain(TRAIN.st, trainInput(keys), TRAIN.graph, dt), turn = wheelTurn(Math.abs(r.state.v) * dt, LOCO.driverR) * Math.sign(r.state.v || 1);
  placeLoco(r.state, TRAIN.y);
  for (const w of TRAIN.mesh.userData.drivers) w.rotation.z -= turn;
  for (const w of TRAIN.mesh.userData.small) w.rotation.z -= turn * LOCO.driverR / (w.position.y);
  const a = -TRAIN.mesh.userData.drivers[0].rotation.z, [dx, dy] = rodOffset(a, LOCO.crank);
  for (const rod of TRAIN.mesh.userData.rods) rod.position.set(rod.userData.home.x + dx, rod.userData.home.y + dy, rod.userData.home.z);
  syncTrainP();
}
```

In `resetCar`, call `endTrain();` right before `endFoot();`.

Notes on 3c:
- The small wheels' `position.y` equals their radius by construction (`wheels()` sets `y = r`). Dividing by it gives the same rim speed.
- `P.gas`, `P.nitro`: if `P` has no `gas` field, drop that assignment. Check first: `grep -n "P.gas" prototype/index.html`.

3d. The loop: replace `if (FOOT.on) stepOnFoot(dt); else if (FLY.on) stepFly(dt); else stepCar(dt);` with:

```js
if (FOOT.on) stepOnFoot(dt); else if (TRAIN.on) stepTrainMode(dt); else if (FLY.on) stepFly(dt); else stepCar(dt);
```

Also make `SFX.update({ … off: FOOT.on }` read `off: FOOT.on || TRAIN.on`, and make `kmh` and `gas` use `FOOT.on || TRAIN.on` where they test `FOOT.on`.

3e. Camera. In `stepCamera`:
- Change `car.visible = FOOT.on || (…)` to `car.visible = FOOT.on || TRAIN.on || (…)`. The parked car stays visible while you drive the loco.
- Insert the train branch before the heli one: `if (FOOT.on) footCamera(); else if (TRAIN.on) trainCamera(dt); else if (FLY.on) …`.

Add next to `flyCamera`:

```js
// #462: chase = behind the tender and up, looking ahead; cab = the driver's eye on the right-hand side
function trainCamera(dt) {
  const fx = Math.cos(P.th), fz = Math.sin(P.th), rx = -fz, rz = fx;
  if (TRAIN.cam === 'cab') { const [ex, ey, ez] = TRAIN.mesh.userData.cab; camPos.set(P.x + fx * ex + rx * ez, P.y + ey, P.z + fz * ex + rz * ez); camera.position.copy(camPos); camera.lookAt(P.x + fx * 60 + rx * ez, P.y + ey - 0.6, P.z + fz * 60 + rz * ez); return; }
  const target = new THREE.Vector3(P.x - fx * 14, P.y + 5, P.z - fz * 14);
  camPos.lerp(target, 1 - Math.exp(-4 * dt)); camera.position.copy(camPos); camera.lookAt(P.x + fx * 8, P.y + 2, P.z + fz * 8);
}
```

3f. Shadow: in `drawShadow`, make the first statement `shadowMesh.visible = !TRAIN.on && shadowShown(…)` (the car's blob shadow follows `P`).

3g. Strings (`prototype/strings.js`):
- `en`: `trainIn: 'All aboard! W steam, S brake, Q/E pick the next switch, H whistle, Z get out'`, `trainOut: 'Out of the locomotive'`, `camTrainChase: 'behind the train'`, `camTrainCab: 'driver's cab'`
- `de`: `trainIn: 'Einsteigen bitte! W Dampf, S bremsen, Q/E nächste Weiche wählen, H pfeifen, Z aussteigen'`, `trainOut: 'Aus der Lok ausgestiegen'`, `camTrainChase: 'hinter dem Zug'`, `camTrainCab: 'Führerstand'`

3h. Hooks, next to `window.__mm.foot`:

```js
window.__mm.train = () => { const p = TRAIN.st ? poseAt(TRAIN.graph, TRAIN.st) : { x: NaN, z: NaN, th: 0 };
  return { placed: !!TRAIN.mesh, on: TRAIN.on, foot: FOOT.on, x: p.x, z: p.z, th: p.th, y: TRAIN.y, kmh: Math.abs(TRAIN.st?.v ?? 0) * 3.6, edge: TRAIN.st?.edge, s: TRAIN.st?.s,
    choice: TRAIN.st?.choice ?? 0, atEnd: !!TRAIN.st?.atEnd, cam: TRAIN.cam, railDist: railDist(p.x, p.z), puffs: TRAIN.puffs, whistles: TRAIN.whistles,
    next: TRAIN.st ? nextSwitch(TRAIN.graph, TRAIN.st) : null }; };
window.__mm.trainSim = (secs, hold = []) => { for (const k of hold) keys[k] = true; for (let i = 0; i < secs * 60; i++) stepTrainMode(1 / 60); for (const k of hold) keys[k] = false; return window.__mm.train(); };
window.__mm.trainPut = (st) => { placeLoco({ v: 0, choice: 0, atEnd: false, ...st }, null); if (TRAIN.on) syncTrainP(); };
window.__mm.trainApproaches = (back) => divergingApproaches(TRAIN.graph, back);
```

- [ ] **Step 4: Run the tests**

Run: `node --test prototype/tests/*.test.mjs` (all pass), then `cd prototype/tests && python3 -m pytest -q test_train.py`.
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add prototype/index.html prototype/strings.js prototype/tests/test_train.py
git commit -m "feat(train): board the steam loco at Sisseln and drive it on the rails (#462)"
```

### Task 5: Keys in the loco, switch arrow, steam plate, track-end toast, help

**Files:**
- Modify: `prototype/index.html` (the keydown handler, `stepTrainMode`, `hud`, the help list, a `#switcharrow` element in `#hud`)
- Modify: `prototype/strings.js` (`trackEnd`, `steam`, `keyTrain`; en + de)
- Test: `prototype/tests/test_train.py` (append)

**Interfaces:**
- Consumes (Tasks 2 and 4): `trainKeyAction`, `nextSwitch`, `TRAIN`, `boardTrain`, `stepTrainMode`.
- Produces: `trainKey(action)`; the `#switcharrow` text `←`/`↑`/`→`.

- [ ] **Step 1: Write the failing test** (append)

```python
@needs_world
def test_q_before_a_switch_takes_the_left_branch_and_the_arrow_shows_it(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        board(page)
        appr = page.evaluate("() => window.__mm.trainApproaches(30)")
        a = next(x for x in appr if x["left"] != x["straight"])
        page.evaluate("(a) => window.__mm.trainPut({ edge: a.edge, s: a.s, dir: a.dir })", a)
        page.keyboard.press("q")
        page.wait_for_function("() => document.getElementById('switcharrow').textContent === '←'", timeout=120000)   # the HUD updates in the next frame; headless draws < 1 fps
        arrow = page.evaluate("() => document.getElementById('switcharrow').textContent")
        chose = page.evaluate("() => window.__mm.train().choice")
        page.evaluate("() => window.__mm.trainSim(12, ['KeyW'])")
        t = page.evaluate("() => window.__mm.train()")
        b.close()
    assert errors == []
    assert chose == -1 and arrow == "←", (chose, arrow)
    assert a["left"] in t["trail"], (t, a)   # the first edge after the switch was the left branch
    assert t["choice"] == 0, t


@needs_world
def test_r_puts_the_loco_back_at_sisseln(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        home = page.evaluate("() => window.__mm.train()")
        board(page)
        page.evaluate("() => window.__mm.trainSim(8, ['KeyW'])")
        page.keyboard.press("r")
        page.wait_for_function("() => window.__mm.train().kmh === 0", timeout=60000)
        back = page.evaluate("() => window.__mm.train()")
        b.close()
    assert errors == []
    assert back["on"] and math.hypot(back["x"] - home["x"], back["z"] - home["z"]) < 0.5, back
```

`t["trail"]` is the list of the last 8 edges driven (Step 3b records it), so the check holds even if the loco runs on past the left branch.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd prototype/tests && python3 -m pytest -q test_train.py -k left_branch`
Expected: FAIL, `#switcharrow` is missing.

- [ ] **Step 3: Implement**

3a. Keydown: right after the on-foot block (`if (FOOT.on) { const fa = footKeyAction(…); … }`), add:

```js
if (TRAIN.on) { const ta = trainKeyAction(e.code); if (ta !== 'pass') { e.preventDefault(); trainKey(ta); return; } }
```

And next to `boardTrain`:

```js
function trainKey(action) {
  if (action === 'left' || action === 'right') { const c = action === 'left' ? -1 : 1; TRAIN.st = { ...TRAIN.st, choice: TRAIN.st.choice === c ? 0 : c }; return; }   // pressing it again goes back to straight
  if (action === 'whistle') { SFX.whistle(); TRAIN.whistles++; return; }
  if (action === 'reset') { placeLoco(TRAIN.home, null); syncTrainP(); return; }
  if (action === 'camera') { TRAIN.cam = TRAIN.cam === 'chase' ? 'cab' : 'chase'; toast(tr('camera', tr(TRAIN.cam === 'cab' ? 'camTrainCab' : 'camTrainChase'))); }
}
```

`SFX.whistle` comes in Task 6. Until then, add a stub method `whistle() {}` to the `SFX` object so this task stands alone. Task 6 replaces it.

3b. In `stepTrainMode`, record the trail and show the toast:

```js
  if (r.state.edge !== TRAIN.st.edge) TRAIN.trail = [...(TRAIN.trail || []), r.state.edge].slice(-8);
  for (const ev of r.events) if (ev.type === 'trackEnd') toast(tr('trackEnd'), TOAST_S.event);
```

Place this as the first lines after `const r = stepTrain(…)`, before `placeLoco`. Add `trail: TRAIN.trail || []` to `__mm.train()`.

3c. HUD:
- Markup: in `#hud`, add `<div id="switcharrow" class="plate" hidden></div>` next to the gear plate.
- CSS: `#switcharrow{font:800 28px 'Barlow Condensed',sans-serif;min-width:40px;text-align:center}`.
- In `hud(dt)`, at its end:

```js
  $('switcharrow').hidden = !TRAIN.on || !nextSwitch(TRAIN.graph, TRAIN.st);
  if (TRAIN.on) { $('switcharrow').textContent = ['←', '↑', '→'][TRAIN.st.choice + 1]; $('gearn').textContent = tr('steam'); }
```

3d. Help: below the `keyEnter` line in the help list, add
`<kbd data-cmd="none">W · S · Q · E · H</kbd><span data-i18n="keyTrain">in the steam loco (Z at Bahnhof Sisseln): W steam, S brake / reverse, Q · E the next switch left · right, H whistle, C view, R back to the station</span>`.

3e. Strings:
- `en`:
  - `trackEnd: 'End of the track'`
  - `steam: 'Steam'`
  - `keyTrain`: the help text above
- `de`:
  - `trackEnd: 'Gleisende'`
  - `steam: 'Dampf'`
  - `keyTrain: 'in der Dampflok (Z am Bahnhof Sisseln): W Dampf, S bremsen / rückwärts, Q · E nächste Weiche links · rechts, H pfeifen, C Ansicht, R zurück zum Bahnhof'`

- [ ] **Step 4: Run the tests**

Run: `node --test prototype/tests/*.test.mjs`, then `cd prototype/tests && python3 -m pytest -q test_train.py`
Expected: all pass (5 Playwright).

- [ ] **Step 5: Commit**

```bash
git add prototype/index.html prototype/strings.js prototype/tests/test_train.py
git commit -m "feat(train): switch choice, steam plate, track-end toast and help (#462)"
```

### Task 6: Smoke, chuffs and the whistle

**Files:**
- Modify: `prototype/index.html` (a second puff pool next to `SMOKE`, `stepTrainMode`, the loop's `stepSmoke` call, `SFX`)
- Modify: `prototype/sound.js` (the `WHISTLE` preset)
- Test: `prototype/tests/sound.test.mjs` (append), `prototype/tests/test_train.py` (append)

**Interfaces:**
- Consumes: `chuffEmit` (Task 2), `smokeAt` (wreck.js), `playHorn` (sound.js), `TRAIN` (Task 4).
- Produces: `WHISTLE`, `TRAIN_SMOKE`, `SFX.whistle()`, `SFX.chuff()`, `emitTrainPuff()`, `stepTrainSmoke(dt)`.

- [ ] **Step 1: Write the failing tests**

Append to `prototype/tests/sound.test.mjs` (extend its import with `WHISTLE`):

```js
test('WHISTLE_TwoTones_AboveTheCarHorn', () => {
  assert.equal(WHISTLE.notes.length, 2);
  for (const f of WHISTLE.notes) assert.ok(f > 500 && f < 1500, f);
  assert.ok(WHISTLE.dur >= 1 && WHISTLE.gain > 0 && WHISTLE.gain <= 0.25);
});
```

Append to `prototype/tests/test_train.py`:

```python
@needs_world
def test_steam_smoke_rises_and_h_whistles(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        board(page)
        page.evaluate("() => window.__mm.trainSim(6, ['KeyW'])")
        t = page.evaluate("() => window.__mm.train()")
        page.keyboard.press("h"); page.wait_for_timeout(200)
        w = page.evaluate("() => window.__mm.train().whistles")
        b.close()
    assert errors == []
    assert t["puffs"] > 5, t
    assert w == 1, w
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test prototype/tests/sound.test.mjs` (FAIL: no export `WHISTLE`), then `cd prototype/tests && python3 -m pytest -q test_train.py -k smoke` (FAIL: `puffs` is 0).

- [ ] **Step 3: Implement**

`prototype/sound.js`, next to the other presets:

```js
// #462: the steam loco's whistle, two bright tones through playHorn
export const WHISTLE = { notes: [622, 740], dur: 1.4, gain: 0.2, band: 1600, wave: 'sawtooth' };
```

`index.html`:
- Import `WHISTLE` with the other `sound.js` names.
- In the `SFX` object, replace the Task 5 stub with:

```js
    whistle() { if (muted || holds.size) return; const a = ctx(); playHorn(a, a.master, WHISTLE, a.currentTime); },
    chuff() { burst(0.16, 380, 0.9, 0.18); },
```

The second puff pool goes after the `SMOKE` pool:

```js
// #462: the loco's smoke: light grey puffs from the chimney, shorter-lived and quicker to rise than the wreck's
const TRAIN_SMOKE = { smokeLife: 1.8, smokeRise: 2.4, smokeMax: 48, pool: [] };
{ const tex = SMOKE.pool[0].material.map; for (let i = 0; i < TRAIN_SMOKE.smokeMax; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xd8d8d8, transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; s.userData = { age: -1, x: 0, y0: 0, z: 0, dx: 0, dz: 0 }; scene.add(s); TRAIN_SMOKE.pool.push(s); } }
function emitTrainPuff() { const s = TRAIN_SMOKE.pool.find(p => p.userData.age < 0); if (!s) return; const [cx, cy] = TRAIN.mesh.userData.chimney, fx = Math.cos(P.th), fz = Math.sin(P.th);
  Object.assign(s.userData, { age: 0, x: P.x + fx * cx, z: P.z + fz * cx, y0: TRAIN.y + cy, dx: -fx * Math.abs(TRAIN.st.v) * 0.6, dz: -fz * Math.abs(TRAIN.st.v) * 0.6 }); TRAIN.puffs++; }
function stepTrainSmoke(dt) { for (const s of TRAIN_SMOKE.pool) { const u = s.userData; if (u.age < 0) continue; u.age += dt; const a = smokeAt(u.age, TRAIN_SMOKE); if (!a) { u.age = -1; s.visible = false; continue; } u.x += u.dx * dt; u.z += u.dz * dt; s.position.set(u.x, u.y0 + a.rise, u.z); s.scale.setScalar(a.size); s.material.opacity = a.opacity; s.visible = true; } }
```

At the end of `stepTrainMode` (after `syncTrainP()`):

```js
  const c = chuffEmit(TRAIN.acc, TRAIN.st.v, dt); TRAIN.acc = c.acc;
  for (let i = 0; i < c.n; i++) { emitTrainPuff(); if (Math.abs(TRAIN.st.v) > 0.3) SFX.chuff(); }
```

In the loop, call `stepTrainSmoke(dt);` right after `stepWreck(dt);` so the puffs keep fading after you get out. `smokeAt(age, cfg)` reads only `smokeLife` and `smokeRise` from its config, so `TRAIN_SMOKE` is a valid config.

- [ ] **Step 4: Run the tests**

Run: `node --test prototype/tests/*.test.mjs`, then `cd prototype/tests && python3 -m pytest -q test_train.py test_sound.py`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add prototype/index.html prototype/sound.js prototype/tests/sound.test.mjs prototype/tests/test_train.py
git commit -m "feat(train): steam smoke, chuffs and the whistle (#462)"
```

### Task 7: CHANGELOG and final check

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the entry** under `## [Unreleased]` → `### Added` (first line, newest first, `YYYY-MM-DD HH:MM` of the commit):

```markdown
- `YYYY-MM-DD HH:MM` **All aboard!** A black **steam locomotive** with a coal tender now stands at **Bahnhof Sisseln**. On foot, walk up to it and press **Z** to climb into the cab: **W** gives steam, **S** brakes and backs up, **Q** and **E** pick the way at the next switch (the arrow shows it), **H** blows the whistle and **C** changes the view. It puffs smoke in time with its wheels and runs the real railway along the Rhine; at the end of a siding it stops by itself. **Z** gets you out again, **R** brings it back to the station.
```

- [ ] **Step 2: Run the affected tests**

Run:
- `node --test prototype/tests/*.test.mjs` (all pass)
- `cd prototype/tests && python3 -m pytest -q test_train.py test_sound.py test_on_foot.py` (all pass)

On the agent box, run both under the memory cap: `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 …`.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): the steam locomotive at Bahnhof Sisseln (#462)"
```

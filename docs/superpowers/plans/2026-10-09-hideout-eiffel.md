# Secret Hideout in the Hübel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A plain „RESERVOIR HÜBEL" stone gate at the west end of the Hübel (Münchwilen) leads through a 105 m tunnel into a cavern inside the hill where a 33 m Eiffel Tower stands floodlit; nothing points at it, driving into the cavern reveals it with a toast, remembers the find and adds „Eiffelturm" to the **J**/**O** lists (#102).

**Architecture:** A pure module `prototype/hideout.js` (node-tested) holds the constants `HIDEOUT`/`TUNNEL`, the axis maths, the two cut descriptors (same shape as the rail underpass cuts, with their own parameter set `u`), the predicates `roofed` / `inHideout` / `inCavern`, `portalS`, `ringStations` and the Eiffel Tower as a list of primitive descriptors `eiffelParts`. `prototype/landmarks.js` learns `game: [x, z]` positions and `secret` entries. `prototype/index.html` (1) feeds the hideout cuts into the existing patch machinery (`cutFloorMin`/`buildCuts`) from a separate `HIDE_CUTS` array, (2) draws a lid of the uncut hill over the roofed part plus a dark, downward-facing ceiling copy, (3) builds walls, portal, gravel floor, lamps and the tower from primitives, (4) adds discovery, the camera ceiling clamp, the helicopter's sky ground and the test hooks.

**Tech Stack:** Vanilla JS (ES modules), three.js (`CylinderGeometry`, `TorusGeometry`, `PointLight`), `node --test`, pytest + Playwright (Chromium, SwiftShader).

**Spec:** `docs/superpowers/specs/2026-10-09-hideout-eiffel-design.md` (issue #102).

## Global Constraints

- Buildless static game: no packages, no framework, no assets (CLAUDE.md). Everything is three.js primitives; no licensed asset or logo.
- **Never push a hideout cut into `CUTS`** — `__mm.crossings` (`index.html:1307`) and the #119 wall loop (`:965`) read `c.deck`/`c.road` of every entry and `test_underpass.py` depends on them. Hideout cuts live in `HIDE_CUTS`.
- The hideout exists only when `L && REAL` (OSM world with the measured terrain). The hand layout (`open_hand` fixtures) and the made-up terrain must behave exactly as today.
- New UI text goes through `tr()` with en and de entries, Swiss spelling (`strings.test.mjs`).
- Line numbers are from `main` @ `42b68df`; re-find by the quoted code, not by number.
- CHANGELOG entries are hand-written, player-facing, English. Never `git cliff -o CHANGELOG.md`.
- Browser tests run in the **foreground**, capped: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/<file> -q -p no:cacheprovider`. Commit and push before long verification. Run only the affected browser tests (`test_hideout.py`, `test_underpass.py`, `test_jump.py`, `test_heli.py`, `test_smoke.py`), not the full suite.

## Review Focus

1. **Rail underpasses unchanged.** Expected: `test_underpass.py` green; `__mm.crossings()` has the same entries as before. Pinned by running it in Task 7.
2. **No step at the mouth.** Expected: the tunnel floor equals the ground at the mouth, so the car rolls in from the road without a kerb. Pinned by `hideoutCuts_FloorMeetsTheGroundAtTheMouth` (Task 1) and `test_drive_in_finds_the_hideout` (Task 6).
3. **The hill looks untouched from above.** Expected: the lid covers every roofed patch triangle (`lidTris > 0`) and `skyGround` over the cavern is the hill surface, not the cavern floor. Pinned by `test_floor_lid_and_tower` and `test_sky_ground_and_no_takeoff_inside` (Task 6).
4. **Secret until found.** Expected: the J list has no „Eiffelturm" on a fresh profile and has it after the drive in; the static map paints no hideout OBB. Pinned by `landmarkEntries_SecretEntries_OnlyWhenRevealed` (Task 2) and `test_drive_in_finds_the_hideout` (Task 6).
5. **Camera stays under the ceiling.** Expected: inside the cavern the chase camera's `y` is below the lid. Pinned by `test_drive_in_finds_the_hideout` (Task 6).

---

### Task 1: Pure module `hideout.js`

**Files:**
- Create: `prototype/hideout.js`
- Test: `prototype/tests/hideout.test.mjs`

**Interfaces:**
- Produces: `HIDEOUT`, `TUNNEL`, `hideoutAxis(h)`, `axisCoords(x, z, h)`, `floorAt(s, g0, h)`, `hideoutCuts(groundAt, h, u)`, `portalS(groundAt, h)`, `cavernR(h, u)`, `inCavern(x, z, h, pad)`, `roofed(x, z, portal, h, u)`, `inHideout(x, z, h)`, `ringStations(cx, cz, r, n)`, `eiffelParts(h)`.
- Consumes: `UNDERPASS` from `./world.js` (pure).

- [ ] **Step 1: Write the failing tests.** Create `prototype/tests/hideout.test.mjs`:

```js
// #102: the secret hideout in the Hübel -- pure helpers. node --test prototype/tests/hideout.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HIDEOUT, TUNNEL, hideoutAxis, axisCoords, floorAt, hideoutCuts, portalS, cavernR, inCavern, roofed, inHideout, ringStations, eiffelParts } from '../hideout.js';
import { cutFloorAt, UNDERPASS } from '../world.js';

const close = (a, b, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
// a hill like the probe: 75 m at the mouth, rising 0.5 m per metre along the axis, flat across it
const A = hideoutAxis();
const hill = (x, z) => { const { s } = axisCoords(x, z); return 75 + 0.5 * Math.max(0, s); };

test('HIDEOUT and TUNNEL: the agreed constants', () => {
  assert.deepEqual(HIDEOUT, { mouth: [-703.7, 1423.6], heading: 95 * Math.PI / 180, length: 105, hw: 4.5, grade: 0.05, cavernHw: 20, roofDepth: 5.5, towerH: 33, key: 'mm.hideout' });
  assert.deepEqual(TUNNEL, { ...UNDERPASS, grade: 0.05, maxDepth: 80 });
});

test('hideoutAxis_RunsFromTheMouth105mAt95Degrees', () => {
  close(A.centre[0], -712.8, 0.1); close(A.centre[1], 1528.2, 0.1);
  assert.deepEqual(A.pts, [A.mouth, A.centre]);
});

test('axisCoords_SignedDistanceAlongAndOffTheAxis', () => {
  const p = axisCoords(A.mouth[0] + A.ux * 30 - A.uz * 4, A.mouth[1] + A.uz * 30 + A.ux * 4);
  close(p.s, 30); close(p.d, 4);
  close(axisCoords(A.mouth[0] - A.ux * 3, A.mouth[1] - A.uz * 3).s, -3, 1e-6, 'behind the mouth is negative');
});

test('floorAt_DescendsAtTheGradeAndIsFlatPastTheCavernCentre', () => {
  close(floorAt(0, 75), 75); close(floorAt(40, 75), 73); close(floorAt(105, 75), 69.75); close(floorAt(140, 75), 69.75);
});

test('hideoutCuts_FloorMeetsTheGroundAtTheMouth', () => {
  const { tunnel, cavern, f0 } = hideoutCuts(hill);
  close(f0, 75 - 0.05 * 105);
  close(cutFloorAt(tunnel, ...A.mouth, tunnel.u), 75, 1e-6, 'no step at the mouth');
  close(cutFloorAt(tunnel, A.mouth[0] + A.ux * 50, A.mouth[1] + A.uz * 50, tunnel.u), 72.5);
  assert.equal(cutFloorAt(tunnel, A.mouth[0] + A.ux * 50 + A.uz * 9, A.mouth[1] + A.uz * 50 - A.ux * 9, tunnel.u), null, '9 m off the axis is outside hw + margin + wall/2 = 7.5');
  assert.equal(cutFloorAt(tunnel, A.mouth[0] - A.ux * 9, A.mouth[1] - A.uz * 9, tunnel.u), null, 'the road side of the mouth is not cut');
  assert.deepEqual(tunnel.reach, [105, 0]);
  assert.equal(tunnel.u, TUNNEL); assert.equal(cavern.u, TUNNEL);
  assert.ok(tunnel.depth > 50 && cavern.depth > 50, 'deep at the centre');
  close(tunnel.x, A.centre[0]); close(tunnel.z, A.centre[1]);
});

test('hideoutCuts_CavernIsAFlatDiscOfRadius22', () => {
  const { cavern, f0 } = hideoutCuts(hill), [cx, cz] = A.centre;
  for (const [dx, dz] of [[0, 0], [21, 0], [0, -21], [15, 15]]) close(cavern.f0, f0), close(cutFloorAt(cavern, cx + dx, cz + dz, cavern.u), f0, 1e-6, `${dx},${dz}`);
  assert.equal(cutFloorAt(cavern, cx + 23, cz, cavern.u), null);
  assert.equal(cavernR(), 22);
});

test('portalS_FirstWholeMetreWhereTheTrenchIsRoofDepthDeep', () => {
  assert.equal(portalS(hill), 10, '0.55 m of depth per metre: 5.5 m at s = 10');
  assert.equal(portalS(() => 0), HIDEOUT.length, 'a flat hill never roofs: the portal sits at the end');
});

test('inCavern_roofed_inHideout', () => {
  const [cx, cz] = A.centre, portal = 10;
  assert.ok(inCavern(cx + 21, cz)); assert.ok(!inCavern(cx + 23, cz)); assert.ok(inCavern(cx + 23, cz, 2));
  assert.ok(roofed(cx, cz, portal)); assert.ok(roofed(cx + 23, cz, portal), 'the ring wall is under the lid');
  assert.ok(roofed(A.mouth[0] + A.ux * 50, A.mouth[1] + A.uz * 50, portal));
  assert.ok(!roofed(A.mouth[0] + A.ux * 5, A.mouth[1] + A.uz * 5, portal), 'the open trench');
  assert.ok(!roofed(A.mouth[0] + A.ux * 50 + A.uz * 8, A.mouth[1] + A.uz * 50 - A.ux * 8, portal), '8 m off the axis is hillside');
  assert.ok(inHideout(A.mouth[0] + A.ux * 5, A.mouth[1] + A.uz * 5), 'trees stay out of the trench');
  assert.ok(inHideout(cx + 25, cz)); assert.ok(!inHideout(cx + 27, cz)); assert.ok(!inHideout(A.mouth[0] - A.ux * 6, A.mouth[1] - A.uz * 6));
});

test('ringStations_24TangentPiecesAroundTheCircle', () => {
  const r = ringStations(0, 0, 23, 24);
  assert.equal(r.length, 24);
  for (const s of r) { close(Math.hypot(s.x, s.z), 23); close(s.len, 2 * Math.PI * 23 / 24 + 0.05); close(Math.abs(Math.cos(s.rot) * s.x + Math.sin(s.rot) * s.z), 0, 1e-6, 'the long axis is tangent'); }
});

test('eiffelParts_33mTallFourLeggedAndSymmetric', () => {
  const parts = eiffelParts(33), legs = parts.filter(p => p.kind === 'leg' && p.r0 > 0.2);
  assert.equal(legs.length, 12, '4 legs x 3 segments');
  assert.equal(parts.filter(p => p.kind === 'leg' && p.r0 <= 0.2).length, 16, 'X braces: 2 per face on 2 storeys');
  assert.equal(parts.filter(p => p.kind === 'box').length, 3);
  assert.equal(parts.filter(p => p.kind === 'arch').length, 4);
  const spire = parts.find(p => p.kind === 'spire'); close(spire.y1, 33); close(spire.y0, 27.6);
  const feet = legs.filter(p => p.from[1] === 0).map(p => p.from); assert.equal(feet.length, 4);
  for (const f of feet) { close(Math.abs(f[0]), 6.25); close(Math.abs(f[2]), 6.25); }
  for (const p of parts) if (p.kind === 'leg') assert.ok(Math.max(Math.abs(p.from[0]), Math.abs(p.to[0]), Math.abs(p.from[2]), Math.abs(p.to[2])) <= 6.25 + 1e-9, 'inside the base square');
  const half = eiffelParts(16.5); close(half.find(p => p.kind === 'spire').y1, 16.5, 1e-6, 'scales with h');
});
```

- [ ] **Step 2: Run them, expect failure.** `node --test prototype/tests/hideout.test.mjs` → `Cannot find module '../hideout.js'`.

- [ ] **Step 3: Implement `prototype/hideout.js`.**

```js
// #102: the secret hideout in the Hübel -- pure helpers (no three.js, no DOM): the tunnel axis, the two cut descriptors (the rail
// underpass model of world.js with its own parameter set), the roofed / tree-free predicates, the cavern ring and the Eiffel
// Tower as primitive descriptors. Unit-tested with `node --test prototype/tests/hideout.test.mjs`.
import { UNDERPASS, cutReach } from './world.js';

// mouth = the hill-side edge of the Hübel (centre line [-703.3, 1419.1] + w/2 + margin), heading = the steepest rise (probe 2026-10-09)
export const HIDEOUT = { mouth: [-703.7, 1423.6], heading: 95 * Math.PI / 180, length: 105, hw: 4.5, grade: 0.05, cavernHw: 20, roofDepth: 5.5, towerH: 33, key: 'mm.hideout' };
export const TUNNEL = { ...UNDERPASS, grade: 0.05, maxDepth: 80 };

export function hideoutAxis(h = HIDEOUT) {
  const ux = Math.cos(h.heading), uz = Math.sin(h.heading), mouth = [h.mouth[0], h.mouth[1]], centre = [mouth[0] + ux * h.length, mouth[1] + uz * h.length];
  return { ux, uz, mouth, centre, pts: [mouth, centre] };
}
// s = metres along the axis from the mouth (negative on the road side), d = metres off it
export function axisCoords(x, z, h = HIDEOUT) {
  const a = hideoutAxis(h), dx = x - a.mouth[0], dz = z - a.mouth[1];
  return { s: dx * a.ux + dz * a.uz, d: Math.abs(-dx * a.uz + dz * a.ux) };
}
// the floor: ground at the mouth (g0), down the grade to the cavern centre, flat from there
export function floorAt(s, g0, h = HIDEOUT) { return g0 - h.grade * Math.min(Math.max(0, s), h.length); }

// Two cuts in the shape makeCut() builds (index.html): the tunnel polyline mouth -> centre with its deepest point (t) at the
// centre, and a 0.1 m polyline through the centre whose hw makes cutFloorAt a flat disc of radius cavernR.
export function hideoutCuts(groundAt, h = HIDEOUT, u = TUNNEL) {
  const a = hideoutAxis(h), g0 = groundAt(a.mouth[0], a.mouth[1]), f0 = floorAt(h.length, g0, h), depth = groundAt(a.centre[0], a.centre[1]) - f0;
  const tunnel = { pts: a.pts, t: h.length, hw: h.hw, flat: 0, f0, u, x: a.centre[0], z: a.centre[1], capped: null, depth };
  tunnel.reach = [cutReach(tunnel, (s) => groundAt(a.centre[0] + a.ux * s, a.centre[1] + a.uz * s), u)[0], 0];
  const [cx, cz] = a.centre, e = 0.05;
  const cavern = { pts: [[cx - a.ux * e, cz - a.uz * e], [cx + a.ux * e, cz + a.uz * e]], t: e, hw: h.cavernHw, flat: 1, f0, u, x: cx, z: cz, capped: null, depth, reach: [1, 1] };
  return { tunnel, cavern, f0 };
}
// first whole metre along the axis where the trench is roofDepth deep: the portal stands there, the lid starts behind it
export function portalS(groundAt, h = HIDEOUT) {
  const a = hideoutAxis(h), g0 = groundAt(a.mouth[0], a.mouth[1]);
  for (let s = 0; s <= h.length; s++) if (groundAt(a.mouth[0] + a.ux * s, a.mouth[1] + a.uz * s) - floorAt(s, g0, h) >= h.roofDepth) return s;
  return h.length;
}
export function cavernR(h = HIDEOUT, u = TUNNEL) { return h.cavernHw + u.margin + u.wall / 2; }
export function inCavern(x, z, h = HIDEOUT, pad = 0) { const a = hideoutAxis(h); return Math.hypot(x - a.centre[0], z - a.centre[1]) <= cavernR(h) + pad; }
// under the lid: the cavern disc up to the outside of its ring wall, or the tunnel corridor from the portal on
export function roofed(x, z, portal, h = HIDEOUT, u = TUNNEL) {
  if (inCavern(x, z, h, u.wall)) return true;
  const { s, d } = axisCoords(x, z, h);
  return d <= h.hw + u.margin + u.wall / 2 && s >= portal && s <= h.length;
}
// where no tree may grow: the trench and tunnel corridor with 10 m to spare, the cavern with 4 m
export function inHideout(x, z, h = HIDEOUT) {
  if (inCavern(x, z, h, 4)) return true;
  const { s, d } = axisCoords(x, z, h);
  return d <= 10 && s >= -4 && s <= h.length;
}
// n wall pieces around a circle: centre, tangent heading (rot, as wallStations' rot: the box's long axis is (cos rot, sin rot))
export function ringStations(cx, cz, r, n) {
  const out = [];
  for (let k = 0; k < n; k++) { const a = (k + 0.5) / n * 2 * Math.PI; out.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, rot: a + Math.PI / 2, len: 2 * Math.PI * r / n + 0.05 }); }
  return out;
}
// The Eiffel Tower at h metres (1:10 at 33), base y = 0, centred on (0, 0), unrotated: four legs of three tapered segments
// (base corners +-6.25 -> 1st floor +-3.5 at 5.7 -> 2nd floor +-2.0 at 11.5 -> top +-0.9 at 27.6), X braces on the two lower
// storeys, three platforms, four arches under the 1st floor, the spire to 33. kinds: leg {from, to, r0, r1}, box {w, h, d, y},
// arch {r, tube, y, rot, offset}, spire {y0, y1, r0, r1}
export function eiffelParts(h = HIDEOUT.towerH) {
  const k = h / 33, P = (x, y, z) => [x * k, y * k, z * k], out = [];
  const corners = (half) => [[-half, -half], [half, -half], [half, half], [-half, half]];
  const levels = [[6.25, 0, 0.9], [3.5, 5.7, 0.6], [2.0, 11.5, 0.4], [0.9, 27.6, 0.25]];
  for (let i = 0; i < 3; i++) {
    const [h0, y0, r0] = levels[i], [h1, y1, r1] = levels[i + 1], c0 = corners(h0), c1 = corners(h1);
    for (let c = 0; c < 4; c++) out.push({ kind: 'leg', from: P(c0[c][0], y0, c0[c][1]), to: P(c1[c][0], y1, c1[c][1]), r0: r0 * k, r1: r1 * k });
    if (i < 2) for (let c = 0; c < 4; c++) {
      const n = (c + 1) % 4;
      out.push({ kind: 'leg', from: P(c0[c][0], y0, c0[c][1]), to: P(c1[n][0], y1, c1[n][1]), r0: 0.12 * k, r1: 0.12 * k });
      out.push({ kind: 'leg', from: P(c0[n][0], y0, c0[n][1]), to: P(c1[c][0], y1, c1[c][1]), r0: 0.12 * k, r1: 0.12 * k });
    }
  }
  for (const [w, y, t] of [[7.6, 5.7, 0.6], [4.4, 11.5, 0.5], [2.2, 27.6, 0.4]]) out.push({ kind: 'box', w: w * k, h: t * k, d: w * k, y: (y - t) * k });
  for (let side = 0; side < 4; side++) out.push({ kind: 'arch', r: 4.4 * k, tube: 0.22 * k, y: 0.2 * k, rot: side * Math.PI / 2, offset: 4.9 * k });
  out.push({ kind: 'spire', y0: 27.6 * k, y1: 33 * k, r0: 0.2 * k, r1: 0.08 * k });
  return out;
}
```

- [ ] **Step 4: Run the tests, expect green.** `node --test prototype/tests/hideout.test.mjs`. If `portalS` returns 11 instead of 10, check `floorAt` is subtracting `grade·s` (depth per metre is `0.5 + 0.05`).

- [ ] **Step 5: Commit.** `git add prototype/hideout.js prototype/tests/hideout.test.mjs && git commit -m "feat(world): pure helpers for the Hübel hideout (#102)"`.

---

### Task 2: Landmarks: `game` positions and `secret` entries

**Files:**
- Modify: `prototype/landmarks.js` (`sourcePos`, `landmarkEntries`, `LANDMARK_INFO`)
- Test: `prototype/tests/landmarks.test.mjs`

**Interfaces:**
- `landmarkEntries(info, anchors, buildings, opts = {})` — `opts.secrets` (bool) includes `secret: true` items; a source may be `game: [x, z]`.
- `LANDMARK_INFO` gains `{ name: 'Eiffelturm', gemeinde: 'Münchwilen', game: [-712.8, 1528.2], jump: [-703.3, 1419.1], secret: true }`.

- [ ] **Step 1: Write the failing tests.** Append to `prototype/tests/landmarks.test.mjs`:

```js
// #102: a hand-measured position and a secret that only lists once it is found
const SECRET_INFO = [
  { name: 'Smile-Kreisel', gemeinde: 'Sisseln', anchor: 'smileKreisel' },
  { name: 'Eiffelturm', gemeinde: 'Münchwilen', game: [-712.8, 1528.2], jump: [-703.3, 1419.1], secret: true },
];

test('landmarkEntries_GamePosition_IsTakenAsIs', () => {
  const e = landmarkEntries(SECRET_INFO, ANCHORS, BUILDINGS, { secrets: true }).find(x => x.n === 'Eiffelturm');
  assert.deepEqual(e, { n: 'Eiffelturm', g: 'Münchwilen', x: -712.8, z: 1528.2, j: [-703.3, 1419.1] });
});

test('landmarkEntries_SecretEntries_OnlyWhenRevealed', () => {
  assert.deepEqual(landmarkEntries(SECRET_INFO, ANCHORS, BUILDINGS).map(x => x.n), ['Smile-Kreisel']);
  assert.deepEqual(landmarkEntries(SECRET_INFO, ANCHORS, BUILDINGS, {}).map(x => x.n), ['Smile-Kreisel']);
  assert.deepEqual(landmarkEntries(SECRET_INFO, ANCHORS, BUILDINGS, { secrets: true }).map(x => x.n), ['Eiffelturm', 'Smile-Kreisel'], 'Münchwilen sorts before Sisseln');
});

test('LANDMARK_INFO_HasTheHideoutAsASecretInMuenchwilen', () => {
  const e = LANDMARK_INFO.find(i => i.name === 'Eiffelturm');
  assert.equal(e.secret, true); assert.equal(e.gemeinde, 'Münchwilen'); assert.deepEqual(e.game, [-712.8, 1528.2]);
  assert.ok(!landmarkEntries(LANDMARK_INFO, {}, []).some(x => x.n === 'Eiffelturm'), 'hidden by default');
});
```

- [ ] **Step 2: Run, expect failure.** `node --test prototype/tests/landmarks.test.mjs` — three failures.

- [ ] **Step 3: Implement.** In `prototype/landmarks.js`:

```js
function sourcePos(item, anchors, buildingsById) {
  if (item.game) return { x: item.game[0], z: item.game[1] };   // #102: hand-measured game coordinates, like VILLAGES
  if (item.anchor) {
    const a = anchors[item.anchor];
    return a ? { x: a.x, z: a.z } : null;
  }
  const b = buildingsById.get(Number(item.building));
  return b && b.ring && b.ring.length ? ringMean(b.ring) : null;
}

export function landmarkEntries(info, anchors, buildings, opts = {}) {
  const byId = new Map((buildings || []).map(b => [Number(b.id), b]));
  const found = [];
  info.forEach((item, i) => {
    if (item.secret && !opts.secrets) return;   // #102: a secret lists only once the player has found it
    const p = sourcePos(item, anchors || {}, byId);
    if (p) found.push({ n: item.name, g: item.gemeinde, x: p.x, z: p.z, ...(item.jump ? { j: [...item.jump] } : {}), ...(item.ramp ? { ramp: true } : {}), i });
  });
  found.sort((a, b) => GEMEINDEN.indexOf(a.g) - GEMEINDEN.indexOf(b.g) || a.i - b.i);
  return found.map(({ i, ...entry }) => entry);
}
```

and in `LANDMARK_INFO`, after the `Plattform Sisslerfeld` line (Münchwilen):

```js
  { name: 'Eiffelturm', gemeinde: 'Münchwilen', game: [-712.8, 1528.2], jump: [-703.3, 1419.1], secret: true },   // #102: the hideout in the Hübel; J lands on the Hübel facing the gate
```

- [ ] **Step 4: Run all node tests, expect green.** `node --test prototype/tests/*.test.mjs`.

- [ ] **Step 5: Commit.** `git commit -am "feat(landmarks): game positions and secret entries for the hideout (#102)"`.

---

### Task 3: Strings

**Files:**
- Modify: `prototype/strings.js` (en after `fishes` `:71`, de after `fishes` `:196`)
- Test: `prototype/tests/strings.test.mjs` (existing key-parity and Swiss-spelling tests)

- [ ] **Step 1: Write the failing test.** Append to `prototype/tests/strings.test.mjs`:

```js
test('hideout strings exist in both languages (#102)', () => {
  assert.match(translate('en', 'hideoutFound'), /Hideout found/);
  assert.match(translate('de', 'hideoutFound'), /Versteck gefunden/);
  assert.match(translate('en', 'hideoutNoSky'), /drive out/);
  assert.match(translate('de', 'hideoutNoSky'), /fahr zuerst raus/);
});
```

(Use the import style the file already has for `translate`/`STRINGS`.)

- [ ] **Step 2: Run, expect failure.** `node --test prototype/tests/strings.test.mjs`.

- [ ] **Step 3: Add the strings.** en:

```js
  hideoutFound: `Hideout found!<br>${small('The Eiffel Tower. In a hill. Of course.')}`,
  hideoutNoSky: 'No sky down here – drive out first',
```

de:

```js
  hideoutFound: `Versteck gefunden!<br>${small('Der Eiffelturm. In einem Hügel. Natürlich.')}`,
  hideoutNoSky: 'Hier unten gibt es keinen Himmel – fahr zuerst raus',
```

- [ ] **Step 4: Run, expect green.** `node --test prototype/tests/strings.test.mjs`.

- [ ] **Step 5: Commit.** `git commit -am "feat(i18n): hideout toasts (#102)"`.

---

### Task 4: The floor — hideout cuts through the patch machinery

**Files:**
- Modify: `prototype/index.html` (imports `:241-243`; `cutFloorMin`/`buildCuts` `:529-541`; tree loop `:1029`)
- Test: `prototype/tests/test_hideout.py` (new; the first test of it)

**Interfaces:**
- `HIDE` (module-level): `null` without `L && REAL`, else `{ tunnel, cavern, f0, portal, found, walls: 0, lamps: 0, lidTris: 0, lidCells: new Set(), floor }`.
- `allCuts()` → `CUTS` plus the two hideout cuts; `roofedAt(x, z)`, `lidH(x, z)`, `skyGroundH(x, z)`.
- `__mm.hideout()`, `__mm.roofed`, `__mm.lidAt`, `__mm.skyGround`.

- [ ] **Step 1: Write the failing browser test.** Create `prototype/tests/test_hideout.py`:

```python
"""#102: the secret hideout in the Hübel -- a tunnel into the hill, a cavern with the Eiffel Tower, found by driving in.
Needs the real world and terrain (the hill is swisstopo's). Slow (Playwright): run in the foreground."""
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[2]
WORLD = ROOT / "data" / "world_hochrhein.json"
MMH = ROOT / "data" / "terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
MOUTH_ROAD = (-703.3, 1419.1)          # the Hübel's centre line at the mouth
HEADING = 95 * math.pi / 180
needs_world = pytest.mark.skipif(not (WORLD.exists() and MMH.exists()), reason="run pipeline/osm.py build and terrain.py first")


def open_page(p, server):
    br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 480, "height": 270})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=180000)
    page.click("#startbtn")
    return br, page, errors


@needs_world
def test_floor_lid_and_tower(server):
    """The cavern floor is the cut, the lid is the hill 40+ m above it, the tower counts itself, walls and lamps exist."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        assert h is not None
        cx, cz = h["centre"]
        probe = page.evaluate(f"() => window.__mm.probe({cx}, {cz})")
        sky = page.evaluate(f"() => window.__mm.skyGround({cx}, {cz})")
        roofed_mouth = page.evaluate(f"() => window.__mm.roofed({h['mouth'][0]}, {h['mouth'][1]})")
        counts = page.evaluate("() => window.__mm.counts")
        br.close()
    assert errors == []
    assert 8 <= h["portalS"] <= 20, h
    assert abs(probe["terrain"] - h["floor"]) < 0.3, (probe, h)
    assert h["lid"] - h["floor"] >= 40, h
    assert sky >= h["lid"], (sky, h)
    assert roofed_mouth is False
    assert h["lidTris"] > 0 and h["walls"] >= 24 and h["lamps"] == 4, h
    assert counts["eiffel"] == 1
    assert h["found"] is False
```

- [ ] **Step 2: Run it, expect failure** (`__mm.hideout` undefined): `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_hideout.py -q -p no:cacheprovider -k floor_lid`.

- [ ] **Step 3: Wire the cuts.** In `prototype/index.html`:

Imports (`:241` add `cutReach` is already there; add to the `world.js` list nothing new) and after `:243`:

```js
import { HIDEOUT, TUNNEL, hideoutAxis, floorAt, hideoutCuts, portalS, cavernR, inCavern, roofed, inHideout, ringStations, eiffelParts } from './hideout.js';
```

Replace `cutFloorMin` (`:529`) and `buildCuts` (`:531-541`) with:

```js
// #102: the hideout's two cuts (hideout.js) ride the same patch machinery, from their own array: CUTS stays rail-only for
// __mm.crossings and the #119 walls. Built on the measured terrain only -- the made-up hills have no Hübel.
const HIDE = L && REAL ? (() => { const found = (() => { try { return localStorage.getItem(HIDEOUT.key) === '1'; } catch (e) { return false; } })(); return { ...hideoutCuts(meshH), portal: portalS(meshH), found, walls: 0, lamps: 0, lidTris: 0, lidCells: new Set(), floor: null }; })() : null;
const allCuts = () => HIDE ? [...CUTS, HIDE.tunnel, HIDE.cavern] : CUTS;
function cutFloorMin(x, z) { let f = Infinity; for (const c of allCuts()) if (c.depth > 0 && Math.abs(x - c.x) < 200 && Math.abs(z - c.z) < 200) { const h = cutFloorAt(c, x, z, c.u ?? UNDERPASS); if (h !== null) f = Math.min(f, h); } return f; }
function cutDepth(x, z) { return meshH(x, z) - terrainH(x, z); }
function buildCuts() {
  for (const c of railRoadCrossings(L.roads, L.railBridges)) CUTS.push(makeCut(c));
  const G = TGRID, W = CUT_N + 1;
  for (const c of allCuts()) if (c.depth > 0) for (const [i, j] of patchCells(cutBounds(c, c.u ?? UNDERPASS), G)) {
    const key = i + ',' + j; if (CUT_CELLS.has(key)) continue;
    const p = new Float32Array(W * W);
    for (let b = 0; b < W; b++) for (let a = 0; a < W; a++) { const x = G.x0 + (i + a / CUT_N) * G.dx, z = G.z0 + (j + b / CUT_N) * G.dz; p[b * W + a] = Math.min(meshH(x, z), cutFloorMin(x, z)); }
    CUT_CELLS.set(key, p);
  }
}
if (L) buildCuts();
// #102: under the lid? the ceiling height there (null elsewhere); the ground a helicopter sees (the hill, not the cavern floor)
function roofedAt(x, z) { return !!HIDE && roofed(x, z, HIDE.portal); }
function lidH(x, z) { return roofedAt(x, z) ? meshH(x, z) - 0.6 : null; }
function skyGroundH(x, z) { const g = groundH(x, z, 1e4); return roofedAt(x, z) ? Math.max(g, meshH(x, z)) : g; }
```

(`skyGroundH` calls `groundH`, defined later in the file as a function declaration — hoisted, fine.)

Tree loop (`:1029`): add `&& !(HIDE && inHideout(tx, tz))` to the `if (free(tx, tz, 3) && …)` condition.

Test hooks, next to `__mm.probe` (`:1305`):

```js
window.__mm.hideout = () => HIDE ? { mouth: HIDE.tunnel.pts[0], centre: [HIDE.tunnel.x, HIDE.tunnel.z], portalS: HIDE.portal, floor: HIDE.floor ?? HIDE.f0, lid: lidH(HIDE.tunnel.x, HIDE.tunnel.z), found: HIDE.found, walls: HIDE.walls, lamps: HIDE.lamps, lidTris: HIDE.lidTris } : null;
window.__mm.roofed = roofedAt; window.__mm.lidAt = lidH; window.__mm.skyGround = skyGroundH;
```

- [ ] **Step 4: Run the test again.** It must now get past `hideout()` and fail on `lidTris`/`walls`/`counts.eiffel` (Task 5 builds those). Also run `node --test prototype/tests/*.test.mjs` (green) and `test_underpass.py` (green — `CUTS` untouched).

- [ ] **Step 5: Commit.** `git commit -am "feat(world): hideout cuts through the patch machinery, sky ground and lid helpers (#102)"`.

---

### Task 5: Build it — lid, ceiling, walls, portal, floor, lamps, tower

**Files:**
- Modify: `prototype/index.html` (ground block after the patch loop `:869`; a new `hideoutBuild()` + `eiffelTower()` next to `plattformTower` `:722`; landmark block `:1024`; static map `:1464`)
- Test: `prototype/tests/test_hideout.py::test_floor_lid_and_tower` (from Task 4) plus a wall-role check

- [ ] **Step 1: Extend the failing test.** In `test_floor_lid_and_tower`, before `br.close()`, add:

```python
        ux, uz = math.cos(HEADING), math.sin(HEADING)
        wall = page.evaluate(f"() => window.__mm.wallRoleAt({cx}, {cz}, {cx + uz * 30}, {cz - ux * 30}, 2)")
        tower = page.evaluate(f"() => window.__mm.wallRoleAt({cx - 20}, {cz}, {cx}, {cz}, 5.4)")
```

and after it `assert wall == "stone", wall` (a ray across the cavern at 2 m hits the ring wall; it passes through the arch's opening) and `assert tower == "dome", tower` (5.4 m up, the ray from 20 m west meets the first-floor platform, which spans 5.1–5.7 m).

- [ ] **Step 2: Run, expect failure** on `lidTris` (still 0).

- [ ] **Step 3: The lid and the ceiling.** In the ground block, right after the `for (const key of CUT_CELLS.keys()) { … }` patch loop (`:864-869`):

```js
  if (HIDE) { // #102: the hill's own surface back over the roofed part (lid, into grass) and a dark copy 0.6 m under it, wound to face down (ceiling, into stone)
    const ROCK = col('#4a4642');
    for (const c of [HIDE.tunnel, HIDE.cavern]) for (const [i, j] of patchCells(cutBounds(c, c.u), TGRID)) {
      const key = i + ',' + j; if (HIDE.lidCells.has(key)) continue; HIDE.lidCells.add(key);
      const g = new THREE.PlaneGeometry(TGRID.dx, TGRID.dz, CUT_N, CUT_N); g.rotateX(-Math.PI / 2); g.translate(TGRID.x0 + (i + 0.5) * TGRID.dx, 0, TGRID.z0 + (j + 0.5) * TGRID.dz);
      const q = g.attributes.position, idx = g.index.array, keep = [];
      for (let k = 0; k < idx.length; k += 3) { const cx = (q.getX(idx[k]) + q.getX(idx[k + 1]) + q.getX(idx[k + 2])) / 3, cz = (q.getZ(idx[k]) + q.getZ(idx[k + 1]) + q.getZ(idx[k + 2])) / 3; if (roofedAt(cx, cz)) keep.push(idx[k], idx[k + 1], idx[k + 2]); }
      if (!keep.length) continue;
      g.setIndex(keep);
      const uv = g.attributes.uv, cArr = new Float32Array(q.count * 3);
      for (let v = 0; v < q.count; v++) { const x = q.getX(v), z = q.getZ(v), h = meshH(x, z), c = groundCol(h); q.setY(v, h); uv.setXY(v, (x - TGRID.x0) / 20, (TGRID.z0 + GD - z) / 20); cArr[v * 3] = c.r; cArr[v * 3 + 1] = c.g; cArr[v * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(cArr, 3)); g.computeVertexNormals(); parts.grass.push(g.toNonIndexed());
      const ceil = g.toNonIndexed(); ceil.translate(0, -0.6, 0); const cp = ceil.attributes.position;
      for (let k = 0; k < cp.count; k += 3) { const x1 = cp.getX(k + 1), y1 = cp.getY(k + 1), z1 = cp.getZ(k + 1); cp.setXYZ(k + 1, cp.getX(k + 2), cp.getY(k + 2), cp.getZ(k + 2)); cp.setXYZ(k + 2, x1, y1, z1); }
      ceil.computeVertexNormals(); colorize(ceil, ROCK); push('stone', ceil);
      HIDE.lidTris += keep.length / 3;
    }
  }
```

- [ ] **Step 4: Walls, portal, floor, lamps, tower.** Next to `plattformTower` (`:722-735`):

```js
// #102: the hideout -- trough walls along the tunnel (the #119 pattern without decks), a ring wall around the cavern, the
// reservoir gate at the portal, gravel on the floor, lamps, and the tower. Every OBB is `secret`: the static map skips it.
function hideoutBuild() {
  const h = HIDEOUT, u = TUNNEL, a = hideoutAxis(h), g0 = meshH(a.mouth[0], a.mouth[1]), floor = (s) => floorAt(s, g0, h), stone = col('#b8b2a6'), gravel = col('#cfc3ac'), inner = h.hw + u.margin;
  const wallBox = (x, z, len, rot, bottom, top) => { box(len, top - bottom, u.wall, x, bottom, z, rot, stone, 'stone', [4, 3], 0); pushOBB({ x, z, hw: len / 2, hd: u.wall / 2, c: Math.cos(rot), s: Math.sin(rot), h: top, low: true, secret: true }); HIDE.walls++; };
  for (const w of wallStations(a.pts, [[0, h.length]], inner + u.wall / 2, 2)) {
    const fl = floor(w.t), ground = meshH(w.x + w.nx * (u.wall / 2 + 0.5), w.z + w.nz * (u.wall / 2 + 0.5));
    if (ground - fl <= 0.1) continue;
    wallBox(w.x, w.z, w.len + 0.05, w.rot, fl, w.t >= HIDE.portal ? meshH(w.x, w.z) - 0.6 : ground + 1);   // parapet in the open trench, up to the ceiling under the lid
  }
  const [cx, cz] = a.centre, fl = floor(h.length); HIDE.floor = fl;
  for (const r of ringStations(cx, cz, cavernR(h, u) + u.wall / 2, 24)) wallBox(r.x, r.z, r.len, r.rot, fl, meshH(r.x, r.z) - 0.6);
  // the gate: piers in the margins, a lintel over the 9 m opening up to 1 m over the hillside, the sign on its outer face
  const ps = HIDE.portal, px = a.mouth[0] + a.ux * ps, pz = a.mouth[1] + a.uz * ps, pf = floor(ps), rot = h.heading + Math.PI / 2, nx = -a.uz, nz = a.ux;
  for (const side of [-1, 1]) { const d = side * (h.hw + u.margin / 2), x = px + nx * d, z = pz + nz * d; box(u.margin, 5, 1.2, x, pf, z, rot, stone, 'stone', [4, 3], 0); pushOBB({ x, z, hw: u.margin / 2, hd: 0.6, c: Math.cos(rot), s: Math.sin(rot), h: pf + 5, secret: true }); }
  box(2 * (inner + u.wall), meshH(px, pz) + 1 - (pf + 5), 1.2, px, pf + 5, pz, rot, stone, 'stone', [4, 3], 0);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.9), new THREE.MeshBasicMaterial({ map: textTex('RESERVOIR HÜBEL', 1024, 160, '#d8d2c6', '#2a2a2a', '700 110px "Barlow Condensed", sans-serif'), transparent: true }));
  sign.position.set(px - a.ux * 0.62, pf + 5.8, pz - a.uz * 0.62); sign.rotation.y = Math.atan2(-a.ux, -a.uz); signs.add(sign);
  // floor: gravel down the tunnel and over the cavern, draped on the cut
  ribbon(a.pts, h.hw, 0.04, 'gravel', gravel, 8, true); disc(cx, cz, cavernR(h, u) - 1, 0.04, 'gravel', gravel);
  // light: two warm point lights by the tower, four lamp posts on the diagonals (the chimney's lamp pattern)
  for (const k of [-1, 1]) { const l = new THREE.PointLight(0xffd9a0, 1.4, 70, 1.5); l.position.set(cx + a.ux * 12 * k, fl + 3, cz + a.uz * 12 * k); signs.add(l); }
  for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = cx + ox * 10.6, z = cz + oz * 10.6;   // 15 m out on the diagonals
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), new THREE.MeshLambertMaterial({ color: 0x9aa0a8 })); pole.position.set(x, fl + 1.3, z);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a })); head.position.set(x, fl + 2.8, z);
    signs.add(pole, head); HIDE.lamps++;
  }
  eiffelTower(cx, cz, fl);
}
// #102: 1:10 lookalike from primitives (hideout.js describes it): painted iron on the dome role (plain colour), solid at the four feet only -- drive between the legs
function eiffelTower(x, z, b) {
  const iron = col('#6e4b2a'), up = new THREE.Vector3(0, 1, 0);
  for (const p of eiffelParts(HIDEOUT.towerH)) {
    let g;
    if (p.kind === 'leg') { const d = new THREE.Vector3(p.to[0] - p.from[0], p.to[1] - p.from[1], p.to[2] - p.from[2]), len = d.length(); g = new THREE.CylinderGeometry(p.r1, p.r0, len, 4); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d.normalize())); g.translate(x + (p.from[0] + p.to[0]) / 2, b + (p.from[1] + p.to[1]) / 2, z + (p.from[2] + p.to[2]) / 2); }
    else if (p.kind === 'box') { g = new THREE.BoxGeometry(p.w, p.h, p.d); g.translate(x, b + p.y + p.h / 2, z); }
    else if (p.kind === 'arch') { g = new THREE.TorusGeometry(p.r, p.tube, 6, 16, Math.PI); g.translate(0, p.y, p.offset); g.rotateY(p.rot); g.translate(x, b, z); }
    else { g = new THREE.CylinderGeometry(p.r1, p.r0, p.y1 - p.y0, 6); g.translate(x, b + (p.y0 + p.y1) / 2, z); }
    colorize(g, iron); push('dome', g);
  }
  const k = HIDEOUT.towerH / 33;
  for (const [ox, oz] of [[-6.25, -6.25], [6.25, -6.25], [6.25, 6.25], [-6.25, 6.25]]) addOBB(x + ox * k, z + oz * k, 1.6, 1.6, 0, b + 5.7 * k);
  window.__mm.counts.eiffel = 1;
}
```

Note the tower's four foot OBBs go through `addOBB` → `pushOBB`; mark them secret too: use `pushOBB({ x: …, z: …, hw: 0.8, hd: 0.8, c: 1, s: 0, h: b + 5.7 * k, secret: true })` instead of `addOBB` so the map does not show four dots in the hill.

Call it in the landmark block (`:1024`, after the `plattform` line): `if (HIDE) hideoutBuild();`

Static map (`:1464`): change `for (const o of OBB) { if (o.bridge) continue;` to `for (const o of OBB) { if (o.bridge || o.secret) continue;`.

- [ ] **Step 5: Run the test, expect green.** `… pytest prototype/tests/test_hideout.py -q -p no:cacheprovider -k floor_lid`. If `wallRoleAt` from the centre returns `gravel` or `dome`, the ray's height is wrong — it starts at `terrainH(tx, tz) + up` where `tx, tz` is the target; 2 m up at the wall is above the gravel and below nothing else. If `tower` returns `stone`, the ray hit the ring wall behind the tower: shorten it (`cx - 20`).

- [ ] **Step 6: Open it in a browser** (`python3 -m http.server 8000`, `?debug`, **J** is useless until found — drive: **F** helicopter to `(-703, 1419)` is quickest; **F** again lands on the Hübel). Check: the gate reads from the road, the trench walls meet the hillside, the lid closes the hill from above (fly over it), inside is dark rock with a lit tower, no z-fighting on the hilltop.

- [ ] **Step 7: Commit.** `git commit -am "feat(world): the hideout -- lid, walls, reservoir gate, lamps and the Eiffel Tower (#102)"`.

---

### Task 6: Discovery, J entry, camera ceiling, helicopter

**Files:**
- Modify: `prototype/index.html` (`JUMP_ENTRIES` `:1238`; `stepCar` after `collide(carRadius())` `:1359`; `stepCamera` `:1381`; `takeOff`/`stepFly` `:1269-1271`)
- Test: `prototype/tests/test_hideout.py` (two more tests)

- [ ] **Step 1: Write the failing tests.** Append to `test_hideout.py`:

```python
def jump_list(page):
    page.keyboard.press("KeyJ")
    page.wait_for_function("() => !document.getElementById('jump').hidden")
    names = [r["n"] for r in page.evaluate("() => window.__mm.jumpList()")]
    page.keyboard.press("Escape")
    page.wait_for_function("() => document.getElementById('jump').hidden")
    return names


@needs_world
def test_drive_in_finds_the_hideout(server):
    """Not listed before; drive from the Hübel into the hill: the car ends on the cavern floor, the find is toasted and
    remembered, J lists the Eiffelturm, and the chase camera stays under the ceiling."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        assert "Eiffelturm" not in jump_list(page)
        h = page.evaluate("() => window.__mm.hideout()")
        cx, cz = h["centre"]
        # coast in (no key held, 16 m/s decays at 0.12/s to ~108 m in 14 s): the car stops near the cavern centre, not against the far wall
        r = page.evaluate(f"() => window.__mm.sim({MOUTH_ROAD[0]}, {MOUTH_ROAD[1]}, {HEADING}, 16, 14, [])")
        found = page.evaluate("() => window.__mm.hideout().found")
        stored = page.evaluate("() => localStorage.getItem('mm.hideout')")
        toast = page.evaluate("() => document.getElementById('toast').textContent")
        names = jump_list(page)
        lid = page.evaluate(f"() => window.__mm.lidAt({r['x']}, {r['z']})")
        # wait for arrival, not stillness (CLAUDE.md): the chase cam lerps in from the start screen at ~1 fps under SwiftShader
        page.wait_for_function(f"() => {{ const c = window.__mm.cam(), car = window.__mm.car(); return car.y + c.d[1] < {lid} && c.d[1] > 0; }}", timeout=120000)
        br.close()
    assert errors == []
    assert math.hypot(r["x"] - cx, r["z"] - cz) < 23, (r, h)
    assert abs(r["y"] - h["floor"]) < 1.0, (r, h)
    assert found is True and stored == "1"
    assert "Hideout found" in toast or "Versteck gefunden" in toast, toast
    assert "Eiffelturm" in names
    assert lid is not None and lid - h["floor"] > 40, (lid, h)


@needs_world
def test_sky_ground_and_no_takeoff_inside(server):
    """The helicopter sees the hill over the cavern, and F inside the hideout is refused with a toast."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        cx, cz = h["centre"]
        page.evaluate(f"() => window.__mm.sim({MOUTH_ROAD[0]}, {MOUTH_ROAD[1]}, {HEADING}, 16, 14, [])")
        page.keyboard.press("KeyF")
        page.wait_for_timeout(500)
        toast = page.evaluate("() => document.getElementById('toast').textContent")
        car = page.evaluate("() => window.__mm.car()")
        sky = page.evaluate(f"() => window.__mm.skyGround({cx}, {cz})")
        br.close()
    assert errors == []
    assert "sky" in toast or "Himmel" in toast, toast
    assert abs(car["y"] - h["floor"]) < 1.0, car
    assert sky >= h["lid"], (sky, h)
```

- [ ] **Step 2: Run, expect failure** (`found` stays false, no entry, F takes off).

- [ ] **Step 3: Implement.**

`JUMP_ENTRIES` (`:1238`):

```js
// J: the 3D landmarks (landmarks.js), searched by name and filtered by Gemeinde; hand layout: the race points, no Gemeinde.
// #102: secrets list once found, so the list is rebuilt on discovery (jumpEntries() reads it at call time).
const jumpEntriesNow = () => L ? landmarkEntries(LANDMARK_INFO, L.anchors.landmarks, L.buildings, { secrets: !!(HIDE && HIDE.found) }) : [...CPS, FINISH].map(c => ({ n: c.n, g: null, x: c.x, z: c.z }));
let JUMP_ENTRIES = jumpEntriesNow();
```

Discovery — after `collide(carRadius());` in `stepCar` (`:1359`):

```js
  if (HIDE && !HIDE.found && inCavern(P.x, P.z)) foundHideout();   // #102
```

and the function next to `resetCar`:

```js
// #102: first time in the cavern -- toast, jingle, remember it, and the Eiffelturm joins the J/O lists
function foundHideout() { HIDE.found = true; try { localStorage.setItem(HIDEOUT.key, '1'); } catch (e) { } toast(tr('hideoutFound'), TOAST_S.event); SFX.finish(); JUMP_ENTRIES = jumpEntriesNow(); }
```

Camera — in `stepCamera`'s chase branch (`:1381`), right after `target.y = Math.max(target.y, groundH(target.x, target.z, target.y) + 1.2);`:

```js
const lid = lidH(target.x, target.z); if (lid !== null) target.y = Math.min(target.y, lid - 1);   // #102: under the hideout's ceiling
```

Helicopter — `takeOff` (`:1269`): first statement `if (roofedAt(P.x, P.z)) { toast(tr('hideoutNoSky')); return; }`, and `heliStart(P.x, P.z, P.y, P.th, skyGroundH(P.x, P.z))`. `stepFly` (`:1271`): `const ground = skyGroundH(P.x, P.z), …`.

- [ ] **Step 4: Run the three hideout tests, expect green.** Then `test_jump.py`, `test_heli.py` (hand layout: `HIDE` is null, nothing changes) and `node --test prototype/tests/*.test.mjs`.

- [ ] **Step 5: Commit.** `git commit -am "feat(world): finding the hideout -- toast, J entry, camera ceiling, heli sky ground (#102)"`.

---

### Task 7: CHANGELOG, verification, PR

**Files:**
- Modify: `CHANGELOG.md` (`[Unreleased]` → `Added`)

- [ ] **Step 1: CHANGELOG.** Under `### Added`, by hand:

```markdown
- Somewhere on a quiet road at the foot of a hill south of the A3, a plain stone gate marked „Reservoir" sits in a cutting in the hillside. It is on no map and in no list. Drive in: a tunnel leads deep into the hill and opens into a cavern — with the Eiffel Tower in it, floodlit, big enough to drive between its legs. The first time you get there the game tells you, and from then on **J** → `eiffel` takes you back to the gate.
```

- [ ] **Step 2: Push the branch, then verify in the foreground.**

```bash
node --test prototype/tests/*.test.mjs
systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_hideout.py prototype/tests/test_underpass.py prototype/tests/test_jump.py prototype/tests/test_heli.py prototype/tests/test_smoke.py -q -p no:cacheprovider
```

Expected: all green; `test_underpass.py` unchanged (`CUTS` untouched); `test_smoke.py` page loads with no console errors.

- [ ] **Step 3: Playtest checklist** (manual, in a browser; CLAUDE.md's gate): empty console; the gate visible from the end of the Hübel; drive in without a bump at the mouth; the ceiling closes behind the portal; the tower lit, drive between its legs; toast once; **J** → `eiffel` lands on the Hübel facing the gate; **F** over the hill flies above it; **Tab** map shows nothing at the hill; reload keeps the J entry.

- [ ] **Step 4: Open the PR** `feat(world): secret entrance in the Hübel with a hidden Eiffel Tower` with the repo's PR template (Summary / Changes / Testing / Checklist), `Closes #102`.

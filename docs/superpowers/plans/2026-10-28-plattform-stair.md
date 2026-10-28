# Plattform Sisslerfeld: true-to-plan tower and walkable spiral stair (#413) Implementation Plan

**Goal:** Rebuild the Plattform Sisslerfeld as the real triangular tower and let the walker climb its spiral stair onto the viewing deck.

**Spec:** `docs/superpowers/specs/2026-10-28-plattform-stair-design.md`. Read it first: it holds every measurement and Assumptions A1–A7. The Häring/KSL plans are **not** in the repo and must not be added.

**Architecture:** a pure module `prototype/plattform.js` (numbers, layout frame, walkway set, entrance), in the style of `prototype/stairhall.js`. `prototype/index.html` builds the meshes from it and merges the walkway set into `WALKS`. `walkways.js` gets polygon holes.

**Global constraints (`CLAUDE.md`):**

- The stack is buildless: no `package.json` and no new dependency.
- Node tests run as `node --test prototype/tests/*.test.mjs` (the glob, not the folder).
- Playwright runs **in the foreground only, never `run_in_background`**, one file at a time: `python3 -m pytest prototype/tests/test_plattform_stair.py -x`.
- Commit and push the branch **before** running Playwright.
- CHANGELOG: add one entry under `[Unreleased]`, for the player, with a `TZ=Europe/Zurich date '+%F %H:%M'` timestamp and 1–3 bold keywords.
- Branch: `feature/413-plattform-stair` from `main`.

**Coordinates:** headings are `(cos th, sin th)` in (x, z), and "right" is `(-sin th, cos th)`, as in `stairhall.js`. An angle φ that increases from the facing direction turns **clockwise seen from above**, so the spec's stair angles map to `facing + φ`.

---

### Task 1: polygon holes in walkways

**Files:** `prototype/walkways.js`, `prototype/tests/walkways.test.mjs`

- [ ] **Write the failing test** (append to `walkways.test.mjs`):

```js
test('walkwayFloor_SlabWithPolygonHole_NoFloorInTheHole', () => {
  const walk = { ...emptyWalkways(), slabs: [{ poly: [[-5, -5], [5, -5], [5, 5], [-5, 5]], holes: [{ poly: [[-1, -1], [1, -1], [1, 1], [-1, 1]] }], y: 3 }] };
  assert.equal(walkwayFloor(walk, 0, 0, 3), null, 'inside the polygon hole');
  assert.equal(walkwayFloor(walk, 3, 0, 3), 3, 'on the slab');
});
```

(`emptyWalkways` and `walkwayFloor` are already imported there; add them to the import if not.)

- [ ] **Run:** `node --test prototype/tests/walkways.test.mjs`. It fails: `inRect` reads `o.c`/`o.s` of a poly hole, which are undefined, so the result is NaN and the point counts as not in the hole.
- [ ] **Implement:** in `walkways.js`, make a hole use `inFootprint` itself:

```js
const inFootprint = (o, x, z) => (o.poly ? inPoly(o.poly, x, z) : inRect(o, x, z)) && !(o.holes || []).some(h => inFootprint(h, x, z));
```

Also update the header comment: "a slab may have `holes: [rect or { poly }, ...]`".

- [ ] **Run** the full node suite. It is green, and the existing rect holes (6c roof hole) are unchanged.
- [ ] Commit: `feat(foot): walkway slabs take polygon holes (#413)`

### Task 2: `plattform.js`, numbers, frame, facing

**Files:** `prototype/plattform.js` (new), `prototype/tests/plattform.test.mjs` (new)

- [ ] **Write the failing tests:**

```js
// #413: the Plattform Sisslerfeld -- frame, walkways, entrance. Run: node --test prototype/tests/plattform.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLATTFORM, plattformFrame, facingToRoad, sectorPoly, stairTreads, plattformWalk, plattformEntrance } from '../plattform.js';
import { walkwayFloor, walkwayCeiling, walkwayPush } from '../walkways.js';
import { WALKER } from '../foot.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('facingToRoad_RoadToTheNorth_PointsNorth', () => {
  const th = facingToRoad(0, 0, [[[-50, -20], [50, -20]]]);
  assert.ok(near(th, -Math.PI / 2), `heading ${th}`);
});

test('facingToRoad_NoRoads_Throws', () => {
  assert.throws(() => facingToRoad(0, 0, []), /no road/);
});

test('plattformFrame_Triangle_EquilateralOnTheCentroidBaseTowardFacing', () => {
  const f = plattformFrame(10, 20, 0), tri = f.triangle(6);
  const side = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) assert.ok(near(side(tri[a], tri[b]), 6, 1e-9));
  const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cz = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
  assert.ok(near(cx, 10) && near(cz, 20), 'centroid at the anchor');
  assert.ok(tri[0][0] > 10 && tri[1][0] > 10 && tri[2][0] < 10, 'base edge on the facing (+x) side, apex behind');
});

test('plattformFrame_Polar_ClockwiseFromAbove', () => {
  const f = plattformFrame(0, 0, 0), [x, z] = f.polar(90, 1);
  assert.ok(near(x, 0) && near(z, 1), '90 deg turns from +x to +z');
});

test('stairTreads_Heights_MatchThePlan', () => {
  const t = stairTreads();
  const by = (tag) => t.find(q => q.tag === tag);
  assert.equal(t.filter(q => q.tag.startsWith('lower:')).length, 17);
  assert.equal(t.filter(q => q.tag.startsWith('upper:')).length, 17);
  assert.ok(near(by('lower:0').y, 0.075) && near(by('lower:16').y, 2.635));
  assert.ok(near(by('podest').y, 2.795) && near(by('upper:0').y, 2.955) && near(by('upper:16').y, 5.515));
  assert.ok(near(by('exit').y, 5.675) && near(by('austritt').y, PLATTFORM.deck.y));
});
```

- [ ] **Run:** it fails, because the module does not exist.
- [ ] **Implement** `prototype/plattform.js` (first part):

```js
// #413: the Plattform Sisslerfeld -- its measurements, the layout frame, the walkway set of the spiral stair and the deck, the entrance.
// Pure: no three.js, no DOM. Numbers: docs/superpowers/specs/2026-10-28-plattform-stair-design.md (from the builder's plans, which are not in the repo).
// Frame: centre = the anchor (the central post), `facing` points to the entrance side (the base edge of every triangle);
// an angle phi (degrees) from the facing direction turns clockwise seen from above: polar(phi, r) = centre + r * (cos(facing + phi), sin(facing + phi)).
import { emptyWalkways } from './walkways.js';

export const PLATTFORM = {
  frame: { side: 6.0, post: 0.24, braceH: 5.42 },
  centrePost: 0.24,
  core: { r: 1.56, tread: 1.43, segment: 10, door: { half: 15, h: 2.2 } },
  stair: {
    sector: 20, rise: 0.16,
    lower: { n: 17, from: 10, y0: 0.075 },
    podest: { from: 350, to: 480, y: 2.795 },
    upper: { n: 17, from: 120, y0: 2.955 },
    exit: { from: 460, to: 480, y: 5.675 },
    austritt: { from: 120, to: 230 },
  },
  deck: { side: 9.84, y: 5.735, thick: 0.3, parapet: 1.24, rail: 1.1, railFrom: 230, railTo: 460, opening: 24 },
  roof: { side: 12.10, eaves: 8.2, pitch: 45 },
  slab: { side: 12.03 },
  entranceR: 2.0,
};
const RAD = Math.PI / 180;

export function plattformFrame(x, z, facing) {
  const c = Math.cos(facing), s = Math.sin(facing);
  const toWorld = (u, v) => [x + u * c - v * s, z + u * s + v * c];   // u toward the entrance side, v to the right
  const polar = (phi, r) => { const t = facing + phi * RAD; return [x + r * Math.cos(t), z + r * Math.sin(t)]; };
  const triangle = (side) => { const ri = side / (2 * Math.sqrt(3)), rc = side / Math.sqrt(3); return [toWorld(ri, -side / 2), toWorld(ri, side / 2), toWorld(-rc, 0)]; };
  return { x, z, facing, toWorld, polar, triangle };
}

// the heading from (x, z) to the nearest point on any of the polylines
export function facingToRoad(x, z, lines) {
  let best = null;
  for (const pts of lines) for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0, px = ax + t * dx, pz = az + t * dz;
    const d = Math.hypot(px - x, pz - z);
    if (!best || d < best.d) best = { d, px, pz };
  }
  if (!best) throw new Error('facingToRoad: no road points');
  return Math.atan2(best.pz - z, best.px - x);
}

// every walkable piece of the stair, bottom to top: { from, to (degrees), y (above the base), tag }
export function stairTreads(P = PLATTFORM) {
  const { sector, rise, lower, podest, upper, exit, austritt } = P.stair, out = [];
  for (let k = 0; k < lower.n; k++) out.push({ from: lower.from + sector * k, to: lower.from + sector * (k + 1), y: lower.y0 + rise * k, tag: `lower:${k}` });
  out.push({ ...podest, tag: 'podest' });
  for (let k = 0; k < upper.n; k++) out.push({ from: upper.from + sector * k, to: upper.from + sector * (k + 1), y: upper.y0 + rise * k, tag: `upper:${k}` });
  out.push({ ...exit, tag: 'exit' }, { ...austritt, y: P.deck.y, tag: 'austritt' });
  return out;
}

// a ring sector between radii r0 and r1 as a polygon, one arc point every <= 5 degrees
export function sectorPoly(frame, from, to, r0, r1) {
  const n = Math.max(2, Math.ceil((to - from) / 5)), pts = [];
  for (let i = 0; i <= n; i++) pts.push(frame.polar(from + (to - from) * i / n, r1));
  for (let i = n; i >= 0; i--) pts.push(frame.polar(from + (to - from) * i / n, r0));
  return pts;
}
```

- [ ] **Run** `node --test prototype/tests/plattform.test.mjs`. The first tests are green; the rest still fail on missing exports.
- [ ] Commit: `feat(world): plattform.js -- measurements, frame, stair treads (#413)`

### Task 3: the walkway set and the entrance

**Files:** `prototype/plattform.js`, `prototype/tests/plattform.test.mjs`

- [ ] **Write the failing tests** (append):

```js
const BASE = 100, F = plattformFrame(0, 0, 0.3), W = plattformWalk(F, BASE);

// walk the stair's centre line (r = 0.8), unrolled angle psi from the door to the end of the Austritt
function climb(walk, frame, base) {
  const ys = [];
  let y = base;
  for (let psi = 0; psi <= 950; psi += 2) {
    const [x, z] = frame.polar(psi % 360, 0.8), fl = walkwayFloor(walk, x, z, y);
    const next = fl === null ? base : fl;
    ys.push({ psi, y: next, prev: y, ceil: walkwayCeiling(walk, x, z, next) });
    y = next;
  }
  return ys;
}

test('plattformWalk_StairCentreLine_ClimbsFromTheDoorOntoTheDeck', () => {
  const path = climb(W, F, BASE);
  for (const p of path) {
    assert.ok(p.y - p.prev <= WALKER.stepUp + 1e-9, `step too high at psi ${p.psi}: ${p.prev} -> ${p.y}`);
    assert.ok(p.y >= p.prev - 1e-9, `drop at psi ${p.psi}: ${p.prev} -> ${p.y}`);
  }
  assert.ok(near(path.at(-1).y, BASE + PLATTFORM.deck.y), `ends at ${path.at(-1).y}`);
});

test('plattformWalk_StairCentreLine_HeadroomAtLeast1p7', () => {
  for (const p of climb(W, F, BASE)) if (p.ceil !== null) assert.ok(p.ceil - p.y >= 1.7 - 1e-9, `headroom ${(p.ceil - p.y).toFixed(2)} at psi ${p.psi}`);
});

test('plattformWalk_Deck_WalkableOutsideTheOpeningNotInIt', () => {
  const deckY = BASE + PLATTFORM.deck.y, [ox, oz] = F.toWorld(2.2, 0), [hx, hz] = F.polar(300, 1.0);
  assert.equal(walkwayFloor(W, ox, oz, deckY), deckY, 'deck at the base side');
  assert.notEqual(walkwayFloor(W, hx, hz, deckY), deckY, 'the opening over the lower flight is no deck');
});

test('plattformWalk_Parapet_PushesBackAtEveryEdgeMidpoint', () => {
  const deckY = BASE + PLATTFORM.deck.y, tri = F.triangle(PLATTFORM.deck.side);
  for (let i = 0; i < 3; i++) {
    const a = tri[i], b = tri[(i + 1) % 3], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    assert.ok(walkwayPush(W, mx, mz, deckY, WALKER.radius).length > 0, `edge ${i}`);
  }
});

test('plattformWalk_CoreRing_BlocksExceptAtTheDoor', () => {
  const [dx, dz] = F.polar(0, PLATTFORM.core.r), [wx, wz] = F.polar(180, PLATTFORM.core.r);
  assert.equal(walkwayPush(W, dx, dz, BASE, WALKER.radius).filter(h => h).length, 0, 'the door is open at ground level');
  assert.ok(walkwayPush(W, wx, wz, BASE, WALKER.radius).length > 0, 'the battens block');
});

test('plattformEntrance_OutsideTheDoorFacingIn', () => {
  const e = plattformEntrance(F), [dx, dz] = F.polar(0, PLATTFORM.entranceR);
  assert.ok(near(e.x, dx) && near(e.z, dz));
  assert.ok(near(Math.cos(e.th), -Math.cos(0.3)) && near(Math.sin(e.th), -Math.sin(0.3)), 'th points inward');
});
```

- [ ] **Run:** fails on missing `plattformWalk` / `plattformEntrance`.
- [ ] **Implement** (append to `plattform.js`):

```js
// a thin wall along the segment a-b
const segment = ([ax, az], [bx, bz], y0, y1, tag, thick = 0.1) => {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  return { x: (ax + bx) / 2, z: (az + bz) / 2, hw: len / 2, hd: thick / 2, c: dx / len, s: dz / len, y0, y1, tag };
};

// the walkway set: treads, landing, exit and Austritt as sector slabs; the deck with its round opening; the batten ring (open at the door
// up to the door's height), the central post, the railing round the opening and the parapet -- every y absolute (base + ...)
export function plattformWalk(frame, base, P = PLATTFORM) {
  const walk = emptyWalkways(), { core, deck } = P, deckY = base + deck.y, half = P.centrePost / 2;
  for (const t of stairTreads(P)) walk.slabs.push({ poly: sectorPoly(frame, t.from, t.to, half, core.tread), y: base + t.y, tag: t.tag });
  const opening = { poly: Array.from({ length: deck.opening }, (_, i) => frame.polar(i * 360 / deck.opening, core.r)) };
  walk.slabs.push({ poly: frame.triangle(deck.side), holes: [opening], y: deckY, tag: 'deck' });
  for (let a = -core.door.half; a < 360 - core.door.half; a += core.segment) {
    const door = a + core.segment <= core.door.half;
    walk.walls.push(segment(frame.polar(a, core.r), frame.polar(a + core.segment, core.r), base + (door ? core.door.h : 0), deckY, door ? 'core:door' : 'core'));
  }
  const [cx, cz] = frame.toWorld(0, 0);
  walk.walls.push({ x: cx, z: cz, hw: half, hd: half, c: Math.cos(frame.facing), s: Math.sin(frame.facing), y0: base, y1: base + P.roof.eaves + 4, tag: 'post' });
  for (let a = deck.railFrom; a < deck.railTo; a += core.segment) walk.walls.push(segment(frame.polar(a, core.r), frame.polar(a + core.segment, core.r), deckY, deckY + deck.rail, 'rail'));
  const tri = frame.triangle(deck.side);
  for (let i = 0; i < 3; i++) walk.walls.push(segment(tri[i], tri[(i + 1) % 3], deckY, deckY + deck.parapet, 'parapet', 0.12));
  return walk;
}

// outside the door, `th` = the direction you walk in (enterables.js)
export function plattformEntrance(frame, P = PLATTFORM) {
  const [x, z] = frame.polar(0, P.entranceR);
  return { x, z, th: frame.facing + Math.PI, w: 0.8 };
}
```

- [ ] **Run** `node --test prototype/tests/plattform.test.mjs`. All green. If the climb test fails on a drop or a too-high step, the sector angles in `PLATTFORM.stair` do not join. Fix the numbers within the spec's A2 freedom (the joins, not the rise), never the test. If the headroom test fails, report the angle and value. Do not lower the 1.7 m.
- [ ] Run the full node suite, then commit: `feat(foot): Plattform stair and deck as walkways (#413)`

### Task 4: enterable register

**Files:** `prototype/enterables.js`, `prototype/tests/enterables.test.mjs`, `prototype/strings.js`

- [ ] **Update the test first.** `enterableEntries_AllShippedEntriesNotReady` asserts that the Plattform is not ready. #413 changes that requirement on purpose. Rename the test to `enterableEntries_ShippedEntries_ReadyAsBuilt` and change the readiness assertion:

```js
  assert.deepEqual(es.filter(e => !e.ready).map(e => e.id), ['eiffel', 'atomium'], 'everything but 6c (#411) and the Plattform (#413)');
```

  Also update the `visibleEnterables`/other assertions in that file only where they encode the Plattform's readiness. Add a test that `STRINGS.de.plattformOpen` and `STRINGS.en.plattformOpen` exist.
- [ ] **Run:** it fails.
- [ ] **Implement:**
  - `enterables.js`: `ready: true` for `plattform-sisslerfeld`, with the comment `// #413: the stair is open; the runtime fills entrances from plattformEntrance`.
  - `strings.js`: `plattformOpen: 'The stair is open -- just walk in'` (en) and `plattformOpen: 'Die Treppe ist offen -- einfach hineingehen'` (de), next to `enterSoon`.
- [ ] Full node suite green, then commit: `feat(foot): the Plattform Sisslerfeld is enterable (#413)`

### Task 5: the tower meshes (`index.html`)

**Files:** `prototype/index.html`

- [ ] Import at the top next to the `stairhall.js` import: `import { PLATTFORM, plattformFrame, facingToRoad, stairTreads, plattformWalk, plattformEntrance } from './plattform.js';   // #413: the Plattform Sisslerfeld, true to the builder's plans`
- [ ] Add a module-level `let PLAT = null;   // #413: { frame, base, walk } once the tower is built (OSM world only)`.
- [ ] Rewrite `plattformTower(x, z, rot)` as `plattformTower(x, z)`. Keep the helper style of the old function (`box`, `bar`, `push`, `colorize`, `col`, the `roofFlat` timber material). The `rot` argument goes. The facing is `facingToRoad(x, z, ROADS.filter(r => !r.trail && r.cls !== 'motorway').map(r => r.pts))`. Build, every y on `b = terrainH(x, z)`:
  1. **Concrete slab:** a triangle (`frame.triangle(PLATTFORM.slab.side)`) as a flat `ShapeGeometry` at b + 0.04, grey `#b9b6ae`, material `'roadPlain'` or the existing concrete look. Keep the gravel disc (r 9) under it.
  2. **Three posts:** at `frame.triangle(PLATTFORM.frame.side)`, 0.24 × 0.24, height `roof.eaves`, plus `addOBB(px, pz, 0.26, 0.26, frame.facing, b + roof.eaves)` each.
  3. **X braces:** per frame side, two `bar`s corner-bottom (0.2) to the other corner top (`frame.braceH`), and a top beam along the side at `braceH`.
  4. **Central post:** 0.24 square, from b to the apex. **No OBB** (the walkway wall in Task 3 covers the walker; the car never gets inside the ring).
  5. **Batten cylinder:** open `CylinderGeometry(core.r, core.r, deck.y, 72, 1, true)` with the alternating spruce/dark stripe colouring of the old core, but leaving the door out: `thetaStart`/`thetaLength` so 30° around the door direction are missing below `core.door.h`, and a second short cylinder piece over the door from `door.h` to `deck.y`. Mind three.js's theta convention (θ = 0 at +z, x = sin θ): convert from `frame.facing` and test visually in Task 7.
  6. **Treads:** one thin wedge per `stairTreads()` entry: `CylinderGeometry(core.tread, core.tread, 0.05, segs, 1, false, thetaStart, thetaLength)` at `b + t.y - 0.025`, in the beam colour. The same theta conversion applies; the angle runs clockwise seen from above.
  7. **Deck:** an `ExtrudeGeometry` of the deck triangle with a circular hole (`Shape` + `Path` hole, r = core.r), depth `deck.thick`, top at `b + deck.y`. The parapet is three boxes along the edges, 0.08 thick, `deck.parapet` high, in spruce (vertical boards: the timber texture, as the old parapet box).
  8. **Roof:** `ConeGeometry(roof.side / Math.sqrt(3), roof.side / (2 * Math.sqrt(3)) * Math.tan(roof.pitch * RAD), 3, 1, true)`, rotated so one **edge** (not a vertex) faces `facing`. Eaves at `b + roof.eaves`, grey-green `#5f6f66`, material `'roofFlat'`. Add a dark underside (the same cone, slightly lower, `side: DoubleSide` or flipped) so the roof does not look hollow from the deck.
  9. **No** banner or brand on the cylinder (`docs/07-brands-and-permissions.md`).
- [ ] At the end: `PLAT = { frame, base: b, walk: plattformWalk(frame, b) };`
- [ ] The call site (`if (at('plattform')) plattformTower(...)`) drops the rot argument. Update the placeholder comment there: "the Plattform Sisslerfeld, built to the builder's plans (#413)".
- [ ] Node suite still green (index.html is not node-tested; this guards the shared modules). Commit: `feat(world): the Plattform Sisslerfeld rebuilt to its real triangular plan (#413)`

### Task 6: walkways, entrance and E in the game

**Files:** `prototype/index.html`

- [ ] **Merge into `WALKS`** (line `if (INT.hall) Object.assign(WALKS, INT.hall.walk);`). Replace it so the 6c objects stay the same objects but the arrays are new:

```js
for (const set of [INT.hall && INT.hall.walk, PLAT && PLAT.walk]) if (set) for (const k of Object.keys(WALKS)) WALKS[k] = [...WALKS[k], ...set[k]];   // #411 6c hall + #413 Plattform: new arrays, the same piece objects (door leaves, the cabin slab and wallByTag stay live; nothing is pushed after this)
```

  Before that, check that no code pushes into `INT.hall.walk.*` after this line (`grep -n "walk\.\(slabs\|walls\|ramps\|ceilings\)\.push" prototype/index.html`). The cabin push happens before it. If one does push later, push into `WALKS` too and note it in the PR.
- [ ] **Entrance**, next to the 6c entrance line (`e.entrances = [{ ...bodenackerHouse(lay, '6c').porch.entrance }]`):

```js
{ const e = ENTERABLES.find(q => q.id === 'plattform-sisslerfeld'); if (PLAT && e) e.entrances = [plattformEntrance(PLAT.frame)]; }   // #413: the door of the batten cylinder
```

- [ ] **E handler**, next to `ENTER_HANDLERS['bodenackerstrasse-6c']`:

```js
ENTER_HANDLERS['plattform-sisslerfeld'] = () => toast(tr('plattformOpen'));   // #413: nothing to open, the stair is open -- just walk in
```

- [ ] **Test hook:** `window.__mm.plattform = () => PLAT && { facing: PLAT.frame.facing, base: PLAT.base, x: PLAT.frame.x, z: PLAT.frame.z, deckY: PLAT.base + PLATTFORM.deck.y };`
- [ ] Commit, then **push the branch**: `feat(foot): walk up the Plattform Sisslerfeld (#413)`

### Task 7: Playwright

**Files:** `prototype/tests/test_plattform_stair.py` (new). Copy `open_world`, `ARGS`, `MMH_ROUTE` and `needs_world` from `test_enter_6c.py`, plus how it switches to foot mode (`stand`/`foot_sim` helpers). Keep the copy minimal.

- [ ] Write the tests:

```python
"""#413: the Plattform Sisslerfeld's stair and deck. Slow (Playwright): run in the foreground."""
# ... imports, ARGS, MMH_ROUTE, WORLD, needs_world, open_world, the foot-mode switch: as test_enter_6c.py

def polar(page, phi_deg, r):
    return page.evaluate("""([phi, r]) => { const p = window.__mm.plattform(), t = p.facing + phi * Math.PI / 180;
        return [p.x + r * Math.cos(t), p.z + r * Math.sin(t)]; }""", [phi_deg, r])


@needs_world
def test_e_at_the_door_says_the_stair_is_open(server):
    # stand at the entrance facing in, press E: the toast shows plattformOpen, no page errors
    ...


@needs_world
def test_from_the_top_of_the_upper_flight_the_walker_reaches_the_deck(server):
    # put the walker on upper:15 (phi = 120 + 20*15 + 10 = 430 -> 70 deg, r = 0.8, y = base + 2.955 + 0.16*15), facing along the stair
    # (heading facing + phi + 90 deg: tangential, clockwise from above), hold KeyW (and turn with the arrow keys if needed) for up to 4 s,
    # assert foot().y within 0.1 of deckY at the end
    ...


@needs_world
def test_the_parapet_holds_the_walker_on_the_deck(server):
    # put the walker on the deck 1 m inside the base edge (frame u = deck inradius - 1, v = 0), facing out (heading = facing),
    # hold KeyW 2 s: still at deckY, and the distance from the centre stays below the deck inradius
    ...
```

  Fill in the bodies with the hooks that exist (`__mm.place`, `__mm.setFootY`, `__mm.footSim(secs, ['KeyW'])`, `__mm.foot()`), as in `test_enter_6c.py`.
- [ ] Run **in the foreground**: `python3 -m pytest prototype/tests/test_plattform_stair.py -x`. All green.
- [ ] **Visual check:** take one screenshot from the jump spot (J → Plattform Sisslerfeld) and one from the deck. Compare with `design/reference/2026-09-29_plattform-sisslerfeld.jpg`: three posts, X braces, cylinder, parapet box, triangular roof. Fix the cylinder/tread theta conversion if the door or the treads are rotated wrong. Attach both screenshots to the PR.
- [ ] Commit: `test(foot): Plattform stair and deck in the browser (#413)`

### Task 8: CHANGELOG and PR

- [ ] `CHANGELOG.md` under `[Unreleased]`, newest first, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`:

```markdown
- `<timestamp>` The **Plattform Sisslerfeld** now stands on its real triangular plan, and on foot you can climb the **spiral stair** up to the viewing **deck**.
```

- [ ] Add the credit line from the spec where the game's credits list sources (search `credits` / `Quellen` in `prototype/`; if there is no credits list, put it in `README.md`'s credits section).
- [ ] Full node suite green. PR `feat(foot): walkable Plattform Sisslerfeld, true to plan (#413)`, body `Closes #413`, with the two screenshots.

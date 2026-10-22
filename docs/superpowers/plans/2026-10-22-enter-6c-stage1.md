# Enter 6c, stage 1 (#411, #412) Implementation Plan

**Goal:** On foot, the player presses E at the glass porch of Bodenackerstrasse 6c (Sisseln), the door swings open, and the player walks into a
seamless interior built in place: an entrance hall, a 2.40 m stair tower with two flights and a half landing per storey from EG to the 9. OG,
a lift with a keypad (EG, 1-9, Dach/Roof), a window on every landing 1.-9. OG, closed flat doors, and a door in the roof-top housing onto a
walkable roof with an invisible railing. The groundwork is a new pure module for walking on more than one level (`prototype/walkways.js`).

**Spec:** `docs/superpowers/specs/2026-10-22-enter-6c-stage1-design.md` (read it first, including its Assumptions A1-A8 and Acceptance criteria).

**Depends on PR#437 (#410, `prototype/bodenacker6.js`) and PR#438 (#409, `prototype/enterables.js`, the E key on foot, `ready`) being merged
first.** Branch `feature/411-enter-6c-stage1` from the then-current `main`. If `main` does not yet contain `prototype/bodenacker6.js` and
`prototype/enterables.js`, stop and say so; do not recreate them.

**Inlining into issues (GitHub caps an issue body at 65,536 characters):** the header plus Tasks 1-2 belong to #412 (the walking groundwork), the header plus Tasks 3-10 to #411 (the hall); #411 needs #412 merged first. The spec link is the same in both.

**APIs this plan uses from those PRs** (verify them on `main` before starting, adapt names only if they differ, and note it in the PR):

```js
// prototype/bodenacker6.js (#410)
BODENACKER6 = { id: 171822634, storeys: 10, houses: ['6a','6b','6c','6d'], housingRise: 2.6, parapet: 0.5, porch: { h: 3.0, door: 1.0, ... }, stair: { d: 3.0 }, ... }
bodenackerLayout(b, base, h) -> { frame, porches, stairs, body, walls, floors, ring }       // frame.toWorld(u, v), frame.rot
bodenackerHouse(layout, '6c') -> { porch, stair }   // porch = { house, u, v0, v1, w, d, h, entrance: { x, z, th, w } }; th = the direction you walk IN
bodenackerFloors(base, h) -> { pitch, floors: [10 heights], roof, housingTop }       // roof = base + h + 0.5, housingTop = roof + 2.6
window.__mm.bodenacker6 = () => layout      // set in index.html by bodenackerBuilding(b, base, h)
// prototype/enterables.js (#409) and index.html
ENTERABLE_INFO[...].ready, .entrances ([{ x, z, th, w }]); enterableEntries(...) -> ENTERABLES; nearestEntrance(...); enterPrompt(near) -> { id, key: 'KeyE' } | null
footKeyAction('KeyE') === 'enter' -> pressEnter() -> ENTER_HANDLERS[entry.id]?.() (a plain object in index.html, empty before this plan)
```

**Global constraints (from `CLAUDE.md`):** buildless stack, no `package.json`, no new dependency, no framework. Node tests:
`node --test prototype/tests/*.test.mjs` (the glob, not the folder). Playwright: **foreground only, never `run_in_background`**, one file at a time
(`cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_enter_6c.py -q`), **after** committing and pushing. Memory-heavy commands under
`systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`. TDD: failing test first, never edit a test to turn it green, never hardcode a
result. If a test fails after three attempts, stop and report. Do not call `rr()`/`rnd()` in new code (the seeded world RNG sequence stays
unchanged). `const`/`let` only, no `var`, no globals except `window.__mm` test hooks. **Privacy (public repo):** only the public address and what a visitor sees in a stair hall;
nothing personal about residents (no names, no private details), no real floor plan; closed plain doors with no names or numbers. Grep the
diff for personal words before every commit. Commit trailers: see the repo's usual `Co-Authored-By` / `Claude-Session` lines.

## File structure

- New `prototype/walkways.js` and `prototype/tests/walkways.test.mjs` (Task 1).
- Modify `prototype/foot.js`, `prototype/tests/foot.test.mjs` (Task 2).
- New `prototype/stairhall.js` and `prototype/tests/stairhall.test.mjs` (Task 3).
- New `prototype/towerlift.js` and `prototype/tests/towerlift.test.mjs` (Task 4).
- Modify `prototype/strings.js`, `prototype/tests/strings.test.mjs` (Task 5).
- Modify `prototype/index.html` (Tasks 6-10), `prototype/enterables.js` and `prototype/tests/enterables.test.mjs` (Task 6), new `prototype/tests/test_enter_6c.py` (Tasks 6-9), `CHANGELOG.md` (Task 10).

Verification commands used throughout: `node --test prototype/tests/*.test.mjs` (all green before every commit).

### Task 1: Walkways, the pure groundwork (#412)

**Files:** `prototype/tests/walkways.test.mjs`, `prototype/walkways.js`.

**Interfaces:** the exports `WALKWAY`, `emptyWalkways`, `inPoly`, `rampY`, `walkwayFloor`, `walkwayCeiling`, `headBump`, `wallActive`, `walkwayPush` exactly as in the code of Step 3; shapes are OBBs `{ x, z, hw, hd, c, s }` (`hw` along the heading `(c, s)`), slabs may carry `poly` and `holes`.

- [ ] **Step 1: write the failing tests.** Create `prototype/tests/walkways.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WALKER, stepFoot } from '../foot.js';
import { WALKWAY, emptyWalkways, inPoly, rampY, walkwayFloor, walkwayCeiling, headBump, wallActive, walkwayPush } from '../walkways.js';

const rect = (o) => ({ x: 0, z: 0, hw: 2, hd: 2, c: 1, s: 0, ...o });
const set = (o) => ({ ...emptyWalkways(), ...o });
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('inPoly_PointsInsideAndOutsideAnLShape_FollowTheEvenOddRule', () => {
  const L = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]];
  assert.equal(inPoly(L, 1, 1), true);
  assert.equal(inPoly(L, 1, 3), true);
  assert.equal(inPoly(L, 3, 3), false);
  assert.equal(inPoly(L, -1, 1), false);
});

test('rampY_AlongTheHeading_RisesLinearlyFromY0ToY1', () => {
  const r = rect({ hw: 2, y0: 10, y1: 12 });
  close(rampY(r, -2, 0), 10); close(rampY(r, 0, 0), 11); close(rampY(r, 2, 0), 12);
  assert.equal(rampY(r, 2.1, 0), null);
  assert.equal(rampY(r, 0, 2.1), null);
});

test('rampY_RotatedRamp_UsesItsOwnHeading', () => {
  const r = { x: 5, z: 5, hw: 2, hd: 1, c: 0, s: 1, y0: 0, y1: 4 };   // heads +z
  close(rampY(r, 5, 5), 2); close(rampY(r, 5, 7), 4); close(rampY(r, 5, 3), 0);
});

test('walkwayFloor_SlabWithinStepUp_IsTheFloorAndOneTooHighIsNot', () => {
  const walk = set({ slabs: [rect({ y: 3 })] });
  assert.equal(walkwayFloor(walk, 0, 0, 3), 3);
  assert.equal(walkwayFloor(walk, 0, 0, 3 - WALKER.stepUp), 3);
  assert.equal(walkwayFloor(walk, 0, 0, 3 - WALKER.stepUp - 0.01), null, 'the storey above is out of reach');
  assert.equal(walkwayFloor(walk, 5, 5, 3), null, 'outside the footprint');
});

test('walkwayFloor_TwoStoreysStacked_PicksTheOneUnderTheFeet', () => {
  const walk = set({ slabs: [rect({ y: 0 }), rect({ y: 2.53 }), rect({ y: 5.06 })] });
  assert.equal(walkwayFloor(walk, 0, 0, 2.53), 2.53);
  assert.equal(walkwayFloor(walk, 0, 0, 2.6), 2.53);
  assert.equal(walkwayFloor(walk, 0, 0, 10), 5.06);
});

test('walkwayFloor_SlabHole_IsNotFloor', () => {
  const walk = set({ slabs: [rect({ y: 3, holes: [rect({ x: 1, hw: 0.5, hd: 0.5 })] })] });
  assert.equal(walkwayFloor(walk, 1, 0, 3), null);
  assert.equal(walkwayFloor(walk, -1, 0, 3), 3);
});

test('walkwayFloor_PolygonSlab_UsesThePolygon', () => {
  const walk = set({ slabs: [{ poly: [[0, 0], [4, 0], [4, 2], [0, 2]], y: 7 }] });
  assert.equal(walkwayFloor(walk, 1, 1, 7), 7);
  assert.equal(walkwayFloor(walk, 1, 3, 7), null);
});

test('stepFoot_WalkingUpARamp_FollowsItsSurface', () => {
  const walk = set({ ramps: [rect({ x: 5, hw: 5, hd: 1, y0: 0, y1: 2.5 })] });
  const floorAt = (x, z, y) => walkwayFloor(walk, x, z, y) ?? 0;
  let s = { x: 0.5, z: 0, y: 0, th: 0, vy: 0, hover: false };
  for (let i = 0; i < 90; i++) s = stepFoot(s, { fwd: 1, side: 0, turn: 0, lift: 0, nitro: 0 }, 1 / 60, floorAt);
  assert.ok(s.x > 6.5, `walked ${s.x}`);
  close(s.y, rampY(walk.ramps[0], s.x, s.z), 1e-6);
  assert.equal(s.vy, 0, 'grounded on the slope');
});

test('walkwayCeiling_StoreyAbove_IsItsUndersideAndOwnFloorNever', () => {
  const walk = set({ slabs: [rect({ y: 0 }), rect({ y: 2.53 })] });
  close(walkwayCeiling(walk, 0, 0, 0), 2.53 - WALKWAY.thick);
  assert.equal(walkwayCeiling(walk, 0, 0, 2.53), null, 'nothing above the top storey');
  assert.equal(walkwayCeiling(walk, 9, 9, 0), null, 'outside the footprint');
});

test('walkwayCeiling_ExplicitCeiling_Counts', () => {
  const walk = set({ ceilings: [rect({ y: 5 })] });
  assert.equal(walkwayCeiling(walk, 0, 0, 3), 5);
  assert.equal(walkwayCeiling(walk, 0, 0, 5), null);
});

test('walkwayCeiling_RampUnderside_IsACeilingBelowIt', () => {
  const walk = set({ ramps: [rect({ hw: 2, y0: 2.53, y1: 5.06 })] });
  close(walkwayCeiling(walk, 0, 0, 0), 3.795 - WALKWAY.thick);
});

test('headBump_JumpUnderACeiling_StopsTheRise', () => {
  const s = headBump({ y: 0.9, vy: 4 }, 0, 2.5);
  close(s.y, 2.5 - WALKWAY.head); assert.equal(s.vy, 0);
  assert.deepEqual(headBump({ y: 0, vy: 4 }, 0, 5), { y: 0, vy: 4 }, 'clear head');
  assert.deepEqual(headBump({ y: 0, vy: 4 }, 0, null), { y: 0, vy: 4 });
  assert.equal(headBump({ y: 0, vy: 0 }, 0, 1.5).y, 0, 'never pushed under the floor');
});

test('stepFoot_JumpUnderALowCeiling_NeverGoesThrough', () => {
  const walk = set({ slabs: [rect({ y: 0 }), rect({ y: 2.53 })] });
  const floorAt = (x, z, y) => walkwayFloor(walk, x, z, y) ?? 0;
  let s = { x: 0, z: 0, y: 0, th: 0, vy: 0, hover: false }, top = 0;
  for (let i = 0; i < 120; i++) {
    s = stepFoot(s, { fwd: 0, side: 0, turn: 0, lift: 1, nitro: 0 }, 1 / 60, floorAt);
    s = headBump(s, floorAt(s.x, s.z, s.y), walkwayCeiling(walk, s.x, s.z, s.y));
    top = Math.max(top, s.y);
  }
  assert.ok(top <= 2.53 - WALKWAY.thick - WALKWAY.head + 1e-9, `reached ${top}`);
});

test('wallActive_OnlyWhileTheBodyOverlapsTheRange', () => {
  const w = rect({ y0: 5, y1: 7.53 });
  assert.equal(wallActive(w, 5), true);
  assert.equal(wallActive(w, 7.53), false, 'standing on the next storey');
  assert.equal(wallActive(w, 5 - WALKWAY.head), false, 'standing a storey below, head just under the wall');
  assert.equal(wallActive({ ...w, off: true }, 5), false, 'an open door');
});

test('walkwayPush_WallOnOtherStorey_DoesNotPush', () => {
  const walk = set({ walls: [rect({ hw: 1, hd: 1, y0: 5, y1: 7.53 })] });
  assert.equal(walkwayPush(walk, 0, 0, 5, 0.35).length, 1);
  assert.equal(walkwayPush(walk, 0, 0, 2.47, 0.35).length, 0);
  assert.equal(walkwayPush(walk, 0, 0, 7.53, 0.35).length, 0);
});

test('walkwayPush_Pushed_AwayFromTheWall', () => {
  const walk = set({ walls: [rect({ x: 5, hw: 0.1, hd: 2, y0: 0, y1: 3 })] });
  const [hit] = walkwayPush(walk, 4.7, 0, 0, 0.35);
  assert.ok(hit.wx < 0 && hit.pen > 0);
});
```

- [ ] **Step 2: run, confirm failure:** `node --test prototype/tests/walkways.test.mjs` fails with `Cannot find module '../walkways.js'`.

- [ ] **Step 3: implement.** Create `prototype/walkways.js`:

```js
// #412: walkable surfaces above the ground -- slabs, stair ramps, walls with a height range, ceilings. Pure: no three.js, no DOM.
// Every shape is a footprint in the colliders' frame { x, z, hw, hd, c, s } (hw along the heading (c, s), hd across) or, for a slab, a polygon
// `poly: [[x, z], ...]`; a slab may have `holes: [rect, ...]`. A walkway set is { slabs, ramps, walls, ceilings }:
//   slab    { ..footprint, y }            flat floor, top surface at y
//   ramp    { ..footprint, y0, y1 }       sloped floor, rises along the heading from y0 (at -hw) to y1 (at +hw)
//   wall    { ..footprint, y0, y1, off? } blocks only a walker whose body overlaps [y0, y1]; `off: true` = open (a door)
//   ceiling { ..footprint, y }            underside at y (the roof of a housing, a cabin)
// Slabs and ramps are WALKWAY.thick thick, so their undersides are ceilings for whoever walks below them.
import { WALKER } from './foot.js';
import { colliderPush } from './world.js';

export const WALKWAY = { thick: 0.2, head: 1.9, tol: 0.05 };   // m: slab thickness, the walker's body height, tolerance at a wall's ends

export const emptyWalkways = () => ({ slabs: [], ramps: [], walls: [], ceilings: [] });

const inRect = (o, x, z) => {
  const dx = x - o.x, dz = z - o.z;
  return Math.abs(dx * o.c + dz * o.s) <= o.hw && Math.abs(-dx * o.s + dz * o.c) <= o.hd;
};

export function inPoly(poly, x, z) {   // even-odd rule
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const inFootprint = (o, x, z) => (o.poly ? inPoly(o.poly, x, z) : inRect(o, x, z)) && !(o.holes || []).some(h => inRect(h, x, z));

// the ramp's surface height at (x, z), or null off the ramp
export function rampY(r, x, z) {
  if (!inRect(r, x, z)) return null;
  const u = (x - r.x) * r.c + (z - r.z) * r.s;
  return r.y0 + (r.y1 - r.y0) * (u + r.hw) / (2 * r.hw);
}

// the surfaces under (x, z) as heights: slabs and ramps
function surfaces(walk, x, z) {
  const out = [];
  for (const s of walk.slabs) if (inFootprint(s, x, z)) out.push(s.y);
  for (const r of walk.ramps) { const y = rampY(r, x, z); if (y !== null) out.push(y); }
  return out;
}

// the highest walkway surface under (x, z) that is at most stepUp above the feet (y), or null: the second source of footFloor
export function walkwayFloor(walk, x, z, y, cfg = WALKER) {
  let top = null;
  for (const h of surfaces(walk, x, z)) if (h <= y + cfg.stepUp && (top === null || h > top)) top = h;
  return top;
}

// the lowest underside above the walker (at least stepUp over the feet, so the surface being stood on never counts), or null
export function walkwayCeiling(walk, x, z, y, cfg = WALKER) {
  let low = null;
  for (const h of surfaces(walk, x, z)) { const under = h - WALKWAY.thick; if (under >= y + cfg.stepUp && (low === null || under < low)) low = under; }
  for (const c of walk.ceilings) if (c.y >= y + cfg.stepUp && inFootprint(c, x, z) && (low === null || c.y < low)) low = c.y;
  return low;
}

// the head hits a ceiling: the walker is pushed down (never under the floor) and stops rising
export function headBump(s, floor, ceil, head = WALKWAY.head) {
  if (ceil === null || s.y + head <= ceil) return s;
  return { ...s, y: Math.max(floor, ceil - head), vy: Math.min(s.vy, 0) };
}

// a wall blocks a walker whose body [y, y + head] overlaps the wall's height range
export const wallActive = (w, y) => !w.off && y + WALKWAY.head > w.y0 + WALKWAY.tol && y < w.y1 - WALKWAY.tol;

// every wall pushing a walker of radius r at (x, z, y): [{ wx, wz, pen }]
export function walkwayPush(walk, x, z, y, r) {
  const hits = [];
  for (const w of walk.walls) { if (!wallActive(w, y)) continue; const hit = colliderPush(w, x, z, r); if (hit) hits.push(hit); }
  return hits;
}
```

- [ ] **Step 4: verify:** `node --test prototype/tests/walkways.test.mjs` all green, then `node --test prototype/tests/*.test.mjs` all green.
- [ ] **Step 5: commit** `feat(foot): walkways -- slabs, ramps, ceilings and walls with a height range (#412)`.

### Task 2: `footFloor` second source, hover off indoors (#412)

**Files:** `prototype/tests/foot.test.mjs`, `prototype/foot.js`.

**Interfaces:**

```js
export function footFloor(ground, boxes, x, z, y, cfg = WALKER, walkway = null)   // walkway = walkwayFloor(...) result or null; returns max(ground, boxes, walkway)
export function footKeyAction(code, indoors = false)   // 'hover' | 'enter' | 'block' | 'pass'; KeyF is 'block' when indoors; every other result unchanged
```

(`footKeyAction('KeyE')` is `'enter'` after PR#438; keep that. `foot.js` must not import `walkways.js`, which imports `foot.js`: the caller computes `walkwayFloor` and passes the number.)

- [ ] **Step 1: write the failing tests.** Append to `prototype/tests/foot.test.mjs` (the file already defines `box`, `WALKER`, `footFloor`, `footKeyAction` imports; add `footKeyAction` to the import line if missing):

```js
test('footFloor_WalkwayAboveTheGround_IsTheFloorWhenWithinStepUp', () => {
  assert.equal(footFloor(0, [], 0, 0, 5, WALKER, 5), 5);
  assert.equal(footFloor(0, [], 0, 0, 5, WALKER, null), 0, 'no walkway under you: the ground');
  assert.equal(footFloor(8, [], 0, 0, 5, WALKER, 5), 8, 'a ground above the walkway still wins');
  assert.equal(footFloor(0, [box({ h: 1 })], 0, 0, 0.5, WALKER, 3), 3, 'the highest of the three sources');
});

test('footKeyAction_HoverIndoors_IsBlockedAndOutdoorsStaysAsBefore', () => {
  assert.equal(footKeyAction('KeyF'), 'hover');
  assert.equal(footKeyAction('KeyF', false), 'hover');
  assert.equal(footKeyAction('KeyF', true), 'block');
  assert.equal(footKeyAction('KeyC', true), 'block', 'C does nothing on foot: the view is first person already');
  assert.equal(footKeyAction('KeyW', true), 'pass');
  assert.equal(footKeyAction('KeyE', true), 'enter');
});
```

- [ ] **Step 2: run:** `node --test prototype/tests/foot.test.mjs` fails (walkway ignored; indoors ignored).
- [ ] **Step 3: implement** in `prototype/foot.js`. Replace `footFloor` and the head of `footKeyAction`:

```js
// #412: `walkway` is walkwayFloor(...) of the walkway surfaces under you (a slab or stair ramp inside a building), or null: the second source
export function footFloor(ground, boxes, x, z, y, cfg = WALKER, walkway = null) {
  let top = ground;
  for (const o of boxes) if (!o.bridge && o.h <= y + cfg.stepUp && o.h > top && inside(o, x, z)) top = o.h;
  return walkway !== null && walkway > top ? walkway : top;
}
```

```js
export function footKeyAction(code, indoors = false) {
  if (code === 'KeyF') return indoors ? 'block' : 'hover';
  // ...the rest (KeyE -> 'enter', FOOT_BLOCKED) exactly as it is
}
```

- [ ] **Step 4: verify** `node --test prototype/tests/*.test.mjs` green (all old foot tests unchanged).
- [ ] **Step 5: commit** `feat(foot): walkway floor source and no hover indoors (#412)`.

### Task 3: The stair hall layout (#411)

**Files:** `prototype/tests/stairhall.test.mjs`, `prototype/stairhall.js`.

**Interfaces:** the exports of Step 3 (`STAIRHALL`, `floorLabel`, `keypadLabel`, `hudFloorText`, `hallLevels`, `floorAtY`, `hallFrame`, `stairHall(entrance, porch, floors, eg)`, `hallRoofSlab`, `hallArea`, `bodyColliderOff`, `wallByTag`, `DOOR_CLOSE_AT`, `doorShouldClose`). `porch = { w, d }` and `entrance = { x, z, th }` come from `bodenackerHouse(layout, '6c').porch`, `floors` from `layout.floors`, `eg` is the ground-floor height.

Wall tags (all in `hall.walk.walls`): `front:0:l`, `front:0:r`, `front:0:lintel`, `front:1` ... `front:10`, `left`, `back`, `right`, `shaft:right`, `shaft:back`, `well`,
`rail`, `under:r`, `under:l` (drawn to `vy1`, 1.0 m collision height), `divider:l`, `divider:r`, `lift:0` ... `lift:10` (the leaves), `liftLintel:0` ... `liftLintel:10`,
`housing:left:a`, `housing:left:b`, `roofDoor` (the leaf), `roofDoorLintel`, `porch:l`, `porch:r`, `porch:front:l`, `porch:front:r`, `porch:door` (the leaf), `porch:lintel`, and
after `hallRoofSlab` `edge`. The leaves are `off` when open.

- [ ] **Step 1: write the failing tests.** Create `prototype/tests/stairhall.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WALKER } from '../foot.js';
import { walkwayFloor, walkwayCeiling, walkwayPush, WALKWAY, wallActive } from '../walkways.js';
import { STAIRHALL, stairHall, hallLevels, floorAtY, floorLabel, keypadLabel, hudFloorText, hallFrame, hallArea, bodyColliderOff, hallRoofSlab, wallByTag, doorShouldClose } from '../stairhall.js';

const EG = 312.4, FLOORS = { pitch: 2.53, floors: Array.from({ length: 10 }, (_, k) => EG + k * 2.53), roof: EG + 25.3 + 0.5, housingTop: EG + 25.3 + 0.5 + 2.6 };
const ENTRANCE = { x: 2100, z: -380, th: 0.7, w: 1.0 }, PORCH = { w: 2.3, d: 2.9 };
const hall = () => stairHall(ENTRANCE, PORCH, FLOORS, EG);
const at = (h, a, b) => h.frame.toWorld(a, b);
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('hallLevels_FromEgAndFloors_TenStoreysThenTheRoof', () => {
  const lv = hallLevels(EG, FLOORS);
  assert.equal(lv.length, 11); close(lv[0], EG); close(lv[9], EG + 9 * 2.53); close(lv[10], FLOORS.roof);
});

test('floorAtY_OnStairsAndLandings_NamesTheStoreyBelowTheHalfLanding', () => {
  const lv = hallLevels(EG, FLOORS);
  assert.equal(floorAtY(lv, EG), 0);
  assert.equal(floorAtY(lv, lv[4]), 4);
  assert.equal(floorAtY(lv, lv[4] + 1.265), 4, 'half landing');
  assert.equal(floorAtY(lv, lv[5] - 0.1), 5, 'top of the flight');
  assert.equal(floorAtY(lv, lv[10]), 10);
  assert.equal(floorAtY(lv, lv[0] - 3), 0);
});

test('floorLabel_SwissNaming_EgOgDach_AndEnglish', () => {
  assert.deepEqual([0, 1, 4, 9, 10].map(k => floorLabel(k, 'de')), ['EG', '1. OG', '4. OG', '9. OG', 'Dach']);
  assert.deepEqual([0, 1, 2, 3, 4, 9, 10].map(k => floorLabel(k, 'en')), ['ground floor', '1st floor', '2nd floor', '3rd floor', '4th floor', '9th floor', 'roof']);
  assert.equal(hudFloorText('6c', 4, 'de'), '6c · 4. OG');
  assert.equal(hudFloorText('6c', 4, 'en'), '6c · 4th floor');
  assert.equal(hudFloorText('6c', 0, 'en'), '6c · ground floor');
});

test('keypadLabel_Buttons_EgOneToNineDach', () => {
  assert.deepEqual([0, 1, 9, 10].map(k => keypadLabel(k, 'de')), ['EG', '1', '9', 'Dach']);
  assert.equal(keypadLabel(10, 'en'), 'Roof');
});

test('hallFrame_RoundTrip_AndTheAxisPointsIntoTheBuilding', () => {
  const f = hallFrame(ENTRANCE, PORCH.d), [x, z] = f.toWorld(3, -1), p = f.fromWorld(x, z);
  close(p.a, 3); close(p.b, -1);
  const [x1, z1] = f.toWorld(0, 0);
  close(Math.hypot(x1 - ENTRANCE.x, z1 - ENTRANCE.z), PORCH.d);
  close(Math.atan2(z1 - ENTRANCE.z, x1 - ENTRANCE.x), ENTRANCE.th);
});

test('stairHall_StairWidth_IsTwoFortyBetweenFifteenCentimetreWalls', () => {
  const h = hall(), left = wallByTag(h, 'left'), div = wallByTag(h, 'divider:l');
  const bOf = (w) => h.frame.fromWorld(w.x, w.z).b;
  const gap = (bOf(div) - div.hd) - (bOf(left) + left.hd);
  close(gap, STAIRHALL.inner, 1e-9);
  close(left.hd * 2, STAIRHALL.wall, 1e-9); close(div.hd * 2, STAIRHALL.wall, 1e-9);
});

// walking the stairs: the centre line of every storey, landing -> left flight -> half landing -> right flight -> next landing
function climb(h, k) {
  const pts = [[0.7, -0.65], [1.4, -0.65], [3.4, -0.65], [4.1, -0.65], [4.1, 0.65], [3.4, 0.65], [1.4, 0.65], [0.7, 0.65]], out = [];
  for (let i = 1; i < pts.length; i++) for (let t = 0; t < 1; t += 0.02) out.push(at(h, pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t));
  return out;
}

test('stairHall_EveryStorey_CanBeClimbedWithoutAJumpOrABump', () => {
  const h = hall();
  for (let k = 0; k < 10; k++) {
    let y = h.levels[k];
    for (const [x, z] of climb(h, k)) {
      const f = walkwayFloor(h.walk, x, z, y, WALKER);
      assert.notEqual(f, null, `storey ${k}: floor under the path`);
      assert.ok(Math.abs(f - y) <= 0.2, `storey ${k}: step of ${f - y}`);
      y = f;
      const c = walkwayCeiling(h.walk, x, z, y, WALKER);
      assert.ok(c === null || c - y >= WALKWAY.head, `storey ${k}: headroom ${c - y}`);
      assert.equal(walkwayPush(h.walk, x, z, y, WALKER.radius).length, 0, `storey ${k}: a wall in the way at ${x.toFixed(1)}`);
    }
    close(y, h.levels[k + 1], 1e-6);
  }
});

test('stairHall_Walls_FrontDoorIsOpenAtEgButWindowsAreNotDoors', () => {
  const h = hall(), [dx, dz] = at(h, 0.05, 0), [wx, wz] = at(h, 0.05, 2.0);
  assert.equal(walkwayPush(h.walk, dx, dz, h.levels[0], WALKER.radius).length, 0, 'through the door gap');
  const [sx, sz] = at(h, 0.05, 0.9);
  assert.ok(walkwayPush(h.walk, sx, sz, h.levels[0], WALKER.radius).length > 0, 'beside the door is wall');
  assert.equal(h.windows.length, 9);
  assert.deepEqual(h.windows.map(w => w.k), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const w of h.windows) assert.ok(w.y0 > h.levels[w.k] && w.y1 < h.levels[w.k + 1], 'a window is inside its storey');
  assert.ok(walkwayPush(h.walk, wx, wz, h.levels[3], WALKER.radius).length > 0, 'cannot walk out through a window');
});

test('stairHall_LiftDoors_OneLeafPerLevelAndOpeningItClearsTheGap', () => {
  const h = hall(), [x, z] = at(h, 0.7, 1.275);
  for (let k = 0; k <= 10; k++) {
    const leaf = wallByTag(h, `lift:${k}`); assert.ok(leaf, `leaf ${k}`);
    assert.ok(walkwayPush(h.walk, x, z, h.levels[k], 0.1).length > 0, `shut at ${k}`);
    leaf.off = true;
    assert.equal(walkwayPush(h.walk, x, z, h.levels[k], 0.1).length, 0, `open at ${k}`);
    leaf.off = false;
  }
});

test('stairHall_Walls_OnlyBlockOnTheirOwnStorey', () => {
  const h = hall(), w = wallByTag(h, 'front:4');
  assert.equal(wallActive(w, h.levels[4]), true);
  assert.equal(wallActive(w, h.levels[5]), false);
  assert.equal(wallActive(w, h.levels[3]), false);
});

test('stairHall_Porch_SlabRoofAndDoorLeaf', () => {
  const h = hall(), [x, z] = at(h, -1.5, 0);
  close(walkwayFloor(h.walk, x, z, EG, WALKER), EG);
  assert.equal(walkwayCeiling(h.walk, x, z, EG, WALKER), EG + 3.0);
  const door = wallByTag(h, 'porch:door'); assert.ok(door);
  const [dx, dz] = at(h, -PORCH.d, 0);
  assert.ok(walkwayPush(h.walk, dx, dz, EG, 0.3).length > 0); door.off = true;
  assert.equal(walkwayPush(h.walk, dx, dz, EG, 0.3).length, 0);
});

test('stairHall_Housing_RoofLobbyHasADoorOntoTheRoofAndAHousingCeiling', () => {
  const h = hall(), roof = FLOORS.roof, [x, z] = at(h, 0.7, 0);
  assert.ok(walkwayCeiling(h.walk, x, z, roof, WALKER) > roof + WALKWAY.head, 'room to stand under the housing roof');
  assert.ok(walkwayCeiling(h.walk, x, z, roof, WALKER) <= FLOORS.housingTop, 'a jump cannot leave the housing');
  const leaf = wallByTag(h, 'roofDoor'), [lx, lz] = at(h, 0.8, -1.275);
  assert.ok(walkwayPush(h.walk, lx, lz, roof, 0.1).length > 0); leaf.off = true;
  assert.equal(walkwayPush(h.walk, lx, lz, roof, 0.1).length, 0);
});

test('hallRoofSlab_BodyRing_RoofWalkableWithTheTowerCutOutAndRailedEdge', () => {
  const h = hall(), [cx, cz] = at(h, 10, 0);
  const ring = [-30, 30].flatMap(du => [-8, 8].map(dv => [cx + du, cz + dv]));
  const body = [ring[0], ring[1], ring[3], ring[2]];
  hallRoofSlab(h, body);
  const roof = FLOORS.roof;
  close(walkwayFloor(h.walk, cx, cz, roof, WALKER), roof);
  const [tx, tz] = at(h, 3, 0);
  assert.equal(walkwayFloor(h.walk, tx, tz, roof, WALKER) === roof, false, 'the tower hole is no roof (the flights are below)');
  const edge = h.walk.walls.filter(w => w.tag === 'edge'); assert.equal(edge.length, 4);
  assert.ok(walkwayPush(h.walk, cx - 30.1, cz - 8, roof, 0.35).length > 0, 'cannot step over the edge');
  assert.equal(walkwayPush(h.walk, cx, cz, roof, 0.35).length, 0);
});

test('hallArea_PointsOnAndAroundThePorchAndTower', () => {
  const h = hall();
  assert.equal(hallArea(h, ...at(h, 2, 0)), 'tower');
  assert.equal(hallArea(h, ...at(h, 1, 2)), 'tower', 'the shaft');
  assert.equal(hallArea(h, ...at(h, -1, 0)), 'porch');
  assert.equal(hallArea(h, ...at(h, -PORCH.d - 1, 0)), 'out');
  assert.equal(hallArea(h, ...at(h, 10, 0)), 'out');
});

test('bodyColliderOff_InsideOrAtAnOpenDoor_ButNotAtAShutOne', () => {
  const h = hall(), front = at(h, -PORCH.d - 1, 0);
  assert.equal(bodyColliderOff(h, ...at(h, 2, 0), false), true);
  assert.equal(bodyColliderOff(h, ...front, false), false);
  assert.equal(bodyColliderOff(h, ...front, true), true, 'open door within reach');
  assert.equal(bodyColliderOff(h, ...at(h, -PORCH.d - 8, 0), true), false, 'far from the door');
});

test('doorShouldClose_WalkedAwayFromTheOutside_Only', () => {
  const h = hall();
  assert.equal(doorShouldClose(h, ...at(h, -PORCH.d - 6, 0), 'out'), true);
  assert.equal(doorShouldClose(h, ...at(h, -PORCH.d - 1, 0), 'out'), false);
  assert.equal(doorShouldClose(h, ...at(h, 2, 0), 'tower'), false);
});
```

- [ ] **Step 2: run:** fails with `Cannot find module '../stairhall.js'`.
- [ ] **Step 3: implement.** Create `prototype/stairhall.js`:

```js
// #411 stage 1: the stair hall of Bodenackerstrasse 6c as walkways (walkways.js). Pure: no three.js, no DOM.
// Hall frame: origin O on the facade line at the porch door's axis; a = metres into the building (heading entrance.th), b = to the right, so
// world(a, b) = O + a * (cos th, sin th) + b * (-sin th, cos th); the porch is at a < 0. Plan (a, b), walls 0.15 thick:
//   b -1.35 .. -1.2 left wall | stairs -1.2 .. 1.2 (inner width 2.40) | 1.2 .. 1.35 divider | lift shaft 1.35 .. 2.5 | 2.5 .. 2.65 right wall
//   a 0 .. 0.15 facade wall | landing 0.15 .. 1.3 | flights 1.3 .. 3.5 (left up, right back up, well wall between) | half landing 3.5 .. 4.7 | back wall to 4.85
// Levels 0..9 are EG and 1.-9. OG, level 10 is the roof; the housing around the tower rises to housingTop. Spec: docs/superpowers/specs/2026-10-22-enter-6c-stage1-design.md
import { emptyWalkways } from './walkways.js';

export const STAIRHALL = {
  storeys: 10,
  wall: 0.15, inner: 2.40,
  land: 1.3, run: 2.2, half: 1.2, depth: 4.85,
  b0: -1.35, b1: 2.65,                              // the tower's outer width, shaft included
  shaft: { b0: 1.35, b1: 2.5, a0: 0.15, a1: 1.25 },
  liftDoor: { a0: 0.3, a1: 1.1, h: 2.1 }, frontDoor: { b0: -0.6, b1: 0.6, h: 2.2 }, roofDoor: { a0: 0.35, a1: 1.25, h: 2.1 },
  window: { b0: -0.6, b1: 0.6, sill: 0.9, top: 2.0 },
  rail: 1.1, porchH: 3.0, door: 1.0,
};

const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
export const FLOOR_LABELS = {
  de: (k) => (k === 0 ? 'EG' : k === 10 ? 'Dach' : `${k}. OG`),
  en: (k) => (k === 0 ? 'ground floor' : k === 10 ? 'roof' : `${ORDINAL[k]} floor`),
};
// "6c · 4. OG" / "6c · 4th floor"
export const floorLabel = (k, lang) => (FLOOR_LABELS[lang] || FLOOR_LABELS.en)(k);
export const keypadLabel = (k, lang) => (k === 0 ? 'EG' : k === 10 ? (lang === 'de' ? 'Dach' : 'Roof') : String(k));
export const hudFloorText = (house, k, lang) => `${house} · ${floorLabel(k, lang)}`;

// the eleven level heights: EG at eg, then one pitch each, the roof last
export function hallLevels(eg, floors, cfg = STAIRHALL) {
  const lv = Array.from({ length: cfg.storeys }, (_, k) => eg + k * floors.pitch);
  lv.push(floors.roof);
  return lv;
}

// the storey a walker at height y is on: the highest level at most stepUp above the feet (a half landing still counts as the lower storey)
export function floorAtY(levels, y, reach = 0.6) {
  let k = 0;
  for (let i = 0; i < levels.length; i++) if (levels[i] <= y + reach) k = i;
  return k;
}

export function hallFrame(entrance, porchDepth) {
  const c = Math.cos(entrance.th), s = Math.sin(entrance.th), ox = entrance.x + c * porchDepth, oz = entrance.z + s * porchDepth;
  return {
    ox, oz, th: entrance.th, c, s,
    toWorld: (a, b) => [ox + c * a - s * b, oz + s * a + c * b],
    fromWorld: (x, z) => ({ a: (x - ox) * c + (z - oz) * s, b: -(x - ox) * s + (z - oz) * c }),
  };
}

const rectAB = (f, a0, a1, b0, b1) => { const [x, z] = f.toWorld((a0 + a1) / 2, (b0 + b1) / 2); return { x, z, hw: (a1 - a0) / 2, hd: (b1 - b0) / 2, c: f.c, s: f.s }; };
// a ramp climbing from a0 (height y0) to a1 (height y1); a1 < a0 turns it around
function rampAB(f, a0, a1, b0, b1, y0, y1) {
  const r = rectAB(f, Math.min(a0, a1), Math.max(a0, a1), b0, b1);
  return a1 >= a0 ? { ...r, y0, y1 } : { ...r, c: -f.c, s: -f.s, y0, y1 };
}

// layout(entrance, porch, floors, eg) -> the hall: { frame, levels, walk, windows, doors, cabinRect, ... }. porch = { w, d } from bodenackerHouse().
export function stairHall(entrance, porch, floors, eg, cfg = STAIRHALL) {
  const f = hallFrame(entrance, porch.d), lv = hallLevels(eg, floors, cfg), top = floors.housingTop, walk = emptyWalkways();
  const wall = (tag, a0, a1, b0, b1, y0, y1) => walk.walls.push({ ...rectAB(f, a0, a1, b0, b1), y0, y1, tag });
  const slab = (a0, a1, b0, b1, y) => walk.slabs.push({ ...rectAB(f, a0, a1, b0, b1), y });
  const { wall: t, land, run, half, depth, b0, b1 } = cfg, aFl = land + run;   // aFl = 3.5, where the flights meet the half landing
  const L = (k) => lv[k], roof = L(cfg.storeys), N = cfg.storeys;

  // floors: EG over the whole footprint and the porch, the storey landings, the half landings, the door thresholds
  slab(-porch.d, 0, -porch.w / 2, porch.w / 2, L(0));
  slab(0, depth, b0, b1, L(0));
  for (let k = 1; k <= N; k++) slab(t, land, -1.2, 1.2, L(k));
  for (let k = 0; k < N; k++) slab(aFl, aFl + half, -1.2, 1.2, (L(k) + L(k + 1)) / 2);
  for (let k = 0; k <= N; k++) slab(cfg.liftDoor.a0, cfg.liftDoor.a1, 1.2, 1.35, L(k));
  // flights: left climbs away from the landing, right climbs back to it
  for (let k = 0; k < N; k++) {
    const mid = (L(k) + L(k + 1)) / 2;
    walk.ramps.push(rampAB(f, land, aFl, -1.2, -0.1, L(k), mid));
    walk.ramps.push(rampAB(f, aFl, land, 0.1, 1.2, mid, L(k + 1)));
  }

  // walls. Front (façade) wall: EG with the door, then one piece per storey (a window each on 1. OG ... 9. OG)
  wall('front:0:l', 0, t, b0, cfg.frontDoor.b0, L(0), L(1));
  wall('front:0:r', 0, t, cfg.frontDoor.b1, b1, L(0), L(1));
  wall('front:0:lintel', 0, t, cfg.frontDoor.b0, cfg.frontDoor.b1, L(0) + cfg.frontDoor.h, L(1));
  for (let k = 1; k < N; k++) wall(`front:${k}`, 0, t, b0, b1, L(k), L(k + 1));
  wall(`front:${N}`, 0, t, b0, b1, roof, top);
  // left wall, back wall, right of the stairs, the shaft's right and back wall: the whole height
  wall('left', t, depth, b0, -1.2, L(0), roof);
  wall('back', depth - t, depth, b0, 1.35, L(0), top);
  wall('right', 1.4, depth, 1.2, 1.35, L(0), top);
  wall('shaft:right', t, 1.4, 2.5, b1, L(0), top);
  wall('shaft:back', 1.25, 1.4, 1.35, 2.5, L(0), top);
  // the well between the flights: a wall up to a handrail over the roof; a rail across the left flight's top at roof level
  wall('well', land, aFl, -0.1, 0.1, L(0), roof + cfg.rail);
  wall('rail', land, land + 0.1, -1.2, -0.1, roof, roof + cfg.rail);
  // under the right flight and the half landing the EG headroom is too low to walk
  // (1.0 m high so that a walker on the half landing, 1.265 up, is not held by them; vy1 = how tall they are drawn)
  walk.walls.push({ ...rectAB(f, 2.05, depth - t, 0.1, 1.2), y0: L(0), y1: L(0) + 1.0, vy1: L(0) + 2.5, tag: 'under:r' });
  walk.walls.push({ ...rectAB(f, aFl, depth - t, -1.2, -0.1), y0: L(0), y1: L(0) + 1.0, vy1: L(0) + 2.5, tag: 'under:l' });
  // the divider between landing and shaft: a lift door gap per level (leaf = the door, lintel above it)
  const d = cfg.liftDoor;
  wall('divider:l', t, d.a0, 1.2, 1.35, L(0), top);
  wall('divider:r', d.a1, 1.4, 1.2, 1.35, L(0), top);
  for (let k = 0; k <= N; k++) {
    wall(`lift:${k}`, d.a0, d.a1, 1.2, 1.35, L(k), L(k) + d.h);
    wall(`liftLintel:${k}`, d.a0, d.a1, 1.2, 1.35, L(k) + d.h, k === N ? top : L(k + 1));
  }
  // the housing's side door onto the roof (left wall above the roof): the leaf is a wall that opens
  const r = cfg.roofDoor;
  wall('housing:left:a', t, r.a0, b0, -1.2, roof, top);
  wall('housing:left:b', r.a1, depth, b0, -1.2, roof, top);
  wall('roofDoor', r.a0, r.a1, b0, -1.2, roof, roof + r.h);
  wall('roofDoorLintel', r.a0, r.a1, b0, -1.2, roof + r.h, top);
  // the porch: side panes, the front with the door leaf between two side lights, a roof
  const pw = porch.w / 2;
  wall('porch:l', -porch.d, 0, -pw - 0.05, -pw, L(0), L(0) + cfg.porchH);
  wall('porch:r', -porch.d, 0, pw, pw + 0.05, L(0), L(0) + cfg.porchH);
  wall('porch:front:l', -porch.d - 0.05, -porch.d, -pw, -cfg.door / 2, L(0), L(0) + cfg.porchH);
  wall('porch:front:r', -porch.d - 0.05, -porch.d, cfg.door / 2, pw, L(0), L(0) + cfg.porchH);
  wall('porch:door', -porch.d - 0.05, -porch.d, -cfg.door / 2, cfg.door / 2, L(0), L(0) + cfg.frontDoor.h);
  wall('porch:lintel', -porch.d - 0.05, -porch.d, -cfg.door / 2, cfg.door / 2, L(0) + cfg.frontDoor.h, L(0) + cfg.porchH);
  walk.ceilings.push({ ...rectAB(f, -porch.d, 0, -pw, pw), y: L(0) + cfg.porchH });
  // the housing's roof; the roof deck itself is added by the caller (it needs the building's ring): hallRoofSlab()
  walk.ceilings.push({ ...rectAB(f, 0, depth, b0, b1), y: top - 0.15 });

  const windows = [];
  for (let k = 1; k < N; k++) windows.push({ k, a: 0, b0: cfg.window.b0, b1: cfg.window.b1, y0: L(k) + cfg.window.sill, y1: L(k) + cfg.window.top });
  const flatDoors = Array.from({ length: N }, (_, k) => ({ k, a: 0.75, b: -1.2, y: L(k) }));   // closed doors on the left wall, visual only
  const cabinRect = rectAB(f, cfg.shaft.a0, cfg.shaft.a1, cfg.shaft.b0, cfg.shaft.b1);
  return { frame: f, levels: lv, walk, windows, flatDoors, cabinRect, porch, entrance, housingTop: top,
    towerRect: rectAB(f, 0, depth, b0, b1), roofHole: rectAB(f, 0, depth, b0, b1), housing: { a0: 0, a1: depth, b0, b1, y0: roof, y1: top } };
}

// the roof deck: the body ring as a polygon with the tower cut out; rails along its edge (invisible, 1.2 m)
export function hallRoofSlab(hall, bodyWorld) {
  const roof = hall.levels[hall.levels.length - 1], walk = hall.walk;
  walk.slabs.push({ poly: bodyWorld, holes: [hall.roofHole], y: roof });
  for (let i = 0; i < bodyWorld.length; i++) {
    const [ax, az] = bodyWorld[i], [bx, bz] = bodyWorld[(i + 1) % bodyWorld.length], len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) continue;
    walk.walls.push({ x: (ax + bx) / 2, z: (az + bz) / 2, hw: len / 2 + 0.2, hd: 0.1, c: (bx - ax) / len, s: (bz - az) / len, y0: roof, y1: roof + 1.2, tag: 'edge' });
  }
}

// where a point is relative to the hall: 'out', 'porch' or 'tower'
export function hallArea(hall, x, z, cfg = STAIRHALL) {
  const { a, b } = hall.frame.fromWorld(x, z), pw = hall.porch.w / 2;
  if (a >= 0 && a <= cfg.depth && b >= cfg.b0 && b <= cfg.b1) return 'tower';
  if (a >= -hall.porch.d && a < 0 && Math.abs(b) <= pw) return 'porch';
  return 'out';
}

// the building's own collider (the OSM outline) must not push the walker out of the porch or the tower; at an open door it stands aside
export function bodyColliderOff(hall, x, z, doorOpen, reach = 1.5) {
  if (hallArea(hall, x, z) !== 'out') return true;
  return doorOpen && Math.hypot(x - hall.entrance.x, z - hall.entrance.z) <= reach;
}

// the walkway wall with this tag, to open/close doors
export const wallByTag = (hall, tag) => hall.walk.walls.find(w => w.tag === tag);

// what a walker at the door of the entrance can do: the leaf opens by E; it shuts again when the walker is `closeAt` m away
export const DOOR_CLOSE_AT = 4;
export const doorShouldClose = (hall, x, z, area) => area === 'out' && Math.hypot(x - hall.entrance.x, z - hall.entrance.z) > DOOR_CLOSE_AT;
```

- [ ] **Step 4: verify:** `node --test prototype/tests/stairhall.test.mjs`, then the whole node suite. The test `stairHall_EveryStorey_CanBeClimbedWithoutAJumpOrABump` walks the centre line of every storey; if you change a constant and it fails, fix the geometry, not the test.
- [ ] **Step 5: commit** `feat(buildings): the stair hall of 6c as walkways (#411)`.

### Task 4: The tower lift's logic (#411)

**Files:** `prototype/tests/towerlift.test.mjs`, `prototype/towerlift.js`.

**Interfaces:** `TOWER_LIFT = { speed: 2.5, minRide: 1.5, door: 1, hold: 4 }`; `createTowerLift(levels)` with `.y .at .target .moving .busy .door .doorOpenAt(k) .call(k) .step(dt, { occupied })` as in Step 3 (`call` is refused while a trip runs; the current level just opens the door; `step` returns `{ type: 'start' | 'arrive', level }` events).

It reuses `createLift()` from `lift.js` (closing, 'descending' = moving, opening) with `setTimes({ ride })` per trip; it does not touch the freight lift.

- [ ] **Step 1: write the failing tests.** Create `prototype/tests/towerlift.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTowerLift, TOWER_LIFT } from '../towerlift.js';

const LEVELS = Array.from({ length: 10 }, (_, k) => 100 + k * 2.53).concat([100 + 25.3 + 0.5]);
const run = (lift, secs, input = {}, dt = 0.05) => { const ev = []; for (let t = 0; t < secs - 1e-9; t += dt) ev.push(...lift.step(dt, input)); return ev; };

test('createTowerLift_Fresh_StandsAtEgWithTheDoorShut', () => {
  const l = createTowerLift(LEVELS);
  assert.equal(l.at, 0); assert.equal(l.y, LEVELS[0]); assert.equal(l.door, 0); assert.equal(l.busy, false);
});

test('call_ToAnotherLevel_StartsARideThatArrivesThere', () => {
  const l = createTowerLift(LEVELS);
  assert.equal(l.call(5), true);
  const ev = run(l, 30);
  assert.deepEqual(ev.map(e => e.type), ['start', 'arrive']);
  assert.equal(l.at, 5); assert.equal(l.y, LEVELS[5]); assert.equal(l.busy, false);
});

test('call_Roof_ReachesTheRoofLevel', () => {
  const l = createTowerLift(LEVELS);
  l.call(10); run(l, 40);
  assert.equal(l.at, 10); assert.equal(l.y, LEVELS[10]);
});

test('step_DuringTheRide_YRisesMonotonicallyAndTheLeafStaysShut', () => {
  const l = createTowerLift(LEVELS); l.call(4);
  let last = l.y, moved = false;
  for (let i = 0; i < 400 && (l.busy || i < 2); i++) {
    l.step(0.05);
    assert.ok(l.y >= last - 1e-9, 'never down on the way up'); last = l.y;
    if (l.moving) { moved = true; for (let k = 0; k < 11; k++) assert.equal(l.doorOpenAt(k), false); }
  }
  assert.ok(moved);
});

test('call_WhileRiding_IsRefusedAndAnUnknownLevelToo', () => {
  const l = createTowerLift(LEVELS); l.call(3); run(l, 0.5);
  assert.equal(l.call(7), false);
  const m = createTowerLift(LEVELS);
  assert.equal(m.call(11), false); assert.equal(m.call(-1), false); assert.equal(m.call(2.5), false);
});

test('call_AtTheCurrentLevel_OpensTheDoor', () => {
  const l = createTowerLift(LEVELS);
  assert.equal(l.call(0), true);
  run(l, TOWER_LIFT.door + 0.2);
  assert.equal(l.doorOpenAt(0), true);
});

test('step_AfterTheHold_TheDoorClosesUnlessSomeoneIsInside', () => {
  const l = createTowerLift(LEVELS); l.call(2); while (l.busy) l.step(0.05);
  assert.equal(l.doorOpenAt(2), true, 'open on arrival');
  run(l, TOWER_LIFT.hold + 2, { occupied: true }); assert.equal(l.doorOpenAt(2), true, 'kept open');
  run(l, TOWER_LIFT.hold + 2, { occupied: false }); assert.equal(l.door, 0, 'shut again');
});

test('call_RideAfterRide_WorksWithoutLeavingThePlatform', () => {
  const l = createTowerLift(LEVELS);
  l.call(3); run(l, 20); l.call(1); run(l, 20); l.call(9); run(l, 40);
  assert.equal(l.at, 9);
});

test('step_RideTime_GrowsWithTheDistance', () => {
  const dur = (to) => { const l = createTowerLift(LEVELS); l.call(to); let t = 0; while (l.busy && t < 100) { l.step(0.05); t += 0.05; } return t; };
  assert.ok(dur(9) > dur(2));
  assert.ok(dur(1) >= TOWER_LIFT.minRide + 2 * TOWER_LIFT.door - 0.1);
});
```

- [ ] **Step 2: run:** fails with `Cannot find module '../towerlift.js'`.
- [ ] **Step 3: implement.** Create `prototype/towerlift.js`:

```js
// #411 stage 1: the tower lift's logic -- pure. A cabin that stops at the 11 levels (EG, 1. ... 9. OG, roof); the ride itself is the lift.js
// state machine (closing -> moving -> opening), re-timed per trip to the distance. Not tied to the freight lift's two levels.
import { createLift } from './lift.js';

export const TOWER_LIFT = { speed: 2.5, minRide: 1.5, door: 1, hold: 4 };   // m/s, s, s (door opens/closes), s (the door stays open after an arrival)

export function createTowerLift(levels, cfg = TOWER_LIFT) {
  const machine = createLift({ dwell: 0, close: cfg.door, ride: 1, open: cfg.door, stopSpeed: 0.5, floors: 12 });
  let at = 0, y = levels[0], from = 0, target = null, pending = null, t = 0, idle = cfg.hold;   // idle: seconds since the last arrival or call
  const api = {
    levels,
    get y() { return y; },
    get at() { return machine.busy ? null : at; },     // the level it stands at, null while a trip runs
    get target() { return target; },
    get moving() { return machine.phase === 'descending'; },
    get busy() { return machine.busy || pending !== null; },
    get door() { return machine.door; },                // 0 shut ... 1 open
    // the leaf of a level is open when the cabin stands there with the door fully open
    doorOpenAt(k) { return !machine.busy && at === k && machine.door >= 0.9; },
    call(k) {
      if (!Number.isInteger(k) || k < 0 || k >= levels.length || machine.busy) return false;
      idle = 0;
      if (k === at) return true;                        // already here: the door just opens (again)
      pending = k; return true;
    },
    // dt, { occupied }: someone in the cabin keeps the door open while it stands. Returns the events: { type: 'start' | 'arrive', level }
    step(dt, { occupied = false } = {}) {
      const out = [];
      if (machine.phase === 'idle') {
        idle += dt;
        if (pending !== null) {
          from = at; target = pending; pending = null;
          machine.setTimes({ ride: Math.max(cfg.minRide, Math.abs(levels[target] - levels[from]) / cfg.speed) });
          machine.step(0, { onPlatform: false });       // re-arm after the last ride
          machine.step(dt, { onPlatform: true, speed: 0, dir: 'down' });
          t = 0; out.push({ type: 'start', level: target });
        } else machine.step(dt, { onPlatform: false, near: occupied || idle < cfg.hold });
        return out;
      }
      const wasMoving = machine.phase === 'descending';
      const ev = machine.step(dt, { onPlatform: true, speed: 0, dir: 'down' });
      if (machine.phase === 'descending' || wasMoving) {
        t += dt;
        const k = Math.min(1, t / machine.times.ride), e = k * k * (3 - 2 * k);   // eased
        y = levels[from] + (levels[target] - levels[from]) * e;
      }
      for (const e of ev) if (e.type === 'done') { at = target; target = null; y = levels[at]; idle = 0; out.push({ type: 'arrive', level: at }); }
      return out;
    },
  };
  return api;
}
```

- [ ] **Step 4: verify** the lift tests and the whole node suite (`lift.test.mjs` must stay green: `lift.js` is not edited).
- [ ] **Step 5: commit** `feat(buildings): the tower lift's stops and rides (#411)`.

### Task 5: Strings (de/en) and the help row

**Files:** `prototype/strings.js`, `prototype/tests/strings.test.mjs`, `prototype/index.html` (one help row).

**Interfaces:** three new keys in **both** `en` and `de` (same keys, German in Swiss spelling, no sharp s, real umlauts):

| key | en | de |
|---|---|---|
| `liftCall` | `E · call the lift` | `E · Lift rufen` |
| `liftPadTitle` | `Lift` | `Lift` |
| `keyLift` | `in the lift: 0-9 pick the floor (0 = ground floor), D the roof` | `im Lift: 0-9 wählt das Stockwerk (0 = EG), D das Dach` |

(the floor names come from `stairhall.js`, not from here, so they stay pure functions of `lang`.)

- [ ] **Step 1: failing test** in `prototype/tests/strings.test.mjs` (the file's existing parity test already fails once a key is only in one language; add this one for the content):

```js
test('lift strings exist in both languages (#411)', () => {
  for (const key of ['liftCall', 'liftPadTitle', 'keyLift']) {
    assert.ok(translate('en', key), `en ${key}`); assert.ok(translate('de', key), `de ${key}`);
    assert.notEqual(translate('en', key), key, `en ${key} is a real text`);
  }
  assert.match(translate('de', 'liftCall'), /^E · Lift rufen$/);
  assert.match(translate('en', 'liftCall'), /^E · call the lift$/);
});
```

- [ ] **Step 2: run** `node --test prototype/tests/strings.test.mjs`: the new test fails.
- [ ] **Step 3: implement:** add the three keys to `en` and `de` in `strings.js`; add to the help list in `index.html`, next to the `E` row of PR#438: `<kbd>0-9 · D</kbd><span data-i18n="keyLift">...</span>` using the English text as the default content.
- [ ] **Step 4: verify** `node --test prototype/tests/*.test.mjs` (the help-filter tests count rows; if one counts rows, update its expected number in the same commit).
- [ ] **Step 5: commit** `feat(i18n): lift strings and help row (#411)`.

### Task 6: Walk through the door into the hall (index.html glue; Playwright test 1)

**Files:** `prototype/tests/test_enter_6c.py` (new), `prototype/index.html`, `prototype/enterables.js`, `prototype/tests/enterables.test.mjs`.

**Interfaces / hooks** (all in `index.html`, near the foot code and the `window.__mm` hooks):

```js
import { walkwayFloor, walkwayCeiling, headBump, walkwayPush } from './walkways.js';
import { stairHall, hallRoofSlab, hallArea, bodyColliderOff, doorShouldClose, wallByTag, hallLevels, floorAtY, hudFloorText, keypadLabel } from './stairhall.js';
import { createTowerLift } from './towerlift.js';
// and bodenackerHouse next to the existing bodenacker6.js import; STAIRHALL too (Task 8)

const INT = { hall: null, house: '6c', on: false, group: null, lift: null, door: { open: 0, target: 0 }, area: 'out', floor: 0, bodyOff: false, indoors: false, pad: false, prompt: null };
// INT.on = the detailed meshes are built; INT.hall exists from the block's construction; INT.indoors = area !== 'out' or standing on the roof deck
window.__mm.interior = () => (updateInterior(), { hall: !!INT.hall, built: INT.on, area: INT.area, indoors: INT.indoors, floor: INT.floor, door: INT.door.open,
  y: P.y, levels: INT.hall && INT.hall.levels, label: $('mapfloor').textContent, hidden: $('mapfloor').hidden,
  lift: INT.lift && { at: INT.lift.at, y: INT.lift.y, door: INT.lift.door, busy: INT.lift.busy, moving: INT.lift.moving },
  entrance: INT.hall && INT.hall.entrance, porch: INT.hall && INT.hall.porch, pad: INT.pad });
window.__mm.interiorSim = (secs) => { for (let i = 0; i < secs * 60; i++) stepInterior(1 / 60); return window.__mm.interior(); };
```

`window.__mm.setFootY = (y) => { P.y = y; FOOT.vy = 0; }` is added here (used by later tests). `window.__mm.footSim` (existing) must also call `stepInterior(1 / 60)` in its loop (one added call), so a headless Playwright run advances the lift and the door.

- [ ] **Step 1: write the failing Playwright test.** Create `prototype/tests/test_enter_6c.py`. Copy the helpers `open_hand`-style from `test_bodenacker6.py` (`open_page`, the `WORLD` path, `needs_world`) and `foot`, `foot_sim`, `press_z` from `test_on_foot.py`; the real world file is needed (skip when absent, like #410's test). Then:

```python
"""#411 stage 1: entering Bodenackerstrasse 6c. Slow (Playwright): run in the foreground."""
import math
import re
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
    page.wait_for_function("() => window.__mm && window.__mm.sim && window.__mm.bodenacker6 && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn")
    return b, page, errors


def hall_point(page, a, b):
    """World x, z of the hall frame point (a into the building, b to the right) -- stairhall.js's frame."""
    return page.evaluate("""([a, b]) => { const i = window.__mm.interior(), e = i.entrance, d = i.porch.d, th = e.th, c = Math.cos(th), s = Math.sin(th);
        const ox = e.x + c * d, oz = e.z + s * d; return [ox + c * a - s * b, oz + s * a + c * b, th]; }""", [a, b])


def stand(page, a, b, face=0.0, level=None):
    """Put the walker at the hall point (a, b), facing the hall's heading + face, on the given level (None: the terrain)."""
    x, z, th = hall_point(page, a, b)
    page.evaluate("([x, z, th]) => window.__mm.place(x, z, th)", [x, z, th + face])
    if level is not None:
        page.evaluate("(k) => window.__mm.setFootY(window.__mm.interior().levels[k])", level)
    return x, z, th


def key(page, name, ms=150):
    page.keyboard.press(name)
    page.wait_for_timeout(ms)


def foot_sim(page, secs, hold=()):
    return page.evaluate("([s, h]) => window.__mm.footSim(s, h)", [secs, list(hold)])


def interior(page):
    return page.evaluate("() => window.__mm.interior()")


@needs_world
def test_e_opens_the_door_and_the_hall_is_reachable_on_foot(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        info = page.evaluate("() => ({ e: window.__mm.bodenacker6().porches.find(p => p.house === '6c').entrance, d: window.__mm.bodenacker6().porches.find(p => p.house === '6c').d })")
        e, d = info["e"], info["d"]
        # the car 12 m in front of the door, then out; the walker is put 1.2 m in front of the door, facing in
        page.evaluate("([x, z, th]) => window.__mm.place(x - Math.cos(th) * 12, z - Math.sin(th) * 12, th)", [e["x"], e["z"], e["th"]])
        key(page, "z", 300)
        page.evaluate("([x, z, th]) => window.__mm.place(x - Math.cos(th) * 1.2, z - Math.sin(th) * 1.2, th)", [e["x"], e["z"], e["th"]])
        outside = interior(page)
        key(page, "e", 300)
        foot_sim(page, 1.2)
        opened = interior(page)
        foot_sim(page, 3.5, ["KeyW"])                      # in through the porch, into the hall (the back wall stops it)
        inside = interior(page)
        key(page, "f", 200)                                 # F: no hover indoors
        hover = page.evaluate("() => window.__mm.foot().hover")
        b.close()
    assert errors == []
    assert outside["hall"] is True and outside["area"] == "out" and outside["indoors"] is False, outside
    assert opened["door"] > 0.9, opened
    assert inside["area"] == "tower" and inside["indoors"] is True and inside["floor"] == 0, inside
    assert abs(inside["y"] - inside["levels"][0]) < 0.05, inside
    assert re.fullmatch(r"6c · (EG|ground floor)", inside["label"]) and inside["hidden"] is False, inside
    assert hover is False
```

(Adapt the helper names if `place` does not keep the walker's `FOOT` state; it only sets `P`.) Add a `server` fixture import only if not provided by `conftest.py` (it is).

- [ ] **Step 2: run (foreground) and confirm it fails** because `window.__mm.interior` is not defined: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_enter_6c.py -q`.

- [ ] **Step 3: implement in `index.html`** (find each place by the function name; line numbers drift):

  1. **Imports** as in the Interfaces block above (add to the existing `import` lines for `foot.js`: `footKeyAction` already imported).
  2. **#410's `bodenackerBuilding`:** (a) tag the block's collider: `pushOBB({ ..., ring: b.ring, bodenacker6: true })`; (b) skip the merged housing box for house `6c` (`for (const s of L.stairs) { if (s.house === '6c') continue; ... }`) and the dark merged door box in `porchMesh` for `p.house === '6c'`; (c) after the porches, build the hall once:

  ```js
  const house = bodenackerHouse(L, INT.house), porch = house.porch;
  const entrance = porch.entrance, eg = Math.max(L.floors.floors[0], terrainH(entrance.x, entrance.z));
  INT.hall = stairHall(entrance, { w: porch.w, d: porch.d }, L.floors, eg);
  hallRoofSlab(INT.hall, L.body.map(([u, v]) => L.frame.toWorld(u, v)));
  INT.lift = createTowerLift(INT.hall.levels);
  INT.cabin = { ...INT.hall.cabinRect, y: INT.lift.y };            // the dynamic slab: its y follows the lift every frame
  INT.hall.walk.slabs.push(INT.cabin);
  ```

  3. **`footSolids`:** skip the block's collider while `INT.bodyOff`:
  `.filter(o => !o.off && !(o.bodenacker6 && INT.bodyOff))`.
  4. **`footFloorAt`:**
  ```js
  const footFloorAt = (x, z, y) => {
    const ground = INT.indoors && INT.hall ? INT.hall.levels[0] - 1 : groundH(x, z, y);
    return footFloor(ground, footSolids(x, z), x, z, y, WALKER, INT.hall ? walkwayFloor(INT.hall.walk, x, z, y) : null);
  };
  ```
  5. **`stepOnFoot`:** at the very start `updateInterior()` (area, indoors, bodyOff, floor, door target); after `collideFoot(WALKER.radius)` call `interiorFoot()`:
  ```js
  function interiorFoot() {
    if (!INT.hall) return;
    for (let pass = 0; pass < 2; pass++) for (const h of walkwayPush(INT.hall.walk, P.x, P.z, P.y, WALKER.radius)) { P.x += h.wx * h.pen; P.z += h.wz * h.pen; }
    const fl = footFloorAt(P.x, P.z, P.y), b = headBump({ y: P.y, vy: FOOT.vy }, fl, walkwayCeiling(INT.hall.walk, P.x, P.z, P.y));
    P.y = b.y; FOOT.vy = b.vy;
    if (INT.indoors && FOOT.hover) { FOOT.hover = false; FOOT.vy = 0; }
  }
  ```
  6. **`updateInterior()`** (every foot step and from `stepInterior`): `INT.area = hallArea(INT.hall, P.x, P.z)`; `INT.onRoof = walkwayFloor(...)` non-null and `P.y >= roof - 0.1`; `INT.indoors = INT.area !== 'out' || INT.onRoof`; `INT.bodyOff = bodyColliderOff(INT.hall, P.x, P.z, INT.door.open > 0.5)`; `INT.floor = floorAtY(INT.hall.levels, P.y)`; close the door when `doorShouldClose(INT.hall, P.x, P.z, INT.area)`; HUD: `$('mapfloor').hidden = !INT.indoors; $('mapfloor').textContent = hudFloorText(INT.house, INT.floor, window.GG_LANG)`. Only when `FOOT.on` and the hall exists, else `INT.indoors = false`, `INT.bodyOff = false`, hidden.
  7. **`stepInterior(dt)`** (called from the main `loop` next to `stepLift(dt)` and from `footSim`): `updateInterior()`; door animation `INT.door.open += (INT.door.target - INT.door.open) * Math.min(1, dt * 4)` (snap to the target within 0.01); `wallByTag(INT.hall, 'porch:door').off = INT.door.open > 0.6`.
  8. **HUD element:** in the minimap bar (`#br .bar`) add `<span id="mapfloor" hidden></span>` before the `<b>N ↑</b>`; one CSS rule `#mapfloor{margin-left:8px;color:var(--sun);font-weight:700}`.
  9. **Hover:** in the keydown handler, `const fa = footKeyAction(e.code, INT.indoors);`.
  10. **Enter handler** (PR#438's `ENTER_HANDLERS`): `ENTER_HANDLERS['bodenackerstrasse-6c'] = () => { INT.door.target = 1; };`.
  11. **Register entrance and `ready`:** where PR#438 builds `ENTERABLES`, after `bodenackerBuilding` ran (call a small `registerEntrances()` from the place that runs after the world is built): `const en = ENTERABLES.find(x => x.id === 'bodenackerstrasse-6c'); if (en && INT.hall) en.entrances = [{ ...INT.hall.entrance }];`. In `prototype/enterables.js` set `ready: true` on the `bodenackerstrasse-6c` entry (entrances stay `[]` there; the runtime fills them). In `prototype/tests/enterables.test.mjs` add the test below first (it fails) and fix whichever existing assertion expected every entry to be not ready so that it expects exactly `plattform-sisslerfeld`, `eiffel` and `atomium` to be not ready:

  ```js
  test('ENTERABLE_INFO_BodenackerstrasseSixC_IsReadyAndStillNamesOnlyTheAddress', () => {
    const e = ENTERABLE_INFO.find(x => x.id === 'bodenackerstrasse-6c');
    assert.equal(e.ready, true);
    assert.equal(e.secret, false);
    assert.equal(e.kind, 'building');
    assert.deepEqual(e.name, { de: 'Bodenackerstrasse 6c', en: 'Bodenackerstrasse 6c' });
  });
  ```
  (the entry flips here, on the feature branch, so that the E prompt exists for the tests; the PR is merged as a whole.)
  12. **Hooks:** `window.__mm.interior`, `window.__mm.interiorSim` as in the Interfaces block; add `stepInterior(1 / 60)` to `footSim`'s loop.

  No meshes yet (Task 7): the door state and the walkways work without them.

- [ ] **Step 4: verify:** the new Playwright test is green; then `node --test prototype/tests/*.test.mjs`; then (foreground, one file at a time, after pushing) `test_on_foot.py` and `test_bodenacker6.py`.
- [ ] **Step 5: commit** `feat(foot): walk through the door of 6c into the hall (#411)` and push.

### Task 7: The hall's meshes, the door leaf, windows and flat doors (index.html)

**Files:** `prototype/index.html`, `prototype/tests/test_enter_6c.py`.

**What gets drawn** (from the walkway set, so collision and picture cannot drift apart):

- `buildInterior()` creates `INT.group` (a `THREE.Group` added to the scene) when the distance to the entrance falls under 40 m; `disposeInterior()` removes it and disposes geometries when over 55 m (hysteresis; check once per frame from `stepInterior`, also when not on foot). `INT.on` is true while it exists. Also `INT.housing.visible = false` while it exists (the permanent low-poly housing, below).
- Helper (the room code's `roomBasin` kerbs use the same rotation):

```js
function obbBox(o, y0, y1) {   // an OBB footprint as a box geometry, world position
  const g = new THREE.BoxGeometry(2 * o.hw, y1 - y0, 2 * o.hd);
  g.rotateY(-Math.atan2(o.s, o.c)); g.translate(o.x, (y0 + y1) / 2, o.z);
  return g;
}
```

- **Slabs** (`walk.slabs` that have `hw`; skip the polygon roof deck, #410 draws the roof): `obbBox(s, s.y - WALKWAY.thick, s.y)`, concrete grey `0x9a9a96`; skip the dynamic cabin slab.
- **Ramps**: 7 treads each. Tread `i` (0..6) is a box along the ramp: footprint `hw/7` long, full width, top at `rampY` of the tread's middle, thickness `WALKWAY.thick`, plus a stringer is not needed. Colour `0xb9b6ae`.
- **Walls**: `obbBox(w, w.y0, w.vy1 ?? w.y1)`, plaster `0xefece4`; **skip** `edge`, the leaves (`lift:*`, `roofDoor`, `porch:door`), `porch:*` side panes (glass: `0xbfd6e4`, `transparent`, opacity 0.35), and cut windows into `front:1` ... `front:9`: instead of one box, four boxes (below the sill, above the head, left and right of the opening) from `hall.windows[k - 1]`. Walls lie from `levels[0]`; add 0.3 m below for the floor edge.
- **Housing:** the walls above the roof come from the same wall list (`left`, `back`, `right`, `shaft:*`, `front:10`, `housing:left:*`, the lintel) and a top slab; additionally build once, with the block, `INT.housing`: one white box (the tower outline, `hall.housing`) with `plasterWhite`, visible from far away, and the dark roof-door panel on its left face.
- **Entrance door leaf:** a permanent `THREE.Mesh` (dark `0x3a3f47`, 1.0 x 2.2 x 0.05) with the hinge on the entrance's right edge: wrap it in a `Group` positioned at the hinge; `group.rotation.y = INT.door.open * 1.75` (about 100 degrees) turned so the leaf swings inward; updated in `stepInterior`.
- **Lift leaves and cabin:** per level a sliding panel (`lift:k`) in the divider gap: width `liftDoor.a1 - liftDoor.a0`, `position` along `-a` by `INT.lift.doorOpenAt`-based `door` openness only at the cabin's current level (`k === INT.lift.at ? INT.lift.door : 0`); the cabin: a box shell `cabinRect` (open on the door side), moved every frame to `INT.lift.y`, with a darker floor and a light panel.
- **Flat doors:** per landing a closed door box (0.9 x 2.05 x 0.06, `0x5b4636`) on the left wall at `hall.flatDoors[k]`; nothing else on it.
- **Light:** interior materials are `MeshLambertMaterial` with `emissive` `0x2b2b2b` (add a `PointLight` every third storey only if it still looks flat); merge all boxes of one material (`mergeGeometries`, already imported) into one mesh per material.

- [ ] **Step 1: write the failing Playwright test** (append to `test_enter_6c.py`):

```python
@needs_world
def test_the_hall_is_built_near_and_gone_far_and_the_window_looks_out(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        e = page.evaluate("() => window.__mm.bodenacker6().porches.find(p => p.house === '6c').entrance")
        page.evaluate("([x, z, th]) => window.__mm.place(x - Math.cos(th) * 12, z - Math.sin(th) * 12, th)", [e["x"], e["z"], e["th"]])
        key(page, "z", 300)
        near = page.evaluate("() => window.__mm.interior()")
        page.evaluate("([x, z, th]) => window.__mm.place(x - Math.cos(th) * 90, z - Math.sin(th) * 90, th)", [e["x"], e["z"], e["th"]])
        foot_sim(page, 0.5)
        far = interior(page)
        foot_sim(page, 0.3)
        built = page.evaluate("() => window.__mm.interiorCount()")
        # look straight out through the window of the 3rd-floor landing
        stand(page, 0.7, 0.0, math.pi, level=3)             # on the 3rd-floor landing, facing out of the building
        foot_sim(page, 0.2)
        ray = page.evaluate("() => window.__mm.interiorRay()")
        b.close()
    assert errors == []
    assert near["built"] is True and far["built"] is False, (near, far)
    assert built["meshes"] > 0
    assert ray["dist"] is None or ray["dist"] > 4, ray      # nothing of the building is in the way: the window is a hole
```

Hooks to add for it: `window.__mm.interiorCount = () => ({ meshes: INT.group ? INT.group.children.length : 0 })`, `window.__mm.setFootY = (y) => { P.y = y; FOOT.vy = 0; }`, and
`window.__mm.interiorRay = () => { camera.updateMatrixWorld(); const rc = new THREE.Raycaster(camera.getWorldPosition(new THREE.Vector3()), camera.getWorldDirection(new THREE.Vector3())); const hit = rc.intersectObjects(scene.children, true).find(h => h.object.visible); return { dist: hit ? hit.distance : null, role: hit ? (hit.object.userData.role || hit.object.name || '') : null }; };`
(Raycasting honours `material.side`, as rendering does: that is the check of Assumption A3.)

- [ ] **Step 2: run, confirm it fails** (`interiorCount` undefined).
- [ ] **Step 3: implement** the meshes as above. If the ray from inside hits the block's own façade (the ray's `dist` is under 0.3 m), the exterior wall quads of #410 are double-sided: fix by giving only the **6c wall quads** a back-face-culling material (Assumption A3's fallback: in `bodenackerBuilding`, draw the 6c house's wall segment with `side: THREE.FrontSide` explicitly, and if `mat(role)` returns a shared `DoubleSide` material, clone it for the block); do not change any other building.
- [ ] **Step 4: verify** both Playwright tests, `test_bodenacker6.py`, `test_on_foot.py`, the node suite. Take a screenshot of the hall and of the window view (`page.screenshot`) into the scratchpad, look at them (walls, treads, window, doors), then delete them.
- [ ] **Step 5: commit** `feat(buildings): draw the stair hall, door leaf, windows and flat doors of 6c (#411)` and push.

### Task 8: The lift, its keypad and the call button (index.html)

**Files:** `prototype/index.html`, `prototype/tests/test_enter_6c.py`.

**Interfaces:**

```js
// stepInterior(dt), once per frame, after updateInterior():
const { a, b } = INT.hall.frame.fromWorld(P.x, P.z), sh = STAIRHALL.shaft;   // import STAIRHALL too
const inCabin = FOOT.on && INT.indoors && a >= sh.a0 && a <= sh.a1 && b >= sh.b0 && b <= sh.b1 && Math.abs(P.y - INT.lift.y) < 0.5;
for (const ev of INT.lift.step(dt, { occupied: inCabin })) liftTowerEvent(ev);   // 'start': stopAuto('reset') not needed on foot; SFX.hum(total) like the freight lift; 'arrive': nothing
INT.cabin.y = INT.lift.y;                                                       // the dynamic slab
for (let k = 0; k <= 10; k++) wallByTag(INT.hall, `lift:${k}`).off = INT.lift.doorOpenAt(k);
setLiftPad(inCabin);                                                            // shows/hides #liftpad
// the call prompt: INT.area === 'tower', not in the cabin, and Math.hypot(a - 0.7, b - 1.275) < 1.3 (the gap's centre): INT.prompt = tr('liftCall'), else null
```

- Keypad: `<div id="liftpad" hidden>` (inside `body`, fixed, right side, above the minimap) with a title (`liftPadTitle`) and a 4 x 3 grid of `<button data-level="k">` in the order EG,1,2 / 3,4,5 / 6,7,8 / 9,Dach(=10); label from `keypadLabel(k, window.GG_LANG)`; the current level has the class `on`, busy buttons are `disabled`. Click and `touchstart` call `INT.lift.call(k)`. Re-label on `gg-langchange`. Style it like the existing panels (`rgba(20,23,29,.82)` background, `var(--steel-l)` border, `var(--cream)` text, 48 px buttons).
- Keys: in the global `keydown` listener, first line after the dialog checks: `if (liftPadKey(e)) return;` with

```js
function liftPadKey(e) {
  if (!INT.pad || !FOOT.on) return false;
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code), k = m ? Number(m[1]) : e.code === 'KeyD' ? 10 : null;
  if (k === null) return false;
  e.preventDefault(); INT.lift.call(k); return true;     // 0 = EG, 1-9 = the storeys, D = Dach; D does not sidestep while the pad is open
}
```
  (`INT.pad` is true while `#liftpad` is shown; the handler returns before `keys[e.code] = true` is set.)
- E on a landing: the PR#438 `pressEnter()` first looks for the entrance entry; add in front of it `if (INT.prompt && INT.indoors) { INT.lift.call(INT.floor); return; }`. The HUD sets `#prompt` to `INT.prompt` while it is set and the entrance prompt is not shown.
- The call from a landing goes to the storey the walker is on (`INT.floor`), the keypad inside to the pressed level.

- [ ] **Step 1: write the failing Playwright test** (append): get in as in test 1, stand on the EG landing next to the lift gap, press `e` (call), wait for the door, walk in, press `5`, ride, check the floor, check the HUD, step out, then ride to the roof with `d`:

```python
@needs_world
def test_lift_to_the_fifth_floor_and_to_the_roof(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        e = page.evaluate("() => window.__mm.bodenacker6().porches.find(p => p.house === '6c').entrance")
        page.evaluate("([x, z, th]) => window.__mm.place(x - Math.cos(th) * 12, z - Math.sin(th) * 12, th)", [e["x"], e["z"], e["th"]])
        key(page, "z", 300)
        stand(page, 0.7, 0.4, math.pi / 2, level=0)         # on the EG landing, facing the lift (to the right)
        foot_sim(page, 0.3)
        key(page, "e", 200)                                 # call the lift (it stands at the EG: the door just opens)
        page.evaluate("() => window.__mm.interiorSim(1.5)")
        foot_sim(page, 1.0, ["KeyW"])                       # into the cabin
        in_cabin = interior(page)
        key(page, "5", 200)                                 # the fifth floor
        foot_sim(page, 14)                                  # footSim steps the walker AND the lift: the walker rides the moving slab
        at5 = interior(page)
        foot_sim(page, 1.0, ["KeyS"])                       # out onto the landing
        out5 = interior(page)
        foot_sim(page, 1.0, ["KeyW"])                       # back in
        key(page, "d", 200)                                 # D = Dach
        foot_sim(page, 20)
        atroof = interior(page)
        b.close()
    assert errors == []
    assert in_cabin["pad"] is True and in_cabin["lift"]["at"] == 0, in_cabin
    assert at5["lift"]["at"] == 5 and abs(at5["y"] - at5["levels"][5]) < 0.1, at5
    assert re.fullmatch(r"6c · (5\. OG|5th floor)", at5["label"]), at5
    assert out5["area"] == "tower" and abs(out5["y"] - out5["levels"][5]) < 0.1, out5
    assert atroof["floor"] == 10 and abs(atroof["y"] - atroof["levels"][10]) < 0.1, atroof
```

(Use `foot_sim` for rides, not `interiorSim`: only `footSim` steps the walker too, so the walker rides the moving slab.)

- [ ] **Step 2: run, confirm it fails** (no keypad, `pad` false).
- [ ] **Step 3: implement** as above (the pad DOM and CSS, `liftPadKey`, `setLiftPad`, the call prompt, `liftTowerEvent`). Use `SFX.hum(total)` like `liftEvent` if its signature fits; skip silently otherwise.
- [ ] **Step 4: verify** all three Playwright tests of the file, one at a time (foreground), then `test_on_foot.py`, `test_smoke.py` (the blinker on `KeyE` while driving stays), the node suite.
- [ ] **Step 5: commit** `feat(buildings): the lift of 6c with keypad and call button (#411)` and push.

### Task 9: The roof (index.html)

**Files:** `prototype/index.html`, `prototype/tests/test_enter_6c.py`.

**Interfaces / behaviour:**

- The roof door (leaf wall `roofDoor`, `off` while open): `stepInterior` opens it when the walker (inside the roof lobby or on the roof) is within 1.5 m of the door centre, closes it beyond 3 m: `roofDoorOpen = dist < 1.5 ? true : dist > 3 ? false : roofDoorOpen`; the panel mesh slides like the lift leaves.
- The roof deck and the `edge` rails come from `hallRoofSlab` (Task 6 built them with the hall); the housing walls above the roof come from the interior group (Task 7), the low-poly `INT.housing` shows from far.
- `INT.indoors` is true on the roof deck, so hover stays off there (`F` does nothing) and the HUD shows "6c · Dach"/"6c · roof".

- [ ] **Step 1: write the failing Playwright test** (append): ride to the roof, walk out through the door, walk to the edge, assert not fallen:

```python
@needs_world
def test_roof_door_and_the_roof_edge_cannot_be_crossed(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        e = page.evaluate("() => window.__mm.bodenacker6().porches.find(p => p.house === '6c').entrance")
        page.evaluate("([x, z, th]) => window.__mm.place(x - Math.cos(th) * 12, z - Math.sin(th) * 12, th)", [e["x"], e["z"], e["th"]])
        key(page, "z", 300)
        stand(page, 0.7, 0.4, math.pi / 2, level=0)
        key(page, "e", 200); page.evaluate("() => window.__mm.interiorSim(1.5)")
        foot_sim(page, 1.0, ["KeyW"]); key(page, "d", 200); foot_sim(page, 16)           # to the roof
        lobby = interior(page)
        stand(page, 0.8, -0.2, -math.pi / 2, level=10)      # in the roof lobby, facing the door in the left wall
        foot_sim(page, 1.5, ["KeyW"])                       # through the door
        outside = interior(page)
        foot_sim(page, 12, ["KeyW"])                        # on, towards the end of the block: the rail must stop it
        edge = interior(page)
        key(page, "f", 200)
        hover = page.evaluate("() => window.__mm.foot().hover")
        b.close()
    assert errors == []
    assert lobby["floor"] == 10, lobby
    assert outside["area"] == "out" and abs(outside["y"] - outside["levels"][10]) < 0.1, outside
    assert abs(edge["y"] - edge["levels"][10]) < 0.1, edge   # still on the roof, not fallen
    assert re.fullmatch(r"6c · (Dach|roof)", edge["label"]) and hover is False, edge
```

- [ ] **Step 2: run, confirm it fails.**
- [ ] **Step 3: implement** the roof door and any missing roof mesh (the roof itself is #410's; the `INT.housing` and the group's housing walls carry the door). If the walker falls through the roof, check that `hallRoofSlab`'s polygon winding/ring is the body ring in **world** coordinates and that the hole is the tower.
- [ ] **Step 4: verify** the three tests, then `test_bodenacker6.py`, `test_building_collision.py`, `test_on_foot.py`, the node suite.
- [ ] **Step 5: commit** `feat(buildings): walk onto the roof of 6c (#411)` and push.

### Task 10: Changelog, regression sweep, PR

**Files:** `CHANGELOG.md`, `prototype/index.html` (only if the sweep finds a leftover).

- [ ] **Step 1: CHANGELOG** under `[Unreleased]` / `Added` (English, player voice, the date and Swiss time it goes live, only the address named):

  `- \`YYYY-MM-DD HH:MM\` **Walk into Bodenackerstrasse 6c!** On foot (**Z**), walk up to the glass entrance of the block at **Bodenackerstrasse 6c** in Sisseln and press **E**: the door swings open. Inside there is a stair hall with a **lift** (the buttons **EG, 1-9 and Dach**, or the keys **0-9** and **D**; **E** calls it on every floor), a **window on every floor** to look out over the real Sisseln, and a door at the top onto the **roof**, where you can walk right up to the edge. The HUD shows where you are ("6c · 4. OG"). Hovering (**F**) is off inside.`
- [ ] **Step 2: sweep (foreground, one file at a time, after pushing):** the full `node --test prototype/tests/*.test.mjs`; Playwright `test_enter_6c.py`, `test_bodenacker6.py`, `test_on_foot.py`, `test_building_collision.py`, `test_row_houses.py`, `test_smoke.py`, `test_minimap.py`, `test_hideout.py` (the freight lift is untouched). A walker outside the block is still blocked by the body and the porch with the door shut: add one assert to `test_enter_6c.py` if there is none (walk into the porch front without pressing E and check `area` stays `out`).
- [ ] **Step 3: privacy grep of the diff:** `git diff origin/main... | grep -n -i -E "wohn|mieter|resident|lebt|urlaub|ferien"` must show nothing personal (the words "flat doors" and "flats (stage 2)" are fine; names of people are not).
- [ ] **Step 4: commit** `feat(foot): 6c is enterable (#411, #412)`, push, open the PR (title `feat(buildings): enter Bodenackerstrasse 6c: stair hall, lift, roof (#411, #412)`, body with Summary, Changes, Testing, `Closes #411` / `Closes #412` as the maintainer decides).

## Risks

Everything is additive behind `INT.hall` (every glue function starts with `if (!INT.hall) return`; if `bodenackerLayout` throws, nothing runs); `footFloor`'s walkway argument is `null` outside 6c; the interior is one mesh per material, built within 40 m and disposed beyond 55 m.

If you run into blockers, find a solution and update this plan (and the spec's assumptions) for the future.

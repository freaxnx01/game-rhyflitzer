# Hübel hideout: car lift down to a full-height Eiffel room (#277) Implementation Plan

> **For agentic workers:** implement task by task, in order. Steps use checkbox (`- [ ]`) syntax. Work in a worktree off a fresh `origin/main` (branch `feature/277-hideout-lift-eiffel-room`), PR to `main`. TDD for every pure module: the failing node test first, then the code.

**Spec:** `docs/superpowers/specs/2026-10-11-hideout-lift-eiffel-room-design.md` (approved, commit 212f48d). Read it first.

**Goal:** drive through the Reservoir gate and the tunnel, stop on a freight-lift platform in a small lobby, ride ~8 s down, and come out in a 500 × 500 m meadow with the whole 330 m Eiffel Tower under a sky with clouds. Ride back up the same way. The dark 340 m hall is gone.

**Architecture:** four new files, all in `prototype/`.

- `lift.js` is a pure state machine, `idle → closing → descending → opening → idle`.
- `levels.js` is a pure level registry: which level is active and its `groundAt` and collider grid.
- `room-eiffel.js` is the room's pure layout: constants, tree ring, colliders, paths, spawn points.
- `tests/*.test.mjs` hold the node tests.

`hideout.js` turns the hall node into a small lift lobby. `index.html` does the three.js and DOM wiring: the room's meshes, the ride, the level switch.

**Tech stack:** vanilla ES modules, three r170 (importmap), node `--test`, Playwright (pytest).

**Scope.** In scope: #277 only. Anything else found on the way (flaky tests, other hall remnants, a missing i18n key) goes to `TODO.md` or an issue and is not fixed here. Out of scope: further rooms; leaving the car (#202); the #276 cave-light flicker and #258 labels-through-rock (a parallel agent owns both).

---

## Rules for the whole plan

1. **Newest main first.** `git fetch origin && git checkout -b feature/277-hideout-lift-eiffel-room origin/main`. This plan's line numbers are against `212f48d`. Two PRs from a parallel agent, #276 (cave light flicker) and #258 (labels through the rock), touch `hideout`/`setCave`/label code in `prototype/index.html`. Before Task 5, run `git log --oneline origin/main -15` and `gh pr list --search "276 OR 258" --state all`. If they have merged, re-locate every anchor with the `grep` given in each step. **Anchors are `grep` patterns, never trust the line numbers.**
2. **Reuse #258's logic** for "labels hidden below" if it has merged: find the predicate it added (look in `updateLabels`, `updateVillageNames`, `DEBUG_H.tick`) and extend it with `|| !LEVELS.isSurface()`. If it has not merged, use the guard in Task 6.
3. **No new dependencies, no bundler.** The tower model `prototype/assets/models/eiffel_tower.glb` stays and is credited as today. `test_credits.py` is unchanged.
4. **Commands.**
   - Node, whole suite: `node --test prototype/tests/*.test.mjs` (run from the repo root).
   - A single node file: `node --test prototype/tests/lift.test.mjs`.
   - Playwright, only the hideout file, in the foreground, never `run_in_background`. Headless is slow, the first frame takes 30 s or more, so give the call `timeout: 600000`: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 /home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/.venv/bin/python -m pytest ../prototype/tests/test_hideout.py -q`
   - Add `-k <name>` to run one test.
   - Never run the whole Playwright suite (about 2 h).
5. **Commit after every task** (Conventional Commits, scope `hideout`, ending `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and the `Claude-Session:` line from the system reminder). Push the branch after Task 1 so a dying run leaves work recoverable.
6. **Playwright hooks live on `window.__mm`** (see the block near `window.__mm.hideout`). Reuse `__mm.place`, `__mm.sim`, `__mm.car`, `__mm.hideout`, `__mm.cave`, `__mm.labels`, `__mm.raceFlags`.

---

## Design decisions the tasks implement

| Topic | Decision |
|---|---|
| Lobby | `CAVE.nodes.hall` becomes `CAVE.nodes.lobby` (same centre `[-790, 1855]`, `r: 20`, numeric `ceiling: 14`), joined by the existing link `t2b`. The lobby holds the lift platform. |
| Lift platform | One rectangle `LIFT = { c, th, hw: 5, hd: 8 }` (in `hideout.js`). Its x/z is the same on both levels: the car keeps x/z and only `y` jumps. |
| Room position | The room is axis-aligned, centre `C = LIFT.c + 215·(cos th, sin th)`, so the car comes out of the lift house heading the way it entered and the tower is straight ahead. The spec says "centred under the hideout's x/z"; this is the deliberate adjustment that keeps x/z continuous over the ride. The floor is at `ROOM_Y = -600`. |
| Switching ground and colliders | `groundH` becomes a dispatcher: surface → `surfaceGroundH` (the old body), otherwise → `LEVELS.groundAt`. `OBB_GRID` becomes a `let` that `LEVELS` swaps to the room's own grid on switch (every reader, `collide`, the chase camera, `free()` and the helicopter, reads the variable at call time). `waterLevelAt` returns `null` and `P.safe` is not updated off the surface. |
| Hiding the surface world | At the switch, every direct child of `scene` that is not on a keep-list is re-parented into one hidden `Group` (`surfaceRoot`) and moved back on return. A hidden parent hides all descendants whatever per-frame code does to their own `.visible`: label pools, village names, checkpoint markers. Keep-list: the car, the sky dome, the sun with its target, the hemisphere light, the sun sprite, the car shadow, the room group, the lift cab. |
| Sky | Reuse the existing sky dome and sun: a room look swaps fog, the two sky colours, hemisphere and sun intensity (modelled on `setCave`). Clouds are about 36 soft canvas-textured sprites, `fog:false`, 650-1100 m above the floor, in the room group. The sun is steady: a fixed offset above the car, no shadow map. |
| Ride visuals | A 28 m open cylinder ("cab", `BackSide`, concrete-and-beam canvas texture) is centred on the car for the closing/descending/opening phases and its texture scrolls upward. It is big enough to contain the chase camera. The floor indicator is a DOM element, the hum is a small WebAudio synth. A gate bar on each level drops across the platform front. |
| Trigger | The car's centre is inside the platform rectangle, `|P.y - floorY| < 1`, speed < 0.5 m/s, for 1 s, and the lift is armed (the car has left the platform since the last ride). |
| Find toast | `foundHideout()` fires on the `done` event of the first downward ride (doors open below), not on entering a room. |

---

### Task 1: `hideout.js`, the hall becomes the lift lobby

**Files:**
- Modify: `prototype/hideout.js`
- Modify: `prototype/tests/hideout.test.mjs`

- [ ] **Step 1: Update the tests first (they fail).** In `tests/hideout.test.mjs`:
  - Rename every `hall` in the cave tests to `lobby`. Affected: `CAVE_LayoutIsTheSpecsSketch`, `caveCuts_EightLevelCutsOnOneFloor` (the cut id `'hall'` becomes `'lobby'`), `ringArcs_LeaveEveryExitOpen`, `ceilingAt_TunnelsCappedRoomsLidHallHigh` (rename it `ceilingAt_TunnelsCappedRoomsLidLobbyLow`), `sightBlocked_MouthToHall` (rename it `sightBlocked_MouthToLobby`).
  - New expectations:
    - `assert.deepEqual(CAVE.nodes.lobby.c, [-790, 1855]); assert.equal(nodeR(CAVE.nodes.lobby), 22); assert.equal(CAVE.nodes.lobby.ceiling, 14);`
    - The lobby cut keeps the floor radius: `for (const r of [0, 10, 21]) close(cutFloorAt(lobby, lx + r, lz, TUNNEL), f0, 1e-6)`, and `assert.equal(cutFloorAt(lobby, lx + 23, lz, TUNNEL), null)`.
    - In the ceiling test: `close(ceilingAt(...CAVE.nodes.lobby.c, plateau, 10), f0 + 14, 1e-6, 'the lobby')`. The T2b midpoint point stays 60 m down the link; keep the `roomAt(mx, mz, TUNNEL.wall) === null` assertion and, if it fails because the lobby is now smaller, that is correct (it can only get easier).
    - `ringArcs('lobby').length === 1` (the lobby only has T2b as an exit).
    - Delete the `ceilingAt(... hall ...) f0 + 380` line, and the `HIDEOUT.towerH`/`TOWER_SPOTS` expectations, if any.
  - Add a new test:

```js
import { LIFT, onLiftPlatform } from '../hideout.js';
test('LIFT_PlatformSitsInTheLobbyAndFacesDownT2b', () => {
  assert.deepEqual(LIFT.c, CAVE.nodes.lobby.c);
  const [p, q] = linkPts(CAVE.links[1]);
  close(LIFT.th, Math.atan2(q[1] - p[1], q[0] - p[0]), 1e-9, 'heading = T2b');
  assert.ok(LIFT.hw < CAVE.nodes.lobby.r && LIFT.hd < CAVE.nodes.lobby.r, 'the platform fits the lobby');
  assert.ok(onLiftPlatform(LIFT.c[0], LIFT.c[1]));
  assert.ok(onLiftPlatform(LIFT.c[0] + Math.cos(LIFT.th) * 7.9, LIFT.c[1] + Math.sin(LIFT.th) * 7.9), 'front edge, inside');
  assert.ok(!onLiftPlatform(LIFT.c[0] + Math.cos(LIFT.th) * 8.5, LIFT.c[1] + Math.sin(LIFT.th) * 8.5), 'past the front edge');
  assert.ok(!onLiftPlatform(LIFT.c[0] - Math.sin(LIFT.th) * 5.5, LIFT.c[1] + Math.cos(LIFT.th) * 5.5), 'beside it');
});
```

- [ ] **Step 2: Run, expect failures.** `node --test prototype/tests/hideout.test.mjs`
- [ ] **Step 3: Edit `hideout.js`.**
  - In `CAVE.nodes` replace `hall: { c: [-790, 1855], r: 168, ceiling: 380, shellR: 167 }` with `lobby: { c: [-790, 1855], r: 20, ceiling: 14 }`. In `CAVE.links`, the second link becomes `{ id: 't2b', from: 'n1', to: 'lobby', hw: 4.5, ceiling: TUNNEL_CEIL }`. Update the comment above `CAVE` ("the hall's floor ... 380 m up" becomes "the lobby is a small lit room at T2b's end, ceiling 14 m; #277 replaced the #201 hall").
  - In `caveCuts()` replace `disc('hall', N.hall.c, N.hall.r, ...)` with `disc('lobby', N.lobby.c, N.lobby.r, f0, dep(N.lobby.c), u)`; the cut order in the returned array stays `t1, r0, n1, t2a, t2b, lobby, stubE, stubW`.
  - Delete `HALL_CAM`, `TOWER_SPOTS`, `TOWER_TOP` and their comments. Keep `EIFFEL` (but update the comment: "relative to the room's tower centre"), `eiffelParts` (the placeholder), `pointBounds`.
  - `EIFFEL.loadWithin` stays (the model is still fetched when the car is near the Hübel).
  - Add after `CAVE`/`linkPts` are defined (it uses `CAVE.links[1]`):

```js
// #277: the freight-lift platform in the lobby: centre = the lobby's centre, heading = down T2b, hw across, hd along. The room's lift
// house stands on the same x/z (the ride only changes y), so one rectangle serves both levels.
const T2B = [CAVE.nodes.n1.c, CAVE.nodes.lobby.c];
export const LIFT = { c: CAVE.nodes.lobby.c, th: Math.atan2(T2B[1][1] - T2B[0][1], T2B[1][0] - T2B[0][0]), hw: 5, hd: 8 };
// is (x, z) inside the platform's rectangle (pad > 0 grows it)
export function onLiftPlatform(x, z, pad = 0, l = LIFT) {
  const dx = x - l.c[0], dz = z - l.c[1], along = dx * Math.cos(l.th) + dz * Math.sin(l.th), across = -dx * Math.sin(l.th) + dz * Math.cos(l.th);
  return Math.abs(along) <= l.hd + pad && Math.abs(across) <= l.hw + pad;
}
```
  (`T2B` must be defined after `linkPts` is not needed, only after `CAVE`. `CAVE.links[1]` is `n1 → lobby`.)
- [ ] **Step 4: Run, expect green.** `node --test prototype/tests/hideout.test.mjs`. Then `node --test prototype/tests/*.test.mjs`: `testhub-targets.test.mjs` still passes (its fixtures use the context's own `hall` key, changed in Task 9).
- [ ] **Step 5: Commit and push the branch.** `git commit -am "refactor(hideout): turn the hall into a small lift lobby with a platform rectangle (#277)"`.

---

### Task 2: `lift.js`, the pure ride state machine

**Files:**
- Create: `prototype/lift.js`
- Create: `prototype/tests/lift.test.mjs`

- [ ] **Step 1: Write the test.**

```js
// #277: the lift's ride -- pure state machine. node --test prototype/tests/lift.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLift, LIFT_TIMES } from '../lift.js';

const STOP = { onPlatform: true, speed: 0, dir: 'down' };
const run = (lift, secs, input = STOP, dt = 0.05) => { const ev = []; for (let t = 0; t < secs - 1e-9; t += dt) ev.push(...lift.step(dt, input)); return ev; };

test('createLift_StartsIdleWithTheGateOpen', () => {
  const l = createLift(); assert.equal(l.phase, 'idle'); assert.equal(l.gate, 0); assert.equal(l.floor(), null); assert.equal(l.busy, false);
});

test('step_DrivingAcrossWithoutStopping_DoesNothing', () => {
  const l = createLift(); assert.deepEqual(run(l, 3, { onPlatform: true, speed: 6, dir: 'down' }), []); assert.equal(l.phase, 'idle');
});

test('step_StoppedLessThanADwell_DoesNothingAndTheDwellRestarts', () => {
  const l = createLift(); run(l, 0.8); run(l, 0.5, { onPlatform: true, speed: 3, dir: 'down' }); run(l, 0.8); assert.equal(l.phase, 'idle');
});

test('step_StoppedOffThePlatform_DoesNothing', () => {
  const l = createLift(); assert.deepEqual(run(l, 3, { onPlatform: false, speed: 0, dir: 'down' }), []);
});

test('step_StoppedForADwell_StartsThenSwitchesAtTheMidpointThenIsDone', () => {
  const l = createLift(), T = LIFT_TIMES, ev = [];
  const at = (secs) => { const e = run(l, secs); ev.push(...e); return e; };
  at(T.dwell + 0.05);
  assert.equal(l.phase, 'closing'); assert.deepEqual(ev.map(e => e.type), ['start']); assert.equal(ev[0].dir, 'down');
  at(T.close + 0.1); assert.equal(l.phase, 'descending');
  at(T.ride / 2 - 0.2); assert.deepEqual(ev.map(e => e.type), ['start'], 'not yet at the midpoint');
  at(0.3); assert.deepEqual(ev.map(e => e.type), ['start', 'switch']);
  at(T.ride / 2); assert.equal(l.phase, 'opening');
  at(T.open + 0.1); assert.equal(l.phase, 'idle'); assert.deepEqual(ev.map(e => e.type), ['start', 'switch', 'done']);
  assert.equal(ev.filter(e => e.type === 'switch').length, 1, 'exactly one switch');
});

test('step_AfterARide_NeedsTheCarToLeaveThePlatformBeforeTheNextRide', () => {
  const l = createLift(); run(l, LIFT_TIMES.dwell + LIFT_TIMES.close + LIFT_TIMES.ride + LIFT_TIMES.open + 0.5);
  assert.equal(l.phase, 'idle'); assert.deepEqual(run(l, 3, { onPlatform: true, speed: 0, dir: 'up' }), [], 'still standing there: no ride back');
  run(l, 0.2, { onPlatform: false, speed: 5, dir: 'up' });
  assert.equal(run(l, 1.2, { onPlatform: true, speed: 0, dir: 'up' }).find(e => e.type === 'start').dir, 'up');
});

test('step_OneHugeDtStillEmitsTheSwitch', () => {
  const l = createLift(); l.step(LIFT_TIMES.dwell + 0.01, STOP); const ev = l.step(100, STOP);
  assert.ok(ev.some(e => e.type === 'switch'), JSON.stringify(ev));
});

test('gate_ClosesDuringClosingStaysShutWhileDescendingOpensDuringOpening', () => {
  const l = createLift(), T = LIFT_TIMES; run(l, T.dwell + 0.05);
  run(l, T.close / 2); assert.ok(l.gate > 0.3 && l.gate < 0.8, `half closed ${l.gate}`);
  run(l, T.close / 2 + 0.1); assert.equal(l.gate, 1); run(l, T.ride - 0.5); assert.equal(l.gate, 1);
  run(l, 0.5 + T.open / 2); assert.ok(l.gate > 0.2 && l.gate < 0.8, `half open ${l.gate}`);
});

test('floor_CountsMinus1ToMinus12DownAndBackUp', () => {
  const T = LIFT_TIMES, down = createLift(); run(down, T.dwell + T.close + 0.05);
  assert.equal(down.floor(), -1); run(down, T.ride - 0.2); assert.equal(down.floor(), -12);
  const up = createLift(); run(up, T.dwell + T.close + 0.05, { onPlatform: true, speed: 0, dir: 'up' });
  assert.equal(up.floor(), -12); run(up, T.ride - 0.2, { onPlatform: true, speed: 0, dir: 'up' }); assert.equal(up.floor(), -1);
});

test('times_ReflectsSetTimes_abort_EndsARideAtOnceAndDisarms', () => {
  const l = createLift(); l.setTimes({ ride: 2 }); assert.equal(l.times.ride, 2); assert.equal(l.times.dwell, LIFT_TIMES.dwell);
  run(l, LIFT_TIMES.dwell + 0.1); assert.ok(l.busy); l.abort(); assert.equal(l.phase, 'idle'); assert.equal(l.gate, 0);
  assert.deepEqual(run(l, 3), [], 'disarmed until the car leaves the platform');
});

test('setTimes_ShortensTheRideForTests', () => {
  const l = createLift(); l.setTimes({ dwell: 0.1, close: 0.1, ride: 0.2, open: 0.1 });
  const ev = run(l, 1, STOP, 0.02).map(e => e.type); assert.deepEqual(ev, ['start', 'switch', 'done']);
});
```

- [ ] **Step 2: Run, expect failure** (module missing). `node --test prototype/tests/lift.test.mjs`
- [ ] **Step 3: Create `prototype/lift.js`.**

```js
// #277: the freight lift's ride as a pure state machine (no three.js, no DOM): idle -> closing -> descending -> opening -> idle.
// step(dt, { onPlatform, speed, dir }) returns the events of that step: { type: 'start' | 'switch' | 'done', dir }. The 'switch'
// (the level changes) comes exactly at the midpoint of the descent. dir is 'down' (surface -> room) or 'up'. After a ride the lift
// is disarmed until the car has left the platform, so arriving on it does not send the car straight back.
export const LIFT_TIMES = { dwell: 1, close: 1, ride: 6, open: 1, stopSpeed: 0.5, floors: 12 };

export function createLift(times = LIFT_TIMES) {
  let T = { ...times }, phase = 'idle', t = 0, dwell = 0, armed = true, rideDir = 'down', switched = false;
  const progress = () => (phase === 'descending' ? Math.min(1, t / T.ride) : phase === 'opening' ? 1 : 0);
  const advance = (out) => {
    if (phase === 'closing' && t >= T.close) { phase = 'descending'; t -= T.close; }
    if (phase === 'descending') {
      if (!switched && t >= T.ride / 2) { switched = true; out.push({ type: 'switch', dir: rideDir }); }
      if (t >= T.ride) { phase = 'opening'; t -= T.ride; }
    }
    if (phase === 'opening' && t >= T.open) { phase = 'idle'; t = 0; armed = false; out.push({ type: 'done', dir: rideDir }); }
  };
  return {
    get phase() { return phase; },
    get busy() { return phase !== 'idle'; },
    get dir() { return rideDir; },
    // 0 = gate open, 1 = shut
    get gate() { return phase === 'closing' ? Math.min(1, t / T.close) : phase === 'descending' ? 1 : phase === 'opening' ? Math.max(0, 1 - t / T.open) : 0; },
    // the indicator: -1 ... -12 down, -12 ... -1 up; null when idle
    floor() {
      if (phase === 'idle') return null;
      const n = Math.min(T.floors - 1, Math.floor(progress() * T.floors)), down = -(1 + n);
      return rideDir === 'down' ? down : -(T.floors - n);
    },
    setTimes(partial) { T = { ...T, ...partial }; },
    get times() { return { ...T }; },
    abort() { phase = 'idle'; t = 0; dwell = 0; armed = false; },   // a jump ends a ride at once
    step(dt, { onPlatform, speed, dir }) {
      const out = [];
      if (phase === 'idle') {
        if (!onPlatform) { armed = true; dwell = 0; return out; }
        if (!armed || speed >= T.stopSpeed) { dwell = 0; return out; }
        dwell += dt;
        if (dwell < T.dwell) return out;
        phase = 'closing'; t = 0; dwell = 0; rideDir = dir; switched = false; out.push({ type: 'start', dir });
        return out;
      }
      t += dt; advance(out);
      return out;
    },
  };
}
```

  Check by hand: `floor()` at the start of descent (progress 0) gives `-1` down and `-12` up; at the end it gives `-12` down and `-1` up. Both `up`/`down` asserts in the test follow.
- [ ] **Step 4: Run, expect green.** `node --test prototype/tests/lift.test.mjs` (fix the code, not the tests, if one fails).
- [ ] **Step 5: Commit.** `feat(hideout): the lift's ride as a pure state machine (#277)`.

---

### Task 3: `levels.js`, the pure level registry

**Files:**
- Create: `prototype/levels.js`
- Create: `prototype/tests/levels.test.mjs`

- [ ] **Step 1: Test.**

```js
// #277: which level the car is on, and that level's ground and colliders. node --test prototype/tests/levels.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLevels } from '../levels.js';

const make = () => {
  const lv = createLevels();
  lv.register('surface', { groundAt: (x, z) => 100 + x * 0.1, colliders: { name: 'surface-grid' } });
  lv.register('eiffel', { groundAt: () => -600, colliders: { name: 'room-grid' } });
  return lv;
};

test('createLevels_StartsOnTheSurface', () => {
  const lv = make(); assert.equal(lv.id, 'surface'); assert.ok(lv.isSurface()); assert.equal(lv.groundAt(10, 0, 0), 101); assert.equal(lv.colliders.name, 'surface-grid');
});

test('set_SwitchesGroundAndCollidersAndReportsWhetherItChanged', () => {
  const lv = make();
  assert.equal(lv.set('eiffel'), true); assert.equal(lv.id, 'eiffel'); assert.ok(!lv.isSurface());
  assert.equal(lv.groundAt(10, 0, 0), -600); assert.equal(lv.colliders.name, 'room-grid');
  assert.equal(lv.set('eiffel'), false, 'already there');
});

test('set_AnUnknownLevel_Throws', () => { assert.throws(() => make().set('atomium'), /atomium/); });

test('onJump_ResetsToTheSurface_onReset_KeepsTheLevel', () => {
  const lv = make(); lv.set('eiffel');
  assert.equal(lv.onReset(), false); assert.equal(lv.id, 'eiffel', 'R below stays below');
  assert.equal(lv.onJump(), true); assert.equal(lv.id, 'surface');
  assert.equal(lv.onJump(), false, 'a jump on the surface changes nothing');
});

test('onChange_FiresWithTheNewAndTheOldLevelAfterTheSwitch', () => {
  const lv = make(), seen = []; lv.onChange((id, from) => seen.push([id, from, lv.id]));
  lv.set('eiffel'); lv.set('eiffel'); lv.onJump();
  assert.deepEqual(seen, [['eiffel', 'surface', 'eiffel'], ['surface', 'eiffel', 'surface']]);
});
```

- [ ] **Step 2: Run, expect failure.**
- [ ] **Step 3: Create `prototype/levels.js`.**

```js
// #277: the game's levels -- the surface world and the rooms far below it (the Eiffel room at -600 m). Pure: it only knows which
// level is active and hands out that level's groundAt(x, z, y) and collider grid; index.html does the drawing (what to show,
// the light) from onChange. A jump (J, double-click beam, the Testhub, the autopilot) calls onJump() first and so always ends
// on the surface; R calls onReset(), which keeps the level, so R below puts the car back at the lift house below.
export function createLevels() {
  const levels = new Map(), listeners = []; let id = 'surface';
  const current = () => levels.get(id);
  const set = (next) => {
    if (!levels.has(next)) throw new Error(`unknown level: ${next}`);
    if (next === id) return false;
    const from = id; id = next; for (const fn of listeners) fn(id, from);
    return true;
  };
  return {
    register(name, level) { levels.set(name, level); },
    get id() { return id; },
    isSurface: () => id === 'surface',
    groundAt: (x, z, y) => current().groundAt(x, z, y),
    get colliders() { return current().colliders; },
    set,
    onJump: () => set('surface'),
    onReset: () => false,
    onChange(fn) { listeners.push(fn); },
  };
}
```
- [ ] **Step 4: Run, expect green**, then the whole node suite: `node --test prototype/tests/*.test.mjs`.
- [ ] **Step 5: Commit.** `feat(hideout): a pure level registry for the surface and the Eiffel room (#277)`.

---

### Task 4: `room-eiffel.js`, the room's pure layout (tower, tree ring, colliders, spawn)

**Files:**
- Create: `prototype/room-eiffel.js`
- Create: `prototype/tests/room-eiffel.test.mjs`

- [ ] **Step 1: Test.**

```js
// #277: the Eiffel room's layout -- pure. node --test prototype/tests/room-eiffel.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eiffelRoom, ROOM_Y, ROOM_HALF } from '../room-eiffel.js';
import { EIFFEL, LIFT, onLiftPlatform } from '../hideout.js';

const room = eiffelRoom(), CAR_R = 2.6;
const inside = (o, x, z, r = 0) => { const dx = x - o.x, dz = z - o.z, lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c; return Math.abs(lx) <= o.hw + r && Math.abs(lz) <= o.hd + r; };
const blocked = (x, z, r = CAR_R) => room.colliders.some(o => inside(o, x, z, r));
// flood fill of the cells a car of radius CAR_R can reach from the spawn, 4 m grid, 8 neighbours
const reach = (start, step = 4) => {
  const [cx, cz] = room.centre, n = Math.ceil((ROOM_HALF + 40) / step), key = (i, j) => i + ',' + j, seen = new Set(), todo = [[Math.round((start.x - cx) / step), Math.round((start.z - cz) / step)]];
  while (todo.length) { const [i, j] = todo.pop(), k = key(i, j); if (seen.has(k) || Math.abs(i) > n || Math.abs(j) > n || blocked(cx + i * step, cz + j * step)) continue; seen.add(k); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (a || b) todo.push([i + a, j + b]); }
  return { seen, cx, cz, step, n };
};

test('eiffelRoom_FloorIs600mDownAnd500mSquare', () => {
  assert.equal(room.y, -600); assert.equal(ROOM_Y, -600); assert.equal(ROOM_HALF, 250);
  assert.equal(room.groundAt(room.centre[0] + 12, room.centre[1] - 99, 0), -600);
});

test('eiffelRoom_TheCarKeepsItsXZ_LiftHouseIsOnTheLobbyPlatformAndTheTowerAheadOfIt', () => {
  assert.deepEqual([room.spawn.x, room.spawn.z], LIFT.c); assert.equal(room.spawn.th, LIFT.th);
  const d = Math.hypot(room.tower.x - room.spawn.x, room.tower.z - room.spawn.z); assert.ok(Math.abs(d - 215) < 1e-6, `${d}`);
  const along = (room.tower.x - room.spawn.x) * Math.cos(LIFT.th) + (room.tower.z - room.spawn.z) * Math.sin(LIFT.th); assert.ok(along > 214.9, 'straight ahead');
  assert.ok(onLiftPlatform(room.spawn.x, room.spawn.z));
  assert.ok(Math.abs(room.spawn.x - room.centre[0]) < ROOM_HALF - 30 && Math.abs(room.spawn.z - room.centre[1]) < ROOM_HALF - 10, 'inside the tree ring');
});

test('eiffelRoom_TowerIsCentredWithLegCollidersOnTheFeet', () => {
  assert.deepEqual([room.tower.x, room.tower.z], room.centre);
  assert.equal(room.feet.length, 4);
  EIFFEL.feet.forEach(([fx, fz], i) => { assert.equal(room.feet[i].x, room.tower.x + fx); assert.equal(room.feet[i].z, room.tower.z + fz); assert.equal(room.feet[i].hw, EIFFEL.footHw); assert.ok(blocked(room.feet[i].x, room.feet[i].z, 0)); });
});

test('eiffelRoom_SpaceUnderTheTowerIsDrivable', () => {
  for (const [x, z] of [[0, 0], [30, 0], [-30, 0], [0, 30], [0, -30], [30, 30], [-30, -30]]) assert.ok(!blocked(room.tower.x + x, room.tower.z + z), `blocked at ${x},${z}`);
  const r = reach(room.spawn);
  assert.ok(r.seen.has('0,0'), 'the cell under the tower is reachable from the lift house (cells are indexed from the tower)');
});

test('eiffelRoom_TreeRingIsClosed_TheCarCannotLeaveTheLawn', () => {
  const r = reach(room.spawn), limit = ROOM_HALF - 3;   // the ring's colliders are centred 3 m inside the edge
  for (const k of r.seen) { const [i, j] = k.split(',').map(Number); assert.ok(Math.abs(i * r.step) <= limit && Math.abs(j * r.step) <= limit, `leaked to ${i * r.step},${j * r.step}`); }
  assert.ok(r.seen.size > 4000, `most of the lawn is reachable (${r.seen.size} cells)`);
});

test('eiffelRoom_TreesStandInTwoClosedRowsWithoutGaps', () => {
  const [cx, cz] = room.centre, cheb = (t) => Math.max(Math.abs(t[0] - cx), Math.abs(t[1] - cz));
  assert.ok(room.trees.length > 600);
  for (const t of room.trees) { assert.ok(cheb(t) > ROOM_HALF - 16 && cheb(t) < ROOM_HALF - 2, `a tree at ${cheb(t)} from the centre`); assert.ok(t[2] >= 8 && t[2] <= 15); }
  // along one edge per axis, sorted, no gap wider than 7 m (crowns are 8+ m wide)
  for (const axis of [0, 1]) {
    const edge = room.trees.filter(t => Math.abs(t[1 - axis] - room.centre[1 - axis]) > ROOM_HALF - 9 && Math.abs(t[1 - axis] - room.centre[1 - axis]) < ROOM_HALF - 2 && t[1 - axis] > room.centre[1 - axis]).map(t => t[axis]).sort((a, b) => a - b);
    for (let i = 1; i < edge.length; i++) assert.ok(edge[i] - edge[i - 1] < 7, `gap ${edge[i] - edge[i - 1]} at ${edge[i]}`);
    assert.ok(edge[0] < room.centre[axis] - ROOM_HALF + 14 && edge[edge.length - 1] > room.centre[axis] + ROOM_HALF - 14, 'runs into the corners');
  }
});

test('eiffelRoom_LiftHouseKeepsItsFrontOpen_PathsRunFromTheHouseToTheTowerAndAroundIt', () => {
  const fwd = [Math.cos(LIFT.th), Math.sin(LIFT.th)];
  assert.ok(!blocked(room.spawn.x + fwd[0] * 20, room.spawn.z + fwd[1] * 20), 'the way out of the house is free');
  assert.ok(blocked(room.spawn.x - fwd[0] * 17.5, room.spawn.z - fwd[1] * 17.5, 0), 'the back wall is solid');
  assert.equal(room.paths.length, 2);
  const [toTower, loop] = room.paths; assert.ok(Math.hypot(toTower.pts[0][0] - room.spawn.x, toTower.pts[0][1] - room.spawn.z) < 25, 'starts at the house');
  const end = toTower.pts[toTower.pts.length - 1]; assert.ok(Math.hypot(end[0] - room.tower.x, end[1] - room.tower.z) < 120, 'ends at the loop');
  assert.ok(loop.pts.length >= 24 && Math.hypot(loop.pts[0][0] - loop.pts[loop.pts.length - 1][0], loop.pts[0][1] - loop.pts[loop.pts.length - 1][1]) < 1e-6, 'the loop is closed');
});

test('eiffelRoom_TowerViewLooksAtTheTowerFromTheLawn', () => {
  const v = room.towerView, d = Math.hypot(room.tower.x - v.x, room.tower.z - v.z); assert.ok(d > 120 && d < 180, `${d}`);
  assert.ok(Math.abs(Math.atan2(room.tower.z - v.z, room.tower.x - v.x) - v.th) < 0.02, 'facing the tower'); assert.ok(!blocked(v.x, v.z));
});
```

- [ ] **Step 2: Run, expect failure.**
- [ ] **Step 3: Create `prototype/room-eiffel.js`.**

```js
// #277: the Eiffel room -- pure layout (no three.js, no DOM): a 500 x 500 m lawn at ROOM_Y under the Hübel, the tower in its centre,
// a closed ring of trees at the edge, a lift house at the back (on the lobby's x/z, so the ride only changes y), gravel paths.
// index.html builds the meshes from this (roomBuild) the first time the lift goes down. A later room returns the same shape.
import { EIFFEL, LIFT } from './hideout.js';

export const ROOM_Y = -600, ROOM_HALF = 250, HOUSE_BACK = 215;
const TREE_ROWS = [6, 12], TREE_STEP = 4;   // rows at ROOM_HALF - 6 and - 12 from the centre, a tree every 4 m (crowns 8+ m)
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };   // small LCG, deterministic

export function eiffelRoom(lift = LIFT) {
  const f = [Math.cos(lift.th), Math.sin(lift.th)], v = [-f[1], f[0]];
  const centre = [lift.c[0] + f[0] * HOUSE_BACK, lift.c[1] + f[1] * HOUSE_BACK], [cx, cz] = centre;
  const at = (a, b) => [lift.c[0] + f[0] * a + v[0] * b, lift.c[1] + f[1] * a + v[1] * b];   // the house frame: a along the lift's heading, b to its right
  const h = ROOM_Y + 40, colliders = [];
  // the ring: four long solid strips 6 m thick, centred 3 m inside the edge, overlapping in the corners (the trees are the picture, these are the wall)
  for (const [x, z, hw, hd] of [[cx, cz - ROOM_HALF + 3, ROOM_HALF, 3], [cx, cz + ROOM_HALF - 3, ROOM_HALF, 3], [cx - ROOM_HALF + 3, cz, 3, ROOM_HALF], [cx + ROOM_HALF - 3, cz, 3, ROOM_HALF]]) colliders.push({ x, z, hw, hd, c: 1, s: 0, h });
  // the tower's four feet (solid up to footH; the car drives between and under the legs)
  const feet = EIFFEL.feet.map(([fx, fz]) => ({ x: cx + fx, z: cz + fz, hw: EIFFEL.footHw, hd: EIFFEL.footHw, c: 1, s: 0, h: ROOM_Y + EIFFEL.footH }));
  colliders.push(...feet);
  // the lift house: back wall 17 m behind the platform centre and two side walls, the front stays open (10.5 m half width, walls 1 m)
  const wall = (a, b, hw, hd) => { const [x, z] = at(a, b); return { x, z, hw, hd, c: f[0], s: f[1], h: ROOM_Y + 12 }; };
  colliders.push(wall(-17.5, 0, 0.5, 11.5), wall(-9, -10.5, 8.5, 0.5), wall(-9, 10.5, 8.5, 0.5));
  // two rows of trees all the way round the square (Chebyshev distance from the centre), jittered along and across the row
  const rand = rng(277), trees = [];
  for (const inset of TREE_ROWS) {
    const r = ROOM_HALF - inset, n = Math.round(8 * r / TREE_STEP);
    for (let i = 0; i < n; i++) {
      const u = (i / n) * 4, side = Math.floor(u), s = (u - side) * 2 * r - r, j = (rand() - 0.5) * 1.6, k = (rand() - 0.5) * 1.6;
      const [x, z] = side === 0 ? [s + j, -r + k] : side === 1 ? [r + k, s + j] : side === 2 ? [-s + j, r + k] : [-r + k, -s + j];
      trees.push([cx + x, cz + z, 9 + rand() * 6]);
    }
  }
  // gravel: house -> tower loop, and the loop round the tower (radius 95 m, outside the feet)
  const loop = Array.from({ length: 33 }, (_, i) => [cx + Math.cos(i / 32 * 2 * Math.PI) * 95, cz + Math.sin(i / 32 * 2 * Math.PI) * 95]);
  const start = at(10, 0), end = [cx - f[0] * 95, cz - f[1] * 95], paths = [{ pts: [start, end], hw: 4 }, { pts: loop, hw: 4 }];
  const view = [cx - f[0] * 150, cz - f[1] * 150];
  return {
    id: 'eiffel', y: ROOM_Y, half: ROOM_HALF, centre, groundAt: () => ROOM_Y,
    tower: { x: cx, z: cz }, feet, colliders, trees, paths,
    house: { c: lift.c, th: lift.th, hw: 10.5, hd: 17.5, front: at(lift.hd, 0) },
    spawn: { x: lift.c[0], z: lift.c[1], th: lift.th },
    towerView: { x: view[0], z: view[1], th: lift.th },
  };
}
```

  The 17 m back wall check in the test is at `spawn - 17·fwd`, `r=0`: the back wall centre is at `a = -17.5` with `hw 0.5` along the heading, so it covers `-18 … -17`. OK. If `reach()` shows the car cannot leave the house, the side walls are 8.5 half-length from `a = -9`, so they span `-17.5 … -0.5`; the platform front (`a = 8`) and the front 8 m stay open. Adjust only the numbers, never the test intent.
- [ ] **Step 4: Run, expect green.** `node --test prototype/tests/room-eiffel.test.mjs`; then the whole suite.
- [ ] **Step 5: Commit.** `feat(hideout): the Eiffel room's layout, tree ring, tower feet and lift house (#277)`.

---

### Task 5: `index.html`, remove the hall, build the lift lobby

**Files:**
- Modify: `prototype/index.html`

All anchors are `grep -n` patterns. Do the edits, then load the page and check the console is clean.

- [ ] **Step 1: Imports (the `import { HIDEOUT, TUNNEL, ...` line, grep `from './hideout.js'`).** Drop `HALL_CAM, TOWER_SPOTS, TOWER_TOP` from the list, add `LIFT, onLiftPlatform`. Add below it:

```js
import { createLift } from './lift.js';
import { createLevels } from './levels.js';
import { eiffelRoom, ROOM_Y } from './room-eiffel.js';
```

- [ ] **Step 2: Remove the hall-only code.**
  - Delete `CAVE_CAM` (grep `const CAVE_CAM`) and its use in `stepCamera` (grep `CAVE_CAM.hall`). The look point there becomes simply `const look = new THREE.Vector3(P.x + bx * 6, P.y + 1.2, P.z + bz * 6); camera.lookAt(look);`.
  - Delete the textures `TEX.hall`/`TEX.hallBand` **only if** unused elsewhere (they are used by the `'hall'` building role for ordinary buildings, so **keep them**).
  - In `hideoutBuild()` (grep `function hideoutBuild`): remove the invisible 48-piece hall ring (`// #201: the hall keeps the car ...`), the `disc(...CAVE.nodes.hall.c, ..., 'gravel', gravel, 48)` line, and the `minRock` block (`const hn = CAVE.nodes.hall`). Keep `HIDE.rooms = {}` and its `for` loop; after it add `Object.assign(HIDE.rooms.lobby, { ceiling: fl + CAVE.nodes.lobby.ceiling });`.
  - In the ring-wall loop `for (const id of ['r0', 'n1'])` make it `['r0', 'n1', 'lobby']` and give the wall top per node: `const top = id === 'lobby' ? () => fl + CAVE.nodes.lobby.ceiling + 0.1 : lidTop;` and pass `top` instead of `lidTop` to `wallBox`.
  - Delete the whole `caveBuild(fl)` function (shell, four floodlights, base lights, summit lights) and the old `eiffelTower(x, z, b)` placeholder builder: **move** it to Task 7 (`roomBuild`). Replace the call `caveBuild(fl);` at the end of `hideoutBuild` with `lobbyBuild(fl);` (Step 3).
  - In the lid/ceiling cell code (grep `inHall`): delete `inHall` and use `const ROCK = col('#4a4642'), ceilH = (x, z) => ceilingH(x, z) ?? meshH(x, z) - 0.6;` and `cellTris(i, j, ceilH, underLid, underLid)` (the last argument loses its `&& !inHall` clause).
  - Shrink `const CAVE_MODE` to `{ on: false, group: null }`. The tower's state (`placeholder`, `model`, `eiffel`) moves to `ROOM` in Task 6/7. Until Task 7 the old `eiffelTower`, `loadEiffel`, `eiffelFootprints` and `window.__mm.eiffel*` hooks reference things that no longer exist: **delete them in this task** (their replacements are written in Task 7 from the old bodies, so copy the old bodies into the scratchpad first with `git show origin/main:prototype/index.html`). Delete the `if (CAVE_MODE.eiffel && ...) loadEiffel()` clause in `stepCar` too. The page must load with an empty console at the end of this task.
  - Remove the hall branch of the find in `stepCar`: `if (!HIDE.found && inside && roomAt(P.x, P.z) === 'hall') foundHideout();`. (Task 8 moves the find to the ride's `done`.)
  - `testhubContext()` has `hall: CAVE.nodes.hall.c`; change to `lobby: CAVE.nodes.lobby.c` (Task 9 rewrites the targets).

- [ ] **Step 3: Add `lobbyBuild(fl)` right after `hideoutBuild` (the lobby's contents, drawn only in cave mode, in `CAVE_MODE.group`).**

```js
// #277: the lift lobby at the end of T2b -- concrete floor, the dark steel platform with yellow edge strips, two lamps. The lift's
// gate bar drops across the platform's front during a ride (liftGate, stepLift). Drawn only under the hill like the rest of the group.
const LIFT_GATE = { cave: null, room: null };
function liftGateMesh() {   // a bar over the platform front: up (open) = 4.6 m, down (shut) = 1.4 m
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 2 * LIFT.hw), new THREE.MeshLambertMaterial({ color: 0xe0b020 })); m.userData.role = 'liftgate'; return m;
}
function placeGate(mesh, y0) { mesh.userData.y0 = y0; mesh.position.set(LIFT.c[0] + Math.cos(LIFT.th) * LIFT.hd, y0 + 4.6, LIFT.c[1] + Math.sin(LIFT.th) * LIFT.hd); mesh.rotation.y = -LIFT.th; }
function liftPlatformMeshes(y0, group) {   // y0 = the floor; group = where to add them
  const [cx, cz] = LIFT.c, f = [Math.cos(LIFT.th), Math.sin(LIFT.th)], v = [-f[1], f[0]];
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2 * LIFT.hd, 0.3, 2 * LIFT.hw), new THREE.MeshLambertMaterial({ color: 0x3a3f46 })); deck.position.set(cx, y0 + 0.15, cz); deck.rotation.y = -LIFT.th; group.add(deck);
  for (const [a, b, w, d] of [[LIFT.hd - 0.25, 0, 0.5, 2 * LIFT.hw], [-LIFT.hd + 0.25, 0, 0.5, 2 * LIFT.hw], [0, LIFT.hw - 0.25, 2 * LIFT.hd, 0.5], [0, -LIFT.hw + 0.25, 2 * LIFT.hd, 0.5]]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), new THREE.MeshLambertMaterial({ color: 0xe0b020 })); strip.position.set(cx + f[0] * a + v[0] * b, y0 + 0.32, cz + f[1] * a + v[1] * b); strip.rotation.y = -LIFT.th; group.add(strip);
  }
  const gate = liftGateMesh(); placeGate(gate, y0); group.add(gate); return gate;
}
function lobbyBuild(fl) {
  const u = TUNNEL, n = CAVE.nodes.lobby, group = CAVE_MODE.group;
  disc(...n.c, nodeR(n, u) - u.wall, 0.04, 'stone', col('#9aa0a6'));
  LIFT_GATE.cave = liftPlatformMeshes(fl, group);
  const v = [-Math.sin(LIFT.th), Math.cos(LIFT.th)];
  for (const k of [-1, 1]) { const l = new THREE.PointLight(0xffe2b0, 160, 44, 2); l.position.set(n.c[0] + v[0] * 10 * k, fl + 6, n.c[1] + v[1] * 10 * k); l.userData.kind = 'point'; group.add(l); HIDE.lights.push(l); }
}
```
  `disc` and `nodeR` already exist in scope (`disc` is the local helper used by `hideoutBuild` for gravel: grep `disc(` to confirm it is reachable from `lobbyBuild`; if it is a closure inside `hideoutBuild`, define `lobbyBuild` inside `hideoutBuild` instead, before its last line). **If #276 changed how `HIDE.lights` / the point lights are created, follow its new pattern** and keep two lobby lights.
  A cave-light intensity check: the lobby is about 40 m across; two point lights at 160 cd with decay 2 give about 1.6 at 10 m. Reduce to 90 if the platform looks blown out.

- [ ] **Step 4: Verify.**
  - `node --test prototype/tests/*.test.mjs` (green).
  - Start a static server (`python3 -m http.server 8000` in the repo root, in the background: it is a server, not a verification run) and load `http://localhost:8000/prototype/index.html?region=hochrhein` with Playwright, as the existing tests do, capture `pageerror`/console errors: none. `__mm.hideout().rooms.lobby` exists, `rooms.hall` is gone.
- [ ] **Step 5: Commit.** `feat(hideout): replace the hall with a lift lobby (#277)`. At this point `test_hideout.py` is red (it still tests the hall); Task 9 fixes that. **Do not run it yet.**

---

### Task 6: `index.html`, levels: ground, colliders, hidden surface, labels, minimap, F, jumps

**Files:**
- Modify: `prototype/index.html`

- [ ] **Step 1: Make `OBB_GRID` swappable and register the levels.**
  - `const OBB_GRID = makeGrid(32), ROAD_GRID = makeGrid(32);` becomes `let OBB_GRID = makeGrid(32); const ROAD_GRID = makeGrid(32);`. Check with `grep -n "OBB_GRID" prototype/index.html` that nobody **captures** it in a long-lived closure (`const grid = OBB_GRID`): there should be only direct reads.
  - Just before `function groundH(x, z, y)` insert:

```js
// #277: the levels. The surface keeps today's ground and colliders; the Eiffel room registers its own on its first ride (roomBuild).
const LEVELS = createLevels(); const SURFACE_GRID = OBB_GRID;
```
  - Rename the existing `function groundH(x, z, y) {` to `function surfaceGroundH(x, z, y) {` and add above it:

```js
function groundH(x, z, y) { return LEVELS.isSurface() ? surfaceGroundH(x, z, y) : LEVELS.groundAt(x, z, y); }
```
  - Right after the `surfaceGroundH` definition: `LEVELS.register('surface', { groundAt: surfaceGroundH, colliders: SURFACE_GRID });`.
  - `LEVELS.onChange` (in Step 3) sets `OBB_GRID = LEVELS.colliders`.

- [ ] **Step 2: Gate the surface-only readers.**
  - `waterLevelAt(x, z, y)`: first line becomes `if (!LEVELS.isSurface()) return null;`.
  - `caveInside()`: `return !!HIDE && LEVELS.isSurface() && roofedAt(P.x, P.z) && P.y < meshH(P.x, P.z) - 1;`.
  - In `stepCar` the `P.safe` update (`if (roadDist(P.x, P.z) < 0 && !onBridge(...) && !air) P.safe = [...]`): prefix the condition with `LEVELS.isSurface() &&`.
  - Camera `underCeiling` already uses `caveInside()`, so it is off below.
  - `treesVisible(on)`: first line `on = on && LEVELS.isSurface();`.
  - `camTail()` (grep `function camTail`): the sun follows the car's level: `const base = LEVELS.isSurface() ? 0 : ROOM_Y;` then `sun.position.set(P.x - 300, base + 400, P.z - 200); sun.target.position.set(P.x, base, P.z);`.

- [ ] **Step 3: The level switch.** Add after `setUnderwater` (grep `function setUnderwater`):

```js
// #277: switching level. surfaceRoot (hidden) takes every direct child of the scene that is not on the keep-list, so the whole surface
// world -- terrain, buildings, forest, label sprites, checkpoint markers -- is out of the render below, whatever per-frame code does to
// the nodes' own .visible. It is not a visibility flag per node: a hidden parent beats them all. Back on the surface they return.
const surfaceRoot = new THREE.Group(); surfaceRoot.visible = false; surfaceRoot.name = 'surfaceRoot'; scene.add(surfaceRoot);
const ROOM = { layout: HIDE ? eiffelRoom() : null, built: false, group: null, cab: null, eiffel: null, model: null, placeholder: null };
const keepBelow = () => new Set([car, sky, sun, sun.target, hemi, sunSprite, shadowMesh, surfaceRoot, ROOM.group, ROOM.cab]);
LEVELS.onChange((id, from) => {
  OBB_GRID = LEVELS.colliders;
  if (id !== 'surface') {
    if (CAVE_MODE.on) setCave(false);
    const keep = keepBelow(); for (const node of [...scene.children]) if (!keep.has(node)) surfaceRoot.add(node);
    if (ROOM.group) ROOM.group.visible = true;
  } else {
    if (ROOM.group) ROOM.group.visible = false;
    scene.add(...surfaceRoot.children);   // (copy: .add moves the nodes out of the array being read)
  }
  setRoomLook(id !== 'surface');
});
```
  Because `scene.add(...surfaceRoot.children)` iterates a live array that shrinks, write it as `for (const node of [...surfaceRoot.children]) scene.add(node);`.
  `shadowMesh`, `heli`, `car` are `const`s defined **later** in the file than this block: put the whole block (and the `ROOM` const) **after** the line `scene.add(shadowMesh)` and `scene.add(heli)`, e.g. directly before `// ---------- input ----------`. `keepBelow` is a function, so a later `ROOM.cab` is fine.
  Do **not** put the mirror/CAR_ENV scenes in the keep-list; they are separate `THREE.Scene`s.

- [ ] **Step 4: The room look.** Next to `setCave` add:

```js
// #277: the Eiffel room's light -- a clear midday: pale haze fog, blue sky dome, a steady sun, no shadow map, no time of day
const ROOM_LOOK = { fog: '#cfe2f3', density: 0.00045, skyTop: '#3f7fd6', skyHor: '#d9e9f7', hemiSky: '#e4eeff', hemiGround: '#6f8f55', hemi: 0.85, sun: 1.1 };
function setRoomLook(on) {
  if (!on) { applyStyle(styleKey); return; }
  const L2 = ROOM_LOOK; scene.fog = new THREE.FogExp2(col(L2.fog), L2.density); skyMat.uniforms.top.value.set(L2.skyTop); skyMat.uniforms.hor.value.set(L2.skyHor);
  hemi.color.set(L2.hemiSky); hemi.groundColor.set(L2.hemiGround); hemi.intensity = L2.hemi; sun.intensity = L2.sun; sun.castShadow = false; renderer.shadowMap.enabled = false; sunSprite.visible = true;
}
```
  and at the end of `applyStyle(k)` (grep `function applyStyle`), next to `if (CAVE_MODE.on) setCave(true);`, add `if (!LEVELS.isSurface()) setRoomLook(true);` (careful: `setRoomLook(false)` calls `applyStyle`, and `applyStyle` calls `setRoomLook(true)` only when below, so there is no recursion on the surface).

- [ ] **Step 5: Jumps leave the room; R does not; labels, minimap, F.**
  - `placeOnRoad(x, z, th, name)` (grep `function placeOnRoad`): first statement `const wasBelow = LEVELS.onJump();` (before `P.safe = ...; resetCar()`; the camera snap is the next bullet). `resetCar()` is unchanged: **R** calls it directly, so it keeps the level and `P.safe` below is the lift house (set in Task 8). `jumpToWreck` and the Testhub reach the surface through `placeOnRoad`, so they are covered. Note for the spec's "double-click beam": `beamTo` calls `placeOnRoad`, but its pick ray only tests the (hidden, back-face-culled from below) surface meshes, so below it picks nothing. That is accepted: there is nothing to point at in the room, and `J`/Testhub are the ways up.
  - Camera snap: `placeOnRoad` starts with `const wasBelow = LEVELS.onJump();` and, after `resetCar()`, `if (wasBelow) camPos.set(x - Math.cos(th) * 12, P.y + 4, z - Math.sin(th) * 12);` (the chase camera would otherwise glide up 600 m).
  - The autopilot and the Navi are not special-cased: `resetCar()` already stops the autopilot, and no road exists below. If `O` behaves oddly in the room, write it into `TODO.md`; do not fix it here.
  - `takeOff()`: `if (roofedAt(P.x, P.z))` becomes `if (roofedAt(P.x, P.z) || !LEVELS.isSurface())` (same toast `hideoutNoSky`, "as today").
  - **Labels, village names, house heights hidden below.** If #258 has merged, extend its predicate. Otherwise add at the top of `updateLabels(x, z)`: `if (!LEVELS.isSurface()) { LABELS.shown = []; for (const s of LABELS.pool) s.visible = false; return; }`, the same shape at the top of `updateVillageNames` (`VILLAGE_SIGNS.shown = []; for (const s of VILLAGE_SIGNS.sprites.values()) s.visible = false; return;`) and in the `debugLayer` `tick(x, z)` for `DEBUG_H` (`DEBUG_H.shown = []; pool hidden; return`). (The sprites are also in `surfaceRoot`, hidden; the guard keeps `__mm.labels()` honest and skips the work.)
  - **Minimap hidden below.** In `LEVELS.onChange` add `document.body.classList.toggle('below', id !== 'surface');` and in the page's `<style>` add `body.below #br{display:none}` (`#br` is the bottom-right map box, grep `<div id="br">`). Also hide the Tab full map: in `setFullMap` (grep `function setFullMap`) the first line returns early when `!LEVELS.isSurface()`. The checkpoint arrow stays as is.
  - **Debug hooks:** `window.__mm.level = () => ({ id: LEVELS.id, grid: OBB_GRID === SURFACE_GRID ? 'surface' : 'room', y: P.y })`.

- [ ] **Step 6: Verify (Playwright by hand, no new test file yet).** Load the real world (as `test_hideout.py::open_page` does), `__mm.sim`/`place` is enough. In `page.evaluate`, call `LEVELS` through a temporary global is not allowed, so use `__mm.level()` and add a throw-away `window.__mm.setLevel = (id) => LEVELS.set(id)` hook (kept, it becomes the Task 8 test hook). With the room not built yet, `setLevel('eiffel')` must not throw (`LEVELS` has no `eiffel` registered until Task 7: **register a stub in this step**: `LEVELS.register('eiffel', { groundAt: () => ROOM_Y, colliders: makeGrid(32) })` guarded by `if (HIDE)`, Task 7 replaces the stub's colliders). Check: after `setLevel('eiffel')` the page logs no errors, `__mm.labels()` is `[]`, `document.body.classList` has `below`, `__mm.ground(x, z, y)` is `-600`, then `setLevel('surface')` restores it. (This is a smoke check you may do in a scratch script in the scratchpad dir; the permanent test is Task 9.)
- [ ] **Step 7: Commit.** `feat(hideout): level switching with its own ground, colliders and a hidden surface world (#277)`.

---

### Task 7: `index.html`, build the Eiffel room (lazily) with sky, clouds, trees, tower and lift house

**Files:**
- Modify: `prototype/index.html`

- [ ] **Step 1: `roomBuild()`**, called the first time the lift starts to go down (Task 8). Add after `lobbyBuild`/before the loop section (it needs `ROOM`, so put it after the Task 6 block):

```js
// #277: the Eiffel room, built on the first ride down. Everything is in ROOM.group (hidden on the surface); the layout is
// room-eiffel.js. 500 x 500 lawn, gravel strips, two rows of low-poly trees, the tower, the lift house, clouds.
function roomBuild() {
  if (ROOM.built) return; ROOM.built = true;
  const R = ROOM.layout, [cx, cz] = R.centre, y = R.y, group = new THREE.Group(); ROOM.group = group; group.visible = false;
  // lawn: one plane, the grass texture tiled every 8 m (TEX.grass is the surface's grass; reuse it)
  const lawnTex = TEX.grass.clone(); lawnTex.wrapS = lawnTex.wrapT = THREE.RepeatWrapping; lawnTex.repeat.set(2 * R.half / 8, 2 * R.half / 8); lawnTex.needsUpdate = true;
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(2 * R.half, 2 * R.half), new THREE.MeshLambertMaterial({ map: lawnTex, color: 0xb8d89a })); lawn.rotation.x = -Math.PI / 2; lawn.position.set(cx, y, cz); group.add(lawn);
  for (const p of R.paths) group.add(flatStrip(p.pts, p.hw, y + 0.04, 0xcfc3ac));
  roomTrees(group, R); roomTower(group, R); roomHouse(group, R); roomClouds(group, R);
  // sunlit surfaces need no lights of their own: the style's hemisphere + sun (setRoomLook) light the room
  const grid = makeGrid(32); for (const o of R.colliders) { const e = o.hw + o.hd; gridAdd(grid, o.x - e, o.z - e, o.x + e, o.z + e, o); }
  LEVELS.register('eiffel', { groundAt: R.groundAt, colliders: grid });
  scene.add(group); window.__mm.counts.eiffel = 1;
  ROOM.eiffel = ROOM.eiffel || { loaded: false, placeholder: true, started: false, error: null, tris: 0, height: null, base: null, material: null };
  if (ROOM.model) attachModel();
}
function flatStrip(pts, hw, y, colour) {   // a flat ribbon on the lawn: two triangles per segment
  const pos = [], idx = []; pts.forEach((p, i) => {
    const q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)], dx = q[0] - o[0], dz = q[1] - o[1], d = Math.hypot(dx, dz) || 1, nx = -dz / d * hw, nz = dx / d * hw;
    pos.push(p[0] + nx, y, p[1] + nz, p[0] - nx, y, p[1] - nz); if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: colour, side: THREE.DoubleSide })); m.renderOrder = 1; return m;
}
```
  (If the strips z-fight with the lawn, raise `y + 0.04` to `+ 0.08`; the lawn is flat, so a small offset is enough.)
  Check first that `TEX.grass` is a plain texture (`grep -n "TEX.grass =" prototype/index.html`); if it is built through `makeTex` with a repeat already set, `clone()` plus the new `repeat` is still right.

- [ ] **Step 2: Trees, house, clouds** (same section):

```js
function roomTrees(group, R) {   // the forest's cone + trunk, one InstancedMesh each (about 1000 trees, 7 + 6 triangles per tree)
  const cone = new THREE.InstancedMesh(coneG, new THREE.MeshStandardMaterial({ color: 0x4f8a4a, flatShading: true, roughness: 1 }), R.trees.length);
  const trunk = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x6a4a30, flatShading: true, roughness: 1 }), R.trees.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), r = rng(278);
  R.trees.forEach(([x, z, h], i) => {
    m.compose(new THREE.Vector3(x, R.y + h * 0.28, z), q, new THREE.Vector3(h * 0.42, h * 0.75, h * 0.42)); cone.setMatrixAt(i, m); c.setHSL(0.3 + (r() - 0.5) * 0.08, 0.4, 0.3 + r() * 0.12); cone.setColorAt(i, c);
    m.compose(new THREE.Vector3(x, R.y, z), q, new THREE.Vector3(h * 0.9, h * 0.3, h * 0.9)); trunk.setMatrixAt(i, m);
  });
  cone.computeBoundingSphere(); trunk.computeBoundingSphere(); group.add(cone, trunk);
}
function roomHouse(group, R) {   // the lift house: three concrete walls and a flat roof round the platform, the front open; platform + gate as in the lobby
  const f = [Math.cos(LIFT.th), Math.sin(LIFT.th)], v = [-f[1], f[0]], at = (a, b) => [LIFT.c[0] + f[0] * a + v[0] * b, LIFT.c[1] + f[1] * a + v[1] * b], mat = new THREE.MeshLambertMaterial({ color: 0xb9b4aa });
  for (const [a, b, len, dep] of [[-17.5, 0, 1, 23], [-9, -10.5, 17, 1], [-9, 10.5, 17, 1]]) { const w = new THREE.Mesh(new THREE.BoxGeometry(len, 12, dep), mat); const [x, z] = at(a, b); w.position.set(x, R.y + 6, z); w.rotation.y = -LIFT.th; group.add(w); }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(18, 0.6, 23), mat); const [rx, rz] = at(-9, 0); roof.position.set(rx, R.y + 12.3, rz); roof.rotation.y = -LIFT.th; group.add(roof);
  LIFT_GATE.room = liftPlatformMeshes(R.y, group);
}
function roomClouds(group, R) {   // ~36 soft white sprites high above the room, drifting nowhere (the camera never leaves the 500 m square)
  const tex = makeTex(256, 128, (g, w, h) => { g.clearRect(0, 0, w, h); for (const [x, yy, r] of [[90, 70, 46], [140, 60, 52], [185, 74, 40], [120, 82, 40], [160, 84, 34]]) { const gr = g.createRadialGradient(x, yy, 2, x, yy, r); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); } }, { alpha: true });
  const r = rng(279);
  for (let i = 0; i < 36; i++) { const a = r() * 2 * Math.PI, d = 700 + r() * 1700, s = 450 + r() * 500; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.85 })); sp.scale.set(s, s * 0.45, 1); sp.position.set(R.centre[0] + Math.cos(a) * d, R.y + 650 + r() * 450, R.centre[1] + Math.sin(a) * d); group.add(sp); }
}
```
  `rng` here is the seeded generator already used in the file (`rng(201)` in the old `caveBuild`; grep `rng =`/`import.*rng`). `coneG`/`trunkG` are the module-level geometries of the plain tree meshes.
  If `makeTex`'s `{ alpha: true }` option is not what the village-name texture uses, copy exactly its call shape (`villageTex`).

- [ ] **Step 3: The tower: placeholder now, model when loaded.** Move the old `eiffelTower(x, z, b)` here as `roomTower(group, R)` (same body, with `x = R.tower.x`, `z = R.tower.z`, `b = R.y`, and `group.add(mesh); ROOM.placeholder = mesh;`). **Drop its `pushOBB` foot colliders** (the feet are in `R.colliders`) and its `CAVE_MODE.eiffel = ...` line. Move `loadEiffel` and `eiffelFootprints` too, retargeted:
  - `loadEiffel()`: state is `ROOM.eiffel` (create it lazily: `const E = ROOM.eiffel ||= {loaded:false, placeholder:true, started:false, error:null, tris:0, height:null, base:null, material:null}`); after loading and scaling, store `ROOM.model = root` and call `if (ROOM.built) attachModel();`. The scaling/positioning line that used `CAVE.nodes.hall.c` and `HIDE.floor` now uses `ROOM.layout.tower` and `ROOM.layout.y`.
  - `function attachModel() { if (ROOM.placeholder) { ROOM.group.remove(ROOM.placeholder); ROOM.placeholder = null; } ROOM.group.add(ROOM.model); ROOM.eiffel.loaded = true; ROOM.eiffel.placeholder = false; }`
  - The preload trigger, in `stepCar`, where the old line was: `if (HIDE && !(ROOM.eiffel && ROOM.eiffel.started) && Math.hypot(P.x - HIDEOUT.mouth[0], P.z - HIDEOUT.mouth[1]) < EIFFEL.loadWithin) loadEiffel();`. The model downloads when the car comes near the Hübel; if the first ride is quicker than the download, the placeholder stands until `attachModel()` swaps it.
  - `eiffelFootprints()`: base on `ROOM.model`, `ROOM.layout.tower`, `ROOM.layout.y`.
  - `window.__mm.eiffel = () => ROOM.eiffel ? { ...ROOM.eiffel, feet: EIFFEL.feet, footHw: EIFFEL.footHw } : null;`, `__mm.eiffelFootprints = eiffelFootprints`.
  - Materials: keep the model's `MeshStandardMaterial` (colour 0x6b4a32, roughness 0.6, metalness 0.1) as is; the hemisphere + sun now light it. No floodlights.

- [ ] **Step 4: Compile the room's programs up front** to avoid a hitch at the doors: near `if (CAVE_MODE.group) { setCave(true); renderer.compile(scene, camera); setCave(false); }` there is nothing to do for the room because it is built later; instead, at the end of `roomBuild()` call `renderer.compile(scene, camera)` once (it is built during the 7 s of the ride, under the cab).

- [ ] **Step 5: Perf surface.** Add the two hooks (grep `window.__mm.cave =` for the neighbourhood):

```js
// #277: for the PR's surface-vs-room measurement: what the last frame drew, and the mean frame time over n frames
window.__mm.renderInfo = () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, level: LEVELS.id });
window.__mm.frameMs = (n = 30) => new Promise(res => { let k = 0, t0 = 0; const tick = (t) => { if (k === 0) t0 = t; if (++k > n) res((t - t0) / n); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
```
  (If `renderer.info.autoReset` is true, `info.render` is the **last** frame's numbers, which is what we want.)

- [ ] **Step 6: Verify.** Smoke in a scratch Playwright script: `__mm.setLevel('eiffel')` (the Task 6 hook) after calling a temporary `__mm.buildRoom = roomBuild`, then `__mm.place(room.spawn...)`, `__mm.ground(...)` is `-600`, `__mm.renderInfo()` has `triangles > 0`, take a screenshot (`page.screenshot`) and **look at it**: lawn, sky with clouds, tree ring, tower. Expected: the tower reaches the top of the picture when the camera looks up; no black void behind the trees. Fix visual problems here, not later. Keep `__mm.buildRoom` only if Task 9 needs it, otherwise remove it.
- [ ] **Step 7: Commit.** `feat(hideout): the Eiffel room with lawn, trees, clouds, tower and lift house, built lazily (#277)`.

---

### Task 8: `index.html`, the ride: trigger, cab, gate, indicator, hum, switch, find toast, race flag

**Files:**
- Modify: `prototype/index.html`
- Modify: `prototype/strings.js` only if a string is needed (none expected: the find toast reuses `hideoutFound`)

- [ ] **Step 1: The ride controller** (after `roomBuild` section):

```js
// #277: the freight lift. LIFT_RIDE is the lift.js state machine driven by the car on the platform; the switch of level happens at the
// midpoint of the descent, behind the cab. Input is locked for the ride; the camera keeps its mode and is carried by the same y step.
const LIFT_RIDE = createLift();
const CAB = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 16, 24, 1, true), new THREE.MeshLambertMaterial({ side: THREE.BackSide, map: makeTex(128, 256, (g, w, h) => { g.fillStyle = '#8d9096'; g.fillRect(0, 0, w, h); g.fillStyle = '#6c7076'; for (let y = 0; y < h; y += 64) g.fillRect(0, y, w, 8); g.fillStyle = '#b4b7bc'; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 3, h); }) }));
CAB.visible = false; scene.add(CAB); ROOM.cab = CAB; CAB.material.map.wrapS = CAB.material.map.wrapT = THREE.RepeatWrapping; CAB.material.map.repeat.set(4, 2);
const levelFloorY = () => LEVELS.isSurface() ? (HIDE && HIDE.floor) : ROOM_Y;
function liftOnPlatform() { return !!HIDE && onLiftPlatform(P.x, P.z) && Math.abs(P.y - levelFloorY()) < 1; }
function liftIndicator(text) { const el = $('liftfloor'); el.hidden = text === null; if (text !== null) el.textContent = text; }
function stepLift(dt) {
  if (!HIDE) return;
  const ev = LIFT_RIDE.step(dt, { onPlatform: liftOnPlatform(), speed: Math.hypot(P.vx, P.vz), dir: LEVELS.isSurface() ? 'down' : 'up' });
  for (const e of ev) liftEvent(e);
  const gate = LIFT_RIDE.gate; for (const m of [LIFT_GATE.cave, LIFT_GATE.room]) if (m) m.position.y = m.userData.y0 + 4.6 - 3.2 * gate;
  CAB.visible = LIFT_RIDE.busy; if (CAB.visible) { CAB.position.set(P.x, P.y + 7, P.z); CAB.material.map.offset.y += (LIFT_RIDE.dir === 'down' ? 1 : -1) * dt * (LIFT_RIDE.phase === 'descending' ? 0.5 : 0); }
  const fl = LIFT_RIDE.floor(); liftIndicator(fl === null ? null : String(fl).replace('-', '−'));
}
function liftEvent(e) {
  if (e.type === 'start') { stopAuto('reset'); P.vx = P.vz = P.vy = 0; if (R.state === 'racing' || R.state === 'armed') R.jumped = true; SFX.hum(LIFT_TIMES_TOTAL()); if (e.dir === 'down') roomBuild(); }
  else if (e.type === 'switch') liftSwitch(e.dir);
  else if (e.type === 'done' && e.dir === 'down' && HIDE && !HIDE.found) foundHideout();
}
const LIFT_TIMES_TOTAL = () => { const t = LIFT_RIDE.times; return t.close + t.ride + t.open; };
function liftSwitch(dir) {
  const before = P.y; LEVELS.set(dir === 'down' ? 'eiffel' : 'surface');
  P.y = LEVELS.isSurface() ? HIDE.floor : ROOM_Y; P.safe = [LIFT.c[0], LIFT.c[1], LIFT.th];   // R now returns to this lift, on whichever level
  camPos.y += P.y - before; camera.position.copy(camPos);   // carry the chase camera down with the car; it keeps its mode and offset
  restShadow(); car.position.y = P.y;
}
```
  Details that matter:
  - `LIFT_RIDE.times` and `LIFT_RIDE.abort()` exist since Task 2.
  - `$('liftfloor')`: add the DOM element in the body next to the toast area: `<div id="liftfloor" hidden></div>` plus CSS: `#liftfloor{position:fixed;left:50%;top:18%;transform:translateX(-50%);font:700 64px "Barlow Condensed",sans-serif;color:#f5efe0;text-shadow:0 2px 6px #000;z-index:12;pointer-events:none}`. The numbers are language-neutral, no i18n key.
  - `foundHideout()` already writes `localStorage`, toasts `hideoutFound` and plays the jingle. Do not change it.
  - On the way up, `liftSwitch('up')` sets `P.y = HIDE.floor`. `HIDE.floor` is the cave floor (set in `hideoutBuild`), the same one the lobby uses.
  - `stopAuto('reset')` on start covers the autopilot.
  - R during a ride: `resetCar()` is called by the key; guard with `if (LIFT_RIDE.busy) return;` in the `KeyR` handler (grep `e.code === 'KeyR'`). A jump during a ride (`placeOnRoad`) ends the ride: add `LIFT_RIDE.abort(); CAB.visible = false; liftIndicator(null);` to `placeOnRoad` next to `LEVELS.onJump()` (`CAB` and `liftIndicator` are defined later in the file, which is fine inside a function body).

- [ ] **Step 2: Lock the input.** At the top of `stepCar(dt)`: `if (LIFT_RIDE.busy) { P.vx = P.vz = P.vy = 0; car.position.set(P.x, P.y, P.z); return; }`. `window.__mm.sim` (grep `window.__mm.sim =`) steps `stepCar(1 / 60)` in a synchronous loop: add `stepLift(1 / 60);` after it so a simulated run drives the lift too. Call `stepLift(dt)` in `loop` right after `stepCar` (grep `if (FLY.on) stepFly(dt); else stepCar(dt);` and append `stepLift(dt);` after `stepRace(dt);`). `stepLift` must also run while the lift is idle so the dwell counts.

- [ ] **Step 3: The hum** in the `SFX` object (grep `splash() { burst(`), a 55 Hz sawtooth through a low-pass for `dur` seconds:

```js
    hum(dur) { if (muted || holds.size) return; const a = ctx(), o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain(); o.type = 'sawtooth'; o.frequency.value = 52; f.type = 'lowpass'; f.frequency.value = 220; g.gain.setValueAtTime(0, a.currentTime); g.gain.linearRampToValueAtTime(0.28, a.currentTime + 0.4); g.gain.setValueAtTime(0.28, a.currentTime + Math.max(0.4, dur - 0.5)); g.gain.linearRampToValueAtTime(0, a.currentTime + dur); o.connect(f); f.connect(g); g.connect(a.master); o.start(); o.stop(a.currentTime + dur + 0.05); },
```

- [ ] **Step 4: Test hooks.**

```js
window.__mm.liftTimes = (t) => { LIFT_RIDE.setTimes(t); return LIFT_RIDE.times; };   // tests: a ride of 1 s instead of 8 (headless renders ~1 fps and the loop clamps dt to 0.05)
window.__mm.lift = () => ({ phase: LIFT_RIDE.phase, gate: LIFT_RIDE.gate, floor: LIFT_RIDE.floor(), level: LEVELS.id, cab: CAB.visible, indicator: $('liftfloor').hidden ? null : $('liftfloor').textContent, found: HIDE ? HIDE.found : null });
window.__mm.setLevel = undefined;   // remove the Task 6 smoke hook now
```
  (Drop `__mm.setLevel` and any `__mm.buildRoom` from the earlier tasks unless a Task 9 test needs one; the room is entered by driving or by the Testhub path.)

- [ ] **Step 5: Verify (scratch Playwright, look at screenshots).** Place the car at `LIFT.c - 20·fwd` heading `LIFT.th` (positions from `__mm.hideout()`; extend the hook with `lift: { c, th }` so tests do not duplicate numbers), set `liftTimes({dwell:.1, close:.1, ride:.4, open:.1})`, `sim` forward until stopped on the platform, wait for `lift().level === 'eiffel'`; check `__mm.car().y ≈ -600`, `__mm.lift().found === true`, then `lift().level` stays `eiffel` while the car stands (disarmed), drive off and back and ride up. Screenshot mid-ride (cab, indicator) and below (tower).
- [ ] **Step 6: Commit.** `feat(hideout): the lift ride, cab, floor indicator, hum and the find below (#277)`.

---

### Task 9: Testhub target, the Playwright ride test (replaces the hall tests), perf numbers

**Files:**
- Modify: `prototype/testhub-targets.js`
- Modify: `prototype/tests/testhub-targets.test.mjs`
- Modify: `prototype/index.html` (`testhubContext`, `testhubGo`, `__mm.hideout`)
- Modify: `prototype/tests/test_hideout.py`
- Modify: `prototype/tests/test_testhub.py` (one test)

- [ ] **Step 1: Testhub targets (failing node test first).** In `testhub-targets.test.mjs` replace the tower expectations (the `hall` fixtures at lines ~59-90 and the test `spotTargets: hideout tower is 110 m before the hall centre ...`). The new context is `hideout: { mouth, heading, tower: { x, z, th } }`; the tower target becomes `{ id: 'hideout.tower', label: 'Hideout: Eiffel room, facing the tower', kind: 'spot', spot: { x: tower.x, z: tower.z, th: tower.th, room: 'eiffel' } }`. Test: it is a spot with `room: 'eiffel'` and the given pose; the gate target is unchanged (12 m before the mouth, `heading`); without a `hideout` context both vanish. Then in `testhub-targets.js`: delete `TOWER_BACK`, the `h.hall`/`h.n1` maths, and:

```js
function hideoutSpots(h) {
  if (!h) return [];
  const gate = [h.mouth[0] - Math.cos(h.heading) * GATE_BACK, h.mouth[1] - Math.sin(h.heading) * GATE_BACK];
  return [
    spot('hideout.gate', 'Hideout: reservoir gate', ...gate, h.heading),
    spot('hideout.tower', 'Hideout: Eiffel room, facing the tower', h.tower.x, h.tower.z, h.tower.th, { room: 'eiffel' }),
  ];
}
```
  Run `node --test prototype/tests/testhub-targets.test.mjs`.
- [ ] **Step 2: Wire it.** `testhubContext()`: `hideout: HIDE ? { mouth: HIDEOUT.mouth, heading: HIDEOUT.heading, tower: ROOM.layout.towerView } : null`. `testhubGo(target)`: for a spot with `s.room`:

```js
  const s = target.spot;
  if (s.room) { roomBuild(); placeOnRoad(s.x, s.z, s.th, target.label); LEVELS.set('eiffel'); P.safe = [s.x, s.z, s.th]; resetCar(); camPos.set(s.x - Math.cos(s.th) * 12, P.y + 4, s.z - Math.sin(s.th) * 12); camera.position.copy(camPos); return; }   // placeOnRoad flags a race and ends any level; then step down
```
  and delete the old `if (s.floor && HIDE) {...}` branch (the `floor: true` flag is gone). Note `placeOnRoad` toasts the label and flags the race, which is what "Testhub jumps" means; entering the room afterwards through `LEVELS.set` does `setRoomLook(true)` and `surfaceRoot` through `onChange`. `resetCar()` then puts the car at the pose with `groundH` = `-600`. Mark the find: Testhub does not set `found` (the find is the ride's).
  Extend `window.__mm.hideout()` with `lift: { c: LIFT.c, th: LIFT.th, hw: LIFT.hw, hd: LIFT.hd }`, `room: ROOM.layout && { centre, tower, spawn, towerView, half, y }` and `rooms.lobby`.
- [ ] **Step 3: `test_testhub.py::test_hideout_targets_put_the_car_at_the_gate_and_in_the_hall`.** Rename to `..._and_in_the_eiffel_room`; after `go(page, "hideout.tower")` assert `__mm.level().id == 'eiffel'`, `abs(car.y + 600) < 1`, and the car is 120-180 m from the tower centre (`h["room"]["tower"]`) facing it (heading within 0.05 rad). Replace the `hall` assertions. Run only it: `-k eiffel_room` (a Playwright file other than `test_hideout.py` is allowed for this single test because the same change breaks it; do not run the rest of `test_testhub.py`).
- [ ] **Step 4: Rewrite `test_hideout.py` (a deliberate spec change: the hall tests are replaced, not fixed).** Module docstring: replace "a 340 m hall with a life-size Eiffel Tower, found by driving into the hall" with the lift and the room. Go through every test (`grep -n "^def test" prototype/tests/test_hideout.py`) and decide with this table:

| Test (current name) | Decision |
|---|---|
| `test_floor_lid_rooms_and_walls` | Adapt: `hall` becomes `lobby` (the 340 m width and 40 m rock assertions go; keep one floor, rooms under the hill, walls, stubs, triangle budget). Remove `t2b_point`'s hall maths or point it at the lobby. |
| `test_drive_in_finds_the_hideout` | **Replace** by `test_lift_ride_finds_the_hideout_and_the_room` (below). |
| `test_sky_ground_and_no_takeoff_inside` | Adapt: keep the no-takeoff in the tunnel; the lobby counts as under the hill. |
| `test_hill_is_solid_over_the_tunnel_and_the_cavern`, `test_hill_is_solid_over_the_system`, `test_map_shows_the_hill_over_the_hall` (rename `..._over_the_lobby`), `test_forest_stands_on_the_lid`, `test_ring_wall_stays_under_the_hill`, `test_no_find_on_top_of_the_hill`, `test_corridor_edges_are_covered_from_above` | Keep; swap `hall` for `lobby` where they reference it. `test_no_find_on_top_of_the_hill` now asserts that no find happens on the hill or in the tunnel and lobby. |
| `test_cave_mode_toggles_and_restores` | Keep for the tunnel; assert cave mode is **off** in the room. |
| `test_floodlights_aim_at_the_tower_and_draw_calls_stay_bounded`, `test_chase_camera_tilts_up_in_the_hall`, `test_camera_stays_under_the_ceiling_while_easing_and_on_the_hill_above_it` (hall part), `test_tower_hidden_from_the_mouth` | **Delete** the floodlight and tilt tests (their features are gone). Keep the camera and sight-line tests with the lobby (the tower is now not even in the cave: the sight test becomes "the lobby is hidden from the mouth"). |
| `test_j_reservoir_puts_the_car_on_the_huebel_facing_the_gate` | Keep. |
| `test_eiffel_model_loads_lazily_and_matches_the_feet`, `test_eiffel_placeholder_survives_a_blocked_model` | Keep: the model still loads near the Hübel; `eiffelFootprints()` is relative to the room's tower. They need `__mm.eiffel()`, so first ride the lift (or `hideout.tower` target) so that `ROOM.group` exists; the placeholder test asserts the room still renders with the model blocked. |

  New tests (write them first, red, they pass once Tasks 1-8 are in):

```python
LIFT_FAST = "() => window.__mm.liftTimes({dwell: 0.1, close: 0.1, ride: 0.4, open: 0.1})"

def drive_onto_the_lift(page, h):
    """Stand the car, at rest, on the platform; the loop's own frames then count the 1 s dwell."""
    lx, lz = h["lift"]["c"]
    page.evaluate(f"() => window.__mm.place({lx}, {lz}, {h['lift']['th']})")


@needs_world
def test_lift_ride_finds_the_hideout_and_the_room(server):
    """Drive onto the lift, stand 1 s: gate, descent, doors open below; the find toast comes only now; the room is the Eiffel room."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); page.evaluate(LIFT_FAST)
        assert page.evaluate("() => window.__mm.hideout().found") is False
        drive_onto_the_lift(page, h)
        page.wait_for_function("() => window.__mm.lift().level === 'eiffel' && window.__mm.lift().phase === 'idle'", timeout=240000)
        car = page.evaluate("() => window.__mm.car()")
        assert abs(car["y"] + 600) < 1.0, car
        assert page.evaluate("() => window.__mm.lift().found") is True
        assert page.evaluate("() => window.__mm.cave().on") is False
        assert page.evaluate("() => window.__mm.labels()") == [] and page.evaluate("() => document.body.classList.contains('below')")
        assert page.evaluate("() => window.__mm.raceFlags().jumped") is False   # no race running: nothing flagged
        br.close()
        assert not errors, errors

@needs_world
def test_driving_across_the_platform_without_stopping_does_nothing(server):
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); page.evaluate(LIFT_FAST)
        lx, lz = h["lift"]["c"]; th = h["lift"]["th"]
        page.evaluate(f"() => window.__mm.sim({lx - math.cos(th) * 30}, {lz - math.sin(th) * 30}, {th}, 14, 3, ['KeyW'], {h['floor']})")
        page.wait_for_timeout(1500)
        assert page.evaluate("() => window.__mm.lift().level") == "surface" and page.evaluate("() => window.__mm.lift().phase") == "idle"
        br.close()
        assert not errors, errors


@needs_world
def test_room_drive_under_the_tower_f_refused_and_ride_back_up(server):
    """Below: the tree ring stops the car, the car drives under the tower, F is refused, R stays below, the lift takes it up to the lobby."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); page.evaluate(LIFT_FAST); drive_onto_the_lift(page, h)
        page.wait_for_function("() => window.__mm.lift().level === 'eiffel' && window.__mm.lift().phase === 'idle'", timeout=240000)
        tx, tz = h["room"]["tower"]["x"], h["room"]["tower"]["z"]
        # under the tower, between the legs
        page.evaluate(f"() => window.__mm.place({tx}, {tz}, {h['lift']['th']})")
        assert page.evaluate("() => window.__mm.level().id") == "eiffel"
        # the tree ring: a run at the edge ends inside the 500 m square
        cx, cz = h["room"]["centre"]; half = h["room"]["half"]
        page.evaluate(f"() => window.__mm.sim({cx}, {cz + half - 60}, {math.pi / 2}, 25, 4, ['KeyW'], -600)")
        end = page.evaluate("() => window.__mm.car()"); assert end["z"] < cz + half - 2, end
        # F is refused
        page.keyboard.press("KeyF"); assert page.evaluate("() => window.__mm.fly().on") is False
        # R below puts the car back at the lift house below (still the room)
        page.keyboard.press("KeyR"); assert page.evaluate("() => window.__mm.level().id") == "eiffel"
        lx, lz = h["lift"]["c"]; c = page.evaluate("() => window.__mm.car()"); assert math.hypot(c["x"] - lx, c["z"] - lz) < 3, c
        # ride up: drive off the platform and back on, stop
        page.evaluate(f"() => window.__mm.sim({lx + math.cos(h['lift']['th']) * 12}, {lz + math.sin(h['lift']['th']) * 12}, {h['lift']['th'] + math.pi}, 6, 4, ['KeyS'], -600)")
        page.wait_for_function("() => window.__mm.lift().level === 'surface' && window.__mm.lift().phase === 'idle'", timeout=240000)
        up = page.evaluate("() => window.__mm.car()"); assert abs(up["y"] - h["floor"]) < 1.0 and math.hypot(up["x"] - lx, up["z"] - lz) < 9, up
        br.close()
        assert not errors, errors

@needs_world
def test_j_below_returns_to_the_surface_and_flags_a_race(server):
    """J (placeOnRoad) from the room puts the car on the surface; a lift ride in a race counts like a jump."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); page.evaluate(LIFT_FAST)
        page.evaluate("() => window.__mm.raceNow()")   # a running race: the ride must flag it
        drive_onto_the_lift(page, h)
        page.wait_for_function("() => window.__mm.lift().level === 'eiffel' && window.__mm.lift().phase === 'idle'", timeout=240000)
        assert page.evaluate("() => window.__mm.raceFlags().jumped") is True
        page.keyboard.press("KeyJ"); page.keyboard.type("reservoir"); page.keyboard.press("Enter")   # the J list, as test_j_reservoir_... does (see jump_list)
        assert page.evaluate("() => window.__mm.level().id") == "surface"
        assert abs(page.evaluate("() => window.__mm.car().y") + 600) > 100
        br.close()
        assert not errors, errors
```
  The two `__mm.startRace`/`__mm.jumpTo` hooks may not exist: look at how `test_j_reservoir_puts_the_car_on_the_huebel_facing_the_gate` and `test_jump.py` open the J list and press Enter, and at how a race is started (`#startbtn` is clicked by `open_page`; the race is then `armed`, so `raceFlags` works as soon as the ride is a `placeOnRoad`-style flag). Copy those patterns; if no clean way exists, press `KeyJ`, type `reservoir`, press `Enter`. Do not add hooks for this.
  A note on the `sim` helper: it runs the car's physics for N seconds of **simulated** time (check its signature at `window.__mm.sim = (x, z, th, v, secs, hold = ['KeyW'], y = null)`); `['KeyS']` brakes, so the car comes to rest on the platform. If `sim` does not run `stepLift`, call it through a small loop of `page.wait_for_timeout` plus a held key instead: look at how `sim` steps (`stepCar` only?) and add `stepLift(dt)` to it next to `stepCar(dt)` (a one-line hook change).
- [ ] **Step 5: Run.** The node suite, then `test_hideout.py` (the foreground command from "Rules"). Fix failures in the code first, in the test only if the test is wrong about a design decision above.
- [ ] **Step 6: Perf measurement (for the PR body, not an assertion).** A scratch script in the scratchpad dir (not committed): open the page as `open_page`, wait for the first frames, then:

```python
surface = page.evaluate("async () => ({ ms: await window.__mm.frameMs(30), ...window.__mm.renderInfo() })")
# ride down with LIFT_FAST, then
room = page.evaluate("async () => ({ ms: await window.__mm.frameMs(30), ...window.__mm.renderInfo() })")
```
  Take the surface number at the gate (`hideout.gate`) and the room number at `hideout.tower`. Run each three times, note the medians. Headless SwiftShader is slow but the **ratio** is what the spec asks for ("at least as fast as the old hall": the old hall, measured on `origin/main` at `hideout.tower`, is the third number; check it out in a throw-away worktree if cheap, otherwise state that only surface vs room was measured). Paste the table (`ms/frame`, draw calls, triangles) into the PR description.
- [ ] **Step 7: Commit.** `test(hideout): replace the hall tests with the lift ride and the Eiffel room (#277)` (the commit message says: deliberate spec change, the hall is gone).

---

### Task 10: CHANGELOG, test-todo, final checks, PR

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `test-todo.md` (see the note on rules in Step 2)

- [ ] **Step 1: CHANGELOG.** Under `## [Unreleased]` → `### Added`, as the first bullet. The format is `` - `YYYY-MM-DD HH:MM` `` text, Swiss local time; get the stamp with `TZ=Europe/Zurich date '+%Y-%m-%d %H:%M'` at the time you write it. Player voice, what changed in the game:

```markdown
- `<stamp>` The **Reservoir Hübel** has a secret lift now. Drive through the gate and the tunnel to the end, stop on the big yellow-edged **freight lift** and wait a second: the gate shuts, the shaft slides past with the floors counting down, and the doors open on a **meadow under a blue sky with clouds**, ringed by trees, with the whole **Eiffel Tower** standing in it — all 330 m. Drive around it and right under it; **F** still says there is no sky to take off into, and **R** puts you back at the lift. The same lift takes you home. The dark cavern with the cut-off tower is gone. A race run through the lift is not counted, like a jump.
```
  Do not touch older entries. If the entry from `2026-10-10 09:28` mentions the cavern, leave it (history).
- [ ] **Step 2: test-todo.** `test-todo.md` is edited **only by direct commit and push to `main`, no PR** (maintainer's rule, memory `test-todo direct to main`), after the PR is merged. Prepare the block in the PR description (so it is reviewed) and, after the merge, add it above the existing „Hideout in the Hübel (#102 ...)" block as one commit touching only that file (`docs(test-todo): hideout lift and the Eiffel room (#277)`). Block:

```markdown
## Hideout lift and the Eiffel room (#277, PR #<n>)

The cave hall is gone: the tunnel ends in a lift lobby, a ride of about 8 s leads to a full-height Eiffel room. Start on a fresh profile (or clear `mm.hideout`) to see the find toast.

- [ ] Drive through the gate and down the tunnel: it ends in a small lit lobby with a dark platform and yellow edges, no hall any more. {go: hideout.gate}
- [ ] Drive across the platform without stopping: nothing happens. Stop on it for a second: the gate bar drops, the shaft walls slide up, the floor counts −1 … −12 with a low hum, then the doors open.
- [ ] Below: „Hideout found!" appears only now (not in the tunnel); a meadow, blue sky with clouds, steady sun, trees all round, the whole tower down to the top. {go: hideout.tower}
- [ ] The tower reads as the Eiffel Tower in daylight (not the old dark brown). Drive round it on the gravel loop and under it between the legs; the chase camera never clips a leg.
- [ ] Drive at the tree ring from every side: the car stops, nowhere a gap to the sky or the void.
- [ ] No minimap, no village names, no house numbers below. **F**: „No sky down here". **R** puts the car back at the lift house below, still in the room.
- [ ] Ride back up from the lift house: arrives on the lobby platform, does **not** ride down again until the car leaves and comes back.
- [ ] **J** → any place from below: the car is on the surface, map and labels back. In a race, riding the lift counts as a jump (not counted).
- [ ] Frame rate in the room feels at least as good as in the old hall on your machine.
```
- [ ] **Step 3: Whole-suite checks.** `node --test prototype/tests/*.test.mjs` green. `test_hideout.py` green (foreground, with the cap). `python3 -m pytest prototype/tests/test_credits.py -q` (no browser) green. Check `git grep -n "HALL_CAM\|TOWER_SPOTS\|TOWER_TOP\|CAVE_CAM\|nodes.hall\|rooms.hall"` finds nothing outside `docs/` and CHANGELOG.
- [ ] **Step 4: Rebase on the newest main**, re-run the node tests (the parallel #276/#258 work may have merged), fix conflicts by keeping their fix and re-applying the lobby/levels edits.
- [ ] **Step 5: Push and open the PR** `feat(hideout): car lift down to a full-height Eiffel room (#277)`, body from the repo's PR template (Summary / Changes / Testing / Checklist), ending with the perf table, the deliberate spec change note ("the hall tests in `test_hideout.py` are replaced by the ride tests"), the test-todo block, `Closes #277` and the Claude Code footer. Do not merge.

---

## Self-review (done when writing this plan)

- **Spec coverage:** the lift lobby replacing the hall (Task 1, 5); the `lift.js` state machine with a test-hook duration (2, 8); `levels.js` (3, 6); `room-eiffel.js` built lazily (4, 7); the lawn 500 × 500 at -600, gravel paths, the closed tree ring, the centred tower with leg colliders from `EIFFEL.feet`/`footHw`, the sky with clouds and a steady midday sun, and the lift house (4, 7); the find toast moved to the doors opening below (8); F refused, minimap/labels hidden, R below, J up (6); the Testhub `hideout.tower` (9); the race flagged on the ride (8); the old hall and the #257 cave look removed (1, 5); perf surface vs room (7, 9); the Playwright ride test replacing the hall tests, flagged as a deliberate spec change (9); CHANGELOG and test-todo (10).
- **One adjustment to the spec:** the room is not literally centred under the hideout's x/z but 215 m ahead of the lift, so the car's x/z stays continuous across the ride (Design decisions).
- **Placeholders:** none. Where an anchor may have moved after #276/#258, the step says to re-grep.

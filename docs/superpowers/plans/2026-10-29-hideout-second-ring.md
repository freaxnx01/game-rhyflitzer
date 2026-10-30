# Second underground ring (#489) Implementation Plan

**Goal:** the freight lift in the Hübel gets a three-stop keypad (Oben / Ring 1 / Ring 2, click/tap and keys
<kbd>0</kbd> <kbd>1</kbd> <kbd>2</kbd>, by car and on foot); below ring 1 lies ring 2 at y = −1200: the same ring
and eight coloured spokes in a steel-blue "space station" look with a big "2" ahead of the exit, each spoke
leading to an empty 1000 × 1000 m room. With no choice the lift behaves exactly as today. Ring 1 is unchanged.

**Spec:** `docs/superpowers/specs/2026-10-29-hideout-second-ring-design.md` (decisions, author's calls, ACs).

**Architecture:** pure logic with `node --test` in `lift.js` (stops, keypad helpers), `underground.js` (the ring
at any depth, ring 2's number and look) and `rooms.js` (`RINGS`, ring-2 rooms, level helpers); `index.html` only
wires (per-ring build, 16 flat room layouts, stop-aware lift, look, keypad, walker in the cabin).

**Global constraints:**

- Buildless: no `package.json`, dependency or framework; no new module; no `strings.js` change (title reuses
  `liftPadTitle`, labels live in `lift.js`).
- **PR#514 (Ferris wheel) and PR#516 (Ferris ride) land on `main` first** and edit `rooms.js` and
  `index.html`: line numbers below are approximate (`~`); locate by identifier / `grep -n`. In `roomLayout`
  replace **every** `ROOM_Y`/`ROOM_HALF`, including lines the Ferris PRs added.
- TDD for the pure modules: failing test first, run red, implement, run green. Never edit an existing test to
  make it pass; every existing node test must pass unchanged (ring 1 regression).
- Node: `node --test prototype/tests/<file>.test.mjs` per task, `node --test prototype/tests/*.test.mjs` at the
  end of Tasks 4–6.
- Browser: only `pytest prototype/tests/test_hideout.py -k ring2` (two tests), in the **foreground**, never
  `run_in_background`, generous `timeout`. Never the full Playwright suite (~2 h). Commit and push **before**
  the Playwright run.
- Keys <kbd>0</kbd>/<kbd>1</kbd>/<kbd>2</kbd> (and numpad) are consumed **only while `#freightpad` is shown**
  (evidence in the spec, "Today"). Before Task 6 re-run `grep -n "Digit\|Numpad" prototype/*.js prototype/index.html`;
  a new digit binding on `main` → stop and report instead of shadowing it.
- `CHANGELOG.md`: one hand-written, player-facing entry under `[Unreleased]` → `### Added` (Task 8); never
  `git cliff -o`.
- Commit per task, Conventional Commits, scope `hideout`, push after every task; open a draft PR after Task 1.
  Branch `feature/489-second-ring`; the last commit `Closes #489`.

---

### Task 1: the lift learns stops (`lift.js`: `FREIGHT_STOPS`, `FREIGHT_DEPTH`, `FREIGHT_DEFAULT`, `createLift`)

**Files:** `prototype/tests/lift.test.mjs` (append), `prototype/lift.js`.

**Interfaces:** `FREIGHT_STOPS` (`'bottom'` stays ring 1's stop id), `FREIGHT_DEPTH` (indicator floors; a
trip rides `T.ride × |Δ| / T.floors`), `FREIGHT_DEFAULT`; `createLift(times, depth = { top: 0, bottom: floors })`;
`step(…, { to })` (without `to`: the old top ↔ bottom flip with `dir` as passed); `call(stop)`; `chosen`,
`target`; events carry `to`, `start` also `ride`.

- [ ] **Step 1: write the failing tests.** Append to `prototype/tests/lift.test.mjs` (it already imports
  `createLift`, `LIFT_TIMES` and defines `run`):

```js
// #489: the freight lift's three stops
import { FREIGHT_DEPTH, FREIGHT_DEFAULT } from '../lift.js';
const freight = () => createLift(LIFT_TIMES, FREIGHT_DEPTH);
const at = (stop, to = FREIGHT_DEFAULT[stop]) => ({ onPlatform: true, speed: 0, level: stop, to });
const trip = (l, stop) => run(l, 40, at(stop));   // long enough for any ride
const floors = (l, input) => { const seen = []; for (let i = 0; i < 2000 && (l.busy || !seen.length); i++) { l.step(0.05, input); const f = l.floor(); if (f !== null && f !== seen[seen.length - 1]) seen.push(f); } return seen; };

test('freight_NoChoiceOnTheSurface_RidesToRing1AsBefore', () => {
  const l = freight(), ev = run(l, LIFT_TIMES.dwell + 0.05, at('top'));
  assert.deepEqual(ev.map(e => [e.type, e.to, e.dir]), [['start', 'bottom', 'down']]); assert.equal(ev[0].ride, LIFT_TIMES.ride);
  trip(l, 'top'); assert.equal(l.cabin, 'bottom'); assert.equal(l.phase, 'idle');
});

test('freight_NoChoiceInEitherRing_RidesUpToTheSurface', () => {
  for (const stop of ['bottom', 'ring2']) {
    const l = freight(); l.place(stop); const ev = run(l, LIFT_TIMES.dwell + 0.05, at(stop));
    assert.deepEqual(ev.map(e => [e.type, e.to, e.dir]), [['start', 'top', 'up']], stop);
  }
});

test('call_Ring2FromTheSurface_StartsAtOnceWithoutTheDwell_TwelveSecondsOfRide', () => {
  const l = freight(); assert.equal(l.call('ring2'), true); assert.equal(l.chosen, 'ring2');
  const ev = l.step(0.05, at('top')); assert.deepEqual(ev.map(e => [e.type, e.to, e.dir, e.ride]), [['start', 'ring2', 'down', 12]]);
  assert.equal(l.target, 'ring2'); assert.equal(l.chosen, null);
  const all = run(l, LIFT_TIMES.close + 5.9, at('top')); assert.ok(!all.some(e => e.type === 'switch'), 'no switch before the 6 s midpoint');
  const sw = run(l, 0.2, at('top')).find(e => e.type === 'switch'); assert.equal(sw.to, 'ring2'); assert.equal(l.cabin, 'ring2');
  run(l, 6 + LIFT_TIMES.open, at('ring2')); assert.equal(l.phase, 'idle');
});

test('call_AfterArrivingInRing1_RidesOnToRing2_SixSecondsMinus13ToMinus24', () => {
  const l = freight(); trip(l, 'top'); assert.equal(l.cabin, 'bottom');
  assert.deepEqual(run(l, 3, at('bottom')), [], 'an arrival disarms the dwell');
  assert.equal(l.call('ring2'), true);
  const ev = l.step(0.05, at('bottom')); assert.deepEqual(ev.map(e => [e.type, e.to, e.dir, e.ride]), [['start', 'ring2', 'down', 6]]);
  const seen = floors(l, at('bottom')); assert.equal(seen[0], -13); assert.equal(seen[seen.length - 1], -24); assert.equal(seen.length, 12);
});

test('floor_Ring2ToTheSurface_CountsMinus24UpToMinus1', () => {
  const l = freight(); l.place('ring2'); run(l, LIFT_TIMES.dwell + 0.05, at('ring2'));
  const seen = floors(l, at('ring2')); assert.equal(seen[0], -24); assert.equal(seen[seen.length - 1], -1); assert.equal(seen.length, 24);
});

test('call_Refused_WhileBusyAtTheCabinsOwnStopOrForAnUnknownStop', () => {
  const l = freight(); assert.equal(l.call('top'), false); assert.equal(l.call('ring3'), false); assert.equal(l.call(1), false);
  run(l, LIFT_TIMES.dwell + 0.05, at('top')); assert.equal(l.busy, true); assert.equal(l.call('ring2'), false); assert.equal(l.target, 'bottom');
});

test('call_WhileRollingIn_WaitsForRest_AndLeavingThePlatformDropsIt', () => {
  const l = freight(); l.call('ring2');
  assert.deepEqual(run(l, 2, { ...at('top'), speed: 3 }), [], 'still rolling');
  assert.equal(l.step(0.05, at('top'))[0].to, 'ring2');
  const m = freight(); m.call('ring2'); m.step(0.05, { onPlatform: false, speed: 0, level: 'top' }); assert.equal(m.chosen, null);
  assert.equal(run(m, LIFT_TIMES.dwell + 0.05, at('top'))[0].to, 'bottom');
});

test('doorAt_Ring2_OpensOnlyThereAfterTheRide', () => {
  const l = freight(); l.call('ring2'); l.step(0.05, at('top')); run(l, LIFT_TIMES.close + 12 + LIFT_TIMES.open + 0.1, at('ring2'));
  assert.equal(l.doorAt('ring2'), 1); assert.equal(l.doorAt('bottom'), 0); assert.equal(l.doorAt('top'), 0);
});
```

- [ ] **Step 2: run red.** `node --test prototype/tests/lift.test.mjs` — the new tests fail (`FREIGHT_DEPTH`
  is not exported / `call` is not a function); the old ones pass.
- [ ] **Step 3: implement.** In `prototype/lift.js` replace the whole `export function createLift(…) { … }`
  (from `export function createLift` up to the comment `// the cab's shaft wall texture`) with:

```js
// #489: the freight lift's stops, top down, and each one's depth in indicator floors (12 per ring step: a step takes T.ride)
export const FREIGHT_STOPS = ['top', 'bottom', 'ring2'];
export const FREIGHT_DEPTH = { top: 0, bottom: 12, ring2: 24 };
// with no choice made, standing in the cabin rides here: down to ring 1 from the surface (as before #489), up from either ring
export const FREIGHT_DEFAULT = { top: 'bottom', bottom: 'top', ring2: 'top' };

// depth: the stops the cabin knows (default: the two of #277, so towerlift.js and every two-level caller are unchanged).
// step(..., { to }) names the stop a dwell rides to (without it the cabin flips top <-> bottom and `dir` is taken as given);
// call(stop) picks a stop while idle -- it starts as soon as the platform is at rest, without the dwell and even when disarmed.
export function createLift(times = LIFT_TIMES, depth = { top: 0, bottom: times.floors }) {
  let T = { ...times }, phase = 'idle', t = 0, dwell = 0, armed = true, rideDir = 'down', switched = false, cabin = 'top', door = 0;
  let from = 'top', rideTo = 'bottom', rideT = T.ride, chosen = null;
  const span = () => Math.abs(depth[rideTo] - depth[from]);
  const dirTo = (stop) => (depth[stop] > depth[cabin] ? 'down' : 'up');
  const progress = () => (phase === 'descending' ? Math.min(1, t / rideT) : phase === 'opening' ? 1 : 0);
  const begin = (to, dir, out) => {
    phase = 'closing'; t = 0; dwell = 0; chosen = null; from = cabin; rideTo = to; rideDir = dir; switched = false;
    rideT = T.ride * span() / T.floors;
    out.push({ type: 'start', dir, to, ride: rideT });
  };
  const advance = (out) => {
    if (phase === 'closing' && t >= T.close) { phase = 'descending'; t -= T.close; }
    if (phase === 'descending') {
      if (!switched && t >= rideT / 2) { switched = true; cabin = rideTo; out.push({ type: 'switch', dir: rideDir, to: rideTo }); }
      if (t >= rideT) { phase = 'opening'; t -= rideT; }
    }
    if (phase === 'opening' && t >= T.open) { phase = 'idle'; t = 0; armed = false; door = 1; out.push({ type: 'done', dir: rideDir, to: rideTo }); }
  };
  return {
    get phase() { return phase; },
    get busy() { return phase !== 'idle'; },
    get dir() { return rideDir; },
    get cabin() { return cabin; },
    get chosen() { return chosen; },
    get target() { return phase === 'idle' ? null : rideTo; },
    // 0 = gate open, 1 = shut
    get gate() { return phase === 'closing' ? Math.min(1, t / T.close) : phase === 'descending' ? 1 : phase === 'opening' ? Math.max(0, 1 - t / T.open) : 0; },
    // the door at the cabin's level: proximity-driven while idle, the inverse of the ride's gate during a ride
    get door() { return phase === 'idle' ? door : 1 - this.gate; },
    doorAt(level) { return level === cabin ? this.door : 0; },
    place(level) { cabin = level; door = 0; chosen = null; },
    // the indicator: counts the floors passed, -1 below the top; null when idle
    floor() {
      if (phase === 'idle') return null;
      const lo = Math.min(depth[from], depth[rideTo]), hi = Math.max(depth[from], depth[rideTo]), n = Math.min(hi - lo - 1, Math.floor(progress() * (hi - lo)));
      return rideDir === 'down' ? -(lo + 1 + n) : -(hi - n);
    },
    call(stop) {
      if (phase !== 'idle' || !(stop in depth) || stop === cabin) return false;
      chosen = stop; return true;
    },
    setTimes(partial) { T = { ...T, ...partial }; },
    get times() { return { ...T }; },
    abort() { phase = 'idle'; t = 0; dwell = 0; armed = false; door = 0; chosen = null; },   // a jump ends a ride at once
    step(dt, { onPlatform, near = onPlatform, level = cabin, speed, dir, to }) {
      const out = [];
      if (phase === 'idle') {
        const here = level === cabin;
        door = here && near ? Math.min(1, door + dt / T.open) : Math.max(0, door - dt / T.close);
        if (!onPlatform) { armed = true; dwell = 0; chosen = null; return out; }
        if (!here || speed >= T.stopSpeed) { dwell = 0; return out; }
        if (chosen !== null) { begin(chosen, dirTo(chosen), out); return out; }
        if (!armed) { dwell = 0; return out; }
        dwell += dt;
        if (dwell < T.dwell) return out;
        if (to === undefined) begin(cabin === 'top' ? 'bottom' : 'top', dir, out); else begin(to, dirTo(to), out);
        return out;
      }
      t += dt; advance(out);
      return out;
    },
  };
}

```

  Extend the file's header comment by one line: `#489: three stops (FREIGHT_*), a dwell's target (to) and a
  chosen stop (call).`
- [ ] **Step 4: run green.** `node --test prototype/tests/lift.test.mjs prototype/tests/towerlift.test.mjs`
  — all pass, the old ones unchanged.
- [ ] **Step 5: commit.** `feat(hideout): the freight lift knows three stops (#489)`; push; open the draft PR.

### Task 2: keypad helpers (`lift.js`: `freightKeyStop`, `freightPadLabel`, `freightPadView`)

**Files:** `prototype/tests/lift.test.mjs` (append), `prototype/lift.js`.

**Interfaces:** `freightKeyStop(code)`, `FREIGHT_LABELS`, `freightPadLabel(stop, lang)`, `freightPadView(lift)`.

- [ ] **Step 1: failing tests.** Append:

```js
// #489: the keypad's keys, labels and buttons
import { FREIGHT_STOPS, freightKeyStop, freightPadLabel, freightPadView } from '../lift.js';

test('freightKeyStop_ZeroOneTwo_TopRowAndNumpad_NothingElse', () => {
  assert.deepEqual(['Digit0', 'Digit1', 'Digit2', 'Numpad0', 'Numpad1', 'Numpad2'].map(freightKeyStop), ['top', 'bottom', 'ring2', 'top', 'bottom', 'ring2']);
  for (const code of ['Digit3', 'Numpad9', 'KeyD', 'KeyR', 'Enter']) assert.equal(freightKeyStop(code), null, code);
});

test('freightPadLabel_GermanObenRing1Ring2_EnglishTop_FallbackEnglish', () => {
  assert.deepEqual(FREIGHT_STOPS.map(s => freightPadLabel(s, 'de')), ['Oben', 'Ring 1', 'Ring 2']);
  assert.deepEqual(FREIGHT_STOPS.map(s => freightPadLabel(s, 'en')), ['Top', 'Ring 1', 'Ring 2']);
  assert.equal(freightPadLabel('top', 'fr'), 'Top');
});

test('freightPadView_OwnStopDisabled_ChoiceLit_AllDisabledDuringARide', () => {
  const l = freight();
  assert.deepEqual(freightPadView(l), [{ stop: 'top', disabled: true, on: false }, { stop: 'bottom', disabled: false, on: false }, { stop: 'ring2', disabled: false, on: false }]);
  l.call('ring2'); assert.deepEqual(freightPadView(l).map(b => b.on), [false, false, true]);
  l.step(0.05, at('top')); assert.deepEqual(freightPadView(l).map(b => [b.disabled, b.on]), [[true, false], [true, false], [true, true]]);
});
```

- [ ] **Step 2: run red** (`freightKeyStop` not exported).
- [ ] **Step 3: implement.** Append to `prototype/lift.js` after `createLift`:

```js
// #489: the keypad. 0 / 1 / 2 (top row or numpad) pick Oben / Ring 1 / Ring 2; any other key is not the pad's
export function freightKeyStop(code) { const m = /^(?:Digit|Numpad)([0-2])$/.exec(code); return m ? FREIGHT_STOPS[Number(m[1])] : null; }
export const FREIGHT_LABELS = { de: { top: 'Oben', bottom: 'Ring 1', ring2: 'Ring 2' }, en: { top: 'Top', bottom: 'Ring 1', ring2: 'Ring 2' } };
export const freightPadLabel = (stop, lang) => (FREIGHT_LABELS[lang] || FREIGHT_LABELS.en)[stop];
// the buttons, top down: disabled during a ride and at the cabin's own stop; lit = the ride's target, or the stop chosen while idle
export const freightPadView = (lift) => FREIGHT_STOPS.map(stop => ({ stop, disabled: lift.busy || stop === lift.cabin, on: lift.busy ? stop === lift.target : stop === lift.chosen }));
```

- [ ] **Step 4: run green.** `node --test prototype/tests/lift.test.mjs`.
- [ ] **Step 5: commit.** `feat(hideout): freight keypad keys, labels and buttons (#489)`; push.

### Task 3: the ring at any depth (`underground.js`)

**Files:** `prototype/tests/underground.test.mjs` (append), `prototype/underground.js`.

**Interfaces:** `BELOW2_Y`; `ringColliders(y = BELOW_Y, stop = 'bottom')` (its door panel carries `{ liftDoor: stop }`),
`ringCeilingAt(x, z, y = BELOW_Y)`, `belowLevelAt(…, roomIds, ringId = 'ring')`, `spokeSigns(rooms, y = BELOW_Y)`,
`ringNumberSign(n, y)`, `RING2_STYLE` (code in Step 3).

- [ ] **Step 1: failing tests.** Append to `prototype/tests/underground.test.mjs` (uses its `C`, `F`, `IDS`,
  `close`, `polar`, `onSpoke`):

```js
// #489: ring 2 -- the same ring at its own depth, its own lift door, its number and its look
import { BELOW2_Y, ringNumberSign, RING2_STYLE } from '../underground.js';
const IDS2 = Array.from({ length: 8 }, (_, k) => `r2room${k}`);

test('BELOW2_Y_Ring2LiesSixHundredMetresBelowRing1', () => { assert.equal(BELOW2_Y, -1200); assert.equal(BELOW_Y, -600); });

test('ringColliders_Ring2_TheSameRingAtItsDepth_ItsDoorPanelIsRing2s', () => {
  const one = ringColliders(), two = ringColliders(BELOW2_Y, 'ring2');
  assert.equal(two.length, one.length);
  one.forEach((o, i) => { close(two[i].x, o.x); close(two[i].z, o.z); close(two[i].h - BELOW2_Y, o.h - BELOW_Y, 1e-6, `collider ${i}`); });
  assert.deepEqual(one.filter(o => o.liftDoor).map(o => o.liftDoor), ['bottom']);
  assert.deepEqual(two.filter(o => o.liftDoor).map(o => o.liftDoor), ['ring2']);
});

test('ringCeilingAt_Ring2_SameShapeAtItsDepth', () => {
  for (const [x, z] of [C, polar(RING.r, LIFT.th + 1), onSpoke(3, 50), polar(RING.r + 30, LIFT.th)]) {
    const a = ringCeilingAt(x, z), b = ringCeilingAt(x, z, BELOW2_Y);
    if (a === null) assert.equal(b, null); else close(b - BELOW2_Y, a - BELOW_Y);
  }
});

test('belowLevelAt_Ring2_SwitchesBetweenRing2AndOnlyItsOwnRooms', () => {
  const [x55, z55] = onSpoke(3, 55), [x45, z45] = onSpoke(3, 45), [x50, z50] = onSpoke(3, 50);
  assert.equal(belowLevelAt('ring2', x55, z55, IDS2, 'ring2'), 'r2room3');
  assert.equal(belowLevelAt('ring2', x50, z50, IDS2, 'ring2'), 'ring2');
  assert.equal(belowLevelAt('r2room3', x50, z50, IDS2, 'ring2'), 'r2room3');
  assert.equal(belowLevelAt('r2room3', x45, z45, IDS2, 'ring2'), 'ring2');
  assert.equal(belowLevelAt('ring', x55, z55, IDS), 'room3', 'ring 1 unchanged');
});

test('spokeSigns_AtRing2Depth', () => {
  const s = spokeSigns([{ object: {}, name: 'X' }], BELOW2_Y)[0];
  close(s.y, BELOW2_Y + (SPOKE.ceiling + RING.ceiling) / 2);
});

test('ringNumberSign_Two_OnTheOuterWallStraightAheadOfTheExit_FacingTheLift', () => {
  const s = ringNumberSign(2, BELOW2_Y);
  assert.equal(s.text, '2');
  close(Math.hypot(s.x - C[0], s.z - C[1]), RING.r + RING.hw - 0.1);
  close(Math.atan2(s.z - C[1], s.x - C[0]), Math.atan2(F[1], F[0]), 1e-9, 'on the exit axis');
  assert.ok(s.y - s.h / 2 >= BELOW2_Y && s.y + s.h / 2 <= BELOW2_Y + RING.ceiling, 'inside the ring height');
  assert.equal(spokeAt(s.x, s.z, s.w / 2), null, 'on solid wall, not across a spoke mouth');
  close(Math.cos(s.th), -F[0]); close(Math.sin(s.th), -F[1]);
});

test('RING2_STYLE_CoolSteelAndBlueLight_NotRing1sWarmCave', () => {
  const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  for (const key of ['tint', 'strip', 'fog', 'hemiSky', 'hemiGround']) { const [r, , b] = rgb(RING2_STYLE[key]); assert.ok(b > r, `${key} ${RING2_STYLE[key]} is bluish`); }
});
```

- [ ] **Step 2: run red.**
- [ ] **Step 3: implement** in `prototype/underground.js`:
  - after `export const BELOW_Y = -600;` add
    `export const BELOW2_Y = -1200;   // #489: ring 2 -- its 420 m rooms end 180 m under ring 1's floor`;
  - `belowLevelAt(current, x, z, roomIds, ringId = 'ring')`: replace the three literal `'ring'` in its body
    with `ringId`;
  - `ringColliders(y = BELOW_Y, stop = 'bottom')`: `h = y + RING.ceiling`, and the last line
    `return [...out, ...liftColliders(stop, y)];`;
  - `ringCeilingAt(x, z, y = BELOW_Y)`: the four `BELOW_Y +` in its body become `y +`;
  - `spokeSigns(rooms, y = BELOW_Y)`: `y: y + (SPOKE.ceiling + RING.ceiling) / 2`;
  - append:

```js
// #489: the ring's number on its outer wall straight ahead of the exit (between spokes 7 and 0), facing the lift -- the first
// thing in view as door B opens. w x h metres, centred half-way up the ring's wall.
export function ringNumberSign(n, y) {
  const [cx, cz] = LIFT.c, r = RING.r + RING.hw - 0.1, u = [Math.cos(LIFT.th), Math.sin(LIFT.th)];
  return { text: String(n), x: cx + u[0] * r, z: cz + u[1] * r, y: y + RING.ceiling / 2, th: LIFT.th + Math.PI, w: 6, h: 6 };
}
// #489: ring 2's "space station" -- the concrete tinted steel grey, bluish light strips, fog and ambient (ring 1 keeps its warm cave)
export const RING2_STYLE = { tint: '#a9b6c8', strip: '#cfe4ff', fog: '#0a0f16', hemiSky: '#d2e4ff', hemiGround: '#5f6b7c' };
```

- [ ] **Step 4: run green.** `node --test prototype/tests/underground.test.mjs prototype/tests/hideout.test.mjs`.
- [ ] **Step 5: commit.** `feat(hideout): the tunnel ring at any depth, ring 2's number and look (#489)`; push.

### Task 4: two rings of rooms (`rooms.js`)

**Files:** `prototype/tests/rooms.test.mjs` (append), `prototype/rooms.js`.

**Interfaces:** `ROOM2_Y`, `ROOM2_HALF`, `ROOMS2`, `NEXT_ROOMS2`, `RINGS`, `isRingLevel`, `ringOf`, `ringOfStop`,
`liftStopAt`, `belowKind`, `levelY` (code in Step 3); `roomLayout(k, room, ring = RINGS[0])` adds `ring` and
`fly: { wall: half - 25, ceiling: 420 }`; `shipBasin(obj, y)`; `roomFlyCeiling/roomFlyAlt(…, cfg, y)`;
`roomFlyClamp(x, y, z, room, cfg = room.fly)`.

- [ ] **Step 1: failing tests.** Append to `prototype/tests/rooms.test.mjs` (uses its `rooms`, `room`,
  `blocked`, `toWorld`, `toLocal` and imports):

```js
// #489: ring 2 -- eight empty 1000 m rooms at -1200, levels of their own
import { RINGS, ROOMS2, NEXT_ROOMS2, ROOM2_Y, ROOM2_HALF, isRingLevel, ringOf, ringOfStop, liftStopAt, belowKind, levelY, roomFlyClamp, ROOM_FLY } from '../rooms.js';
import { BELOW_Y } from '../underground.js';
const rooms2 = ROOMS2.map((r, k) => roomLayout(k, r, RINGS[1]));

test('RINGS_Ring1AsBefore_Ring2EightEmptyRoomsTwiceAsWideAtMinus1200', () => {
  assert.deepEqual(RINGS.map(g => [g.id, g.stop, g.y, g.half]), [['ring', 'bottom', -600, 250], ['ring2', 'ring2', -1200, 500]]);
  assert.equal(RINGS[0].rooms, ROOMS); assert.equal(RINGS[1].rooms, ROOMS2);
  assert.deepEqual(ROOMS2.map(r => r.id), ['r2room0', 'r2room1', 'r2room2', 'r2room3', 'r2room4', 'r2room5', 'r2room6', 'r2room7']);
  for (const r of ROOMS2) { assert.equal(r.object, null); assert.equal(r.name, null); }
  assert.deepEqual(spokeSigns(ROOMS2), [], 'no signs in ring 2');
});

test('levelHelpers_BothRings_SurfaceAndRooms', () => {
  assert.ok(isRoomLevel('r2room0') && isRoomLevel('r2room7') && isRoomLevel('eiffel') && !isRoomLevel('ring2'));
  assert.ok(isRingLevel('ring') && isRingLevel('ring2') && !isRingLevel('r2room0') && !isRingLevel('surface'));
  assert.equal(ringOf('r2room5').id, 'ring2'); assert.equal(ringOf('atomium').id, 'ring'); assert.equal(ringOf('ring2').id, 'ring2'); assert.equal(ringOf('surface'), null);
  assert.equal(ringOfStop('ring2').id, 'ring2'); assert.equal(ringOfStop('bottom').id, 'ring'); assert.equal(ringOfStop('top'), null);
  assert.deepEqual(['surface', 'ring', 'ring2', 'eiffel', 'r2room3'].map(liftStopAt), ['top', 'bottom', 'ring2', null, null]);
  assert.deepEqual(['surface', 'ring', 'ring2', 'eiffel', 'r2room3'].map(belowKind), ['surface', 'ring', 'ring2', 'room', 'room']);
  assert.deepEqual(['surface', 'ring', 'room6', 'ring2', 'r2room1'].map(levelY), [null, -600, -600, -1200, -1200]);
});

test('roomLayout_Ring1_UnchangedByTheRingParameter', () => {
  for (let k = 0; k < 8; k++) assert.deepEqual(JSON.stringify(roomLayout(k, ROOMS[k], RINGS[0])), JSON.stringify(rooms[k]));
  assert.equal(room.half, 250); assert.equal(room.ring, 'ring'); assert.deepEqual(room.fly, { wall: 225, ceiling: 420 });
});

test('roomLayout_Ring2_ThousandMetreSquareAtItsDepth_PortalAtTheSpokeEnd', () => {
  rooms2.forEach((R, k) => {
    assert.equal(R.id, `r2room${k}`); assert.equal(R.ring, 'ring2'); assert.equal(R.y, ROOM2_Y); assert.equal(R.half, ROOM2_HALF); assert.equal(R.groundAt(), -1200);
    assert.equal(R.object, null); assert.equal(R.tower, null);
    const sp = spokeFrame(k); assert.deepEqual(R.portal.c, sp.end);
    const [a, b] = toLocal(R, ...sp.end); assert.ok(Math.abs(a + 500) < 1e-6 && Math.abs(b) < 1e-6, 'the portal is 500 m before the centre');
    for (const o of R.colliders) assert.ok(o.h > ROOM2_Y && o.h < BELOW_Y, 'colliders stand at ring 2 depth');
  });
});

test('roomLayout_Ring2_DrivableFromTheSpawnToTheCentreAndTheCorners', () => {
  for (const R of [rooms2[0], rooms2[5]]) {
    assert.ok(!blocked(R, R.spawn.x, R.spawn.z) && !blocked(R, ...R.centre));
    for (const [a, b] of [[450, 450], [450, -450], [-450, 450], [-450, -450], [0, 470]]) assert.ok(!blocked(R, ...toWorld(R, a, b)), `free at ${a}, ${b}`);
    for (const [a, b] of [[499, 0], [0, -499], [-499, 100]]) assert.ok(blocked(R, ...toWorld(R, a, b)), `walled at ${a}, ${b}`);
  }
});

test('roomLayout_Ring2_TwiceTheTreesAlongTheLongerEdge', () => {
  const n1 = rooms[3].trees.length, n2 = rooms2[3].trees.length;
  assert.ok(n2 > 1.9 * n1 && n2 < 2.1 * n1, `${n1} -> ${n2}`);
  for (const [x, z] of rooms2[3].trees) { const [a, b] = toLocal(rooms2[3], x, z); assert.ok(Math.max(Math.abs(a), Math.abs(b)) > 480); }
});

test('roomFlyClamp_Ring2Room_Wall475Ceiling420OverItsFloor', () => {
  const R = rooms2[2], f = R.frame.f, v = R.frame.v; assert.deepEqual(R.fly, { wall: 475, ceiling: ROOM_FLY.ceiling });
  const c = roomFlyClamp(R.centre[0] + f[0] * 9999 + v[0] * 9999, ROOM2_Y + 5000, R.centre[1] + f[1] * 9999 + v[1] * 9999, R);
  const [a, b] = toLocal(R, c.x, c.z); assert.ok(Math.abs(a - 475) < 1e-6 && Math.abs(b - 475) < 1e-6, `${a}, ${b}`); assert.equal(c.y, ROOM2_Y + 420);
  assert.ok(ROOM2_Y + ROOM_FLY.ceiling <= BELOW_Y - 100, 'ring 2 rooms end 100+ m under ring 1');
});

test('NEXT_ROOMS2_AllEight_FromTheLiftOutwards_RightAndLeftInTurn', () => {
  const off = (k) => { const d = spokeFrame(k).a - LIFT.th; return Math.atan2(Math.sin(d), Math.cos(d)); };
  assert.deepEqual([...NEXT_ROOMS2].sort(), [0, 1, 2, 3, 4, 5, 6, 7]);
  for (const side of [-1, 1]) { const d = NEXT_ROOMS2.filter(k => Math.sign(off(k)) === side).map(k => Math.abs(off(k))); assert.deepEqual(d, [...d].sort((x, y) => x - y), 'each side fills outwards'); }
  assert.ok(off(NEXT_ROOMS2[0]) > 0, 'the first room is right of the exit (as the Eiffel in ring 1)');
  for (let i = 1; i < 8; i++) assert.notEqual(Math.sign(off(NEXT_ROOMS2[i])), Math.sign(off(NEXT_ROOMS2[i - 1])), 'the sides alternate');
});
```

- [ ] **Step 2: run red.**
- [ ] **Step 3: implement** in `prototype/rooms.js`:
  - import `BELOW2_Y` from `./underground.js`; after `export const ROOM_Y = BELOW_Y, ROOM_HALF = 250;` add
    `export const ROOM2_Y = BELOW2_Y, ROOM2_HALF = 500;   // #489: ring 2's rooms, 1000 x 1000 m`;
  - replace `export const isRoomLevel = (id) => ROOMS.some(r => r.id === id);` with:

```js
// #489: ring 2's eight rooms -- empty for now (the Enterprise, #491, takes the first); filled from the lift outwards, right and
// left in turn (ring 1's rule with nothing taken yet), the two rooms behind the lift last
export const ROOMS2 = Array.from({ length: SPOKE.n }, (_, k) => ({ id: `r2room${k}`, name: null, object: null }));
export const NEXT_ROOMS2 = [0, 7, 1, 6, 2, 5, 3, 4];
// #489: the rings below the lift: level id, the freight lift's stop, depth, room half width, rooms
export const RINGS = [
  { id: 'ring', stop: 'bottom', y: ROOM_Y, half: ROOM_HALF, rooms: ROOMS },
  { id: 'ring2', stop: 'ring2', y: ROOM2_Y, half: ROOM2_HALF, rooms: ROOMS2 },
];
export const isRoomLevel = (id) => RINGS.some(g => g.rooms.some(r => r.id === id));
export const isRingLevel = (id) => RINGS.some(g => g.id === id);
export const ringOf = (id) => RINGS.find(g => g.id === id || g.rooms.some(r => r.id === id)) || null;   // the ring a level (ring or room) belongs to
export const ringOfStop = (stop) => RINGS.find(g => g.stop === stop) || null;
export const liftStopAt = (id) => (id === 'surface' ? 'top' : isRingLevel(id) ? ringOf(id).stop : null);   // a room has no lift
export const belowKind = (id) => (isRingLevel(id) ? id : isRoomLevel(id) ? 'room' : 'surface');   // setBelowLook's kind
export const levelY = (id) => { const g = ringOf(id); return g ? g.y : null; };
```

  - `shipBasin(obj, y = ROOM_Y)`: `y: y + WATER_LIFT`;
  - `roomLayout(k, room = ROOMS[k], ring = RINGS[0])`: first line
    `const Y = ring.y, HALF = ring.half;   // #489: the ring's depth and room size`; then replace **every**
    `ROOM_Y` → `Y` and `ROOM_HALF` → `HALF` in the function body (check with
    `sed -n '/^export function roomLayout/,/^export const eiffelRoom/p' prototype/rooms.js | grep -c "ROOM_Y\|ROOM_HALF"` → 0);
    `shipBasin(room.object)` → `shipBasin(room.object, Y)`; in the returned object
    `id: room.id, k, ring: ring.id, y: Y, half: HALF, fly: { wall: HALF - 25, ceiling: ROOM_FLY.ceiling }, …`;
  - `roomFlyCeiling = (cfg = ROOM_FLY, y = ROOM_Y) => y + cfg.ceiling`;
    `roomFlyAlt = (alt, cfg = ROOM_FLY, y = ROOM_Y) => Math.min(alt, roomFlyCeiling(cfg, y))`;
    `roomFlyClamp(x, y, z, room = eiffelRoom(), cfg = room.fly)` with both `roomFlyCeiling(cfg)` →
    `roomFlyCeiling(cfg, room.y)`.
- [ ] **Step 4: run green.** `node --test prototype/tests/*.test.mjs` (rooms, room-fly, artemis, fries and the
  Ferris tests from PR#514 must all pass unchanged).
- [ ] **Step 5: commit.** `feat(hideout): ring 2's eight 1000 m rooms as levels (#489)`; push.

### Task 5: wire ring 2 into the game (`index.html`, no keypad yet)

**Files:** `prototype/index.html`.

- [ ] **Step 1: imports.** `lift.js`: add `LIFT_TIMES, FREIGHT_DEPTH, FREIGHT_STOPS, FREIGHT_DEFAULT`;
  `rooms.js`: add `RINGS, ringOf, ringOfStop, liftStopAt, belowKind, levelY, isRingLevel`;
  `underground.js`: add `ringNumberSign, RING2_STYLE`. Drop `BELOW_Y` from the import at the end if
  `grep -n "BELOW_Y" prototype/index.html` shows no other use.
- [ ] **Step 2: the lift's doors and decks** (`const LIFT_DOORS = { top: null, bottom: null }, LIFT_DECKS = …`,
  ~1494): add `ring2: null` to both. `const LIFT_RIDE = createLift();` → `createLift(LIFT_TIMES, FREIGHT_DEPTH)`.
- [ ] **Step 3: looks** (after `const RING_LOOK = …`, ~2619):

```js
// #489: ring 2's "space station" -- RING_LOOK in RING2_STYLE's cool colours
const RING2_LOOK = { ...RING_LOOK, fog: RING2_STYLE.fog, skyTop: RING2_STYLE.fog, skyHor: RING2_STYLE.fog, hemiSky: RING2_STYLE.hemiSky, hemiGround: RING2_STYLE.hemiGround };
const BELOW_LOOKS = { ring: RING_LOOK, ring2: RING2_LOOK, room: ROOM_LOOK };
```

  In `fadeBelowLook`: `const base = BELOW.kind === 'ring' ? RING_LOOK : ROOM_LOOK` → `const base = BELOW_LOOKS[BELOW.kind]`;
  `setBelowLook`'s comment `// 'surface' | 'ring' | 'ring2' | 'room'`. In `applyStyle`:
  `setBelowLook(LEVELS.id === 'ring' ? 'ring' : 'room')` → `setBelowLook(belowKind(LEVELS.id))`; in
  `LEVELS.onChange`: `setBelowLook(id === 'surface' ? … )` → `setBelowLook(belowKind(id))`.
- [ ] **Step 4: room and ring state** (`const ROOM = { layouts: …`, ~2658):
  `layouts: HIDE ? RINGS.flatMap(g => g.rooms.map((r, k) => roomLayout(k, r, g))) : null` (ring-1 room k keeps
  index k; ring-2 room k is 8 + k); `const RING_L = { ring: { built: false, group: null }, ring2: { built: false, group: null, sign: null } };`;
  `keepBelow`: `RING_L.group` → `RING_L.ring.group, RING_L.ring2.group`;
  `const roomIndex = (id) => (ROOM.layouts ? ROOM.layouts.findIndex(R => R.id === id) : -1);`;
  `showBelow`: `for (const g of RINGS) if (RING_L[g.id].group) RING_L[g.id].group.visible = id === g.id;` and
  `ROOMS[ROOM.built].id` → `ROOM.layouts[ROOM.built].id`.
- [ ] **Step 5: `ringBuild(g = RINGS[0])`** (~2771). Changes inside the function:
  - `if (RING_L.built) return; RING_L.built = true;` → `const RL = RING_L[g.id]; if (RL.built) return; RL.built = true;`
  - `const y0 = BELOW_Y, …; RING_L.group = group;` → `const y0 = g.y, …; RL.group = group;`
  - after the `floorMat`/`ceilMat`/`wallMat` line: `const space = g.id === 'ring2'; if (space) for (const m of [floorMat, ceilMat, wallMat]) m.color.multiply(new THREE.Color(RING2_STYLE.tint));`
  - the strips' material: `color: space ? RING2_STYLE.strip : 0xfff1d0`
  - `ringColliders()` → `ringColliders(y0, g.stop)`; `liftColliders('bottom', y0)` → `liftColliders(g.stop, y0)`;
    `liftBuild('bottom', y0, group)` → `liftBuild(g.stop, y0, group)`; `spokeSigns(ROOMS)` → `spokeSigns(g.rooms, y0)`
  - after the signs loop:

```js
  if (space) {   // #489: the big "2" straight ahead of the exit, facing the lift
    const n = ringNumberSign(2, y0), plate = new THREE.Mesh(new THREE.PlaneGeometry(n.w, n.h), new THREE.MeshBasicMaterial({ map: textTex(n.text, 512, 512, '#1c2430', '#dfe9f7', '800 440px "Barlow Condensed", sans-serif') }));
    plate.position.set(n.x, n.y, n.z); plate.rotation.y = Math.atan2(-Math.cos(LIFT.th), -Math.sin(LIFT.th)); group.add(plate); RL.sign = plate;
  }
```

  - registration: `LEVELS.register(g.id, { groundAt: () => y0, colliders: gridOf(all), ceilingAt: (x, z) => ringCeilingAt(x, z, y0) });`
    `for (const R of ROOM.layouts) if (R.ring === g.id) LEVELS.register(R.id, { groundAt: R.groundAt, colliders: gridOf(R.colliders), ceilingAt: R.ceilingAt });`
  - `ensureRoom(k)` keeps its body; `k` is now the flat layout index (comment it).
- [ ] **Step 6: `stepSpokes`** (~2986) becomes:

```js
function stepSpokes() {
  const g = ringOf(LEVELS.id); if (!g || !RING_L[g.id].built) return;
  fadeBelowLook(spokeDarkHere());
  if (FOOT.on) return;   // on foot (#202) the walker stays on the car's level: the spoke's cap stops it
  const sp = spokeAt(P.x, P.z); if (LEVELS.id === g.id && sp && sp.s > 0) ensureRoom(RINGS.indexOf(g) * SPOKE.n + sp.k);
  const next = belowLevelAt(LEVELS.id, P.x, P.z, g.rooms.map(r => r.id), g.id); if (next === LEVELS.id) return;
  LEVELS.set(next); const at = next === g.id ? ringSpawn() : ROOM.layouts[roomIndex(next)].spawn; P.safe = [at.x, at.z, at.th];
}
```

- [ ] **Step 7: `stepLift`, `liftEvent`, `liftSwitch`.**
  - `const levelFloorY = () => LEVELS.isSurface() ? (HIDE && HIDE.floor) : levelY(LEVELS.id);`
  - in `stepLift`: `const level = liftStopAt(LEVELS.id);`; the step input `dir: level === 'top' ? 'down' : 'up'`
    → `to: FREIGHT_DEFAULT[level]`; `for (const doorLevel of ['top', 'bottom'])` → `for (const doorLevel of FREIGHT_STOPS)`.
  - `liftEvent`: `SFX.hum(LIFT_TIMES_TOTAL())` → `SFX.hum(LIFT_RIDE.times.close + e.ride + LIFT_RIDE.times.open)`
    (delete `LIFT_TIMES_TOTAL` if now unused); `liftSwitch(e.dir)` → `liftSwitch(e.to)`.
  - `liftSwitch(to)`: the first branch becomes the ring branch for any ring, the surface branch keys on `to`:

```js
function liftSwitch(to) {
  const before = P.y;
  if (to === 'top') { LEVELS.set('surface'); P.y = HIDE.floor; const d = liftDoor('top'), f = [Math.cos(d.th), Math.sin(d.th)]; P.safe = [d.x + f[0] * 6, d.z + f[1] * 6, d.th]; }
  else { const g = ringOfStop(to); ringBuild(g); LEVELS.set(g.id); P.y = g.y; const s = ringSpawn(); P.safe = [s.x, s.z, s.th]; }
  // (unchanged from here: camPos, restShadow, car.position.y, followCave)
```

- [ ] **Step 8: the rest of the `'ring'`/`BELOW_Y` spots.** `heliGround`: `: BELOW_Y` → `: levelY(LEVELS.id)`;
  `camTail`: `const base = LEVELS.isSurface() ? 0 : BELOW_Y` → `… : levelY(LEVELS.id)`; `belowRoof`:
  `LEVELS.id === 'ring'` → `isRingLevel(LEVELS.id)`; `stepFly`: `FLY.alt = roomFlyAlt(FLY.alt)` →
  `{ const room = currentRoom(); FLY.alt = roomFlyAlt(FLY.alt, room.fly, room.y); }`. Then
  `grep -n "=== 'ring'\|BELOW_Y\|RING_L\.\(built\|group\)\|ROOMS\[" prototype/index.html` must show nothing left
  that means "the" ring (the `__mm.below` `rooms:` list of ring 1 stays).
- [ ] **Step 9: test hooks.** `__mm.lift`: `deck: drawn(LIFT_DECKS[liftStopAt(LEVELS.id) || 'bottom'])`, add
  `target: LIFT_RIDE.target, chosen: LIFT_RIDE.chosen`. `__mm.below`: `ring: RING_L.ring.built`, add
  `ring2: RING_L.ring2.built, kind: BELOW.kind, number: !!RING_L.ring2.sign && drawn(RING_L.ring2.sign)`.
- [ ] **Step 10: verify.** `node --test prototype/tests/*.test.mjs`; the page loads with an empty console.
- [ ] **Step 11: commit.** `feat(hideout): ring 2 below ring 1, reached by the freight lift (#489)`; push.

### Task 6: the keypad, and the walker in the cabin (`index.html`)

**Files:** `prototype/index.html`.

- [ ] **Step 1: DOM and CSS.** After `<div id="liftpad" hidden>…</div>` add
  `<div id="freightpad" hidden><div class="padtitle" data-i18n="liftPadTitle">Lift</div><div class="padgrid"></div></div>`.
  Each of the six `#liftpad…` CSS rules gets the same selector for `#freightpad` (e.g.
  `#liftpad,#freightpad{…}`, `#liftpad .padtitle,#freightpad .padtitle{…}`), plus
  `#freightpad .padgrid{grid-template-columns:96px}#freightpad button{width:96px}`.
- [ ] **Step 2: import** `freightKeyStop, freightPadLabel, freightPadView` from `./lift.js`.
- [ ] **Step 3: the pad** (next to `const LIFT_PAD = { btns: [] };`):

```js
// #489: the freight lift's keypad -- Oben / Ring 1 / Ring 2, shown while the car or the walker stands in the cabin at the cabin's level
const FREIGHT_PAD = { open: false, btns: [] };
function relabelFreightPad() { for (const btn of FREIGHT_PAD.btns) btn.textContent = freightPadLabel(btn.dataset.stop, window.GG_LANG); $('freightpad').querySelector('.padtitle').textContent = tr('liftPadTitle'); }
function setFreightPad(show) {
  const opens = show && !FREIGHT_PAD.open; FREIGHT_PAD.open = show; $('freightpad').hidden = !show;
  if (!show) return;
  if (opens) releaseFootLock();   // the buttons need the cursor back, as on the 6c pad
  freightPadView(LIFT_RIDE).forEach((b, i) => { FREIGHT_PAD.btns[i].disabled = b.disabled; FREIGHT_PAD.btns[i].classList.toggle('on', b.on); });
}
function pickStop(stop) { if (FREIGHT_PAD.open) LIFT_RIDE.call(stop); }
function freightPadKey(e) {   // 0 / 1 / 2 while the pad is shown -- before the hazard lights' 1
  if (!FREIGHT_PAD.open) return false;
  const stop = freightKeyStop(e.code); if (!stop) return false;
  e.preventDefault(); if (!e.repeat) pickStop(stop); return true;
}
```

  Buttons, right after the 6c pad's button block (`{ const grid = document.getElementById('liftpad')…`):

```js
{ const grid = $('freightpad').querySelector('.padgrid');   // #489: Oben / Ring 1 / Ring 2, top down -- click, tap or 0 / 1 / 2
  for (const stop of FREIGHT_STOPS) {
    const btn = document.createElement('button'); btn.type = 'button'; btn.dataset.stop = stop;
    btn.addEventListener('click', () => pickStop(stop));
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); pickStop(stop); }, { passive: false });
    grid.appendChild(btn); FREIGHT_PAD.btns.push(btn);
  }
  relabelFreightPad();
}
```

  `gg-langchange` listener: `relabelLiftPad();` → `relabelLiftPad(); relabelFreightPad();`. Keydown: after
  `if (liftPadKey(e)) return;` add `if (freightPadKey(e)) return;`.
- [ ] **Step 4: `stepLift` takes the walker and drives the pad.**
  `if (level === null) { CAB.visible = false; return; }` → `{ CAB.visible = false; setFreightPad(false); return; }`;
  `const onPlatform = !FOOT.on && inCabin(P.x, P.z, carRadius()) && …` →
  `const onPlatform = inCabin(P.x, P.z, FOOT.on ? 0 : carRadius()) && Math.abs(P.y - levelFloorY()) < 1;`;
  after the `for (const e of ev) liftEvent(e);` line: `setFreightPad(onPlatform && level === LIFT_RIDE.cabin);`.
  Also hide it where the lift ends without a step: in `leaveBelow()` add `setFreightPad(false);`.
- [ ] **Step 5: the walker rides.** First line of `stepOnFoot(dt)`:
  `if (LIFT_RIDE.busy) { P.vx = P.vz = 0; return; }   // #489: the walker rides like the car: no input during the ride`.
  First line of `getIn()`: `if (LIFT_RIDE.busy) return;`. In `footSolids`' filter add
  `&& !(o.liftDoor && LIFT_RIDE.doorAt(o.liftDoor) >= 0.9)` (an open lift door is no obstacle, as in `collide`).
- [ ] **Step 6: the parked car comes along.** Before `liftSwitch`:

```js
function parkCarAt([x, z, th], y) { FOOT.car = { ...FOOT.car, x, z, y, th }; car.position.set(x, y, z); car.rotation.set(0, -th, 0); }   // #489: the walker's car rides along
```

  In `liftSwitch`, after the line that sets the level and `P.safe`: `if (FOOT.on) parkCarAt(P.safe, P.y);`, and
  move nothing else; the existing `car.position.y = P.y` stays.
- [ ] **Step 7: verify.** `node --test prototype/tests/*.test.mjs`; page loads with an empty console.
- [ ] **Step 8: commit.** `feat(hideout): freight keypad Oben / Ring 1 / Ring 2, also on foot (#489)`; push.

### Task 7: targeted browser tests (`test_hideout.py -k ring2`)

**Files:** `prototype/tests/test_hideout.py`.

- [ ] **Step 1: generalise three helpers** without changing their callers: `enter_cabin(page, h, level,
  times=LIFT_FAST)` evaluates `times` instead of `LIFT_FAST`; `into_room(page, k, room_id, y=-600)` and
  `back_to_ring(page, k, ring="ring", y=-600)` pass `y` to `sim` and wait for `ring`.
- [ ] **Step 2: add the tests** (after `test_artemis_room_…`, or at the end):

```python
FREIGHT_SLOW_DWELL = "() => window.__mm.liftTimes({dwell: 30, close: 0.1, ride: 0.4, open: 0.1})"
PAD_SHOWN = "() => !document.getElementById('freightpad').hidden"


@needs_world
def test_ring2_keypad_rides_down_to_the_space_ring_and_into_a_1000m_room(server):
    """#489: keypad Oben / Ring 1 / Ring 2; key 2 rides to ring 2 (-1200) without the 30 s dwell; steel-blue, the "2"; room r2room0."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server, "localStorage.setItem('gg-lang', 'de')")
        h = page.evaluate("() => window.__mm.hideout()")
        enter_cabin(page, h, "ring", FREIGHT_SLOW_DWELL)
        page.wait_for_function(PAD_SHOWN, timeout=120000)
        labels = page.evaluate("() => [...document.querySelectorAll('#freightpad button')].map(b => [b.textContent, b.disabled])")
        page.keyboard.press("Digit2")
        page.wait_for_function(RIDE_DONE, arg="ring2", timeout=240000)
        lift = page.evaluate("() => window.__mm.lift()"); below = page.evaluate("() => window.__mm.below()")
        car = page.evaluate("() => window.__mm.car()")
        into_room(page, 0, "r2room0", -1200)
        room = page.evaluate("() => ({ below: window.__mm.below(), lvl: window.__mm.level() })")
        back_to_ring(page, 0, "ring2", -1200)
        ring = page.evaluate("() => window.__mm.below().level")
        br.close()
    assert errors == []
    assert labels == [["Oben", True], ["Ring 1", False], ["Ring 2", False]], labels
    assert lift["cabin"] == "ring2" and lift["level"] == "ring2" and lift["door"] > 0.9, lift
    assert abs(car["y"] + 1200) < 1.0, car
    assert below["kind"] == "ring2" and below["ring2"] is True and below["number"] is True and below["fog"] == "#0a0f16", below
    assert room["below"]["level"] == "r2room0" and room["below"]["built"] == 8 and room["below"]["object"] is False, room
    assert abs(room["lvl"]["y"] + 1200) < 1.0 and ring == "ring2", (room, ring)


@needs_world
def test_ring2_on_foot_a_click_on_top_rides_up_and_the_parked_car_comes_along(server):
    """#489: in ring 2 (arrived by car, so disarmed) a walker in the cabin clicks Top: up, the car parked 6 m outside door A."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server, "localStorage.setItem('gg-lang', 'en')")
        h = page.evaluate("() => window.__mm.hideout()")
        enter_cabin(page, h, "ring", FREIGHT_SLOW_DWELL)
        page.wait_for_function(PAD_SHOWN, timeout=120000)
        page.keyboard.press("Digit2"); page.wait_for_function(RIDE_DONE, arg="ring2", timeout=240000)
        page.keyboard.press("KeyZ"); page.wait_for_function("() => window.__mm.foot().on", timeout=60000)
        page.wait_for_function(PAD_SHOWN, timeout=60000)
        labels = page.evaluate("() => [...document.querySelectorAll('#freightpad button')].map(b => b.textContent)")
        page.click("#freightpad button[data-stop='top']")
        page.wait_for_function(RIDE_DONE, arg="surface", timeout=240000)
        foot = page.evaluate("() => window.__mm.foot()"); d = h["lift"]["doors"]["top"]
        br.close()
    assert errors == []
    assert labels == ["Top", "Ring 1", "Ring 2"], labels
    assert foot["on"] is True and abs(foot["y"] - h["floor"]) < 1.0, foot
    gx, gz = d["x"] + math.cos(d["th"]) * 6, d["z"] + math.sin(d["th"]) * 6
    assert math.hypot(foot["car"]["x"] - gx, foot["car"]["z"] - gz) < 0.5 and abs(foot["car"]["y"] - h["floor"]) < 1.0, foot
```

- [ ] **Step 3: commit and push first**, then run in the foreground:
  `pytest prototype/tests/test_hideout.py -k ring2 -x` (timeout ≥ 15 min). Fix the implementation, never the
  test's expectations (three attempts, then stop and report).
- [ ] **Step 4: commit.** `test(hideout): ring 2 by keypad, by car and on foot (#489)`; push.

### Task 8: CHANGELOG

**Files:** `CHANGELOG.md`.

- [ ] **Step 1:** get the time: `TZ=Europe/Zurich date '+%F %H:%M'`.
- [ ] **Step 2:** under `## [Unreleased]` → `### Added`, newest first (create `### Added` if it is missing):

```markdown
- `YYYY-MM-DD HH:MM` The **freight lift** in the **Reservoir Hübel** has a **keypad**: Top, Ring 1, Ring 2 (or <kbd>0</kbd> <kbd>1</kbd> <kbd>2</kbd>). **Ring 2** lies deeper still: a steel-blue tunnel ring like a **space station**, a big "2" ahead as the door opens, and eight spokes to **empty rooms twice as wide** as those of ring 1. Standing still in the cabin still takes you to ring 1. The lift now also takes you **on foot**, and your car comes along.
```

- [ ] **Step 3: commit.** `docs(changelog): second ring below the hideout (#489)` with the footer `Closes #489`; push;
  mark the PR ready for review. Never merge.

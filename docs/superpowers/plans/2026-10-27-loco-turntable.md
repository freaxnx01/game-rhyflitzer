# Loco Turntable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A turntable in the track at the steam loco's start spot in Sisseln; with the loco at rest on it, A/D turns it round 180° in a visible 6 s turn.

**Architecture:** The turn logic is pure and lives in `prototype/train.js` (`TURNTABLE`, `onTurntable`, `turnAngle`, `turnedState`, two new keys). `prototype/locomesh.js` gains `buildTurntable()`. `prototype/index.html` places the turntable at `TRAIN.home`, runs the turn (`startTurn`, `stepTurn`, `finishTurn`) inside the existing train mode, and exposes `turning` on `__mm.train()`.

**Tech Stack:** buildless three.js, ES modules, `node --test`, Playwright pytest (GPU browser via `PW_CDP_ENDPOINT`).

**Spec:** [docs/superpowers/specs/2026-10-27-loco-turntable-design.md](../specs/2026-10-27-loco-turntable-design.md)

## Global Constraints

- Turntable radius 11 m, reach 3 m, turn time 6 s, smoothstep easing.
- A = anticlockwise (left, heading decreases), D = clockwise (right, heading increases). Heading convention: `(cos th, sin th)`, a positive turn is RIGHT (`train.js` header).
- Only at rest: `|v| < 0.05`.
- While turning W, S, Q, E do nothing; H and C still work; Z, R and `endTrain` finish the turn at once first.
- Strings in both languages (en, de); German with real umlauts.
- No new packages, no build step; `const`/`let` only.
- Playwright: run only `prototype/tests/test_train.py` in the foreground; commit and push before running it.
- CHANGELOG entry under `[Unreleased]` → `### Added`, player-facing, with the Swiss local time stamp like the others.

## Review Focus

- Turning when the loco stands just across a node from the home edge (on a neighbouring edge) → must still end up on the home edge facing the other way: `turnedState` test with a neighbouring-edge state.
- Pressing A/D while already turning → ignored, no double turn: covered in `startTurn` guard and the Playwright turn test (second press).
- Z during a turn → the loco finishes the turn before you step out, never left across the track: `leaveTrain` calls `finishTurn` (code step, Task 3).
- R during a turn → back home, `TRAIN.turn` cleared: `trainKey('reset')` calls `finishTurn` first (Task 3).
- Ctrl+D (debug) must not turn the loco: `isDebugKey` already returns before the train keys; unchanged.

---

### Task 1: Turn logic and keys in `train.js`

**Files:**
- Modify: `prototype/train.js` (append after `poseAt`, change `TRAIN_KEYS`)
- Test: `prototype/tests/train.test.mjs`

**Interfaces:**
- Produces: `TURNTABLE = { radius: 11, reach: 3, turnTime: 6 }`; `onTurntable(g, st, home, cfg = TURNTABLE) → boolean`; `turnAngle(t, cfg = TURNTABLE) → number` in [0, π]; `turnedState(g, st, home) → st'`; `trainKeyAction('KeyA') === 'turnLeft'`, `trainKeyAction('KeyD') === 'turnRight'`.

- [ ] **Step 1: Write the failing tests** (append to `prototype/tests/train.test.mjs` and extend its import line with `TURNTABLE, onTurntable, turnAngle, turnedState`)

```js
test('onTurntable_AtRestNearHome_TrueMovingOrFar_False', () => {
  const g = yGraph(), home = { edge: 0, s: 50, dir: 1, v: 0, choice: 0, atEnd: false };
  assert.equal(onTurntable(g, { ...home, s: 52 }, home), true);
  assert.equal(onTurntable(g, { ...home, s: 52, v: 1 }, home), false, 'moving');
  assert.equal(onTurntable(g, { ...home, s: 54 }, home), false, '4 m off');
});

test('turnAngle_EasesFromZeroToPi_Clamped', () => {
  close(turnAngle(0), 0, 1e-9); close(turnAngle(TURNTABLE.turnTime / 2), Math.PI / 2, 1e-9);
  close(turnAngle(TURNTABLE.turnTime), Math.PI, 1e-9); close(turnAngle(99), Math.PI, 1e-9); close(turnAngle(-1), 0, 1e-9);
  assert.ok(turnAngle(0.5) < Math.PI * 0.5 / TURNTABLE.turnTime, 'slow start');
});

test('turnedState_OnHomeEdge_CentredAtRestFacingBack', () => {
  const g = yGraph(), home = { edge: 0, s: 50, dir: 1, v: 0, choice: 0, atEnd: false };
  const t = turnedState(g, { ...home, s: 52, choice: 1, atEnd: true }, home);
  assert.deepEqual({ edge: t.edge, s: t.s, dir: t.dir, v: t.v, choice: t.choice, atEnd: t.atEnd }, { edge: 0, s: 50, dir: -1, v: 0, choice: 0, atEnd: false });
  close(Math.abs(wrap(poseAt(g, t).th - poseAt(g, home).th)), Math.PI, 1e-6, 'faces back');
  const back = turnedState(g, t, home);
  assert.equal(back.dir, 1, 'turning twice faces the start way again');
});

test('turnedState_FromNeighbouringEdge_StillFlipsTheHeading', () => {
  const g = yGraph(), home = { edge: 0, s: 99, dir: 1, v: 0, choice: 0, atEnd: false };
  const across = { edge: 1, s: 1, dir: 1, v: 0, choice: 0, atEnd: false };   // just past the Y node on the straight leg, facing east
  const t = turnedState(g, across, home);
  assert.equal(t.edge, 0); assert.equal(t.s, 99);
  close(Math.abs(wrap(poseAt(g, t).th - poseAt(g, across).th)), Math.PI, 1e-6);
});

test('trainKeyAction_AD_TurnOnTheTurntable', () => {
  assert.equal(trainKeyAction('KeyA'), 'turnLeft'); assert.equal(trainKeyAction('KeyD'), 'turnRight');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test prototype/tests/train.test.mjs`
Expected: FAIL — `TURNTABLE`/`onTurntable` not exported; `trainKeyAction('KeyA')` is `'pass'`.

- [ ] **Step 3: Implement** — append after `poseAt` in `prototype/train.js`:

```js
// #496: the turntable at the loco's home in Sisseln. At rest within reach of the home spot, the loco turns round on the disc.
export const TURNTABLE = { radius: 11, reach: 3, turnTime: 6 };

export function onTurntable(g, st, home, cfg = TURNTABLE) {
  const a = poseAt(g, st), b = poseAt(g, home);
  return Math.abs(st.v) < 0.05 && Math.hypot(a.x - b.x, a.z - b.z) <= cfg.reach;
}

// 0 → π over turnTime, a smooth start and stop (smoothstep)
export function turnAngle(t, cfg = TURNTABLE) {
  const u = Math.min(1, Math.max(0, t / cfg.turnTime));
  return Math.PI * u * u * (3 - 2 * u);
}

// on the disc centre (the home edge at home.s), at rest, facing opposite to st's heading -- st may stand on a neighbouring edge
export function turnedState(g, st, home) {
  const want = wrap(poseAt(g, st).th + Math.PI), fwd = poseAt(g, { ...home, dir: 1 }).th;
  return { ...st, edge: home.edge, s: home.s, dir: Math.abs(wrap(fwd - want)) < Math.PI / 2 ? 1 : -1, v: 0, choice: 0, atEnd: false };
}
```

and change the keys:

```js
// keydown in the loco: Q/E the next switch, H the whistle, R back to Sisseln, C the camera, A/D turn on the turntable (#496);
// the car's own keys are swallowed
const TRAIN_KEYS = { KeyQ: 'left', KeyE: 'right', KeyH: 'whistle', KeyR: 'reset', KeyC: 'camera', KeyA: 'turnLeft', KeyD: 'turnRight' };
```

- [ ] **Step 4: Run the tests**

Run: `node --test prototype/tests/*.test.mjs`
Expected: all PASS.

- [ ] **Step 5: Commit and push**

```bash
git add prototype/train.js prototype/tests/train.test.mjs
git commit -m "feat(train): turntable turn logic and A/D keys (#496)"
git push
```

### Task 2: The turntable model

**Files:**
- Modify: `prototype/locomesh.js` (append `buildTurntable`, import `TURNTABLE`)

**Interfaces:**
- Consumes: `TURNTABLE.radius` from `train.js`.
- Produces: `buildTurntable() → THREE.Group` with `userData.bridge` (a `THREE.Group` turning about y, length along x). Origin = disc centre at rail top; the caller sets position.

`locomesh.js` is not unit-tested (three.js); Task 3's Playwright test covers it being in the scene.

- [ ] **Step 1: Implement**

```js
import { TURNTABLE } from './train.js';

// #496: the turntable -- a dark pit flush with the rail top, a ring rail on its rim and a turning bridge (userData.bridge) carrying the
// track. The bridge is symmetric end to end, so it lines up with the track after any half turn.
export function buildTurntable() {
  const R = TURNTABLE.radius, g = new THREE.Group(), steel = mat(0x8a8d90), dark = mat(0x2a2724);
  const pit = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.3, 48), mat(0x3b3631));
  pit.position.y = -0.17; pit.receiveShadow = true; g.add(pit);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R - 0.4, 0.07, 6, 64), steel);
  ring.rotation.x = Math.PI / 2; ring.position.y = -0.02; g.add(ring);
  const bridge = new THREE.Group();
  for (const side of [-1, 1]) {
    const girder = new THREE.Mesh(new THREE.BoxGeometry(2 * R, 0.6, 0.3), dark);
    girder.position.set(0, -0.33, side * 1.1); girder.castShadow = true; bridge.add(girder);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2 * R, 0.08, 0.08), steel);
    rail.position.set(0, -0.02, side * 0.72); bridge.add(rail);
  }
  g.add(bridge);
  g.userData = { bridge };
  return g;
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check prototype/locomesh.js`
Expected: no output.

- [ ] **Step 3: Commit and push**

```bash
git add prototype/locomesh.js
git commit -m "feat(train): turntable model (#496)"
git push
```

### Task 3: Turning in the train mode, strings, help, changelog

**Files:**
- Modify: `prototype/index.html` (import lines ~533/535, `TRAIN` ~3109, placement ~3112-3114, `trainKey` ~3258, `leaveTrain` ~3264, `endTrain` ~3271, `stepTrainMode` ~3273, `__mm.train` ~3588, help `<kbd>` ~295)
- Modify: `prototype/strings.js` (en ~156-166, de ~516-526)
- Modify: `CHANGELOG.md`
- Test: `prototype/tests/test_train.py`

**Interfaces:**
- Consumes: Task 1 exports, `buildTurntable()` from Task 2.
- Produces: `__mm.train().turning` (boolean); strings `turnNotHere`, `turnDone`.

- [ ] **Step 1: Write the failing Playwright tests** (append to `prototype/tests/test_train.py`)

```python
@needs_world
def test_d_on_the_turntable_turns_the_loco_round_and_w_drives_the_other_way(server):
    """#496: at the start spot in Sisseln the loco stands on the turntable; D turns it 180 deg, then W runs against the old heading."""
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        board(page)
        t0 = page.evaluate("() => window.__mm.train()")
        page.keyboard.press("d")
        page.wait_for_function("() => window.__mm.train().turning", timeout=60000)
        page.keyboard.press("a")                                       # ignored while turning
        mid = page.evaluate("() => window.__mm.trainSim(3)")
        done = page.evaluate("() => window.__mm.trainSim(4)")
        page.evaluate("() => window.__mm.trainSim(10, ['KeyW'])")
        t2 = page.evaluate("() => window.__mm.train()")
        table = page.evaluate("() => window.__mm.turntable()")
        b.close()
    assert errors == []
    assert mid["turning"], mid
    assert not done["turning"] and done["kmh"] == 0, done
    assert abs(math.remainder(done["th"] - t0["th"] - math.pi, 2 * math.pi)) < 0.01, (t0["th"], done["th"])
    moved = (t2["x"] - done["x"]) * math.cos(t0["th"]) + (t2["z"] - done["z"]) * math.sin(t0["th"])
    assert moved < -20, moved                                          # forward now runs the other way
    assert table["placed"] and math.hypot(table["x"] - t0["x"], table["z"] - t0["z"]) < 0.5, table


@needs_world
def test_a_away_from_the_turntable_only_shows_the_hint(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        board(page)
        page.evaluate("() => window.__mm.trainSim(12, ['KeyW'])")
        page.evaluate("() => window.__mm.trainSim(9.9, ['KeyS'])")   # 12 m/s down to ~0.1 (S held at rest would start reversing)
        page.evaluate("() => window.__mm.trainSim(5)")                # coast the rest to a standstill, ~76 m from the turntable
        t0 = page.evaluate("() => window.__mm.train()")
        page.keyboard.press("a")
        page.wait_for_function("() => window.__mm.toast().shown", timeout=60000)
        hint = page.evaluate("() => window.__mm.toast().text")
        t1 = page.evaluate("() => window.__mm.trainSim(7)")
        b.close()
    assert errors == []
    assert t0["kmh"] == 0, t0
    assert "turntable" in hint.lower() or "drehscheibe" in hint.lower(), hint
    assert not t1["turning"] and abs(math.remainder(t1["th"] - t0["th"], 2 * math.pi)) < 1e-6, (t0, t1)
```

- [ ] **Step 2: Commit, push, run to verify they fail**

```bash
git add prototype/tests/test_train.py && git commit -m "test(train): turntable turn and hint (#496)" && git push
direnv exec . python3 -m pytest prototype/tests/test_train.py -k "turntable" -q
```
Expected: FAIL — `turning` is undefined / `__mm.turntable` is not a function.

- [ ] **Step 3: Imports** — extend the two import lines in `prototype/index.html`:

```js
import { TRAIN_CFG, buildTrackGraph, nearestOnGraph, stepTrain, poseAt, trainInput, nextSwitch, distToEnd, chuffEmit, trainKeyAction, divergingApproaches, TURNTABLE, onTurntable, turnAngle, turnedState } from './train.js';   // #462, #496
```
```js
import { buildLoco, buildTurntable } from './locomesh.js';
```

- [ ] **Step 4: State and placement** — in `const TRAIN = { … }` add `turn: null, table: null`. In the placement block, after `placeLoco(TRAIN.home, null);`, add the turntable at the home pose:

```js
    { const h = poseAt(TRAIN.graph, TRAIN.home); TRAIN.table = buildTurntable(); TRAIN.table.position.set(h.x, TRAIN.y, h.z); TRAIN.table.userData.bridge.rotation.y = -h.th; scene.add(TRAIN.table); }   // #496
```

- [ ] **Step 5: Turn functions** — add right after `syncTrainP`:

```js
// #496: the turntable. startTurn pulls the loco onto the disc centre and starts a half turn (sign -1 left / A, +1 right / D);
// stepTurn turns the bridge and the loco together; finishTurn lands on the turned state (also called by Z, R and endTrain)
function startTurn(sign) {
  if (TRAIN.turn) return;
  if (!onTurntable(TRAIN.graph, TRAIN.st, TRAIN.home)) { toast(tr('turnNotHere')); return; }
  const to = turnedState(TRAIN.graph, TRAIN.st, TRAIN.home), centre = { ...to, dir: -to.dir };
  placeLoco(centre, TRAIN.y); syncTrainP();
  TRAIN.turn = { t: 0, sign, th0: poseAt(TRAIN.graph, centre).th, to };
}
function stepTurn(dt) {
  const tu = TRAIN.turn; tu.t += dt;
  if (tu.t >= TURNTABLE.turnTime) { finishTurn(); toast(tr('turnDone')); return; }
  const th = tu.th0 + tu.sign * turnAngle(tu.t);
  TRAIN.mesh.rotation.y = -th; TRAIN.table.userData.bridge.rotation.y = -th; P.th = th;
}
function finishTurn() {
  if (!TRAIN.turn) return;
  const to = TRAIN.turn.to; TRAIN.turn = null;
  placeLoco(to, TRAIN.y); TRAIN.table.userData.bridge.rotation.y = -poseAt(TRAIN.graph, to).th; syncTrainP();
}
```

- [ ] **Step 6: Wire the keys and the mode**

In `trainKey(action)`, as its first lines:

```js
  if (action === 'turnLeft' || action === 'turnRight') { startTurn(action === 'turnLeft' ? -1 : 1); return; }   // #496
  if (TRAIN.turn && (action === 'left' || action === 'right')) return;   // no switch picking on the turntable
  if (action === 'reset') finishTurn();
```

At the top of `leaveTrain()` and of `endTrain()` (after its `if (!TRAIN.on) return;`): `finishTurn();`

At the top of `stepTrainMode(dt)`:

```js
  if (TRAIN.turn) { stepTurn(dt); const c = chuffEmit(TRAIN.acc, 0, dt); TRAIN.acc = c.acc; for (let i = 0; i < c.n; i++) emitTrainPuff(); return; }   // #496: W/S do nothing while turning
```

- [ ] **Step 7: Test hooks** — in `window.__mm.train`'s returned object add `turning: !!TRAIN.turn`, and override the heading while turning so the tests read the live angle: change `th: p.th` to `th: TRAIN.turn ? P.th : p.th`. Add next to it:

```js
window.__mm.turntable = () => ({ placed: !!TRAIN.table, x: TRAIN.table?.position.x, z: TRAIN.table?.position.z });   // #496
```

- [ ] **Step 8: Strings and help** — `prototype/strings.js`, en (next to `trainIn`):

```js
  turnNotHere: 'Stop on the turntable at Sisseln to turn round',
  turnDone: 'Loco turned round',
```
de:
```js
  turnNotHere: 'Zum Wenden still auf der Drehscheibe in Sisseln halten',
  turnDone: 'Lok gewendet',
```
`keyTrain` en: append `, A · D turn on the turntable` before the closing quote; de: append `, A · D wenden auf der Drehscheibe`. In `index.html` the help line: `<kbd data-cmd="none">W · S · Q · E · H · A · D</kbd>` and the span's English fallback text updated the same way as `keyTrain` en.

- [ ] **Step 9: CHANGELOG** — under `## [Unreleased]` add (create `### Added` above `### Fixed` if missing), time = `TZ=Europe/Zurich date +"%Y-%m-%d %H:%M"`:

```markdown
- `<time>` The **steam loco** can **turn round**: at its start spot in Sisseln it stands on a **turntable**; stop on it and press **A** or **D**, and the bridge swings the loco round in a few seconds, so W drives the other way.
```

- [ ] **Step 10: Run all tests**

```bash
node --test prototype/tests/*.test.mjs
git add -A && git commit -m "feat(train): turn the steam loco round on the Sisseln turntable (#496)" && git push
direnv exec . python3 -m pytest prototype/tests/test_train.py -q
```
Expected: node all PASS; `test_train.py` all PASS (including the two new tests).

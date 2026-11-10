# Postauto wheels, floor and engine sound (#709): implementation plan

**Goal:** the timetable Postautos turn their wheels with their speed, show a closed floor (the player's bus too), and
are heard with a distance falloff.

**Spec:** [docs/superpowers/specs/2026-11-07-postauto-wheels-floor-sound-design.md](../specs/2026-11-07-postauto-wheels-floor-sound-design.md)

**Global constraints:**
- Buildless; `postautofx.js` and the `gltfvehicle.js` helper are pure (no DOM, no three.js).
- Do not touch `postauto.js`, `sound.js`, `steering.js`, `hatchback.js`, or `assets/bus.glb`.
- Do not call `wireWheels` / `addBlinkers` from the Postauto mesh (they write the player's globals, spec A8 of #500).
- Tests: `node --test tests/gltfvehicle.test.mjs tests/postautofx.test.mjs`, then full `node --test tests/`. Playwright
  **only** the one new test in `tests/test_postauto.py` (foreground, generous timeout). Not the whole suite.
- CHANGELOG entry under `[Unreleased]` -> `### Fixed`, player voice, timestamp `TZ=Europe/Zurich date '+%F %H:%M'`.
- Commit and push after each task.

### Task 1: pure helper `doubleSidedNames` and the floor fix

**Files:** `gltfvehicle.js`, `tests/gltfvehicle.test.mjs` (new), `index.html` (`VEHICLES.bus` ~line 2666, `prepareGltfScene` line 2892, its call in `loadVehicleModel` ~line 2912)

**Interfaces:**
- `doubleSidedNames(def, materialNames) -> string[]`: `def.gltf.doubleSided ?? []`; throws `Error('gltfvehicle: double-sided material X missing')` for a name not in `materialNames`.

- [ ] **Write the failing test** (`tests/gltfvehicle.test.mjs`):

```js
// #709: which materials of a glTF vehicle are drawn from both sides. Pure module, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doubleSidedNames } from '../gltfvehicle.js';

const def = (list) => ({ gltf: { id: 'bus', url: './assets/bus.glb', fallback: 'bus', ...(list ? { doubleSided: list } : {}) } });

test('doubleSidedNames: none listed gives an empty list', () => {
  assert.deepEqual(doubleSidedNames(def(), ['Body', 'Plain_7']), []);
});
test('doubleSidedNames: returns the listed names that the model has', () => {
  assert.deepEqual(doubleSidedNames(def(['Plain_7']), ['Body', 'Plain_7']), ['Plain_7']);
});
test('doubleSidedNames: a listed name the model lacks fails fast', () => {
  assert.throws(() => doubleSidedNames(def(['Plain_7']), ['Body']), /Plain_7 missing/);
});
```

- [ ] **Run it, see it fail**, then implement in `gltfvehicle.js`:

```js
// #709: materials the model needs drawn from both sides (the bus's underbody shell faces down only, so from inside it is culled);
// def.gltf.doubleSided [name]; fails fast when the model lacks a named material
export function doubleSidedNames(def, materialNames) {
  const names = def.gltf?.doubleSided ?? [];
  for (const n of names) if (!materialNames.includes(n)) throw new Error(`gltfvehicle: double-sided material ${n} missing`);
  return names;
}
```

- [ ] **Wire it.** Import `doubleSidedNames` in the `./gltfvehicle.js` import (`index.html:788`). In `VEHICLES.bus.gltf` add
  `doubleSided: ['Plain_7']` (comment: the underbody shell faces down only, measured in #709). Change `prepareGltfScene(e, root)` to
  `prepareGltfScene(e, root, def)` and, after the `mats` set is filled, before `e.mats = ...`:
  `for (const n of doubleSidedNames(def, [...mats].map(m => m.name))) for (const m of mats) if (m.name === n) m.side = THREE.DoubleSide;`
  Update its call in `loadVehicleModel` to `prepareGltfScene(e, e.scene, def)`. Check `checkVehicle` (the vehicle table
  validator) does not reject the new `gltf.doubleSided` field; extend it if it does.
- [ ] **Run** `node --test tests/gltfvehicle.test.mjs`, then full `node --test tests/`; commit
  `fix(bus): draw the bus underbody from both sides so the floor is not see-through`.

### Task 2: Postauto wheels turn

**Files:** `index.html` (`buildPostautoMesh` ~3891, `stepPostauto` ~3909, `drawPostauto` ~3932, the `window.__mm.postauto` hook ~4433)

**Interfaces:** `g.userData.wheelRolls` (the four `roll` groups), `g.userData.spin` (rad, 0..2pi); `drawPostauto(b, flashOn, dt)`.

- [ ] In `buildPostautoMesh`, right after `g.add(root)`, wrap the clone's own wheel nodes (nothing global is touched):

```js
g.userData.wheelRolls = wheelPlan(wheelNames(root)).map(({ name }) => {   // #709: the same roll group wireWheels makes, on this clone only
  const node = root.getObjectByName(name), parent = node.parent, roll = new THREE.Group();
  roll.position.copy(node.position); node.position.set(0, 0, 0); parent.add(roll); roll.add(node);
  return roll;
});
g.userData.spin = 0;
```

- [ ] In `stepPostauto` pass `dt`: `if (surface) drawPostauto(b, flashOn, dt);` and change the signature to
  `function drawPostauto(b, flashOn, dt)`. After the blinker lines in `drawPostauto` add:

```js
g.userData.spin = stepWheelSpin(g.userData.spin, b.v, VEHICLES.bus.wheelR, dt);   // #709: like drawWheels (index.html:2979); a standing bus (v 0) keeps its wheels still
for (const roll of g.userData.wheelRolls) roll.rotation.z = -g.userData.spin;
```

- [ ] Extend `window.__mm.postauto`: each bus entry gets `wheelSpin: POSTAUTO.meshes.get(b.key)?.userData.spin ?? null`; the object gets
  `floorSided: gltfState('bus') === 'ready' ? (GLTF_CARS.bus.mats.all.find((m) => m.name === 'Plain_7')?.side ?? null) : null`.
- [ ] **Playwright test (the only one)** in `tests/test_postauto.py`, using the same `open_at` / `hhmm(trip["calls"][1][2] + 60)` setup as
  `test_postauto_drives_line_133_with_led`:

```python
@needs_data
def test_postauto_wheels_turn_and_the_floor_is_double_sided(server):
    """#709: a driving Postauto's wheels advance, and the shared bus underbody material is drawn from both sides (THREE.DoubleSide = 2)."""
    trip = json.loads(TT.read_text(encoding="utf-8"))["trips"][0]
    with sync_playwright() as p:
        b, page, errors = open_at(p, server, hhmm(trip["calls"][1][2] + 60))
        page.wait_for_function("() => window.__mm.postauto().buses.some(x => x.phase === 'drive' && x.wheelSpin !== null && x.v > 1)", timeout=120000)
        first = page.evaluate("() => window.__mm.postauto().buses.find(x => x.phase === 'drive' && x.wheelSpin !== null && x.v > 1)")
        page.wait_for_function("(k) => { const x = window.__mm.postauto().buses.find(q => q.key === k); return x && x.wheelSpin !== null && x.wheelSpin !== %s; }" % first["wheelSpin"], arg=first["key"], timeout=30000)
        assert page.evaluate("() => window.__mm.postauto().floorSided") == 2
        assert not errors, errors
        b.close()
```

  (Adjust the wait expression if the bus stops meanwhile; the test must not depend on a fixed wall time. Run it in the foreground.)
- [ ] **Run** that one test, then commit `fix(postauto): the timetable buses turn their wheels with their speed`.

### Task 3: pure module `postautofx.js`

**Files:** `postautofx.js`, `tests/postautofx.test.mjs`

**Interfaces:**
- `FX = { ref: 8, max: 80, voices: 3, floor: 0.02 }`: full level within `ref` m, silent from `max` m, at most `voices` voices, gains at or below `floor` are dropped.
- `engineGain(dist, cfg = FX) -> 0..1`: 1 for `dist <= ref`, 0 for `dist >= max` or a non-number, else `(1 - k)^2` with `k = (dist - ref) / (max - ref)`.
- `pickVoices(buses, listener, cfg = FX) -> [{ key, gain, kmh }]`: `buses` are `{ key, phase, v, x, z }` (`v` in m/s), `listener` is `{ x, z }`; `done` buses excluded; the nearest first (key breaks ties), at most `cfg.voices`, `kmh = v * 3.6`.

- [ ] **Write the failing test** (`tests/postautofx.test.mjs`):

```js
// #709: which Postautos are heard, and how loud. Pure module, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FX, engineGain, pickVoices } from '../postautofx.js';

const bus = (key, x, extra = {}) => ({ key, phase: 'drive', v: 10, x, z: 0, ...extra });

test('engineGain: full level near, silent far, falling in between', () => {
  assert.equal(engineGain(0), 1);
  assert.equal(engineGain(FX.ref), 1);
  assert.equal(engineGain(FX.max), 0);
  assert.equal(engineGain(500), 0);
  const a = engineGain(20), b = engineGain(40), c = engineGain(70);
  assert.ok(1 > a && a > b && b > c && c > 0, `${a} ${b} ${c}`);
});
test('engineGain: a bad distance is silent', () => {
  assert.equal(engineGain(NaN), 0);
  assert.equal(engineGain(undefined), 0);
  assert.equal(engineGain(-1), 0);
});
test('pickVoices: the nearest buses win, at most FX.voices', () => {
  const buses = [bus('d', 60), bus('a', 5), bus('c', 30), bus('b', 12), bus('e', 70)];
  const v = pickVoices(buses, { x: 0, z: 0 });
  assert.deepEqual(v.map((q) => q.key), ['a', 'b', 'c']);
  assert.equal(v.length, FX.voices);
  assert.ok(v[0].gain >= v[1].gain && v[1].gain >= v[2].gain);
});
test('pickVoices: out of range, done and too quiet buses are left out', () => {
  assert.deepEqual(pickVoices([bus('far', 200), bus('gone', 3, { phase: 'done' })], { x: 0, z: 0 }), []);
});
test('pickVoices: km/h from m/s, a standing bus idles at 0', () => {
  const [moving] = pickVoices([bus('m', 0, { v: 10 })], { x: 0, z: 0 });
  assert.equal(moving.kmh, 36);
  const [idle] = pickVoices([bus('s', 0, { phase: 'stand', v: 0 })], { x: 0, z: 0 });
  assert.equal(idle.kmh, 0);
});
test('pickVoices: the listener position matters, not the origin', () => {
  const v = pickVoices([bus('a', 100)], { x: 95, z: 0 });
  assert.equal(v.length, 1);
  assert.equal(v[0].gain, 1);
});
```

- [ ] **Run it, see it fail**, then implement `postautofx.js`:

```js
// #709: which Postautos are heard and how loud. Pure module, node --test only.
export const FX = { ref: 8, max: 80, voices: 3, floor: 0.02 };

export function engineGain(dist, cfg = FX) {
  if (!(dist >= 0) || dist >= cfg.max) return 0;
  if (dist <= cfg.ref) return 1;
  const k = (dist - cfg.ref) / (cfg.max - cfg.ref);
  return (1 - k) * (1 - k);
}

export function pickVoices(buses, listener, cfg = FX) {
  return buses
    .filter((b) => b.phase !== 'done')
    .map((b) => ({ key: b.key, gain: engineGain(Math.hypot(b.x - listener.x, b.z - listener.z), cfg), kmh: b.v * 3.6 }))
    .filter((v) => v.gain > cfg.floor)
    .sort((a, b) => b.gain - a.gain || (a.key < b.key ? -1 : 1))
    .slice(0, cfg.voices);
}
```

- [ ] **Run** `node --test tests/postautofx.test.mjs` and the full suite; commit `feat(postauto): pure engine-voice picking with a distance falloff`.

### Task 4: engine voices in `SFX` and the per-frame call

**Files:** `index.html` (import line 758 area, `SFX` ~3731, `stepPostauto` ~3909, `window.__mm.postauto` ~4433), `CHANGELOG.md`

**Interfaces:** `SFX.busEngines(list, dt)` with `list = pickVoices(...)`; `SFX.state().busVoices` (count).

- [ ] Import `import { pickVoices } from './postautofx.js';` next to the `postauto.js` import (`index.html:728`).
- [ ] In `SFX`, next to the other private state add `const bv = new Map();   // #709: bus key -> { eng, es }, the Postauto engine voices`, and before `state()` add:

```js
    // #709: one engine voice per audible Postauto (the bus preset), level scaled by distance; a voice that drops out of the list fades and is freed
    busEngines(list, dt) {
      if (!ac) return;
      const want = new Set(list.map((v) => v.key)), t = ac.currentTime, pre = VEHICLES.bus.sound;
      for (const [key, s] of bv) if (!want.has(key)) { s.eng.out.gain.setTargetAtTime(0, t, 0.05); setTimeout(() => stopEngine(s.eng), 400); bv.delete(key); }
      for (const v of list) {
        let s = bv.get(v.key);
        if (!s) { s = { eng: buildEngine(ac, ac.master, pre.engine), es: { rpm: pre.engine.idleRpm, gear: 0, shift: 0 } }; bv.set(v.key, s); }
        const input = { kmh: v.kmh, gas: v.kmh > 1, nitro: false, air: false, fly: false };
        s.es = engineStep(s.es, input, pre, dt);
        const mix = engineMix(s.es, input, pre.engine);
        applyEngine(s.eng, { ...mix, gain: mix.gain * v.gain, road: mix.road * v.gain, hiss: 0 }, t);
      }
    },
```

  and add `busVoices: bv.size` to the object `state()` returns. (The master gain already carries mute; `hold` suspends the context.)
- [ ] In `stepPostauto`, after the bus loop and before the mesh clean-up, call it once:

```js
  const ear = { x: camera.position.x, z: camera.position.z };   // #709: the camera hears, so follow mode and the drone camera sound right
  SFX.busEngines(surface ? pickVoices(POSTAUTO.buses.filter((b) => b.phase !== 'done').map((b) => { const p = busPose(b.route, b.s); return { key: b.key, phase: b.phase, v: b.v, x: p.x, z: p.z }; }), ear) : [], dt);
```

- [ ] Add `voices: SFX.state().busVoices` to the `window.__mm.postauto` object.
- [ ] CHANGELOG `[Unreleased]` -> `### Fixed`, one entry in player voice (DE/EN as the file does), e.g.: "The **Postautos** now turn their wheels with their speed, you can no longer see through the **bus floor** (the Regional Bus too), and a passing Postauto can be heard: an engine that gets louder as it comes closer."
- [ ] **Verify:** `node --test tests/`, then the one Playwright test from Task 2 once more (the page must still load with an empty console). Manual playtest line for the PR: start a race on `?patime=` near a stop, listen to the idle at 5 m versus 60 m, look into the bus from above.
- [ ] Commit `feat(postauto): engine sound that grows with proximity`.

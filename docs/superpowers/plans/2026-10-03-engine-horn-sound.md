# Engine and Horn Sound Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The horn is louder and lasts 0.9 s per press as its own two-note chord; the engine sounds natural (detuned harmonics, load-dependent filter, rpm tied to road speed with audible gear changes, nitro hiss); in the helicopter (#10) the engine is silent and a rotor plays; a hidden tab or the pause menu (#83) stops all sound. Sound settings stay per vehicle in `VEHICLES[].sound` (#14).

**Architecture:** A new module `prototype/sound.js` holds the pure sound model (`gearAt`, `targetRpm`, `engineStep`, `engineMix`, `rotorMix`, `checkSound`, unit-tested with `node --test`) and DOM-free WebAudio graph builders (`buildEngine`, `stopEngine`, `applyEngine`, `buildRotor`, `applyRotor`, `playHorn`, `noiseBuffer`) that take any `BaseAudioContext`, so Playwright renders them in an `OfflineAudioContext`. `prototype/index.html` gets the new compact preset, `checkSound` inside `checkVehicle`, a rewritten `SFX` that feeds an input object `{ kmh, gas, nitro, air, fly }` through the model, a limiter on the master bus, `SFX.hold(reason, on)` for pause, the `visibilitychange` hold, and the hooks `__mm.audio` / `__mm.sfxHold`.

**Tech Stack:** vanilla JS + WebAudio in the buildless `prototype/index.html`, a pure ES module (`node --test`), Playwright with pytest.

**Spec:** `docs/superpowers/specs/2026-10-03-engine-horn-sound-design.md`

## Global Constraints

- Use Test-Driven Development for every task: write the failing test first, watch it fail, implement minimally to pass, verify green. Never edit a test to make it pass.
- **WebAudio synthesis only — no audio samples, no new files under `prototype/` other than `sound.js` and the tests.**
- **Do not change `stepCar` or anything physics.** `test_vehicles.py::test_golden_trace_of_the_compact_car` pins it to 1e-6 and must stay green unchanged. `test_table_gears_drive_the_hud` patches `c.sound.gears` and must stay green unchanged — so `gears` stays at `sound.gears`, and `checkSound` must accept a top band starting above `topKmh`.
- `test_vehicles.py::test_rebuilds_free_gpu_memory` **already fails on `main` @ `7e3f272`** (geometries 280 → 281, no sound code involved). Do not chase it in this issue; mention it in the PR body if it is still red.
- The horn is its own chord. Never the PostAuto three-tone horn (`docs/07-brands-and-permissions.md:23`).
- No new keys. **M** stays mute, **H** / Enter stay horn, **N** stays nitro.
- `prototype/index.html`: dense one-line style (long single-line statements, short `//` comments); match the surrounding code, do not reformat neighbours. No framework, no bundler, no `package.json`, no new dependency.
- New prototype code must **not** call `rr()` or `rnd()` (the seeded RNG drives house colours and trees). `Math.random()` for noise buffers is fine (it is used there today).
- Do not touch `data/` or `pipeline/`. Existing tests stay unchanged.
- Commands (from the repo root): node tests `node --test prototype/tests/*.test.mjs` (the glob is needed on Node 24). Playwright: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_sound.py -q` — slow (about 2-3 minutes), **foreground only, never `run_in_background`**. Exit 137 = memory cap hit: stop and report. Without `systemd-run --user` (CI runner) run the same command without the prefix. One-time setup if the venv is missing: `cd pipeline && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m playwright install chromium`.
- Commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Push the branch **before** the long Playwright runs.

## Review Focus

- `setVehicle(VEH)` runs at `index.html:871`, before `const SFX` exists: `setVehicle` must **not** call `SFX`. The swap is detected inside `SFX.update` by object identity (`eng.src !== VEH.sound.engine`). Pinned by `test_vehicle_swap_rebuilds_the_engine_voices`.
- Pause is a **set** of reasons: the hidden tab and #83's menu must not release each other. Pinned by `test_hidden_tab_and_hold_suspend_the_sound`.
- `checkSound` runs inside `checkVehicle`, so a bad preset throws before anything is swapped (the #5 guarantee).
- The HUD gear and the sound gear both come from `gearAt`.

---

## File map

- Create: `prototype/sound.js`, `prototype/tests/sound.test.mjs`, `prototype/tests/test_sound.py`.
- Modify `prototype/index.html`: import after the `strings.js` import (~L205); `VEHICLES.compact.sound` (~L835); `checkVehicle` (~L868); the whole `SFX` block (~L897-914) plus a `visibilitychange` line after it; hooks after `window.__mm.vehicle = …` (~L956); `hud` gear (~L1099); `loop` (~L1104).
- `CHANGELOG.md`, `test-todo.md`.

Line numbers are from `main` @ `7e3f272`; verify with `grep -n` before editing (other PRs may have shifted them).

---

### Task 0: Preconditions

**Files:** none.

- [ ] **Step 1: Check the anchors exist exactly once.** From the repo root, each on its own (each must print `1`):

```bash
grep -c "    sound: { horn: \[420, 528\], hornDur: 0.45, engineBase: 55, enginePerRpm: 150, gears: \[0, 20, 45, 75, 110, 150, 999\] } }," prototype/index.html
grep -c "SFX.update(Math.hypot(P.vx, P.vz) \* 3.6, P.gas, P.air, dt);" prototype/index.html
grep -c "const gears = VEH.sound.gears; let gi = 0; while (kmh > gears\[gi + 1\]) gi++;" prototype/index.html
grep -c "only 'circle' (OBB for long vehicles: #6)\`); }" prototype/index.html
grep -c "^const SFX = (() => {" prototype/index.html
grep -c "^window.__mm.vehicle = () => structuredClone(VEH);" prototype/index.html
```

If any prints `0`, `main` moved: find the equivalent line with `grep -n` and adapt the edit, keeping its meaning.

- [ ] **Step 2: Is the helicopter on `main`?** `grep -c "const FLY = " prototype/index.html` — note `1` (PR #84 merged) or `0`. Task 4 depends on it.

- [ ] **Step 3: Baseline.** `node --test prototype/tests/*.test.mjs` → all pass. Note the count.

---

### Task 1: The pure sound model (`sound.js`, first half)

**Files:**
- Create: `prototype/tests/sound.test.mjs`
- Create: `prototype/sound.js`

**Interfaces:**
- Produces: `RPM_RATE`, `ROTOR`, `gearAt(kmh, gears) → index`, `targetRpm(input, gears, engine) → rpm`, `engineStep(s, input, sound, dt) → { rpm, gear, shift }`, `engineMix(s, input, engine) → { f0, cutoff, q, gain, road, hiss }`, `rotorMix(input) → { rate, gain, cutoff }`, `checkSound(sound)` (throws `Error`). `input = { kmh, gas, nitro, air, fly }` (gas/nitro/air are 0/1 or booleans).

- [ ] **Step 1: Write the failing test** — `prototype/tests/sound.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gearAt, targetRpm, engineStep, engineMix, rotorMix, checkSound, RPM_RATE, ROTOR } from '../sound.js';

// a copy of VEHICLES.compact.sound in prototype/index.html (#14); test_sound.py checks the game's own table passes checkSound
const SOUND = () => ({
  gears: [0, 20, 45, 75, 110, 150, 999],
  engine: { cylinders: 4, idleRpm: 850, shiftRpm: 6200, limitRpm: 6800, topKmh: 330,
    harmonics: [{ mul: 0.5, gain: 0.35, detune: -8 }, { mul: 1, gain: 1, detune: 0 }, { mul: 2, gain: 0.5, detune: 6 }, { mul: 3, gain: 0.22, detune: -5 }, { mul: 4, gain: 0.1, detune: 9 }],
    filter: { idle: 450, open: 2600, offLoad: 0.55, q: 1.6 }, gain: { idle: 0.06, rev: 0.06, load: 0.1 },
    shiftTime: 0.15, shiftDip: 0.6, nitroHiss: 0.07 },
  horn: { notes: [415, 523], dur: 0.9, gain: 0.22, band: 1400, wave: 'square' },
});
const IN = (o) => ({ kmh: 0, gas: 0, nitro: 0, air: 0, fly: false, ...o });

test('gearAt: speed bands like the HUD, the last band open-ended', () => {
  const g = SOUND().gears;
  assert.deepEqual([0, 19.9, 20, 20.1, 72, 149, 151, 400].map(k => gearAt(k, g)), [0, 0, 0, 1, 2, 4, 5, 5]);
});

test('targetRpm: tied to road speed in gear, drops after a shift, idle floor, top gear runs to topKmh', () => {
  const { gears, engine } = SOUND();
  assert.equal(targetRpm(IN({ kmh: 0 }), gears, engine), 850);
  assert.equal(targetRpm(IN({ kmh: 20 }), gears, engine), 6200);
  assert.ok(Math.abs(targetRpm(IN({ kmh: 20.1 }), gears, engine) - 6200 * 20.1 / 45) < 1e-9);
  assert.ok(Math.abs(targetRpm(IN({ kmh: 216 }), gears, engine) - 6200 * 216 / 330) < 1e-9);
  assert.equal(targetRpm(IN({ kmh: 500 }), gears, engine), 6800);
});

test('targetRpm: in the air the engine free-revs with gas and falls to idle without', () => {
  const { gears, engine } = SOUND();
  assert.equal(targetRpm(IN({ kmh: 100, air: 1, gas: 1 }), gears, engine), 6800 * 0.92);
  assert.equal(targetRpm(IN({ kmh: 100, air: 1, gas: 0 }), gears, engine), 850);
});

test('engineStep: rpm slews at RPM_RATE, an upshift starts the throttle lift, it runs out', () => {
  const S = SOUND();
  let s = { rpm: 850, gear: 0, shift: 0 };
  s = engineStep(s, IN({ kmh: 19, gas: 1 }), S, 0.1);
  assert.equal(s.rpm, 850 + RPM_RATE.up * 0.1);
  s = { rpm: 6200, gear: 0, shift: 0 };
  s = engineStep(s, IN({ kmh: 21, gas: 1 }), S, 0.05);
  assert.equal(s.gear, 1); assert.equal(s.shift, 0.15);
  assert.equal(s.rpm, 6200 - RPM_RATE.down * 0.05);
  s = engineStep(s, IN({ kmh: 21, gas: 1 }), S, 0.1);
  assert.ok(Math.abs(s.shift - 0.05) < 1e-12);
  s = engineStep(s, IN({ kmh: 21, gas: 1 }), S, 0.1);
  assert.equal(s.shift, 0);
});

test('engineStep: a downshift or an airborne gear change does not dip', () => {
  const S = SOUND();
  assert.equal(engineStep({ rpm: 3000, gear: 2, shift: 0 }, IN({ kmh: 40 }), S, 0.02).shift, 0);
  assert.equal(engineStep({ rpm: 3000, gear: 0, shift: 0 }, IN({ kmh: 40, air: 1 }), S, 0.02).shift, 0);
});

test('engineMix: firing frequency of a four-stroke, filter opens with rpm and load, nitro opens it further', () => {
  const { engine } = SOUND();
  const idle = engineMix({ rpm: 850, gear: 0, shift: 0 }, IN({}), engine);
  assert.ok(Math.abs(idle.f0 - 850 / 60 * 2) < 1e-9);
  assert.ok(Math.abs(idle.cutoff - 450 * 0.55) < 1e-9);
  const high = engineMix({ rpm: 6800, gear: 3, shift: 0 }, IN({ kmh: 100, gas: 1 }), engine);
  assert.equal(high.cutoff, 2600); assert.equal(high.q, 1.6);
  assert.ok(Math.abs(high.gain - 0.22) < 1e-12);
  const nitro = engineMix({ rpm: 6800, gear: 3, shift: 0 }, IN({ kmh: 100, gas: 1, nitro: 1 }), engine);
  assert.equal(nitro.cutoff, 2600 * 1.25); assert.equal(nitro.hiss, 0.07);
  assert.equal(high.hiss, 0);
});

test('engineMix: louder under load, dips during a shift, road noise grows with speed and stops in the air', () => {
  const { engine } = SOUND(), s = { rpm: 4000, gear: 2, shift: 0 };
  assert.ok(engineMix(s, IN({ kmh: 60, gas: 1 }), engine).gain > engineMix(s, IN({ kmh: 60 }), engine).gain);
  assert.ok(Math.abs(engineMix({ ...s, shift: 0.1 }, IN({ kmh: 60, gas: 1 }), engine).gain - engineMix(s, IN({ kmh: 60, gas: 1 }), engine).gain * 0.4) < 1e-12);
  assert.equal(engineMix(s, IN({ kmh: 60 }), engine).road, 0.15);
  assert.equal(engineMix(s, IN({ kmh: 200 }), engine).road, 0.25);
  assert.equal(engineMix(s, IN({ kmh: 60, air: 1 }), engine).road, 0);
});

test('engineMix + rotorMix: flying mutes the engine, road and hiss and brings in the rotor', () => {
  const { engine } = SOUND(), m = engineMix({ rpm: 4000, gear: 2, shift: 0 }, IN({ kmh: 100, gas: 1, nitro: 1, fly: true }), engine);
  assert.deepEqual([m.gain, m.road, m.hiss], [0, 0, 0]);
  assert.equal(rotorMix(IN({ kmh: 0 })).gain, 0);
  const r = rotorMix(IN({ kmh: 100, fly: true }));
  assert.equal(r.gain, ROTOR.gain); assert.ok(Math.abs(r.rate - (ROTOR.rate + ROTOR.ratePerKmh * 100)) < 1e-12);
});

test('checkSound: the compact preset passes', () => { checkSound(SOUND()); });

test('checkSound: each broken field throws an Error that names it', () => {
  const cases = [
    [s => { s.gears = [0, 20, 20, 999]; }, 'gears'],
    [s => { s.gears = [5, 20, 999]; }, 'gears'],
    [s => { delete s.engine; }, 'engine'],
    [s => { s.engine.cylinders = 0; }, 'cylinders'],
    [s => { s.engine.shiftRpm = 800; }, 'rpm'],
    [s => { s.engine.limitRpm = 6000; }, 'rpm'],
    [s => { s.engine.topKmh = 0; }, 'topKmh'],
    [s => { s.engine.harmonics = []; }, 'harmonics'],
    [s => { s.engine.harmonics[1].mul = NaN; }, 'harmonics'],
    [s => { s.engine.filter.open = 100; }, 'filter'],
    [s => { s.engine.gain.load = 2; }, 'gain'],
    [s => { s.engine.shiftDip = 1.5; }, 'shiftDip'],
    [s => { s.horn.notes = []; }, 'horn.notes'],
    [s => { s.horn.notes = [415, 20000]; }, 'horn.notes'],
    [s => { s.horn.dur = 0.1; }, 'horn'],
    [s => { s.horn.wave = 'sine'; }, 'horn'],
  ];
  for (const [patch, word] of cases) {
    const s = SOUND(); patch(s);
    assert.throws(() => checkSound(s), e => e instanceof Error && e.message.includes(word), word);
  }
  assert.throws(() => checkSound(undefined), /sound preset/);
});
```

- [ ] **Step 2: Run it, watch it fail.** `node --test prototype/tests/*.test.mjs` → `sound.test.mjs` fails with `Cannot find module '../sound.js'`.

- [ ] **Step 3: Implement** — create `prototype/sound.js` with exactly this (the graph builders follow in Task 2):

```js
// #14: engine, rotor and horn sound. The pure part (gear, rpm, mix, preset check) is unit-tested with `node --test`;
// the graph builders take any BaseAudioContext (AudioContext in the game, OfflineAudioContext in tests) and touch no DOM.

export const RPM_RATE = { up: 12000, down: 20000 };   // rpm per second the heard rpm may move: revs up fast, drops faster on a shift
export const ROTOR = { rate: 5.5, ratePerKmh: 0.012, gain: 1.2, cutoff: 260 };   // #10 helicopter: blade thump (Hz), lowpassed noise

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// gear index (0 = 1st) from the speed bands; the last band is open-ended
export function gearAt(kmh, gears) { let gi = 0; while (gi < gears.length - 2 && kmh > gears[gi + 1]) gi++; return gi; }

// the rpm the engine heads for: tied to road speed in the current gear (the top gear runs up to engine.topKmh), free-revving in the air
export function targetRpm(input, gears, engine) {
  if (input.air) return input.gas ? engine.limitRpm * 0.92 : engine.idleRpm;
  const gi = gearAt(input.kmh, gears), hi = gi === gears.length - 2 ? engine.topKmh : gears[gi + 1];
  return clamp(engine.shiftRpm * input.kmh / hi, engine.idleRpm, engine.limitRpm);
}

// one audio tick: smoothed rpm, current gear, and the remaining throttle-lift time after an upshift
export function engineStep(s, input, sound, dt) {
  const gear = gearAt(input.kmh, sound.gears), up = gear > s.gear && !input.air;
  const target = targetRpm(input, sound.gears, sound.engine), rate = target > s.rpm ? RPM_RATE.up : RPM_RATE.down;
  return { rpm: s.rpm + clamp(target - s.rpm, -rate * dt, rate * dt), gear, shift: up ? sound.engine.shiftTime : Math.max(0, s.shift - dt) };
}

// what the synth plays for an engine state: firing frequency, load-dependent lowpass, level, road noise and nitro hiss
export function engineMix(s, input, engine) {
  const n = clamp((s.rpm - engine.idleRpm) / (engine.limitRpm - engine.idleRpm), 0, 1), load = input.gas ? 1 : 0, F = engine.filter, G = engine.gain;
  const cutoff = (F.idle + (F.open - F.idle) * n) * (load ? 1 : F.offLoad) * (input.nitro ? 1.25 : 1);
  const level = (G.idle + G.rev * n + G.load * load) * (s.shift > 0 ? 1 - engine.shiftDip : 1);
  return { f0: s.rpm / 60 * engine.cylinders / 2, cutoff, q: F.q * (load ? 1 : 0.6), gain: input.fly ? 0 : level,
    road: input.fly || input.air ? 0 : Math.min(0.25, input.kmh / 400), hiss: input.nitro && !input.fly ? engine.nitroHiss : 0 };
}

export function rotorMix(input) { return input.fly ? { rate: ROTOR.rate + ROTOR.ratePerKmh * input.kmh, gain: ROTOR.gain, cutoff: ROTOR.cutoff } : { rate: ROTOR.rate, gain: 0, cutoff: ROTOR.cutoff }; }

const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
// throws an Error naming the first bad field of a vehicle's sound preset
export function checkSound(sound) {
  const bad = (what) => { throw new Error(`Vehicle sound preset: ${what}`); };
  if (!sound) bad('missing');
  const g = sound.gears;
  if (!Array.isArray(g) || g.length < 2 || g[0] !== 0 || g.some((v, i) => !num(v, 0, 1e4) || (i && v <= g[i - 1]))) bad('gears must start at 0 and rise strictly');
  const e = sound.engine;
  if (!e) bad('engine missing');
  if (!Number.isInteger(e.cylinders) || e.cylinders < 1 || e.cylinders > 16) bad('engine.cylinders must be 1-16');
  if (!num(e.idleRpm, 200, 3000) || !num(e.shiftRpm, e.idleRpm + 1, 2e4) || !num(e.limitRpm, e.shiftRpm, 2e4)) bad('engine rpm must be idleRpm < shiftRpm <= limitRpm');
  if (!num(e.topKmh, 1, 1000)) bad('engine.topKmh (shiftRpm speed in the top gear) must be 1-1000');
  if (!Array.isArray(e.harmonics) || !e.harmonics.length || e.harmonics.some(h => !num(h.mul, 0.1, 16) || !num(h.gain, 0, 2) || !num(h.detune, -100, 100))) bad('engine.harmonics needs { mul, gain, detune } entries');
  if (!e.filter || !num(e.filter.idle, 50, 2e4) || !num(e.filter.open, e.filter.idle, 2e4) || !num(e.filter.offLoad, 0.1, 1) || !num(e.filter.q, 0.1, 20)) bad('engine.filter needs idle <= open Hz, offLoad 0.1-1, q');
  if (!e.gain || !num(e.gain.idle, 0, 1) || !num(e.gain.rev, 0, 1) || !num(e.gain.load, 0, 1)) bad('engine.gain needs idle, rev, load in 0-1');
  if (!num(e.shiftTime, 0, 1) || !num(e.shiftDip, 0, 1) || !num(e.nitroHiss, 0, 1)) bad('engine.shiftTime, shiftDip, nitroHiss must be 0-1');
  const h = sound.horn;
  if (!h || !Array.isArray(h.notes) || h.notes.length < 1 || h.notes.length > 4 || h.notes.some(f => !num(f, 100, 2000))) bad('horn.notes needs 1-4 frequencies in 100-2000 Hz');
  if (!num(h.dur, 0.2, 3) || !num(h.gain, 0.01, 0.6) || !num(h.band, 200, 8000) || !['square', 'sawtooth', 'triangle'].includes(h.wave)) bad('horn needs dur 0.2-3 s, gain 0.01-0.6, band 200-8000 Hz, wave square|sawtooth|triangle');
}
```

- [ ] **Step 4: Run, watch it pass.** `node --test prototype/tests/*.test.mjs` → all pass (baseline + 10).

- [ ] **Step 5: Commit.** `git add prototype/sound.js prototype/tests/sound.test.mjs` → `feat(sound): pure engine, rotor and horn sound model (#14)`.

---

### Task 2: WebAudio graph builders, rendered offline

**Files:**
- Create: `prototype/tests/test_sound.py`
- Modify: `prototype/sound.js` (append)

**Interfaces:**
- Consumes: Task 1's `ROTOR`.
- Produces: `noiseBuffer(ac, secs)`, `buildEngine(ac, dest, engine) → { oscs, filter, out, sources, road, hiss }`, `stopEngine(n)`, `applyEngine(n, mix, t)`, `buildRotor(ac, dest) → { lfo, f, out }`, `applyRotor(n, mix, t)`, `playHorn(ac, dest, horn, when) → end time`.

- [ ] **Step 1: Write the failing test** — create `prototype/tests/test_sound.py` with exactly this (Task 3 appends the game-level tests):

```python
"""#14 engine and horn sound. Two levels: the synth voices from sound.js rendered in an OfflineAudioContext (no game
loaded, fast), and the game's SFX wiring read through window.__mm.audio() (hand layout, like test_vehicles.py).
The ears are the real gate: see test-todo.md."""
from playwright.sync_api import sync_playwright

from test_vehicles import ARGS, MMH_ROUTE, use_vehicle, wait_frames

RENDER_JS = """async () => {
  const m = await import('/prototype/sound.js'), SR = 44100;
  const rms = (d, a, b) => { let s = 0; const i0 = Math.round(a * SR), i1 = Math.round(b * SR); for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / (i1 - i0)); };
  const peak = d => d.reduce((p, v) => Math.max(p, Math.abs(v)), 0);
  const render = async (secs, build) => { const oc = new OfflineAudioContext(1, Math.round(SR * secs), SR); build(oc); return (await oc.startRendering()).getChannelData(0); };
  const horn = { notes: [415, 523], dur: 0.9, gain: 0.22, band: 1400, wave: 'square' };
  const h = await render(1.2, oc => m.playHorn(oc, oc.destination, horn, 0));
  const engine = { cylinders: 4, idleRpm: 850, shiftRpm: 6200, limitRpm: 6800, topKmh: 330,
    harmonics: [{ mul: 0.5, gain: 0.35, detune: -8 }, { mul: 1, gain: 1, detune: 0 }, { mul: 2, gain: 0.5, detune: 6 }, { mul: 3, gain: 0.22, detune: -5 }, { mul: 4, gain: 0.1, detune: 9 }],
    filter: { idle: 450, open: 2600, offLoad: 0.55, q: 1.6 }, gain: { idle: 0.06, rev: 0.06, load: 0.1 }, shiftTime: 0.15, shiftDip: 0.6, nitroHiss: 0.07 };
  const eng = async (s, input) => { const d = await render(1, oc => { const n = m.buildEngine(oc, oc.destination, engine); m.applyEngine(n, m.engineMix(s, input, engine), 0); }); return { rms: rms(d, 0.4, 1), peak: peak(d) }; };
  const rd = await render(1.5, oc => { const r = m.buildRotor(oc, oc.destination); m.applyRotor(r, m.rotorMix({ kmh: 50, fly: true }), 0); });
  return { horn: { body: rms(h, 0.05, 0.8), tail: rms(h, 0.8, 0.85), after: rms(h, 0.95, 1.2), peak: peak(h) },
    idle: await eng({ rpm: 850, gear: 0, shift: 0 }, { kmh: 0 }), load: await eng({ rpm: 5000, gear: 2, shift: 0 }, { kmh: 70, gas: 1 }),
    fly: await eng({ rpm: 5000, gear: 2, shift: 0 }, { kmh: 70, gas: 1, fly: true }), rotor: { rms: rms(rd, 0.8, 1.5), peak: peak(rd) } };
}"""


def test_voices_render_offline(server):
    """The old horn (two sawtooths at 0.12, decaying to 0.001 in 0.45 s) measured RMS 0.018 over 0.05-0.45 s. The new
    one holds: at least 5x that over 0.05-0.8 s, still sounding at 0.8-0.85 s, silent after 0.95 s, never clipping.
    The engine is clearly louder under load than at idle, silent in flight; the rotor is audible."""
    with sync_playwright() as p:
        b = p.chromium.launch(); page = b.new_page()
        page.goto(f"{server}/prototype/tests/")
        r = page.evaluate(RENDER_JS)
        b.close()
    h = r["horn"]
    assert h["body"] > 5 * 0.018, h
    assert h["tail"] > 0.05, h
    assert h["after"] < 1e-3, h
    assert h["peak"] <= 1.0, h
    assert r["load"]["rms"] > 2 * r["idle"]["rms"] > 0, r
    assert r["load"]["peak"] < 1.0, r
    assert r["fly"]["rms"] == 0, r
    assert r["rotor"]["rms"] > 0.02 and r["rotor"]["peak"] < 1.0, r
```

- [ ] **Step 2: Run it, watch it fail.** `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_sound.py -q` → fails (`m.playHorn is not a function`).

- [ ] **Step 3: Implement** — append to `prototype/sound.js`:

```js
// ---------- graph builders (WebAudio, no DOM) ----------
export function noiseBuffer(ac, secs) { const b = ac.createBuffer(1, Math.round(ac.sampleRate * secs), ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }

export function buildEngine(ac, dest, engine) {
  const out = ac.createGain(); out.gain.value = 0; const filter = ac.createBiquadFilter(); filter.type = 'lowpass'; filter.connect(out); out.connect(dest);
  const oscs = engine.harmonics.map(h => { const o = ac.createOscillator(), g = ac.createGain(); o.type = h.mul === 1 ? 'sawtooth' : 'triangle'; o.detune.value = h.detune; g.gain.value = h.gain; o.connect(g); g.connect(filter); o.start(); return { o, mul: h.mul }; });
  const noise = noiseBuffer(ac, 2), sources = oscs.map(h => h.o), voice = (type, freq, q) => { const s = ac.createBufferSource(); s.buffer = noise; s.loop = true; sources.push(s); const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = ac.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(dest); s.start(); return g; };
  return { oscs, filter, out, sources, road: voice('bandpass', 300, 0.6), hiss: voice('bandpass', 2600, 0.9) };
}

// a vehicle swap with another preset: silence and drop the old voices
export function stopEngine(n) { for (const s of n.sources) s.stop(); n.out.disconnect(); n.road.disconnect(); n.hiss.disconnect(); }

export function applyEngine(n, mix, t) {
  for (const { o, mul } of n.oscs) o.frequency.setTargetAtTime(mix.f0 * mul, t, 0.03);
  n.filter.frequency.setTargetAtTime(mix.cutoff, t, 0.06); n.filter.Q.setTargetAtTime(mix.q, t, 0.06);
  n.out.gain.setTargetAtTime(mix.gain, t, 0.05); n.road.gain.setTargetAtTime(mix.road, t, 0.1); n.hiss.gain.setTargetAtTime(mix.hiss, t, 0.08);
}

// #10 rotor: lowpassed noise, its level pulsed by a sine at the blade rate
export function buildRotor(ac, dest) {
  const s = ac.createBufferSource(); s.buffer = noiseBuffer(ac, 2); s.loop = true; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = ROTOR.cutoff;
  const pulse = ac.createGain(); pulse.gain.value = 0.5; const lfo = ac.createOscillator(), depth = ac.createGain(); lfo.frequency.value = ROTOR.rate; depth.gain.value = 0.5; lfo.connect(depth); depth.connect(pulse.gain);
  const out = ac.createGain(); out.gain.value = 0; s.connect(f); f.connect(pulse); pulse.connect(out); out.connect(dest); s.start(); lfo.start();
  return { lfo, f, out };
}

export function applyRotor(n, mix, t) { n.lfo.frequency.setTargetAtTime(mix.rate, t, 0.2); n.f.frequency.setTargetAtTime(mix.cutoff, t, 0.2); n.out.gain.setTargetAtTime(mix.gain, t, 0.3); }

// the horn: each note a detuned pair through one bandpass, held at full level for dur (no decay), short attack and release
export function playHorn(ac, dest, horn, when) {
  const band = ac.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = horn.band; band.Q.value = 0.7;
  const env = ac.createGain(), end = when + horn.dur; env.gain.setValueAtTime(0, when); env.gain.linearRampToValueAtTime(horn.gain, when + 0.015); env.gain.setValueAtTime(horn.gain, end - 0.06); env.gain.linearRampToValueAtTime(0, end);
  band.connect(env); env.connect(dest);
  for (const f of horn.notes) for (const cents of [-6, 6]) { const o = ac.createOscillator(); o.type = horn.wave; o.frequency.value = f; o.detune.value = cents; o.connect(band); o.start(when); o.stop(end + 0.02); }
  return end;
}
```

- [ ] **Step 4: Run, watch it pass.** Same pytest command → `1 passed`. `node --test prototype/tests/*.test.mjs` → still all pass (node imports the builders without calling them).

- [ ] **Step 5: Commit.** `git add prototype/sound.js prototype/tests/test_sound.py` → `feat(sound): engine, rotor and horn voices for any AudioContext (#14)`.

---

### Task 3: Wire `SFX` to the model, the compact preset, pause holds

**Files:**
- Modify: `prototype/tests/test_sound.py` (append)
- Modify: `prototype/index.html`

**Interfaces:**
- Consumes: everything from `sound.js`.
- Produces: `SFX.update(input, dt)`, `SFX.hold(reason, on)`, `SFX.state()`, hooks `window.__mm.audio()` → `{ ctx, muted, holds, rpm, gear, shift, mix, rotor }` and `window.__mm.sfxHold(reason, on)`. **#83 calls `SFX.hold('menu', paused)`.**

- [ ] **Step 1: Write the failing tests** — append to `prototype/tests/test_sound.py`:

```python


def open_sound(p, server):
    """The hand layout with autoplay allowed, Start clicked (that creates the AudioContext and the engine voices)."""
    b = p.chromium.launch(args=ARGS + ["--autoplay-policy=no-user-gesture-required"]); page = b.new_page(viewport={"width": 320, "height": 180})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.audio && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn", timeout=180000)
    page.wait_for_function("() => window.__mm.audio().ctx === 'running'", timeout=60000)
    return b, page


def test_engine_follows_the_car_and_nitro(server):
    """72 km/h coasting: 3rd gear, rpm heads for 6200 * 72 / 75; holding N adds the hiss."""
    with sync_playwright() as p:
        b, page = open_sound(p, server)
        page.evaluate("() => window.__mm.sim(1882.9, -292.2, Math.PI, 20, 0.02, [])"); wait_frames(page, 3)
        coast = page.evaluate("() => window.__mm.audio()")
        page.keyboard.down("KeyN"); wait_frames(page, 3)
        nitro = page.evaluate("() => window.__mm.audio()")
        page.keyboard.up("KeyN")
        b.close()
    assert coast["gear"] == 2, coast
    assert coast["mix"]["hiss"] == 0 and coast["mix"]["road"] > 0, coast
    assert nitro["mix"]["hiss"] > 0, nitro


def test_hidden_tab_and_hold_suspend_the_sound(server):
    """A hidden tab suspends the AudioContext and a visible one resumes it; a second hold (#83's pause menu) keeps it
    suspended until both are released. The horn does nothing while held."""
    hide = "(h) => { Object.defineProperty(document, 'hidden', { value: h, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }"
    with sync_playwright() as p:
        b, page = open_sound(p, server)
        page.evaluate(f"({hide})(true)")
        page.wait_for_function("() => window.__mm.audio().ctx === 'suspended'", timeout=30000)
        page.evaluate("() => window.__mm.sfxHold('menu', true)")
        page.evaluate(f"({hide})(false)"); page.wait_for_timeout(300)
        still = page.evaluate("() => window.__mm.audio()")
        page.evaluate("() => window.__mm.sfxHold('menu', false)")
        page.wait_for_function("() => window.__mm.audio().ctx === 'running'", timeout=30000)
        b.close()
    assert still["ctx"] == "suspended" and still["holds"] == ["menu"], still


def test_vehicle_swap_rebuilds_the_engine_voices(server):
    """A preset with a three-cylinder engine and other harmonics is accepted and heard: the firing frequency follows it."""
    with sync_playwright() as p:
        b, page = open_sound(p, server)
        use_vehicle(page, "c.sound.engine.cylinders = 3; c.sound.engine.harmonics = [{ mul: 1, gain: 1, detune: 0 }]")
        wait_frames(page, 3)
        got = page.evaluate("() => window.__mm.audio()")
        bad = page.evaluate("() => { const c = window.__mm.vehicles().compact; c.sound.horn.notes = []; try { window.__mm.setVehicle(c); return 'no error'; } catch (e) { return e.message; } }")
        b.close()
    assert abs(got["mix"]["f0"] - got["rpm"] / 60 * 1.5) < 1e-6, got
    assert "horn.notes" in bad, bad
```

- [ ] **Step 2: Push, then run, watch them fail.** `git push -u origin HEAD`, then the pytest command → the three new tests fail (`window.__mm.audio` is undefined, the wait times out).

- [ ] **Step 3: Import.** After `import { translate } from './strings.js';` (~L205) add:

```js
import { gearAt, engineStep, engineMix, rotorMix, checkSound, buildEngine, stopEngine, applyEngine, buildRotor, applyRotor, playHorn } from './sound.js';
```

- [ ] **Step 4: Compact preset.** Replace the line `    sound: { horn: [420, 528], hornDur: 0.45, engineBase: 55, enginePerRpm: 150, gears: [0, 20, 45, 75, 110, 150, 999] } },` (~L835) with:

```js
    sound: { gears: [0, 20, 45, 75, 110, 150, 999],
      engine: { cylinders: 4, idleRpm: 850, shiftRpm: 6200, limitRpm: 6800, topKmh: 330, harmonics: [{ mul: 0.5, gain: 0.35, detune: -8 }, { mul: 1, gain: 1, detune: 0 }, { mul: 2, gain: 0.5, detune: 6 }, { mul: 3, gain: 0.22, detune: -5 }, { mul: 4, gain: 0.1, detune: 9 }],
        filter: { idle: 450, open: 2600, offLoad: 0.55, q: 1.6 }, gain: { idle: 0.06, rev: 0.06, load: 0.1 }, shiftTime: 0.15, shiftDip: 0.6, nitroHiss: 0.07 },
      horn: { notes: [415, 523], dur: 0.9, gain: 0.22, band: 1400, wave: 'square' } } },
```

This must stay identical to `SOUND()` in `sound.test.mjs` and the presets in `RENDER_JS`.

- [ ] **Step 5: Check the preset.** In `checkVehicle` (~L868) replace the ending ``only 'circle' (OBB for long vehicles: #6)`); }`` with ``only 'circle' (OBB for long vehicles: #6)`); checkSound(def.sound); }``.

- [ ] **Step 6: Replace the `SFX` block.** Replace everything from `const SFX = (() => {` through its closing `})();` (~L898-914) with the block below, and keep the `// ---------- sound (WebAudio, synthesized) ----------` comment line above it:

```js
const SFX = (() => {
  let ac = null, eng = null, rot = null, muted = false, es = { rpm: 0, gear: 0, shift: 0 }, mix = null, rmix = null; const holds = new Set();   // holds: reasons the sound is paused ('tab' hidden, 'menu' = #83 pause)
  const ctx = () => { if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); const limit = ac.createDynamicsCompressor(); limit.threshold.value = -6; limit.knee.value = 4; limit.ratio.value = 12; limit.connect(ac.destination); const master = ac.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(limit); ac.master = master; } if (ac.state === 'suspended' && !holds.size) ac.resume(); return ac; };
  function engine() { if (eng) return eng; const a = ctx(); eng = buildEngine(a, a.master, VEH.sound.engine); eng.src = VEH.sound.engine; if (!rot) rot = buildRotor(a, a.master); es = { rpm: VEH.sound.engine.idleRpm, gear: 0, shift: 0 }; return eng; }
  function beep(freq, dur, type = 'sine', vol = 0.25, when = 0) { if (muted || holds.size) return; const a = ctx(); const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(0, a.currentTime + when); g.gain.linearRampToValueAtTime(vol, a.currentTime + when + 0.01); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + when + dur); o.connect(g); g.connect(a.master); o.start(a.currentTime + when); o.stop(a.currentTime + when + dur + 0.05); }
  function burst(dur, freq, q, vol) { if (muted || holds.size) return; const a = ctx(); const b = a.createBuffer(1, a.sampleRate * dur, a.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); const s = a.createBufferSource(); s.buffer = b; const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q; const g = a.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(a.master); s.start(); }
  return {
    start() { try { ctx(); engine(); } catch (e) { } },
    // input { kmh, gas, nitro, air, fly } from the loop; a vehicle swap (setVehicle clones VEH) rebuilds the engine voices for the new preset
    update(input, dt) { if (!eng) return; if (eng.src !== VEH.sound.engine) { stopEngine(eng); eng = null; engine(); } es = engineStep(es, input, VEH.sound, dt); mix = engineMix(es, input, VEH.sound.engine); rmix = rotorMix(input); const t = ac.currentTime; applyEngine(eng, mix, t); applyRotor(rot, rmix, t); },
    checkpoint() { beep(660, 0.12, 'square', 0.18); beep(990, 0.18, 'square', 0.18, 0.1); },
    finish() { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.25, 'square', 0.2, i * 0.12)); },
    crash(v) { burst(0.18, 320, 1, 0.5 * v + 0.15); },
    splash() { burst(0.6, 900, 0.5, 0.4); },
    horn() { if (muted || holds.size) return; const a = ctx(); playHorn(a, a.master, VEH.sound.horn, a.currentTime); },
    toggle() { muted = !muted; if (ac) ac.master.gain.setTargetAtTime(muted ? 0 : 0.5, ac.currentTime, 0.02); return muted; },
    hold(reason, on) { if (on) holds.add(reason); else holds.delete(reason); if (!ac) return; if (holds.size) ac.suspend(); else ac.resume(); },
    state() { return { ctx: ac ? ac.state : 'none', muted, holds: [...holds], rpm: es.rpm, gear: es.gear, shift: es.shift, mix: mix && { ...mix }, rotor: rmix && { ...rmix } }; },
  };
})();
document.addEventListener('visibilitychange', () => SFX.hold('tab', document.hidden));   // a hidden tab is silent (the loop stops there too)
```

- [ ] **Step 7: Hooks.** After `window.__mm.vehicle = () => structuredClone(VEH);` (~L956) add:

```js
window.__mm.audio = () => SFX.state();   // #14: context state, pause holds, heard rpm / gear and the last mix
window.__mm.sfxHold = (reason, on) => SFX.hold(reason, on);
```

- [ ] **Step 8: HUD gear.** In `hud` (~L1099) replace `const gears = VEH.sound.gears; let gi = 0; while (kmh > gears[gi + 1]) gi++;` with `const gi = gearAt(kmh, VEH.sound.gears);`.

- [ ] **Step 9: Loop.** In `loop` (~L1104) replace `SFX.update(Math.hypot(P.vx, P.vz) * 3.6, P.gas, P.air, dt);` with:

```js
SFX.update({ kmh: Math.hypot(P.vx, P.vz) * 3.6, gas: P.gas, nitro: P.nitro, air: P.air, fly: false }, dt);
```

- [ ] **Step 10: Run, watch them pass.** `git grep -n "hornDur\|engineBase\|enginePerRpm" prototype/` → nothing. `node --test prototype/tests/*.test.mjs` → all pass. Pytest `test_sound.py` → `4 passed`. Then `test_vehicles.py` → everything except the known `test_rebuilds_free_gpu_memory` passes (golden trace and `test_table_gears_drive_the_hud` must be green).

- [ ] **Step 11: Commit.** `git add prototype/index.html prototype/tests/test_sound.py` → `feat(sound): natural engine, longer horn, pause holds (#14)`.

---

### Task 4: Helicopter — muted engine, rotor (only if #10 is on `main`)

**Files:**
- Modify: `prototype/tests/test_sound.py` (append)
- Modify: `prototype/index.html`

- [ ] **Step 1: Check.** `git fetch origin && git rebase origin/main`, then `grep -c "const FLY = " prototype/index.html`. If `0`: #10 is not merged — **skip this task**, leave `fly: false`, and write in the PR body: "When #10 lands, the loop must pass `fly: FLY.on` to `SFX.update` (see #14 plan Task 4)." Continue with Task 5.

- [ ] **Step 2: Write the failing test** — append to `prototype/tests/test_sound.py`:

```python
def test_flying_mutes_the_engine_and_plays_the_rotor(server):
    """#10: F lifts off; in flight the engine, road noise and hiss are silent and the rotor plays; F again lands."""
    with sync_playwright() as p:
        b, page = open_sound(p, server)
        page.keyboard.press("KeyF"); wait_frames(page, 3)
        fly = page.evaluate("() => window.__mm.audio()")
        page.keyboard.press("KeyF"); wait_frames(page, 3)
        ground = page.evaluate("() => window.__mm.audio()")
        b.close()
    assert fly["mix"]["gain"] == 0 and fly["mix"]["road"] == 0 and fly["mix"]["hiss"] == 0, fly
    assert fly["rotor"]["gain"] > 0, fly
    assert ground["mix"]["gain"] > 0 and ground["rotor"]["gain"] == 0, ground
```

- [ ] **Step 3: Run, watch it fail** (`mix.gain` > 0 in flight).

- [ ] **Step 4: Implement.** In the loop's `SFX.update({ … fly: false }, dt)` replace `fly: false` with `fly: FLY.on`.

- [ ] **Step 5: Run, watch it pass.** Pytest `test_sound.py` → `5 passed`; `test_heli.py` stays green.

- [ ] **Step 6: Commit.** `git add prototype/index.html prototype/tests/test_sound.py` → `feat(sound): rotor instead of the engine in the helicopter (#14)`.

---

### Task 5: Changelog and the listening test

**Files:**
- Modify: `CHANGELOG.md`, `test-todo.md`

- [ ] **Step 1: Changelog.** Under `## [Unreleased]`, in `### Changed` (create the subsection after `### Added` if missing), add:

```markdown
- The car sounds like a car: the engine idles low, revs up with speed and drops at every gear change, growls under throttle and hums off it, howls when the wheels leave the ground, and hisses with nitro (**N**). The horn (**H**) is louder and holds its two-tone chord for almost a second. Switching to another tab, or pausing, silences the game.
```

If Task 4 ran, append ` In the helicopter you hear the rotor instead of the engine.` to that entry.

- [ ] **Step 2: Listening test.** Append to `test-todo.md`:

```markdown
## Engine and horn sound (#14)

- [ ] **Horn (H, Enter):** louder than before and about a second long per press, a steady two-tone chord — not a beep that fades. Not the PostAuto three-tone horn.
- [ ] **Engine at idle and pulling away:** low idle at the start; with W the pitch rises and drops audibly at about 20, 45, 75, 110 and 150 km/h, with a short dip at each shift. Does it sound like a car rather than a synthesiser? Too buzzy, too quiet, too loud next to the horn?
- [ ] **Load:** letting off the gas at speed makes the engine darker and quieter; back on, it brightens again.
- [ ] **Jump:** in the air with gas held, the engine howls up; road noise stops until landing.
- [ ] **Nitro (N):** a hiss on top of the engine while held.
- [ ] **Mute (M)** silences everything; M again brings it back.
- [ ] **Other tab:** switch away while driving — silence; come back — the engine is there again.
- [ ] **Helicopter (F, once #10 is in):** engine silent, a rotor thump instead; landing brings the engine back.
- [ ] **Pause (once #83 is in):** pausing silences the game, resuming brings the engine back.
```

- [ ] **Step 3: Commit.** `git add CHANGELOG.md test-todo.md` → `docs(sound): changelog and listening test for #14`.

---

### Task 6: Full verification

- [ ] **Step 1:** `node --test prototype/tests/*.test.mjs` → all pass.
- [ ] **Step 2:** Push, then pytest `../prototype/tests/test_sound.py ../prototype/tests/test_vehicles.py ../prototype/tests/test_smoke.py -q` (foreground) → green except the known `test_rebuilds_free_gpu_memory`.
- [ ] **Step 3:** Open the PR `feat(prototype): stronger horn and a more natural engine sound (#14)`; body: summary, the `SFX.hold('menu', on)` contract for #83, Task 4's outcome, and "The manual listening test in `test-todo.md` is the real gate."

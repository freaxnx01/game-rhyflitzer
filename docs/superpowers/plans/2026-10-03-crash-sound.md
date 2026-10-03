# Crash sound Implementation Plan (#104)

> Spec: `docs/superpowers/specs/2026-10-03-crash-sound-design.md`. Test-first; run the full suite (`node --test prototype/tests/*.test.mjs` and `pytest prototype/tests`) after each task. Known unrelated failure on `main`: `test_vehicles.py::test_rebuilds_free_gpu_memory` (geometries 280 → 281).

**Goal:** replace the 0.18 s `SFX.crash` stub with a noise burst plus a thump scaled by one shared `impactStrength`, gated against retriggering, per-vehicle via `sound.crash`.

**Architecture:** new pure module `prototype/impact.js` (mapping, voice, gate, preset check, graph builder over any `BaseAudioContext`); `index.html` imports it, adds `sound.crash` to the vehicle table, and calls it from `collide` and the landing branch. No samples, no new dependency. #105 imports `impactStrength` from the same module.

**Global constraints:** vanilla ES modules, `const`/`let`, no `window` leaks beyond `__mm` hooks, `splash()` untouched, no change to any damage line. If #14 has landed (`prototype/sound.js` exists) put `crash` beside its `engine`/`horn` preset keys, call `checkCrash` from its `checkSound`, and route `playCrash` into its master/limiter and `SFX.hold`; otherwise use today's `ac.master`, `muted`, `held`.

---

## Task 1 — Pure mapping, gate and preset check (`prototype/impact.js`)

**Files:** create `prototype/impact.js`, `prototype/tests/impact.test.mjs`.

**Interfaces:**
`impactStrength(speed: m/s) -> 0..1` · `crashVoice(s, preset) -> {noise:{gain,freq,dur}, thump:{gain,f0,f1,dur}} | null` · `crashGate(state, now, s) -> boolean` (mutates `state`) · `checkCrash(preset) -> void | throws Error` · constants `CRASH_MIN=3, CRASH_FULL=25, CRASH_COOLDOWN=0.35, CRASH_OVERRIDE=0.25`.

- [ ] **Step 1: Write the failing test** `prototype/tests/impact.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { impactStrength, crashVoice, crashGate, checkCrash, CRASH_MIN, CRASH_FULL } from '../impact.js';

const COMPACT = { weight: 1, thump: 70, noise: 1800, gain: 1 };
const BUS = { weight: 1.6, thump: 45, noise: 1200, gain: 1.1 };

test('impactStrength: zero at and below the threshold, one at full speed and above, linear between', () => {
  assert.equal(impactStrength(0), 0);
  assert.equal(impactStrength(CRASH_MIN), 0);
  assert.equal(impactStrength(-5), 0);
  assert.equal(impactStrength(CRASH_FULL), 1);
  assert.equal(impactStrength(60), 1);
  assert.ok(Math.abs(impactStrength(14) - 0.5) < 1e-9);
});

test('crashVoice: nothing for strength 0, louder, longer and brighter as strength rises', () => {
  assert.equal(crashVoice(0, COMPACT), null);
  const soft = crashVoice(0.1, COMPACT), hard = crashVoice(1, COMPACT);
  for (const k of ['noise', 'thump']) { assert.ok(hard[k].gain > soft[k].gain); assert.ok(hard[k].dur > soft[k].dur); }
  assert.ok(hard.noise.freq > soft.noise.freq);
  assert.ok(hard.thump.f0 > hard.thump.f1);
});

test('crashVoice: the bus preset is deeper and longer than the compact at the same strength', () => {
  const c = crashVoice(0.6, COMPACT), b = crashVoice(0.6, BUS);
  assert.ok(b.thump.f1 < c.thump.f1);
  assert.ok(b.thump.dur > c.thump.dur);
  assert.ok(b.noise.freq < c.noise.freq);
});

test('crashGate: one crash per 0.35 s unless a clearly harder hit follows', () => {
  const st = { t: -Infinity, s: 0 };
  assert.equal(crashGate(st, 10, 0.3), true);
  assert.equal(crashGate(st, 10.1, 0.3), false);
  assert.equal(crashGate(st, 10.1, 0.4), false);
  assert.equal(crashGate(st, 10.1, 0.6), true);
  assert.equal(crashGate(st, 10.2, 0.6), false);
  assert.equal(crashGate(st, 10.6, 0.3), true);
});

test('crashGate: strength 0 never plays and does not start the cooldown', () => {
  const st = { t: -Infinity, s: 0 };
  assert.equal(crashGate(st, 5, 0), false);
  assert.equal(crashGate(st, 5.01, 0.2), true);
});

test('checkCrash: accepts a good preset, names the bad field otherwise', () => {
  assert.doesNotThrow(() => checkCrash(COMPACT));
  assert.throws(() => checkCrash(undefined), /sound\.crash/);
  for (const k of Object.keys(COMPACT)) assert.throws(() => checkCrash({ ...COMPACT, [k]: 0 }), new RegExp(`sound\\.crash\\.${k}`));
  assert.throws(() => checkCrash({ ...COMPACT, thump: NaN }), /sound\.crash\.thump/);
});
```

- [ ] **Step 2: Run, expect failure** — `node --test prototype/tests/impact.test.mjs` fails with a module-not-found error.

- [ ] **Step 3: Implement** `prototype/impact.js`:

```js
// #104: crash sound scaled by one impact strength, shared with the damage model (#105). Pure except playCrash, which only touches the AudioContext it is given.
export const CRASH_MIN = 3, CRASH_FULL = 25, CRASH_COOLDOWN = 0.35, CRASH_OVERRIDE = 0.25;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// speed: closing speed in m/s along the contact normal (-vn on a wall, -vy on a landing)
export function impactStrength(speed) {
  return speed <= CRASH_MIN ? 0 : clamp01((speed - CRASH_MIN) / (CRASH_FULL - CRASH_MIN));
}

export function crashVoice(s, p) {
  if (!(s > 0)) return null;
  const level = p.gain * (0.12 + 0.88 * s);
  return {
    noise: { gain: 0.6 * level, freq: p.noise * (0.5 + 0.5 * s), dur: (0.10 + 0.30 * s) * p.weight },
    thump: { gain: 0.9 * level, f0: 1.6 * p.thump, f1: p.thump, dur: (0.12 + 0.28 * s) * p.weight },
  };
}

export function crashGate(state, now, s) {
  if (!(s > 0)) return false;
  if (now - state.t < CRASH_COOLDOWN && s < state.s + CRASH_OVERRIDE) return false;
  state.t = now; state.s = s;
  return true;
}

export function checkCrash(c) {
  if (!c || typeof c !== 'object') throw new Error('sound.crash is missing (expected { weight, thump, noise, gain })');
  for (const k of ['weight', 'thump', 'noise', 'gain']) {
    if (!Number.isFinite(c[k]) || c[k] <= 0) throw new Error(`sound.crash.${k} must be a positive number, got ${c[k]}`);
  }
}
```

- [ ] **Step 4: Run, expect pass**, then the whole node suite.
- [ ] **Step 5: Commit** `feat(audio): impact strength, crash voice and gate (#104)`.

## Task 2 — Graph builder `playCrash` (same file)

**Files:** modify `prototype/impact.js`; create `prototype/tests/test_crash.py`.

**Interface:** `playCrash(ctx, dest, voice, when = 0) -> void` — schedules a lowpassed noise burst and a falling sine thump with exponential decays on any `BaseAudioContext`.

- [ ] **Step 1: Write the failing test** in `test_crash.py` (pattern of `test_vehicles.py`: `server` fixture, `sync_playwright`): load the page, `page.evaluate` an async function that `import('./impact.js')`, renders `playCrash` for `s = 0.1` and `s = 1` into an `OfflineAudioContext(1, 44100, 44100)` (destination `ctx.destination`), and returns each rendering's RMS and its last non-silent sample time (|x| > 0.01). Assert: RMS(hard) > 3 * RMS(soft); end(hard) > end(soft); end(hard) < 0.9 s; peak(hard) < 1.0 (no clipping before the master gain).

- [ ] **Step 2: Run, expect failure** (`playCrash` is not exported).

- [ ] **Step 3: Implement**, appended to `impact.js`:

```js
const END_GAIN = 0.001;

function noiseBuffer(ctx, dur) {
  const len = Math.max(1, Math.ceil(ctx.sampleRate * dur)), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function decayGain(ctx, dest, peak, t, dur) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(END_GAIN, t + dur);
  g.connect(dest);
  return g;
}

export function playCrash(ctx, dest, voice, when = 0) {
  const t = ctx.currentTime + when, { noise: n, thump: h } = voice;
  const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter();
  src.buffer = noiseBuffer(ctx, n.dur); lp.type = 'lowpass'; lp.frequency.value = n.freq;
  src.connect(lp); lp.connect(decayGain(ctx, dest, n.gain, t, n.dur)); src.start(t);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(h.f0, t); osc.frequency.exponentialRampToValueAtTime(h.f1, t + h.dur * 0.5);
  osc.connect(decayGain(ctx, dest, h.gain, t, h.dur)); osc.start(t); osc.stop(t + h.dur + 0.05);
}
```

- [ ] **Step 4: Run, expect pass.** If the peak or length bound fails, tune the multipliers in `crashVoice` (the Task 1 expectations stay valid) — do not loosen the test.
- [ ] **Step 5: Commit** `feat(audio): synthesize the crash noise burst and thump (#104)`.

## Task 3 — Wire into the game (`prototype/index.html`)

**Files:** modify `prototype/index.html`, `prototype/tests/test_crash.py`.

- [ ] **Step 1: Write the failing tests** (append to `test_crash.py`):
  1. Hard wall hit counts: `__mm.sim(1236.5, -127, Math.PI, 15, 1.6, [])` (the island hit used by `test_table_mass_softens_the_crash`) gives `__mm.sfxCrashes().count >= 1` and `last.s > 0.4`.
  2. Scraping stays silent: a `sim` run at 2 m/s into the same island (normal speed under 3 m/s) gives `count == 0`.
  3. No machine-gun: hold the car against the island with the gas for 2 s gives `count <= 6` (cooldown 0.35 s).
  4. Preset check: `use_vehicle(page, "delete c.sound.crash")` raises an error naming `sound.crash`; `use_vehicle(page, "c.sound.crash.thump = 0")` names `sound.crash.thump`.
  5. Muted: after pressing **M**, a wall hit leaves `count` unchanged.

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement in `index.html`:**
  - `import { impactStrength, crashVoice, crashGate, checkCrash, playCrash } from './impact.js';` next to the other module imports.
  - `VEHICLES.compact.sound` gets `crash: { weight: 1, thump: 70, noise: 1800, gain: 1 }` (`index.html:915`).
  - `checkVehicle` (`index.html:948`): call `checkCrash(def.sound?.crash)` before anything is swapped.
  - In `SFX`: `const gate = { t: -Infinity, s: 0 }, rec = { count: 0, last: null };` and replace `crash(v)`:
    ```js
    crash(s) { if (muted || held) return; const a = ctx(); const voice = crashVoice(s, VEH.sound.crash); if (!voice || !crashGate(gate, a.currentTime, s)) return; playCrash(a, a.master, voice); rec.count++; rec.last = { s, t: a.currentTime }; },
    crashes() { return { count: rec.count, last: rec.last }; },
    ```
  - `collide` (`index.html:1071`): replace `if (vn < -3) SFX.crash(Math.min(1, -vn / 25));` with `SFX.crash(impactStrength(-vn));` (strength 0 returns at once). Touch no damage line.
  - Landing (`index.html:1084`): replace `SFX.crash(0.5)` with `SFX.crash(impactStrength(-P.vy))`.
  - Hook: `window.__mm.sfxCrashes = () => SFX.crashes();` beside `__mm.sfx` (`index.html:1044`).
  - If #14 is on `main`: use its `SFX.hold` state instead of `held`, and its master/limiter instead of `ac.master`.

- [ ] **Step 4: Run the full suites, expect pass** (except the known unrelated failure). `test_table_mass_softens_the_crash` must pass unchanged (`light == 2.074`): no physics line changed.

- [ ] **Step 5: Commit** `feat(audio): crash sound scaled by impact strength (#104)`.

## Task 4 — Changelog and playtest checklist

**Files:** modify `CHANGELOG.md`, `test-todo.md` (the latter straight to `main`, per the repo convention for that file).

- [ ] **Step 1:** add under `## [Unreleased]` → `### Added`, in the player's voice: „Crashes now sound like crashes: a bump is a soft tick, a hard hit a loud bang with a deep thump, and landing hard after a jump thuds. Scraping along a wall stays quiet, and pressing against a wall does not rattle."
- [ ] **Step 2:** add a manual listening item to `test-todo.md`: bump a house at about 15 km/h, hit one at full speed, scrape along a wall, land from the Sprungschanze, press into a wall; check the bump is quiet, the hard hit is loud and deep, scraping is silent, no rattling; with **M** muted and while paused nothing plays. Note the preset numbers (`thump 70`, `noise 1800`) as the tuning knobs.
- [ ] **Step 3:** run both suites once more; commit `docs(audio): changelog and playtest note for the crash sound (#104)`.

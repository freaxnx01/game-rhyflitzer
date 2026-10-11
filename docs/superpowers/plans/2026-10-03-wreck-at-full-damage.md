# Wreck at 100 % Damage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Refreshed 2026-10-11 against `main` @ `090402c`.** What changed since the first version of this plan:
> - **`prototype/impact.js` exists** (#104 landed). `impactStrength` is already there; the old "Task 1" is gone. Do not touch `impact.js`.
> - **Obsolete acceptance criterion:** "entering water … still resets after 2.8 s". Since #101 there is no water reset; the car sinks onto the riverbed and drives on. Only the half-sentence "entering water does not hurt" still holds (nothing in the water code touches `P.dmg`; leave the water code alone).
> - **Wheels are already registered:** `buildWheels(g, v)` fills `car.userData.wheels` for every vehicle (compact and DeLorean). Task 5 extends those entries instead of adding a registry, and `drawWheels()` must skip detached wheels.
> - **New vehicle rebuilds mid-game** (pause menu "Change vehicle", #189, and the choose-car garage): `buildCar()` can now run while a wreck is on, so it ends the wreck first.
> - **Engine sound** has no `SFX.silent()` any more; Task 2 adds a `dead` input to `engineMix` in `sound.js`.
> - Test hooks that already exist and are reused: `__mm.sim`, `__mm.car`, `__mm.pause`, `__mm.raceFlags`, `__mm.fly`, `__mm.gpu`, `__mm.ground`, `__mm.vehicles/vehicle/setVehicle`, `__mm.sfxCrashes`.

**Goal:** Damage rises with impact strength and shows in the HUD; at 100 % the wheels fall off, the engine smokes, the car is dead, and after 3 s a new car stands on the last road position. The race clock runs on.

**Architecture:** One new pure module, node-tested: `prototype/wreck.js` (damage per hit, wheel debris physics, smoke curve, countdown); it imports the existing `impactStrength` from `prototype/impact.js`. `prototype/index.html` wires it: a `hurt()`/`crashHit()` pair replaces the inline damage lines in `collide` and the landing in `stepCar`, `startWreck`/`stepWreck`/`endWreck` detach and animate the wheels (re-parented meshes, no physics engine) and drive a 24-sprite smoke pool, `resetCar` ends a wreck. No new dependency, no build step.

**Tech Stack:** vanilla JS ES modules + three.js in the buildless `prototype/index.html`; `node --test` for the pure modules; pytest + Playwright for the browser (foreground only).

**Spec:** `docs/superpowers/specs/2026-10-03-wreck-at-full-damage-design.md`

## Global Constraints

- **Impact strength is defined once**, in `prototype/impact.js`. `wreck.js` imports `impactStrength`; never write a second formula.
- Anchor on the **identifiers quoted in each step** (`grep -n` for them). `prototype/index.html` is one very long line per function; edit with exact-string replacements, not line numbers. Open PR #281 (levels/lift, #277) also edits `index.html`; the quoted strings below are unaffected, but re-grep before editing.
- Speed-loss maths in `collide` (`keep`, the 1.25 bounce) is **not** touched: `test_vehicles.py::test_table_mass_softens_the_crash` (light speed 2.074 m/s, re-measured on current main) must stay as it is.
- **Keys:** this plan adds no key. `R`, `J`, `F` are existing keys and only get the behaviour named below. Do not bind anything new (all of `prototype/*.js` incl. `pause.js` was grepped: `U` = pontoon, `P`/`Esc` = pause, `O`/`I`/`J` = lists).
- UI text through `tr()`, en and de, Swiss spelling (no `ß`); `prototype/tests/strings.test.mjs` enforces equal keys and no `ß`.
- **Tests: `node --test prototype/tests/*.test.mjs` plus the ONE Playwright file `prototype/tests/test_wreck.py`.** Do not run the full pytest suite (about 2 h). Foreground only, never `run_in_background`; generous timeout (600000 ms). Commit and push the branch before the Playwright run. Memory cap per the box rules: prefix with `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`.
- Conventional Commits, branch `feature/105-wreck-at-full-damage`, PR to `main`. `CHANGELOG.md` entry in player voice (format in Task 6).
- Do not change the physics of driving, the speed-loss maths, the pause or helicopter behaviour beyond the lines named below.
- Name clashes already in `index.html`: a lowercase `wreck` (the underwater wreck group), `WRECK_RUNUP`, `jumpToWreck`. The new identifiers below (`WRECK`, `WRECK_S`, `SMOKE`, `startWreck`, `stepWreck`, `endWreck`, `crashHit`, `hurt`, `showDamage`, `DMG_FMT`, `NO_INPUT`, `emitPuff`, `stepSmoke`) were grepped and are free. Do not shadow `wreck`.

## File Structure

| File | Change |
|---|---|
| `prototype/wreck.js` | create (Task 1) |
| `prototype/tests/wreck.test.mjs` | create (Task 1) |
| `prototype/sound.js`, `prototype/tests/sound.test.mjs` | `engineMix`: new `dead` input (Task 2) |
| `prototype/strings.js` | add `wrecked`, `newCar` (en + de) (Task 3) |
| `prototype/tests/test_wreck.py` | create (Playwright) (Task 4) |
| `prototype/index.html` | HUD markup + CSS, import, vehicle `engineAt` field, wheel entries, wreck state, `crashHit`/`hurt`, input lock, smoke pool, `resetCar`, `buildCar`, `toggleFly`, loop, hud, test hooks (Task 5) |
| `CHANGELOG.md` | one `[Unreleased] / Added` entry (Task 6) |

---

### Task 1: `wreck.js` (damage per hit, wheel debris, smoke, countdown)

**Files:** Create `prototype/wreck.js`, `prototype/tests/wreck.test.mjs`

- [ ] **Step 1: Write the failing test** — `prototype/tests/wreck.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { impactStrength } from '../impact.js';
import { WRECK, impactDamage, landingHurts, isWrecked, wreckTick, detachWheels, stepDebris, smokeAt, smokeEmit } from '../wreck.js';

const close = (a, b, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);

test('WRECK: the agreed constants', () => {
  assert.equal(WRECK.perHit, 0.3);
  assert.equal(WRECK.delay, 3);
  assert.equal(WRECK.smokeMax, 24);
});

test('impactDamage: no strength, no damage (scraping and bumps under 3 m/s are free)', () => {
  assert.equal(impactDamage(impactStrength(0)), 0);
  assert.equal(impactDamage(impactStrength(2.9)), 0);
  assert.equal(impactDamage(impactStrength(3)), 0);
});

test('impactDamage: rises with the impact strength', () => {
  close(impactDamage(impactStrength(25)), 0.3);
  close(impactDamage(impactStrength(14)), 0.15);
  assert.ok(impactDamage(impactStrength(20)) > impactDamage(impactStrength(15)));
});

test('impactDamage: a hit harder than 25 m/s costs no more than a full one', () => {
  close(impactDamage(impactStrength(60)), 0.3);
});

test('impactDamage: a heavier vehicle takes proportionally less (#6)', () => {
  close(impactDamage(1, 2.5), 0.3 / 2.5);
  close(impactDamage(1, 8), 0.3 / 8);
});

test('impactDamage: seven city-speed hits (15 m/s) wreck the compact, six do not', () => {
  const one = impactDamage(impactStrength(15));
  assert.ok(6 * one < 1);
  assert.ok(7 * one >= 1);
});

test('landingHurts: only a fall faster than 9 m/s', () => {
  assert.equal(landingHurts(-8.9), false);
  assert.equal(landingHurts(-9), false);
  assert.equal(landingHurts(-9.1), true);
  assert.equal(landingHurts(3), false);
});

test('isWrecked: from 100 % on', () => {
  assert.equal(isWrecked(0.999), false);
  assert.equal(isWrecked(1), true);
});

test('wreckTick: the new car comes after 3 s', () => {
  assert.equal(wreckTick(0, 1 / 60).respawn, false);
  assert.equal(wreckTick(2.99, 0.005).respawn, false);
  assert.equal(wreckTick(2.99, 0.02).respawn, true);
  close(wreckTick(1, 0.5).t, 1.5);
});

const WHEELS = [{ lx: 1.38, lz: 0.86, r: 0.34 }, { lx: 1.38, lz: -0.86, r: 0.34 }, { lx: -1.38, lz: 0.86, r: 0.34 }, { lx: -1.38, lz: -0.86, r: 0.34 }];
const CAR = { x: 100, y: 5, z: 50, th: 0, vx: 10, vz: 0, scale: 1.3 };

test('detachWheels: one debris state per wheel at the wheel position, scaled with the car', () => {
  const d = detachWheels(WHEELS, CAR);
  assert.equal(d.length, 4);
  close(d[0].x, 100 + 1.3 * 1.38); close(d[0].z, 50 + 1.3 * 0.86); close(d[0].y, 5 + 1.3 * 0.34);
  close(d[3].x, 100 - 1.3 * 1.38); close(d[3].z, 50 - 1.3 * 0.86);
  close(d[0].r, 1.3 * 0.34);
});

test('detachWheels: heading is respected (th = pi/2 puts forward on +z, right on -x)', () => {
  const d = detachWheels([{ lx: 2, lz: 1, r: 0.3 }], { ...CAR, th: Math.PI / 2, scale: 1 });
  close(d[0].x, 100 - 1, 1e-9); close(d[0].z, 50 + 2, 1e-9);
});

test('detachWheels: each wheel flies up, outward on its own side, and keeps the car speed', () => {
  const d = detachWheels(WHEELS, CAR);
  for (const w of d) assert.ok(w.vy > 3);
  assert.ok(d[0].vz > 2, 'right wheel goes right (+z at heading 0)');
  assert.ok(d[1].vz < -2, 'left wheel goes left');
  assert.ok(d[0].vx > CAR.vx - 0.01, 'front wheels pull ahead of the car speed');
  assert.ok(d[2].vx < CAR.vx + 0.01, 'rear wheels fall behind');
});

test('detachWheels: the four wheels do not all fly the same way', () => {
  const d = detachWheels(WHEELS, CAR);
  assert.equal(new Set(d.map((w) => w.vy.toFixed(3))).size > 1, true);
});

const settle = (d, secs, ground = 0) => { for (let i = 0; i < secs * 60 && !d.still; i++) d = stepDebris(d, 1 / 60, ground); return d; };

test('stepDebris: a wheel falls under gravity (22 m/s²)', () => {
  const d = stepDebris({ x: 0, y: 10, z: 0, vx: 0, vy: 0, vz: 0, r: 0.4, spin: 0, still: false }, 0.5, 0);
  close(d.vy, -11); close(d.y, 10 - 11 * 0.5);
});

test('stepDebris: it bounces lower and lower, then lies still on the ground, never below it', () => {
  let d = detachWheels(WHEELS, CAR)[0];
  let peak = 0, minY = Infinity;
  for (let i = 0; i < 600 && !d.still; i++) { d = stepDebris(d, 1 / 60, 0); minY = Math.min(minY, d.y); if (i > 60) peak = Math.max(peak, d.y); }
  assert.equal(d.still, true);
  close(d.y, d.r, 1e-9);
  assert.ok(minY >= d.r - 1e-9);
  assert.ok(peak < 3, `second bounce stays low, got ${peak}`);
});

test('stepDebris: it rolls on for a few metres, spinning, and settles within 8 s', () => {
  const start = detachWheels(WHEELS, CAR)[0];
  const end = settle(start, 8);
  assert.equal(end.still, true);
  assert.ok(Math.hypot(end.x - start.x, end.z - start.z) > 5);
  assert.ok(end.spin > 5);
});

test('stepDebris: a still wheel stays exactly as it is', () => {
  const d = { x: 1, y: 0.4, z: 2, vx: 0, vy: 0, vz: 0, r: 0.4, spin: 3, still: true };
  assert.equal(stepDebris(d, 1 / 60, 0), d);
});

test('stepDebris: it rests on raised ground (a kerb at 0.3 m)', () => {
  const end = settle({ x: 0, y: 2, z: 0, vx: 1, vy: 0, vz: 0, r: 0.4, spin: 0, still: false }, 8, 0.3);
  close(end.y, 0.7);
});

test('smokeAt: fades in, rises, grows and fades out; null after 2.4 s', () => {
  const young = smokeAt(0.1), mid = smokeAt(1.2), old = smokeAt(2.3);
  assert.ok(young.opacity < mid.opacity);
  assert.ok(mid.opacity > old.opacity);
  assert.ok(young.size < mid.size && mid.size < old.size);
  close(mid.rise, 1.6 * 1.2);
  close(smokeAt(0).opacity, 0);
  assert.equal(smokeAt(2.4), null);
  assert.equal(smokeAt(-0.1), null);
});

test('smokeEmit: 10 puffs per second, the remainder carried over', () => {
  let acc = 0, n = 0;
  for (let i = 0; i < 60; i++) { const e = smokeEmit(acc, 1 / 60); acc = e.acc; n += e.n; }
  assert.ok(n === 10 || n === 9, `got ${n}`);
  assert.equal(smokeEmit(0, 0.05).n, 0);
  assert.equal(smokeEmit(0.6, 0.05).n, 1);
});

test('the pool covers the steady state: rate x life <= smokeMax', () => {
  assert.ok(WRECK.smokeRate * WRECK.smokeLife <= WRECK.smokeMax);
});
```

- [ ] **Step 2:** `node --test prototype/tests/wreck.test.mjs` → fails (module not found).

- [ ] **Step 3: Create `prototype/wreck.js`:**

```js
// #105: wreck rules -- pure, no three.js, no DOM. Unit-tested with `node --test prototype/tests/*.test.mjs`.
// Units m, m/s, s. Same frame as the car: x east, z south, th = heading (0 = +x); a model's x is forward, its z is to the right.

export const WRECK = {
  perHit: 0.3,       // damage of a full-strength hit (impactStrength = 1, from 25 m/s) on a mass-1 vehicle
  landMin: 9,        // m/s of fall a landing survives for free (as before #105)
  delay: 3,          // s from the wreck to the new car
  coast: 2.5,        // 1/s extra drag on a wreck: from 15 m/s it is down to 2 m/s after about 1 s
  gravity: 22,       // same as the car
  bounce: 0.4,       // a wheel keeps 40 % of its fall speed on a bounce
  friction: 1.2,     // 1/s horizontal drag of a wheel on the ground
  restSpeed: 0.3,    // m/s: below this a wheel on the ground lies still
  smokeRate: 10,     // puffs per second
  smokeLife: 2.4,    // s a puff lives
  smokeMax: 24,      // puffs alive at once = the sprite pool
  smokeRise: 1.6,    // m/s a puff rises
};

// damage of one hit from its impactStrength s (0..1, prototype/impact.js -- the one definition shared with the crash sound #104):
// nothing for s = 0 (a scrape or a bump under 3 m/s), linear above, softened by mass (#6)
export function impactDamage(s, mass = 1, cfg = WRECK) {
  return s * cfg.perHit / mass;
}

// a landing hurts when the fall (vy < 0) is faster than landMin; the strength is impactStrength(-vy)
export function landingHurts(vy, cfg = WRECK) {
  return vy < -cfg.landMin;
}

export const isWrecked = (dmg) => dmg >= 1;

// the countdown to the new car; t = seconds since the wreck
export function wreckTick(t, dt, cfg = WRECK) {
  const next = t + dt;
  return { t: next, respawn: next >= cfg.delay };
}

// the wheels leave the car: wheels = [{ lx, lz, r }] (model metres, lz > 0 = right side), car = { x, y, z, th, vx, vz, scale }
// → one debris state per wheel: world position, velocity (car's own + outward + up), world radius, spin angle, still
export function detachWheels(wheels, car) {
  const fx = Math.cos(car.th), fz = Math.sin(car.th), rx = -fz, rz = fx;
  return wheels.map((w, i) => {
    const side = Math.sign(w.lz) || 1, along = w.lx >= 0 ? 1 : -1, out = 2.5 + 0.8 * (i % 3);
    return {
      x: car.x + car.scale * (w.lx * fx + w.lz * rx),
      y: car.y + car.scale * w.r,
      z: car.z + car.scale * (w.lx * fz + w.lz * rz),
      vx: car.vx + rx * side * out + fx * along,
      vy: 4 + 1.5 * (i % 3),
      vz: car.vz + rz * side * out + fz * along,
      r: car.scale * w.r,
      spin: 0,
      still: false,
    };
  });
}

// one fixed step of a loose wheel over ground height groundY: gravity, bounce, rolling friction; lies still once slow on the ground
export function stepDebris(d, dt, groundY, cfg = WRECK) {
  if (d.still) return d;
  let { x, y, z, vx, vy, vz } = d;
  vy -= cfg.gravity * dt;
  x += vx * dt; y += vy * dt; z += vz * dt;
  const onGround = y <= groundY + d.r;
  if (onGround) {
    y = groundY + d.r;
    vy = vy < -1.5 ? -vy * cfg.bounce : 0;
    const drag = Math.exp(-cfg.friction * dt);
    vx *= drag; vz *= drag;
  }
  const speed = Math.hypot(vx, vz);
  return { ...d, x, y, z, vx, vy, vz, spin: d.spin + speed / d.r * dt, still: onGround && vy === 0 && speed < cfg.restSpeed };
}

// a smoke puff of the given age (s): size in metres, opacity 0..1 (fades in over 0.25 s, then out), height gained; null once it is gone
export function smokeAt(age, cfg = WRECK) {
  if (age < 0 || age >= cfg.smokeLife) return null;
  const t = age / cfg.smokeLife;
  return { size: 1 + 3 * t, opacity: Math.min(1, age / 0.25) * 0.6 * (1 - t), rise: cfg.smokeRise * age };
}

// how many puffs to emit this step; acc carries the fraction to the next step
export function smokeEmit(acc, dt, cfg = WRECK) {
  const total = acc + dt * cfg.smokeRate;
  const n = Math.floor(total);
  return { n, acc: total - n };
}
```

- [ ] **Step 4:** `node --test prototype/tests/*.test.mjs` → all pass (`wreck.test.mjs`: 21 tests, verified against the current `impact.js` when this plan was refreshed).

- [ ] **Step 5:** Commit: `feat(game): wreck rules — damage per hit, wheel debris, smoke curve (#105)`.

---

### Task 2: A wreck's engine is silent (`sound.js`)

**Files:** Modify `prototype/sound.js`, `prototype/tests/sound.test.mjs`

- [ ] **Step 1: Write the failing test** — append to `prototype/tests/sound.test.mjs` (`SOUND` and `IN` are defined at its top):

```js
test('engineMix: a dead engine (a wreck, #105) is silent and has no nitro hiss, the tyres still roll', () => {
  const { engine } = SOUND(), s = { rpm: 4000, gear: 2, shift: 0 };
  const dead = engineMix(s, IN({ kmh: 60, gas: 1, nitro: 1, dead: true }), engine);
  assert.equal(dead.gain, 0);
  assert.equal(dead.hiss, 0);
  assert.equal(dead.road, 0.15);
  assert.ok(engineMix(s, IN({ kmh: 60, gas: 1 }), engine).gain > 0);
});
```

- [ ] **Step 2:** `node --test prototype/tests/sound.test.mjs` → the new test fails (`gain` is not 0).

- [ ] **Step 3:** In `engineMix` (`prototype/sound.js`) change the returned object's `gain` and `hiss`, nothing else:

```js
  return { f0: s.rpm / 60 * engine.cylinders / 2, cutoff, q: F.q * (load ? 1 : 0.6), gain: input.fly || input.dead ? 0 : level,
    road: input.fly || input.air ? 0 : Math.min(0.25, input.kmh / 400), hiss: input.nitro && !input.fly && !input.dead ? engine.nitroHiss : 0 };
```

- [ ] **Step 4:** `node --test prototype/tests/*.test.mjs` → all pass. Commit: `feat(sound): a dead engine is silent (#105)`.

---

### Task 3: Strings

**Files:** Modify `prototype/strings.js`

- [ ] **Step 1:** In the `en` table next to `heliOn: 'Helicopter!',` add `wrecked: 'Total loss!',` and `newCar: 'New car!',`; in the `de` table next to `heliOn: 'Helikopter!',` add `wrecked: 'Totalschaden!',` and `newCar: 'Neues Auto!',`.
- [ ] **Step 2:** `node --test prototype/tests/strings.test.mjs` → pass (equal keys in both languages, no `ß`).
- [ ] **Step 3:** Commit: `feat(i18n): strings for the wreck and the new car (#105)`.

---

### Task 4: Browser tests first (Playwright, they fail until Task 5)

**Files:** Create `prototype/tests/test_wreck.py`

Hand-traced layout (world and terrain blocked, no data files), like `test_crash.py`. The head-on drive into the Smile-Kreisel island, `window.__mm.sim(1236.5, -127, Math.PI, 15, 1.6, [])`, hits with strength 0.397 (measured on current main via `__mm.sfxCrashes().last.s`), so it costs `0.3 * 0.397 = 0.119` of damage. `sim` steps only `stepCar`; the wreck countdown, wheels and smoke advance only through `stepWreck`, so the sequence test does everything in ONE `page.evaluate` (no real loop frame can run in between and make it flaky). Do not click Start before a `sim` call unless a test needs the running race (the game loop would step the car too).

- [ ] **Step 1: Write the tests:**

```python
"""#105: damage rises with impact strength; at 100 % the wheels fall off, the engine smokes, the car is dead and 3 s later a new
car stands on the last road position; the race clock runs on. Hand-traced layout. Slow (Playwright): run in the foreground."""
import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
T = 120000
CRASH = "() => window.__mm.sim(1236.5, -127, Math.PI, 15, 1.6, [])"      # island at x 1217.4: strength 0.397 -> 11.9 % damage


def open_hand(p, server, start=False):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 640, "height": 360}, locale="en-US").new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    if start:
        page.click("#startbtn", timeout=T)
    return b, page, errors


def dmg(page):
    return page.evaluate("() => window.__mm.damage()")


def wait_frames(page, n=5):
    f = page.evaluate("() => window.__mm.pause().frame")
    page.wait_for_function(f"() => window.__mm.pause().frame >= {f + n}", timeout=T)


def test_a_hit_costs_damage_by_strength_and_a_slow_bump_is_free(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        page.evaluate("() => window.__mm.setDamage(0)")
        page.evaluate(CRASH)
        hard = dmg(page)["dmg"]
        page.evaluate("() => window.__mm.setDamage(0)")
        page.evaluate("() => window.__mm.sim(1219, -127, Math.PI, 2.9, 1, [])")     # 1.6 m short of the island, under 3 m/s on arrival
        soft = dmg(page)["dmg"]
        b.close()
    assert hard == pytest.approx(0.119, abs=0.01), hard
    assert soft == 0, soft
    assert not errors, errors


def test_contact_is_charged_once_not_every_frame(server):
    """Gas held into the island for 4 s: one hard hit, then pressing against it (under 3 m/s) must cost nothing more."""
    with sync_playwright() as p:
        b, page, _ = open_hand(p, server)
        page.evaluate("() => window.__mm.setDamage(0)")
        page.evaluate("() => window.__mm.sim(1236.5, -127, Math.PI, 15, 4, ['KeyW'])")
        held = dmg(page)["dmg"]
        b.close()
    assert held < 0.35, held      # one hit of strength ~0.9 is 0.27; 240 steps of the old per-step formula would have wrecked it


def test_heavier_vehicle_takes_less(server):
    with sync_playwright() as p:
        b, page, _ = open_hand(p, server)
        page.evaluate("() => window.__mm.setDamage(0)")
        page.evaluate(CRASH)
        light = dmg(page)["dmg"]
        page.evaluate("() => { const c = window.__mm.vehicles().compact; c.mass = 8; window.__mm.setVehicle(c); window.__mm.setDamage(0); }")
        page.evaluate(CRASH)
        heavy = dmg(page)["dmg"]
        b.close()
    assert heavy == pytest.approx(light / 8, rel=0.1), (light, heavy)


SEQUENCE = """() => {
  const m = window.__mm;
  m.setDamage(0.95);
  const safe = [...m.damage().safe];
  m.sim(1236.5, -127, Math.PI, 15, 1.6, []);
  const hit = m.damage();
  m.wreckSim(1.5);
  const mid = m.damage(), car = m.car();
  const ground = mid.wheels.map((w) => m.ground(w.x, w.z, w.y));
  const speedAfter = m.sim(1836, -292, 0, 0, 2.5, ['KeyW']).speed;      // gas held on the straight: a wreck does not drive
  m.wreckSim(1.6);                                                     // 3.1 s in all: the new car
  return { safe, hit, speedAfter, mid, car, ground, end: m.damage(), carEnd: m.car() };
}"""


def test_wreck_sequence(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        r = page.evaluate(SEQUENCE)
        b.close()
    assert r["hit"]["wrecked"] and r["hit"]["dmg"] == 1 and r["hit"]["wheelsOff"] == 4, r["hit"]
    assert r["speedAfter"] < 1.0, r["speedAfter"]
    assert r["mid"]["smoke"] > 0, r["mid"]
    for w, ground in zip(r["mid"]["wheels"], r["ground"]):
        assert w["y"] >= ground - 0.01, (w, ground)          # never below the ground
    assert max(abs(w["x"] - r["car"]["x"]) + abs(w["z"] - r["car"]["z"]) for w in r["mid"]["wheels"]) > 2, "the wheels flew off the car"
    assert not r["end"]["wrecked"] and r["end"]["dmg"] == 0 and r["end"]["wheelsOff"] == 0, r["end"]
    assert (r["carEnd"]["x"], r["carEnd"]["z"]) == pytest.approx(tuple(r["safe"][:2]), abs=0.5), (r["carEnd"], r["safe"])
    assert not errors, errors


def test_f_is_ignored_during_a_wreck(server):
    with sync_playwright() as p:
        b, page, _ = open_hand(p, server, start=True)       # F only works once the start screen is gone
        page.evaluate("() => window.__mm.setDamage(1)")
        assert dmg(page)["wrecked"]
        page.keyboard.press("KeyF")
        flying = page.evaluate("() => window.__mm.fly().on")
        b.close()
    assert flying is False


def test_r_ends_a_wreck_at_once(server):
    with sync_playwright() as p:
        b, page, _ = open_hand(p, server)
        page.evaluate("() => window.__mm.setDamage(1)")
        page.keyboard.press("KeyR")
        d = dmg(page)
        b.close()
    assert not d["wrecked"] and d["dmg"] == 0 and d["wheelsOff"] == 0, d


def test_r_without_a_wreck_keeps_the_damage(server):
    with sync_playwright() as p:
        b, page, _ = open_hand(p, server)
        page.evaluate("() => window.__mm.setDamage(0.4)")
        page.keyboard.press("KeyR")
        d = dmg(page)
        b.close()
    assert d["dmg"] == pytest.approx(0.4, abs=0.001), d


def test_changing_the_vehicle_during_a_wreck_ends_it_cleanly(server):
    """The pause menu's Change vehicle rebuilds the car (buildCar): the detached wheels must not be left behind in the scene."""
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        page.evaluate("() => window.__mm.setDamage(1)")
        page.evaluate("() => { const c = window.__mm.vehicles().delorean; window.__mm.setVehicle(c); }")
        d = dmg(page)
        b.close()
    assert not d["wrecked"] and d["wheelsOff"] == 0 and d["dmg"] == 0, d
    assert not errors, errors


def test_the_race_clock_runs_through_a_wreck_and_a_pause_freezes_it(server):
    with sync_playwright() as p:
        b, page, _ = open_hand(p, server, start=True)
        page.keyboard.down("Space")
        page.wait_for_function("() => window.__mm.pause().state === 'racing' && window.__mm.pause().t > 0.3", timeout=T)
        page.evaluate("() => window.__mm.setDamage(1)")
        t0 = page.evaluate("() => window.__mm.pause().t")
        wait_frames(page, 10)
        t1 = page.evaluate("() => window.__mm.pause().t")
        assert t1 > t0, (t0, t1)
        assert page.evaluate("() => window.__mm.raceFlags().jumped") is False
        page.keyboard.press("Escape")
        page.keyboard.up("Space")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        w0 = dmg(page)
        wait_frames(page, 10)
        w1 = dmg(page)
        b.close()
    assert w0["t"] == w1["t"] and w0["wheels"] == w1["wheels"], "countdown and wheels freeze while paused"


def test_hud_shows_the_damage(server):
    with sync_playwright() as p:
        b, page, _ = open_hand(p, server)
        page.evaluate("() => window.__mm.setDamage(0.8)")
        wait_frames(page, 3)
        pct = page.text_content("#dmgpct")
        crit = page.evaluate("() => document.querySelector('#dmg').classList.contains('crit')")
        b.close()
    assert "80" in pct, pct
    assert crit


def test_wreck_and_respawn_leave_gpu_memory_flat(server):
    with sync_playwright() as p:
        b, page, _ = open_hand(p, server)
        before = page.evaluate("() => window.__mm.gpu()")
        for _ in range(2):
            page.evaluate("() => { window.__mm.setDamage(1); window.__mm.wreckSim(3.2); }")
        after = page.evaluate("() => window.__mm.gpu()")
        b.close()
    assert after == before, (before, after)
```

- [ ] **Step 2:** Run once to see them fail for the right reason (`window.__mm.setDamage is not a function`): `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 pytest prototype/tests/test_wreck.py -x`, foreground, timeout 600000. Commit the file: `test(game): browser tests for the wreck sequence (#105)`.

---

### Task 5: Wire it into `prototype/index.html`

**Files:** Modify `prototype/index.html`. Every `old` string below was checked to occur exactly once on `main` @ `090402c` (`grep -c -F`); replace exactly that text. Function names are the anchors, not line numbers.

- [ ] **Step 1: HUD markup and CSS.** Replace the damage plate

`<div class="plate"><span data-i18n="damage">Damage</span><div id="dmg"><i></i></div></div>`

with:

```html
      <div class="plate"><span data-i18n="damage">Damage</span> <b id="dmgpct">0%</b><div id="dmg" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-i18n-aria="damage"><i></i></div></div>
```

and directly after the CSS rule starting `#dmg i{display:block;…` add:

```css
#dmg.crit i{background:linear-gradient(90deg,var(--sun),var(--red))}
```

(`--red` exists in `:root`.)

- [ ] **Step 2: Import** on its own line directly after the line `import { impactStrength, crashVoice, crashGate, checkCrash, playCrash } from './impact.js';`:

```js
import { WRECK, impactDamage, landingHurts, isWrecked, wreckTick, detachWheels, stepDebris, smokeAt, smokeEmit } from './wreck.js';
```

- [ ] **Step 3: Vehicle table.** Add the smoke point to both entries of `VEHICLES` and document it:
  - `compact`: replace `mass: 1.0, collision: { shape: 'circle', r: 1.3 },` by `mass: 1.0, engineAt: [1.5, 1.05, 0], collision: { shape: 'circle', r: 1.3 },`
  - `delorean` (rear engine): replace `mass: 1.0, collision: { shape: 'circle', r: 1.2 },` by `mass: 1.0, engineAt: [-1.5, 0.95, 0], collision: { shape: 'circle', r: 1.2 },`
  - Extend the comment line `// mass: only the crash response …` by `; engineAt (#105): where the wreck smokes, model metres (x forward, y up, z right) — a vehicle without it smokes from [collision.r, 1, 0]`.

  Do **not** add it to `checkVehicle`. (The key is `engineAt`, not `engine`: `sound.engine` already exists.)

- [ ] **Step 4: Wheel entries, `drawWheels`, `buildCar`.** The wheels are already registered by `buildWheels` (compact and DeLorean share it). In `buildWheels` replace

`g.userData.wheels.push({ front: x === frontX, steer: w, roll })`

with

`g.userData.wheels.push({ front: x === frontX, steer: w, roll, d: null, home: w.position.clone(), spun: 0 })`

(`d` = the debris state while detached, `home` = the place on the car.) In `drawWheels` replace `function drawWheels() { for (const w of car.userData.wheels ?? []) {` by `function drawWheels() { for (const w of car.userData.wheels ?? []) { if (w.d) continue;` (a detached wheel is moved by `stepWreck`, not steered). In `buildCar` replace `function buildCar() { freeCar();` by `function buildCar() { if (WRECK_S.on) endWreck(); freeCar();` — the pause menu's "Change vehicle" (#189) and the garage rebuild the car mid-game; the wheels must be back on the old car before `freeCar` disposes it. (Cancelling a swap rebuilds again, so a swap during a wreck repairs it; acceptable, the swap already flags the run as not counted.)

- [ ] **Step 5: Wreck state, smoke pool, hit handling.** Directly after the line `const car = new THREE.Group(); scene.add(car);` add the state (it must exist before the first `buildCar`, which runs at `setVehicle(VEHICLES[CHOICE.id]); applyPaint(…)`):

```js
const WRECK_S = { on: false, t: 0, acc: 0 }, NO_INPUT = {};   // #105: a wreck runs from 100 % damage until the new car; NO_INPUT = the keys and touch buttons a wreck ignores
```

and directly above `function resetCar() {` (the `P` object is defined before it) add the rest:

```js
// #105: smoke = a pool of 24 sprites made once (10 puffs/s × 2.4 s ≤ 24), one shared texture, one material each for per-puff opacity
const SMOKE = { pool: [] };
{ const tex = makeTex(64, 64, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }, { alpha: true });
  for (let i = 0; i < WRECK.smokeMax; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x4a4a4a, transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; s.userData = { age: -1, x: 0, y0: 0, z: 0 }; scene.add(s); SMOKE.pool.push(s); } }
function emitPuff() { const s = SMOKE.pool.find(p => p.userData.age < 0); if (!s) return; const [ex, ey, ez] = VEH.engineAt ?? [VEH.collision.r, 1, 0], fx = Math.cos(P.th), fz = Math.sin(P.th); Object.assign(s.userData, { age: 0, x: P.x + VEH.scale * (ex * fx - ez * fz), z: P.z + VEH.scale * (ex * fz + ez * fx), y0: P.y + VEH.scale * ey }); }
function stepSmoke(dt) { for (const s of SMOKE.pool) { const u = s.userData; if (u.age < 0) continue; u.age += dt; const a = smokeAt(u.age); if (!a) { u.age = -1; s.visible = false; continue; } s.position.set(u.x, u.y0 + a.rise, u.z); s.scale.setScalar(a.size); s.material.opacity = a.opacity; s.visible = true; } }
// one hit → damage; strength = impactStrength(closing speed), computed by the caller BEFORE the bounce
function crashHit(strength) { hurt(impactDamage(strength, VEH.mass)); }
function hurt(amount) { if (WRECK_S.on || !(amount > 0)) return; P.dmg = Math.min(1, P.dmg + amount); if (isWrecked(P.dmg)) startWreck(); }
function startWreck() {
  WRECK_S.on = true; WRECK_S.t = 0; WRECK_S.acc = 0; stopAuto('wreck');   // the autopilot (#18) stops; AUTO_TOASTS has no entry for 'wreck', so no toast
  const wheels = car.userData.wheels, states = detachWheels(wheels.map(w => ({ lx: w.steer.position.x, lz: w.steer.position.z, r: VEH.wheelR })), { x: P.x, y: P.y, z: P.z, th: P.th, vx: P.vx, vz: P.vz, scale: VEH.scale });
  wheels.forEach((w, i) => { scene.attach(w.steer); w.d = states[i]; w.spun = 0; w.steer.position.set(w.d.x, w.d.y, w.d.z); });   // attach keeps the world pose and scale
  toast(tr('wrecked'), TOAST_S.event);   // the crash sound already played for the hit that caused this
}
function endWreck() {
  for (const w of car.userData.wheels) { if (!w.d) continue; car.add(w.steer); w.steer.position.copy(w.home); w.steer.rotation.set(0, 0, 0); w.steer.scale.set(1, 1, 1); w.d = null; w.spun = 0; }
  WRECK_S.on = false; P.dmg = 0;
}
function stepWreck(dt) {
  if (WRECK_S.on) {
    for (const w of car.userData.wheels) { w.d = stepDebris(w.d, dt, groundH(w.d.x, w.d.z, w.d.y)); w.steer.position.set(w.d.x, w.d.y, w.d.z); w.steer.rotateZ(w.d.spin - w.spun); w.spun = w.d.spin; }
    const e = smokeEmit(WRECK_S.acc, dt); WRECK_S.acc = e.acc; for (let i = 0; i < e.n; i++) emitPuff();
    const k = wreckTick(WRECK_S.t, dt); WRECK_S.t = k.t;
    if (k.respawn) { resetCar(); toast(tr('newCar'), TOAST_S.event); }
  }
  stepSmoke(dt);
}
```

(`makeTex`, `SFX`, `TOAST_S` and `toast` are defined elsewhere in the file; they are only used at runtime or earlier than this block, so definition order is fine. `scene.attach` keeps the wheel's world position, rotation and the car's scale; `endWreck` resets all three to the car-local values.)

- [ ] **Step 6: `resetCar` ends a wreck.** Replace `function resetCar() { stopAuto('reset');` by `function resetCar() { if (WRECK_S.on) endWreck(); stopAuto('reset');`. `placeOnRoad` (J list, map double-click, the beam double-click #165, helicopter `land`), `startRace`, `toMainMenu` and the `R` key all go through it, so they end a wreck at once; `startRace` still sets `P.dmg = 0` itself. (`placeOnRoad` marks a race as jumped by itself; the wreck's own respawn calls `resetCar` directly and does not.)

- [ ] **Step 7: Helicopter.** Replace `function toggleFly() { if (FLY.on) land(); else takeOff(); }` by `function toggleFly() { if (WRECK_S.on) return; if (FLY.on) land(); else takeOff(); }`.

- [ ] **Step 8: Input lock and coasting in `stepCar`.** Insert as a new line directly before the line starting `const ap = autoInputs(dt), nitro`:

```js
  const dead = WRECK_S.on, inp = dead ? NO_INPUT : keys, tch = dead ? NO_INPUT : touch;   // #105: a wreck ignores the keys and the touch buttons (the autopilot was stopped in startWreck)
```

and in that one `const ap = …` line replace every `keys.` by `inp.` and every `touch.` by `tch.` (`KeyN`, `Space`, `KeyW`, `ArrowUp`, `touch.g`, `KeyS`, `ArrowDown`, `touch.b`, `KeyD`, `ArrowRight`, `touch.r`, `KeyA`, `ArrowLeft`, `touch.l`, `ControlLeft`, `ControlRight`, `touch.h`). `P.gas` is then 0 on a wreck. For the extra drag replace

`vf -= vf * (wet ? UW.drag : 0.12) * dt + Math.sign(vf) * 0.6 * dt;`

with

`vf -= vf * ((wet ? UW.drag : 0.12) + (dead ? WRECK.coast : 0)) * dt + Math.sign(vf) * 0.6 * dt;`

- [ ] **Step 9: The two damage sites.** In `collide` replace

`P.dmg = Math.min(1, P.dmg + Math.min(0.12, -vn * 0.004 / VEH.mass)); SFX.crash(impactStrength(-vn));`

with

`{ const s = impactStrength(-vn); crashHit(s); SFX.crash(s); }`

(`vn` is the closing speed before the bounce; `keep` and the bounce stay as they are. `spotBlocked` and `__mm.pushAt` call `collide` with the speed zeroed, so `vn < 0` never holds there and they cannot hurt.) In `stepCar`'s landing replace

`if (P.vy < -9) { P.dmg = Math.min(1, P.dmg + 0.05); SFX.crash(impactStrength(-P.vy)); }`

with

`if (landingHurts(P.vy)) { const s = impactStrength(-P.vy); crashHit(s); SFX.crash(s); }`

- [ ] **Step 10: Loop.** In `loop` replace `else stepCar(dt); } stepRace(dt);` by `else stepCar(dt); } stepWreck(dt); stepRace(dt);` and `air: P.air, fly: FLY.on }, dt)` by `air: P.air, fly: FLY.on, dead: WRECK_S.on }, dt)` (Task 2: the engine goes silent). `stepWreck` sits after the `if (PAUSE.on) { … return; }` early return, so a pause freezes wheels, smoke and countdown; do not move it above that.

- [ ] **Step 11: HUD.** In `hud()` replace `$('dmg').firstElementChild.style.width = (P.dmg * 100) + '%';` by `showDamage();` and add next to `function hud(dt)`:

```js
const DMG_FMT = new Intl.NumberFormat(navigator.language, { style: 'percent' });
function showDamage() { const pct = Math.round(P.dmg * 100); if (pct === HUD.dmgPct) return; HUD.dmgPct = pct; $('dmg').firstElementChild.style.width = pct + '%'; $('dmg').classList.toggle('crit', pct >= 75); $('dmg').setAttribute('aria-valuenow', String(pct)); $('dmgpct').textContent = DMG_FMT.format(pct / 100); }
```

- [ ] **Step 12: Test hooks** on new lines after the `window.__mm.car = …` line:

```js
window.__mm.damage = () => ({ dmg: P.dmg, wrecked: WRECK_S.on, t: WRECK_S.t, wheelsOff: car.userData.wheels.filter(w => w.d).length, smoke: SMOKE.pool.filter(s => s.visible).length, wheels: car.userData.wheels.map(w => { const p = w.steer.getWorldPosition(new THREE.Vector3()); return { x: p.x, y: p.y, z: p.z }; }), safe: [...P.safe] });   // #105
window.__mm.setDamage = (d) => { if (WRECK_S.on) endWreck(); P.dmg = 0; hurt(d); };
window.__mm.wreckSim = (secs) => { for (let i = 0; i < secs * 60; i++) stepWreck(1 / 60); };
```

- [ ] **Step 13: Run, foreground, timeout 600000, under the memory cap:** `node --test prototype/tests/*.test.mjs` then `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 pytest prototype/tests/test_wreck.py -x`. Both green, nothing else (not the full suite; reviewers/CI cover the rest). If a test fails three times, stop and write up what is wrong instead of bending the test. Check by eye that nothing else in the file still writes `P.dmg` for damage: only `startRace`, `applySurprise` (repair), `raceNow` and the save/restore in `spotBlocked`/`pushAt` should.

- [ ] **Step 14:** Commit: `feat(game): wreck at 100 % damage — wheels fall off, engine smokes, new car (#105)`.

---

### Task 6: Changelog, PR

- [ ] **Step 1:** `CHANGELOG.md`: first line under `## [Unreleased]` / `### Added` (newest first), prefixed with the Swiss local time of writing (`TZ=Europe/Zurich date '+%Y-%m-%d %H:%M'`), in this form:
  `- \`YYYY-MM-DD HH:MM\` **Crashes now hurt for real:** the harder you hit a wall, a house or a lamp post, the more damage the new percentage in the corner shows, and bumping along at walking pace is free. At 100 % the wheels fly off, the engine smokes and the car is dead; three seconds later a new car stands on the last road. The clock keeps running.`
- [ ] **Step 2:** `node --test prototype/tests/*.test.mjs` once more, green. Push the branch, open the PR `feat(vehicles): wreck at 100 % damage (#105)` with `Closes #105`, summary and the test list (`wreck.test.mjs`, `sound.test.mjs`, `strings.test.mjs`, `test_wreck.py`).
- [ ] **Step 3 (after merge, not part of the PR):** add a playtest entry to `test-todo.md` (committed straight to `main`, that file only): hit a wall at 50 km/h seven times; bump a wall slowly; jump the Sprungschanze and land badly; check the wheels roll and rest on the road, the smoke looks right (also with the DeLorean: smoke from the rear), the new car appears after about 3 s, the clock keeps running, Esc during the wreck freezes it, and "Change vehicle" in the pause menu during a wreck leaves no wheels behind.

If you run into blockers, find a solution and update this plan for the future.

# Wreck at 100 % Damage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Damage rises with impact strength and shows in the HUD; at 100 % the wheels fall off, the engine smokes, the car is dead, and after 3 s a new car stands on the last road position. The race clock runs on.

**Architecture:** Two small pure modules, node-tested: `prototype/impact.js` (the single `impactStrength`, shared with #104) and `prototype/wreck.js` (damage per hit, wheel debris physics, smoke curve, countdown). `prototype/index.html` wires them: a `hurt()`/`crashHit()` pair replaces the inline damage lines in `collide` and the landing, `startWreck`/`stepWreck`/`endWreck` detach and animate the wheels (re-parented meshes, no physics engine) and drive a 24-sprite smoke pool, `resetCar` ends a wreck. No new dependency, no build step.

**Tech Stack:** vanilla JS ES modules + three.js in the buildless `prototype/index.html`; `node --test` for the pure modules; pytest + Playwright for the browser (run in the foreground).

**Spec:** `docs/superpowers/specs/2026-10-03-wreck-at-full-damage-design.md`

## Global Constraints

- **Impact strength is defined once**, in `prototype/impact.js` (#104 owns the file). `wreck.js` imports `impactStrength`; never write a second formula.
- **Landing order with #104 (neither is on `main` when this plan is written).** Check `git ls-files prototype/impact.js` first. Present: import from it, do not touch it, skip Task 1. Absent: do Task 1, which creates the file with exactly the lines shown there; #104 adds its functions later. Both edit the same lines in `collide` and in the landing branch of `stepCar`: if `crashVoice`/`SFX.crash(strength)` from #104 is already there, keep its sound call and add only the `crashHit(...)` call next to it.
- Speed-loss maths in `collide` (`keep`, the 1.25 bounce) is **not** touched: `test_table_mass_softens_the_crash` (light 2.074 m/s) must stay green.
- UI text through `tr()`, en and de, Swiss spelling (no `ß`).
- Never `run_in_background` for Playwright; run it in the foreground with a generous timeout. Commit and push the branch before starting a long Playwright run.
- Conventional Commits, branch `feature/105-wreck-at-full-damage`, PR to `main`. `[Unreleased]` changelog entry in player voice.
- Do not change the physics of driving, the speed-loss maths, the pause or helicopter behaviour beyond the lines named below.

## File Structure

| File | Change |
|---|---|
| `prototype/impact.js` | create only if absent (Task 1) |
| `prototype/wreck.js` | create (Task 2) |
| `prototype/tests/impact.test.mjs`, `prototype/tests/wreck.test.mjs` | create |
| `prototype/strings.js` | add `wrecked`, `newCar` (en + de) |
| `prototype/index.html` | HUD markup + CSS, imports, vehicle `engine` field, wheel registry, wreck state, `crashHit`/`hurt`, input lock, smoke pool, `resetCar`, `toggleFly`, loop, hud, test hooks |
| `prototype/tests/test_wreck.py` | create (Playwright) |
| `CHANGELOG.md` | one `[Unreleased] / Added` entry |

---

### Task 1: `impact.js` (skip if the file already exists on `main`)

**Files:** Create `prototype/impact.js`, `prototype/tests/impact.test.mjs`

- [ ] **Step 1: Write the failing test** — `prototype/tests/impact.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CRASH_MIN, CRASH_FULL, impactStrength } from '../impact.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('impactStrength: 0 up to 3 m/s, linear to 1 at 25 m/s, 1 beyond', () => {
  assert.equal(CRASH_MIN, 3); assert.equal(CRASH_FULL, 25);
  assert.equal(impactStrength(0), 0);
  assert.equal(impactStrength(3), 0);
  close(impactStrength(14), 0.5);
  close(impactStrength(25), 1);
  assert.equal(impactStrength(80), 1);
});

test('impactStrength: a negative closing speed (moving away) is 0', () => {
  assert.equal(impactStrength(-5), 0);
});
```

- [ ] **Step 2:** `node --test prototype/tests/impact.test.mjs` → fails (module not found).

- [ ] **Step 3: Create `prototype/impact.js`:**

```js
// #104 / #105: the one definition of impact strength -- pure, no three.js, no DOM. Unit-tested with `node --test prototype/tests/*.test.mjs`.
// This file is owned by #104 (crash sound), which adds crashVoice, crashGate, checkCrash and playCrash. #105 (damage) imports only impactStrength.
// If #105 lands first it creates the file with just these lines, exactly as below; #104 then adds to it.
export const CRASH_MIN = 3, CRASH_FULL = 25;   // m/s of closing speed along the contact normal

// speed = closing speed in m/s (-vn for a wall, -vy for a landing) → 0 below CRASH_MIN, linear to 1 at CRASH_FULL
export const impactStrength = (speed) => Math.min(1, Math.max(0, (speed - CRASH_MIN) / (CRASH_FULL - CRASH_MIN)));
```

- [ ] **Step 4:** the same command → 2 tests pass. Commit: `feat(game): impactStrength, the one definition of how hard a hit was (#105)`.

---

### Task 2: `wreck.js` (damage per hit, wheel debris, smoke, countdown)

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

- [ ] **Step 4:** `node --test prototype/tests/*.test.mjs` → all pass (the two new files: 23 tests; verified when this plan was written).

- [ ] **Step 5:** Commit: `feat(game): wreck rules — damage per hit, wheel debris, smoke curve (#105)`.

---

### Task 3: Strings

**Files:** Modify `prototype/strings.js`

- [ ] **Step 1:** In the `en` table next to `fishes`/`heliOn` add `wrecked: 'Total loss!',` and `newCar: 'New car!',`; in the `de` table `wrecked: 'Totalschaden!',` and `newCar: 'Neues Auto!',`.
- [ ] **Step 2:** `node --test prototype/tests/strings.test.mjs` → pass (equal keys, no `ß`).
- [ ] **Step 3:** Commit: `feat(i18n): strings for the wreck and the new car (#105)`.

---

### Task 4: Browser tests first (Playwright, they fail until Task 5)

**Files:** Create `prototype/tests/test_wreck.py`

Hand-traced layout (world and terrain blocked), like `test_pause.py`: deterministic, no data files. `window.__mm.sim(1236.5, -127, Math.PI, 15, 1.6, [])` drives head-on into the island (the recorded crash of `test_table_mass_softens_the_crash`).

- [ ] **Step 1: Write the tests:**

```python
"""#105: damage rises with impact strength; at 100 % the wheels fall off, the engine smokes, the car is dead and 3 s later a new
car stands on the last road position; the race clock runs on. Hand-traced layout. Slow (Playwright): run in the foreground."""
import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
READY = "() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent"
T = 120000
CRASH = "() => window.__mm.sim(1236.5, -127, Math.PI, 15, 1.6, [])"


def open_page(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 1280, "height": 720}, locale="en-US").new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function(READY, timeout=240000)
    page.click("#startbtn")
    return b, page, errors


def dmg(page):
    return page.evaluate("() => window.__mm.damage()")


def frames(page):
    return page.evaluate("() => window.__mm.pause().frame")


def wait_frames(page, n=5):
    f = frames(page)
    page.wait_for_function(f"() => window.__mm.pause().frame >= {f + n}", timeout=T)


def test_a_hit_costs_damage_by_strength_and_a_scrape_is_free(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.evaluate("() => window.__mm.setDamage(0)")
        page.evaluate(CRASH)
        hard = dmg(page)["dmg"]
        page.evaluate("() => window.__mm.setDamage(0)")
        page.evaluate("() => window.__mm.sim(1236.5, -127, Math.PI, 2.5, 1.6, [])")   # 2.5 m/s: under the 3 m/s threshold
        soft = dmg(page)["dmg"]
        b.close()
    assert 0.03 < hard < 0.2, hard      # a 15 m/s hit is about 16 %, less what the drag took off before the island
    assert soft == 0, soft
    assert not errors, errors


def test_contact_is_charged_once_not_every_frame(server):
    """Pressed against the island at 15 m/s for 1.6 s must cost the same as one hit, not dozens of steps."""
    with sync_playwright() as p:
        b, page, _ = open_page(p, server)
        page.evaluate("() => window.__mm.setDamage(0)")
        page.evaluate("() => window.__mm.sim(1236.5, -127, Math.PI, 15, 0.6, ['KeyW'])")
        short = dmg(page)["dmg"]
        page.evaluate("() => window.__mm.setDamage(0)")
        page.evaluate("() => window.__mm.sim(1236.5, -127, Math.PI, 15, 4, ['KeyW'])")     # holds the gas into the island
        long = dmg(page)["dmg"]
        b.close()
    assert long < 0.5, (short, long)


def test_heavier_vehicle_takes_less(server):
    with sync_playwright() as p:
        b, page, _ = open_page(p, server)
        page.evaluate("() => window.__mm.setDamage(0)")
        page.evaluate(CRASH)
        light = dmg(page)["dmg"]
        page.evaluate("() => { const v = window.__mm.vehicle(); v.mass = 8; window.__mm.setVehicle(v); window.__mm.setDamage(0); }")
        page.evaluate(CRASH)
        heavy = dmg(page)["dmg"]
        b.close()
    assert heavy == pytest.approx(light / 8, rel=0.25), (light, heavy)


def test_wreck_sequence(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.evaluate("() => window.__mm.setDamage(0.95)")
        page.evaluate(CRASH)
        d = dmg(page)
        assert d["wrecked"] and d["dmg"] == 1 and d["wheelsOff"] == 4, d
        page.evaluate("() => window.__mm.wreckSim(1.5)")
        d = dmg(page)
        assert d["smoke"] > 0, d
        for w in d["wheels"]:
            ground = page.evaluate("([x, z, y]) => window.__mm.ground(x, z, y)", [w["x"], w["z"], w["y"]])
            assert w["y"] >= ground - 0.01, (w, ground)
        car = page.evaluate("() => window.__mm.car()")
        assert max(abs(w["x"] - car["x"]) + abs(w["z"] - car["z"]) for w in d["wheels"]) > 2, "the wheels flew off the car"
        page.evaluate("() => window.__mm.wreckSim(1.6)")      # 3.1 s in total: the new car
        d = dmg(page)
        car = page.evaluate("() => window.__mm.car()")
        assert not d["wrecked"] and d["dmg"] == 0 and d["wheelsOff"] == 0, d
        assert (car["x"], car["z"]) == pytest.approx(tuple(d["safe"][:2]), abs=0.5), (car, d["safe"])
        b.close()
    assert not errors, errors


def test_a_wreck_cannot_be_driven_and_f_is_ignored(server):
    with sync_playwright() as p:
        b, page, _ = open_page(p, server)
        page.evaluate("() => window.__mm.setDamage(1)")
        assert dmg(page)["wrecked"]
        speed = page.evaluate("() => window.__mm.sim(1836, -292, 0, 0, 2.5, ['KeyW']).speed")   # gas held for 2.5 s on the straight
        page.keyboard.press("KeyF")
        flying = page.evaluate("() => window.__mm.fly().on")
        b.close()
    assert speed < 1.0, speed
    assert flying is False


def test_r_ends_a_wreck_at_once(server):
    with sync_playwright() as p:
        b, page, _ = open_page(p, server)
        page.evaluate("() => window.__mm.setDamage(1)")
        page.keyboard.press("KeyR")
        d = dmg(page)
        b.close()
    assert not d["wrecked"] and d["dmg"] == 0 and d["wheelsOff"] == 0, d


def test_r_without_a_wreck_keeps_the_damage(server):
    with sync_playwright() as p:
        b, page, _ = open_page(p, server)
        page.evaluate("() => window.__mm.setDamage(0.4)")
        page.keyboard.press("KeyR")
        d = dmg(page)
        b.close()
    assert d["dmg"] == pytest.approx(0.4, abs=0.001), d


def test_the_race_clock_runs_through_a_wreck_and_a_pause_freezes_it(server):
    with sync_playwright() as p:
        b, page, _ = open_page(p, server)
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
        w0 = dmg(page)["t"]
        wait_frames(page, 10)
        w1 = dmg(page)["t"]
        b.close()
    assert w0 == w1, "countdown, wheels and smoke freeze while paused"


def test_hud_shows_the_damage(server):
    with sync_playwright() as p:
        b, page, _ = open_page(p, server)
        page.evaluate("() => window.__mm.setDamage(0.8)")
        wait_frames(page, 3)
        pct = page.inner_text("#dmgpct")
        crit = page.evaluate("() => document.querySelector('#dmg').classList.contains('crit')")
        b.close()
    assert "80" in pct, pct
    assert crit


def test_wreck_and_respawn_leave_gpu_memory_flat(server):
    with sync_playwright() as p:
        b, page, _ = open_page(p, server)
        before = page.evaluate("() => window.__mm.gpu()")
        for _ in range(2):
            page.evaluate("() => window.__mm.setDamage(1)")
            page.evaluate("() => window.__mm.wreckSim(3.2)")
        after = page.evaluate("() => window.__mm.gpu()")
        b.close()
    assert after == before, (before, after)
```

- [ ] **Step 2:** Run them once to see them fail for the right reason (`window.__mm.setDamage is not a function`): `python -m pytest prototype/tests/test_wreck.py -x` in the foreground (timeout 600000). Commit the test file on the branch: `test(game): browser tests for the wreck sequence (#105)`.

---

### Task 5: Wire it into `prototype/index.html`

**Files:** Modify `prototype/index.html`. Line numbers are those of `main` @ `f6d6a6b`; search for the quoted text.

- [ ] **Step 1: HUD markup and CSS.** Replace the damage plate (`<div class="plate"><span data-i18n="damage">Damage</span><div id="dmg"><i></i></div></div>`) with:

```html
      <div class="plate"><span data-i18n="damage">Damage</span> <b id="dmgpct">0%</b><div id="dmg" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-i18n-aria="damage"><i></i></div></div>
```

and after the `#dmg i{…}` rule add:

```css
#dmg.crit i{background:linear-gradient(90deg,var(--sun),#e0322d)}
```

- [ ] **Step 2: Imports** next to the `heli.js` import:

```js
import { impactStrength } from './impact.js';
import { WRECK, impactDamage, landingHurts, isWrecked, wreckTick, detachWheels, stepDebris, smokeAt, smokeEmit } from './wreck.js';
```

- [ ] **Step 3: Vehicle table.** In `VEHICLES.compact` add `engine: [1.5, 1.05, 0],` after `mass`, and extend the comment above the table: `engine: smoke point in model metres (x forward, y up, z right); a vehicle without it smokes from [collision.r, 1, 0]`. Do not add it to `checkVehicle`.

- [ ] **Step 4: Wheel registry.** In `buildCompact`'s wheel loop, after `g.add(w);` add (the contract for every builder, including #6's glTF wheels: register each wheel group here):

```js
(g.userData.wheels ||= []).push({ obj: w, lx: x, lz: s * z, r: v.wheelR, home: w.position.clone(), spun: 0, d: null });
```

In `buildCar`, as the very first statement `if (WRECK_S.on) endWreck();` (wheels back on the car so `freeCar` disposes them), and `car.userData.wheels = [];` right after the `grp.clear()` loop and before `MODELS[VEH.model](car, VEH)`.

- [ ] **Step 5: Wreck state, smoke pool, hit handling.** Directly after the line `const car = new THREE.Group(); scene.add(car);` add the state (it must exist before the first `buildCar`), and after the line `setVehicle(VEH);` add the smoke pool and the functions:

```js
// after `const car = …`
const WRECK_S = { on: false, t: 0, acc: 0 };   // #105: a wreck runs from 100 % damage until the new car

// after `setVehicle(VEH);`
// #105: smoke = a pool of 24 sprites made once (10 puffs/s × 2.4 s ≤ 24), one shared texture, one material each for per-puff opacity
const SMOKE = { pool: [] };
{ const tex = makeTex(64, 64, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }, { alpha: true });
  for (let i = 0; i < WRECK.smokeMax; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x4a4a4a, transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; s.userData = { age: -1, x: 0, y0: 0, z: 0 }; scene.add(s); SMOKE.pool.push(s); } }
function emitPuff() { const s = SMOKE.pool.find(p => p.userData.age < 0); if (!s) return; const [ex, ey, ez] = VEH.engine ?? [VEH.collision.r, 1, 0], fx = Math.cos(P.th), fz = Math.sin(P.th); Object.assign(s.userData, { age: 0, x: P.x + VEH.scale * (ex * fx - ez * fz), z: P.z + VEH.scale * (ex * fz + ez * fx), y0: P.y + VEH.scale * ey }); }
function stepSmoke(dt) { for (const s of SMOKE.pool) { const u = s.userData; if (u.age < 0) continue; u.age += dt; const a = smokeAt(u.age); if (!a) { u.age = -1; s.visible = false; continue; } s.position.set(u.x, u.y0 + a.rise, u.z); s.scale.setScalar(a.size); s.material.opacity = a.opacity; s.visible = true; } }
// one hit → damage; strength = impactStrength(closing speed), computed by the caller BEFORE the bounce. #36 (footprint collision) and #104 (sound) both call/extend this
function crashHit(strength) { hurt(impactDamage(strength, VEH.mass)); }
function hurt(amount) { if (WRECK_S.on || !(amount > 0)) return; P.dmg = Math.min(1, P.dmg + amount); if (isWrecked(P.dmg)) startWreck(); }
function startWreck() {
  WRECK_S.on = true; WRECK_S.t = 0; WRECK_S.acc = 0;
  const wheels = car.userData.wheels, states = detachWheels(wheels, { x: P.x, y: P.y, z: P.z, th: P.th, vx: P.vx, vz: P.vz, scale: VEH.scale });
  wheels.forEach((w, i) => { scene.attach(w.obj); w.d = states[i]; w.spun = 0; w.obj.position.set(w.d.x, w.d.y, w.d.z); });
  SFX.crash(1); toast(tr('wrecked'), TOAST_S.event);
  // #18 (autopilot) hooks here: autopilot.stop(). The input lock in stepCar already keeps a driving autopilot from steering.
}
function endWreck() {
  for (const w of car.userData.wheels) { car.add(w.obj); w.obj.position.copy(w.home); w.obj.rotation.set(0, 0, 0); w.obj.scale.set(1, 1, 1); w.d = null; w.spun = 0; }
  WRECK_S.on = false; P.dmg = 0;
}
function stepWreck(dt) {
  if (WRECK_S.on) {
    for (const w of car.userData.wheels) { w.d = stepDebris(w.d, dt, groundH(w.d.x, w.d.z, w.d.y)); w.obj.position.set(w.d.x, w.d.y, w.d.z); w.obj.rotateZ(w.d.spin - w.spun); w.spun = w.d.spin; }
    const e = smokeEmit(WRECK_S.acc, dt); WRECK_S.acc = e.acc; for (let i = 0; i < e.n; i++) emitPuff();
    const k = wreckTick(WRECK_S.t, dt); WRECK_S.t = k.t;
    if (k.respawn) { resetCar(); toast(tr('newCar'), TOAST_S.event); }
  }
  stepSmoke(dt);
}
```

(`SFX` and `TOAST_S`/`toast` are defined later in the file; they are only called at runtime, not at definition.)

- [ ] **Step 6: `resetCar` ends a wreck.** Make `if (WRECK_S.on) endWreck();` the first statement of `resetCar()`. `placeOnRoad`, `land`, `startRace`, `toMainMenu` and the `R` key all go through it, so they end a wreck at once; `startRace` still sets `P.dmg = 0` itself.

- [ ] **Step 7: Helicopter.** First statement of `toggleFly()`: `if (WRECK_S.on) return;`.

- [ ] **Step 8: Input lock and coasting in `stepCar`.** Add before the `const nitro = …` line: `const NONE = {}, inp = WRECK_S.on ? NONE : keys, tch = WRECK_S.on ? NONE : touch;` and in that one `const` line (nitro, gas, brake, steer, hb) replace `keys.` by `inp.` and `touch.` by `tch.`. In the `!air` branch, in the statement `vf -= vf * 0.12 * dt + …` add the term `+ (WRECK_S.on ? vf * WRECK.coast * dt : 0)` inside the subtracted expression. `P.gas` is then 0 on a wreck.

- [ ] **Step 9: The two damage sites.** In `collide`, replace

`P.dmg = Math.min(1, P.dmg + Math.min(0.12, -vn * 0.004 / VEH.mass));` with `crashHit(impactStrength(-vn));`

(`vn` is the closing speed before the bounce; leave `keep`, the bounce and the existing `SFX.crash` line as they are, or #104's `SFX.crash(strength)` if it is already there). In `stepCar`'s landing, replace `if (P.vy < -9) { P.dmg = Math.min(1, P.dmg + 0.05); SFX.crash(0.5); }` with `if (landingHurts(P.vy)) { crashHit(impactStrength(-P.vy)); SFX.crash(0.5); }` (keep #104's `SFX.crash(impactStrength(-P.vy))` instead of `0.5` if it is there).

- [ ] **Step 10: Loop.** In `loop`, insert `stepWreck(dt);` right before `stepRace(dt);` and change `if (FLY.on) SFX.silent();` to `if (FLY.on || WRECK_S.on) SFX.silent();`. It sits in the unpaused branch, so a pause freezes the wreck; do not move it above the `PAUSE.on` early return.

- [ ] **Step 11: HUD.** In `hud()` replace `$('dmg').firstElementChild.style.width = (P.dmg * 100) + '%';` by `showDamage();` and add next to `hud`:

```js
const DMG_FMT = new Intl.NumberFormat(navigator.language, { style: 'percent' });
function showDamage() { const pct = Math.round(P.dmg * 100); if (pct === HUD.dmgPct) return; HUD.dmgPct = pct; $('dmg').firstElementChild.style.width = pct + '%'; $('dmg').classList.toggle('crit', pct >= 75); $('dmg').setAttribute('aria-valuenow', String(pct)); $('dmgpct').textContent = DMG_FMT.format(pct / 100); }
```

- [ ] **Step 12: Test hooks** beside the other `window.__mm.*` lines (after `__mm.car`):

```js
window.__mm.damage = () => ({ dmg: P.dmg, wrecked: WRECK_S.on, t: WRECK_S.t, wheelsOff: car.userData.wheels.filter(w => w.obj.parent !== car).length, smoke: SMOKE.pool.filter(s => s.visible).length, wheels: car.userData.wheels.map(w => { const p = w.obj.getWorldPosition(new THREE.Vector3()); return { x: p.x, y: p.y, z: p.z }; }), safe: [...P.safe] });
window.__mm.setDamage = (d) => { if (WRECK_S.on) endWreck(); P.dmg = 0; hurt(d); };
window.__mm.wreckSim = (secs) => { for (let i = 0; i < secs * 60; i++) stepWreck(1 / 60); };
```

(`__mm.pause()` with `{ on, frame, state, t }` exists from #83.)

- [ ] **Step 13: Run, foreground, timeout 600000:** `node --test prototype/tests/*.test.mjs` then `python -m pytest prototype/tests/test_wreck.py prototype/tests/test_vehicles.py prototype/tests/test_pause.py prototype/tests/test_heli.py -x`. All green; if a test fails three times, stop and write up what is wrong instead of bending the test.

- [ ] **Step 14:** Commit: `feat(game): wreck at 100 % damage — wheels fall off, engine smokes, new car (#105)`.

---

### Task 6: Changelog, playtest note, full suite

- [ ] **Step 1:** `CHANGELOG.md`, under `## [Unreleased]` / `### Added`:
  `- Crashes now hurt for real: the harder you hit a wall, a house or a lamp post, the more damage the new percentage in the corner shows, and scraping along a wall is free. At 100 % the wheels fly off, the engine smokes and the car is dead; three seconds later a new car stands on the last road. The clock keeps running.`
- [ ] **Step 2:** Full run, foreground: `node --test prototype/tests/*.test.mjs` and the whole `python -m pytest prototype/tests -x` (slow; generous timeout). Everything green.
- [ ] **Step 3:** Push the branch, open the PR `feat(vehicles): wreck at 100 % damage (#105)` with `Closes #105`, summary, test list. After merge add a playtest entry to `test-todo.md` (committed straight to `main`, that file only): hit a wall at 50 km/h seven times; scrape a wall; jump the Sprungschanze and land badly; check the wheels roll and rest on the road, the smoke looks right, the new car appears after about 3 s, the clock keeps running, and Esc during the wreck freezes it.

If you run into blockers, find a solution and update this plan for the future.

# Pontoon Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At a Rhine bank where no bridge is, the HUD says „X · Pontonbrücke bauen". **X** lays a military pontoon bridge straight across the river to the opposite bank (and on to the nearest road there), bay by bay in 3 s; the car drives over it like over any bridge. **X** again takes it back from the far end; a car left without a deck falls into the Rhine and resets as today. At most one bridge at a time (#100).

**Architecture:** A new pure module `prototype/pontoon.js` holds the crossing-line search on the water SDF, the deck profile, the hit test, the build/removal state machine and the per-bay frames for rendering and for #101's obstacles, unit-tested with `node --test`. `prototype/index.html` keeps the glue: a `PONTOON = { deck, error, group }` state declared before `onBridge`, a one-line pontoon guard at the top of `onBridge` and a `pontoon` branch in `groundH`, the world adapters (`pontoonEnv`), the X handler, `stepPontoonWorld` in the loop's step block, the `#prompt` HUD line, the race flag `R.pontoon`, a `THREE.Group` of bay meshes, the minimap line and the `__mm.pontoon*` hooks. Strings via `tr()` (#9).

**Tech Stack:** vanilla JS + three.js in the buildless `prototype/index.html`, `node --test` for pure modules, pytest + Playwright for the browser.

**Spec:** `docs/superpowers/specs/2026-10-03-pontoon-bridge-design.md`

## Global Constraints

- Key: **X** only (`e.code === 'KeyX'`). Do not touch any other key. X does nothing on the start/result screen (`!$('overlay').hidden` is required), while `FLY.on`, or while paused (the pause guard already swallows it).
- The pontoon deck is **never** added to `OSM_BRIDGES`, `BRIDGE_GRID` or `OBB_GRID`. `onBridge` tests `pontoonHit(PONTOON.deck, …)` first; `groundH` returns `pontoonSurfaceAt` for `ob.pontoon`. Do not change `bridgeDeckAt` / `bridgeDeckOffset` / `fillBridgeHeights` / the hero grouping (#78 and #76 own those).
- `PONTOON` must be declared **before** `onBridge` (`index.html:376`): `onBridge` runs during world building (tree placement, `:847`), and a `const` declared later would throw a TDZ `ReferenceError`.
- Rhine only: `nameAt` 2 m inside the water edge must be `'Rhein'`. Hand layout: `nameAt` is `() => 'Rhein'`, water level 0.
- A car on a bay that is not drivable (not yet laid, or already taken) gets **no** special handling: the existing water code in `stepCar` (`index.html:1083`) does the splash and the reset.
- A race driven over the deck is **not counted** (`R.pontoon`, like `jumped` / `flown`).
- Strings go through `tr()`; `prototype/strings.js` gets the same keys in `en` and `de` (`strings.test.mjs` enforces parity; Swiss spelling, no `ß`).
- `prototype/index.html`: dense one-line style (long single-line statements, short `//` comments); match the surrounding code, do not reformat neighbours. No framework, no bundler, no `package.json`, no new dependency. New code must **not** call `rr()` or `rnd()`.
- Do not touch `data/` or `pipeline/`. Existing tests stay unchanged and green.
- Commands (repo root): node tests `node --test prototype/tests/*.test.mjs`. Playwright: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_pontoon.py -q`. Slow (minutes). Run them in the **foreground only, never `run_in_background`**. Exit 137 means the memory cap was hit: stop and report. Without `systemd-run --user` (CI runner), run the same command without the prefix. One-time setup if the venv is missing: `cd pipeline && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m playwright install chromium`.
- **Headless renderer:** under 1 fps, `dt` clamped to 0.05 s. Browser tests drive the simulation through `__mm.sim` / `__mm.pontoonSim` and **poll end states** with `page.wait_for_function(…, timeout=120000)`; never a fixed `wait_for_timeout` for game state.
- Commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Push the branch **before** the long Playwright runs.
- **Landing order with #78 / #76:** both edit `onBridge` too. If one of them is on `main` when you start, rebase first and keep the pontoon guard as the **first** statement of `onBridge`. If neither is, nothing changes here; the later PR rebases over this one-liner.

## Review Focus

- **TDZ:** `PONTOON` above `onBridge`; the page must load with an empty console (`test_smoke.py` pins it).
- **No end plateau:** `pontoonHit` rejects `t < 0` and `t > drivableLength` — unlike `onBridge`'s `nearestOnPolyline` clamp. Pinned by the unit tests.
- **Water adapter:** `waterLevel` must be `(L && REAL ? WATER.levelAt(x, z) : 0) ?? 0`, the same expression `waterLevelAt` uses, or the deck floats at the wrong height on the procedural terrain.
- **Local frame of the bay meshes:** `rotation.y = -rot` (like `box()`), local +x along the deck, local +z = (−uz, ux) across it. A mirrored sign puts the trestle legs on the wrong side; the screenshot step catches it.
- **Removal under the car:** `test_x_again_removes_the_bridge_and_drops_a_car_on_it` must end with `__mm.car().water` not `None`.

---

## File map

- Create: `prototype/pontoon.js`, `prototype/tests/pontoon.test.mjs`, `prototype/tests/test_pontoon.py`, `design/screenshots/2026-10-pontoon-bridge-sisseln.png` (Task 6).
- Modify `prototype/strings.js`: nine keys in `en` (after `keyHelp`, ~L104) and `de` (~L216).
- Modify `prototype/tests/strings.test.mjs`: one new test at the end.
- Modify `prototype/index.html`:
  - CSS after the `#roadname` rule (L33)
  - `<div id="prompt"></div>` after `#roadname` (L110); F1 help `<kbd>X</kbd>` line after the F line (L132)
  - import after the `heli.js` import (L244)
  - `PONTOON` state + `onBridge` guard (L376-379); `groundH` (L449-450)
  - pontoon glue after `land()` (~L1022); `__mm.raceFlags` (L1043)
  - `keydown` listener (L973); `startRace` / `finish` / `resultHtml` (L1119-1124); `stepRace` (L1122)
  - `hud()` 250 ms block (L1240); `drawMap` (L1208); `loop` (L1246)
- Modify: `CHANGELOG.md`, `test-todo.md`.

Line numbers are from `main` @ `3f62059`. Verify with `grep -n` before editing; parallel PRs (#78, #76, #18, #105) may shift them.

---

### Task 0: Preconditions

- [ ] **Step 1:** From the repo root: `git fetch origin && git rebase origin/main` is **not** allowed as a chain here — run `git fetch origin`, then `git rebase origin/main`. Then `grep -c KeyX prototype/index.html` → must print `0`. If not, stop: another PR took X; report.
- [ ] **Step 2:** `grep -n "function onBridge" prototype/index.html` and read the function. Note whether #78's `pastEnd` / `approach` or #76's `kind === 'rail'` are present (they change nothing in this plan, only where the guard line goes: always first).
- [ ] **Step 3:** `node --test prototype/tests/*.test.mjs` is green before you start.

### Task 1: Pure module `prototype/pontoon.js` (TDD)

**Files:** create `prototype/pontoon.js`, `prototype/tests/pontoon.test.mjs`.

- [ ] **Step 1: Write the failing tests.**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PONTOON_CFG, bankNormal, marchToWater, marchToLand, atRhineBank, crossingLine, pontoonLocal, pontoonSurfaceAt, drivableLength, pontoonHit, stepPontoon, togglePontoon, bayFrames, bayVisible, bayDrop, pontoonHulls, pontoonPrompt } from '../pontoon.js';

// a straight east-west Rhine between z 50 and 150 (water = negative), the car on the south bank (z < 50), a road strip at z 190..196 on the north bank
const river = (x, z) => Math.abs(z - 100) - 50;
const env = (over = {}) => ({ dist: river, nameAt: () => 'Rhein', waterLevel: () => 2, roadAt: (x, z) => z >= 190 && z <= 196, bridgeNear: () => false, ground: () => 2.5, ...over });
const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);

test('PONTOON_CFG: the agreed numbers', () => {
  assert.equal(PONTOON_CFG.reach, 30); assert.equal(PONTOON_CFG.maxWidth, 400); assert.equal(PONTOON_CFG.roadReach, 80); assert.equal(PONTOON_CFG.apron, 6);
  assert.equal(PONTOON_CFG.hw, 2.2); assert.equal(PONTOON_CFG.deckAbove, 0.9); assert.equal(PONTOON_CFG.maxGrade, 0.15); assert.equal(PONTOON_CFG.bay, 6);
  assert.equal(PONTOON_CFG.buildSecs, 3); assert.equal(PONTOON_CFG.bridgeClear, 25);
});

test('bankNormal points towards the water and is null on flat ground', () => {
  const n = bankNormal(river, 0, 25); close(n[0], 0, 1e-9); close(n[1], 1, 1e-9);
  const s = bankNormal(river, 0, 175); close(s[1], -1, 1e-9);
  assert.equal(bankNormal(() => 10, 0, 0), null);
});

test('marchToWater / marchToLand find the edges to 0.1 m, null when out of range', () => {
  close(marchToWater(river, 0, 25, [0, 1], 0, 30), 25, 0.1);
  assert.equal(marchToWater(river, 0, 25, [0, 1], 0, 20), null);
  close(marchToLand(river, 0, 25, [0, 1], 26, 400), 125, 0.1);
  assert.equal(marchToLand(river, 0, 25, [0, 1], 26, 100), null);
});

test('atRhineBank: on land within reach of water named Rhein, else false', () => {
  assert.equal(atRhineBank(env(), 0, 25), true);
  assert.equal(atRhineBank(env(), 0, -20), false);                       // 70 m from the water
  assert.equal(atRhineBank(env(), 0, 100), false);                       // in the water
  assert.equal(atRhineBank(env({ nameAt: () => 'Sissle' }), 0, 25), false);
  assert.equal(atRhineBank(env({ dist: () => 10 }), 0, 25), false);      // flat: no bank direction
});

test('crossingLine: perpendicular from 6 m inland to the first road on the far bank', () => {
  const d = crossingLine(env(), 0, 25);
  assert.equal(d.error, undefined);
  close(d.a[0], 0, 0.2); close(d.a[1], 44, 0.2);        // water edge at 50, apron 6 m back
  close(d.b[0], 0, 0.2); close(d.b[1], 190, 0.2);       // first road sample at z 190
  close(d.len, 146, 0.4); close(d.ux, 0, 1e-9); close(d.uz, 1, 1e-9);
  assert.equal(d.hw, 2.2); close(d.deckH, 2.9, 1e-9); assert.equal(d.hNear, 2.5); assert.equal(d.hFar, 2.5);
  assert.equal(d.rampNear, 6); assert.equal(d.rampFar, 6);              // 0.4 m / 0.15 = 2.7 m, floored at minRamp
  assert.equal(d.nBays, 25); assert.equal(d.built, 0); assert.equal(d.dir, 1);
});

test('crossingLine: no road within roadReach ends 6 m onto the far bank', () => {
  const d = crossingLine(env({ roadAt: () => false }), 0, 25);
  close(d.b[1], 156, 0.3); close(d.len, 112, 0.5);
});

test('crossingLine: the sweep finds a far road the perpendicular misses', () => {
  const d = crossingLine(env({ roadAt: (x, z) => x > 40 && z >= 190 && z <= 196 }), 0, 25);
  assert.equal(d.error, undefined);
  assert.ok(d.b[0] > 40 && d.b[0] < 50, `b.x ${d.b[0]}`);             // -15 deg: x = 171 * sin 15 = 44
  assert.ok(d.uz > 0.9);
});

test('crossingLine refusals: noBank, noFarBank, hasBridge', () => {
  assert.equal(crossingLine(env(), 0, -20).error, 'noBank');
  assert.equal(crossingLine(env(), 0, 100).error, 'noBank');
  assert.equal(crossingLine(env({ nameAt: () => '' }), 0, 25).error, 'noBank');
  assert.equal(crossingLine(env({ dist: (x, z) => Math.abs(z - 300) - 250 }), 0, 25).error, 'noFarBank');   // 500 m wide
  assert.equal(crossingLine(env({ bridgeNear: (x, z) => Math.abs(z - 100) < 5 }), 0, 25).error, 'hasBridge');
});

test('pontoonSurfaceAt: ramps at 15 %, flat deck, meets the banks exactly', () => {
  const d = { ...crossingLine(env({ ground: (x, z) => z < 100 ? 8 : 2.5 }), 0, 25) };
  assert.equal(d.hNear, 8); close(d.rampNear, 34, 1e-9); assert.equal(d.rampFar, 6);
  assert.equal(pontoonSurfaceAt(d, 0), 8); close(pontoonSurfaceAt(d, 17), 5.45, 1e-9); close(pontoonSurfaceAt(d, 34), 2.9, 1e-9);
  close(pontoonSurfaceAt(d, 73), 2.9, 1e-9); close(pontoonSurfaceAt(d, d.len), 2.5, 1e-9);
  assert.equal(pontoonSurfaceAt(d, -3), 8); close(pontoonSurfaceAt(d, d.len + 3), 2.5, 1e-9);   // clamped, not extrapolated
  for (let t = 0.5; t < d.len; t += 0.5) assert.ok(Math.abs(pontoonSurfaceAt(d, t) - pontoonSurfaceAt(d, t - 0.5)) <= 0.075 + 1e-9, `grade at ${t}`);
});

test('pontoonSurfaceAt: ramps that do not fit are scaled to meet', () => {
  const d = { a: [0, 0], b: [20, 0], len: 20, ux: 1, uz: 0, hw: 2.2, deckH: 2.9, hNear: 12, hFar: 12, rampNear: 10, rampFar: 10, nBays: 4, built: 1, dir: 1 };
  assert.equal(pontoonSurfaceAt(d, 0), 12); close(pontoonSurfaceAt(d, 10), 2.9, 1e-9); assert.equal(pontoonSurfaceAt(d, 20), 12);
  const c = crossingLine(env({ roadAt: () => false, ground: () => 60 }), 0, 25);            // 57 m / 0.15 = 380 m ramps, len 112
  close(c.rampNear + c.rampFar, c.len, 1e-9); close(c.rampNear, c.len / 2, 1e-9);
});

test('pontoonHit: within width and built length, respects the 1.5 m height rule, no plateau past the ends', () => {
  const d = { ...crossingLine(env(), 0, 25), built: 1 };
  const h = pontoonHit(d, 0.5, 100); assert.ok(h); assert.equal(h.pontoon, true); assert.equal(h.b, d); close(h.t, 56, 0.3);
  { const [t, s] = pontoonLocal(d, 0.5, 100); close(t, 56, 0.3); close(s, -0.5, 1e-9); }
  assert.equal(pontoonHit(d, 3, 100), null);                       // 3 m off the axis, hw 2.2
  assert.equal(pontoonHit(d, 0, 40), null);                        // 4 m before the near end
  assert.equal(pontoonHit(d, 0, 195), null);                       // past the far end
  assert.equal(pontoonHit(d, 0, 100, d.deckH - 2), null);          // car 2 m under the deck
  assert.ok(pontoonHit(d, 0, 100, d.deckH - 1));
  assert.ok(pontoonHit(d, 0, 100, undefined));
  assert.equal(pontoonHit(null, 0, 100), null);
  const half = { ...d, built: 0.5 };                               // 12.5 bays -> 12 whole bays = 72 m
  assert.equal(drivableLength(half), 72);
  assert.ok(pontoonHit(half, 0, 44 + 70)); assert.equal(pontoonHit(half, 0, 44 + 74), null);
  assert.equal(drivableLength(d), d.len);
});

test('stepPontoon builds in 3 s, togglePontoon reverses, a removal ends with null', () => {
  let d = crossingLine(env(), 0, 25);
  for (let i = 0; i < 90; i++) d = stepPontoon(d, 1 / 60);
  close(d.built, 0.5, 1e-6);
  for (let i = 0; i < 90; i++) d = stepPontoon(d, 1 / 60);
  close(d.built, 1, 1e-6);                                         // 180 float steps may stop a hair short of 1
  d = stepPontoon(d, 1); assert.equal(d.built, 1);                 // clamped, stays complete
  d = togglePontoon(d); assert.equal(d.dir, -1);
  for (let i = 0; i < 179; i++) d = stepPontoon(d, 1 / 60);
  assert.ok(d && d.built > 0);
  d = stepPontoon(d, 1); assert.equal(d, null);                    // the last step clamps to 0 and the deck is gone
  assert.equal(stepPontoon(null, 1), null);
});

test('bayFrames, bayVisible, bayDrop: 25 bays, ramps on legs, floating in between, the newest bay drops in', () => {
  const d = { ...crossingLine(env(), 0, 25), built: 0.5 };
  const f = bayFrames(d); assert.equal(f.length, 25);
  assert.equal(f[0].floating, false); assert.equal(f[24].floating, false); assert.equal(f[12].floating, true);
  close(f[0].t0, 0, 1e-9); close(f[0].t1, 6, 1e-9); close(f[12].x, 0, 0.2); close(f[12].z, 44 + 75, 0.3);
  assert.equal(bayVisible(d, 12), true); assert.equal(bayVisible(d, 13), false);   // 12.5 bays: bay 12 is dropping in
  close(bayDrop(d, 12), 1.5 * (1 - 0.5 * 3 / 25 / 0.4), 1e-9);                      // laid 0.06 s ago
  assert.equal(bayDrop(d, 0), 0); assert.equal(bayDrop(d, 13), 1.5);
  assert.equal(bayDrop({ ...d, dir: -1 }, 12), 0);                                   // nothing drops while removing
  assert.equal(bayVisible({ ...d, built: 1 }, 24), true);
});

test('pontoonHulls: one box per laid floating bay, along x across, water-relative heights (#101)', () => {
  const d = { ...crossingLine(env(), 0, 25), built: 1 };
  const hulls = pontoonHulls(d); assert.equal(hulls.length, 22);   // bays 1..22: bay 0 starts on the near ramp, bays 23 and 24 end on the far one (len 146, ramps 6 m)
  const h = hulls[0]; assert.equal(h.hw, 0.9); assert.equal(h.hd, 4.0); close(h.c, 0, 1e-9); close(h.s, 1, 1e-9); close(h.y0, 1.4, 1e-9); close(h.y1, 2.5, 1e-9);
  assert.equal(pontoonHulls({ ...d, built: 0.5 }).length, 11);                      // 12 bays laid, bay 0 is a ramp
});

test('pontoonPrompt', () => {
  assert.equal(pontoonPrompt(null, false), null); assert.equal(pontoonPrompt(null, true), 'build'); assert.equal(pontoonPrompt({}, true), 'remove'); assert.equal(pontoonPrompt({}, false), 'remove');
});
```

- [ ] **Step 2:** `node --test prototype/tests/pontoon.test.mjs` → fails (module missing).

- [ ] **Step 3: Write `prototype/pontoon.js`.**

```js
// #100: pontoon bridge -- pure rules and geometry (no DOM, no three.js). Unit-tested with `node --test prototype/tests/*.test.mjs`.
// Frame as the car: x east, z south, metres. The deck runs from a (near bank, inland) to b (far bank, on the road) along (ux, uz).
// env = { dist(x, z), nameAt(x, z), waterLevel(x, z), roadAt(x, z), bridgeNear(x, z), ground(x, z) }: the world's adapters, so tests use a synthetic river.
import { bridgeAccepts } from './world.js';

export const PONTOON_CFG = { reach: 30, maxWidth: 400, roadReach: 80, apron: 6, hw: 2.2, deckAbove: 0.9, maxGrade: 0.15, minRamp: 6, maxRamp: 60, bay: 6, buildSecs: 3, bridgeClear: 25, sweepDeg: [0, 5, -5, 10, -10, 15, -15, 20, -20, 25, -25], dropH: 1.5, dropSecs: 0.4, minGrad: 0.2 };

// unit vector towards the water: minus the SDF gradient (central differences over ±h); null where the field is flat (no bank near)
export function bankNormal(dist, x, z, h = 4, cfg = PONTOON_CFG) {
  const gx = (dist(x + h, z) - dist(x - h, z)) / (2 * h), gz = (dist(x, z + h) - dist(x, z - h)) / (2 * h), g = Math.hypot(gx, gz);
  return g < cfg.minGrad ? null : [-gx / g, -gz / g];
}

// distance t along u from (x, z), starting at t0 and up to max, to the first point that is water (dist < 0) / land (dist >= 0): 1 m steps, bisected to 0.1 m; null if none
export function marchToWater(dist, x, z, u, t0, max) { return march(dist, x, z, u, t0, max, v => v < 0); }
export function marchToLand(dist, x, z, u, t0, max) { return march(dist, x, z, u, t0, max, v => v >= 0); }
function march(dist, x, z, u, t0, max, hit) {
  const at = (t) => dist(x + u[0] * t, z + u[1] * t);
  if (hit(at(t0))) return t0;
  let lo = t0;
  for (let t = t0 + 1; t <= max; t += 1) {
    if (hit(at(t))) { let hi = t; while (hi - lo > 0.1) { const m = (lo + hi) / 2; if (hit(at(m))) hi = m; else lo = m; } return hi; }
    lo = t;
  }
  return null;
}

function rotate([ux, uz], deg) { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [ux * c - uz * s, ux * s + uz * c]; }

// the bank: on land, within reach of the water, with a bank direction, and the water there is the Rhine -- returns the normal or null
function bankAt(env, x, z, cfg) {
  const d0 = env.dist(x, z); if (d0 < 0 || d0 > cfg.reach) return null;
  const n = bankNormal(env.dist, x, z, 4, cfg); if (!n) return null;
  const t = marchToWater(env.dist, x, z, n, 0, cfg.reach); if (t === null) return null;
  return env.nameAt(x + n[0] * (t + 2), z + n[1] * (t + 2)) === 'Rhein' ? n : null;
}
export function atRhineBank(env, x, z, cfg = PONTOON_CFG) { return bankAt(env, x, z, cfg) !== null; }

// the crossing from the car at (x, z): perpendicular to the bank, swept ±25°, to the first road on the far bank (else 6 m onto it); the pick reaches a road if any does, shortest first
export function crossingLine(env, x, z, cfg = PONTOON_CFG) {
  const n = bankAt(env, x, z, cfg); if (!n) return { error: 'noBank' };
  let best = null;
  for (const deg of cfg.sweepDeg) {
    const u = rotate(n, deg), tIn = marchToWater(env.dist, x, z, u, 0, cfg.reach + 10); if (tIn === null) continue;
    const tOut = marchToLand(env.dist, x, z, u, tIn + 1, tIn + cfg.maxWidth); if (tOut === null) continue;
    let tEnd = tOut + cfg.apron, road = false;
    for (let t = tOut + cfg.apron; t <= tOut + cfg.roadReach; t += 2) if (env.roadAt(x + u[0] * t, z + u[1] * t)) { tEnd = t; road = true; break; }
    const cand = { u, tIn, tOut, tEnd, road, len: tEnd - (tIn - cfg.apron) };
    if (!best || (cand.road && !best.road) || (cand.road === best.road && cand.len < best.len)) best = cand;
  }
  if (!best) return { error: 'noFarBank' };
  const { u, tIn, tOut, tEnd, len } = best, tA = tIn - cfg.apron, a = [x + u[0] * tA, z + u[1] * tA], b = [x + u[0] * tEnd, z + u[1] * tEnd];
  for (let t = 0; t <= len + 1e-9; t += 10) if (env.bridgeNear(a[0] + u[0] * t, a[1] + u[1] * t)) return { error: 'hasBridge' };
  if (env.bridgeNear(b[0], b[1])) return { error: 'hasBridge' };
  const tMid = (tIn + tOut) / 2, deckH = env.waterLevel(x + u[0] * tMid, z + u[1] * tMid) + cfg.deckAbove, hNear = env.ground(a[0], a[1]), hFar = env.ground(b[0], b[1]);
  const ramp = (h) => Math.max(cfg.minRamp, Math.min(cfg.maxRamp, Math.abs(h - deckH) / cfg.maxGrade));
  let rampNear = ramp(hNear), rampFar = ramp(hFar); const sum = rampNear + rampFar; if (sum > len) { rampNear *= len / sum; rampFar *= len / sum; }
  return { a, b, len, ux: u[0], uz: u[1], hw: cfg.hw, deckH, hNear, hFar, rampNear, rampFar, nBays: Math.ceil(len / cfg.bay), built: 0, dir: 1 };
}

// (t along the deck from a, s to the right of it)
export function pontoonLocal(d, x, z) { const dx = x - d.a[0], dz = z - d.a[1]; return [dx * d.ux + dz * d.uz, -dx * d.uz + dz * d.ux]; }
// surface height at t: linear from hNear up/down to deckH over rampNear, flat, linear to hFar over rampFar; clamped to the ends (no extrapolation)
export function pontoonSurfaceAt(d, t) {
  const u = Math.max(0, Math.min(d.len, t));
  if (u < d.rampNear) return d.hNear + (d.deckH - d.hNear) * (u / d.rampNear);
  if (u > d.len - d.rampFar) return d.hFar + (d.deckH - d.hFar) * ((d.len - u) / d.rampFar);
  return d.deckH;
}
// the car drives only on whole laid bays
export function drivableLength(d, cfg = PONTOON_CFG) { return Math.min(d.len, Math.floor(d.built * d.nBays + 1e-9) * cfg.bay); }
// onBridge's answer for the pontoon: { b, t, pontoon: true } or null; y as in bridgeAccepts (an object 1.5 m under the deck is not on it)
export function pontoonHit(d, x, z, y) {
  if (!d) return null;
  const [t, s] = pontoonLocal(d, x, z);
  if (t < 0 || t > drivableLength(d) || Math.abs(s) > d.hw) return null;
  return bridgeAccepts(pontoonSurfaceAt(d, t), y) ? { b: d, t, pontoon: true } : null;
}

// one fixed step of the build (dir 1) or the removal (dir -1); null once a removal is complete
export function stepPontoon(d, dt, cfg = PONTOON_CFG) {
  if (!d) return null;
  const built = Math.max(0, Math.min(1, d.built + d.dir * dt / cfg.buildSecs));
  return d.dir < 0 && built === 0 ? null : { ...d, built };
}
export function togglePontoon(d) { return { ...d, dir: -d.dir }; }
// the HUD line: 'remove' while a deck exists, 'build' at a bank, else nothing
export function pontoonPrompt(deck, atBank) { return deck ? 'remove' : atBank ? 'build' : null; }

// one frame per bay for the meshes: centre, surface heights at both ends, floating (a hull) or on the ramp (legs)
export function bayFrames(d, cfg = PONTOON_CFG) {
  const out = [];
  for (let i = 0; i < d.nBays; i++) {
    const t0 = i * cfg.bay, t1 = Math.min(d.len, t0 + cfg.bay), tm = (t0 + t1) / 2, y0 = pontoonSurfaceAt(d, t0), y1 = pontoonSurfaceAt(d, t1);
    out.push({ i, t0, t1, x: d.a[0] + d.ux * tm, z: d.a[1] + d.uz * tm, y0, y1, floating: y0 === d.deckH && y1 === d.deckH });
  }
  return out;
}
// bay i shows once the build front has reached it; it is drivable one bay later (drivableLength)
export function bayVisible(d, i) { return d.built * d.nBays > i; }
// how high bay i still hangs over its place: laid dropH high, settled after dropSecs; nothing drops while removing
export function bayDrop(d, i, cfg = PONTOON_CFG) {
  if (d.dir < 0) return 0;
  const since = (d.built * d.nBays - i) * cfg.buildSecs / d.nBays;
  return since < 0 ? cfg.dropH : cfg.dropH * Math.max(0, 1 - since / cfg.dropSecs);
}
// obstacles for #101: one box per laid floating bay, OBB-style (hw along the deck, hd across; c, s = deck direction), y0..y1 absolute
export function pontoonHulls(d, cfg = PONTOON_CFG) {
  const out = [], laid = drivableLength(d, cfg);
  for (const f of bayFrames(d, cfg)) if (f.floating && f.t1 <= laid + 1e-9) out.push({ x: f.x, z: f.z, hw: 0.9, hd: 4.0, c: d.ux, s: d.uz, y0: d.deckH - 1.5, y1: d.deckH - 0.4 });
  return out;
}
```

- [ ] **Step 4:** `node --test prototype/tests/pontoon.test.mjs` → green. If the `-15°` sweep test picks a different angle, print `d.b` and check the geometry before touching the test: `rotate` must turn `[0, 1]` by `-15°` to `[+0.26, 0.97]`.
- [ ] **Step 5:** `node --test prototype/tests/*.test.mjs` → green. Commit: `feat(pontoon): pure crossing line, deck profile and build state (#100)`.

### Task 2: Strings

**Files:** `prototype/strings.js`, `prototype/tests/strings.test.mjs`.

- [ ] **Step 1: Failing test** at the end of `strings.test.mjs`:

```js
test('pontoon bridge texts exist in both languages (#100)', () => {
  assert.equal(translate('en', 'pontoonBuild'), 'X · build a pontoon bridge');
  assert.equal(translate('de', 'pontoonBuild'), 'X · Pontonbrücke bauen');
  assert.equal(translate('en', 'pontoonRemove'), 'X · remove the pontoon bridge');
  assert.equal(translate('de', 'pontoonRemove'), 'X · Pontonbrücke abbauen');
  assert.equal(translate('de', 'pontoonNoBank'), 'Hier ist kein Rheinufer');
  assert.equal(translate('de', 'pontoonHasBridge'), 'Hier gibt es schon eine Brücke');
  assert.equal(translate('de', 'notCountedPontoon'), 'mit Pontonbrücke, zählt nicht · ');
  for (const k of ['pontoonBuilding', 'pontoonRemoving', 'pontoonNoFarBank', 'keyPontoon']) { assert.notEqual(translate('de', k), k, k); assert.notEqual(translate('en', k), k, k); }
});
```

- [ ] **Step 2:** run → fails. **Step 3:** add to `en` after `keyHelp`:

```js
  // ---- pontoon bridge (#100) ----
  pontoonBuild: 'X · build a pontoon bridge',
  pontoonRemove: 'X · remove the pontoon bridge',
  pontoonBuilding: 'Pontoniers at work!',
  pontoonRemoving: 'Pontoon bridge coming down',
  pontoonNoBank: 'No Rhine bank here',
  pontoonNoFarBank: 'No opposite bank within reach',
  pontoonHasBridge: 'There is a bridge here already',
  notCountedPontoon: 'with a pontoon bridge, not counted · ',
  keyPontoon: 'pontoon bridge: build · remove (at the Rhine bank)',
```

and to `de` after its `keyHelp`:

```js
  // ---- Pontonbrücke (#100) ----
  pontoonBuild: 'X · Pontonbrücke bauen',
  pontoonRemove: 'X · Pontonbrücke abbauen',
  pontoonBuilding: 'Pontoniere ans Werk!',
  pontoonRemoving: 'Pontonbrücke wird abgebaut',
  pontoonNoBank: 'Hier ist kein Rheinufer',
  pontoonNoFarBank: 'Kein gegenüberliegendes Ufer in Reichweite',
  pontoonHasBridge: 'Hier gibt es schon eine Brücke',
  notCountedPontoon: 'mit Pontonbrücke, zählt nicht · ',
  keyPontoon: 'Pontonbrücke: bauen · abbauen (am Rheinufer)',
```

- [ ] **Step 4:** `node --test prototype/tests/*.test.mjs` → green (the parity test too). Commit: `feat(i18n): pontoon bridge strings (#100)`.

### Task 3: Failing browser tests `prototype/tests/test_pontoon.py`

**Files:** create `prototype/tests/test_pontoon.py`. OSM world (tracked `data/world_hochrhein.json`), terrain blocked → water level 0, `deckH` 0.9.

- [ ] **Step 1: Write the tests.**

```python
"""#100 pontoon bridge: X at a Rhine bank builds a crossing to the opposite bank in 3 s, X again removes it; one at a time.
OSM world, terrain blocked (water level 0, deckH 0.9). Innermattstrasse (1404.4, -425.5) in Sisseln is 20 m south of the Rhine
(208 m wide there); Murger Weg lies 74 m beyond the north bank. Slow (Playwright): run in the foreground."""
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
BANK = (1404.4, -425.5)            # Innermattstrasse, 20 m from the water, facing north (-z)
NORTH = -math.pi / 2
INLAND = (1882.9, -292.2)          # the Sisseln start, 120+ m from the water
AT_BRIDGE = (-1231.6, 539.7)       # Fridolinsbrücke CH approach (primary_link), 20 m from the water, 4 m from a bridge piece


def open_world(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 1280, "height": 720})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && window.__mm.pontoon && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    assert page.evaluate("() => window.__mm.layout") == "osm"
    page.click("#startbtn")
    return b, page


def place(page, xz, th):
    page.evaluate("([x, z, th]) => window.__mm.place(x, z, th)", [xz[0], xz[1], th])


def pontoon(page):
    return page.evaluate("() => window.__mm.pontoon()")


def pontoon_sim(page, secs):
    return page.evaluate("(s) => window.__mm.pontoonSim(s)", secs)


def car(page):
    return page.evaluate("() => window.__mm.car()")


def ground(page, x, z):
    return page.evaluate("([x, z]) => window.__mm.ground(x, z, 1e4)", [x, z])


def text(page, sel):
    return page.evaluate("(s) => document.querySelector(s).textContent", sel)


def build(page):
    place(page, BANK, NORTH)
    page.keyboard.press("KeyX")
    st = pontoon(page)
    assert st["on"] is True and st["dir"] == 1, st
    return pontoon_sim(page, 3)


@needs_world
def test_prompt_and_x_build_a_bridge_to_the_far_road(server):
    with sync_playwright() as p:
        b, page = open_world(p, server)
        place(page, BANK, NORTH)
        assert pontoon(page)["prompt"] == "build"
        page.wait_for_function("() => /Pontonbrücke bauen|build a pontoon bridge/.test(document.querySelector('#prompt').textContent)", timeout=120000)
        st = build(page)
        assert st["built"] == 1 and st["prompt"] == "remove"
        assert 260 <= st["len"] <= 320, st
        assert st["bOnRoad"] is True                              # Murger Weg
        assert abs(st["deckH"] - 0.9) < 1e-6
        a, bb = st["a"], st["b"]
        mid = ((a["x"] + bb["x"]) / 2, (a["z"] + bb["z"]) / 2)
        assert abs(ground(page, *mid) - st["deckH"]) < 1e-6
        th = math.atan2(bb["z"] - a["z"], bb["x"] - a["x"])
        r1 = page.evaluate("([x, z, th]) => window.__mm.sim(x, z, th, 12, 6, ['KeyW'])", [a["x"], a["z"], th])
        assert r1["bridge"] is True and abs(r1["y"] - st["deckH"]) < 0.5, r1
        assert car(page)["water"] is None
        r2 = page.evaluate("([x, z, th, v]) => window.__mm.sim(x, z, th, v, 12, ['KeyW'])", [r1["x"], r1["z"], th, r1["speed"]])
        assert r2["bridge"] is False and car(page)["water"] is None, r2
        assert math.hypot(r2["x"] - a["x"], r2["z"] - a["z"]) > st["len"]   # across and beyond b
        b.close()


@needs_world
def test_x_again_removes_the_bridge_and_drops_a_car_on_it(server):
    with sync_playwright() as p:
        b, page = open_world(p, server)
        st = build(page)
        a, bb = st["a"], st["b"]
        mid = ((a["x"] + bb["x"]) / 2, (a["z"] + bb["z"]) / 2)
        place(page, mid, NORTH)
        assert car(page)["bridge"] is True
        page.keyboard.press("KeyX")
        assert pontoon(page)["dir"] == -1
        half = pontoon_sim(page, 1.6)
        assert half["on"] is True and 0.4 < half["built"] < 0.6           # the far half is gone, the near half still stands
        assert ground(page, *mid) < 0                                       # river bed under the midpoint again
        gone = pontoon_sim(page, 2)
        assert gone["on"] is False
        page.evaluate("([x, z, th]) => window.__mm.sim(x, z, th, 0, 0.5)", [mid[0], mid[1], NORTH])
        assert car(page)["water"] is not None
        b.close()


@needs_world
def test_x_refuses_away_from_the_rhine_and_next_to_a_bridge(server):
    with sync_playwright() as p:
        b, page = open_world(p, server)
        place(page, INLAND, NORTH)
        assert pontoon(page)["prompt"] is None
        page.keyboard.press("KeyX")
        st = pontoon(page)
        assert st["on"] is False and st["error"] == "noBank"
        page.wait_for_function("() => /Rheinufer|Rhine bank/.test(document.querySelector('#toast').textContent)", timeout=120000)
        place(page, AT_BRIDGE, math.pi)
        page.keyboard.press("KeyX")
        st = pontoon(page)
        assert st["on"] is False and st["error"] == "hasBridge"
        b.close()


@needs_world
def test_a_pontoon_crossing_is_not_counted_and_the_build_freezes_while_paused(server):
    with sync_playwright() as p:
        b, page = open_world(p, server)
        st = build(page)
        a, bb = st["a"], st["b"]
        th = math.atan2(bb["z"] - a["z"], bb["x"] - a["x"])
        page.evaluate("([x, z, th]) => window.__mm.sim(x, z, th, 12, 3, ['KeyW'])", [a["x"], a["z"], th])
        page.wait_for_function("() => window.__mm.raceFlags().pontoon === true", timeout=120000)   # the live loop's stepRace sets it
        page.keyboard.press("KeyX")                                           # start a removal, then pause
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=120000)
        built0 = pontoon(page)["built"]
        f0 = page.evaluate("() => window.__mm.pause().frame")
        page.wait_for_function("(f) => window.__mm.pause().frame >= f + 3", arg=f0, timeout=120000)
        assert pontoon(page)["built"] == built0
        b.close()
```

- [ ] **Step 2:** run the file → fails (`__mm.pontoon` missing, `KeyX` does nothing). Commit: `test(pontoon): browser tests for the pontoon bridge (#100)`.

### Task 4: Glue in `prototype/index.html`

**Files:** `prototype/index.html`.

- [ ] **Step 1: Import** after the `heli.js` import (L244):

```js
import { PONTOON_CFG, atRhineBank, crossingLine, pontoonSurfaceAt, pontoonHit, stepPontoon, togglePontoon, bayFrames, bayVisible, bayDrop, pontoonPrompt } from './pontoon.js';
```

- [ ] **Step 2: State and `onBridge` guard.** Directly above `function onBridge` (L377) add:

```js
// #100: the one runtime pontoon bridge; declared before onBridge, which already runs while the world is built
const PONTOON = { deck: null, error: null, group: null };
```

and make the pontoon test the **first** statement of `onBridge`:

```js
function onBridge(x, z, y) {
  const ph = pontoonHit(PONTOON.deck, x, z, y); if (ph) return ph;
  if (L) { …unchanged… }
```

- [ ] **Step 3: `groundH`** (L450): replace the first line with

```js
  const ob = onBridge(x, z, y); if (ob) return ob.pontoon ? pontoonSurfaceAt(ob.b, ob.t) : ob.osm ? bridgeSurfaceAt(ob.b, ob.t) : bridgeProfile(ob.b, ob.t);
```

- [ ] **Step 4: Markup and CSS.** After `<div id="roadname"></div>` (L110) add `<div id="prompt"></div>`. After the `#roadname` CSS rule (L33) add:

```css
#prompt{font-size:15px;font-weight:700;letter-spacing:2px;color:#d8e8a0;text-shadow:2px 2px 0 var(--ink);min-height:18px}
```

In the F1 help, after the `<kbd>F</kbd>` line (L132) add:

```html
      <kbd>X</kbd><span data-i18n="keyPontoon">pontoon bridge: build · remove (at the Rhine bank)</span>
```

- [ ] **Step 5: Glue** after `function land() …` (~L1022):

```js
// #100: pontoon bridge (X). Rules in pontoon.js; here the world adapters, the key, the step and the hooks (meshes: buildPontoonMeshes below)
const pontoonEnv = () => ({ dist: riverDist, nameAt: L ? (x, z) => WATER.nameAt(x, z) : () => 'Rhein', waterLevel: (x, z) => (L && REAL ? WATER.levelAt(x, z) : 0) ?? 0, roadAt: (x, z) => roadDist(x, z) <= 0, bridgeNear: L ? (x, z) => [...gridQuery(BRIDGE_GRID, x, z, PONTOON_CFG.bridgeClear)].some(b => b.kind !== 'rail' && nearestOnPolyline(b.r.pts, x, z).d <= PONTOON_CFG.bridgeClear) : (x, z) => BRIDGES.some(b => segDist(x, z, ...b.a, ...b.b) <= PONTOON_CFG.bridgeClear), ground: (x, z) => groundH(x, z, 1e4) });
const PONTOON_ERR = { noBank: 'pontoonNoBank', noFarBank: 'pontoonNoFarBank', hasBridge: 'pontoonHasBridge' };
function pressPontoon() { if (!$('overlay').hidden || FLY.on) return; if (PONTOON.deck) { PONTOON.deck = togglePontoon(PONTOON.deck); toast(tr(PONTOON.deck.dir > 0 ? 'pontoonBuilding' : 'pontoonRemoving'), TOAST_S.event); return; } const line = crossingLine(pontoonEnv(), P.x, P.z); if (line.error) { PONTOON.error = line.error; toast(tr(PONTOON_ERR[line.error])); return; } PONTOON.error = null; PONTOON.deck = line; buildPontoonMeshes(line); toast(tr('pontoonBuilding'), TOAST_S.event); }
function stepPontoonWorld(dt) { if (!PONTOON.deck) return; PONTOON.deck = stepPontoon(PONTOON.deck, dt); if (!PONTOON.deck) { freePontoon(); return; } updatePontoonMeshes(PONTOON.deck); }
window.__mm.pontoon = () => { const d = PONTOON.deck, prompt = pontoonPrompt(d, !FLY.on && atRhineBank(pontoonEnv(), P.x, P.z)); return d ? { on: true, built: d.built, dir: d.dir, len: d.len, a: { x: d.a[0], z: d.a[1] }, b: { x: d.b[0], z: d.b[1] }, bOnRoad: roadDist(d.b[0], d.b[1]) <= 0, deckH: d.deckH, nBays: d.nBays, prompt, error: PONTOON.error } : { on: false, prompt, error: PONTOON.error }; };
window.__mm.pontoonSim = (secs) => { for (let i = 0; i < secs * 60; i++) stepPontoonWorld(1 / 60); return window.__mm.pontoon(); };
window.__mm.pressPontoon = () => pressPontoon();
```

- [ ] **Step 6: Key.** In the `keydown` listener (L973) add, next to `if (e.code === 'KeyF' …)`: `if (e.code === 'KeyX') pressPontoon();`
- [ ] **Step 7: Loop.** In `loop` (L1246) insert `stepPontoonWorld(dt);` right after `stepRace(dt);` (inside the unpaused branch, so it freezes with the pause).
- [ ] **Step 8: HUD.** In `hud()`'s 250 ms block (L1240), after `$('roadname').textContent = HUD.road;` add: `{ const pp = pontoonPrompt(PONTOON.deck, !FLY.on && atRhineBank(pontoonEnv(), P.x, P.z)); $('prompt').textContent = pp ? tr(pp === 'build' ? 'pontoonBuild' : 'pontoonRemove') : ''; }`
- [ ] **Step 9: Race.** `startRace` (L1119): add `R.pontoon = false;` next to `R.flown = false;`. `stepRace` (L1122): after the Holzbrücke check that already has `const ob = onBridge(P.x, P.z, P.y);` add `if (ob && ob.pontoon) R.pontoon = true;` (inside the same `(racing || armed) && !FLY.on` block). `finish` (L1123): `if (!R.jumped && !R.flown && !R.pontoon && (R.best === null || t < R.best))`. `resultHtml` (L1124): after `${R.flown ? tr('notCountedHeli') : ''}` add `${R.pontoon ? tr('notCountedPontoon') : ''}`. `__mm.raceFlags` (L1043): `({ jumped: !!R.jumped, flown: !!R.flown, pontoon: !!R.pontoon })`.
- [ ] **Step 10:** Temporarily add stubs `function buildPontoonMeshes() {} function updatePontoonMeshes() {} function freePontoon() {}` next to the glue so the page runs; Task 5 replaces them. Open the page locally (`python3 -m http.server 8000`) and check an empty console. Commit: `feat(pontoon): X builds and removes a pontoon bridge across the Rhine (#100)`.

### Task 5: Meshes and the minimap line

**Files:** `prototype/index.html`.

- [ ] **Step 1:** Replace the three stubs with:

```js
// pontoon look: olive-grey deck slabs, drab hulls under the floating bays, trestle legs under the ramp bays, posts and a rail bar. Own materials, like the helicopter: not part of the merged MESH roles
const PONTOON_MAT = { deck: new THREE.MeshLambertMaterial({ color: 0x6e6a50 }), hull: new THREE.MeshLambertMaterial({ color: 0x4b5a3a }), rail: new THREE.MeshLambertMaterial({ color: 0x9a9d86 }) };
const pontoonPart = (w, h, d, x, y, z, mat, tilt = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.z = tilt; m.castShadow = true; return m; };
function buildPontoonMeshes(d) {
  freePontoon(); const g = new THREE.Group(), rot = Math.atan2(d.uz, d.ux);
  for (const f of bayFrames(d)) {   // bay frame: local +x along the deck, +z across it (rotation.y = -rot, as box() does)
    const bay = new THREE.Group(), len = f.t1 - f.t0, ym = (f.y0 + f.y1) / 2, tilt = Math.atan2(f.y1 - f.y0, len); bay.position.set(f.x, 0, f.z); bay.rotation.y = -rot;
    bay.add(pontoonPart(len, 0.3, d.hw * 2, 0, ym - 0.15, 0, PONTOON_MAT.deck, tilt));
    for (const s of [-1, 1]) { bay.add(pontoonPart(0.1, 0.9, 0.1, -len / 2 + 0.3, ym + 0.45, s * (d.hw + 0.1), PONTOON_MAT.rail)); bay.add(pontoonPart(len, 0.08, 0.08, 0, ym + 0.9, s * (d.hw + 0.1), PONTOON_MAT.rail, tilt)); }
    if (f.floating) bay.add(pontoonPart(1.8, 1.1, 8.0, 0, d.deckH - 0.95, 0, PONTOON_MAT.hull));   // 0.5 m freeboard over the water, 0.6 m draught
    else for (const s of [-1, 1]) { const gy = terrainH(f.x - d.uz * s * 1.5, f.z + d.ux * s * 1.5), top = ym - 0.3, h = Math.max(0.1, top - gy); bay.add(pontoonPart(0.3, h, 0.3, 0, top - h / 2, s * 1.5, PONTOON_MAT.hull)); }
    bay.visible = false; g.add(bay);
  }
  scene.add(g); PONTOON.group = g; updatePontoonMeshes(d);
}
function updatePontoonMeshes(d) { if (!PONTOON.group) return; PONTOON.group.children.forEach((bay, i) => { bay.visible = bayVisible(d, i); bay.position.y = bayDrop(d, i); }); }
function freePontoon() { if (!PONTOON.group) return; PONTOON.group.traverse(o => o.geometry?.dispose()); scene.remove(PONTOON.group); PONTOON.group = null; }
```

The materials are shared and never disposed. `applyStyle` does not touch them (same as the helicopter).

- [ ] **Step 2: Minimap.** In `drawMap` (L1208), right after the static map is drawn and before the checkpoints, add:

```js
  if (PONTOON.deck) { const d = PONTOON.deck, A = mapPt(v, d.a[0], d.a[1]), B = mapPt(v, d.b[0], d.b[1]); mg.lineCap = 'round'; mg.beginPath(); mg.moveTo(A[0], A[1]); mg.lineTo(B[0], B[1]); mg.strokeStyle = '#1e2414'; mg.lineWidth = 5; mg.stroke(); mg.strokeStyle = '#8a8f5a'; mg.lineWidth = 3; mg.stroke(); }
```

- [ ] **Step 3:** Commit and push the branch: `feat(pontoon): low-poly pontoon bridge meshes and minimap line (#100)`.
- [ ] **Step 4:** Run `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_pontoon.py -q` in the foreground. All four green. If `test_prompt_and_x_build…` fails on `len`, print `__mm.pontoon()` and compare with the dry run in the spec (a ≈ 11 m north of the car, b ≈ 299 m) before changing any number.
- [ ] **Step 5:** Run the whole suite: `node --test prototype/tests/*.test.mjs` and `… -m pytest ../prototype/tests -q` (foreground; several minutes). Everything green.

### Task 6: Screenshot for the human, docs, playtest entry

**Files:** `design/screenshots/2026-10-pontoon-bridge-sisseln.png`, `CHANGELOG.md`, `test-todo.md`.

- [ ] **Step 1: Screenshot.** A short Playwright script (not committed; keep it in your scratchpad): open the OSM world like `test_pontoon.py` does **with the terrain allowed** (do not route the `.mmh` to 404), click Start, `__mm.place(1404.4, -425.5, -Math.PI / 2)`, `__mm.pressPontoon()`, `__mm.pontoonSim(3)`, then `__mm.place(a.x, a.z + 4, -Math.PI / 2)` so the chase camera looks up the deck, wait three `requestAnimationFrame`s, `page.screenshot(path=…, full_page=False)`. Commit the PNG under `design/screenshots/`. This is the human's review surface for the look (hulls under the floating bays, legs under the ramps, rails, olive colours); nothing else in this plan checks it.
- [ ] **Step 2: CHANGELOG** under `[Unreleased]` → `Added` (player voice, like the neighbours):

```markdown
- Drive to the bank of the Rhine where there is no bridge and the HUD offers „X · Pontonbrücke bauen". Press **X** and the pontoniers lay a floating bridge straight across to the other bank in three seconds, bay by bay, ending on the nearest road over there. Drive over it; press **X** again and it is taken back from the far end — if you are still on it, you go for a swim. One pontoon bridge at a time, Rhine only. A race driven over it is not counted, like a jump.
```

- [ ] **Step 3: test-todo.md** — new section:

```markdown
## Pontoon bridge (#100)

- [ ] J → Sisseln, drive down the Innermattstrasse to the Rhine. The HUD shows „X · Pontonbrücke bauen"; X lays the bridge across in ~3 s, each bay drops in and settles. Drive over to the Murger Weg.
- [ ] X again from the far bank: the bridge disappears from the far end; standing on it you fall in and come back on the Innermattstrasse.
- [ ] X next to the Fridolinsbrücke or the Holzbrücke: „Hier gibt es schon eine Brücke". X at the Sissle or 100 m from the river: „Hier ist kein Rheinufer".
- [ ] Look: hulls 0.5 m out of the water, legs on the bank ramps, rails, the olive line on the minimap. Screenshot in `design/screenshots/2026-10-pontoon-bridge-sisseln.png`.
```

- [ ] **Step 4:** Commit: `docs(pontoon): changelog, playtest entry and screenshot (#100)`. Push. Open the PR with the template (Summary · Changes · Testing · Checklist), link `Closes #100`, and note the landing order with #78/#76 (one-line rebase in `onBridge`) and that #101 can read `pontoonHulls(PONTOON.deck)`.

# Delivery Mode (pizza to a given address) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A **Delivery** button on the start screen starts a shift of 5 orders (#107). The car stands at a pizzeria; each order names a real house address from the OSM world, runs a countdown, and the Navi (#106) leads there. Stopping within 10 m of the marker in front of the house, slower than 1.5 m/s, hands the pizza over and pays a tip (route length, time left, cargo condition). Crashes damage the cargo through the shared `impactStrength` (#104). A result screen shows the shift total, and the best score is saved in `localStorage`.

**Architecture:** A new pure module `prototype/delivery.js` holds the state machine, the address pool, the order picker, the scoring and the cargo rule (no DOM, no three.js, seeded RNG), tested with `node --test`. `prototype/index.html` adds the glue: the `#deliverybtn`, `R.state = 'delivery'`, the order HUD lines in `#tc`, the drop marker, the Navi calls, the impact hook at the existing crash call sites, the cheat guards, the result screen and the test hooks.

**Tech Stack:** vanilla JS + three.js in the buildless `prototype/index.html`, pure ES modules (`node --test`), Playwright smoke tests with pytest.

**Spec:** `docs/superpowers/specs/2026-10-03-delivery-mode-design.md`

## Global Constraints

- **Blocked by #18 and #106 (and #104 for `impactStrength`).** `prototype/route.js`, `prototype/navi.js` and `prototype/impact.js` must exist on `main` (Task 0). If one is missing, STOP and report "blocked by #<n>"; do not write a second router, a second Navi or a second impact formula.
- Test-Driven Development for every task: write the failing test, watch it fail, implement minimally, verify green. Never edit a test to make it pass. If a test still fails after 3 attempts, STOP and report what is going wrong.
- With no shift running, nothing changes: `test_vehicles.py::test_golden_trace_of_the_compact_car`, the race, the pause menu and every existing test stay green and unchanged. `delivery.js` never reads `window`, `document`, `localStorage` or `Math.random`; the glue passes everything in.
- Impact strength is **only** `impactStrength` from `prototype/impact.js`. Do not compute it from `vn` again.
- No real brand names or logos for the pizzerias: the three invented names of the spec only.
- All new UI text through `tr()`, en and de in `prototype/strings.js` (same keys, Swiss spelling, no `ß`, German impersonal like the existing strings).
- `prototype/index.html`: dense one-line style, short `//` comments; match the surrounding code, do not reformat neighbours. No framework, bundler, `package.json` or new dependency.
- Do not touch `data/` or `pipeline/`. Do not edit `route.js`, `navi.js` or `impact.js` (other issues' modules); if the interface differs from Task 0's expectation, adapt this plan's glue and say so in the PR.
- Commands from the repo root. Node: `node --test prototype/tests/*.test.mjs`. Playwright: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_delivery.py -q`. These runs are slow (minutes, the world file loads per test), so run them in the **foreground only, never `run_in_background`**. Exit 137 = memory cap: stop and report. On a CI runner without `systemd-run --user`, drop the prefix.
- Commit after every task (Conventional Commits, `git add <paths>`, never `-A`). Push the branch **before** the long Playwright runs.

## Review Focus

- The shift never touches the race: `R.best`, `mm.best2`, `R.jumped`, `R.flown`, the checkpoints and `stepRace` behave as before outside `R.state === 'delivery'`.
- Every existing `R.state` comparison was read (`grep -n "R.state" prototype/index.html`) and the `'delivery'` case decided on purpose; `canPause` / `needsAbandonConfirm` accept it.
- J, F, O, the map jump and I are ignored during a shift; R costs 15 s; nothing else changes the keys.
- The countdown never runs while paused or on the start/result screen.
- The best score is read and written inside `try/catch`.

---

## File map

- Create: `prototype/delivery.js`, `prototype/tests/delivery.test.mjs`, `prototype/tests/test_delivery.py`.
- Modify `prototype/pause.js` (+ `prototype/tests/pause.test.mjs`): `canPause` and `needsAbandonConfirm` accept `'delivery'`.
- Modify `prototype/strings.js`: the keys of the spec in `en` and `de`.
- Modify `prototype/index.html`: `#deliverybtn` in the start screen's `.row` (~L200); `#deliv` lines in `#tc` under `#roadname` (~L33); F1 help line; `delivery.js` import (next to the other module imports); shift state + glue next to `R` (~L1111); `startRace` (ends a shift); `renderOverlay` / `resultHtml` (shift result); `keydown` guards for J, F, O, I and the R penalty (~L973); map double-click jump guard; the two `SFX.crash` call sites (`collide`, the landing in `stepCar`); `drawMap` (depot and drop dots); the loop's `R.state` checks; test hooks.
- `CHANGELOG.md`, `test-todo.md`.

Line numbers are from `main` @ `ee94c5e` plus whatever #18 / #104 / #106 added. Check them with `grep -n` before editing.

---

### Task 0: Preconditions

**Files:** none.

- [ ] **Step 1: The dependencies are merged.** `ls prototype/route.js prototype/navi.js prototype/impact.js` must succeed. Any file missing: STOP, report "blocked by #18 / #106 / #104" naming the missing one, do nothing else.

- [ ] **Step 2: Check the interfaces this plan uses.**

```bash
grep -n "export function \(buildGraph\|snapToGraph\|findRoute\)" prototype/route.js
grep -n "export function impactStrength" prototype/impact.js
grep -n "function startNavi\|function stopNavi" prototype/index.html
grep -n "R.state" prototype/index.html
grep -n "SFX.crash" prototype/index.html
grep -c "id=\"deliverybtn\"\|KeyU" prototype/index.html
```

Expected: `snapToGraph(g, x, z, maxDist)` → point or `null`; `findRoute(g, start, goals)` → `{ pts, cum, len, joints }` or `null`; `impactStrength(speed)` → 0..1; `startNavi({ n, x, z })` / `stopNavi(silent)` exist; the `SFX.crash` call sites in `collide` and the landing; last count 0. If a signature differs, adapt the glue (not the pure module).

- [ ] **Step 3: Baseline.** `node --test prototype/tests/*.test.mjs` is green.

---

### Task 1: Pure module `prototype/delivery.js` (test first)

**Files:** Create `prototype/tests/delivery.test.mjs`, then `prototype/delivery.js`.

- [ ] **Step 1: Write the failing test** `prototype/tests/delivery.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { DELIV, DEPOTS, mulberry32, parseHouse, buildAddresses, resolveDepots, timeLimit, orderScore, hitCargo, isHandover, pickOrder, newShift, beginOrder, tick, applyImpact, applyPenalty, finishOrder, isNewBest } from '../delivery.js';

const ROAD = (x, z) => ({ n: 'Bodenackerstrasse', d: 12 });
const BLD = (id, addr, x = 0, z = 0) => ({ id, addr, rect: [x, z, 10, 8, 0] });

test('parseHouse keeps plain numbers and letters, drops ranges and oddities', () => {
  assert.equal(parseHouse('6'), '6');
  assert.equal(parseHouse('36A'), '36A');
  assert.equal(parseHouse(' 6c '), '6c');
  for (const bad of ['6a–6d', '14-18', '65/1', '1.1', '', undefined]) assert.equal(parseHouse(bad), null);
});

test('buildAddresses needs a plain number and a named road within the radius', () => {
  const near = (x, z) => (x === 1 ? { n: '', d: 5 } : x === 2 ? { n: 'Hauptstrasse', d: 90 } : x === 3 ? null : { n: 'Hauptstrasse', d: 20 });
  const out = buildAddresses([BLD(1, '4', 1), BLD(2, '5', 2), BLD(3, '6', 3), BLD(4, '7-9', 4), BLD(5, '12b', 5), { id: 6, addr: '8' }], near);
  assert.deepEqual(out.map(a => a.label), ['Hauptstrasse 12b']);
  assert.deepEqual([out[0].x, out[0].z, out[0].id], [5, 0, 5]);
});

test('resolveDepots puts each depot on the nearest address within the radius and skips unknown landmarks', () => {
  const addrs = [{ label: 'A 1', x: 100, z: 0 }, { label: 'B 2', x: 40, z: 0 }, { label: 'C 3', x: 900, z: 0 }];
  const lms = [{ n: 'Fridolinsmünster', x: 0, z: 0 }, { n: 'Bahnhof Stein-Säckingen', x: 880, z: 0 }];
  const out = resolveDepots(DEPOTS, lms, addrs);
  assert.deepEqual(out.map(d => [d.name, d.label]), [['Pizza Fridolin', 'B 2'], ['Pizza Rheinblick', 'C 3']]);
  assert.equal(resolveDepots(DEPOTS, [{ n: 'Fridolinsmünster', x: 0, z: 0 }], [{ label: 'far', x: 500, z: 0 }]).length, 0);
});

test('timeLimit is grace plus length over the reference speed, never below the minimum', () => {
  assert.equal(timeLimit(1500), 192);
  assert.equal(timeLimit(600), 92);
  assert.equal(timeLimit(100), 45);
});

test('orderScore rewards length and time left, scaled by the cargo', () => {
  assert.deepEqual(orderScore({ len: 1500, left: 30, cargo: 100 }), { base: 150, bonus: 60, tip: 210 });
  assert.equal(orderScore({ len: 1500, left: 30.9, cargo: 50 }).tip, 105);
  assert.equal(orderScore({ len: 1500, left: 0, cargo: 100 }).tip, 150);
});

test('hitCargo loses 40 % at full strength, nothing at 0, never below 0', () => {
  assert.equal(hitCargo(100, 0), 100);
  assert.equal(hitCargo(100, 1), 60);
  assert.equal(hitCargo(100, 0.5), 80);
  assert.equal(hitCargo(30, 1), 0);
});

test('isHandover needs both: close and slow', () => {
  assert.equal(isHandover(9.9, 1.4), true);
  assert.equal(isHandover(10.1, 0.5), false);
  assert.equal(isHandover(3, 5), false);
});

test('pickOrder honours the band, avoids recent addresses, is repeatable for a seed and widens once', () => {
  const addrs = Array.from({ length: 30 }, (_, i) => ({ id: i, label: 'S ' + i, x: i, z: 0 }));
  const len = a => 300 + a.id * 100;   // 300 .. 3200
  const a = pickOrder({ addresses: addrs, rng: mulberry32(7), routeLen: len, recent: [] });
  const b = pickOrder({ addresses: addrs, rng: mulberry32(7), routeLen: len, recent: [] });
  assert.deepEqual(a, b);
  assert.ok(a.len >= DELIV.minRoute && a.len <= DELIV.maxRoute);
  const none = pickOrder({ addresses: addrs, rng: mulberry32(1), routeLen: () => null, recent: [] });
  assert.equal(none, null);
  const wide = pickOrder({ addresses: addrs, rng: mulberry32(1), routeLen: () => 4000, recent: [] });
  assert.equal(wide.len, 4000);
  const recent = addrs.map(x => x.id).slice(0, 29);
  assert.equal(pickOrder({ addresses: addrs, rng: mulberry32(3), routeLen: () => 1000, recent }).addr.id, 29);
});

test('a delivered order pays the tip and moves on; a shift ends after the last order', () => {
  const st = newShift(0);
  beginOrder(st, { label: 'S 1', x: 0, z: 0 }, 1500);
  assert.equal(st.order.left, 192);
  assert.equal(tick(st, 100, 50, 10), null);
  assert.equal(st.order.left, 92);
  assert.equal(tick(st, 1, 4, 0.5), 'delivered');
  assert.equal(st.results[0].tip, 150 + 2 * 91);
  assert.equal(st.score, 332);
  assert.equal(st.idx, 1);
  assert.equal(st.order, null);
  for (let i = 1; i < DELIV.orders; i++) { beginOrder(st, { label: 'S', x: 0, z: 0 }, 1000); finishOrder(st, 'late'); }
  assert.equal(st.phase, 'over');
});

test('running out of time loses the order', () => {
  const st = newShift(0);
  beginOrder(st, { label: 'S', x: 0, z: 0 }, 400);
  assert.equal(tick(st, 1000, 500, 10), 'late');
  assert.equal(st.score, 0);
  assert.equal(st.results[0].outcome, 'late');
});

test('impacts damage the cargo and ruin it at 0; penalties cost time', () => {
  const st = newShift(0);
  beginOrder(st, { label: 'S', x: 0, z: 0 }, 1000);
  assert.equal(applyImpact(st, 0), null);
  assert.equal(st.order.cargo, 100);
  assert.equal(applyImpact(st, 1), null);
  assert.equal(st.order.cargo, 60);
  assert.equal(applyImpact(st, 1), null);
  assert.equal(applyImpact(st, 1), 'ruined');
  assert.equal(st.results[0].outcome, 'ruined');
  beginOrder(st, { label: 'S', x: 0, z: 0 }, 1000);
  const before = st.order.left;
  applyPenalty(st, 15);
  assert.equal(st.order.left, before - 15);
  assert.equal(applyImpact(newShift(0), 1), null);   // no order running: ignored
});

test('isNewBest only counts a positive score above the old best', () => {
  assert.equal(isNewBest(100, 50), true);
  assert.equal(isNewBest(50, 50), false);
  assert.equal(isNewBest(0, 0), false);
});
```

- [ ] **Step 2: Run it, expect failure** (module not found): `node --test prototype/tests/delivery.test.mjs`.

- [ ] **Step 3: Implement** `prototype/delivery.js`:

```js
// #107: pure rules for the delivery mode -- no DOM, no three.js, no Math.random. Unit-tested with `node --test prototype/tests/*.test.mjs`.

export const DELIV = {
  orders: 5, refSpeed: 9, grace: 25, minTime: 45,
  minRoute: 400, maxRoute: 3000, wideMin: 250, wideMax: 5000, tries: 200, recent: 3,
  stopRadius: 10, stopSpeed: 1.5, perMeter: 0.1, perSecond: 2, cargoLoss: 40, resetPenalty: 15,
  nameRadius: 40, depotRadius: 120,
};

// invented names, no real brands; `near` is a landmark name of landmarks.js
export const DEPOTS = [
  { name: 'Pizza Fridolin', near: 'Fridolinsmünster' },
  { name: 'Pizza Rheinblick', near: 'Bahnhof Stein-Säckingen' },
  { name: 'Pizza Sissla', near: 'Gemeindehaus Sisseln' },
];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// '6', '36A', '6c' -> itself; ranges ('6a–6d', '14-18') and oddities ('65/1') -> null
export function parseHouse(addr) {
  const m = /^(\d+)([a-zA-Z]?)$/.exec(String(addr ?? '').trim());
  return m ? m[1] + m[2] : null;
}

// nearestNamedRoad(x, z) -> { n, d } | null (the glue answers from ROAD_GRID)
export function buildAddresses(buildings, nearestNamedRoad) {
  const out = [];
  for (const b of buildings) {
    const no = parseHouse(b.addr);
    if (!no || !b.rect) continue;
    const [x, z] = b.rect;
    const road = nearestNamedRoad(x, z);
    if (!road || !road.n || road.d > DELIV.nameRadius) continue;
    out.push({ id: b.id, street: road.n, no, label: `${road.n} ${no}`, x, z });
  }
  return out;
}

export function resolveDepots(depots, landmarks, addresses) {
  const out = [];
  for (const d of depots) {
    const lm = landmarks.find(l => l.n === d.near);
    if (!lm) continue;
    let best = null, bd = DELIV.depotRadius;
    for (const a of addresses) { const dist = Math.hypot(a.x - lm.x, a.z - lm.z); if (dist <= bd) { bd = dist; best = a; } }
    if (best) out.push({ name: d.name, label: best.label, x: best.x, z: best.z });
  }
  return out;
}

export const timeLimit = len => Math.max(DELIV.minTime, Math.round(DELIV.grace + len / DELIV.refSpeed));

export function orderScore({ len, left, cargo }) {
  const base = Math.round(len * DELIV.perMeter), bonus = DELIV.perSecond * Math.floor(Math.max(0, left));
  return { base, bonus, tip: Math.round((base + bonus) * cargo / 100) };
}

export const hitCargo = (cargo, strength) => Math.max(0, cargo - DELIV.cargoLoss * strength);
export const isHandover = (dist, speed) => dist < DELIV.stopRadius && speed < DELIV.stopSpeed;

// routeLen(addr) -> metres | null (unreachable); a normal band first, one wider band after that
export function pickOrder({ addresses, rng, routeLen, recent }) {
  for (const [lo, hi] of [[DELIV.minRoute, DELIV.maxRoute], [DELIV.wideMin, DELIV.wideMax]]) {
    for (let i = 0; i < DELIV.tries; i++) {
      const addr = addresses[Math.floor(rng() * addresses.length)];
      if (!addr || recent.includes(addr.id)) continue;
      const len = routeLen(addr);
      if (len != null && len >= lo && len <= hi) return { addr, len };
    }
  }
  return null;
}

export function newShift(best) {
  return { phase: 'running', idx: 0, total: DELIV.orders, score: 0, results: [], order: null, best, recent: [] };
}

export function beginOrder(st, addr, len) {
  const limit = timeLimit(len);
  st.order = { label: addr.label, x: addr.x, z: addr.z, id: addr.id, len, limit, left: limit, cargo: 100 };
  if (addr.id != null) st.recent = [...st.recent, addr.id].slice(-DELIV.recent);
}

export function finishOrder(st, outcome) {
  const o = st.order;
  const tip = outcome === 'delivered' ? orderScore({ len: o.len, left: o.left, cargo: o.cargo }).tip : 0;
  st.results.push({ label: o.label, outcome, tip, cargo: o.cargo });
  st.score += tip; st.idx++; st.order = null;
  if (st.idx >= st.total) st.phase = 'over';
}

// -> null | 'delivered' | 'late'; dist = metres to the drop point, speed in m/s
export function tick(st, dt, dist, speed) {
  if (st.phase !== 'running' || !st.order) return null;
  st.order.left = Math.max(0, st.order.left - dt);
  const outcome = isHandover(dist, speed) ? 'delivered' : st.order.left <= 0 ? 'late' : null;
  if (outcome) finishOrder(st, outcome);
  return outcome;
}

export function applyImpact(st, strength) {
  if (st.phase !== 'running' || !st.order || !(strength > 0)) return null;
  st.order.cargo = hitCargo(st.order.cargo, strength);
  if (st.order.cargo > 0) return null;
  finishOrder(st, 'ruined');
  return 'ruined';
}

export function applyPenalty(st, secs) {
  if (st.phase === 'running' && st.order) st.order.left = Math.max(0, st.order.left - secs);
}

export const isNewBest = (score, best) => score > 0 && score > best;
```

Check by hand before running: in the "delivered" test the order started with `left = 192`, `tick(…, 100, 50, 10)` leaves 92, the delivering tick reduces it by 1 to 91, so the tip is `round((150 + 2 * 91) * 100 / 100) = 332`. The `applyImpact(newShift(0), 1)` line proves "no order running: ignored". In `pickOrder`'s "recent" case only id 29 can come out; 200 tries make a miss for the fixed seed practically impossible, and if seed 3 still misses, change only the seed in the test.

- [ ] **Step 4: Run, expect green:** `node --test prototype/tests/delivery.test.mjs`, then the whole `node --test prototype/tests/*.test.mjs`.

- [ ] **Step 5: Commit** `feat(delivery): pure state machine, address pool and scoring (#107)` with `git add prototype/delivery.js prototype/tests/delivery.test.mjs`.

---

### Task 2: Pause rules accept the shift

**Files:** `prototype/pause.js`, `prototype/tests/pause.test.mjs`.

- [ ] **Step 1: Failing tests.** Add to `pause.test.mjs`: `canPause(true, 'delivery') === true`; `canPause(false, 'delivery') === false`; `needsAbandonConfirm('delivery') === true`; the existing cases for `ready` / `finished` stay as they are.
- [ ] **Step 2: Implement.** `canPause`: `raceState === 'armed' || raceState === 'racing' || raceState === 'delivery'`. `needsAbandonConfirm`: `raceState === 'racing' || raceState === 'delivery'`. Update the comments above them.
- [ ] **Step 3: Run** `node --test prototype/tests/*.test.mjs`, green. **Commit** `feat(pause): pause and abandon question during a delivery shift (#107)`.

---

### Task 3: Strings

**Files:** `prototype/strings.js`, `prototype/tests/strings.test.mjs` (existing equal-keys / no-`ß` checks).

- [ ] **Step 1:** Add the keys to both `en` and `de` (same keys; no `ß`; German impersonal, Swiss spelling). Texts:

| key | en | de |
|---|---|---|
| `startDelivery` | `Delivery` | `Ausliefern` |
| `deliveryNeedsWorld` | `Delivery needs the OSM world` | `Ausliefern braucht die OSM-Welt` |
| `keyDelivery` | `Delivery: pizza to a street address, with the Navi` | `Ausliefern: Pizza zu einer Adresse, mit Navi` |
| `delivOrder` | `Order {0}/{1} · {2}` | `Bestellung {0}/{1} · {2}` |
| `delivCargo` | `Cargo {0} %` | `Ladung {0} %` |
| `delivScore` | `Score {0}` | `Punkte {0}` |
| `delivPickup` | `{0}: your first order is ready` | `{0}: Die erste Bestellung ist bereit` |
| `delivHandOver` | `Delivered: {0} · +{1}` | `Geliefert: {0} · +{1}` |
| `delivLate` | `Too late – order lost` | `Zu spät – Bestellung verloren` |
| `delivRuined` | `The pizza is ruined` | `Die Pizza ist hin` |
| `delivNoCheat` | `Not during a delivery` | `Nicht während einer Lieferung` |
| `delivNoOrder` | `No order right now` | `Gerade keine Bestellung` |
| `delivShiftDone` | `Shift done` | `Schicht beendet` |
| `delivResult` | `{0} of {1} delivered` | `{0} von {1} geliefert` |
| `delivNewBest` | `New best!` | `Neuer Bestwert!` |
| `delivAnother` | `Another shift` | `Noch eine Schicht` |

Use the placeholder syntax `tr()` / `translate` already uses (check `prototype/strings.js` for existing entries with arguments, e.g. `cpToast`, and copy that style exactly).

- [ ] **Step 2: Run** `node --test prototype/tests/*.test.mjs`. **Commit** `feat(i18n): delivery mode strings (#107)`.

---

### Task 4: Failing browser tests `prototype/tests/test_delivery.py`

**Files:** Create `prototype/tests/test_delivery.py` (follow `test_jump.py` for the world fixtures, `needs_world` skips and `__mm` hooks; follow `conftest.py`).

- [ ] **Step 1: Write the tests** (all fail until Task 5):
  1. `test_button_starts_a_shift`: world loaded, click `#deliverybtn` → `__mm.delivery()` has `on` true, `phase 'running'`, `idx 0`, an `order` with a label matching `\S+ \d+[a-zA-Z]?`, `len` in 250–5000, `left` equal to `timeLimit(len)` within 2 s, `cargo 100`; the overlay is hidden; `__mm.navi().on` is true; `#deliv` text contains the label.
  2. `test_handover_pays_a_tip`: `__mm.deliveryTeleportToDrop()` then `__mm.sim(1)` (check the sim hook name in `index.html`) → `idx 1`, `score > 0`, a toast with the address, and a next order exists with a different label.
  3. `test_impact_damages_the_cargo`: `__mm.deliveryImpact(1)` → `order.cargo === 60`; three times → the order was lost (`idx 1`, `score 0` for it), toast contains the ruined text.
  4. `test_cheats_are_ignored`: during a shift `J` (open dialog stays hidden), `F` (`FLY.on` false), `O` and `I` change nothing and show the "Not during a delivery" toast (en).
  5. `test_late_loses_the_order`: advance the clock with the sim hook past `order.limit` while far away → `idx 1`, `score 0`.
  6. `test_shift_ends_with_result_and_saves_best`: finish five orders (teleport) → overlay visible with the result, `localStorage['mm.deliveryBest']` equals the score; a second shift with a lower score keeps the old best.
  7. `test_race_is_untouched`: Start (race) after a shift → `R.state` armed, `__mm.delivery().on` false, Navi off.
  8. `test_pause_in_a_shift`: Esc pauses (the countdown does not move), Main menu asks the abandon question.
  9. `test_hand_layout_disables_the_button`: in the hand layout (no world) `#deliverybtn` is disabled.
  Playwright runs in the foreground only. Use `systemd-run … pytest ../prototype/tests/test_delivery.py -q`.
- [ ] **Step 2: Run, expect them to fail** (hooks missing). Commit `test(delivery): failing browser tests for the delivery mode (#107)`.

---

### Task 5: Wire the shift into `prototype/index.html`

**Files:** `prototype/index.html`. Do the steps in order; after each, load the page once by running the smallest relevant test.

- [ ] **Step 1: Button and HUD markup.** `#deliverybtn` (`class="btn"`, `data-i18n="startDelivery"`) in the start screen's `.row` after `#startbtn`; in `#tc` under `#roadname` three lines `#delivline`, `#delivtime`, `#delivcargo` (empty outside a shift; the countdown gets the red class under 20 s, reuse the existing red token); a `data-i18n="keyDelivery"` line in the help/key list. Run the `strings` node tests (static markup keys).

- [ ] **Step 2: Import and state.** Import from `./delivery.js` and `impactStrength` (already imported by #104's change). Add `const DEL = { st: null, depots: null, addresses: null, depot: null, graph: null }` next to `R`. `deliveryActive = () => R.state === 'delivery'`.

- [ ] **Step 3: Address pool.** `deliveryPool()` builds, once and lazily, `DEL.addresses = buildAddresses(L.buildings, nearestNamedRoad)` where `nearestNamedRoad(x, z)` queries `ROAD_GRID` with `segDist` (the same lookup the road-name HUD uses; grep `roadname`), skipping unroutable classes (`isRoutable` from `route.js`), bridges and motorways, and returns `{ n, d }`. Then `DEL.depots = resolveDepots(DEPOTS, LANDMARKS_ENTRIES, DEL.addresses)` (the landmark entries the J dialog uses; grep `landmarkEntries`). The route graph: reuse #18's `AUTOP.graph` builder (the lazy `buildGraph(ROADS)` call); do not build a second graph.

- [ ] **Step 4: Order picking.** `routeLenTo(addr)`: `const g = graph; const s = snapToGraph(g, addr.x, addr.z, 60); if (!s) return null; const r = findRoute(g, snapToGraph(g, P.x, P.z), [s]); return r ? r.len : null`. The drop point of the chosen order is the `snapToGraph` result of its address (store it as `order.dx, order.dz`; the pure module's order object keeps `x, z` = building centre, the glue adds the drop point). `nextOrder()`: `pickOrder({ addresses: DEL.addresses, rng: DEL.rng, routeLen: routeLenTo, recent: DEL.st.recent })`; `null` → toast `delivNoOrder`, end the shift; else `beginOrder`, `stopNavi(true)`, `startNavi({ n: order.label, x: order.dx, z: order.dz })`, move the marker pillar (a mesh built like the checkpoint pillars, own material colour, one object reused), toast the label.

- [ ] **Step 5: Start and end of a shift.** `startDelivery(seed)`: needs `L` (else toast `deliveryNeedsWorld`); `DEL.rng = mulberry32(seed ?? Date.now())`; `DEL.st = newShift(best)` with `best` read from `localStorage 'mm.deliveryBest'` (`try/catch`); `DEL.depot` = random depot from `DEL.depots`; place the car on the nearest routable road at the depot facing along it (the `placeOnRoad` helper's pieces without `R.jumped` and without closing the J dialog; set `P.safe`, `resetCar()`); hide checkpoint rings and the finish gate; `R.state = 'delivery'`; hide the overlay and the result; toast `delivPickup`; `nextOrder()`. `endDelivery(silent)`: `DEL.st = null`, `stopNavi(true)`, marker hidden, rings restored on the next race start, `R.state = 'ready'` unless a race starts. `startRace()` calls `endDelivery(true)` first. The pause menu's Restart in a shift calls `startDelivery()`; its Main menu calls `endDelivery()` and shows the start screen (read `toMainMenu` / `pauseRestart` in `index.html` and branch on `deliveryActive()`).

- [ ] **Step 6: Step loop.** In the main loop's step block (where `stepRace(dt)` runs, outside the paused branch), when `deliveryActive()` and the overlay is hidden: `const ev = tick(DEL.st, dt, hypot(P.x - o.dx, P.z - o.dz), hypot(P.vx, P.vz))`; on `'delivered'` toast `delivHandOver(label, tip)` (event toast) and `SFX.checkpoint()`, on `'late'` toast `delivLate`; then if `DEL.st.phase === 'over'` → `finishShift()` else `nextOrder()`. `finishShift()`: `best = max`, `isNewBest` → save to `localStorage 'mm.deliveryBest'` (`try/catch`), `R.state = 'finished'`-like result screen: `DEL.last = { score, delivered, total, newBest, best }`, `renderOverlay()` shows it, `stopNavi(true)`. Check every other `R.state` comparison found in Task 0 Step 2 (the "skip `stepCar` when ready" check must not skip `'delivery'`).

- [ ] **Step 7: Impact hook.** Next to each existing `SFX.crash(impactStrength(...))` call in `collide` and in the landing: `deliveryImpact(strength)` → `if (!deliveryActive()) return; const ev = applyImpact(DEL.st, strength); if (ev === 'ruined') { toast(tr('delivRuined')); nextOrderOrFinish(); }`. One line per call site; the sound code stays exactly as #104 left it.

- [ ] **Step 8: Cheat guards and the R penalty.** In the `keydown` listener, before the J / F / O / I handlers: `if (deliveryActive() && ['KeyJ', 'KeyF', 'KeyO', 'KeyI'].includes(e.code)) { e.preventDefault(); toast(tr('delivNoCheat')); return; }` (keep the line that records `keys[e.code]`; only those four handlers are skipped, so use a flag `const blocked = deliveryActive() && […].includes(e.code)` that gates them). `KeyR` during a shift: `resetCar()` as before plus `applyPenalty(DEL.st, DELIV.resetPenalty)`. The map double-click jump (grep `dblclick`) gets the same guard. Touch: nothing.

- [ ] **Step 9: HUD and minimap.** In `hud(dt)`: when a shift runs, fill `#delivline` (`delivOrder idx+1, total, label`), `#delivtime` (mm:ss, red under 20 s), `#delivcargo` (`delivCargo` and `delivScore`); empty otherwise. In `drawMap`: a depot dot with the name and a drop dot (contrasting colour, next to the Navi's cyan line) while a shift runs.

- [ ] **Step 10: Result screen.** `renderOverlay` / `resultHtml`: when `DEL.last` is set and the shift is over, show `delivShiftDone`, the score big, `delivResult`, `delivNewBest` when it applies, the best; the Start button keeps starting the race, `#deliverybtn` reads `delivAnother`. Clearing `DEL.last` when a race starts.

- [ ] **Step 11: Hooks.** `window.__mm.delivery = () => ({ on: deliveryActive(), phase: DEL.st?.phase ?? null, idx: DEL.st?.idx ?? 0, score: DEL.st?.score ?? 0, best, depot: DEL.depot?.name ?? null, order: DEL.st?.order && { label, x, z, dx, dz, len, limit, left, cargo } })`; `__mm.deliveryStart = seed => startDelivery(seed)`; `__mm.deliveryTeleportToDrop = () => { P at the drop point, velocity 0 }`; `__mm.deliveryImpact = s => deliveryImpact(s)`.

- [ ] **Step 12: Hand layout.** Without `L`, `#deliverybtn` gets `disabled` and `title = tr('deliveryNeedsWorld')`.

- [ ] **Step 13: Run** the node tests and `test_delivery.py` (foreground), then `test_vehicles.py`, `test_pause.py`, `test_jump.py`, `test_smoke.py`, `test_navi.py`, `test_i18n.py`, fix what breaks in the **new** code only. Push the branch before the long runs. **Commit** `feat(delivery): delivery mode with the Navi, time bonus, cargo damage and a saved best (#107)`.

---

### Task 6: Changelog, playtest note, final run

**Files:** `CHANGELOG.md`, `test-todo.md`.

- [ ] **Step 1: Changelog** under `[Unreleased]`, in the player's voice (German, like the existing entries; read the top of the file for the style): „Neu: Ausliefern. Auf dem Startbildschirm startet **Ausliefern** eine Schicht mit fünf Bestellungen. Ab der Pizzeria führt das Navi zu einer echten Hausadresse, die Zeit läuft, und wer rasant und sorgsam fährt, bekommt mehr Trinkgeld: Mit jedem Crash leidet die Pizza. Der beste Wert wird gespeichert. Während einer Lieferung gehen **J**, **F** und **O** nicht.“ Hand-written; never `git cliff -o`.

- [ ] **Step 2: Playtest note** in `test-todo.md` (direct to `main` is allowed for that file only): start a shift; the addresses are real and the street fits the house (look at 3 on the map); the Navi shows the way and ends at 20 m; the marker stands in front of the house; stopping at the marker hands over, driving past does not; the time feels right for 600 m and 2 km orders (tune `DELIV.refSpeed` / `grace`); a wall hit at speed costs about 40 % cargo, a tap nothing; J / F / O / I toast the refusal; R costs 15 s; pause and Main menu; the result screen and the saved best after a reload; the race (Start) still works; the hand layout shows a disabled button.

- [ ] **Step 3: Final run.** Node + the Playwright files of Task 5 Step 13, foreground. Push the branch, open the PR `feat(delivery): delivery mode with real addresses (#107)` with `Closes #107`, summary / changes / testing sections per the repo's PR template.

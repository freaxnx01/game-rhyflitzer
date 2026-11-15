# Multiplayer car-to-car collisions Plan (#836 part a)

> Spec: `docs/superpowers/specs/2026-11-15-multiplayer-car-collisions-design.md`. No hit relay (part b), no race rules (#837).

**Goal:** in a shared drive each device pushes its own car out of a remote car (mass-weighted), adds the epic impulse (e = 0.3), and plays a wall hit's crash sound and damage at that closing speed.

Constraints: buildless, no packages; `netbump.js` pure; single-player physics unchanged but one call in `stepCar`; no new strings. CHANGELOG `[Unreleased]` → `### Added`, with the go-live time: `` `YYYY-MM-DD HH:MM` `` **Autos prallen voneinander ab**: beim gemeinsamen Fahren prallt man vom anderen Auto ab und nimmt Schaden wie an einer Wand; ein schweres Fahrzeug lässt sich weniger schieben. Run only `node --test tests/net*.test.mjs` and `PW_CDP_ENDPOINT=http://192.168.1.120:9223 python3 -m pytest -q tests/test_multiplayer_bump.py` (foreground).

## Task 1: `netbump.js` (TDD)
Files: new `netbump.js`, new `tests/netbump.test.mjs`.

Write the test first:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { carShape, carContact, bumpShare, bumpImpulse, bumpGate, RESTITUTION, BUMP_COOLDOWN, BUMP_DY } from '../netbump.js';
const CIRCLE = { shape: 'circle', r: 1.3 }, BUS = { shape: 'capsule', r: 1.3, hl: 4.8 };

test('carContact_apart_null', () => {
  assert.equal(carContact(carShape(0, 0, 0, CIRCLE, 1), carShape(3, 0, 0, CIRCLE, 1)), null);
});
test('carContact_overlap_normalFromOtherToOwn', () => {
  const hit = carContact(carShape(0, 0, 0, CIRCLE, 1), carShape(2, 0, 0, CIRCLE, 1));
  assert.ok(Math.abs(hit.nx + 1) < 1e-9 && Math.abs(hit.nz) < 1e-9); assert.ok(Math.abs(hit.pen - 0.6) < 1e-9);
  const h = carContact(carShape(0, 0, 0, CIRCLE, 1), carShape(0, 0, 0, CIRCLE, 1)); assert.deepEqual([h.nx, h.nz], [1, 0]);
});
test('carContact_busAlongItsLength_hits', () => {
  assert.ok(carContact(carShape(4, 2, 0, CIRCLE, 1), carShape(0, 0, 0, BUS, 1)));
});
test('bumpImpulse_headOn_swappedRolesMirror', () => {
  const a = { vx: 10, vz: 0, m: 1 }, b = { vx: -10, vz: 0, m: 1 };
  const ia = bumpImpulse(a, b, { nx: -1, nz: 0 }), ib = bumpImpulse(b, a, { nx: 1, nz: 0 });
  assert.equal(RESTITUTION, 0.3);
  assert.ok(Math.abs(ia.dvx + 13) < 1e-9 && Math.abs(ib.dvx - 13) < 1e-9);
  assert.equal(ia.closing, 20);
});
test('bumpImpulse_heavierCar_movesLess', () => {
  const light = { vx: 10, vz: 0, m: 1 }, heavy = { vx: -10, vz: 0, m: 4 };
  const il = bumpImpulse(light, heavy, { nx: -1, nz: 0 }), ih = bumpImpulse(heavy, light, { nx: 1, nz: 0 });
  assert.ok(Math.abs(ih.dvx) < Math.abs(il.dvx));
  assert.ok(Math.abs(light.m * il.dvx + heavy.m * ih.dvx) < 1e-9);         // momentum conserved
  assert.ok(bumpShare(4, 1) < bumpShare(1, 4));
});
test('bumpImpulse_separating_none', () => {
  const r = bumpImpulse({ vx: -5, vz: 0, m: 1 }, { vx: 5, vz: 0, m: 1 }, { nx: -1, nz: 0 });
  assert.deepEqual([r.dvx, r.dvz, r.closing], [0, 0, 0]);
});
test('bumpGate_cooldownPerPlayer', () => {
  const g = new Map(); assert.equal(BUMP_COOLDOWN, 0.3); assert.equal(BUMP_DY, 2.5);
  assert.equal(bumpGate(g, 1, 10), true); assert.equal(bumpGate(g, 1, 10.2), false);
  assert.equal(bumpGate(g, 2, 10.2), true); assert.equal(bumpGate(g, 1, 10.31), true);
});
```

Then `netbump.js`:

```js
// netbump.js — #836: car-to-car contact in a shared drive. Pure: no DOM, no three.js. Each device moves only its own car.
import { capsuleOffsets, capsuleCircles } from './bus.js';

export const RESTITUTION = 0.3;     // e of the epic formula
export const BUMP_COOLDOWN = 0.3;   // s per remote player
export const BUMP_DY = 2.5;         // m: further above/below (bridge, jump) is no contact

// the collision circles the walls already use, in world metres
export function carShape(x, z, th, collision, scale) {
  const offsets = capsuleOffsets(collision).map((d) => d * scale);
  return { circles: capsuleCircles(x, z, th, offsets), r: collision.r * scale };
}

// carContact(own, other) — the deepest circle-pair overlap, normal from other to own, or null
export function carContact(own, other) {
  let best = null;
  for (const [ax, az] of own.circles) for (const [bx, bz] of other.circles) {
    const dx = ax - bx, dz = az - bz, d = Math.hypot(dx, dz), pen = own.r + other.r - d;
    if (pen <= 0 || (best && pen <= best.pen)) continue;
    best = d < 1e-6 ? { nx: 1, nz: 0, pen } : { nx: dx / d, nz: dz / d, pen };
  }
  return best;
}

export function bumpShare(mOwn, mOther) { return mOther / (mOwn + mOther); }

// the own car's Δv: n · max(0, −(v_own − v_other)·n) · (1 + e) · share
export function bumpImpulse(own, other, n, e = RESTITUTION) {
  const closing = Math.max(0, -((own.vx - other.vx) * n.nx + (own.vz - other.vz) * n.nz));
  if (!closing) return { dvx: 0, dvz: 0, closing: 0 };   // no -0 from n · 0
  const k = closing * (1 + e) * bumpShare(own.m, other.m);
  return { dvx: n.nx * k, dvz: n.nz * k, closing };
}

// true at most once per BUMP_COOLDOWN s per player; records the time (like impact.js crashGate)
export function bumpGate(gate, id, now) {
  const last = gate.get(id);
  if (last !== undefined && now - last < BUMP_COOLDOWN) return false;
  gate.set(id, now);
  return true;
}
```

verify: `node --test tests/netbump.test.mjs` green.

## Task 2: `sampleRemote` carries velocity (TDD)
Files: `netsync.js`, `tests/netsync.test.mjs`.
- Test `sampleRemote_velocity_interpolatedAndHeld`: poses at t 1000 (vx 10) and 1100 (vx 20) → `sampleRemote(tr, 1150).vx` ≈ 15; past the newest (`now` 1300) → `vx` 20; before the oldest → the oldest's `vx`; `vz` likewise.
- `pick` adds `vx, vz`; the extrapolate branch returns `newest.vx/vz`; the interpolate branch `lerp(b0.vx, b1.vx, f)` and `vz`.

verify: `node --test tests/netsync.test.mjs` green.

## Task 3: the hook in `index.html`
Files: `index.html`.
- Import those names from `./netbump.js` next to the `netsync.js` import.
- After `const NETCARS = new Map();`:

```js
const BUMP = { gate: new Map() };   // #836: per remote player, the time of the last impulse (s)
// the remote cars the own car overlaps now (a query; also the test hook)
function netContacts() {
  if (!NET.session || FOOT.on) return [];
  const own = carShape(P.x, P.z, P.th, VEH.collision, VEH.scale), out = [];
  for (const [id, entry] of NETCARS) {
    const def = entry.car && VEHICLES[entry.car];
    if (!def || entry.leaving != null) continue;
    const pose = sampleRemote(entry.track, hostNow());
    if (!pose || !(pose.flags & FLAG.visible) || Math.abs(pose.y - P.y) > BUMP_DY) continue;
    const hit = carContact(own, carShape(pose.x, pose.z, -pose.ry, def.collision, def.scale));
    if (hit) out.push({ id, hit, pose, mass: def.mass });
  }
  return out;
}
// #836: push out; a closing contact also bounces, crashes and hurts
function netBump() {
  for (const { id, hit, pose, mass } of netContacts()) {
    const share = bumpShare(VEH.mass, mass);
    P.x += hit.nx * hit.pen * share; P.z += hit.nz * hit.pen * share;
    const imp = bumpImpulse({ vx: P.vx, vz: P.vz, m: VEH.mass }, { vx: pose.vx, vz: pose.vz, m: mass }, hit);
    if (imp.closing <= 0 || !bumpGate(BUMP.gate, id, performance.now() / 1000)) continue;
    P.vx += imp.dvx; P.vz += imp.dvz;
    const s = impactStrength(imp.closing); crashHit(s); SFX.crash(s);
  }
}
```

- `stepCar`: right after `collide(carRadius());` add `netBump();   // #836`.
- `netEndSession`: `BUMP.gate.clear()`.
- `netSendPose`: `vx: FOOT.on ? 0 : P.vx`, same for `vz` (on foot `P` is the walker; the parked car stands still).
- Hook next to `__mm.netCars`: `window.__mm.netContacts = () => netContacts().map(({ id, hit }) => ({ id, pen: hit.pen }));`.

verify: `node --test tests/net*.test.mjs` green; empty console on load.

## Task 4: browser test
Files: new `tests/test_multiplayer_bump.py`.

```python
"""#836 part a: a forced overlap pushes both cars apart on both devices. Stepped mode: a page simulates only when
ticked; poses keep flowing on their timer. Slow: run in the foreground."""
from test_multiplayer_cruise import pair_fixture, ready_both  # noqa: F401  (registers the `pair` fixture)
from test_multiplayer_lobby import T, connect, net

POS = "() => window.__mm.carPose().pos"


def test_forced_overlap_pushes_both_cars_apart(pair):
    host, guest, errors = pair
    connect(host, guest)
    ready_both(host, guest)
    host.click("#mpgo")
    for page, other in ((host, 1), (guest, 0)):
        page.wait_for_function("(id) => window.__mm.netCars().some(c => c.id === id && c.visible)", arg=other, timeout=T)
    for page in (host, guest):
        page.evaluate("() => window.__mm.stepped(true)")
    hx, hy, hz = host.evaluate(POS)
    th = -host.evaluate("() => window.__mm.carPose().rot[1]")
    # the tick writes car.position (what the pose stream reads)
    guest.evaluate("([x, z, th]) => { window.__mm.place(x, z, th); window.__mm.tick(1 / 60); }", [hx + 1.0, hz, th])
    before = {"h": [hx, hy, hz], "g": [hx + 1.0, hy, hz]}
    for page, other in ((host, 1), (guest, 0)):
        page.wait_for_function("(id) => window.__mm.netContacts().some(c => c.id === id)", arg=other, polling=100, timeout=T)
    for _ in range(10):                  # interleaved
        for page in (host, guest):
            page.evaluate("() => window.__mm.tick(1 / 60)")
    after = {"h": host.evaluate(POS), "g": guest.evaluate(POS)}
    for me, them in (("h", "g"), ("g", "h")):
        moved = (after[me][0] - before[me][0], after[me][2] - before[me][2])
        away = (before[me][0] - before[them][0], before[me][2] - before[them][2])
        assert (moved[0] ** 2 + moved[1] ** 2) ** 0.5 > 0.2, (me, moved)
        assert moved[0] * away[0] + moved[1] * away[1] > 0, (me, moved, away)
    for page in (host, guest):
        page.evaluate("() => window.__mm.stepped(false)")
    assert net(host)["bad"] == 0 and net(guest)["bad"] == 0
    assert errors == []
```

verify: the bump test and `tests/test_multiplayer_cruise.py` green (command above).

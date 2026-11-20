# Multiplayer hit relay Plan (#836 part b)

> Spec: `docs/superpowers/specs/2026-11-15-multiplayer-car-collisions-design.md` (section *Hit relay*). **Needs part a merged** (`netbump.js`: `bumpShare`, `bumpGate`, `RESTITUTION`; `index.html`: `BUMP`, `netContacts`, `netBump`, the `stepCar` hook).

**Goal:** a contact only one device saw (a rear-end: the victim sees the attacker 100 ms late, so on its screen they never touch) still bounces the other car. The device that hit announces it in the pose record's reserved bytes 33–35; the hit player applies the matching impulse, crash sound and damage once.

Constraints: buildless, no packages; pure modules stay pure; every inbound record through `parsePose` (refusal → `NET.bad++`, never thrown); the network handler only queues, the simulation step applies. No new strings, no CHANGELOG entry (part a's covers it). Run only `node --test tests/net*.test.mjs` and `PW_CDP_ENDPOINT=http://192.168.1.120:9223 python3 -m pytest -q tests/test_multiplayer_bump.py tests/test_multiplayer_cruise.py` (foreground).

## Task 1: the hit in the pose record (TDD)
Files: `netcodec.js`, `tests/netcodec.test.mjs`.

Tests first (reuse the module-level `POSE`):

```js
test('parsePose_hit_roundTrips', () => {
  assert.equal(parsePose(encodePose(POSE)).hit, null);
  const p = parsePose(encodePose({ ...POSE, hit: { to: 3, n: 31, c: 42.5 } }));
  assert.deepEqual(p.hit, { to: 3, n: 31, c: 42.5 });
});
test('parsePose_badHit_null', () => {
  assert.equal(parsePose(bad((v) => v.setUint8(33, 1))), null);               // bits without the present bit
  assert.equal(parsePose(bad((v) => v.setUint16(34, 5, true))), null);        // a speed without the present bit
  assert.equal(parsePose(bad((v) => { v.setUint8(33, 4); v.setUint16(34, 30001, true); })), null);   // > 300 m/s
});
```

(`bad` is scoped inside `parsePose_badRecords_null`; give the new test the same one-line helper rather than editing that test.)

Implementation:
- Constants: `HIT_PRESENT = 4` (bit 2 of byte 33), `HIT_C_MAX = 300` (m/s). Byte 33 = `to` (bits 0–1) | present | `n` (bits 3–7); bytes 34–35 = `c` in cm/s, u16.
- `encodePose`: replace the "bytes 33–35 stay 0" comment with
  ```js
  if (p.hit) {
    v.setUint8(33, (p.hit.to & 3) | HIT_PRESENT | ((p.hit.n & 31) << 3));
    v.setUint16(34, clampInt(p.hit.c * V_SCALE, 0, 0xffff), true);
  }
  ```
- `parsePose`, before the `return`:
  ```js
  const hb = v.getUint8(33), hc = v.getUint16(34, true);
  let hit = null;
  if (hb & HIT_PRESENT) { hit = { to: hb & 3, n: hb >> 3, c: hc / V_SCALE }; if (hit.c > HIT_C_MAX) return null; }
  else if (hb || hc) return null;
  ```
  and add `hit` to the returned object. Update the header comment of the record (bytes 33–35 = the #836 hit).

verify: `node --test tests/netcodec.test.mjs` green.

## Task 2: accepting a hit (TDD)
Files: `netbump.js`, `tests/netbump.test.mjs`.

```js
test('acceptHit_oncePerCounter_andNotDuringCooldown', () => {
  const seen = new Map(), gate = new Map();
  assert.equal(acceptHit(seen, 1, { n: 5 }, gate, 10), true);
  assert.equal(acceptHit(seen, 1, { n: 5 }, gate, 10.5), false);      // the same hit, repeated in the next poses
  bumpGate(gate, 2, 20);                                              // the own device already saw this contact
  assert.equal(acceptHit(seen, 2, { n: 1 }, gate, 20.1), false);
  assert.equal(acceptHit(seen, 2, { n: 1 }, gate, 20.5), false);      // still the same counter
  assert.equal(acceptHit(seen, 1, { n: 6 }, gate, 11), true);
});
test('hitNormal_fromSenderToOwn_fallbackVelocity_tooFarNull', () => {
  assert.deepEqual(hitNormal(0, 3, { x: 0, z: 0, vx: 0, vz: 0 }), { nx: 0, nz: 1 });
  assert.deepEqual(hitNormal(0, 0, { x: 0, z: 0, vx: -4, vz: 0 }), { nx: -1, nz: 0 });
  assert.equal(hitNormal(0, 0, { x: 0, z: 0, vx: 0, vz: 0 }), null);
  assert.equal(HIT_REACH, 10); assert.equal(hitNormal(0, 11, { x: 0, z: 0, vx: 0, vz: 0 }), null);
});
test('hitImpulse_scalesWithMassShare', () => {
  const d = hitImpulse(20, { nx: 1, nz: 0 }, 1, 1);
  assert.ok(Math.abs(d.dvx - 13) < 1e-9 && d.dvz === 0);              // 20 · 1.3 · 0.5
  assert.ok(hitImpulse(20, { nx: 1, nz: 0 }, 4, 1).dvx < d.dvx);
});
```

Implementation in `netbump.js`:

```js
export const HIT_WINDOW = 300;   // ms: a sent hit rides on every pose for this long, so one lost packet does not lose it
export const HIT_REACH = 10;     // m: a hit from a car drawn further away than this is ignored

// acceptHit(seen, from, hit, gate, now) — true once per (from, hit.n), and only while the pair's cooldown is off
export function acceptHit(seen, from, hit, gate, now) {
  if (seen.get(from) === hit.n) return false;
  seen.set(from, hit.n);
  return bumpGate(gate, from, now);
}

// hitNormal(x, z, pose) — unit vector from the sender's drawn position to the own car; at the same spot, the
// sender's direction of travel; null when that is undefined or the sender is out of reach
export function hitNormal(x, z, pose) {
  const dx = x - pose.x, dz = z - pose.z, d = Math.hypot(dx, dz);
  if (d > HIT_REACH) return null;
  if (d > 1e-6) return { nx: dx / d, nz: dz / d };
  const v = Math.hypot(pose.vx, pose.vz);
  return v > 1e-6 ? { nx: pose.vx / v, nz: pose.vz / v } : null;
}

export function hitImpulse(c, n, mOwn, mOther, e = RESTITUTION) {
  const k = c * (1 + e) * bumpShare(mOwn, mOther);
  return { dvx: n.nx * k, dvz: n.nz * k };
}
```

Refactor `bumpImpulse` to use `hitImpulse(closing, n, own.m, other.m, e)` for its `dvx`/`dvz` (part a's tests stay green unchanged).

verify: `node --test tests/netbump.test.mjs` green.

## Task 3: send, relay, receive in `index.html`
Files: `index.html`.
- Imports: `acceptHit, hitNormal, hitImpulse, HIT_WINDOW` from `./netbump.js`.
- State: `BUMP` gets `seen: new Map(), inbox: [], out: null, n: 0`. `netEndSession` clears `seen`, `inbox`, `out`.
- **Send:** in `netBump`, after a gated impulse against `id`:
  ```js
  BUMP.n = (BUMP.n + 1) & 31;
  BUMP.out = { to: id, n: BUMP.n, c: imp.closing, until: performance.now() + HIT_WINDOW };
  ```
  `netSendPose` adds `hit: BUMP.out && performance.now() < BUMP.out.until ? BUMP.out : null` to the `encodePose` argument. One hit at a time: a second car hit within 300 ms replaces the first.
- **Relay:** nothing to do. The host's `encodePose(pose)` of the parsed record carries `pose.hit` to every other guest.
- **Receive:** in `netPose`, after the existing checks and `pushPose(...)`:
  ```js
  if (pose.hit && pose.hit.to === NET.you) BUMP.inbox.push({ from: pose.id, hit: pose.hit });   // applied in stepCar, never here
  ```
  Cap the inbox at 16 entries (drop the oldest).
- **Apply:** at the start of `netBump`, drain the inbox:
  ```js
  for (const { from, hit } of BUMP.inbox.splice(0)) {
    const entry = NETCARS.get(from), def = entry?.car && VEHICLES[entry.car];
    const pose = def && sampleRemote(entry.track, hostNow()), n = pose && hitNormal(P.x, P.z, pose);
    if (!n || !acceptHit(BUMP.seen, from, hit, BUMP.gate, performance.now() / 1000)) continue;
    const d = hitImpulse(hit.c, n, VEH.mass, def.mass);
    P.vx += d.dvx; P.vz += d.dvz;
    const s = impactStrength(hit.c); crashHit(s); SFX.crash(s);
  }
  ```
  `netBump` runs only while driving (`stepCar`), so a player on foot ignores hits. `netContacts` returns `[]` without a session, but the drain must also be skipped then: guard `netBump` with `if (!NET.session) return;`.

verify: `node --test tests/net*.test.mjs` green; the two browser tests above green; `__mm.net().bad === 0` stays asserted there (zero bytes 33–35 from part a still parse).

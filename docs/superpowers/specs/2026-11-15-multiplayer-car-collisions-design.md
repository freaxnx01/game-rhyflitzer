# Multiplayer part 3: car-to-car collisions (netbump), design addendum

**Status:** quick-mode enrichment of #836, 2026-11-15; assumptions are in the #836 issue body. Epic spec: `2026-11-10-multiplayer-race-design.md` (section *netbump*); this file only settles what the epic leaves open. Builds on #835 (pose stream, `NETCARS`, `sampleRemote`).
**Split:** #836 is delivered in two sub-issues, each with its own plan of at most 10k characters:

- **part a, bump:** the pure `netbump.js`, `sampleRemote` velocities, the hook in `stepCar`, sound and damage, the two-page browser test. Playable: cars bounce off each other. Plan: `docs/superpowers/plans/2026-11-15-multiplayer-car-collisions.md`.
- **part b, hit relay:** a hit travels in the pose record's reserved bytes 33–35, so a contact only one device saw (a rear-end) also pushes the other car. Plan: `docs/superpowers/plans/2026-11-15-multiplayer-hit-relay.md`.

## What #835 left us (facts)

- `stepCar` resolves walls in `collide(carRadius())` (`index.html:5614`), then calls `followCave()`. A wall hit does `impactStrength(-vn)`, `crashHit(s)`, `SFX.crash(s)` (`index.html:5614`, `4646`); `crashHit` = `hurt(impactDamage(s, VEH.mass))` + `deliveryImpact(s)`.
- The car's collision shape is `VEH.collision` (`{ shape: 'circle', r }` or `{ shape: 'capsule', r, hl }`) × `VEH.scale`; the circles come from `capsuleOffsets` / `capsuleCircles` (`bus.js:25-36`, pure). `mass` is a relative number (0.6 … 8, compact 1.0) in every vehicle def.
- `NETCARS: Map<playerId, entry>` (`index.html:6484`), each with `car` (a `VEHICLES` id), `track`, `leaving`. `sampleRemote(track, now)` returns `x, y, z, rx, ry, rz, steer, flags` but **no velocity** (`netsync.js:71-102`). A remote heading is `−pose.ry` (`car.rotation.y = −P.th`).
- `netSendPose` sends `P.vx`/`P.vz` (`index.html:6518-6530`). On foot, `P` is the walker, so a parked car would report the walker's velocity.
- Bytes 33–35 of the pose record are written 0 and ignored by `parsePose` (`netcodec.js:47`, `58-83`), reserved for #836.
- `__mm.place(x, z, th)`, `__mm.stepped(on)`, `__mm.tick(dt)` and `__mm.carPose()` exist (`index.html:5319`, `7754-7770`, `5580`).

## Design

### Shape and contact (`netbump.js`, pure)

- **Shape:** the epic's "oriented box" is the vehicle's existing collision circles: `carShape(x, z, th, collision, scale)` → `{ circles, r }` via `capsuleOffsets`/`capsuleCircles`. The same shape the walls see, so a bus is long and a Mini is small.
- **Contact:** `carContact(own, other)` checks every circle pair and returns the deepest overlap `{ nx, nz, pen }`, the normal pointing from the other car to the own one, or `null`. Coincident centres fall back to `(1, 0)`.
- **Height:** a remote car more than `BUMP_DY = 2.5 m` above or below is ignored (bridge over road, a jump).

### Response (own car only, every step)

- **Position:** the own car moves out by `pen · share`, `share = bumpShare(m_own, m_other) = m_other / (m_own + m_other)`. The other device moves its own car by its own share, so a heavy car moves less. Because each device sees the other 100 ms late, an overlap lasts a few steps and each step pushes again until it is gone.
- **Impulse:** `bumpImpulse(own, other, n, e = 0.3)` → `{ dvx, dvz, closing }` with `closing = max(0, −(v_own − v_other)·n)` and `Δv = n · closing · (1 + e) · share` (the epic formula). Remote velocity: the sampled pose's `vx`/`vz`.
- **Cooldown:** `bumpGate(gate, id, nowS)`, 0.3 s per remote player, gates the impulse and the feedback, never the position push (a car resting against another stays apart).
- **Feedback:** on a gated impulse, `s = impactStrength(closing)`, `crashHit(s)`, `SFX.crash(s)`. The same damage, crash sound and pizza damage as a wall hit of that speed.
- **When:** only while driving, from one line after `collide(carRadius())` in `stepCar`. On foot, in the train, flying, or on the lift ride (`stepCar` returns early) there is no bump. A remote car counts while `!leaving`, its pose is not `null` and `flags & FLAG.visible`.
- **Parked remote cars:** a player on foot sends velocity 0, so their parked car is a solid, heavy-as-its-mass obstacle that does not move on their side.

### Hit relay (part b)

Each device only resolves what it sees, and it sees the others 100 ms late. A car that rear-ends another bounces on its own device, but on the victim's device the attacker is drawn 100 ms behind and may never touch it. So a gated impulse is also announced:

- **Pose bytes 33–35:** byte 33 = `to` (bits 0–1, the hit player's lobby id) | present (bit 2) | `n` (bits 3–7, a hit counter mod 32); bytes 34–35 = `c`, the closing speed in cm/s (u16).
- **Validation:** present bit clear → bytes 33–35 must be 0 (`hit: null`); present → `c ≤ 300 m/s`, else the record is refused. Old senders send zeros, which stays valid.
- **Sender:** after a gated impulse against player `j`, `NET.hit = { to: j, n: ++n mod 32, c: closing, until: now + 300 ms }`; every pose sent before `until` carries it (about six poses, so one lost packet does not lose the hit).
- **Relay:** the host's re-encode keeps the hit (`parsePose` → `encodePose`). Everybody gets it; only the player whose id is `to` acts on it.
- **Receiver:** `acceptHit(seen, from, hit, gate, nowS)` takes a hit once per `(from, n)` and only while the pair's cooldown is off (the own device already saw that contact otherwise). An accepted hit applies `Δv = n̂ · c · (1 + e) · share`, `n̂` pointing from the sender's sampled position to the own car (fallback: the sender's velocity direction), plus the same feedback, and starts the cooldown.

## Testing

- **node:** `tests/netbump.test.mjs`: no contact → `null`; a capsule (bus) hit along its length; head-on with swapped roles gives mirror results; a heavier car gets a smaller share and Δv; a separating pair gets no impulse; cooldown. `tests/netsync.test.mjs`: `sampleRemote` velocities. Part b: `tests/netcodec.test.mjs` hit round trip and refusals; `acceptHit` dedupe and cooldown.
- **Browser:** `tests/test_multiplayer_bump.py`, two pages, in stepped mode: the guest is placed 1 m beside the host; once each page reports the contact (`__mm.netContacts()`), both tick 0.5 s, and each own car has moved away from the other.

## Out of scope

- yaw from a car-to-car hit (the wall's `wallYaw`)
- tipping a Wobbler over by a hit
- remote car wheels or body reacting on the hit device
- anti-cheat

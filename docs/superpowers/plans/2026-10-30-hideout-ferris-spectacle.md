# Ferris wheel spectacle — implementation plan (#588, inside PR#514)

Spec: `docs/superpowers/specs/2026-10-30-hideout-ferris-spectacle-design.md`. Branch: `feature/513-ferris-wheel`
(PR#514). TDD: each task starts with a red `node --test` run. Commit and push after every task.

## Task 1 — Record size (ferris.js numbers)

- `FERRIS`:
  - `rim: 125`, `hub.y` so that `hub.y - rim - drop - h/2 >= 6`, `hub.r` and `hub.len` scaled (≈ 8 / 34);
  - `gondola: { n: 48, w: 8, d: 5, h: 3.5, drop: 3 }`;
  - `frame` spread (≈ `a: 17, b: 62`, foot `hw: 8`, leg `r: 1.8`), `collider.hw` to match the feet;
  - `h` recomputed (test: highest roof === h, h < 420).
- Update `ferris.test.mjs` to the new numbers: diameter 250, 48 angles, collider corners from
  `FERRIS.frame` rather than literals.
- `ferrismesh.js`:
  - rim torus tube ≈ 1.5 m, rings at x = ±3;
  - 32 spoke pairs instead of 16, spoke radius ≈ 0.4;
  - torus segments ≈ 128;
  - axle radius scaled.
- Room fit: the feet must stay inside the 95 m gravel loop and clear of the room centre. A test asserts
  `|frame.b| + collider.hw < 95` and `frame.b - collider.hw > 10`.

## Task 2 — LED layout and colour (pure, ferris.js)

- `ledLayout(cfg)` returns `[{ kind: 'rim', ring: ±1, u, pos: [x, y, z] }, { kind: 'spoke', spoke, side, s, pos }]`
  in the rotating wheel group's frame (hub at the origin, as `ferrismesh.js`). Spacing is about 2 m on the rim
  (both rings) and about 4 m along each spoke. The total goes into `cfg.leds.count`-free tests: assert between
  1500 and 2500.
- `ledColour(led, t, out)` writes r, g, b in [0, 1] into `out` (no allocation). `PATTERNS`: `chase`, `pulse`,
  `sparkle` (seeded hash of the LED index + floor(t·8), no Math.random), `fade`. Each pattern runs ≈ 18 s, with a
  1.5 s crossfade into the next. `patternAt(t)` returns `{ a, b, mix }` and is exported for tests.
- Tests:
  - deterministic: the same inputs give the same output;
  - every channel stays in [0, 1];
  - `patternAt` cycles through all four;
  - colours change between t and t + 0.5 for a chase LED.

## Task 3 — Fireworks (pure, ferris.js)

- `FERRIS.fireworks = { every: 10, perSalvo: [3, 5], particles: 120, life: 2.5, speed: [25, 45], g: 9.81, colours: [...] }`.
- `salvoAt(n)` is deterministic from the seeded hash `n`. It returns bursts
  `{ t0 (n·every + offset in 0..2 s), centre: [x, y, z] (wheel frame; y between h + 10 and 400; |x|, |z| ≤ 150), colour, speed }`.
- `burstsLive(t)` returns the bursts of salvos `floor(t/every)` and the one before it whose age is in
  [0, life).
- `particle(burst, j, age, out)` writes the position (unit direction from a Fibonacci sphere × speed × age,
  minus ½·g·age² in y) and the fade (1 − age/life)². It writes into `out`.
- Tests:
  - deterministic;
  - centres in range;
  - y of a particle falls after the apex;
  - fade is 1 at age 0 and 0 at life;
  - no burst is live outside its age window.

## Task 4 — Meshes and animation (ferrismesh.js, index.html)

- `ferrismesh.js` `buildWheel`:
  - Add an `InstancedMesh` of the LEDs (small `OctahedronGeometry(0.45)`, `MeshBasicMaterial`, `toneMapped: false`,
    per-instance colour) to the rotating `wheel` group. Expose it as `handle.leds` plus `handle.ledList`.
  - Give the gondola cabin materials a warm `emissive` (≈ 0x332211).
- `setWheelLights(handle, t)` loops the LEDs: `ledColour` into a reused array, then `setColorAt`, and sets
  `instanceColor.needsUpdate`.
- `buildFireworks(cfg)` builds one `THREE.Points` with a fixed pool (5 bursts × 2 salvos × particles):
  - `BufferGeometry` position and colour attributes;
  - `PointsMaterial` with `vertexColors`, `size` ≈ 2.5, `sizeAttenuation`, `AdditiveBlending`,
    `depthWrite: false`, `transparent`;
  - `frustumCulled = false`.
- `setFireworks(fw, t)` fills the slots from `burstsLive(t)`, writing colour × fade. Unused slots get fade 0
  and are parked at the origin.
- `roomFerris` adds the fireworks to the same wheel-placed group, not the rotating one. `stepFerris` calls
  `setWheelLights` and `setFireworks` with `performance.now()/1000`.
- `__mm.ferris()` adds `leds` (count), `ledSample` (the colour of LED 0 as hex), `sparks` (the number of live
  particles).
- Dispose: the existing `disposeGroup` covers the meshes. Make sure the Points material and geometry are
  included (they are children of the room group).

## Task 5 — Dusk look (rooms.js, index.html)

- `rooms.js`:
  - `ROOMS[6]` gets `look: 'dusk'`;
  - `roomLayout` returns `look: space ? 'space' : (room.look || 'meadow')`;
  - add a test in `rooms.test.mjs`: room 6 is `'dusk'`, rooms 0 and 1 are `'meadow'`.
- `ferris.js` exports `DUSK_LOOK`, in the same shape as `ROOM_LOOK` in index.html:
  - `fog` ≈ '#6b4f6e', `density` 0.0006;
  - `skyTop` '#1c2050', `skyHor` '#f0875a';
  - `hemiSky` '#9a88c0', `hemiGround` '#3a3a30', `hemi` 0.45;
  - `sun` 0.35.
- `index.html`: where the base look is picked (the `look === 'space' ? SPACE_LOOK : …` line), add
  `look === 'dusk' ? DUSK_LOOK`. Hide the sun disc for dusk too (the `sunSprite.visible` line).

## Task 6 — Browser test, changelog, verify

- `test_hideout.py` `test_ferris_room_…`:
  - h is `FERRIS.h` (read through `__mm.ferris().h` and compared to the number from a module eval, or the
    literal); `gondolas == 48`; `tris` bound raised to ≤ 150000;
  - `leds` between 1500 and 2500;
  - `ledSample` differs between two samples ≥ 2 s apart;
  - `sparks > 0` at some sample within 25 s of wall-clock (poll);
  - keep the no-download, collider and screenshot checks.
- Run it:
  `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_hideout.py -k ferris -x -q`.
  Also run the full `node --test prototype/tests/*.test.mjs`.
- CHANGELOG: rewrite the existing Ferris wheel entry (keep its place and timestamp):
  > A giant **Ferris wheel**, 250 m tall with 48 gondolas, now turns in **star room 6** at **dusk**: thousands of LEDs play a light show, and **fireworks** burst over it every few seconds. You can drive under the rim; the four feet are solid.
- #516's issue body: add a note that the lowest gondola index is `3 * FERRIS.gondola.n / 4` (36 now, not 24).
  The lead updates it.

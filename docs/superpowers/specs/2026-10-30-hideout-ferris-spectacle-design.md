# Ferris wheel spectacle: record size, light show, fireworks at dusk (#513 follow-up)

Status: approved by the maintainer 2026-10-30. Deadline: ships **inside PR#514**. The 2026-11-04 routine merges
that PR; it goes live **Thursday 2026-11-05 15:15** (demo), together with riding the wheel (#516).

## Why

The maintainer's verdict on the PR#514 wheel: "etwas unspektakulär". It is a 100 m white wheel turning in
midday light, with no lights and no sound. The maintainer picked four upgrades:

- **riding it**: already #516, dispatched after the merge;
- **a light show**;
- **record size**;
- **fireworks**;

and **dusk** as the room's mood.

## Goals

1. **Record size, about 250 m.** Rim radius 125 m (a 250 m wheel, the size of the world's largest). The hub
   sits high enough that the lowest gondola hangs at least 5 m over the lawn. **48 gondolas**, cabins about
   8 × 5 × 3.5 m (w × d × h), still upright through the turn. The A-frames spread to match: the feet stand
   far apart across the wheel's plane, inside the 95 m gravel loop, and still don't block the room centre.
   Same colliders model as today: four low foot squares. `FERRIS.h` stays under the 420 m helicopter ceiling.
2. **Light show.** About 1500–2500 small unlit "LED" points on both rim rings and along the spokes. They turn
   with the wheel and are drawn as one `InstancedMesh` with per-instance colour. A pure function in
   `ferris.js` gives each LED's colour from its place (rim position `u` 0..1 round the ring, or spoke index +
   `s` 0..1 along the spoke) and the wall-clock time. It cycles through at least **four patterns**, about
   15–20 s each, with a short crossfade:
   - a rainbow chase round the rim,
   - pulses running out along the spokes,
   - sparkle (random twinkles on a dim base),
   - the whole wheel fading through colours.

   The gondolas get a faint warm emissive glow, so they read as lit cabins.
3. **Fireworks.** A pure deterministic schedule in `ferris.js` (no `Math.random` at runtime: seeded from the
   burst index) fires a salvo of **3–5 bursts every ~10 s**. Bursts open between the top of the wheel and the
   helicopter ceiling, above and around the wheel. Each burst is ~100–150 particles flying out on a sphere,
   falling under gravity and fading over ~2.5 s, in one of a few bright colours. Rendering uses one `THREE.Points`
   pool with additive blending and vertex colours, positions computed per frame from the pure function. Fixed
   pool size, no allocations per frame.
4. **Dusk in room 6 only.** The room gets a `look: 'dusk'`, the way the Enterprise room has `look: 'space'`.
   It keeps the meadow (lawn, trees, gravel) but has its own look record (`DUSK_LOOK`):
   - a deep blue-violet zenith,
   - an orange-pink horizon,
   - warmer, thinner fog,
   - low hemisphere light and a weak sun,

   so the LEDs and fireworks stand out. The other meadow rooms keep their midday.

## Non-goals

- Riding (#516, separate; it reads `FERRIS` numbers, so it inherits the new size).
- **Sound**: no music, no firework bangs. It could be a later issue.
- A real-world brand: no Ain Dubai, London Eye or Singapore Flyer names, shapes, logos or colour schemes.
- Shadows, bloom/post-processing, dynamic lights. The glow is emissive/unlit colour only.

## Constraints

- Buildless three.js, the same files as PR#514:
  - `ferris.js` holds the pure numbers and tests;
  - `ferrismesh.js` holds the meshes;
  - `index.html` holds `roomFerris` / `stepFerris` and the look;
  - `rooms.js` holds the room record.
- No file is fetched for the wheel, as today.
- Animation runs from the wall clock (`performance.now()`), like `wheelAngle`, never from frame counts.
- It must run in the headless test browser (<1 fps). The PR#514 triangle budget for the wheel grows. The wheel
  plus LEDs stays under ~120k triangles, and the per-frame work is a colour write per LED plus a position write
  per firework particle.

## Decided calls (builder's, flagged for the maintainer)

- 48 gondolas and the cabin size (real record wheels carry ~48 large cabins).
- Pattern list and timings, salvo rhythm, the dusk colours: tune by eye in the screenshot.
- The spin stays 0.01 rad/s. That is one turn in ~10.5 min, and the rim now moves ~1.25 m/s, which looks right
  for its size.

## Tests

- **`ferris.test.mjs` updated to the new spec:**
  - 250 m;
  - 48 gondolas;
  - clearance at least 5 m;
  - `h` under 420 m;
  - legs and foot colliders at the new frame corners.
- **`ferris.test.mjs` new tests:**
  - LED layout count and positions on the rim;
  - the colour function is deterministic, in [0, 1] and changes pattern over time;
  - the firework schedule is deterministic, bursts sit between the wheel top and the ceiling, and particles fall
    and fade out.
- **`rooms.test.mjs`:** room 6 has `look: 'dusk'`; the other meadow rooms are still `'meadow'`.
- **`test_ferris_room_…` (Playwright):** the new numbers (h, 48 gondolas, triangle bound), LEDs present and
  changing colour between two samples, fireworks particles present, room 6 sky in the dusk colours. It leaves
  a screenshot.
- **#516's plan** hardcodes gondola index 24 as "the lowest" (true only for n = 32). Its issue body gets a note
  to derive the index from `FERRIS.gondola.n` (3n/4).

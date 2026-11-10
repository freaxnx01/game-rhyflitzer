# Plattform Sisslerfeld closer to the real tower (#855) — design

The in-game tower has the right plan (Häring montage plans, `PLATTFORM` in `plattform.js`) but
reads differently from the real one in the official video. This spec fixes the seven visual
differences of #855 without touching any plan dimension, any collider or the site.

Reference: video stills (copyrighted, local only, never in the repo). Game code: `plattformTower`
in `index.html:1870-1908`, constants in `plattform.js:7-26`.

## What the real tower shows (from the stills)

- The roof skin is a matte, nearly white board surface; the fascia at the eave is a light
  spruce board of visible thickness; under the eave a row of rafter heads sticks out like teeth,
  about 14 per side over 12.1 m (~0.85 m pitch).
- Under the roof: a glulam purlin on each pair of posts, parallel rafters per face running up to
  hip rafters that meet at the apex, light sheathing boards between them.
- Each post carries two slanted braces from about 1.8 m below its top out to the eave, one per
  adjacent roof face.
- The stair core is vertical spruce slats, ~9 cm wide with ~4–5 cm gaps, light shows through
  from inside. The slats continue ~1.1 m above the deck around the stair opening (where the
  `rail` colliders already are) with a thick glulam handrail ring on top.
- The treads are thick light spruce (~9 cm) and run up to the slat wall.

## Design

All numbers below are derived from `PLATTFORM` so nothing in the plan changes.

### Pure helpers (`plattform.js`, node-tested)

- `coreSlats(P = PLATTFORM, n = 72)` → `[{ phi, y0, y1 }]`, `phi = i * 360 / n` (5° pitch,
  0.136 m on `core.r` 1.56; slat width `SLAT.w = 0.09`, gap 0.046, radial depth `SLAT.d = 0.06`).
  `y0 = core.door.h` for `|phi| ≤ core.door.half` (wrapped, so 345°..15°: 7 slats), else 0.
  `y1 = deck.y + deck.rail - HANDRAIL.h` for `phi` within `[deck.railFrom, deck.railTo)` mod 360
  (230°..355° and 0°..95°: 46 slats, the parapet), else `deck.y`. So there is one slat per angle,
  running from the ground (or the door lintel) through the deck up to the handrail.
- `roofRafters(P = PLATTFORM, pitch = 0.8)` → per roof face `i` (0..2) a list of
  `{ face, u, d }`: `u` = offset along the eave from the face centre, symmetric,
  `u = (j - (m - 1) / 2) * pitch` with `m = floor(roof.side / pitch) = 15`; `d` = horizontal run
  from the eave inward to the hip, `d = ri * (1 - |u| / (roof.side / 2))`, `ri = roof.side / (2√3)`.
  The rafter rises `d * tan(pitch)` (45° → `d`). 45 rafters.
- `roofEdges(frame, P)` is not needed: the implementer uses `frame.triangle(roof.side)` and
  `frame.triangle(frame.side)` (already exported) for fascia, hips, purlins and braces.

### Geometry (`plattformTower`, all merged into the existing roles, no new draw call)

Role `timber` (= `roofFlat`, bright spruce noise) unless noted; colours: `spruce #f6dc9a`,
`beam #dcbf80`, sheathing `#e6d2a0`, roof skin `ROOF_WHITE = '#efece4'`.

1. **Roof skin**: the existing cone, `colorize(roofG, col(ROOF_WHITE))`. Textured mode keeps the
   `roofFlat` gravel noise (matte), flat mode multiplies into `#9aa0a8` — still clearly lighter
   than today. The existing inside-out cone (the ceiling) becomes sheathing `#e6d2a0`.
2. **Fascia**: one `box()` per roof-triangle side, `0.06` thick × `FASCIA.h = 0.18` high, top at
   `roof.eaves`, colour `spruce`, centred on the edge (same pattern as the deck parapet boxes).
3. **Rafters**: for each `roofRafters` entry a `bar()` from the eave point (`y = roof.eaves -
   RAFTER.drop`) to the hip point (`y = roof.eaves + d - RAFTER.drop`), section `RAFTER.t = 0.12`,
   `RAFTER.drop = 0.2` so the bar hangs under the skin; eave point extended `RAFTER.tail = 0.25`
   outward past the fascia (the teeth). Colour `spruce`. Eave point in world: the foot of `u`
   along the roof edge from the edge midpoint; the outward normal is `(mid - centre)` normalised.
4. **Hip rafters**: 3 `bar()` from each roof vertex (`eaves - 0.2`) to the apex (`apex - 0.2`),
   section 0.16, colour `beam`.
5. **Purlins**: 3 `box()` along the frame-triangle sides (6 m), `0.24` wide × `PURLIN.h = 0.36`,
   top at `roof.eaves`, colour `beam`.
6. **Braces post→eave**: per post, two `bar()` of section 0.14, colour `beam`, from the post at
   `y = roof.eaves - BRACE.drop (1.8)` to the nearest point of each adjacent roof edge at
   `y = roof.eaves - 0.3` (horizontal run 1.76 m, rise 1.5 m).
7. **Core slats and parapet**: `battens()` is deleted. For each `coreSlats` entry a
   `BoxGeometry(SLAT.w, y1 - y0, SLAT.d)` rotated to the tangent at `phi` (`rotateY(-(facing +
   phi·RAD))` after building it along x) and translated to `frame.polar(phi, core.r)`,
   `y = b + y0`. Alternate tint: every other slat × 0.94 (the real slats vary). Boxes are solid,
   so the slats show from inside with real gaps.
8. **Handrail ring**: `ExtrudeGeometry` of `sectorPoly(frame, railFrom, railTo, core.r - 0.07,
   core.r + 0.07)` (via the existing `flat()`), depth `HANDRAIL.h = 0.1`, top at
   `b + deck.y + deck.rail`, colour `beam`.
9. **Treads**: cylinder height `TREAD.h = 0.09` (top face stays at `b + t.y`), outer radius
   `core.r - 0.03` instead of `core.tread`, colour `spruce`. Colliders (`plattformWalk`, radius
   `core.tread`) unchanged.

### Debug hook and tests

`PLAT.look = { roof: ROOF_WHITE, slats, rafters }` (counts of pushed slats and rafters) is added
in `plattformTower`; `window.__mm.plattform()` (`index.html:4957`) returns it as `look`.

- `tests/plattform.test.mjs`: `coreSlats` counts (72; 7 door slats with `y0 = 2.2`; 46 parapet
  slats with `y1 = 6.735`; the rest `y1 = 5.735`), `roofRafters` (45; `d` between 0 and `ri`;
  centre rafter `d = ri`; outermost `d > 0`).
- `tests/test_plattform_stair.py`: one new test `test_the_tower_wears_the_real_look` that reads
  `look` and asserts `roof == '#efece4'`, `slats == 72`, `rafters == 45`, no console errors.

## Out of scope

X braces as planks and deck board joints (guessed only, per the issue). Any change to
`PLATTFORM`, `plattformWalk`, `plattformCoreCollider`, the yard, the site.

# OSM house facades: one door at street level, whole windows, closed roofs (#901)

## Problem (measured 2026-11-11, GPU browser, `__mm.place` at the three reported spots)

All three symptoms come from the gable-house path in `osmBuilding` (`index.html` ~1816-1821, 1881 of 3165 buildings in the
Hochrhein world) and from `gable()` (`index.html` ~1630-1640).

1. **Doors.** The walls are one `box()` whose texture is tiled on a fixed 4 x 3 m grid (`tile [4, 3]`). With role
   `wallDoor` (a 50 % coin per house, `rnd() < 0.5`) every tile of `TEX.facadeDoor` carries a door (0.97 x 2.06 m, at the
   bottom of the tile). Result: a door every 4 m on all four faces and on **every storey** (building 171822842 has about
   14 tiles around x 2 storeys = ~28 doors), and none at all on the other half of the houses. The rows start at
   `base - 3` (the box bottom), so they land on `base + 3k`, where `base` is the **lowest** terrain under the ring. Ground
   varies across a footprint by median 0.54 m, p90 2.48 m, max 11.4 m (measured on all 1881 houses), so the uphill doors
   are half buried.
2. **Sky through the roof.** The roof is two zero-thickness quads with a 0.45 m overhang, drawn with the default
   `FrontSide` material. Seen from below (the chase camera beside a house, a walker), the overhang's underside is culled
   and the sky shows along the eaves and rakes. A/B on building 171822842: the same four views with every material set to
   `DoubleSide` show a dark roof strip exactly where the default shows sky. Winding of both roof quads and both gable
   triangles is correct (checked by hand: normals point out).
3. **Windows cut off.** (a) The gable triangle uses role `wall` with UVs `[0,0, d/4,0, d/8, rh/3]`, so the window texture
   runs into the triangle and the slopes cut it. (b) Every face's u starts at its left corner and runs `len / 4` tiles, so
   3010 of 3762 faces end in a partial tile: half windows at corners. (c) The eave `h` (DSM-measured) is not a multiple of
   3 m: on 734 of 1881 houses (39 %) the eave cuts a window row.

Before-screenshots: diagnostic only, not committed.

## Design

Keep the existing low-poly look and textures. Draw each gable-house wall as a few quads whose UVs are fitted to the wall,
instead of one box with a fixed tile:

- **Storey grid per house.** `floor0` = terrain at the door point, clamped to `[base, base + h - 2.2]`. Wall height above
  it `H = base + h - floor0`. `floors = max(1, round(H / 3))`, storey height `sh = H / floors`; if `sh > 3.5`, `sh = 3`
  and the rest above is plain plaster; if `H < 2.2`, no windows at all (sheds, garages). The window texture is tiled with
  `tile[1] = sh`, starting at `floor0`, so every row is whole and the last one ends at or under the eave.
- **Whole window columns.** The facade tile holds two windows; each half tile holds one, nearly centred. A face of length
  `len` gets `n = round(len / 2)` half tiles stretched to `len / n` (texture `tile[0] = 2 * len / n`), so faces always
  end on a half-tile boundary: no half windows. `len < 1.6` m: plain plaster.
- **Plinth.** Below `floor0` (down to `base - 3`), plain plaster: on a slope the downhill faces show a plinth, like real
  village houses.
- **One door.** On the rect face that faces the nearest road point (`nearestRoadPoint(cx, cz, b.st, 40)`; same rule as
  `facingFacade` for plates), in the middle half-tile column, ground storey only. That cell is plain plaster with a
  1.0 x 2.1 m door quad 0.03 m in front, bottom at `floor0`, its UVs the door rectangle of `TEX.facadeDoor` (no new
  texture). Every gable house gets exactly one door. The old coin `rnd() < 0.5` stays drawn and unused, so every later
  building keeps its colours.
- **Gable ends** use a new plain role `plaster` (texture: the facade's plaster noise without windows, made with its own
  local LCG like `TEX.plasterWhite`, **not** `noise()`/`rr()`, which would shift the seeded RNG). One centred attic
  window (0.9 x 1.1 m, sill 0.4 m over the eave) is added only when it fits under both slopes with a 0.3 m margin. This
  changes the default `GABLE_END_WALL` for every caller of `gable()` (hand-path houses, church, stations): none of them
  should show cut windows either. Row houses keep `ROW_GABLE_END`.
- **Roof:** the `roof` role's material is `DoubleSide` in both styles (original and flat), so the underside of the
  overhang draws (darker, lit from the flipped normal).

Pure layout maths lives in `world.js` (node-tested): `FACADE`, `facadeRows`, `facadeColumns`, `gableWindow`,
`facingFace` (`facingFacade` is refactored onto it). The drawing glue (`gableHouseWalls`) lives in `index.html`.

Out of scope (parked): flat-roof `extrudeFootprint` buildings (their u runs on around corners, half windows at corners);
the hand-path `house()` walls; ground-floor windows buried on the uphill side of steep lots; camera clipping into houses.

## Acceptance criteria

- Every gable-path OSM house (not row house, not landmark-replaced) has exactly one door, on the face toward the nearest
  road, bottom at the terrain at that point (clamped as above), no door on any upper storey.
- No window is cut by a corner, the eave or a gable slope on these houses; gable ends are plain plaster plus at most one
  whole attic window.
- From below the eave, a ray up through the overhang hits `roof` (sky no longer shows through it).
- Seeded colours of all buildings unchanged (the RNG draw sequence is kept).
- Node tests for the layout functions; one Playwright file for doors, gable end and roof underside; `test_row_houses.py`'s
  gable control now expects `plaster` (an intended behaviour change, not a weakened assertion).

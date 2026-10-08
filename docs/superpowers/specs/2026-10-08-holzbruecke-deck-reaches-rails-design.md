# The Holzbrücke deck reaches its rails (#137)

## Goal

A car between the Holzbrücke's drawn rails is always on the deck. Scraping a rail keeps it on the bridge, at the
true-to-size car from #122 (`compact.scale 1.0`, collider radius `1.3 × 1.0 = 1.3 m`).

## Root cause (measured)

The rails do hold. The car never goes through them. It drops through a hole in the deck *between* the rails.

- The wooden hero span is drawn as **one straight chord** between the two farthest-apart points of its OSM piece(s)
  (`prototype/index.html:933`, `heroBridge` at `:895`). The deck strip and both rail OBBs sit on that chord
  (`wall(s * (b.hw + 0.3), 0.3, b.len / 2)` at `:897`/`:900`), so the rail's inner face is at `±hw = ±2.6 m` from the chord.
- The **physical** deck is the OSM polyline: `onBridge` (`:385`) accepts a point only if `nearestOnPolyline(b.r.pts).d <= b.hw`
  (2.6 m). That polyline bends **up to 1.55 m off the chord** (lateral offsets at along 0/32/56/82/141/206 m:
  `0, +1.53, +1.55, −1.18, −1.37, 0`).
- So wherever the car centre is more than `2.6 − 1.55 = 1.05 m` off the chord on the side away from the bend, it is
  between the rails but off the physical deck. `groundH` returns the river bed (`wl − 3 = −3`), the car falls into the
  Rhine (`y = −1.2 = wl − 1.2`) and stops.
- The rail keeps the car centre within `±(2.6 − r)` of the chord. Before #122, `r = 1.3 × 1.3 = 1.69` → `±0.91 m`, and
  `0.91 + 1.55 = 2.46 < 2.6`, so the hole was out of reach. #122 set `scale 1.0` → `r = 1.3` → `±1.30 m`, and
  `1.30 + 1.55 = 2.85 > 2.6`: the hole is now reachable. #122 changed only `scale` and the chase cams, not
  `collision.r`. `carRadius()` (`:1126`) multiplies by `scale`.

Headless trace (main `2d6ae2d`, `__mm.sim` from the smoke test start, −8°): the car slides along at lateral −1.08 m, the
polyline is 2.63 m away (> 2.6) at along 47.7 m, `onBridge` turns false, `groundH` −3, and the car sinks and stops at
along 50.6 m. +8° side: the car rides the rail at +1.30 m and stays on the deck for 3 s, but it would fall at the
−1.37 m bend near along 141 m. The same trace with the radius forced back to 1.69 m stays on the deck on both sides.

Static check: `__mm.ground(x, z, 1e4)` at lateral ±2.2 m off the chord every 5 m along the span gives the river bed
(−3) at **34 of 76** points. Every one of them is visibly between the rails.

This was a latent physics/visual mismatch from the OSM hero span (the chord), not a bug in the scrape fix `c9ce340`.
The larger collider hid it.

## Decisions

| Topic | Decision |
|---|---|
| Fix | Make the physical deck match the drawn deck. A bridge piece that belongs to a straight hero span (`heroBridge`'s chord path) also counts a point as on the deck when it lies inside the span's chord corridor (`0 ≤ t ≤ len`, `|s| ≤ hw`, via `bridgeLocal`) and this piece is the hero piece nearest to the point. Deck height stays `bridgeSurfaceAt(piece, n.t)`, which is what `hAt` draws. |
| Wiring | In the heroes loop (`:933`), after `hb.rot`: `hb.pcs = pcs; for (const p of pcs) p.hero = hb;`. Rails and deck reach then come from the same `hb` and are consistent by construction. |
| Car size | Unchanged. `compact.scale 1.0`, `collision.r 1.3`. |
| Stone bridge | Unaffected. With `STONE_AXIS`, `heroStone` builds parapets along `offsetPolyline` of each piece, so they already follow the physical deck (`test_parapets_hold_on_the_mid_piece` passes on main). The stone chord fallback (no `STONE_AXIS`) gets the same corridor rule automatically. |
| Rail decks (#76), generic bridges | Unaffected. They have no car-rail OBBs and never get `.hero`. |
| Hand path | Unaffected. `BRIDGES` already use `bridgeLocal` against the same straight span the rails are on. |

Rejected:
- **Raise `collision.r` back to 1.69 m.** That would contradict #122: the car would bump walls, trees (#131) and other
  cars 0.39 m before its body touches them. It would also only hide the hole, not close it.
- **Move the rails and deck strip onto the polyline (like `heroStone`).** It would visibly bend the covered bridge
  (roof, posts, planks). That is a bigger visual change than this bug needs.
- **Widen `hw` for wood pieces.** It would also count points outside the drawn rails as deck. In the water that matters
  for `groundH`/`waterLevelAt` (a car that went off the end could stand on air).

## Tests

- RED (exists): `prototype/tests/test_smoke.py::test_car_slides_along_holzbruecke_rails`. Fails on main.
- RED (new), pins the mechanism independent of the collider: `test_holzbruecke_deck_reaches_its_rails`.
  `__mm.ground(x, z, 1e4)` at lateral ±2.2 m off the chord every 5 m from along 10 m to `len − 10` must be deck
  (`> −1`). A guard: at ±4.5 m over the river (along 60–140 m) it must stay the river bed (`< −1`), so the fix does not
  just widen the deck.
- Green guards: `test_vehicles.py::test_compact_car_is_true_to_size`, `test_fridolinsbruecke.py` (parapets, profile,
  drives), `test_smoke.py`, `test_jump.py`, `test_underpass.py`.

## Docs

CHANGELOG `[Unreleased]` / `### Fixed` (player-facing, English). A section in `test-todo.md`.

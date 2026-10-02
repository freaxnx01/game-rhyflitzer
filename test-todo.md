# Test TODO

Manual playtests still owed. Tick an item once it has been played in the browser (live: https://github.freaxnx01.ch/game-rhyflitzer/), and note what was found.

## Building heights (#17, PR #26 — merged 2026-10-02)

- [ ] **Winkel / Bodenackerstrasse quarter is recognizable:** J → Sisseln, then drive to the Hallenbad (Bodenackerstrasse 2). Check:
  - the Hallenbad sits where it should
  - Bodenackerstrasse 6 stands as the 8-storey block (about 27 m)
  - the apartment block next to it (OSM way `1326045746`, not in the 2020 survey) is a normal 12 m block, not a stub
  - the roundabout where you turn into the Ringstrasse
- [ ] **Low houses:** 28 of 123 measured houses in the quarter sit at the 2.5 m eaves floor (e.g. `171822811`: 2.5 m walls under a 5.6 m roof). Do they look plausible, or should the eaves push-down be capped? This decides whether #17 can be closed.
- [ ] Elsewhere on the Swiss side: do measured buildings look plausible (no towers out of nowhere, no sunken houses)?

## Random spot (#21, PR #27 — merged 2026-10-02)

- [ ] J → 0 (and a click on "Random spot") drops the car on a road somewhere on the map, a different spot each time, never on a bridge or motorway.
- [ ] During a race: a random spot marks the run "with a jump, not counted".

## Vehicle table (#5, PR #32 — merged 2026-10-02)

- [ ] The car looks, drives, sounds (horn H, engine, gears in the HUD) and collides exactly as before.
- [ ] All four camera views (C) frame the car as before; nitro flames (N) and turn signals (Q/E) still show.

## Minimap zoom and placement (#11, PR #31 — merged 2026-10-02)

- [ ] Wheel over the map and +/- step through 1×, 2×, 4×, 8×; zoomed in, the map follows the car; the page never scrolls.
- [ ] Double-click on the map puts the car on the nearest road there; a single click does nothing.
- [ ] On a phone: double-tap places the car exactly once; a single tap does nothing.
- [ ] Swiss keyboard: with the J menu open, `=` and `+` only zoom, they don't jump.

## Road names, house numbers, station boards (#12, PR #33 — merged 2026-10-02)

- [ ] The HUD names the road you're on (Bodenackerstrasse, Hauptstrasse …), empty off-road.
- [ ] House numbers appear near the car (Bodenackerstrasse 6 shows "6a–6d", the Hallenbad "2") and fade out further away.
- [ ] Both stations carry their "Bahnhof Sisseln" / "Bahnhof Stein-Säckingen" board.

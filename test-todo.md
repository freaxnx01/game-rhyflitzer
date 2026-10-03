# Test TODO

Manual playtests still owed. Tick an item once it has been played in the browser (live: https://github.freaxnx01.ch/game-rhyflitzer/), and note what was found.

## Building heights (#17, PR #26 — merged 2026-10-02)

- [ ] **Winkel / Bodenackerstrasse quarter is recognizable:** J → Sisseln, then drive to the Hallenbad (Bodenackerstrasse 2). Check:
  - the Hallenbad sits where it should
  - Bodenackerstrasse 6 stands as the 8-storey block (about 27 m)
  - the apartment block next to it (OSM way `1326045746`, not in the 2020 survey) is a normal 12 m block, not a stub
  - the roundabout where you turn into the Ringstrasse
  - *Playtest 2026-10-02:* better overall. Bodenackerstrasse 6 is there but looks too short — it should be the tallest building in Sisseln. Data ships it at 22.8 m (DSM, flat roof), not the ~27 m an 8-storey block needs. Hallenbad, neighbour block and roundabout not reported yet.
- [ ] **Low houses:** 28 of 123 measured houses in the quarter sit at the 2.5 m eaves floor (e.g. `171822811`: 2.5 m walls under a 5.6 m roof). Do they look plausible, or should the eaves push-down be capped? This decides whether #17 can be closed.
- [ ] Elsewhere on the Swiss side: do measured buildings look plausible (no towers out of nowhere, no sunken houses)?

## Random spot (#21, PR #27 — merged 2026-10-02)

- [ ] J → "Random spot" (the last row: select it with ↓ and press Enter, or click it) drops the car on a road somewhere on the map, a different spot each time, never on a bridge or motorway. (The `0` shortcut is gone since #41.)
- [ ] During a race: a random spot marks the run "with a jump, not counted".

## Vehicle table (#5, PR #32 — merged 2026-10-02)

- [ ] The car looks, drives, sounds (horn H, engine, gears in the HUD) and collides exactly as before.
- [ ] All four camera views (C) frame the car as before; nitro flames (N) and turn signals (Q/E) still show.

## Minimap zoom and placement (#11, PR #31 — merged 2026-10-02)

- [ ] Wheel over the map and +/- step through 1×, 2×, 4×, 8×; zoomed in, the map follows the car; the page never scrolls.
- [ ] Double-click on the map puts the car on the nearest road there; a single click does nothing.
- [ ] On a phone: double-tap places the car exactly once; a single tap does nothing.
- [ ] Swiss keyboard: with the J menu open, `=` and `+` type into the search field and no longer zoom the map (#41 routes every key to the dialog); with the menu closed they still step the zoom.

## Road names, house numbers, station boards (#12, PR #33 — merged 2026-10-02)

- [ ] The HUD names the road you're on (Bodenackerstrasse, Hauptstrasse …), empty off-road.
- [ ] House numbers appear near the car (Bodenackerstrasse 6 shows "6a–6d", the Hallenbad "2") and fade out further away.
- [ ] Both stations carry their "Bahnhof Sisseln" / "Bahnhof Stein-Säckingen" board.

## Landmark list in the J dialog (#41, PR #52 — merged 2026-10-02)

- [ ] J opens the list with the cursor in the search field; typing "münst" or "munst" leaves the Fridolinsmünster; Enter puts the car next to it.
- [ ] The Gemeinde chips filter (Sisseln: 6 landmarks); search and chip combine; Random spot is always the last row.
- [ ] While the dialog is open, R, C, M, W and Space do nothing to the car, camera or sound; after a jump they work again.
- [ ] On a phone-width window the chips wrap and the panel fits the screen.

## V hides the shadow too (#37, PR #51 — merged 2026-10-02)

- [ ] V hides the car and its shadow — no dark disc left on the road; V again brings both back.

## Hallenbad label on all four sides (#38, PR #53 — merged 2026-10-02)

- [ ] Drive around the Hallenbad Sissila: the name is readable from all four sides, each sign sits on its façade (not floating, not mirrored).

## Car parks (#40, PR #54 + world rebuild PR #55 — merged 2026-10-03)

- [x] **Hallenbad car parks** (J → Sisseln, then to the Hallenbad): the Hallenbad-Parkplatz (west of the pool, ~36 bays), the small Hallenbad-Parkplatz with capacity 18 (7 bays drawn) and Privat Parkplatz Rhyblick (~45 bays) look like the aerial view: grey asphalt, white bay rows, a blue "P" sign with the name.
  - *Playtest 2026-10-03:* "tested and car parks looking good".
- [ ] Elsewhere: roadside parking strips keep their bays along the road, no bay lines run through houses or over a road, and a car park on a slope does not float or sink.
- [ ] The car drives onto and across a car park without bumping (the lot sits 1 cm under the road surface).

## Big village names (#16)

- [ ] From the start, drive west towards Stein and Bad Säckingen: the names hang over the villages, readable from afar, not too big, not too small.
- [ ] Driving into Sisseln, Stein or Bad Säckingen: the village's own name fades out smoothly and is gone inside the village (radius tuning: `VILLAGES[].r` in `prototype/world.js`).
- [ ] Far names fade out instead of popping; two names lined up behind each other stay readable (the nearer one on top).
- [ ] Both graphic styles (T): names are not fogged.

## Debug mode (#39)

- [ ] F3 next to Bodenackerstrasse 6: a green height label floats above the house number, readable from the chase camera; the panel bottom left shows x/z/y, LV95, WGS84 and the nearest building. F3 again: everything gone, and the browser's "find" did not open.
- [ ] Click the panel and paste into a bug report: the LV95 pair finds the spot in map.geo.admin.ch, the WGS84 pair in Google Maps.
- [ ] Phone: `…/prototype/index.html?debug` opens with the panel on, top left, clear of the steering buttons.

## More landmarks in the J list (#46)

- [ ] #46: J → type `trompeter`, `gallus`, `dieb`, `kursaal`, `aqualon`; chip Eiken → Bahnhof Eiken; chip Sisseln → Gemeindehaus Sisseln, Schulhaus Sisseln. Each jump lands next to its building, and the building stands there (Schloss Schönau and the Diebsturm in the old town, away from main roads).

## Gemeinde boundaries (#48, PR #61 — merged 2026-10-03)

- [ ] G shows the boundaries (magenta on the ground, dashed on the minimap) and hides them again; the toast says on/off (in German "Gemeindegrenzen an/aus").
- [ ] Sisseln / Eiken: the line crosses the Hauptstrasse where the village sign stands, and runs over roads and water without z-fighting.

## Roofs from the measured ridge (#43)

- [ ] Bodenackerstrasse, Sisseln: 10, 12, 14, 18, 19, 20 and 21 have pitched roofs with the ridge along the long side, about 3 m high — a gentle slope, not a tent. 3, 4, 7, 8, 11, 13, 15, 16a–16c and 17 are flat.
- [ ] F3 next to 20a–20f: the height label still shows the same eaves as before (7.7 m) — only the roof shape changed.

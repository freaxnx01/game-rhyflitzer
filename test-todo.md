# Test TODO

Manual playtests still owed. Tick an item once it has been played in the browser (live: https://github.freaxnx01.ch/game-rhyflitzer/), and note what was found.

## Underwater Rhine (#101, PR #159)

Screenshot: `docs/ai-notes/screenshots/2026-10-09-underwater.png` — murky blue-green, the surface visible overhead, sand-coloured bed with boulders and weed, a school of fish: does it read as „under the Rhine", or is it too dark / too bright / too blue?

- [ ] Drive off the gravel at Sisseln into the Rhine: splash, „Sleep with the fishes!", the car sinks and lands on the bed; the picture turns blue-green while the camera goes under (not before).
- [ ] After 3 s the hint „Drive up to the bank, or press R for the road." shows once per dive.
- [ ] On the bed the car drives at walking pace, steers, and climbs out where the bed meets the bank — no kerb, no jump, no reset.
- [ ] Bubbles rise from the back of the car in the water; none on land, none in the helicopter.
- [ ] Fish circle in schools (silver, green, orange), weed stands on the bed, boulders lie about; nothing pokes through the surface.
- [ ] The capsized rowing boat and the rusty car lie at the bend below Bad Säckingen (J → Bad Säckingen, then drive in from the Rheinbrückstrasse bank and follow the river).
- [ ] **T** underwater keeps the murk in both styles; **F** takes off from the bed, the surface passes, the sky comes back.
- [ ] The chase camera in the shallows near the bank: under the surface but never inside the bed.
- [ ] The Sissle: splashing through it is slow, but you come out the other side (no reset).
- [ ] Holzbrücke and Fridolinsbrücke: unchanged, the car does not fall through.

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

## Big village names (#16, #73)

- [ ] Leave Sisseln westwards towards Sisslerfeld and Stein: once out of the village, the Swiss names hang over the villages, readable from afar, not too big, not too small. BAD SÄCKINGEN does not show from the Swiss bank (#73).
- [ ] #73 repro: drive through Sisseln along the Hauptstrasse eastwards — no MURG (and no other name) over the houses.
- [ ] On the Rhine bank between Sisseln and Murg, and on a Rhine bridge outside a village: names from both banks fade in; driving away from the river, the other bank's names fade out smoothly.
- [ ] On the German bank (e.g. north of Murg): MURG and BAD SÄCKINGEN show, the Swiss names don't.
- [ ] Driving into Sisseln, Stein or Bad Säckingen: the village's own name fades out smoothly and is gone inside the village (radius tuning: `VILLAGES[].r` in `prototype/world.js`).
- [ ] Far names fade out instead of popping; two names lined up behind each other stay readable (the nearer one on top).
- [ ] Both graphic styles (T): names are not fogged.

## Debug mode (#39)

- [ ] F3 next to Bodenackerstrasse 6: a green height label floats above the house number, readable from the chase camera; the panel bottom left shows x/z/y, LV95, WGS84 and the nearest building. F3 again: everything gone, and the browser's "find" did not open.
- [ ] Click the panel and paste into a bug report: the LV95 pair finds the spot in map.geo.admin.ch, the WGS84 pair in Google Maps.
- [ ] Phone: `…/prototype/index.html?debug` opens with the panel on, top left, clear of the steering buttons.
- [ ] #70: F3, stand right next to Bodenackerstrasse 6 (and the 38 m block at `155170807`) in every camera view (C): the height label is fully readable, sits on the upper façade, and rises back above the roof as you drive away. No visible jitter while driving.
- [ ] #74: F3, then click **?**: the legend opens below the lines and explains every value; click **?** again to close it. Clicking **?** or the legend does not copy; clicking the lines still does. Switch EN/DE: labels and legend change at once.
- [ ] #74 phone: `…/prototype/index.html?debug`, tap **?** — the legend is readable, and the panel still leaves the steering buttons free.

## More landmarks in the J list (#46)

- [ ] #46: J → type `trompeter`, `gallus`, `dieb`, `kursaal`, `aqualon`; chip Eiken → Bahnhof Eiken; chip Sisseln → Gemeindehaus Sisseln, Schulhaus Sisseln. Each jump lands next to its building, and the building stands there (Schloss Schönau and the Diebsturm in the old town, away from main roads).

## Gemeinde boundaries (#48, PR #61 — merged 2026-10-03)

- [ ] G shows the boundaries (magenta on the ground, dashed on the minimap) and hides them again; the toast says on/off (in German "Gemeindegrenzen an/aus").
- [ ] Sisseln / Eiken: the line crosses the Hauptstrasse where the village sign stands, and runs over roads and water without z-fighting.

## Roofs from the measured ridge (#43)

- [ ] Bodenackerstrasse, Sisseln: 10, 12, 14, 18, 19, 20 and 21 have pitched roofs with the ridge along the long side, about 3 m high — a gentle slope, not a tent. 3, 4, 7, 8, 11, 13, 15, 16a–16c and 17 are flat.
- [ ] F3 next to 20a–20f: the height label still shows the same eaves as before (7.7 m) — only the roof shape changed.

## Look back with B (#65)

- [ ] Chase view, driving: hold **B**. The camera jumps in front of the car and looks back past it, with no swing through the car. Let go: it jumps back behind the car.
- [ ] Hold **B** while driving fast through Stein (houses close to the road): the camera does not end up inside a building.
- [ ] Cockpit and bumper: holding **B** shows the road behind (the bumper view from the rear bumper). Steering while looking back feels usable.
- [ ] Press **C** while holding **B**: the next view also looks back.
- [ ] The minimap and the compass do not change while **B** is held.
- [ ] Open **J**, close it again: the camera is not stuck looking back.
- [ ] Hold vs. toggle: does holding B feel right, or should it be a toggle?

## Helicopter mode (#10)

- [ ] **F** during a game: the helicopter climbs to about 120 m and the view gives a real overview (how far can you see before the fog?). Does 120 m feel right?
- [ ] Flying feels controllable: **W**/**S**, **A**/**D**, **Space**/**Shift**; it rides up over the DSM tower and the Bad Säckingen Münster instead of clipping them.
- [ ] **F** again lands on a sensible road below, pointing along it; **R** and **J** while flying also bring the car back.
- [ ] **F** far from any road (over the Rhine, a field) does not land: the toast says there is no road below.
- [ ] Known limit: flying is keyboard-only for now (no touch buttons for F, climb or sink).
- [ ] In a race: the clock runs on, no checkpoint is collected from the air, and the result says "with the helicopter, not counted".
- [ ] German: the F1 help line, the toasts and the result text read well.

## LANDI-Turm (#81)

- [ ] J → `landi` → LANDI-Turm (Eiken). The car lands on the Bahnhofstrasse or Sisslerstrasse by the station; the tower stands just west of the Bahnhofstrasse, south of the railway, next to the LANDI halls (Sisslerstrasse 19).
- [ ] It is a tall flat-topped concrete slab, long side roughly north–south, about as tall as the DSM water tower (59 m) and much lower than the chimney (140 m). Does it read as the LANDI tower, or does it need a different shape (silo cells, a taller head house)?
- [ ] Drive into it: the car stops, no sinking, no driving through. The house number `19.1` floats above its base.
- [ ] Eiken chip in J: DSM-Kamin, Bahnhof Sisseln, Bahnhof Eiken, LANDI-Turm.

## Pause menu (#83)

- [ ] Racing at full throttle, press **Esc**: everything freezes (clock, car, engine sound), the menu shows with **Resume** highlighted. Let go of Space: the game stays paused.
- [ ] **Esc** or **P** again resumes exactly where you stopped; the clock goes on from the same tenth.
- [ ] ↑ ↓ and Tab move through the three buttons; Enter presses one. **Restart race** starts a fresh run at the start.
- [ ] With the clock running, **Main menu** asks „Abandon this run?" with **Cancel** highlighted: Esc or Cancel goes back to the menu; **Abandon** shows the start screen, the best time is unchanged, and **Start** from there works.
- [ ] Pause right after Start (car not moved yet): **Main menu** goes straight to the start screen, no question.
- [ ] Switch to another tab for a few seconds and come back: the game is paused and silent, and stays paused until you resume.
- [ ] Phone (portrait and landscape): the **II** button is reachable and does not cover the compass or the timer; the menu buttons fit, nothing scrolls sideways, the nav links are hidden while the menu is open.
- [ ] With **F3** on, pause: the debug panel stays readable behind the menu.
- [ ] In browser fullscreen, **Esc** leaves fullscreen instead of pausing (expected); **P** pauses.
- [ ] Phone: the question „Diesen Lauf abbrechen?" and both buttons fit and react to a tap.
- [ ] Feels right? Is the question annoying or reassuring?

## #77 Tab = full map

- [ ] Hold Tab while driving: the map is big and centred, the car arrow moves, releasing Tab brings back the corner minimap at the old zoom.
- [ ] Hold Tab, then Alt-Tab away and back: the full map is closed.
- [ ] Finish a race after using Tab: the time counts as a record.

## Held J (#86)

- [ ] On a real keyboard, hold **J** for about a second: the jump menu opens and stays open, the search field stays empty. Let go and press **J** once: it closes.

## Sprungschanze (#80)

- [ ] J → Sprungschanze: the gravel ramp is right ahead and clearly visible on the real terrain (not buried in a slope, not floating).
- [ ] Full gas from the jump spot: the car goes up the ramp and flies; the landing feels OK. **R** brings you back to the run-up.
- [ ] Seen from the side, the open wedge (no side walls) is acceptable — or note that it needs side walls.

## Autopilot (#18)

- [ ] O → "Smile-Kreisel" from the start: the car drives there on its own, the right turn signal blinks before the roundabout, it stops at the Kreisel and says "Arrived".
- [ ] O → a street ("Bahnhofstrasse · Stein"): the route on the minimap leads over the Fridolinsbrücke at walking pace, no jump at the bridge ends.
- [ ] A, D, W, S, Space or O while it drives: the car is yours at once, the key works as usual.
- [ ] Hold Tab (full map, #77): the blue route is on the big map too.
- [ ] Does it feel too slow / too fast in Sisseln and on the Hauptstrasse?

## Car true to size (#69)

- [ ] J → Sisseln, drive to the Hallenbad-Parkplatz: the car fits inside one white bay, with room on both sides.
- [ ] On a residential road (e.g. Bodenackerstrasse) the car looks like a normal compact next to the houses and the road width.
- [ ] All four camera views (C) frame the car well: chase and near show it as big as before, cockpit and bumper sit in the right place. Hold B in each: still right.
- [ ] Collisions match the body: lamps, hydrants and walls hit where the car visibly touches them; the Holzbrücke rails scrape where the car meets them.
- [ ] Grip and steering feel: corners, handbrake slides and nitro feel as before (or note what feels off for a follow-up).
- [ ] The shadow under the car matches the smaller body.

## Dark car windows (#123)

- [ ] All four camera views (C): the windows read as dark, tinted glass with a highlight, not as a blue block.
- [ ] Where the glass meets the body there is no flicker, also while driving and turning.
- [ ] Cockpit and bumper view: the view out is unchanged.
- [ ] Helicopter (F): its round window is the same dark glass.

## Tab holds only the map (#129)

- [ ] Hold Tab for several seconds while driving: only the big map shows, no button or link gets a focus ring.
- [ ] **J**, type a search, press Tab: the focus stays in the search field and typing goes on there.

## Solid trees (#131)

- [ ] Drive off-road into a tree (e.g. the Sisseln forest east of the village): the car stops at the trunk, the damage bar rises, the crash sound plays. Both tree styles (billboards and cones, style switch) look right — the car stops at, not inside or far in front of, the trunk.
- [ ] Driving along roads through the forest: no invisible bumps from trees at the road edge.
- [ ] Helicopter low over the forest: it keeps above the crowns, no jitter.
- [ ] Chase camera in a forest: no annoying zoom-in jumps when trunks pass behind the car.

## Stations beside the tracks (#130)

- [ ] J → "Bahnhof Sisseln": the car stands on the road in front of a station building that runs parallel to the tracks, with the platform between building and tracks. The blue "Bahnhof Sisseln" board faces the tracks and the road.
- [ ] J → "Bahnhof Stein-Säckingen": same check by the Bahnhofstrasse, the station parallel to the tracks.
- [ ] Race: checkpoint 1 (Bahnhof Sisseln) and checkpoint 5 (Bahnhof Stein-Säckingen) sit at the stations and are reachable by road; the autopilot (O) finds them.
- [ ] Driving along the tracks at Sisseln and Stein: the station box does not sit on a rail, and no tree or car park overlaps it.

## Steering wheels (#132)

- [ ] Chase cam (C): hold A or D while driving slowly: the front wheels swing visibly into the curve, the rear wheels stay straight; let go and they swing back.
- [ ] At top speed the front wheels turn less far than when crawling.
- [ ] Reverse (S) and steer: the wheels point the way you press.
- [ ] The wheels roll while driving and stop when you stop; no strange spinning in the air or in the water.
- [ ] Pause (Esc): the wheels freeze. Helicopter (F), then land again: the car's wheels are straight.
- [ ] Feel: do the swing speed (about a quarter of a second) and the 30 degree lock look right?

## Holzbrücke deck reaches the rails (#137)

- [ ] Drive over the Holzbrücke hugging the left rail, then the right rail, the whole length in both directions: the car stays on the planks, never sinks into the Rhine.
- [ ] Steer into a rail at speed: the car scrapes along and keeps going.
- [ ] Fridolinsbrücke: hugging either parapet still keeps the car on the deck.

## DeLorean (#126)

- [ ] Open the game with `?vehicle=delorean`: on the start screen the steel car stands with both gull-wing doors up; press Start and they swing shut. Both styles (style switch): the body reads as brushed steel, not grey paint.
- [ ] All four camera views (C): wedge nose with the four rectangular lamps, louvres on the rear window and the engine cover, black roof spine, the wide red tail band; no flicker where the door panels meet the body or the glass.
- [ ] Driving: slower off the line and a lower top speed than the compact, the tail slides a little sooner in a handbrake turn; horn (H) is its own two-note chord; gears 1–5 in the HUD.
- [ ] The compact (no `?vehicle=`) looks and drives exactly as before.

## Engine and horn sound (#14)

- [ ] **Horn (H, Enter):** louder than before and about a second long per press, a steady two-tone chord — not a beep that fades. Not the PostAuto three-tone horn.
- [ ] **Engine at idle and pulling away:** low idle at the start; with W the pitch rises and drops audibly at about 20, 45, 75, 110 and 150 km/h, with a short dip at each shift. Does it sound like a car rather than a synthesiser? Too buzzy, too quiet, too loud next to the horn?
- [ ] **Load:** letting off the gas at speed makes the engine darker and quieter; back on, it brightens again.
- [ ] **Jump:** in the air with gas held, the engine howls up; road noise stops until landing.
- [ ] **Nitro (N):** a hiss on top of the engine while held.
- [ ] **Mute (M)** silences everything; M again brings it back.
- [ ] **Other tab:** switch away while driving — silence; come back — the engine is there again.
- [ ] **Helicopter (F):** engine silent, a rotor thump instead; landing brings the engine back.
- [ ] **Pause (Esc / P):** pausing silences the game, resuming brings the engine back. Pausing, switching tab, coming back and resuming: still sound (the two holds are independent).
- [ ] **DeLorean (`?vehicle=delorean`):** a lazier, darker engine and a lower horn than the compact — the two cars are clearly tellable apart by ear.

## Crash sound (#104)

The numbers all live in one table (`sound.crash` per vehicle in `prototype/index.html`: `thump` 70 Hz is the
body's note, `noise` 1800 Hz the brightness, `weight` the length, `gain` the level) — tuning is a table edit.

- [ ] Bump a house at about 15 km/h: a short, quiet tick, no bang.
- [ ] Hit the same house at full speed: loud, deep and clearly longer — and not distorted.
- [ ] Scrape along a wall (steer into it and keep driving): silent the whole way, no ticking per metre.
- [ ] Press into a wall with the gas held: one crash, then quiet. No rattling, no machine gun.
- [ ] Bounce around a corner (two walls): each real hit sounds, so a hard second hit is not swallowed.
- [ ] Land from the Sprungschanze: a big drop thuds deeply, a small step barely at all.
- [ ] Drive into the Rhine: only the splash, no crash on top of it.
- [ ] **M** mutes it; nothing plays. Crash into a wall while paused (**Esc**) and resume: no crash arrives late.
- [ ] `?vehicle=delorean`: the steel car's crash is a touch brighter and harder than the compact's. Do the
      two read as different cars, or should the presets move further apart?
- [ ] Crash while the engine is loud and the horn (**H**) sounds: does #14's limiter keep the mix bearable
      (loud, but not distorted)?

## Photo with X (#113)

The photo is the WebGL canvas only, taken in the frame the key press lands in, so what you see in the 3D view
is exactly what the file holds — the HUD, the minimap and the toast are DOM elements on top and never appear.

- [ ] **X** while driving saves `rhyflitzer-YYYYMMDD-HHMMSS.png` to the downloads folder, and a "Photo taken"
      toast confirms it. Open the file: the scene, no speedometer, no map, not blank.
- [ ] The timestamp in the name is your local time, not UTC.
- [ ] All four cameras (**C**) and **B** held each give the view you were looking at.
- [ ] In the helicopter (**F**), high above the Sisslerfeld: the aerial view is in the file.
- [ ] Paused (**Esc**): **X** still saves the frozen frame, and the menu stays put (no button gets activated).
      From the "Abandon this run?" question, **X** does nothing.
- [ ] Start and result screen: **X** saves nothing.
- [ ] **J** or **O** open: `x` types into the search field and no photo is taken.
- [ ] Hold **X** down for a few seconds: exactly one file, not one per frame.
- [ ] German (**DE**): the toast reads "Foto gemacht" and **F1** lists `X` with "Foto: Ansicht als PNG
      speichern".
- [ ] Several photos in a row: does the browser ask once to allow multiple downloads, and is that acceptable?
- [ ] On a phone: there is no **X** key — should the photo get a button of its own later?

## More jump spots (#94)

- [ ] **J → "Bergsee"** (Bad Säckingen) puts the car on Am Bergsee at the shore, with the lake ahead — not in a field and not facing away from the water.
- [ ] **J → "Plattform Sisslerfeld"** shows the tower standing in front of the car on the Breitenloh, not around it; driving off takes you past its foot.
- [ ] **J → "Hallenbad Sissila"** still lands on the road by the pool, as before.

## Map links (#63)

- [ ] F3 next to Bodenackerstrasse 6, then click **OSM**, **Maps** and **Street View**: three new tabs open at that spot, the game tab stays; Street View faces the same way as the car. No "popup blocked" bar.
- [ ] Clicking a link does not show the "Copied" toast; clicking the text part of the panel still copies.
- [ ] After a click, Enter honks and does not open another tab.
- [ ] Phone (`…/prototype/index.html?debug`): the buttons in the top-left panel are tappable and open the map app or a new tab.
- [ ] On the German side (Bad Säckingen): note what Street View shows where Google has no panorama.

## Ehrendingen region (#127)

- [ ] Pick **Ehrendingen** in the Region row on the start screen: the page reloads with `?region=ehrendingen`,
      the Ehrendingen button is the marked one, the HUD and the minimap read „Ehrendingen", and picking
      **Hochrhein** again takes you back (the URL loses the parameter).
- [ ] Race Oberdorf → Im Böndlern: start at Ehrendingen Post, take the five checkpoints (Höhtal, Breitwies,
      Schulhaus Lägernbreite, Kapelle St. Anna, Tiefenwaag) in any order, finish Im Böndlern. Each checkpoint
      sits on a road, not in a field.
- [ ] Drive the Wanderweg: **J** → `wanderweg` puts the car on it; follow Hofrain and then Steinbuckweg
      up to the woods. It is gravel, it is drivable all the way, and it shows light on the minimap.
- [ ] Oberehrendingen is a village, not a forest: no trees standing in the streets or on the houses
      (the forest line is +90 m above the Surb, not Hochrhein's +18 m).
- [ ] Fly (**F**) up to the Lägern ridge: the slope is there, the camera does not clip through it, and the
      far plane still covers the whole box.
- [ ] No Hochrhein leftovers in Ehrendingen: no Sprungschanze, no Sisseln forest box, no Ortstafeln.
- [ ] The Hochrhein is unchanged: same record (`mm.best2`), same trees, Sprungschanze still jumpable,
      an uploaded `.mmh` still in place. Each region keeps its own best time.

## Car selection (#7)

- [ ] **Choose car** on the start screen: the real car turns on the stage with the scene behind it, the rest of the screen is dimmed; the Sissle Speedster reads 8 / 8 / 8 / 3, the Rhy Gullwing (DeLorean) 7 / 5 / 7 / 3. Does the car sit in the middle of the stage (not off to one side)? Is the three-quarter view a good first angle?
- [ ] ← → and dragging spin it; let go and it keeps turning by itself after two seconds.
- [ ] Click a paint: the compact's body changes at once; reload: still that colour; **Race!** drives it. Navy is the one you had before. On the DeLorean the paint reads „fixed" and the swatches are greyed out.
- [ ] Tab reaches ‹ ›, every swatch, every garage tile, Back and Race!; the yellow outline is visible on each; Enter on Race! starts the run; Esc goes back and the focus is on **Choose car** again.
- [ ] After a Blitz or Surprise hunt run: the car screen's subtitle names that mode and **Race!** restarts it, not the time trial.
- [ ] While the screen is open: T, C, M, R, J, F1, F3, V do nothing. After Back they work again.
- [ ] Phone (portrait, German): header, stage, panel and footer stack; no sideways scrolling; the eleven swatches sit in two rows; swatches and tiles are big enough for a thumb; Back / Los! stay at the bottom while you scroll; the bottom nav links and the round steering buttons are hidden while choosing.
- [ ] `?vehicle=delorean` in the address opens the game with the DeLorean selected and the screen shows it as „Auto 2 von 2".
- [ ] Night (#2) on, then Choose car: does the dimmed night scene still read, or does the stage need a lighter dim?

## Forests (#13)

- [ ] J → Sisseln, drive the Hauptstrasse east towards Eiken: the Sisslerwald stands on both sides of the road, the road itself is open (no invisible wall on the asphalt), trees do not stand on the road.
- [ ] Leave the road into a wood: the car is stopped at the first trunks (wall just inside the edge), not thrown back; reversing frees it.
- [ ] Phone: frame rate while driving along a wood's edge in both styles (T), and from the J list a jump across the map — note load time.
- [ ] Original style: the ground under the woods is darker; Smooth style: trees only.
- [ ] Trees that stick out of a car park, a stream or the railway in a wood (there should be none).

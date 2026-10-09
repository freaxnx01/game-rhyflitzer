# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com) and
[Semantic Versioning](https://semver.org).

## [Unreleased]

### Added

- The **J** list has a new place, the **Bergsee** above Bad Säckingen: it drops the car on the road Am Bergsee at the shore, looking out across the water. Type "bergsee" to find it.
- The **J** list has a new place, the **Südspange Sisslerfeld** in Eiken: it drops the car at the junction with the Laufenburgerstrasse where the new road is planned to start. Type "südspange" to find it.
- Press **X** to take a photo: the current view of the game is saved as a PNG picture on your computer, without the speedometer and map. It works in every camera, in the helicopter and while paused.
- **Blitz** — a second way to run the course: press **Blitz** on the start screen and the clock counts *down* from 90 seconds; every checkpoint adds 60. Reach the Münsterplatz with time left and you get a rank — S, A, B or C, the more seconds the better — and your best time left is remembered. Run out of time and it's over: "Time's up", with the checkpoints you made. The time trial is still there under Start.
- The **F3** debug panel now explains itself: every line has a short label (car, Swiss, GPS, nearest, car body, world), and the **?** in its corner opens a legend — what x, z, y and the heading mean, LV95 and WGS84, and how to read a building's `22.8 m +3.9 dsm` (wall height to the eaves, roof on top, and whether it was measured from swisstopo's digital surface model or comes from OpenStreetMap). Works with a tap on phones, in German and English.
- Crashes now sound like crashes: a bump is a soft tick, a hard hit a loud bang with a deep thump, and landing hard after a jump thuds. Scraping along a wall stays quiet, and pressing against a wall does not rattle. The DeLorean's steel body sounds a little brighter and harder than the compact's.
- A second car: a DeLorean look-alike in brushed stainless steel, with the flat wedge nose, the louvred rear window and gull-wing doors that swing open while the car waits on the start screen and shut when you start. It is slower off the line than the compact and its tail steps out a little sooner. Add `?vehicle=delorean` to the address to drive it; a proper car-select screen comes later.
- The front wheels turn with the steering now: they swing into the curve when you press A/D (less far the faster you drive), and all four wheels roll as the car moves.
- The **F3** debug panel now shows the size of your car (length × width × height in metres) and of the map (length × width in km, and its area in km²), so you can check the car against roads and parking bays.
- Railway bridges are real now: where the train crosses a road on a bridge — Laufenburgerstrasse in Sisseln, Hauptstrasse in Stein, Ankengasse in Mumpf and more — the tracks run over a stone deck and the road dips underneath between stone walls, with room for a lorry. Drive under it, or follow the tracks over it. Where a side street turns off right next to the bridge, the underpass is lower — mind your roof. Level crossings stay level.
- Press **O** for the autopilot: pick a place from the **J** list or any street, and the car drives there by itself — it finds the way through the road network, slows down for bends and bridges, sets the turn signals before it turns and stops when it arrives. The way ahead shows as a blue line on the map. Steer, accelerate or brake (or press **O** again) and you drive yourself. A race run with the autopilot does not count.
- The LANDI silo tower by Bahnhof Sisseln now stands in the world at its real 56 m, a grey concrete tower you can see from across the Sisslerfeld. **J** → `landi` takes you there; it is listed under Eiken, where it actually stands.
- Press **Esc** or **P** (or tap the **II** button) to pause. The car, the clock and the engine stop, and a menu lets you carry on, restart the race or go back to the start screen. If the clock is already running, going back asks „Abandon this run?" first, so a stray tap does not throw a good run away. Switching to another tab pauses the game too.
- The row houses on the Bodenackerstrasse in Sisseln now look like the real ones: white walls with a yellow panel between every two houses, yellow-framed windows and grey roller shutters, instead of the generic plaster.
- Hold **B** to look back. Behind the car, the camera swings round in front of it and looks back past it, so you see who is chasing you. In the cockpit you turn your head, and the bumper camera becomes a rear camera. Let go of **B** and you look ahead again.
- Press **F** to take off in a helicopter and look at the whole region from above: **W**/**S** fly forwards and back, **A**/**D** turn, **Space** climbs, **Shift** sinks. It flies over houses and hills on its own. **F** again lands and puts your car on the nearest road below — if there is none close by, you keep flying. In a race the clock keeps running, checkpoints don't count from the air, and the run is not recorded. Flying is keyboard-only for now.
- The game speaks German and English. Switch with **EN**/**DE** at the bottom of the screen — the start screen, the HUD, the messages, the **F1** help and the **J** menu change at once, and the choice is remembered (in the other games on this site too). Without a choice, the browser language decides. Landmark, place and street names stay as they are.
- Village names now float big over the villages, Midtown Madness style: drive towards Bad Säckingen, Stein, Sisseln, Sisslerfeld, Münchwilen, Mumpf, Murg or Wallbach and you see the name hanging in the sky from kilometres away. It fades as you drive into the village.
- Press **F3** for a debug view for playtesting: the car's position (game metres, LV95 and WGS84) and the height of every building around you, floating above its roof — measured eaves and ridge, and where the number comes from. Click the panel to copy it all into a bug report. Adding `?debug` to the address opens the game with it on.
- Press **G** to show the Gemeinde boundaries: a magenta line on the ground and a dashed one on the minimap show where Sisseln ends and Eiken begins, and every other village border on the map, the one in the middle of the Rhine included. Press **G** again to hide them.
- Car parks now look like car parks: grey asphalt with white parking bays, taken from OpenStreetMap for every open-air and roadside car park in the region — and a blue "P" sign with the name where the car park has one, like the Hallenbad-Parkplatz in Sisseln.
- Nine more places in the **J** list: Schloss Schönau (the Trompeterschloss), Gallusturm, Diebsturm, Bahnhof Bad Säckingen, the Kursaal and the Aqualon Therme in Bad Säckingen, Bahnhof Eiken, and the Gemeindehaus and Schulhaus in Sisseln. Their buildings now stand in the world too, even away from the main roads.
- The HUD now names the street you are driving on, house numbers from OpenStreetMap float above the houses around you, and both railway stations carry their blue "Bahnhof Sisseln" and "Bahnhof Stein-Säckingen" boards.
- The minimap zooms: turn the mouse wheel over it or press **+**/**-** to step through 1×, 2×, 4× and 8× — zoomed in, it follows your car. Double-click (or double-tap) the minimap to put the car on the nearest road there; during a race that counts as a jump, like **J**.
- The **J** menu has a new entry **0 · Random spot**: it drops the car on a random road somewhere on the map (during a race that counts as a jump).
- Houses on the Swiss side now have their real height, measured from swisstopo's surface model — Bodenackerstrasse 6 stands its eight storeys tall, bungalows stay low.
- **F1** shows every key. A compass rose turns with the car, a trip odometer counts your kilometres (**K** resets it), **Q**/**E** set the turn signals, **V** hides the car, and the HUD names the water you are at — Rhein, Sissle and friends. Hold **Tab** to see the whole map big in the middle of the screen.
- Hold **N** for nitro — blue flames, much harder acceleration, a higher top speed, and it never runs out.
- Press **J** to jump straight to a village or railway station (1–9 or click). A jump during a race still lets you finish, but the time doesn't count as a record.
- The online version now drives the real Hochrhein: OpenStreetMap roads, the Rhine, houses, the DSM chimney and water tower, and the measured swisstopo terrain load by themselves — no file to upload anymore.
- Street lamps, red hydrants, benches, bins, bike racks and recycling containers now stand where they really are along the roads (from OpenStreetMap). Lamps and hydrants are solid — watch the corners.
- Drive into the Rhine (or any deep water) and the game wishes you well, Midtown Madness style: "Sleep with the fishes!" — or "Grüss mir die Fische!" when the game is set to German. The car now lies in the water a moment longer before it is put back on the road.
- Press C to switch the camera: chase, closer chase, cockpit (driver's eye) and bumper cam.
- The Plattform Sisslerfeld now stands at its new spot by the Breitenloh field road in Münchwilen: four spruce posts, the round stair core with its X braces, the closed parapet box and the big pyramid roof — a stand-in until the detailed model. Only the posts and the stair core are solid, so you can drive right up to it.
- The whole Hochrhein map now comes from OpenStreetMap when the world file is present: real roads, the Rhine, bridges, and about two thousand houses along the main roads and big halls in Sisslerfeld.
- The Sisseln Hauptstrasse finally climbs the way it really does: a left bend up from the Sissle bridge, then a right bend into the village.
- New landmarks at DSM-Firmenich: the 140 m chimney with red and white bands, and the water tower.
- Swiss road markings: yellow cycle lanes in the villages, a white centre line where the road has one.

### Changed

- The car sounds like a car: the engine idles low, revs up with speed and drops at every gear change, growls under throttle and hums off it, howls when the wheels leave the ground, and hisses with nitro (**N**). The horn (**H**) is louder and holds its two-tone chord for almost a second. In the helicopter you hear the rotor instead of the engine. Switching to another tab, or pausing, silences the game.
- The car's windows are dark, tinted glass now — the same on the helicopter — instead of a murky, half see-through blue.
- **J** now opens a list of the landmarks — Fridolinsmünster, Holzbrücke, the DSM chimney, the Smile-Kreisel, Bodenackerstrasse 6c and more. Type part of a name (umlauts optional: "munster" finds the Münster) or pick a Gemeinde — Bad Säckingen, Stein, Münchwilen, Eiken, Sisseln — then press Enter or click. Keys typed into the search don't steer the car. The number keys are gone; **Random spot** is the last row.
- Enter honks the horn too, next to H (only while driving, so Enter still starts the race from the menu).
- The car is back to its real size, so it fits the parking bays and the narrow village streets. The chase cameras sit closer instead, so it still fills the picture and no longer looks like a toy car.
- Roads in the Original style now show real asphalt, photographed on the Sisseln Hauptstrasse, instead of generated grey noise.
- The Hallenbad Sissila now shows its name on all four sides, so you can read it from whichever way you drive up.
- Messages like "Grüss mir die Fische!" or "Gemeindegrenzen an" now pop up in the middle, right under the checkpoint arrow, and stay longer — 4 seconds, 5 for things that happen to you on the road — so you can read them while driving.

### Fixed

- **J** → Plattform Sisslerfeld no longer drops you inside the lookout tower. The tower stands right on the Breitenloh, so the car now starts a good 25 m down the road from it, with the tower in front of you.
- Scraping the side of the Holzbrücke no longer drops you into the Rhine. Since the car is back to its real size, it could slip off the deck between the rails where the old bridge bends. Now everything between the railings is solid planks.
- Holding **Tab** now shows only the big map. The browser no longer jumps through the buttons on the page while you hold the key.
- Trees are solid now: the car no longer drives straight through them. Hit a trunk and you stop, lose speed and take damage, just like with a lamp post — but you can still brush past the leaves. Trees never stand close enough to a road to get in the way.
- Bahnhof Sisseln and Bahnhof Stein-Säckingen now stand beside the tracks, where the real stations are, instead of up to 90 m away in a field. The two station checkpoints and the **J** entries moved with them: the Sisseln checkpoint is on the road in front of the station, the Stein one on the Bahnhofstrasse.
- The Fridolinsbrücke no longer throws the car into the air. The deck now runs level from the road in Bad Säckingen up to the road in Stein, high above the Rhine instead of sagging to the water, and the whole bridge is the stone bridge with parapets — you can no longer drive off its side into the river.
- The car no longer gets stuck next to a building it isn't touching. Buildings with an L-shaped or slanted outline used to block a whole invisible rectangle around them — on the grass beside a long low building near Sisseln, or in a narrow lane between two houses in Bad Säckingen. Now the car stops at the wall you see.
- No more trees on the car parks — the one in the middle of the Hallenbad bays is gone, and so are the others standing on asphalt and parking lines across the region.
- **J** → Fridolinsbrücke now puts you on the Swiss side in Stein, on the road and facing the bridge — no longer somewhere on the German bank.
- Holding **J** a moment too long no longer opens the jump menu and shuts it again straight away — it stays open, ready for you to type.
- **J → Sprungschanze** now really takes you to the ramp: the car stands on a run-up facing the gravel ramp, up the slope ahead — step on the gas, climb and fly. The ramp's surface now follows the ground under it. Before, the jump dropped you on a road 175 m away and the ramp was invisible (you could only feel a bump in the field).
- In the **F3** debug view, the height of a tall building right in front of you no longer floats off the top of the screen — up close, the label slides down onto the façade, and it shows through other buildings.
- Roofs on the Swiss side now follow the measured ridge: the Bodenackerstrasse row houses 10, 12, 14, 18, 19, 20 and 21 in Sisseln have their pitched roofs, 3, 4, 7, 8, 11, 13, 15, 16 and 17 stay flat — and the same rule fixes every other measured house that was drawn with the wrong roof.
- **V** now hides the car's shadow too — no more dark disc left on the road.
- Clicking an entry in the **J** menu works now. The menu said "or click" from the start, but the click never arrived — only the number keys did anything.
- The Sissle and the other streams are visible along their whole course now — from the bridge by the Smile-Kreisel too — and on the minimap. Drive in and you get wet.
- The Hallenbad Sissila is back where it belongs, at the Bodenackerstrasse, in its real size.
- The Smile-Kreisel is drivable again and sits inside the real roundabout; its island is round and stops you at the flower bed.
- No more trees on the railway, and level crossings lay the track over the road.
- The Smile-Kreisel is drivable again and sits inside the real roundabout; its island is round and stops you at the flower bed.
- No more trees on the railway, and level crossings lay the track over the road.
- The wheels no longer sink into the asphalt — at the Smile-Kreisel, at junctions and on bumpy roads the car now drives on the road you see.
- Grass and fields no longer creep over the road, and the car no longer sinks into the Smile-Kreisel.
- The railway now looks like one: rails run along the track, sleepers across.
- Scraping along a wall or the Holzbrücke rails no longer stops the car dead; only a real hit costs you speed.
- Umlauts and symbols (Säckingen, ·, →) show correctly on the start screen, in the HUD and on the map.
- The time and checkpoint panels no longer spread into a big dark box over the whole screen; the game is as bright as intended again.
- The stone piers of the Holzbrücke no longer poke up through the wooden deck.
- Fields no longer spill across roads; they now also follow the ground instead of floating as flat plates.

## [0.2.0] - 2026-09-30

### Added

- Initial versioned release of game-rhyflitzer (Map Madness): playable three.js prototype of the Hochrhein region. Starts at 0.2.0 to match the prototype's own "Prototype v0.2" label.
- Published on GitHub Pages; the site root redirects to `prototype/`.
- Hub navigation with version badge (from `version.js`), fullscreen toggle, More Games, Source, Feedback and GitHub star.

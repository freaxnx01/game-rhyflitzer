# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com) and
[Semantic Versioning](https://semver.org).

## [Unreleased]

### Added

- The row houses on the Bodenackerstrasse in Sisseln now look like the real ones: white walls with a yellow panel between every two houses, yellow-framed windows and grey roller shutters, instead of the generic plaster.
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
- **F1** shows every key. A compass rose turns with the car, a trip odometer counts your kilometres (**K** resets it), **Q**/**E** set the turn signals, **V** hides the car, and the HUD names the water you are at — Rhein, Sissle and friends. Hold **Tab** to run the game three times faster (that run won't count as a record).
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

- **J** now opens a list of the landmarks — Fridolinsmünster, Holzbrücke, the DSM chimney, the Smile-Kreisel, Bodenackerstrasse 6c and more. Type part of a name (umlauts optional: "munster" finds the Münster) or pick a Gemeinde — Bad Säckingen, Stein, Münchwilen, Eiken, Sisseln — then press Enter or click. Keys typed into the search don't steer the car. The number keys are gone; **Random spot** is the last row.
- Enter honks the horn too, next to H (only while driving, so Enter still starts the race from the menu).
- The car is 30 % bigger. It was true to size, but next to real-size houses and with the wide chase camera it felt like a toy car.
- Roads in the Original style now show real asphalt, photographed on the Sisseln Hauptstrasse, instead of generated grey noise.
- The Hallenbad Sissila now shows its name on all four sides, so you can read it from whichever way you drive up.

### Fixed

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

# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com) and
[Semantic Versioning](https://semver.org).

## [Unreleased]

### Added

- The **J** menu has a new entry **0 · Random spot**: it drops the car on a random road somewhere on the map (during a race that counts as a jump).
- Houses on the Swiss side now have their real height, measured from swisstopo's surface model — Bodenackerstrasse 6 stands its eight storeys tall, bungalows stay low.
- **F1** shows every key. A compass rose turns with the car, a trip odometer counts your kilometres (**K** resets it), **Q**/**E** set the turn signals, **V** hides the car, and the HUD names the water you are at — Rhein, Sissle and friends. Hold **Tab** to run the game three times faster (that run won't count as a record).
- Hold **N** for nitro — blue flames, much harder acceleration, a higher top speed, and it never runs out.
- Press **J** to jump straight to a village or railway station (1–9 or click). A jump during a race still lets you finish, but the time doesn't count as a record.
- The online version now drives the real Hochrhein: OpenStreetMap roads, the Rhine, houses, the DSM chimney and water tower, and the measured swisstopo terrain load by themselves — no file to upload anymore.
- Street lamps, red hydrants, benches, bins, bike racks and recycling containers now stand where they really are along the roads (from OpenStreetMap). Lamps and hydrants are solid — watch the corners.
- Drive into the Rhine (or any deep water) and the game wishes you well, Midtown Madness style: "Sleep with the fishes!" — or "Grüss mir die Fische!" in a German browser. The car now lies in the water a moment longer before it is put back on the road.
- Press C to switch the camera: chase, closer chase, cockpit (driver's eye) and bumper cam.
- The Plattform Sisslerfeld now stands at its new spot by the Breitenloh field road in Münchwilen: four spruce posts, the round stair core with its X braces, the closed parapet box and the big pyramid roof — a stand-in until the detailed model. Only the posts and the stair core are solid, so you can drive right up to it.
- The whole Hochrhein map now comes from OpenStreetMap when the world file is present: real roads, the Rhine, bridges, and about two thousand houses along the main roads and big halls in Sisslerfeld.
- The Sisseln Hauptstrasse finally climbs the way it really does: a left bend up from the Sissle bridge, then a right bend into the village.
- New landmarks at DSM-Firmenich: the 140 m chimney with red and white bands, and the water tower.
- Swiss road markings: yellow cycle lanes in the villages, a white centre line where the road has one.

### Changed

- Enter honks the horn too, next to H (only while driving, so Enter still starts the race from the menu).
- The car is 30 % bigger. It was true to size, but next to real-size houses and with the wide chase camera it felt like a toy car.
- Roads in the Original style now show real asphalt, photographed on the Sisseln Hauptstrasse, instead of generated grey noise.

### Fixed

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

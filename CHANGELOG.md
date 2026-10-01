# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com) and
[Semantic Versioning](https://semver.org).

## [Unreleased]

### Added

- The whole Hochrhein map now comes from OpenStreetMap when the world file is present: real roads, the Rhine, bridges, and about two thousand houses along the main roads and big halls in Sisslerfeld.
- The Sisseln Hauptstrasse finally climbs the way it really does: a left bend up from the Sissle bridge, then a right bend into the village.
- New landmarks at DSM-Firmenich: the 140 m chimney with red and white bands, and the water tower.
- Swiss road markings: yellow cycle lanes in the villages, a white centre line where the road has one.

### Changed

- Enter honks the horn too, next to H (only while driving, so Enter still starts the race from the menu).
- The car is 30 % bigger. It was true to size, but next to real-size houses and with the wide chase camera it felt like a toy car.
- Roads in the Original style now show real asphalt, photographed on the Sisseln Hauptstrasse, instead of generated grey noise.

### Fixed

- Umlauts and symbols (Säckingen, ·, →) show correctly on the start screen, in the HUD and on the map.
- The time and checkpoint panels no longer spread into a big dark box over the whole screen; the game is as bright as intended again.
- The stone piers of the Holzbrücke no longer poke up through the wooden deck.
- Fields no longer spill across roads; they now also follow the ground instead of floating as flat plates.

## [0.2.0] - 2026-09-30

### Added

- Initial versioned release of game-rhyflitzer (Map Madness): playable three.js prototype of the Hochrhein region. Starts at 0.2.0 to match the prototype's own "Prototype v0.2" label.
- Published on GitHub Pages; the site root redirects to `prototype/`.
- Hub navigation with version badge (from `version.js`), fullscreen toggle, More Games, Source, Feedback and GitHub star.

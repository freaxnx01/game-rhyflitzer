# Map Madness: Concept

*Codename: Rhyflitzer.* "Rhy" is Swiss German for the Rhine, a "Flitzer" is a speedster. The codename also names the curated home region.

An open-world arcade racing game in the browser, in the spirit of Midtown Madness 1 and 2, set in real towns on the Hochrhein (Swiss and German side of the Rhine).

Dedicated to my daughter.

## Pillars

- **Arcade, not simulation.** Lots of grip, exaggerated jumps, forgiving crashes. Fun beats realism.
- **Real places.** Towns built from official geodata and OpenStreetMap, with hand-built landmarks.
- **Forbidden shortcuts.** Like the Tube in MM2's London: the pedestrian-only Holzbrücke is a shortcut in the game.
- **Across the border.** Races cross the Rhine; the bridges are natural highlights.

## Game modes (from MM1)

- **Checkpoint**: checkpoints in any order, against opponents
- **Blitz**: checkpoints against the clock
- **Circuit**: closed-off lap course
- **Cruise**: free roam

## v0 scope

- **In**: one region, checkpoint races against AI opponents, blitz, cruise, both graphic styles, the Holzbrücke shortcut
- **Out (v1 or later)**: traffic, pedestrians, cops. The streets belong to the racers. The race setup UI shows these as "coming in v1" rather than as dead sliders.

## Two switchable graphic styles

Same world data, geometry, collision and gameplay; only materials, lighting and post-processing differ (`StyleProfile`, switchable at runtime).

| | "Original" (MM2 look, 2000) | "slowroads" look |
|---|---|---|
| Textures | Low-res but smooth-filtered, per-face texturing | Few; flat colors |
| Resolution | Native, optional mild downscale | Native |
| Lighting | Simple vertex/Lambert, baked shading | Soft sun, shadows |
| Atmosphere | Hard distance fog, smooth sky gradient | Atmospheric fog with color gradient, color grading |

Decision 2026-09-28: the "Original" style targets **MM2 (2000)** rather than MM1 (1999): smoother shading and gradients, more polygons and texture detail, but still hard fog and low-poly cars. The MM1 pixel-chunky look was judged too crude. The UI stays Y2K: chunky beveled steel panels, bold italic display type, yellow/orange on charcoal.

Consequences: hero assets need two material variants; procedural facades need two generators. Plan both from day one.

A stylized look is deliberate: OSM/LoD2 geometry is plain, and photoreal facades for every house would be a bottomless pit.

## UI mockups

Made in Claude Design on 2026-09-28 (canvas "Map Madness UI Mockups"): two title-screen directions (Sunset Steel: charcoal + yellow, horizontal menu bar; Blue Chrome: navy + orange, vertical menu), race setup, car selection, in-race HUD, results, style sheet. Fonts: Bungee (display), Barlow Condensed (UI).

HUD layout: speedometer, gear and damage bottom left; large rectangular map (MM1-style, with labels, route hint, checkpoints and rivals) bottom right; position and checkpoint counter top left; checkpoint arrow with distance top center; timer and event toasts top right.

The 3D backdrops in the mockups are hand-drawn SVG stand-ins, not engine renders. The real "Original" look is defined by the three.js prototype, not by the mockups.

## Starting region (v0)

**Bad Säckingen (DE), Stein, Sisseln, Sisslerfeld (CH)**, roughly 5 × 3 km.

Covers all three driving scenarios:
- Bad Säckingen old town: narrow streets, irregular angles, Fridolinsmünster
- Stein and Sisseln: village centers, Swiss roads
- Sisslerfeld: wide open roads, large halls, speed and jumps

Plus the Rhine in the middle: road bridge for cars, Holzbrücke as the forbidden shortcut.

First race idea: start in Sisseln, checkpoints across Sisslerfeld and through Stein, finish at the Münster. Taking the Holzbrücke saves ten seconds.

## Later expansion

Whole Fricktal plus German side (Rheinfelden to Laufenburg, side valleys up to Frick), with three hotspots done carefully:
- Bad Säckingen / Stein
- Laufenburg (twin town: two old towns, one bridge, two countries)
- Rheinfelden

The rest procedural, connected by motorways, highways and Rhine bridges.

## Hero assets (hand-built in Blender)

| Asset | Approach |
|---|---|
| Holzbrücke Bad Säckingen | 203.7 m long, 5 m wide, 9 spans, roofed. Model one span, Array modifier along a slightly curved path, add stone piers. Reference: 87 photos on Wikimedia Commons. |
| Fridolinsmünster | Start from LGL LoD2 (nave and roof), hand-model towers, baroque domes, facade details. Optional: phone photogrammetry (Meshroom/RealityScan) as reference or for texture baking. |
| Plattform Sisslerfeld | Wooden viewing tower, see details below. Photogrammetry from the ground and from the platform; or model in Blender from plans. |
| Later | Trompeterschloss, Laufenburg and Rheinfelden landmarks |

No ready-made models of either were found on Sketchfab.

### Plattform Sisslerfeld

Wooden viewing tower at the southern edge of the Sisslerfeld, on municipal land in **Münchwilen**, along the planned extension of the Südumfahrung. Design inspired by the Roman watchtowers along the Hochrhein.

**Location:** since September 2026 at **Geueren, Münchwilen**, beside the field road "Breitenloh" (map pin on plattform-sisslerfeld.com: 47.54290 N / 7.96774 E). It stood ≈ 500 m further north-east before; OpenStreetMap (`w1559348004`, extract of 2026-09-28) still shows that old site. The game anchor uses the new pin.

| | |
|---|---|
| Height | over 10 m |
| Platform height | 5.8 m |
| Capacity | 40–50 people |
| Weight | about 18 t |
| Material | wood |
| Foundation | 4 concrete footings, 80 cm deep; tower bolted on |
| Built by | apprentices of the timber company Häring, Eiken, with local businesses. Initiated by Christoph Grenacher and former Eiken councillor Ingo Anders |
| History | built 2025, set up provisionally for the Sisslerfeldtag 2025, then dismantled; rebuilt permanently from August 2026; opened 12 September 2026 (4th Sisslerfeldtag) |

Measured from a phone scan (RealityScan, 2026-10-01; heights above the gravel pad, phone-scan scale roughly ±5 %):

| | Scan | Note |
|---|---|---|
| Platform deck | ≈ 5.5 m | densest horizontal layer; published figure 5.8 m |
| Parapet top | ≈ 6.8–7.0 m | closed board parapet ≈ 1.3 m above the deck |
| Roof eaves | ≈ 8.0–8.3 m | deep overhang |
| Roof apex | not captured | scan ends at 9.4 m; OSM tags `height=11` |
| Corner posts | ≈ 3.0 m from the tower axis | square of ≈ 4.2 m side, ≈ 6 m diagonal |
| Slatted core | ≈ 3–3.5 m diameter | stair core between the posts |
| Platform | ≈ 7.5 m square (±1 m) | cantilevers well beyond the posts |

For the game:
- Wood has texture and surface, so phone photogrammetry works for the lower half: core, posts, X-bracing and the gravel pad came out usable. The upper half did not: shot from below against a bright sky, RealityScan turned sky into floating grey surfaces, thin parapet and roof edges dissolved, and the top of the pyramid roof is simply never seen from the ground. 524 k triangles and an 8k texture are far beyond a game asset anyway. Use the scan as **reference only** (dimensions above, wood and gravel texture), model the tower by hand (≈ 2–5 k triangles).
- A better scan: overcast day, more oblique shots from close to the base looking up, a ring of shots from the platform itself for the parapet; the roof only with a drone (or from the plans).
- Most accurate source: construction plans from Häring (the apprentices designed it). Ask, see [07](07-brands-and-permissions.md).
- Gameplay: stop the car, get out, climb up (see [ideas.md](../ideas.md)).

Sources: [NFZ, Wiederaufbau der Sisslerfeld-Plattform](https://www.nfz.ch/wiederaufbau-der-sisslerfeld-plattform-gestartet), [Aargauer Zeitung, römische Wachttürme](https://www.aargauerzeitung.ch/aargau/fricktal/sisslerfeld-mobile-aussichtsplattform-eingeweiht-ld.4011196), [plattform-sisslerfeld.com](https://www.plattform-sisslerfeld.com/)

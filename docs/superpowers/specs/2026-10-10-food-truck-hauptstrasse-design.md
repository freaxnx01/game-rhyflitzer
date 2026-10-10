# Güggeli food truck to its real spot on the Hauptstrasse in Eiken (#205) — design

Status: enriched 2026-10-10 (`--quick`). Playtest entry 01. **Blocked by #47** (region south).

## Problem

The truck (#103) stands on the Bahnhof Eiken car park, a first guess (`pipeline/anchors.json`, `foodTruck`, `game: [1758.5, 1986.5]`).
The real spot is 47.5302471 N, 7.9924156 E on the Hauptstrasse in Eiken.

## Facts (computed 2026-10-10 with `pipeline/frame`'s LV95 transformer from the world origin 47.5506 / 7.9671)

- The real spot is game (x, z) = (1921.6, 2249.8). The world's south edge (`DEFAULT_BBOX` south 47.532, `data/world_hochrhein.json` `bbox`)
  is at z = 2054.9 at that longitude. The spot lies **195 m south of the world's edge**: no anchor edit alone can place it; the
  generated world has no roads, ground or buildings there.
- #47 (region south to Flugplatz Schupfart) moves the south edge to 47.500 N and is being implemented locally right now
  (branch `feature/47-region-south`, cut `pipeline/cache/osm/hochrhein-south.osm.pbf` exists). That covers the spot with
  the full OSM, terrain and building data. A separate "small bbox change" would repeat the same one-time human OSM cut, terrain and world
  build for 195 m. Decision: **depend on #47**, then this is a one-line anchor change plus a world rebuild.
- The anchor type `lonlat` exists (`pipeline/anchors.py`, `frame.to_game(*entry["lonlat"])`; `plattform` uses it), so the pin goes in verbatim.
- The model (`foodTruck(x, z, rot)` in `prototype/index.html`) is a 7.1 x 2.4 m solid box, long axis = local +x (cab at +x), serving hatch on local -z
  (world direction `(sin rot, -cos rot)`); `heading_deg` is the game angle, 0 = +x (east), 90 = +z (south), `rot = radians(heading_deg)`.
  It carries an OBB, so it stops the car: it must not stand on the carriageway.

## Design

1. `anchors.json`: `foodTruck` becomes `{ "lonlat": [7.9924156, 47.5302471], "kind": "foodTruck", "heading_deg": H, "src": ... }`.
2. `H`: a throw-away probe (not committed) finds the nearest road to the pin in the rebuilt world and sets the truck's long axis parallel to it, hatch towards the road.
   If the pin lies inside the carriageway corridor (road half-width + 1 m) the truck is moved at most 8 m sideways to the verge/car park next to it
   and `src` says so. More than 8 m needed: stop and ask.
3. Rebuild `data/world_hochrhein.json` with the pipeline (never by hand) after #47's terrain exists. **Local only** (OSM caches + terrain on agent-dev), cannot go to the `ai-implement` runner.
4. Tests: pipeline anchor test and golden test switch from the car park to the new spot; the browser tests read the anchor from the world file and need no change.

Rejected: a bbox change just for the truck (a second human OSM cut, a second terrain build); `game: [x, z]` (loses the real coordinates);
hand-editing the world JSON (forbidden).

## Open decision

[needs maintainer] Is the pin the middle of the van or the spot where customers stand? Default: the pin is the van's centre, moved to the verge only if it would block the road.

# Minimap: mark the A3 (#226)

## Problem

The motorway is drawn on the minimap but not named. Roads in `data/world_hochrhein.json` carry `cls: "motorway"` and an empty `n`; there is no `ref`. The static minimap (`mapStatic` in `prototype/index.html`) only colours a road red when `r.n === 'A3'`, which is true in the hand layout only, so with the world file the A3 is grey and unlabelled.

## Design

Runtime only, no world rebuild (**local-only: no**):

- New pure `motorwayLabelSpots(roads, spacing = 1500)` in `prototype/world.js`: for every `cls === 'motorway'` way of at least 300 m (links excluded) it yields `max(1, floor(length / spacing))` evenly spread points; spots closer than 900 m to an already accepted one are dropped, longest ways first (the two carriageways of the A3 would otherwise stack two labels).
- `REGION.motorwayRef` in `prototype/regions.js` names the road: `'A3'` for Hochrhein. Every motorway in the Hochrhein world (Eiken to Frick, and the Fricktal stretch west of Stein) is the A3 (checked 2026-10-11 against the way coordinates). Ehrendingen gets no ref (nothing drawn).
- In the `mapStatic` painter: motorway ways (`r.cls === 'motorway'`) use the same red `#b05050` the hand layout uses; the ref is drawn at each spot with the existing 15 px label font plus a thin dark halo so it reads over the roads.
- Debug hook `window.__mm.motorwayLabels()` returns the drawn `{t, x, z}` list.

Why not read `ref` from OSM: needs a pipeline change and a local world rebuild (the pipeline cannot do that), for no visible gain over a constant per region. Revisit if a region ever has two motorways.

## Out of scope

Labels on other roads (primary and so on); a legend; the 3D world (motorway signs).

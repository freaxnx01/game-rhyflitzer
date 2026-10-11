# Minimap: name every Gemeinde (#228)

## Problem

The minimap paints `L.anchors.labels` from the world file: BAD SÄCKINGEN, STEIN, SISSELN, SISSLERFELD, RHEIN (twice), HOLZBRÜCKE and SCHUPFART, hand-placed in `pipeline/anchors.json`. Münchwilen, Mumpf, Murg, Wallbach, Eiken, Obermumpf, Oeschgen, Hellikon and Frick are missing, and four Gemeinden that have a boundary line in the world (`Gipf-Oberfrick`, `Kaisten`, `Wegenstetten`, `Zuzgen`) are in no name list at all.

## What the data already has (checked 2026-10-11)

- `VILLAGES` in `prototype/world.js` (`REGION.villages`): 14 names with centres (OSM place nodes), already used for the big 3D names. These cover 13 of the 17 Gemeinden in `world.boundaries[].names`.
- The 4 missing ones (Gipf-Oberfrick, Kaisten, Wegenstetten, Zuzgen) have boundary lines inside the world's road extent (x -4689..4777, z -2350..5592), so their villages are on the map, but no place-node centre is stored.
- No world rebuild needed (**local-only: no**): the minimap reads names from `REGION.villages` at runtime; the 4 new centres are plain constants like the others.

## Design

- New pure `minimapNames(villages, anchorLabels)` in `prototype/world.js`: every village `{t, x, z}`, then every anchor label whose text is not a village name (so RHEIN and HOLZBRÜCKE stay; BAD SÄCKINGEN, STEIN, SISSELN, SISSLERFELD, SCHUPFART now come from the village centre, exactly once). Anchor labels sit in the Rhine/hand-placed beside the village; the village node centre wins.
- The `mapStatic` painter draws `minimapNames(REGION.villages, L.anchors.labels)` instead of `L.anchors.labels`. Same font; names are upper-case as in `VILLAGES`.
- Add the 4 missing Gemeinden to `VILLAGES` (place-node centre via `geo.Frame(*DEFAULT_ORIGIN).to_game`, same method and comment style as the #47 entries, `r: 450`).
- Hand layout unchanged (its own label list).
- Debug hook `window.__mm.minimapNames()`.

## Consequences

- The four new `VILLAGES` entries also get the big 3D sky name (#16) and show in the village-name logic. That is consistent with Eiken/Frick (#47). Recorded as an assumption below.
- Eiken is now labelled where the village centre is (about 1.7 km, 2.1 km), which is south of the Sisseln label; the old SISSELN label moved from the Rhine bank to the village node.
- Ehrendingen: its two villages are labelled the same way (Unterehrendingen, Oberehrendingen); its world has no anchor labels, so nothing is lost.

## Out of scope

Label collision avoidance and zoom-dependent label sizes; lower-case Gemeinde names; labelling Gemeinden that are not in the boundary list.

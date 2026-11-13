# Big map: zoom with the mouse wheel (#843) - design

## Problem

While Tab is held the big map shows (#77). `mapView()` forces zoom 1 for it (`index.html:6051`), and the wheel handler
(`index.html:6059`) steps `MAP.zoom`, the minimap zoom, which the big map ignores. The wheel does nothing visible.

## Design

- **Separate big-map state** in `MAP`: `fz` (zoom, one of `ZOOMS`), `fx`, `fy` (view centre in base canvas px). The
  minimap's `MAP.zoom` is never touched while the big map is open.
- **Pure math in a new `mapzoom.js`** (no DOM, like `hudfade.js`), imported by `index.html` and tested with `node --test`:
  - `clampCentre(c, size, z)` = `clamp(c, size/2/z, size - size/2/z)`, the minimap clamp for one axis.
  - `zoomAt(view, dir, px, py, w, h, zooms)` returns the next view `{z, ox, oy}`: step `z` by `dir` inside `zooms`;
    the base point under the cursor `bx = (px - w/2)/z + ox` stays under it: `ox' = bx - (px - w/2)/z'`; then both
    centres are clamped. At the end of the list the view is returned unchanged.
- **`mapView()`**: when `MAP.full`, return `{ z: MAP.fz, ox: clampCentre(MAP.fx, w, MAP.fz), oy: ... }`. Otherwise as today.
- **`setFullMap(true)`** resets `fz = 1`, `fx = w/2`, `fy = h/2` (opens at the whole region).
- **Wheel handler**: while `MAP.full`, the same notch accumulator (100 per step, trackpads add up) calls `zoomAt` with the
  cursor in canvas px (`(clientX - r.left) * mapC.width / r.width`, as `placeFromMap` does) and stores the result in
  `fz/fx/fy`. `preventDefault` stays. Not full: unchanged, steps the minimap zoom.
- **Label**: `renderMapZoom()` shows `MAP.full ? MAP.fz : MAP.zoom`; it is called after each big-map step.
- **Debug hook**: `__mm.map()` also returns `fullZoom: MAP.fz`.
- All drawing and picking (`drawMap`, `mapPt`, `worldToMap`, `mapToWorld`, bus marks) already go through `mapView()`, so they
  stay correct with no further change.

## Assumptions

- **A1** [high] No new UI text, so no new de/en strings: the existing `#mapzoom` label shows the step.
- **A2** [med] No pan (drag) in this issue. Zooming towards the cursor plus the clamp reaches every part of the map, and
  a drag on the canvas would compete with double-click/double-tap placement (`index.html:6061-6064`). Park drag-to-pan as an idea.
- **A3** [med] The zoom keys (`+`/`-`, numpad) keep stepping the minimap zoom while the big map is open, as today
  (`tests/test_full_map.py` asserts it). Only the wheel drives the big-map zoom.
- **A4** [high] Steps are the existing `ZOOMS = [1, 2, 4, 8]`.
- **A5** [low] Big-map zoom is not remembered across Tab presses (AC: starts at 1x each time).

## Consequences

- The wheel over the minimap (Tab not held) behaves as before.
- The big map no longer follows the car while zoomed: the view is the one the user chose.

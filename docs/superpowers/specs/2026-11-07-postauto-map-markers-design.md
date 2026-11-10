# Postautos on the minimap and the full map (#711): design

**Issue:** #711. **Builds on:** #500 / PR#696 (Postautos, `POSTAUTO` in `index.html`, `busPose` in `postauto.js`).

## Problem

Playtest of line 133 (2026-11-07): the active Postautos are not on the map. The player can see the car arrow, checkpoints and
enterable doors, but not where the buses are.

## What exists

- The minimap and the full map are **one canvas**, `#map` (`index.html:435`, `mapC`/`mg`). Hold Tab sets `MAP.full` and the CSS class `full`
  on `#br`, which only enlarges the same canvas (`index.html:114`, `setFullMap`). One draw function serves both: `drawMap()`
  (`index.html:5342`).
- `drawMap()` draws, in order: static layer, bounds, borders, route, pontoon, checkpoints/hunt/view marks, enterable doors, then the
  player arrow last (`mapPt(v, P.x, P.z)`, `mg.rotate(P.th)`, 10 px long, cream with a dark outline).
- `mapPt(v, x, z)` maps world metres to canvas px (`index.html:5280`). The canvas rotation for the player arrow is the world
  heading `th` itself (x east, z south), the same convention `busPose` returns (`postauto.js:96-100`).
- Live buses: `POSTAUTO.buses` (phase `'done'` = gone), `b.trip.line` = line number, routes in `POSTAUTO.routes` (`index.html:3864`, `3874`).
  The read-only hook `window.__mm.postauto()` (`index.html:4433`) already exposes them to tests.
- The minimap is hidden below the surface (`body.below #br{display:none}`, `index.html:95`) and `setFullMap` refuses off the surface
  (`index.html:5285`), so no extra level check is needed; the draw is still guarded by `POSTAUTO.ready`.

## Design

- **Pure module `busmarks.js`** (no DOM, no three.js, `node --test`): `busMarks(buses, poseOf)` turns the live fleet into
  `{ key, line, x, z, th }` entries and skips `phase === 'done'`; `markLabel(mark, full)` gives the line number on the full map and
  `null` on the minimap; `onCanvas(px, py, w, h, pad)` tells whether a mark is worth drawing.
- **`drawPostautoMarks(v)` in `index.html`**, called from `drawMap()` right before the player arrow, so the player stays on top.
  Per mark: a yellow arrow (`#ffcc00`, dark outline, the player's shape at 80 % size) rotated by `th`; on the full map the
  line number is drawn next to it in the checkpoint font (`800 12px "Barlow Condensed"`) with a dark outline.
- **Route line:** on the full map only, the line 133 route as a faint yellow polyline (alpha 0.35, 2 px) under the arrows.
- **Test hook** `window.__mm.mapBuses()` returns `{ full, marks: [{ key, line, px, py, th, label }] }` (canvas px).
- No change to `buildPostautoMesh`, `busPose`, `postauto.js` (parallel issues #710, #713).

## Assumptions

- **A1** [high] Both maps get the markers from one change in `drawMap()`. Rejected: separate minimap and full-map code; they are the same
  canvas (`index.html:435`, `5290`).
- **A2** [high] A bus's marker position is `busPose(b.route, b.s)`, evaluated in the draw. Rejected: reading `b.y` or the mesh position;
  `busPose` is what the mesh uses (`index.html:3933`) and gives x, z and heading.
- **A3** [med] Arrow size 80 % of the player arrow on both maps, yellow `#ffcc00`, dark outline. Rejected: a bus-shaped rectangle (too small to
  read on the 200 px high minimap, `index.html:112`). Size and colour are playtest tuning.
- **A4** [med] The line number shows on the full map only, not on the minimap; at 400x200 CSS px a three-digit label would cover the road.
- **A5** [confirmed] The faint line 133 route on the full map is included. Answer: "Ja, feine Linie". It is one loop over `POSTAUTO.routes` (Task 4).
- **A6** [high] A mark disappears with the bus (`phase === 'done'`); a bus standing at a stop stays on the map. Rejected: hiding standing buses.
- **A7** [med] No new i18n strings: the only text is the line number.

## Consequences

- The minimap shows up to `PA.maxBuses` (8) extra arrows near line 133; the player arrow is drawn last and stays on top.
- Drawing calls `busPose` once per bus per map frame (about 8 calls).
- The route polyline adds one stroke per frame on the full map only.

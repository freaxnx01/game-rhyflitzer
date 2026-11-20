# Show all players on the minimap and the Tab map (#1113)

## Goal
Every other multiplayer player appears on both maps as a heading arrow in their car colour; the Tab map also shows the name.

## Findings
- `drawMap` (`index.html:8118`) draws the own marker last (arrow, `P.th`, yellow needle) and `drawPostautoMarks(v)` just before it (`index.html:8099`, the #711 precedent: arrow `m.th`, label only when `MAP.full`). Minimap and Tab map share the canvas `mapC`; `MAP.full` tells them apart.
- Remote cars: `NETCARS` (`index.html:7052`): id -> `{ car, paint, name, mesh, track, leaving }`. `paint` is a `PAINTS` id (`carselect.js:5`, `hex`); `name` is the lobby name (`syncNetCars`, `index.html:7289`).
- Position: `sampleRemote(entry.track, hostNow())` -> `{x,z,ry,flags}` (`stepNetCars`, `index.html:7351`); visible only if `flags & FLAG.visible`. Heading on the map = `-pose.ry` (trailer code `index.html:7335`: `th = -pose.ry`).
- `mapPt(v,x,z)` (`index.html:8025`) and `onCanvas` (`busmarks.js:18`) place and cull.

## Design
- New pure module `netmarks.js` (node-testable like `busmarks.js`): `netMapMarks(entries, poseOf, colorOf, visibleBit)` returns `{ id, x, z, th, color, name }` per remote car that is driving, not leaving, has a pose and a set visible flag; `netMarkLabel(mark, full)` returns the name on the full map only, else null.
- New `drawNetMarks(v)` (+ `netMapMarkList`) next to `drawPostautoMarks` in `index.html`: same arrow shape as the own marker (no needle), filled with the car colour, light outline; name above the arrow on the full map only. Called from `drawMap` right after `drawPostautoMarks(v)`, so the own marker stays on top.
- Read-only test hook `window.__mm.mapNetCars` (like `mapBuses`).
- No network or protocol change; no new strings.

## Acceptance Criteria
- [ ] In a session, each other player with a visible car shows as a heading arrow in their car colour on the minimap.
- [ ] The same arrows show on the Tab map, each with the player's name beside it; the minimap shows no names.
- [ ] Hidden (`FLAG.visible` off), leaving, pose-less or car-less players show no arrow.
- [ ] Without a session (`NET.session` falsy) nothing changes.
- [ ] The own marker is still drawn on top of the others.
- [ ] Names are drawn with `fillText` (canvas), never as HTML.
- [ ] `node --test tests/netmarks.test.mjs` passes.

## Assumptions
- **A1** [confirmed] Arrow + name on Tab map. Answer: "Arrow + name on Tab map": each other player gets a heading arrow in their car colour on both maps, like the own car's marker; the big Tab map additionally shows the player's name next to it; the minimap shows no names.
- **A2** [high] Marks come from `NETCARS` + `sampleRemote(track, hostNow())`, the same pose the 3D car uses. Rejected: raw last pose (jumps; the 3D car is interpolated). `index.html:7351`.
- **A3** [high] Drawn in a new `drawNetMarks` modelled on `drawPostautoMarks`. Rejected: inlining in `drawMap` (already one huge line). `index.html:8099-8118`.
- **A4** [high] Skip leaving/hidden/pose-less players, as `netContacts` does. `index.html:7066-7068`.
- **A5** [med] Arrow gets a cream outline (`#f5efe0`) so dark paints (navy, charcoal) stay readable on the dark map; the own marker keeps its dark outline and cream fill. Rejected: dark outline (navy and charcoal would vanish).
- **A6** [med] Unknown paint id falls back to the first `PAINTS` entry's hex (navy). `PAINTS` ids are validated on receive (`netcodec.js:243`), so this is only a guard.
- **A7** [med] Name drawn centred above the arrow (`y - 10`), 12 px bold as the Postauto label, light fill with dark stroke; no collision handling between overlapping names.

## Consequences
- Two cars with the same paint look the same on the minimap; only the Tab map tells them apart by name.
- Per frame cost: one `sampleRemote` per remote car in `drawMap` (lobby is tiny).

## Landing order (parallel issues #1108, #1114, #1116 also touch index.html)
This change touches only: `drawMap` (one call inserted after `drawPostautoMarks(v)`), new `netPaintHex` / `netMapMarkList` / `drawNetMarks` beside `drawPostautoMarks`, one import line near `index.html:1078`, one `window.__mm` line near `index.html:8044`. Expect a textual conflict only if another issue edits `drawMap`'s tail, the import block or the `__mm` hooks.

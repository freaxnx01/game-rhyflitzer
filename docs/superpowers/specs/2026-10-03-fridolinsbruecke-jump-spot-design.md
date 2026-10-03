# J → Fridolinsbrücke lands on the Swiss side (#79)

## Problem

Jumping to the Fridolinsbrücke from the **J** list (#41) puts the car on the German end. It should land on the Swiss side (Stein), on the road, facing the bridge.

## Current behaviour (evidence)

- `LANDMARK_INFO` (`prototype/landmarks.js:9`) lists `{ name: 'Fridolinsbrücke', gemeinde: 'Bad Säckingen', anchor: 'fridolinsbruecke' }`. The anchor is OSM way `w28495792` (`pipeline/anchors.json:7`), resolved by `pipeline/anchors.py:52-61` to the way's position, which in `data/world_hochrhein.json` is `(-1399.9, 480.7)` — over the Rhine, about 66 m from the German bank.
- `landmarkEntries` (`landmarks.js:51-60`) turns that into `{ n, g, x, z }`.
- `jumpTo(p)` (`prototype/index.html:923`) snaps `(p.x, p.z)` to the nearest point on any **jumpable** road (`index.html:921`: no bridge, no motorway) and keeps that segment's direction as the heading. Bridge decks are not jumpable, so the nearest road to the mid-river anchor is on the German bank: `Aufeld` (58 m, service) or `Fricktalstraße` (66 m). That is the reported bug.
- The bridge chain in the world file: `w28495792` `(-1462.6, 459.1) → (-1337.2, 502.4)`, `w319324523` `→ (-1272.3, 524.1)`, then `w175815130/131` to `(-1233.5, 533.5)` / `(-1235.8, 538.4)`. The **west end** meets `Fricktalstraße` (German spelling, Bad Säckingen DE). The **east end** meets `Schaffhauserstrasse` and the non-bridge `Fridolinsbrücke` approach ways `w175815139`, `w1382560045` … (Swiss spelling, Stein AG). So in game coordinates the Swiss side is the **east** end.
- The Swiss approach is a dual carriageway. `w175815139` `(-1196.2, 526.9) → (-1222.9, 536.1)` runs westwards towards the deck on the northern (right-hand when driving west) carriageway.

## Design

### A per-landmark jump spot, kept by hand in `landmarks.js`

A `LANDMARK_INFO` item may carry `jump: [x, z]` in game metres: where **J** puts the car for that landmark, instead of the landmark's own position. Only the Fridolinsbrücke gets one:

```js
{ name: 'Fridolinsbrücke', gemeinde: 'Bad Säckingen', anchor: 'fridolinsbruecke', jump: [-1211.0, 535.5] },   // #79: Swiss approach (Stein), westbound, ~23 m before the deck
```

`(-1211.0, 535.5)` lies on `w175815139`, about 23 m east of the deck's Swiss end.

`landmarkEntries` copies it through as `j: [x, z]` — only on entries that have one, so every other entry keeps exactly today's shape `{ n, g, x, z }` (the existing `deepEqual` tests in `prototype/tests/landmarks.test.mjs` stay unchanged).

### Facing the landmark

A new pure helper in `landmarks.js`:

```js
export function faceToward(th, x, z, tx, tz)   // th, or th + π when (cos th, sin th) points away from (tx, tz)
```

The car's forward vector is `(cos th, sin th)` (`index.html:965`), and `jumpTo` takes `th = atan2(dz, dx)` of the snapped segment, so the road direction is either along or against the way's drawing order. `faceToward` picks the one with a non-negative dot product towards the target.

### `jumpTo`

`jumpTo` snaps the **jump spot** when there is one (`p.j`), else `(p.x, p.z)` as today. When `p.j` was used, the heading is `faceToward(best.th, best.x, best.z, p.x, p.z)`: the car faces the landmark's own position (the bridge, mid-river). Without `p.j`, behaviour is byte-for-byte today's: same snap, same heading, so the map double-click (`placeFromMap`, `index.html:1065`), the hand-layout fallback list and every other landmark are untouched.

The road search moves into `nearestJumpable(px, pz)` — the **same** function, name and body the helicopter plan (#10, `docs/superpowers/plans/2026-10-03-helicopter-mode.md`, Task "Split `jumpTo`") introduces, so whichever of #10 and #79 lands second rebases onto an identical helper.

Dry run against the committed world (2026-10-03): the jump spot snaps onto `w175815139` at `(-1210.6, 535.4)`, 3.7 m from the given point, 22.9 m from the deck's Swiss end; the segment's own heading already points west, dot product with the direction to the anchor 0.79.

### Tests (test-first)

- `prototype/tests/landmarks.test.mjs`: `landmarkEntries` passes `jump` through as `j` and leaves entries without one unchanged; `faceToward` keeps a heading that points at the target and flips one that points away; the real `LANDMARK_INFO` Fridolinsbrücke item has a `jump` east of the deck's Swiss end's x minus a margin (sanity, no world needed).
- `prototype/tests/test_jump.py`: J → "fridolinsbr" → Enter puts the car within 60 m of the Swiss deck end `(-1233.5, 533.5)` and farther from the German end `(-1462.6, 459.1)`; on the road (within 4 m of a jumpable road polyline from the world file); not on a bridge (`__mm.car().bridge` false); heading (`__mm.heading()`) has a dot product > 0.5 with the direction to the anchor. Fails on today's code (car lands on the German bank).

### Strings

None. The toast is the landmark's own name, as today.

## Out of scope

- **#78** (deck not level with the roads). The car is placed on the road ~23 m before the deck, not on it (`jumpable` excludes bridges), so this fix does not depend on #78's geometry. Until #78 lands, driving on from the new spot hits the same step the issue reports — that is #78's to fix, not this one's. #78 changes how bridge pieces are grouped and how deck heights are filled; it does not move OSM roads, so the jump spot stays valid after it. If #78's verification wants a repeatable start on the Swiss bank, J → Fridolinsbrücke now gives it one.
- The Holzbrücke and other landmarks keep the nearest-road rule; nobody reported them.
- The Fridolinsbrücke's Gemeinde chip stays `Bad Säckingen` (verified in #41/#46).
- No change to `pipeline/anchors.json` or `data/world_hochrhein.json`.

## Assumptions

- **A1** [high] The jump spot is hand-kept game metres on the `LANDMARK_INFO` item in `prototype/landmarks.js`. Rejected: a `jump` field in `pipeline/anchors.json`, which would need a pipeline rebuild of `data/world_hochrhein.json` for a single point. Evidence: `LANDMARK_INFO` is already the hand-kept J table (`landmarks.js:1-2`), and game metres are stable — the region extension keeps the origin (`docs/superpowers/specs/2026-10-03-region-extension-design.md:100`, A8), and `anchors.json` itself uses hand `game` coordinates (`anchors.json:9-14`).
- **A2** [high] Swiss side = east end of the bridge chain. Evidence: the east end joins `Schaffhauserstrasse` (Swiss spelling, Stein AG), the west end `Fricktalstraße` (German spelling) in `data/world_hochrhein.json`.
- **A3** [med] The spot is on the westbound (right-hand) carriageway `w175815139`, ~23 m before the deck. Rejected: on the deck (bridges are not jumpable, `index.html:921`, and the deck heights are #78's open bug); further back on Schaffhauserstrasse (the bridge would be out of the chase camera's view).
- **A4** [med] Heading = snapped road direction, flipped to face the landmark's position (`faceToward`). Rejected: a hand `heading_deg` on the item — redundant with the road and drifts if the road is redrawn.
- **A5** [med] Generic `jump` mechanism, used by one landmark only. Rejected: a Fridolinsbrücke special case in `jumpTo`; a "prefer the Swiss bank" rule for all bridges (the Holzbrücke was not reported, and the rule needs a country lookup the world file does not have).
- **A6** [high] `nearestJumpable(px, pz)` is split out exactly as the helicopter plan (#10) does it, to keep the two changes rebase-trivial.

## Consequences

- J → Fridolinsbrücke during a race is still a jump (`placeOnRoad` sets `R.jumped`), unchanged.
- The bridge is ~190 m ahead and slightly left of the car's nose on arrival (the deck bends); the chase camera shows the deck, not the far bank.
- Whichever of #10 / #79 merges second sees a textual conflict on the `jumpTo` line in `index.html`; resolving it means keeping #79's `jumpTo` body on top of the shared `nearestJumpable`.

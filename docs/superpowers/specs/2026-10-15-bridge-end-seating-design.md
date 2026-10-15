# Bridge ends seated on the bank: no launch off the Sägeweg bridge (#227)

## Measured cause

Reproduced headless on 2026-10-15 (Playwright Chromium, SwiftShader, bundled `data/world_hochrhein.json` + `terrain_hochrhein.mmh`,
`#mmhstatus.real`). Sampling script: `window.__mm.ground(x, z, 1e4)` and `window.__mm.probe(x, z)` every 1 m along the Sägeweg
(w700036726 → bridge w80728459 `(1825.8, 1155.0) → (1852.1, 1148.3)` → w80728460), plus `window.__mm.sim` drives from both sides at 22 m/s
(79 km/h start; the car accelerates to about 115 km/h at the deck).

| Point | Ground (m) | Note |
|---|---|---|
| west deck end (1825.8, 1155.0) | 24.43 | deck end = bare terrain at the OSM end node |
| 1 m past it (1824.8, 1155.2) | 24.43 | still "on the bridge": flat plateau, terrain under it 24.81 |
| 2 m past (1823.8, 1155.5) | 25.25 | plateau ends, terrain/road take over |
| 3 m past (1822.8, 1155.8) | 25.53 | bank top ≈ 25.37 (terrain) |
| east deck end (1852.1, 1148.3) | 24.62 | |
| 1 m past (1853.1, 1148.1) | 24.62 | plateau, terrain 25.08 |
| 2 m past (1854.0, 1147.8) | 25.66 | |
| 4 m past (1856.0, 1147.3) | 26.34 | bank top ≈ 26.17 (terrain) |

So the deck sits **0.94 m (west) and 1.55 m (east) below the bank top** it should meet, and the road climbs that height in 2–3 m:
0.82 m in the single metre after the plateau on the west side (82 % grade), 1.04 m on the east side.

Drive results (`__mm.sim`, air = `y - ground`):

- **Westbound** (the video's direction, the car came to rest at x 1698.6): leaves the west deck end at 115 km/h, **air 0.76 m after 0.1 s,
  22.3 m at the apex**, lands 90 m on at x ≈ 1734 — matching the video (nose up above the treetops, about three seconds of flight).
- **Eastbound**: air 1.79 m as it enters the deck (it rides up the west bank face onto the low deck), 5.4 m over the deck, lands past the east end.

**Chain:**

1. swissALTI3D is bare earth: bridges are removed, so the OSM end node of a short bridge lies partway down the bank, not on its top.
2. `fillBridgeHeights()` (`prototype/index.html:649`) sets every OSM deck's end heights `h0/h1` to `terrainH` at its end nodes. Only the
   stone hero chain is re-seated on the bank tops (`buildStoneChain`, #78, `index.html:633-648`); every **generic** bridge keeps the low end.
3. Past an open end, `onBridge` (`index.html:555`) still answers with the deck for points within `hw` of the end (`ownsEnd`,
   `index.html:546`, plus the endpoint clamp of `nearestOnPolyline`), and `surfaceGroundH` (`index.html:814`) returns the deck surface
   there **instead of** the higher terrain. That is the flat plateau the #78 comment at `index.html:544-545` already names as "the step that
   threw the car off the Fridolinsbrücke"; #78 fixed it only for the stone chain.
4. At `hw` past the end the ground switches back to terrain/road: a wall of 0.8–1.0 m in one metre. At 32 m/s that turns into a vertical
   speed of roughly 25 m/s, the 22 m jump.

### It is not only the Sägeweg

The same probe over every OSM road bridge end in the Hochrhein world (119 ways, 238 ends; ground sampled 0.5 m inside the deck and 0–12 m
straight on past the end):

- **36 ends** rise more than **1.0 m within a single metre** past the end, 86 more than 0.5 m.
- **183 ends** have a bank top (`bankTop`, 8 % over 4 m) within 12 m of the end; **41** of them sit more than 0.5 m below it, 21 more than
  1 m, one more than 3 m.
- Worst cases: Rothenbächletalbrücke (5.59 m in one metre), A3 overpass w137682787 (2.54 m), Hauptstraße w43365634 (2.15 m),
  Hebelweg w25976777 (1.68 m). The Sägeweg east end is 14th with 1.49 m.

### Relation to #147

**Different cause.** #147's step is where the underpass cut's back ramp runs out of budget below ground (`armReach` /
`cutNetwork`, `prototype/world.js:201` and `:243`, #120). It shares the symptom (a road step), not the code: no bridge deck end is involved,
and this fix does not change it.

## Design

Seat every **generic** OSM road bridge end on the bank its road continues onto, and make the ground past an open end **fill**, not deck.
Hero chains (stone, wood) and rail decks keep their own seating (`buildStoneChain`, `seatSwitchEnds`).

### 1. End heights: the bank top within 12 m

A pure helper in `prototype/world.js`:

```js
export const END_SEAT = { reach: 12, maxLift: 3 };
// #227: where a generic bridge end meets its bank. hs = bare terrain every 1 m along the continuing road, hs[0] at the end node.
// Returns { h, reach }: the bank top (bankTop, #78) when it lies within END_SEAT.reach m and at most maxLift above the end, else the end itself.
export function seatEnd(hs, u = END_SEAT)
```

- `k = bankTop(hs)`. No bank top found (`k === hs.length - 1`), `k === 0`, or `hs[k] - hs[0] > u.maxLift` → `{ h: hs[0], reach: 0 }`.
- Else `{ h: Math.max(hs[0], hs[k]), reach: k }`.

In `index.html`, a new `seatGenericEnds()` runs inside `fillBridgeHeights()` after the terrain heights are set and before `seatSwitchEnds()`.
For each OSM bridge with `kind === 'generic'` and each end: the continuing roads are `roadsFrom(end, new Set())` (non-bridge roads with an
endpoint within 0.5 m — an end joined only to another bridge piece has none and is left alone). Each road gives
`seatEnd(sampleH(cutPolyline(pts, END_SEAT.reach)))`; the end takes the **lowest** `h` among them, with that road's `reach`
(`b.reach0` / `b.reach1`). With the Sägeweg profiles this gives west `h = 25.37, reach = 3`, east `h = 26.17, reach = 4`.

### 2. Past an open end: fill, not deck

A pure helper in `prototype/world.js`:

```js
// #227: where (x, z) lies relative to the polyline's end it is past: e = pastEnd (0 on the polyline), along = metres beyond that end
// along its last segment, across = metres off that segment's line
export function endFrame(pts, x, z)  // -> { e, along, across }
```

`onBridge` changes for generic decks only: a point past an open end (`e !== 0`, that end's `fade` not `false`) is accepted while
`along <= Math.max(hw, reach)` and `across <= hw`, and the hit is marked `fill: true`. A deck hit (on the polyline) still wins over a fill
hit from another bridge, so the loop keeps looking after a fill hit. `bridgeAccepts` gating is unchanged.

`surfaceGroundH` treats a fill hit like an abutment: ground = `max(fill, terrain, road)` where `fill = bridgeSurfaceAt(b, t)` (the end's
surface — the 0.3 m offset fades to 0 at an open end, so the fill is exactly `h`). `isDeck` returns false for a fill hit (the car is on
the road behind the bridge, not on it).

### 3. Drawn: a pad over the fill

A lifted end (`h > terrainH(end) + 0.05`) gets a road-textured pad from the end node straight on for `max(hw, reach)` m, width `r.w`, laid
on `groundH(x, z, 1e4) + 0.02` — the physics ground itself, so drawn and driven surfaces cannot disagree — plus a stone skirt
(`r.w + 1.2` wide, 0.6 m down), the same two strips the generic deck already draws (`index.html:1494-1499`).

## Acceptance criteria

1. Sägeweg bridge w80728459: along the road centre line from 10 m before the deck to 10 m past it, in both directions, the ground never
   rises more than **0.35 m within one metre** (today 0.82 / 1.04 m).
2. `__mm.sim` from (1885.6, 1142.9) westbound and from (1756.8, 1165.2) eastbound at 22 m/s and at 32 m/s for 4 s with throttle: the car
   is never more than **0.3 m** above the ground (today 22.3 m and 5.4 m).
3. Across all generic OSM road bridge ends of the Hochrhein world, the number of ends whose ground rises more than 1.0 m within one metre
   past the end (same probe as the survey above: 0.5 m inside the deck, then 0–12 m straight on) drops below today's **36**.
4. Pure helpers covered by node tests: `seatEnd` (both Sägeweg profiles, steady climb, falling ground, lift above 3 m) and `endFrame`.
5. Existing bridge tests stay green: `test_fridolinsbruecke.py`, `test_holzbruecke.py`, `world.test.mjs`.
6. `CHANGELOG.md` `[Unreleased]` → `Fixed` gets a player-facing entry.

## Out of scope

- Ends whose road keeps climbing past 12 m (Rothenbächletalbrücke, Hebelweg, …): they keep the end-node height. The fill rule turns their
  plateau-then-wall into terrain-following ground, which lowers but does not remove the rise. Follow-up if playtests still find jumps.
- #78's full abutment machinery (approach pieces up to 60 m, stone skirts) for generic bridges.
- #147 (underpass cut ramp) — separate cause, see above.
- The pipeline: no world-format change, no rebuild.

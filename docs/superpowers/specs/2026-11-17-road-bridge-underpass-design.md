# Road-bridge underpasses (#1044) — Design

## Intent

A road that passes under a **road** bridge must pass under it, as it does in reality, instead of climbing over a
terrain hump to deck level. Today underpass cuts (#76, #119, #120, #844) exist only for **rail** bridges
(`L.railBridges`); under a road bridge the DTM interpolates across the bridge gap at embankment height and nothing
lowers the road.

Worst real case: **Rütistrasse, Stein** (OSM w31970306 / w31970308, unnamed in the world file) under the two A3
carriageway decks w51687867 / w51688069 (`bridge: true`, layer 1). Measured on main 2026-11-17 along the road
(`__mm.ground(x, z, 1e4)` / `(…, -1e4)`):

| z | 1060 | 1070 | 1080 | 1085 | 1091.4 | 1097 | 1103.1 | 1110 | 1115 | 1120 | 1130 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| top (deck or road) | 16.20 | 16.78 | 18.50 | 21.70 | 21.69 | 21.68 | 21.63 | 21.62 | 18.23 | 16.62 | 16.09 |
| lower surface | 16.20 | 16.78 | 18.50 | 19.87 | 21.30 | 21.14 | 21.14 | 19.97 | 18.23 | 16.62 | 16.09 |

So the road climbs 5.5 m and passes 0.4-0.5 m under the deck surface. In reality it stays level at about 16 m and
the A3 crosses above in a concrete portal.

## Confirmed decisions (maintainer, 2026-11-17 — not re-opened here)

1. **Scope:** every place where a **normal road** (lower road `cls` not `motorway` / `motorway_link`) passes under a
   road bridge with **< 4.5 m clearance** gets an underpass. Bridges whose lower road is the A3 (footbridges and
   overpasses over the motorway) are **out of scope** (separate issue later).
2. **Look:** like the rail underpasses — the road is cut down, concrete trough walls beside it under the bridge,
   banks and side roads descend. Reuse the existing cut / arm / wall machinery; no new visual system.

## Which crossings qualify (the rule)

A crossing is a segment intersection of a **generic road deck** and a lower road, found exactly as
`railRoadCrossings` finds rail crossings (lower road not a bridge, `layer` below the deck's), plus:

- **Deck:** an `OSM_BRIDGES` entry with `kind === 'generic'` and not an `approach`. The hero bridges (Holzbrücke,
  Fridolinsbrücke and their chains) and the stone abutments never get a cut.
- **Lower road:** `cls` not in `{motorway, motorway_link}` (decision 1). Paths, footways and service roads are normal
  roads under that rule (none of them qualify in today's data).
- **A real crossing, not a join:** the hit lies at least `DECK_END_GAP = 1 m` (along the deck) from both deck ends.
  145 of the 190 raw road-deck/ground-road hits in `world_hochrhein.json` are a deck piece starting or ending on the
  road it joins (`toEnd` = 0, e.g. Trottgasse w56452347); the 45 real ones all lie ≥ 5 m inside the deck.
- **Clearance below 4.5 m:** not a separate filter. Every qualifying crossing goes through `makeCut`, whose floor
  target is `deckMin − deck (1.2) − clear (4.5) − lift`; where that target is already below the ground the cut
  has `depth 0` and changes nothing, exactly as for rail. In today's world this selects precisely the maintainer's
  set: every non-motorway crossing measured below 4.5 m (deck surface − lower surface) gets depth > 0, and every
  other non-motorway crossing measures ≥ 7.68 m, above the 5.74 m the cut needs.
- **Real terrain only** (maintainer, 2026-11-17): the crossing qualifies only where the terrain model has measured
  data. `pipeline/terrain.py` fills every no-data sample with `base` and then subtracts `base`, so a no-data sample
  in the `.mmh` is **exactly `0.0`**. Test (`terrainHasData`): of the 16 `.mmh` samples of the 4 × 4 block around the
  crossing (the 8 m cell it lies in plus one ring), fewer than 8 are exactly `0`. Measured heights are relative to
  `base` (284 m a.s.l.) in float32, so exactly `0.0` in half a block does not happen on real ground; on the data, all
  16 Swiss candidates have **0 / 16** exact zeros, the two German ones **16 / 16**. Without a loaded `.mmh`
  (`REAL` null) no road crossing qualifies.
- **Never below the nearby water level** (maintainer, 2026-11-17): a road cut's floor `f0` is raised to at least
  `level + 1.0 m`, `level` = the `level` of the **nearest water polygon of at least 1000 m²** whose ring lies within
  **400 m** of the crossing (`nearbyWaterLevel`; none → no bound). Why these numbers:
  - *Water polygons, not `waterLevelAt` / the SDF:* `waterLevelAt` answers only inside the water, and the world's
    water SDF is clamped at 120 m; the Rhine at Lohgerbe is 307 m away. The polygons carry the same `level` the game
    draws and `WATER.levelAt` returns.
  - *≥ 1000 m²:* drops garden ponds and pool-sized polygons (Lohgerbe has 5 m² and 6 m² ponds at 103 / 110 m,
    Gartenstrasse a 15 m² one at 30 m, Rütistrasse 22-48 m² ones at 124-145 m) that say nothing about the ground
    water. 56 of the 176 polygons pass.
  - *400 m:* the Rhine valley-floor band, where the ground lies only a few metres above the river (Lohgerbe: ground
    3.87, Rhine −1.49). Every other candidate has either no large water within 400 m or a floor ≥ 4 m above it
    (Fricktalstraße / Mumpferfährstraße: floor 2.45, Rhine −2.00 at 339 m; Vordermattweg: 8.15 vs −2.36 at 168 m),
    so the radius changes only Lohgerbe.
  - *+1.0 m:* the polygon `level` is one static surface per water body (the shoreline on the survey day). The cut
    floor carries ~0.5 m of road structure and should still lie above a river running ~0.5 m higher than surveyed.
  - The bound applies to **road cuts only**: rail cuts keep their tested floors (`test_underpass.py` unchanged).
  - A cut raised by this bound may end with **< 4.5 m clearance; that is accepted** (maintainer).

### Candidate crossings (18 at 12 sites → 12 cut at 7 sites)

Measured on main (`clear` = deck surface − lower surface), deck end margin explained under *Main risk*. Rows 11
and 12 fail the terrain rule; rows 9, 10, 17 and 18 end capped and are dropped (*Dropped sites*, Task 3, 2026-11-17).

| # | Site | Deck (OSM) | Lower road (OSM, cls) | x, z | clear | deck end margin |
|---|---|---|---|---|---|---|
| 1 | **Rütistrasse, Stein** (A3) | w51687867 | w31970306 residential | -873.4, 1091.4 | 0.39 | 0.8 |
| 2 | ″ | w51688069 | w31970306 residential | -874.8, 1103.1 | 0.49 | 0.8 |
| 3 | **Zürcherstrasse** (A3) | w4988444 | w116017354 primary | -632.7, 1057.5 | 3.98 | **-0.1** |
| 4 | ″ | w4985551 | w116017354 primary | -610.3, 1063.5 | 4.12 | **-0.9** |
| 5 | ″ | w4988444 | w969542283 primary | -649.6, 1061.9 | 4.14 | 3.7 |
| 6 | ″ | w4985551 | w969542283 primary | -628.0, 1068.3 | 4.49 | 3.8 |
| 7 | **Kaistenbergstrasse** (A3) | w4985554 | w1238921972 tertiary | 4304.3, 4478.4 | 3.53 | 4.8 |
| 8 | ″ | w4985555 | w1238921972 tertiary | 4297.2, 4487.3 | 3.40 | 5.8 |
| ~~9~~ | **Gartenstrasse** (A3) — *dropped, capped* | w107186388 | w345612508 service | 3913.7, 4024.3 | 2.96 | **-0.6** |
| ~~10~~ | ″ — *dropped, capped* | w107186377 | w345612508 service | 3908.5, 4036.9 | 3.14 | 1.2 |
| ~~11~~ | **Jurastraße / Wallbacher Straße** (DE) — *skipped, no terrain data* | w25976772 | w331388063 tertiary | -2882.8, -238.0 | 0.30 | **0.0** |
| ~~12~~ | **Basler Straße / Feldstraße** (DE) — *skipped, no terrain data* | w28810416 | w319322059 primary | -3530.7, -1955.9 | 0.30 | 1.5 |
| 13 | **Fricktalstraße / Hebelweg** | w25976777 | w967940907 primary | -2312.1, -89.7 | 1.28 | 1.8 |
| 14 | **Fricktalstraße / Mumpferfährstraße** | w25976788 | w967940893 primary | -2256.4, 76.4 | 2.23 | 3.4 |
| 15 | **Vordermattweg / Bahnhofstrasse** | w40388838 | w28165755 residential | -3996.2, 498.0 | 4.10 | 4.6 |
| 16 | **Fabrikstraße / Murgtalbrücke** | w154394930 | w1531664793 residential | 4351.6, -1189.9 | 1.88 | 11.6 |
| ~~17~~ | **Lohgerbe** — *dropped, capped* | w162987100 | w162941411 residential | -1550.0, -324.2 | 0.65 | 22.8 |
| ~~18~~ | **service road under w1382546970** — *dropped, capped* | w1382546970 | w1238831069 service | 1797.0, 1010.1 | 0.18 | 5.1 |

Sites 11 and 12 lie on the German part of the map where the DTM has no data (all 16 samples exactly 0, the deck
flat at 0.34 m). They are **skipped and stay exactly as they are** (no cut, no walls, no deck box).

### Dropped sites (measured in Task 3, controller rulings 2026-11-17)

A road cut whose floor still ends **capped** — after its own deck and its bank roads are kept out of the cut network —
is **dropped**: no cut, no arms, no record; the site stays exactly as on main. A road that meets a bank road's far end
also counts as a cap (lowering it would pull the bank road's end, and the deck seat read from it, down with it).

| Site | Crossing(s) | Cap |
|---|---|---|
| **Gartenstrasse** (A3) | rows 9 and 10 | footbridge **w138786586** (`bridge`) starts on the service road w345612508 inside the cut, 3.4 m from the w107186377 crossing |
| **Service road under w1382546970** | row 18 | dead end **w925856926** (21.5 m side road) inside the cut network |
| **Lohgerbe** | row 17 | the deck's only bank road w91453296 (10.2 m) ends on **Werderstraße** (w967940928 / w153992480), which the network would lower ~3.8 m; that drops the bank road's end and lifts the deck seat (h0 6.53 → 8.26). The water bound is therefore never applied in today's world. |

The water bound (`ROAD_UNDERPASS`) stays in the code: it would have raised only Lohgerbe (`f0 = −1.49 + 1.0`), and
`__mm.roadCrossings()` reports `water` only where it raised a floor.

### Not changed

- Jurastraße / Wallbacher Straße and Basler Straße / Feldstraße (no terrain data).
- The 22 crossings over the A3 / its links (decision 1), e.g. footbridge w186923097, w171250354, w107186947,
  links under w4988504 / w4988494.
- Non-motorway crossings with enough headroom (cut depth 0): Ankengasse (8.59 / 8.83), Fabrikstraße under w374239097
  (7.68), Murgtalstraße (11.23 / 11.32), Harpolinger Straße (12.27).
- Every rail underpass: `CUTS`, `__mm.crossings()`, `__mm.arms()` and the walls `__mm.walls()` returns stay rail-only
  and unchanged; `tests/test_underpass.py` is not edited and stays green.
- Grades (#42, Südspange): `gradeCaps` keeps reading rail crossings only (no qualifying road crossing lies in a grade band).
- No world / pipeline rebuild: the world file already carries `bridge` and `layer` on every road.

## Design

### Pure logic (`world.js`)

- `terrainHasData(mmh, x, z)` — `mmh` = the parsed `{ hdr, data }` (`REAL`); false for `null`, else true when fewer
  than 8 of the 16 samples of the 4 × 4 block around (x, z) are exactly `0`.
- `nearbyWaterLevel(water, x, z, u = ROAD_UNDERPASS)` — the `level` of the nearest water polygon with outer-ring area
  ≥ `u.waterArea` whose ring (inside counts as 0) lies within `u.waterRadius`, else `null`.
  `ROAD_UNDERPASS = { waterRadius: 400, waterArea: 1000, waterMargin: 1.0 }`.
- `roadBridgeCrossings(roads, decks)` — `railRoadCrossings` over the lower roads that are not motorway / link, then
  drops hits closer than `DECK_END_GAP` to a deck end. `decks` is `[{ pts, layer }]`; records have the same shape as
  rail records (`road, bridge, x, z, tRoad, tRail, sin`), `bridge` indexing `decks`, `tRail` the distance along the deck.
- `deckGuards(deckPts, roads, reach = 30)` — the **bank roads** of a deck: every non-bridge road starting or ending
  within 0.5 m of a deck end, oriented away from the deck, cut to its first `reach` m, as `{ road, pts, hw }`.
- `guardedAt(x, z, guards, pad = 0.5)` — true where (x, z) lies within `hw + pad` of a guard's polyline.

### Wiring (`index.html`)

- `ROAD_DECKS` = generic, non-approach `OSM_BRIDGES`. `buildCuts` builds the rail cuts as today, then one cut per
  `roadBridgeCrossings(L.roads, ROAD_DECKS)` record with `terrainHasData(REAL, c.x, c.z)` into a new `ROAD_CUTS` array, via a `makeCut` / `deckMinAt` that take
  the deck from the record instead of `RAIL_DECKS[c.bridge]`. A road cut's floor target is
  `Math.max(cutFloorTarget(...), level + waterMargin)` when `nearbyWaterLevel` finds water (before `settleCut`, which
  only raises it further). A road cut and its arms carry `roadCut: true` and
  `guards` (the deck's `deckGuards`). Road cuts with depth > 0 join `ARMS`, so patches, walls and `openCutFaces` treat
  them like rail cuts.
- **Cut network of a road cut:** the deck's own road and its bank roads are kept out of `cutNetwork`'s road set (never
  arms, never caps). A road that meets a bank road's far end counts as a cap. A cut still capped is dropped.
- **Bank roads keep their ground** (`cutFloorMin`, every road arm against **all** road cuts' bank roads — the
  Zürcherstrasse cut under w4988444 runs on under w4985551's bank road): a road arm's floor does not apply at a point
  that is `guardedAt` and lies outside the arm's inner wall face (`hw + margin`), nor at a patch vertex within
  `hw + PATCH_BLEED` of a bank road's centre line, measured on the line extended `PATCH_BLEED` back under the deck
  (no round cap). `PATCH_BLEED` (√2 · 0.5 m, a cut cell's diagonal) is how far one patch triangle carries a lowered
  vertex; keeping every vertex that close at its ground keeps the bank ribbon's edge vertices — and so `ribbonLift`
  and the second seat pass — exactly as on main (measured: without it w4985551 h1 drops 23.75 → 23.54).
- **Walls:** the per-road wall runs ignore, as blocking "other roads", the decks over that road's road cuts and their
  guard roads (otherwise every run stops 8 m short of an A3 deck and the trough under it is open). A wall piece under
  a road deck uses the same `decksOver` rule as under a rail deck (top at the deck underside); a piece under a guard
  ribbon stops 0.05 m under that ribbon (no parapet through the bank road). Each `WALLS` entry gets `roadCut`;
  `__mm.walls()` returns the rail ones (as before), `__mm.roadWalls()` the road ones.
- **Deck body:** every generic deck that carries a road cut with depth > 0 gets a stone box per ≤ 10 m piece, top 0.02 m
  under the driven surface and `UNDERPASS.deck` (1.2 m) deep, as wide as the existing ledge (`r.w + 1.2`) — the
  concrete portal. Without it the deck is a set of upward-facing strips, invisible from the trough.
- **Debug API:** `__mm.roadCrossings()` (shape of `__mm.crossings()` minus `railGap`, plus `roadId`, `deckId`,
  `water` (the level that bounded the floor, else null), `guardDepth` = the deepest lowering under the deck's guard roads' centre lines **by road cuts** — points a rail arm's patch reaches (its `lat` + `PATCH_BLEED`) are left out: Vordermattweg's bank road ends in the Kapfstrasse rail cut, 0.65 m deep on main), `__mm.roadWalls()`,
  `__mm.rayHits(x, z, from = 2000)` (optional ray start height, so a ray can start under a deck).

## Main risk: the deck's own seat

`seatGenericEnds` runs twice: before the cuts on the bare terrain and again after the ribbons exist on `roadTopH` —
**which then includes the cut patches**. If a deck's bank road runs into the lowered band, the second pass seats that
deck end metres lower, the deck sags into its own underpass, and the bank road's ribbon droops into the trough.

Settled by measurement of the data (ribbon centre and both edges of every bank road, first 30 m, distance to the
lower road's centre line minus the lowered half-width `hw + margin + wall`): the "deck end margin" column above.
Four crossings are negative (Zürcherstrasse -0.9 / -0.1, Gartenstrasse -0.6, Jurastraße 0.0 — the last one is now skipped): their bank roads reach
**into the wall band** (never past the inner face; the worst is 0.9 m of a 2 m wall). At Gartenstrasse w107186388 the
deck ends 5 m from the crossing, inside the flat part where the floor is ~2.8 m below the ground. Hence the guard
rule above. Baseline seats on main, to stay within 0.1 m: w51687867 h0 21.50 / h1 21.21, w51688069 21.10 / 21.49,
w107186388 55.59 / 54.56, w107186377 54.33 / 56.11, w4985551 22.65 / 23.75, w4988444 21.93 / 22.78, w25976772 0.04 / 0.04.

If a future world has a bank road reaching past the inner face (margin < −2 m), the guard cannot keep it up without
blocking the trough; the unit test of the data assumption (plan, Task 1) then fails and that deck would need to be
extended instead — out of scope until it happens.

## Acceptance criteria

1. `roadBridgeCrossings` on `world_hochrhein.json` returns the 18 candidate pairs of the table (+ the 6 with enough
   headroom); `terrainHasData` is false at exactly rows 11 and 12; among the other 16, `nearbyWaterLevel` is
   non-null only at Lohgerbe (−1.49).
2. `__mm.roadCrossings()` has **12** cuts with depth > 0 and no record at rows 11 / 12. Every one has
   `clearance ≥ 4.45` or `depth ≥ 5.99` and `water` null; none is `capped` or `unsettled`; `guardDepth ≤ 0.05`.
   - **Dropped sites unchanged:** rows 9, 10, 17, 18 have no record with depth > 0 and `__mm.cutDepth` = 0 at the
     crossing.
   - **Missing terrain unchanged:** at Jurastraße (-2882.8, -238.0) and Basler Straße (-3530.7, -1955.9)
     `__mm.cutDepth(x, z)` = 0 at the crossing and every 5 m to ±30 m along the lower road, `__mm.ground(x, z, -1e4)`
     = 0.04 ± 0.02 within ±15 m (Jurastraße reaches measured terrain 20-30 m north); no `__mm.roadWalls()` piece
     within 30 m.
   - **Lohgerbe as on main:** no record, `cutDepth` 0 at the crossing and along Werderstraße within 40 m of the deck
     end.
3. **Rütistrasse:** clearance ≥ 4.45 (≥ 4 m was the floor asked for) at both decks; the road surface under both decks
   is 16.0 ± 0.5; along the road from z 1060 to 1140 the drivable top never exceeds 17.0 and no 1 m step exceeds 0.3 m.
   A car starting at (-871.3, 1074) on the road at **13.9 m/s (50 km/h)** holding W passes z 1135 within 6 s, never on
   a deck, never above y 17.5 while z ≤ 1140 (past it the road climbs the natural hill).
4. Deck seats of the baseline decks above stay within 0.1 m.
5. Visual, at both Rütistrasse crossings: the drawn deck clears the drawn road,
   `rayHits(x, z).stone − rayHits(x, z, deck − 1.3).roadOsm ≥ 1.2 + 4.45 − 0.1` (the second ray starts under the deck
   box, so it sees the trough road, not the deck's own surface); `__mm.roadWalls()` has `under` pieces on both sides
   of Rütistrasse under each A3 deck.
6. `__mm.openCutFaces()` still reports `count === 0` (now over rail and road cuts).
7. `tests/test_underpass.py` unchanged and green; all `node --test tests/*.test.mjs` green.
8. CHANGELOG entry under `[Unreleased]`.

## Sites expected to change visibly

The 7 sites with a cut (12 crossings). Most visible: Rütistrasse (5.5 m deep, the reported bug), Fricktalstraße /
Hebelweg (~4.5 m), Fabrikstraße / Murgtalbrücke (~4.2 m). Jurastraße, Basler Straße and the dropped sites
(Gartenstrasse, Lohgerbe, the service road at 1797 / 1010) do not change. Zürcherstrasse and Vordermattweg change least (~1.3-1.8 m).

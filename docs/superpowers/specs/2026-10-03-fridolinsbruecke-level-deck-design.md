# Fridolinsbrücke: a level deck that meets the roads (#78)

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-03 · Issue #78

## Problem

Playtest 2026-10-03, entry 13: "Fridolinsbrücke ist komisch: Auto springt und die Brücke müsste eben sein mit der Fahrbahn CH/DE". When you drive across the Fridolinsbrücke (Bad Säckingen DE ↔ Stein CH), the car is thrown into the air. The deck should continue level with the road on both banks.

## Reproduction (headless, 2026-10-03, `main` @ `2879b2f`, measured terrain)

Playwright against a local server (the `conftest.py` pattern), the committed `data/world_hochrhein.json` and the bundled `data/terrain_hochrhein.mmh` (`#mmhstatus.real`). The ground is `__mm.ground(x, z, 1e4)`, i.e. what `groundH` returns from above. The terrain is `__mm.probe(x, z).terrain`, i.e. the 16 m mesh `terrainH`.

**The bridge in the world file.** There are four `bridge: true` ways named `Fridolinsbrücke`, all `primary`, `w` 9:

| Way | From → to | Length | Kind today |
|---|---|---|---|
| `w28495792` | (−1462.6, 459.1) DE bank → (−1337.2, 502.4) mid-river | 132.7 m | `stone` (hero, matched by the anchor (−1399.9, 480.7)) |
| `w319324523` | (−1337.2, 502.4) → (−1272.3, 524.1) | 68.4 m | `generic` |
| `w175815130` | (−1233.5, 533.5) CH bank → (−1272.3, 524.1) | 40.0 m | `generic` (dual carriageway, westbound) |
| `w175815131` | (−1272.3, 524.1) → (−1235.8, 538.4) CH bank | 39.2 m | `generic` (dual carriageway, eastbound) |

The DE end meets two `Fricktalstraße` ways, `w1238849925` and `w25049381`. The CH ends meet the non-bridge approach ways `w1382560045` → `w175815139`, and `w632437677` → `w175815145`. The link `w175815144` and the connector `w632437676` branch off inside the same junction. All of these approaches are `bridge: false`.

**End heights today.** `fillBridgeHeights` (`prototype/index.html:374`) sets each piece's `h0`/`h1` to `terrainH` at that piece's own endpoints:

| Point | `terrainH` = deck end |
|---|---|
| DE end (−1462.6, 459.1) | 3.49 |
| mid-river joint (−1337.2, 502.4) | −1.66 |
| mid-river joint (−1272.3, 524.1) | −1.62 |
| CH end `w175815130` (−1233.5, 533.5) | 2.65 |
| CH end `w175815131` (−1235.8, 538.4) | 2.93 |

The Rhine beside the bridge (`probe` 20–40 m off the deck) has a water level of −1.62 / −1.68. So the deck forms a **V that sags to the water surface mid-river**.

**Roads at the ends.** The ground profile along the crossing, sampled every 1 m, gives these heights for the approach roads:

- **DE side, Fricktalstraße.** The road reaches the terrace (7.3–8.1) about 10 m west of the deck end. Along it, the 16 m mesh reads 3.49 → 5.10 (4 m) → 6.65 (8 m) → 7.34 (10 m) → 7.41 (11.6 m).
- **CH side, `w175815139`.** The road climbs the bank 2.65 → 8.41 (10.9 m) → 12.57 (18.2 m) → 14.97 (28.3 m) → 15.43 (32.3 m) → 15.66 (34.3 m), then stays at about 15.7–16.0.

The raw 4 m DTM (`realH`, read straight from the `.mmh`) shows the same shape: DE 3.26 at the deck end, 8.93 at 13.6 m; CH 2.26 at the deck end, 15.39 at 28 m. So this is not 16 m mesh smoothing. The Stein bank really rises about 17 m from the water to the terrace, at about 1:2. The bridge removal in swissALTI3D leaves the bare bank under the real deck. OSM's `bridge=yes` ends where the bank begins, and the bank-climbing approach roads are draped on that bare bank.

**Steps found by the profile** (consecutive 1 m samples, |Δ| > 0.25 m):

- **DE end.** At s = 36.8 m the profile drops by **−1.86 m**, from the road (5.35) onto the deck (3.49). `onBridge` clamps `nearestOnPolyline` to the endpoint, so the flat deck reaches about 4.5 m (= `hw`) past each end. That plateau is the step.
- **Mid-river joint.** There is a **+0.30 m** step and a **−0.30 m** step. `bridgeDeckOffset` (`prototype/world.js:74`) fades the 0.3 m surface offset to 0 at **every** piece end, internal joints included.
- **CH end.** The profile rises by **+2.79 m** from the plateau (2.65) to the road (5.44), and after that the road climbs **0.5–0.7 m per metre** for about 25 m.

**Driving it** (`__mm.sim` re-run deterministically with growing duration, start 20 m/s, gas held). "Air" is `y − ground`:

- **DE → CH**, from (−1490, 450), heading 0.321:
  - Air **1.77 m** at the DE end (t = 1.1 s).
  - Air **1.94 m** at the V's kink and offset bump near (−1318, 507) (t = 5.6 s, 38 m/s).
  - Air **2.69 m** where the bank road crests at the terrace near (−1194, 548) (t = 9.1 s).
- **CH → DE**, from (−1205, 535), heading −3.089:
  - Air **2.13 m** off the CH plateau (t = 1.0 s).
  - Then 0.8–1.5 m over the joint offsets.
  - Then the car leaves the deck sideways at (−1266.5, 531.8) and drops 5.85 m into the Rhine. The three `generic` pieces have **no wall OBBs**, so nothing stops a car that runs wide where the carriageways split.

## Root cause

1. **Wrong deck heights.** Every piece takes its end heights from the bare-earth terrain at its own OSM endpoints. Mid-river that is the water surface. At the banks it is the foot of the bank, under where the real deck runs. So the deck is a V from 3.49 (DE) down to −1.66 (mid-river) and up to 2.65 / 2.93 (CH). The roads meet it at 7.3 (DE terrace) and 15.7 (CH terrace).
2. **Approach roads on the bare bank.** The approaches between the OSM bridge end and the terrace are draped on that bank, at 35–55 % grades. Their crests launch the car.
3. **Steps and bumps at the ends.**
   - The endpoint clamp in `onBridge` adds a flat plateau about 4.5 m past each end. That plateau makes the 1.86 m step (DE) and the 2.79 m step (CH).
   - The offset fade at internal joints makes the ±0.30 m bumps.
   - Any step between 0 and 1 m launches the car: `stepCar` turns it into `vy = lift / dt × 0.6`, `prototype/index.html:1005`.
4. **Only the first third is the hero bridge.** The hero grouping (`index.html:739`) takes only pieces within 15 m of the anchor, i.e. `w28495792`. The rest are flat generic strips with no parapets, no piers and no wall OBBs. That is the TODO.md entry "Fridolinsbrücke only two-thirds a stone bridge".

## Design

### 1. Grow the hero group into a chain

At load time, a hero piece grows its group with every `kind: 'generic'` bridge piece that has the **same non-empty name** and **shares an endpoint** (≤ 0.5 m) with a piece already in the group. It repeats until nothing more joins. Grown pieces become `kind: 'stone'`, with `hw` 4.2, the hero deck half-width.

- Today this gives `[w28495792, w319324523, w175815130, w175815131]` (dry run on the world file). The Holzbrücke is one piece (`w85692214`), so it gets nothing.
- Candidates are `generic` only, so `kind: 'rail'` decks from #76 can never join.
- The hero grouping becomes `kind === 'wood' || kind === 'stone'`. That is the same narrowing #76 makes.

Pure helper in `prototype/world.js`: `bridgeChain(pieces, seed)` returns the indices of the grown group. `pieces` are `{ name, kind, pts }`.

### 2. Deck heights from the bank tops

Only for the `stone` chain. The Holzbrücke keeps today's heights.

- **Open ends** are the chain's endpoints that are not shared by two chain pieces. Today these are the DE end and the two CH ends. Ends within 15 m of each other form one **bank**, so the two CH ends are one bank.
- **Bank top.** From each open end, walk every connected non-bridge road (a road with an endpoint ≤ 0.5 m from the open end) and sample `terrainH` every 1 m. The bank top is the first sample whose grade over the next 4 m is below 8 %. The walk is capped at 60 m and crosses into connected roads. If no sample qualifies, the cap point is the bank top.
  - A bank's height `H` is the mean of its roads' bank-top heights.
  - Dry run from the mesh profiles: `H_DE` ≈ 7.34 at about 10 m, `H_CH` ≈ 15.43 at about 32 m.
- **Main deck line.** Chain piece end heights are linear in the projection onto the axis from the DE bank point (its open end) to the CH bank point (the mean of its open ends), clamped to `[H_DE, H_CH]`. The result:
  - The deck rises about 8.1 m over about 241 m, a grade of about 3.4 %.
  - Mid-river it stands at about 11.8, about 13.4 m above the water.
  - The two CH carriageway ends differ by about 2 cm.
- **Approach pieces (abutments).** From each open end, each connected non-bridge road gets an extra piece, and so does each road connected onward from it, up to the 60 m cap. A piece covers the road's polyline from the open end to the first point where `terrainH ≥ H` of the bank. It is found by 1 m sampling and refined to ±0.05 m. Each approach piece:
  - is `kind: 'stone'`, `approach: true`, `hw` = `max(4.2, r.w / 2)`,
  - is flat (`h0 = h1 = H`),
  - is added to `OSM_BRIDGES` and `BRIDGE_GRID`.

  A road that never reaches `H` within the cap ends at the cap point, with `h1 = terrainH` there.

  The road ribbons stay drawn underneath. The deck hides them.
- **Surface offset.** `bridgeDeckOffset(b, t)` fades the 0.3 m offset only at ends flagged open (`b.fade0`, `b.fade1`, both default `true` = today's behaviour). Chain joints, chain ends that continue as an abutment, and the joint ends of approach pieces are not flagged. Only an approach piece's far end (the abutment) fades. There the surface meets the terrain within 5 cm.

`fillBridgeHeights` runs all of this, so the order stays as it is: mesh heights first, then `fillBridgeHeights` before anything is draped. That is the same order #76 requires.

### 3. `onBridge` at abutments

- **Past an abutment.** A point beyond a piece's open far end is not on that piece. The new pure helper `pastEnd(pts, x, z)` returns −1 before the start, 1 past the end, and 0 otherwise. It removes the 4.5 m plateau at the abutments only. Generic bridges are not flagged, so they keep today's behaviour.
- **Approach pieces are solid.** They are ground for a query at any height (`b.approach || bridgeAccepts(...)`). Nothing drives underneath an abutment. That way `resetCar`/`__mm.place` (`groundH(x, z, -Infinity)`) put a car on the abutment, not on the buried bank road. This matters for #79's jump spot (−1211.0, 535.5), which lies about 23 m up the CH approach.
- **Hooks.** `__mm.car().bridge` and `__mm.sim().bridge` report `true` only on a real bridge piece, not on an approach. So #79's assertion "not on a bridge" stays valid.

### 4. Draw the whole chain as the stone bridge

The `stone` hero is drawn per piece along its polyline, instead of as one straight chord:

- **Deck:** a `road` strip, with the underside `stone` strip at −1.0, both with `bridgeSurfaceAt`.
- **Parapets:** a `stone` strip plus wall OBBs on both sides, at `hw + 0.5`, in 2 m segments. A segment is **dropped** when its midpoint lies within `hw` of another piece of the same chain. That covers the carriageway split, the joints and the branches into approach pieces. Each wall gets `y0 = local surface − 1.5`, so a boat or car in the Rhine below is not blocked.
- **Piers:** three piers at 0.3, 0.5 and 0.7 of the main chain's arc length (the `bridge: true` pieces only), as today, from `surface − 1.05` down to `water level − 5`.
- **Approach pieces:** vertical stone skirts on both sides, from the deck edge down to `terrainH`, in 2 m quads. The abutment then reads as a solid ramp wall, not a floating slab.

The Holzbrücke keeps `heroBridge` (the straight chord), and so does the hand-traced layout.

## Acceptance criteria

All on the measured terrain:

- The ground profile along the crossing (Fricktalstraße (−1488, 452.4), past a pre-existing 0.7 m road-drape step at (−1494, 450), → deck → `w175815130` → `w175815139` to (−1196.2, 526.9)), sampled every 1 m with `__mm.ground(x, z, 1e4)`:
  - has no step larger than 0.15 m between neighbouring samples,
  - has no grade steeper than 10 % over any 10 m window,
  - stands at least 5 m above the Rhine level beside the bridge over the whole river.
- At both banks, the deck at the abutment meets the road beyond it within 0.15 m.
- DE → CH from (−1490, 450) at 20 m/s with the gas held, sampled every 0.1 s for 6.5 s: the car is never more than 0.3 m above the ground, and stays on the deck.
- CH → DE from (−1215.6, 536.4), heading toward (−1254.5, 527.5), sampled for 2.0 s: never more than 0.3 m above the ground.
- On the former generic mid piece, a car steered 8° into either side at 15 m/s for 3 s stays on the deck (`bridge: true`, no water). The whole span has parapets and wall OBBs.
- `__mm.place(-1211.0, 535.5)` (#79's jump spot) puts the car on the CH abutment, with `y` ≥ `H_CH − 0.5`, `bridge: false`, and no water.
- The existing node and Playwright suites stay green, in particular the Holzbrücke rail test, the overpass test, `sinkCheck` and `grassOverRoad`.

## Interactions and landing order

- **#79 (J → Swiss side).**
  - #79 is independent of the geometry and lands **first**.
  - #78 keeps #79's jump spot valid: approach pieces are solid ground, and the hooks' `bridge` excludes them. #78 does not change `jumpTo`, `jumpable` or `landmarks.js`.
  - If #78 lands before #79, nothing conflicts. #79's Playwright test then starts the car on the abutment, at `y` ≈ 15.4 instead of ≈ 14.2.
- **#76 (rail bridges).** #76 is the larger change, needs a world rebuild, and lands **after #78**. It rebases onto #78:
  - The hero grouping is already narrowed to `wood || stone`.
  - Chain growth only takes `generic` pieces, so `kind: 'rail'` never joins.
  - #76's crossings and cuts run after `fillBridgeHeights`, which now also builds the chain and the approach pieces.
  - The Fridolinsbrücke has no rail crossing, so #76's terrain patches do not touch it.
- **Order:** #79 → #78 → #76.
- **World rebuild:** **not needed.** Everything is computed in the browser from the world file's existing roads (names, endpoints, `bridge`) and the terrain. No change to `pipeline/` or `data/`.

## Out of scope

- Other split bridges in the region, which could have the same mid-river sag. They were not reported. The helper is generic, but only hero groups grow.
- The Holzbrücke's heights.
- Real-world deck elevations, which are not in the repo. The bank tops from swissALTI3D are the reference.
- Hiding or splitting the road ribbons buried under the abutments.

## Assumptions

- **A1** [high] Root cause as measured above. Evidence: `prototype/index.html:374` (`fillBridgeHeights`), `:340` (`onBridge` endpoint clamp via `nearestOnPolyline`), `:739` (hero grouping), `:1005` (`lift / dt × 0.6`), and `prototype/world.js:74` (offset fade at every end).
- **A2** [med] The deck line runs straight between the two bank tops. A bank top is the first point on the approach whose grade over the next 4 m is below 8 %. Rejected: terrain at the OSM endpoints (today's bug); a hand-kept height per end, which would need a magic number per bridge and drifts with the terrain.
- **A3** [med] Approach pieces ("abutments") carry the deck over the bank-climbing approach roads up to the bank top, and they are solid at any height. Rejected:
  - Raising the 16 m terrain mesh. It cannot hold a road-width ramp, and #76's 2 m patch mechanism is not on `main`.
  - Re-draping the road ribbons. That needs a height override in every road, junction disc and marking path.
- **A4** [high] The chain grows by same name plus shared endpoint, `generic` candidates only. This is the fix the TODO.md entry (`TODO.md:49`) proposed. It excludes #76's `kind: 'rail'` by construction.
- **A5** [med] Parapets follow the polylines in 2 m wall segments, dropped where they would stand on another chain piece. Rejected: one straight chord, as today. At the CH split the carriageways are up to 5.4 m apart, so a chord's walls would cross one of them.
- **A6** [med] `__mm.car().bridge` and `__mm.sim().bridge` exclude approach pieces, so #79's "not on a bridge" assertion holds. Rejected: changing #79's test.
- **A7** [med] The new behaviour is limited to the `stone` hero. The Holzbrücke is one piece and keeps its heights, which `test_car_slides_along_holzbruecke_rails` pins.
- **A8** [high] No world rebuild. The fix only reads fields the world file already has.
- **A9** [med] The reproduction tests run on the measured terrain (bundled `.mmh`), because the bug only exists there. Like `test_osm_rhine_splash_and_overpass`, they skip when `data/` is missing. The procedural-terrain path is covered by the existing suites only.

## Consequences

- The Fridolinsbrücke climbs about 8 m from Bad Säckingen to Stein, at about 3.4 %. Mid-river it stands about 13 m above the Rhine, so the Rhine view from the bridge changes.
- The CH junction (`w175815139`, `w175815145`, the link `w175815144`, the connector `w632437676`) becomes an abutment deck at about 15.4. A car leaving it sideways where no road continues hits a parapet.
- The bank roads under the abutments stay drawn but are hidden. They show at most at the skirts' edges.
- `onBridge`, and with it `waterLevelAt` and placement, treats the abutment area as ground. Trees and props that skip bridge points now also skip the abutments.
- The P.safe respawn spot is not updated while the car is on an abutment (it is "on a bridge"), the same as on a deck.

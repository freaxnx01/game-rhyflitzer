# Rail bridges and road underpasses — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-03 · Issue #76

## Goal

The issue: "Dort wo Strassen/Schienen kreuzen: Möglich, Brücken/Unterführung einzufügen?" Today roads and railways cross at ground level everywhere. The track ribbon follows the terrain, even where OpenStreetMap maps a railway bridge over the road.

Success: where OSM maps a railway bridge over a road, the game draws a rail deck over the road. The road dips into a cut underneath with enough headroom, and the car drives under the deck on the road, or over it along the track. Real level crossings stay level. Test case: Laufenburgerstrasse, Sisseln. The screenshot is taken from (1570, 653), and the two track bridges cross the road at about (1569.7, 621–628).

**User decision (2026-10-03):** follow OSM `bridge`/`tunnel`/`layer` on the road and rail ways. Rail bridge decks go over roads. Road underpasses become cuts in the terrain. Real level crossings (`railway=level_crossing`) stay at grade.

## Starting point (verified 2026-10-03 on `main` @ `188eb0f`)

- **Rail export:** `pipeline/osm.py:113-115` writes `rail` as bare polylines (`[[[x, z], ...]]`) for every `railway=rail` way whose clip is one LineString. Tags are dropped, so `bridge`/`layer` never reach the game. The current world has 142 pieces.
- **Roads:** `pipeline/world_roads.py:24-33` `keep()` drops every way with `tunnel != no`. Each road carries `bridge` and `layer` (`world_roads.py:131-132`).
- **OSM data in the clip** (regional `hochrhein.osm.pbf`, probed with pyosmium):
  - **18 rail bridge ways**, all `bridge=yes, layer=1`.
  - **16 rail-bridge-over-road crossings.** These are about 8 places with 2 tracks each: Laufenburgerstrasse w4803544 at (1569, 628), Ankengasse (−3379, 736), Kapfstrasse (−4031, 546), Hauptstrasse Stein (−216, 1088), a residential road at (−886, 1210), and others. In every case the road is `layer` 0 and not a bridge.
  - **8 road-bridge-over-rail crossings**, among them the A3 and Hauptstrasse at Stein, and Höchiweg. The road deck already works there.
  - **12 at-grade crossings**, and 75 `railway=level_crossing`/`crossing` nodes.
  - No rail tunnels. No drivable `layer<0` road without a tunnel tag crosses rail.
  - **One** drivable road tunnel passes under rail: w88888614, 14 m, unclassified. The rail above it is not tagged as a bridge.
- **Test spot:** rail bridges w35583301 (1546.7, 633.0)→(1580.3, 626.0) and w1496246793 (1580.7, 619.1)→(1547.5, 626.1), both `layer=1`. Laufenburgerstrasse runs north–south through (1569.8, 619.9)–(1567.8, 655.4). On the 4 m swissALTI3D grid the track ends are 18.1–18.9 m high and the road under them about 15.2 m. That leaves only about 3.3 m between deck and road, and the 16 m game mesh smooths the dip even more. A cut is needed.
- **Road bridges in the prototype:**
  - `OSM_BRIDGES` and `BRIDGE_GRID` are built at `prototype/index.html:345-352`. The kind is `wood`, `stone` (the hero bridges) or `generic`.
  - `fillBridgeHeights` (`:354`, called at `:377`) sets the end heights `h0`/`h1` from `terrainH`.
  - `onBridge(x, z, y)` (`:319-321`) uses `bridgeSurfaceAt` and `bridgeAccepts` (`prototype/world.js:72-78`). A car more than 1.5 m below a deck is not snapped onto it. `groundH` (`:391`) asks `onBridge` first.
  - Hero grouping (`:713`) takes every `kind !== 'generic'`, and the generic strips are drawn at `:723-728`.
- **Rail in the prototype:**
  - The ribbon is drawn at `:731`, with height `max(terrainH, roadSurfH)`. That is what puts the track on the road at level crossings.
  - `railDist` (`:465`) keeps trees off the track.
  - The minimap draws a dashed rail line (`:1052`).
- **Terrain:** `TGRID` (`:359`) is a 16 m grid mesh. `terrainH` (`:360-366`) returns exactly that mesh surface, split into triangles `(a,b,d)`/`(b,c,d)` like `THREE.PlaneGeometry`. The ground mesh is built at `:669` and turned into a non-indexed geometry for `parts.grass`. Roads drape on `terrainH`, resampled every 4 m (`ribbonGeo`, `:444-453`).
- **Related #78** (Fridolinsbrücke deck not level with the roads): it changes how hero bridge pieces are grouped and how their end heights are filled, in the same `OSM_BRIDGES` block. It is out of scope here (see Interactions).

## Decisions

| Topic | Decision |
|---|---|
| Source | OSM tags. Rail ways with `bridge != no` become **rail decks**. Their `layer` defaults to 1 when it is missing. |
| Which side goes over | Compare the layers. A rail deck is over a road when the road is not a bridge and `road.layer < deck.layer`. A road bridge over rail stays as today. Everything else is at grade. |
| Pipeline change | `rail` keeps only the non-bridge pieces, unchanged. The new key `railBridges: [{pts, layer}]` holds the bridge ways, merged per layer where pieces share an endpoint (`shapely.line_merge`). Nothing else changes. |
| Where crossings and cuts are computed | In the browser. The cut depth needs the 16 m mesh heights, and only the browser has them. Pure helpers live in `prototype/world.js`. |
| Rail deck | It goes into `OSM_BRIDGES` with `kind: 'rail'`, `hw` 2.75 (5.5 m deck) and the same `h0`/`h1`/`bridgeSurfaceAt` rule. So `onBridge` and `groundH` treat it as ground from above, and the car underneath is not snapped onto it. It has no wall OBBs, like generic road bridges. |
| Deck look | A stone box, 1.2 m thick and 5.5 m wide, one box per ≤ 10 m piece, with its top at the deck surface. The track ribbon (`rail` role) lies on top. No piers, no abutment walls. |
| Clearance | `UNDERPASS = { clear: 4.5, deck: 1.2, grade: 0.08, bank: 2, margin: 1, maxDepth: 6, apron: 3 }`. Required: the deck underside (`surface − 1.2`) stands at least 4.5 m above the road surface everywhere under the deck. |
| Cut shape | Full depth along the road within `flat = deckHalfWidth / sin(angle) + 3 m` of the crossing. From there it ramps out along the road at 8 % over `depth / 0.08`. Across the road it is full depth within `road hw + 1 m`, then a 1:2 grass bank out to `+ 2 × depth`. Where cuts overlap (two tracks) the depths take the **max**, not the sum. Depth = `clamp(4.5 + 1.2 − (deckMin − roadMax), 0, 6)`, where `deckMin` is the lowest deck surface over the road and `roadMax` the highest uncut road surface within `±flat`. |
| How the terrain gets the cut | A **local mesh patch**. Every 16 m cell that a cut's footprint touches is dropped from the ground mesh and replaced by an 8 × 8 sub-grid (2 m) with the same triangle split. `terrainH` returns the patch surface inside patched cells, so the car, the road drape, trees and discs all follow the drawn ground. Patch vertices sample `meshH − cutDepth`. On the patch border the cut depth is 0, so it meets the coarse mesh without a crack. |
| Order | Build the mesh heights (uncut), then `fillBridgeHeights` (road and rail decks), then compute crossings and cuts with `meshH`, then fill the patches. Only after that is anything draped. |
| Level crossings | No code. At-grade is the default, and the track still lies on the road surface there (`:731`). Tests pin it down. |
| Road tunnels | Still dropped (`keep()` unchanged). |
| Road bridges over rail | Unchanged. The rail stays on the terrain beneath them, and their clearance is not enforced. |
| Old world files | Without `railBridges`, `layoutFromWorld` returns `[]` and the game behaves exactly as today. |
| Debug hooks | `__mm.crossings()` returns `[{x, z, road, depth, deck, clearance, railGap}]`. `__mm.cutDepth(x, z)` and `__mm.rayHits(x, z)` return the top hit height per mesh role (`grass`, `road`, `stone`, `rail`). |

## Acceptance criteria

- The pipeline writes `railBridges`, and `rail` no longer contains those pieces. The golden test finds both Laufenburgerstrasse track bridges with layer 1.
- At Laufenburgerstrasse the game reports two underpass crossings. Each has clearance ≥ 4.45 m, and the track meets each deck end within 0.3 m.
- A car placed on Laufenburgerstrasse under the deck stays on the road in the cut (`bridge: false`), at least 4.5 m below the deck. Driving north from (1565.5, 675) with gas held, it passes under both decks.
- From above, `groundH(1569.7, 628.2, 1e4)` is the deck surface. A car on the deck stays on it.
- At the level-crossing nodes (1857.6, 566.8) and (1228, 564) the cut depth is 0, and there is no underpass crossing within 30 m.
- Grass stays below the road in the cut. The existing `grassOverRoad`, `sinkCheck` and tree-on-rail tests stay green.
- Every other underpass crossing in the world reaches clearance ≥ 4.45 m, or is clamped at the 6 m maximum depth (reported).
- The hand-traced layout is unchanged.

## Interactions

- **#78:** both changes touch `index.html:345-354` and the hero grouping at `:713`. This change narrows the hero grouping to `kind === 'wood' || kind === 'stone'` so that rail decks never become hero spans. #78's piece-chaining must keep ignoring `kind: 'rail'`. Whichever lands second rebases. Bridge end heights stay `terrainH` at the ends for both.
- **World rebuild:** needed for `railBridges`. It is a guarded local task, because CI has no caches. Until then the code is inert on `main`'s world. The Playwright test injects the two Laufenburgerstrasse bridges into the served world so it can run before the rebuild.

## Out of scope

- Road tunnels, rail tunnels, piers and abutment walls, and parapet collision.
- Clearance of road bridges over rail. The #78 Fridolinsbrücke fix.
- The chase camera can pop above a deck at high speed (the existing overpass behaviour).

# Trees off the car parks — design

Status: approved headless (`/enrich 72 --headless`) 2026-10-03 · Issue #72

## Goal

No tree stands on a car park. Playtest 2026-10-03 found a tree in the middle of the Hallenbad bays (`docs/ai-notes/feedback/2026-10-03-playtest.md`, entry 04). Car parks arrived with #40 (`docs/superpowers/specs/2026-10-02-car-parks-design.md`) after the tree scatter was written, and the scatter never learned about them.

Success looks like:

- No tree's trunk or crown footprint overlaps the surface of any lot in `L.parking`, with flat and with measured terrain.
- Every other tree stays exactly where it is, and the hand-traced layout (no world file) is unchanged.
- A browser test pins it by checking `window.__TREES` against the `parking` rings of `data/world_hochrhein.json`.

## Cause

The forest scatter in `prototype/index.html` (the `for (let i = 0; i < 9000; i++)` loop after the river trees, ~line 769) accepts a spot when `free(tx, tz, 3)`, `roadDist > 6`, `railDist > 7` and no stream. `free()` (~line 467) rejects river, roads, building OBBs, checkpoints and the start, but car parks are drawn surfaces only (`parkingMeshes`, ~line 607): no OBB, not a road, so nothing rejects them.

Measured on `main` (2026-10-03, dry run against the committed world file): flat terrain 3,987 trees, 11 with the trunk inside a lot and 7 more whose crown reaches over a lot edge; measured terrain 4,299 trees, 21 + 6, among them lots of the Hallenbad quarter (`Privat Parkplatz Rhyblick`, `25049796`), `Auplatz`, `Franke` and the GETEC Park staff car park.

## Decisions

| Topic | Decision |
|---|---|
| Where | Runtime, in the tree scatter. The world file already carries the 330 lots (`parking`, committed); no pipeline change, no world rebuild. |
| What counts as "on the car park" | A tree's footprint is a disc of radius `0.45 · h` around the trunk: the crown billboards are `h · 0.9` wide (~line 816), the instanced cone is `0.42 · h` (~line 820). The tree is rejected when that disc overlaps the lot surface: trunk inside the lot, or any lot edge closer than `0.45 · h`. A tree may stand right next to a lot. |
| Islands (`holes`) | Not car park: a tree inside a hole is kept when its disc fits inside the hole. (No lot has holes today; this only keeps the rule honest.) |
| Not via `free()` | `free()` is shared with `housesAlong`, `hall` and the Sisseln row houses; widening it would move buildings. The tree loop gets its own check. |
| Random sequence | The height `rr(6, 12)` is drawn **before** the car-park check, exactly where it was drawn before (only after the other checks pass), so the seeded RNG sequence is unchanged: only the offending trees disappear, no other tree, colour or rotation moves. |
| Code home | A pure `parkingIndex(lots)` in `prototype/world.js` next to `waterIndex` (same bbox-prefilter + point-in-ring pattern), unit-tested with `node:test`. |
| River-bank trees | Untouched: that loop only runs in the hand layout (`if (!L)`), which has no car parks. |
| Out of scope | Lamps/benches/props on lots, OSM `natural=tree` points (not in the world file), trees on other surfaces (school yards, sports pitches). |

## Interface

```js
// prototype/world.js
export function parkingIndex(lots) // lots: [{ ring: [[x, z], ...], holes?: [[[x, z], ...]] }]
  -> { clear(x, z, r = 0): boolean } // true when the disc (x, z, r) overlaps no lot surface (ring minus holes)
```

`clear` skips lots whose bounding box, grown by `r`, misses the point; otherwise returns `false` if the point is inside the ring and not inside a hole, or if any edge of the ring or a hole is closer than `r`. Rings may be open or closed (first point repeated).

## Prototype change

```js
const PARKING = parkingIndex(L ? L.parking : []), TREE_CROWN = 0.45;
// in the 9000 loop, replacing `TREES.push([tx, tz, rr(6, 12)])`:
{ const h = rr(6, 12); if (PARKING.clear(tx, tz, TREE_CROWN * h)) TREES.push([tx, tz, h]); }
```

## Testing

- `node --test prototype/tests/world.test.mjs`: `parkingIndex` inside / outside / crown over the edge / tree in an island / crown spilling out of an island / far away / empty list / closed ring.
- `pytest prototype/tests/test_smoke.py -k car_parks`: `test_no_trees_on_car_parks[flat|measured]` loads the OSM world, reads `window.__TREES` (`[x, z, h, …]`) and checks every tree in Python, independently of the JS helper, against every `parking` lot with radius `0.45 · h`. Skips when the world file has no `parking` (pre-#40) or, for `measured`, when `data/terrain_hochrhein.mmh` is missing. Fails on `main` today (dry run above).
- Existing `test_no_trees_on_the_railway[hand|osm]` keeps passing (tree count > 100).

## Consequences

- About 20–30 trees fewer in OSM mode (≈0.5 % of ~4,300); all others identical.
- The hand layout is bit-identical (no lots → `clear` is always true, RNG unchanged).
- Load cost: one bbox test per lot per accepted candidate (≤ 9,000 × 330 cheap comparisons), negligible next to the terrain sampling already in the loop.

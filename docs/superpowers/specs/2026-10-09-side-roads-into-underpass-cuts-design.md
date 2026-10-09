# Side roads descend into rail underpass cuts (#120)

Follow-up to #119 (PR #121). Specs it builds on: `docs/superpowers/specs/2026-10-03-rail-bridges-underpasses-design.md` (#76)
and `docs/superpowers/specs/2026-10-07-abutment-walls-design.md` (#119).

## Goal

Every rail underpass gets its full 4.5 m headroom. Today a junction, or the end of the cut road's OSM piece, inside a cut
**caps** it: the ramp has to reach the ground there, so the floor at the crossing rises (`junctionCap`,
`prototype/world.js:152`; `cutJunctions`, `prototype/index.html:521-527`). Instead, the side road (and the cut road's own
continuation piece) **descends with the cut**: an *arm* starts at the floor where it joins and ramps back up to its own
ground, between trough walls, with a gap in the main road's wall where it enters.

## Measured on the current world (2026-10-09)

Topology and the uncut mesh (`meshH`, the 16 m grid over the `.mmh`), using the pure helpers in `prototype/world.js`
on `data/world_hochrhein.json`. No rebuild is needed; nothing in `pipeline/` changes.

- **16 crossings** (`railRoadCrossings`). Roads are whole OSM ways (`pipeline/world_roads.py:105-137`); a junction is an
  OSM node two kept ways share, so a side road usually *ends* on a vertex of the cut road, and the cut road's piece often
  ends at that junction too.
- Uncapped depth at the crossing (`meshH − f0`): Kapfstrasse 4.3–4.7 m, the unnamed road by Bahndammstrasse (six decks)
  4.5–5.1 m, Hauptstrasse Stein 5.0 m, Laufenburgerstrasse 2.5–2.9 m, Ankengasse ≤ 0 (no cut).
- Nodes inside the uncapped reach, and the cut depth there: Kapfstrasse/Bahnhofstrasse 20–24 m out, 0.6–1.4 m;
  unnamed road/Bahndammstrasse+Rütistrasse 15–29 m, 1.5–2.5 m (plus a service road 19–32 m behind, 0–1.1 m);
  Hauptstrasse Stein/Rohrmatt+Hauptstrasse 32–39 m, 2.5–2.8 m; Laufenburgerstrasse north/Dammstrasse+Neumattstrasse+
  Laufenburgerstrasse 16–20 m, 1.9–2.1 m; Grendelweg 50 m, 0.1 m.
- At the cut grade (8 %) Bahndammstrasse, which climbs ~5 %, would stay below ground for ~100 m, and a climbing
  dead-end service road leaves it 8 m in. At 12 % every side arm above surfaces within ~35 m.

## Decisions

| Topic | Decision |
|---|---|
| Model | A cut becomes a **network of arms**. The main cut is arm 0 (unchanged: level for `flat` m, then `UNDERPASS.grade`). Every road piece meeting an arm at a **node** inside its reach gets an arm anchored at that node: `f0` = the parent's floor there, `flat = 0`, its own `grade`. Arms recurse: a node on an arm spawns more arms. Each road piece is used at most once per network. |
| Nodes | On an arm: the `L.junctions` points within `hw + 2` of its road, and its own piece ends where it reaches them; never its own anchor (`|s| ≤ 0.5`). A node where the floor is already within 0.05 m of the ground spawns nothing. The pieces meeting a node are those with `nearestOnPolyline(...).d < 0.6`. |
| Grade | An arm on the **same street** as its parent (same OSM `id`, or the same non-empty name) keeps `UNDERPASS.grade` = 8 %, so a cut road split into pieces ramps out as one road. Any other road uses the new **`UNDERPASS.sideGrade` = 12 %**. |
| Reach | Per side of the anchor: the first whole metre where the floor meets the ground (`'ground'`), else the piece end (`'end'`), else `flat + maxDepth / grade` (`'budget'`). This replaces `cutReach` and now also applies to the main cut, whose reach therefore stops at its piece end instead of running past it. |
| Caps (fallback) | A node or point the network cannot descend through still caps the floor at the crossing: a **dead end** (piece end that meets nothing), a **bridge or layered piece** joining at a node (`bridge` or `layer ≠ 0`), and an **arm still below ground at its budget**. Cap rule: `f0 ≥ ground − rise`, `rise` = how far the floor climbs from the crossing to that point along the network. `capFloor` replaces `junctionCap`; `makeCut` repeats reach → network → cap until no cap raises `f0` (at most 8 rounds). A main-cut side that ends on `'budget'` stays as today (no cap). |
| Floor lookup | `cutFloorAt` works on any arm (it uses the arm's `grade`). The terrain in a patched cell is `min(meshH, lowest floor of all arms there)`, as overlapping cuts already do. |
| Walls | Per road, the merged spans of all its arms, per side. A wall run is **trimmed where its centre line enters another road's corridor** (`d < r.w / 2 + margin`, i.e. that road's wall face), found at 0.25 m along the line, so the cut road's wall opens exactly where a side road enters and the two runs meet at the corner. This replaces the per-piece `inSideRoad` skip (`w / 2 + 1.5`), which could leave up to 2 m of open bank at a corner. Top, parapet, `low` collider and the deck rule are unchanged; arms carry their network's `deck`, so a side-road wall far from the deck gets a parapet. |
| Headroom | On the real world no crossing stays capped, so every crossing has `clearance ≥ 4.45` (or `depth ≥ 5.99`). The ≥ 2.0 m rule for a capped crossing stays in the code path for dead ends. |
| Debug | `__mm.crossings()` entries gain `arms` (count) and `capped.kind` (`'dead' | 'bridge' | 'budget'`, replacing `end`). New `__mm.arms()` (anchor, `f0`, grade, reach, stop reasons and a 1 m profile of terrain vs. mesh per side) and `__mm.openCutFaces()`. |

## Design

### Pure helpers (`prototype/world.js`)

- `UNDERPASS.sideGrade = 0.12`.
- `cutFloor(c, s, u)`: `c.f0 + (c.grade ?? u.grade) × max(0, |s| − c.flat)`.
- `armReach(a, groundAt, len, u)` → `[{ s, why }, { s, why }]` (back, ahead), `why ∈ 'ground' | 'end' | 'budget'`.
- `capFloor(f0, caps)` → `{ f0, capped }`, caps `[{ rise, ground, kind, x, z }]`.
- `armNodes(a, junctions, len)` → `[{ x, z, s, end }]`, deduplicated within 0.5 m.
- `cutNetwork(cut, roads, junctions, ground, u)` → `{ arms, caps }`. Breadth-first from the main cut; each arm is
  `{ pts, road, t, hw, flat: 0, f0, grade, reach, stop, x, z }`.
- `wallSpans(pts, intervals, offset, side, blocked)` → the sub-intervals whose wall centre line stays out of `blocked`.
- `wallStations(pts, intervals, offset, step, sides = [-1, 1])`: gains `sides`.
- Removed: `cutReach`, `junctionCap` (and `cutJunctions` in `index.html`).

### Game (`prototype/index.html`)

- `makeCut`: candidate roads are the `ROAD_GRID` entries within 250 m of the crossing; loop reach → `cutNetwork` →
  `capFloor` as above; arms get `deck`.
- `ARMS`: the main cuts with `depth > 0` plus all their arms, each with `bounds = cutBounds(a)`. `cutFloorMin` and the
  terrain patches iterate `ARMS` (bounds test instead of the fixed 200 m box).
- Walls: by road over `ARMS`, per side through `wallSpans` with a `ROAD_GRID`-based `blocked`, then `wallStations(…, [side])`.
- Roads, junction discs and props already sit on `terrainH`, so a lowered side road is drawn lowered with no extra code.

### Tests

- `world.test.mjs`: `cutFloor` with an arm grade; `armReach` (ground, end, budget, zero-length side); `capFloor`;
  `armNodes`; `cutNetwork` (side road arm, dead end cap, bridge cap, continuation at 8 %, a chain of two arms,
  budget cap); `wallSpans`; `wallStations` with one side.
- `test_underpass.py`:
  - `test_every_underpass_has_headroom`: no crossing capped; every crossing `clearance ≥ 4.45` or `depth ≥ 5.99`;
    `railGap < 0.3`. Prints the arms per crossing.
  - New `test_side_roads_descend_with_the_cut`: arms at all four former cap places; every arm starts at its floor,
    climbs without a step > 0.3 m per metre, meets the ground at a `'ground'` end; a car driven from the Rohrmatt
    anchor up its arm gets out of the trough.
  - New `test_no_open_cut_faces`: every point lowered > 0.3 m outside every road corridor lies in a wall.
  - `test_walls_follow_skewed_decks_and_leave_side_roads_open`: unchanged, must stay green.
- Targeted regression: `test_smoke.py` grass/fields under the road, wheels not sinking, no trees on the railway,
  OSM layout; `test_tree_collision.py` (trees on roads).

### Docs

- CHANGELOG `[Unreleased]` → the railway-bridge entry under `Added` (still unreleased): replace "Where a side street
  turns off right next to the bridge, the underpass is lower — mind your roof." with "Side streets that turn off right
  next to the bridge dip down into the underpass with it, between their own walls."

## Out of scope

- Correcting deck heights in the data (Kapfstrasse, Hauptstrasse Stein only ~1–1.5 m above the road).
- A main-cut side that ends on its budget still below ground (see the Kapfstrasse note in the issue's Consequences).
- Height-limit signs, kerbs or railings on the arms.

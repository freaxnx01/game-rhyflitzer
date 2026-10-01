# Street furniture from OSM (props) — design

Status: approved in chat 2026-10-01 · Issue #8

## Goal

First step toward Midtown-Madness-style fun physics: the pipeline exports street furniture from OpenStreetMap at its real positions, and the prototype shows it along the roads. Lamps and hydrants are solid obstacles; benches, bins, bike racks and containers are decoration the car drives through until the follow-up fun-physics issue knocks them over.

Success looks like:

- `osm.py build` writes a `props` list into `data/world_hochrhein.json`.
- In OSM mode the prototype draws them (one instanced mesh per kind) and the car collides with lamps and hydrants.
- No solid prop stands on the driving surface.
- The hand-traced layout (no world file) is unchanged.

## Decisions

| Topic | Decision |
|---|---|
| Kinds | `hydrant`, `lamp`, `bench`, `bin`, `bike_rack`, `glass_container`, `clothes_container` |
| Collision | Solid: `lamp`, `hydrant` (thin posts). Decoration only: all other kinds (user decision 2026-10-01). |
| Look | Simple procedural low-poly models built in the prototype, like the other landmarks; both graphic styles. Graphics task → Fable. |
| Out of scope | Hit physics and particles (follow-up issue), hand-placed extras (paper-collection bundles, straw bales), lamp light at night (#2), props on the minimap. |

## Source data (counted 2026-10-01 on `pipeline/cache/osm/hochrhein.osm.pbf`)

| Kind | OSM selection | In bbox | ≤ 15 m from a road |
|---|---|---|---|
| `lamp` | node `highway=street_lamp` | 2,252 | 1,928 |
| `hydrant` | node `emergency=fire_hydrant`, **excluding** `fire_hydrant:type=underground` (and `pipe`) | 838 (all types) | 769 (all types; ≈ 40 % remain after the exclusion) |
| `bench` | node `amenity=bench` | 624 | 270 |
| `bin` | node `amenity=waste_basket` | 327 | 176 |
| `bike_rack` | node or area `amenity=bicycle_parking` (area → centroid) | 41 | 21 |
| `glass_container` | node or area `amenity=recycling` with `recycling:glass_bottles=yes` or `recycling:glass=yes` | 13 | 11 |
| `clothes_container` | as above with `recycling:clothes=yes` (glass wins if both) | 4 | 3 |

Underground hydrants (725 of 1,226 in the extract) are a lid in the ground, so they are not props. They also explain a large share of the hydrants found on the road surface.

## Pipeline

### Reading

`osm_read.read()` additionally collects **prop nodes**: every node carrying `emergency=fire_hydrant`, `highway=street_lamp`, `amenity=bench|waste_basket|bicycle_parking|recycling`, as `PropNode(id, tags, x, z)` in a new `OsmData.prop_nodes` list. Areas with `amenity=bicycle_parking|recycling` already arrive in `OsmData.areas` (`amenity` is an area key).

### `pipeline/world_props.py` (new)

`world_props.build(data, roads, clip, max_dist=15.0, edge_gap=0.6) -> (props, stats)`

1. **Classify** each prop node and each qualifying area (centroid) into one kind, or skip it.
2. **Clip** to the world bbox.
3. **Reach filter:** keep only props within `max_dist` of a kept, non-bridge road centre line minus half its width (distance to the road *edge* ≤ 15 m).
4. **Edge rule:** if a prop lies inside a road band (distance to the centre line < `w/2 + edge_gap`), move it perpendicular to that road to `w/2 + edge_gap` from the centre line, on the side it was on (on the centre line exactly: the right-hand side of the road's direction). Then re-check against *all* road bands; if it is still inside one (junctions, narrow gaps), drop it. Props inside the band of a **bridge** road are dropped.
5. **Rotation:** `bench` and `bike_rack` are turned parallel to the nearest road (`rot = atan2(dz, dx)` of that segment, the prototype's rotation convention); other kinds `rot = 0`.
6. **Stats:** counts per kind kept, moved to the edge, dropped (outside reach, still on a road after moving, on a bridge, underground hydrant, unclassified).

### World file

New top-level key, format stays `MMW1` (older prototypes ignore unknown keys):

```jsonc
"props": [{ "kind": "lamp", "x": 1831.2, "z": -280.4, "rot": 0 }, …]
```

Coordinates rounded to 0.1 m, `rot` to 0.01 rad. Expected ~2,500 entries, well under 200 KB.

## Prototype

- `layoutFromWorld` passes `props` through (empty list when the key is missing).
- One `THREE.InstancedMesh` per kind (7 draw calls), built only when `L` is set, after the buildings. Each instance stands on `terrainH(x, z)` with its `rot`.
- Models (procedural, low-poly, sizes in metres):
  - `lamp`: grey post 6 m, Ø 0.15, short arm with a luminaire head.
  - `hydrant`: red pillar hydrant (Swiss style), 0.9 m, Ø 0.25, cap and two outlets.
  - `bench`: wooden slats on two metal legs, 1.8 × 0.6 × 0.8 m.
  - `bin`: grey-green bin on a post, ~1 m.
  - `bike_rack`: a row of 5 metal hoops, 3 m long.
  - `glass_container`: green container with round openings, 1.5 × 1.5 × 1.6 m.
  - `clothes_container`: grey-white container, 1.2 × 1.2 × 2 m.
- **Collision:** `lamp` and `hydrant` get a small OBB through `pushOBB` (lamp 0.3 × 0.3 m, hydrant 0.4 × 0.4 m, height = model height). Other kinds get no OBB.
- **Seeded RNG:** the prop code uses no `rr()`/`rnd()`, and nothing on the hand-traced path changes.
- Debug hook: `window.__mm.counts.props` = `{ kind: count }`.

## Testing

- **pytest** (`pipeline/tests/test_props.py`, fixture-based):
  - classification of every kind incl. underground and pipe hydrants skipped, glass winning over clothes, unknown recycling skipped;
  - reach filter at the 15 m boundary;
  - the edge rule: a lamp on a road centre line ends at exactly `w/2 + 0.6` from it; a lamp in a junction where moving still lands in another band is dropped; a prop on a bridge band is dropped;
  - bench rotation parallel to the road;
  - `osm_read` collects prop nodes.
- **Golden test** on the real extract: counts per kind within ranges (lamp 1,500–2,100, hydrant 150–450, bench 150–320, bin 100–220), and **no solid prop within any road band** (distance to every road centre line ≥ `w/2 + 0.5`).
- **node** (`prototype/tests/world.test.mjs`): `layoutFromWorld` passes `props` and defaults to `[]`.
- **Browser smoke**: OSM layout reports prop counts per kind in `__mm.counts.props` matching the world file; hand-traced fallback has none; console clean; hand-path geometry hash unchanged.

## Risks

- **OSM position quality:** lamps and hydrants are often mapped a few metres off. The edge rule keeps them off the road; a few may sit in driveways or on sidewalks. Acceptable.
- **Draw cost:** ~2,500 instances in 7 instanced meshes is cheap; collision adds ~2,200 small OBBs to the grid index, which is per-cell, so physics cost stays flat.
- **Road width defaults:** our default widths are generous, so more props get pushed outward than strictly necessary. Fine for gameplay.

# Car parks from OSM with painted bays — design

Status: approved in chat 2026-10-02 · Issue #40

## Goal

Car parks look like they do from above: an asphalt surface with white parking-bay lines, and a "P" sign where the car park has a name. The pipeline exports every open-air and roadside `amenity=parking` area in the region together with its bay lines; the prototype only draws them. Reference: the three lots around Hallenbad Sissila (aerial view linked in #40).

Success looks like:

- `osm.py build` writes a `parking` list into `data/world_hochrhein.json`.
- In OSM mode the prototype draws asphalt, bay lines and name signs; the console stays empty.
- The Hallenbad lots (`26648737`, `282853090`, `290671997`) are recognisable against the aerial view: surface, bay rows, the way in.
- No bay line is painted over a road or under a building.
- The hand-traced layout (no world file) is unchanged.

## Decisions

| Topic | Decision |
|---|---|
| Where bays are computed | In the pipeline (user decision 2026-10-02). The world file carries finished line segments; the prototype draws them as they are. |
| Kinds drawn | `parking=surface`, untagged `amenity=parking`, `parking=street_side` (user decision 2026-10-02). |
| Kinds skipped | `parking=lane` (on the carriageway, already a road), `underground`, `multi-storey` (already stand as buildings), any other value. |
| Parked cars | None, lines only (user decision 2026-10-02). |
| Driving | Unchanged: the car already drives on the terrain. A car park is not a road: no street name, no centre markings, not a random-spot target. |
| Out of scope | Parked cars, car parks on the minimap, multi-storey/underground models, the hand-traced fallback. |

## Source data (counted 2026-10-02 on `pipeline/cache/osm/hochrhein.osm.pbf`, padded extract)

| OSM selection | Count |
|---|---|
| `amenity=parking`, `parking=surface` | 239 (235 ways, 4 relations) |
| `amenity=parking`, no `parking` tag | 41 |
| `amenity=parking`, `parking=street_side` | 136 |
| `amenity=parking`, `parking=lane` / `underground` / `multi-storey` | 14 / 2 / 2 |
| `amenity=parking_space` (ways and nodes) | 1,556 |
| `service=parking_aisle` ways | 314 |

Hallenbad quarter: `26648737` (Hallenbad-Parkplatz, surface, access=customers), `282853090` (Hallenbad-Parkplatz, surface, capacity=18), `290671997` (Privat Parkplatz Rhyblick, surface); aisles `199658628`, `220028640`, `220028643`, `222128105`, `501847660`; no mapped spaces.

## Pipeline

### Reading

Nothing new to read. `osm_read.read` already loads every area with an `amenity` key (`AREA_KEYS`) into `data.areas`, which covers `amenity=parking` and `amenity=parking_space` areas, and every `highway` way into `data.ways`, which covers `service=parking_aisle`. `parking_space` **nodes** are ignored (no shape to draw).

### `pipeline/world_parking.py` (new)

`build(areas, ways, buildings, roads, clip) -> (parking, stats)`

1. **Select lots:** areas with `amenity=parking` whose `parking` is `surface`, missing or `street_side`, intersecting `clip`. Each lot is clipped to `clip`; a lot that becomes empty is dropped.
2. **Bays per lot, first match wins:**
   1. **Mapped:** `amenity=parking_space` areas whose centroid lies inside the lot. Their outlines become bays as they are.
   2. **Aisles:** `service=parking_aisle` ways intersecting the lot. Along each aisle piece inside the lot, rows of 2.5 m wide × 5 m deep bays perpendicular to the aisle, on both sides, starting 3 m (half an aisle) from the aisle centre line.
   3. **Rectangle:** the lot's `minimum_rotated_rectangle`, long axis = row direction, short side = width `w`:
      - `w < 3.5 m`: parallel parking, one row of 6 m long bays along the strip (depth `w`), the typical roadside lane.
      - `3.5 m ≤ w < 7 m`: one row of 2.5 m wide bays across the whole width (depth `w`), the typical roadside bay strip.
      - `7 m ≤ w < 16 m`: one row of 5 m bays along the long side farther from the nearest road, the rest is aisle.
      - `w ≥ 16 m`: two rows of 5 m bays along both long sides, aisle in the middle.
3. **Filter bays** (generated ones only; mapped spaces are kept as mapped, except for the road/building test):
   - fully inside the lot (`lot.buffer(0.1).contains(bay)`),
   - not intersecting a building footprint (`ring` from the buildings list),
   - not intersecting a road band (centre line buffered by `w / 2`, from the roads list),
   - at most `capacity` bays when `capacity` is a number; drop from the row ends first.
4. **Lines:** every bay contributes its edges except the edge facing the aisle (the open front), for mapped spaces as well (the front = the edge nearest the lot's nearest aisle or road; if none, all four edges). Edges shared between neighbours are written once (deduplicated by rounded endpoints, either direction).
5. **Sign:** only if `name` is set: the point on the lot's outline nearest a road centre line, moved 1 m into the lot; `rot` = heading of that road segment.
6. **Stats:** counters for `lots`, `skipped_<type>`, `bays_mapped`, `bays_aisle`, `bays_rect`, `dropped_road`, `dropped_building`, `dropped_capacity`.

### World file

```json
"parking": [
  { "id": 26648737, "name": "Hallenbad-Parkplatz",
    "ring": [[x, z], ...], "holes": [[[x, z], ...]],
    "lines": [[ax, az, bx, bz], ...],
    "sign": [x, z, rot] }
]
```

`name`, `holes` and `sign` are omitted when empty. Coordinates in game metres, rounded to 0.1 m; `rot` to 0.01 rad. Multipolygon lots become one entry per polygon (same `id`). `osm.build_world` calls `world_parking.build` after the buildings and roads exist and writes `"parking": parking`; `log` prints the count and stats.

## Prototype

- `world.js` `layoutFromWorld`: pass `parking: w.parking || []` through (older world files without the key still load).
- **Asphalt:** per lot, triangulate `ring` / `holes` with `THREE.ShapeUtils.triangulateShape` (as `waterPolys` does), subdivide every triangle with an edge over 5 m (midpoint split, repeated), drape each vertex at `terrainH(x, z) + 0.03` (1 cm below the road ribbons at +0.04, so overlaps show the road). Colour and material as the existing `lot()` helper (`roadPlain`, `#b8b0a0` tint).
- **Lines:** each segment becomes a 0.12 m wide quad draped at `terrainH + 0.035`; all segments go into one merged `BufferGeometry` with a white `MeshBasicMaterial`, `depthWrite: false`, `polygonOffset: true`, `polygonOffsetFactor: -1` (as the road markings).
- **Sign:** a pole with a blue square board (white "P") and the name underneath, built from the existing `textTex` helper, at `sign`, turned to face the road.
- Nothing is added to the physics, the minimap or the random-spot candidates.

## Testing

- `pipeline/tests/test_parking.py`, synthetic shapes, no OSM file:
  - selection: `surface`, untagged and `street_side` kept; `lane`, `underground`, `multi-storey` skipped;
  - mapped spaces are used instead of generated bays;
  - an aisle through a 30 × 40 m lot gives two rows of 2.5 m bays, all inside the lot;
  - rectangle rule: a 2.5 × 40 m strip gives one row of ~6 parallel bays; a 5 × 40 m strip one row of ~16 bays; a 12 × 40 m lot one row; a 20 × 40 m lot two rows;
  - a building or road crossing the lot removes the bays it touches;
  - `capacity=4` keeps at most 4 bays;
  - shared edges appear once;
  - sign only with a name, inside the lot, near the road.
- `pipeline/tests/test_golden.py` (real extract): `26648737` is exported and has lines; `282853090` has at most 18 bays (counted via its lines); `parking=underground` ids are absent.
- `prototype/tests/test_smoke.py`: the page still loads with an empty console in OSM mode (existing test, rerun).
- Manual playtest (test-todo): the Hallenbad lots against the aerial view; a slope car park does not float or sink.

## Risks

- **Rectangle rule on odd shapes:** L-shaped or curved lots get a rectangle that fits badly; the "fully inside" filter then drops many bays and leaves plain asphalt. Acceptable: plain asphalt is no worse than today.
- **World file size:** about +300–600 KB for the lines (estimated from ~1,500 mapped plus several thousand generated bays). Acceptable at a 2.1 MB file; if it grows past +1 MB, store generated rows compactly instead (start, end, depth, count).
- **Slopes:** draped vertices every ≤ 5 m follow the terrain closely enough at car-park gradients; a steep lot may still show a small gap at the edges.

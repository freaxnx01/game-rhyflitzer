# Holzbrücke true to plan: S-shaped, six piers, chapels, timber interior (#241)

## Goal

The covered wooden bridge Stein–Bad Säckingen should be recognisable in the game, from the bank, from the helicopter and
from inside while driving the shortcut. It stays procedural (three.js primitives, no GLB, no loader). The swisstopo hull
exported in PR #237 and the Wikipedia article supply the measurements.

Success means: the bridge follows its real S-shaped line, stands on six stone piers at the real stations, carries its
three chapels, shows a timber frame inside, and is still drivable end to end with the shortcut toast intact.

## Decisions taken with the user (2026-10-10)

- **Procedural, not a model file.** No `GLTFLoader`, no asset. The work does not depend on PR #237 being merged: every
  number the implementer needs is in this document.
- **Detail outside and inside.** Roof, timber side walls, piers, chapels, plus roof trusses visible from the deck.
- **The bend is wanted.** Deck, rails and collision follow the bridge's polyline. The straight chord introduced by #137
  no longer applies to the wooden bridge.
- **Six piers, seven openings**, per Wikipedia. `docs/01-concept.md:79` says nine spans; that line is corrected.

## Sources and measurements

**swisstopo** swissBUILDINGS3D 3.0, tile 1049-33 (2024), `BuildingPart ID_62E48E33-707A-4079-8CA2-B966E2A4E3D5`,
`OBJEKTART` "Bruecke gedeckt". Sliced every 5 m across the game's bridge line:

| Measure | Hull | Game today |
|---|---|---|
| Length | 204.1 m | 205.9 m along the OSM line |
| Roof outline width | 4.8–5.1 m | deck 5.2 m, roof 7.0 m |
| Eaves above wall foot | 4.2 m (German half), 3.8–4.3 m elsewhere | 4.2 m |
| Ridge above wall foot | 6.25–6.66 m | 6.1 m |
| Ridge line off the straight chord | up to 1.83 m, S-shaped | 0 (straight) |
| Ridge line off the OSM line | at most about 0.5 m | — |

**Wikipedia** (de, "Holzbrücke Bad Säckingen", read 2026-10-10): 203.7 m long; S-shaped plan; seven openings with spans
29.10 − 31.10 − 26.21 − 26.61 − 21.19 − 23.14 − 28.06 m counted from Säckingen; structure per opening is a timber
*Hängewerk*; gabled roof; on the second pier from Säckingen a small polygonal half-timbered chapel on each side; on the
fourth pier a small chapel with a pent roof (Nepomuk).

The spans sum to 185.41 m. The remaining 18.29 m is six piers of 3.05 m. Pier centres, as a fraction of the bridge
length **from the Stein end**:

| Pier (from Säckingen) | 6 | 5 | 4 | 3 | 2 | 1 |
|---|---|---|---|---|---|---|
| Fraction from Stein | 0.1452 | 0.2738 | 0.3928 | 0.5384 | 0.6820 | 0.8497 |

Cross-check: the OSM line `w85692214` has its bends at 32, 56, 82 and 141 m from the Stein end, and the hull widens at
137–142 m. Those are piers 6, 5, 4 and 2. The data agree within about 2 m.

Chapel extents from the hull, measured from the ridge line: at pier 2 the south side reaches 5.5 m and the north side
4.2 m (roof edge is 2.5 m); at pier 4 the south side reaches 2.6 m. South is game `+z`, the left-hand side when driving
from Stein to Säckingen.

## Current state

- `prototype/index.html:1212-1225` `heroBridge(b, hAt, pierBase)`: wooden branch draws deck, two rail bands, a top band,
  posts every 10 m, a gabled roof and three cylinder piers on **one straight span**.
- `prototype/index.html:1243-1253`: for the OSM layout the span is the chord between the two farthest points of the
  wooden pieces; `p.hero = hb` marks the pieces.
- `prototype/index.html:494` `inHeroDeck`: makes the area between the chord's rails count as deck (#137).
- `prototype/index.html:1227-1244` `heroStone(pcs)`: the Fridolinsbrücke is already drawn per piece along its polyline
  with one wall OBB per 2 m segment. This is the pattern to follow.
- `prototype/index.html:530`: wooden pieces get `hw: 2.6`.
- `prototype/index.html:2079`: the shortcut toast fires on `ob.b.kind === 'wood' && ob.t > 40`.
- `prototype/tests/test_smoke.py:149-166` (car scrapes along the rail) and `:174-200` (#137 deck reaches its rails)
  both measure against the chord.

## Design

### Module `prototype/holzbruecke.js` (new, pure, no three.js)

One exported constant and three functions. They return plain data; `index.html` turns the data into geometry.

```js
export const HOLZ = {
  eave: 4.2, ridge: 6.4,            // m above the deck surface
  overhang: 0.9,                    // roof edge beyond the deck edge
  parapet: 1.1,                     // boarded lower wall
  bay: 5,                           // target frame spacing, m
  pierFractions: [0.1452, 0.2738, 0.3928, 0.5384, 0.6820, 0.8497],   // from the Stein end
  pierWidth: 3.05,                  // along the bridge
  chapels: [                        // pier: index into pierFractions; side: +1 = south (+z), -1 = north
    { pier: 4, side: 1, kind: 'polygon', depth: 3.0, length: 4.0 },
    { pier: 4, side: -1, kind: 'polygon', depth: 1.7, length: 4.0 },
    { pier: 2, side: 1, kind: 'pent', depth: 1.0, length: 2.0 },
  ],
};
```

`pierFractions` counts from the Stein end, so the second pier from Säckingen is index 4 and the fourth is index 2.
`depth` is how far a chapel stands out beyond the wall line, `length` its extent along the bridge:

| `pier` index | Real pier | `side` | `kind` | `depth` | `length` |
|---|---|---|---|---|---|
| 4 | 2nd from Säckingen | +1 (south) | `polygon` | 3.0 | 4.0 |
| 4 | 2nd from Säckingen | −1 (north) | `polygon` | 1.7 | 4.0 |
| 2 | 4th from Säckingen | +1 (south) | `pent` | 1.0 | 2.0 |

- `orientEastWest(pts)` returns `pts` or its reverse so that the first point is the eastern (Stein) end, i.e. has the
  larger `x`. Pier fractions and chapel sides are defined from Stein, and the direction of an OSM way is not a contract.
- `frameStations(pts, bay)` returns `[{ x, z, ux, uz, t }]`: one frame at each polyline vertex and evenly spaced frames
  between vertices so that no gap exceeds `bay`. `ux, uz` is the unit direction of the segment the frame starts; the
  last frame takes the last segment's direction. `t` is arc length.
- `pierStations(pts, fractions)` returns `[{ x, z, ux, uz, t }]` at `t = fraction * polylineLength(pts)`.

`polylineLength`, `pointAtLength` are imported from `prototype/world.js`.

### Geometry in `prototype/index.html`

New function `heroWood(pts, hs, pierBase, y0)` next to `heroStone`, replacing the wooden branch of `heroBridge`.
`pts` is the oriented polyline, `hs(x, z)` the deck surface height, `y0` the collision floor for the rails (may be
`undefined` in the hand layout). With `hw = 2.6`:

| Part | Shape | Role |
|---|---|---|
| Deck and underside | `strip` along `resample(pts, 2)`, as today | `wood` |
| Parapet | vertical quads from deck to `parapet`, both windings, at offset `hw + 0.2`, per segment | `wood` |
| Posts | `box` 0.3 × `eave` × 0.3 at each frame, both sides | `wood` |
| Braces | one diagonal board per bay and side, from post at `parapet` height to the next post at `eave`, both windings | `wood` |
| Wall plate | `strip` 0.3 wide at `eave`, both sides | `wood` |
| Roof | two slopes per bay from `hw + overhang` at `eave` to the centre at `ridge`, both windings so it shows from below | `roof` |
| Truss | per frame: tie beam `box` across at `eave`, king post `box` from tie to ridge, two rafter boards | `wood` |
| Piers | six hexagonal prisms, pointed up- and downstream, `pierWidth` along the bridge and `2 * hw + 3` across, from `pierBase` to 0.55 m below the deck | `stone` |
| Chapels | `polygon`: half-hexagon prism outside the wall, deck to `eave`, with a half-pyramid roof; `pent`: box outside the wall with a single slope falling away from the bridge | `wood`, `roof` |
| Rails (collision) | one `pushOBB` per 2 m segment at offset `hw + 0.3`, `h: 2`, `bridge: true`, `y0` when given | — |

The roof colour stays `#6a3a2a`, timber colours stay those of the current model. Chapels have no collision: they stand
outside the rails. Everything goes through `push(role, geometry)`, so both graphic styles work unchanged.

`window.__mm.counts.holzbruecke = { frames, piers, chapels }` is set for the browser test.

### Call sites

- **OSM layout** (`:1243-1253`): for `kind === 'wood'` call `heroWood` with the chained pieces' points joined into one
  polyline, `hs` from `bridgeSurfaceAt` of the nearest piece, and the existing water-level rule for `pierBase`. No `hb`,
  no `p.hero` for wood.
- **Hand layout** (`:1245` loop over `BRIDGES`): for `kind === 'wood'` call `heroWood([b.a, b.b], …)` with
  `bridgeProfile`. The stone branch of `heroBridge` stays.
- `inHeroDeck` stays for the stone bridge's straight-span fallback (no `STONE_AXIS`); wooden pieces no longer carry
  `hero`, so for them `onBridge` uses the polyline distance alone.

### Physics

Deck membership becomes `nearestOnPolyline(pts).d <= hw` for the wooden bridge, which is what `onBridge` already does
for any piece without `hero`. The rails sit `hw + 0.3` off the same polyline, so deck and rails agree by construction.
The bends are 3–6°; adjacent wall OBBs overlap at the vertices instead of leaving a gap.

### Tests

**Node** `prototype/tests/holzbruecke.test.mjs`:

- `orientEastWest` reverses a west→east line and leaves an east→west line alone.
- `frameStations` puts a frame on every vertex, keeps every gap ≤ `bay`, and ends on the last point.
- `pierStations` returns six stations in increasing `t`, each on the polyline, at the documented fractions.
- `HOLZ.chapels` matches the table above (three entries; indices 4, 4, 2; sides +1, −1, +1).

**Browser** `prototype/tests/test_holzbruecke.py` (new, foreground, world required):

- `window.__mm.counts.holzbruecke` reports 6 piers and 3 chapels and at least 40 frames.
- Deck follows the line: points 2.2 m either side of the **polyline**, every 5 m, are deck (`ground > -1`); points 4.5 m
  either side over the river are water.
- A full crossing: the car started on the deck at the Stein end, heading along the first segment at 15 m/s with the
  gas held, is still on the bridge past arc length 190. This covers the four bends.
- The console is free of errors.

**Changed** in `prototype/tests/test_smoke.py`:

- `test_holzbruecke_deck_reaches_its_rails` measures against the chord and asserts deck at ±2.2 m from it. With the
  deck on the polyline that assertion describes the old requirement. It moves to `test_holzbruecke.py` in the
  polyline form above and is removed from `test_smoke.py`. This is a changed requirement decided by the user, not a
  test bent to pass.
- The rail-scrape test above it starts 40 m along the chord heading along the chord. It must keep passing; if the start
  point now lies off the deck, its start is taken from the polyline at arc length 40 with the segment's heading.

### Docs

- `docs/01-concept.md:79`: "9 spans" becomes seven openings on six piers, with the S-shaped plan.
- `CHANGELOG.md` `[Unreleased]` → `Changed`, in the player's voice: the bridge now bends, stands on six piers, has its
  chapels and a timber roof inside.

## Out of scope

- Bridge width. The real bridge is 3.4–5.0 m wide; the game keeps its 5.2 m deck so the car fits.
- Roof texture (Biberschwanz tiles), the saints' figures, the entrance porches (*Vordächer*).
- Loading any GLB, and anything in `landmarks.yaml` or the `ch-landmarks` skill.
- The German bank's buildings (needs LGL BW data).
- The minimap line for the bridge in the OSM layout.

## Risks

- **Triangle count.** About 42 frames, each with two posts, two braces, a tie, a king post and two rafters, plus roof
  and parapet quads: on the order of 5,000 triangles, merged per material. Small against the world.
- **Rail scrape at the bends.** A car sliding along a rail meets a 3–6° change of direction four times. The scrape test
  covers one straight stretch; the full-crossing browser test covers the bends.
- **Hand layout.** It has no bends and no measured water level; it gets the same parts on a two-point line.

# Bodenackerstrasse 6 (6a–6d, Sisseln): the block modelled from the outside (#410)

Status: enriched 2026-10-21, maintainer decisions applied 2026-10-21 (epic #414). Sibling specs: #409 (`2026-10-21-enterable-buildings-register-design.md`, the
register this model feeds), #411 (entering 6c: stair hall, lift, a window per landing, the roof — **not designed here**).

## Intent

Today the block Bodenackerstrasse 6a–6d is one generic flat-roofed extrusion of its OSM footprint with the shared
`hall` texture (`h > 8`). Make it recognisable from the street without copying anything:

- **ten storeys** per house (federal building register GWR: EGID 586285 6a, 586283 6b, 586282 6c, 586284 6d, `gastw` 10),
- the **stepped plan** of the swisstopo 3D buildings,
- the four small **glass entrance porches** (glass sides, flat roof, a door leaf) on the street side, taken straight from the four
  projections of the OSM footprint,
- a white, windowless **roof-top stair/lift housing** above the roof behind each porch (assumption, still open: Q1),
- an **own façade texture** in the game's canvas style: white plaster, a regular window grid with dark window bands and
  roller-shutter boxes on the street side and the ends; on the back side the same plaster with **recessed loggias** (flush, no
  protrusion).

And it must stay a **data-driven model**: the floor levels, the stair positions and the porch entrances are exported
by a pure module so that #411 reuses them instead of measuring the mesh.

Maintainer decisions (issue #410 and its 2026-10-20 comment) that are settled here:

- Own texture only. Google Street View (Bodenackerstrasse, June 2023) and map.geo.admin.ch are **references to look at**,
  never pixel sources. The painted tile is the deliverable (decision 2026-10-21: no photos; default kept).
- Porches are glass on the sides with a flat roof, not solid boxes.

Decisions of 2026-10-21 applied in this version:

- The four projections on the street side of the OSM footprint **are the glass entrance porches** (not stair towers). The stair halls
  lie inside the body directly behind each porch.
- The porch door is on the **front, facing the street** (+v).
- House order: **6d is the north end**, 6c is the second entrance from the north (`houseOrder: 'southToNorth'`, #455: OSM's address points; the first draft had it reversed).
- The back side has **recessed loggias that do not project** from the façade: a second texture tile, no extra geometry.

## Privacy rule

This is a real residential building. The model, the code, the tests and the changelog carry only **public exterior facts**:
the address, the GWR storey count, the OSM footprint, what is visible from the street. No floor plans, no flats, no
people, no "which floor/side" — in this spec, the plan, commits or the issue.

## Data sources (measured, not guessed)

Probe of `data/world_hochrhein.json` (format `MMW1`, © OpenStreetMap contributors, ODbL; heights swissSURFACE3D ©
swisstopo), 2026-10-21:

| Fact | Value |
|---|---|
| OSM way | `171822634`, `addr` `6a–6d`, `palette` `village`, `roof` `flat`, `hsrc` `dsm` |
| `rect` | centre `(2039.57, −366.12)`, **60.9 × 22.08 m**, `rot` **−1.7023** rad |
| `h` / `rh` | **25.3 m** eaves (10th percentile of the DSM roof samples) / **1.4 m** ridge rise (95th percentile) |
| ring | 40 vertices (stepped outline, see below) |
| street | Bodenackerstrasse: the main run passes the block's **north** end (z ≈ −404, 8 m from the end wall), a branch runs along the **east** side (x ≈ 2070, ~17 m from the east façade) |
| J landmark | `Bodenackerstrasse 6c` → `building: 171822634` (`landmarks.js`); #409's register entry `bodenackerstrasse-6c` points at the same id |
| GWR | 10 storeys per house (`gastw`), public register |

`h / 10 = 2.53 m` per storey: the ten window rows the Street View reference shows fit the measured eaves height, so the
model takes **storeys = 10** as data and derives the storey pitch from the world's `h` (no second height source).
`rh` = 1.4 m is a 95th percentile over the whole roof; a small roof-top housing (≈ 2 % of the roof area) would not register in
it, so **whether there is one, and its rise, is not measurable from our data** (Q1).

### The footprint in the block's own frame

The game's `box()` frame: world `= centre + R(rot) · (u, v)`, `u` along the 60.9 m axis, `v` across. For this block
**+u points north** (towards the main street), **+v points east** (towards the branch, the street side). Ring vertices
in that frame (m, rounded), walking the ring:

```
 west (back) side, v ≈ −6 … −11, three steps          east (street) side, v ≈ 3 … 11, four bumps
 (−29.6,−6.6) (−15.2,−5.7) (−14.9,−8.5) (−2.6,−7.7)    bump 1  u −24.3…−22.0  façade v 8.1  tip v 11.0
 (−2.4,−11.1) (13.3,−10.0) (13.3,−8.2) (13.9,−8.2)     bump 2  u −11.7… −9.4  façade v 6.1  tip v  9.0
 (13.9,−7.4) (30.5,−6.3)                                bump 3  u   3.1…  5.5  façade v 3.8  tip v  7.0
 south end u −30.4, north end u +30.5                   bump 4  u  17.9… 20.3  façade v 7.8  tip v 11.0
```

So OSM already carries the **stepped plan**: four houses of ≈ 15 m along `u`, each shifted across by 1–4 m, and on the
street side **four projections of 2.3–2.4 m × 2.6–3.2 m, one per house** at `u ≈ −23.2, −10.6, 4.3, 19.1`: these are the glass
entrance porches. The generic extrusion draws all of this today as full-height boxes; what it lacks is the right height split
(porch 3 m, body 25 m), the glass, the roof-top housing and the right skin.

Plan view (not to scale; `N` up = +u):

```
                 u +30  ─────────────────────── north end wall (main street 8 m beyond)
                        │                     │
   back (west)   v −6   │   6a                 ▐▌ porch 4  (u 19.1)  ← glass porch, stair hall behind it
                        │ ─ step ─            │
                        │   6b                 ▐▌ porch 3  (u  4.3)
                 v −11  │ ─ step ─            │
                        │   6c                 ▐▌ porch 2  (u −10.6)
                        │ ─ step ─            │
                        │   6d                 ▐▌ porch 1  (u −23.2)
                 u −30  ─────────────────────── south end wall
                             street side (east, v +)  →  Bodenackerstrasse branch at ~17 m
```

(The house names follow `houseOrder: 'southToNorth'` (#455): the northern porch, `u +19.1`,
is 6d and **6c is the second entrance from the north**, `u 4.3`.)

**Interpretation (confirmed 2026-10-21):** the four projections are the **glass entrance porches**. They are in OSM, so the porch
footprint is read from the ring (`bodenackerPorches`); nothing is invented in front of the façade. The **stair halls** lie inside
the body directly behind each porch (`stairs[i]`, a rectangle between the façade line and 3.0 m into the body). Their interior is
#411's design; this spec only exports where they are.

## Geometry

All sizes are constants in `prototype/bodenacker6.js` (pure, no three.js, no DOM), the mesh is built in
`prototype/index.html` from the layout the module returns. Heights are **relative to `base`** (= the lowest terrain
sample on the ring, as `osmBuilding` does today) — the module never samples terrain.

| Part | Geometry | Role / look |
|---|---|---|
| **Body** | the OSM ring **without the four bumps** (`bodenackerBody`), extruded `base−2 … base+h` (h = 25.3 from the world) | walls by face (`bodenackerWalls`): street side and ends `bodenacker` window tile, back side `bodenackerLoggia` tile; tile = one module × one storey (`[4.0, h/10]`), `uPerFace` so the grid restarts at every step |
| **Parapet band** | the same body ring extruded `base+h … base+h+0.5`, its top is the roof slab | `plasterWhite`, roof `roofFlat` gravel `#8f8a84` (as today) |
| **Porches ×4** | footprint = the OSM bump (≈ 2.4 wide × 2.9–3.2 deep), `h = 3.0`. Four corner posts 0.15 × 0.15 (dark grey `#3a3f47`), a flat roof slab (footprint + 0.1 overhang, 0.25 thick, light grey `#c9ccd0`, `plasterWhite` role with colour), two **side panes** (on the two u-sides) and a **front pane** of glass on the street face; the front pane is split into two side lights and a **door leaf** 1.0 wide, drawn as a separate 0.05 m thin box (`#3a3f47` frame, glass centre) so #411 can swing or hide it. The rear is the body façade | new role `glass` (see below) |
| **Roof-top stair/lift housing ×4** | assumption (Q1): `box()` on the roof slab, footprint = porch width × 3.0 m, placed directly **behind** each porch (inside the body outline, front face on the façade line), height `housingRise = 2.6` (≈ one storey), flat top | `plasterWhite` on all faces, windowless |
| **Collision** | `pushOBB` with `ring = the original OSM ring` (body + porches = exactly the OSM outline, as #36 collides walls where they are drawn); no extra OBBs. The porches are solid for walker and car (3 m glass boxes; the walker cannot get on top of one) until #411 opens a door | unchanged mechanics |

Elevation of the street side (one house, not to scale):

```
          ┌──┐  housing top  base + h + 0.5 + 2.6   (Q1)
   ───────┤  ├───────  parapet  base + h + 0.5
   ▭▭ ▭▭ ▭▭▭ ▭▭ ▭▭   storey 10        ▭ = dark window band with shutter box
   ▭▭ ▭▭ ▭▭▭ ▭▭ ▭▭   storey 9
      …              (10 rows, pitch h/10 = 2.53 m)
   ▭▭ ▭▭ ▭▭▭ ▭▭ ▭▭   storey 1 (ground floor)
   ──────┌───┐──────  ground = base
         │ ▯ │       glass porch (the OSM bump), 3.0 m high, flat roof, door leaf ▯ in the front pane
```

Back side (west), one house, flush — nothing projects:

```
   ───────────────  parapet
   ░░▌▌░░░░▌▌░░░░   storey 10     ░ = recessed dark loggia opening, ▌ = railing band (painted)
   ░░▌▌░░░░▌▌░░░░   storey 9
      …
```

### Heights the module exports (the #411 contract)

`bodenackerFloors(base, h, storeys = 10)` → `{ pitch, floors: [y_1 … y_10], roof, housingTop }` with `floors[k] = base + k·pitch`
(k = 0 is the ground floor at `base`), `roof = base + h + 0.5` (the walkable slab, on top of the parapet band — the parapet
is 0.5 m of white wall below the slab, not a rim above it; a rim is Q2), `housingTop = roof + housingRise`.
`h` is the world's measured eaves height, so the ten rows of the texture and the ten floor levels agree by construction.

### Roles and materials

- `TEX.bodenacker` (256 × 128 canvas, one window module × one storey): speckled white plaster `#f1efe8` with the same local
  LCG speckle trick as `TEX.rowHouse` (no `rr()`: the seeded world RNG stays untouched); a 3 px storey joint at the top;
  a **dark window band** x 20–236: roller-shutter box `#9a9ea3` with slat lines (y 30–48), dark glass `#2f3844` (y 48–100)
  with a lighter reflection and one mullion at x 128 (two lights per module), a `#4a4f57` frame 3 px around the band, a
  sill shadow y 100–104. Painted from the description of the reference, not traced.
- `TEX.bodenackerLoggia` (256 × 128, same module and plaster): the back side. Same plaster, speckle and storey joint; instead of the
  window band a **recessed loggia opening** x 20–236, y 30–100: dark inner wall `#3b3f46`, an inner top shadow (`rgba(0,0,0,.35)`,
  y 30–42), light reveal strips on the left and right (`#d9d6cd`, 6 px wide) to read as depth, and a **railing band** y 74–100
  (`#6b7078` rail line at y 74, vertical bars every 8 px, `rgba(255,255,255,.10)` glass tint). Painted flat on the same wall plane:
  **no geometry is added and nothing projects**, the depth is only suggested by the texture.
- `TEX.plasterWhite` (64 × 64): the same speckled white, nothing else. Used by the roof-top housing, the parapet band and the porch
  roof slab (colour tints it).
- New role **`glass`** in `mat(role)` (`index.html` "mat: (role) =>"): `MeshPhongMaterial({ color: 0xbfd6e4, vertexColors: true,
  transparent: true, opacity: 0.35, shininess: 140, specular: 0xe8f4ff, side: DoubleSide, depthWrite: false })`. Pushed like every
  other role, so the panes are static world geometry in one draw call. Nothing else in the world uses `glass` yet; the
  windscreen (`2026-10-10-windscreen-glass-design.md`) is a car material, not a world role.
- Roof: `roofFlat` (existing gravel) with the existing flat-roof colour.

Cost: two ring extrusions (body walls split in two roles), four housing boxes, four porches of ≈ 9 boxes/planes each — ≈ 50 more
parts in a world of 2,664 buildings, all merged into the existing per-role meshes. No new textures beyond three small canvases, no
new draw calls beyond the one `glass` material.

## How it plugs into the building pipeline

`osmBuilding(b)` (`prototype/index.html`, "function osmBuilding") keeps its structure; one branch is added in the
**flat-roof path** right after `wc` is drawn from the seeded RNG:

```js
const ind = …, h = Math.max(b.h, 3);
const wc = col(ind ? … : PLASTER[Math.floor(rr(0, PLASTER.length))]);      // existing: one rr() per flat building
if (isBodenacker6(b)) { bodenackerBuilding(b, base, h); return; }          // #410: own model, RNG sequence unchanged
```

- `isBodenacker6(b)` is `b.id === BODENACKER6.id` (`bodenacker6.js`). Picked by **OSM way id**, like the row houses
  (`ROW_HOUSE_IDS`): the a–d address pattern is shared by the twin block 1a–1d, which stays generic (Q3).
- The branch sits **after** the `rr()` draw and never calls `rr()`/`rnd()` itself, so every later building keeps its
  colour — the same care #45 took for the row houses.
- `bodenackerBuilding(b, base, h)` calls `bodenackerLayout(b, base, h)` once and draws from the result: body walls (per face role),
  parapet band, porches, roof-top housings, OBB. It stores the layout on `window.__mm.bodenacker6` (a function returning it, for
  tests and for #411's own debug checks) and bumps `window.__mm.counts.bodenacker6`.
- The gable path is never taken for this building (`roof: 'flat'`, `rh` 1.4 < 1.5 and not a gable); if a future world
  rebuild changed that, the branch would simply not fire and the Playwright check below goes red — fail loudly, no silent
  fallback.
- The hand-traced layout (`!L`, no world file) does not contain this block and is untouched.
- House-number labels (`addrLabels`), the J landmark and #409's register all key on `b.ring`/`b.rect`, which this spec
  does not change.

## The data contract #411 reuses (`prototype/bodenacker6.js`)

```js
export const BODENACKER6 = {
  id: 171822634, storeys: 10, houses: ['6a', '6b', '6c', '6d'],
  houseOrder: 'northToSouth',          // confirmed 2026-10-21: 6a at the north end; one constant, nothing else assumes it
  housingRise: 2.6, parapet: 0.5,      // m above the roof slab (Q1) / white band under the slab
  moduleWidth: 4.0,                    // façade texture tile width (one window module)
  porch: { h: 3.0, door: 1.0, post: 0.15, slab: 0.25, overhang: 0.1 },
  stair: { d: 3.0 },                   // depth of the stair hall behind the façade line (m into the body)
  bumpMinDepth: 1.5, bumpMaxWidth: 4.0 // what counts as a porch bump in the ring
};
export function isBodenacker6(b)                         // b.id === BODENACKER6.id
export function bodenackerFrame(rect)                    // { cx, cz, rot, toWorld(u, v) → [x, z], toLocal(x, z) → [u, v], outTh, inTh }
export function simplifyRing(points, tol = 0.15)         // drops collinear vertices (local frame)
export function bodenackerPorches(ring, frame, cfg)      // [{ house, u, v0 (façade), v1 (tip), w, d, h, entrance: { x, z, th, w } }] sorted along u, houses by houseOrder
export function bodenackerBody(ring, frame, porches)     // the local ring with the porch bumps replaced by the façade line
export function bodenackerWalls(body, frame)             // [{ a: [x, z], b: [x, z], face: 'street' | 'back' | 'end' }] by the outward normal's v component
export function bodenackerStairs(porches, cfg)           // [{ house, u, w, d, vFront (= porch v0), vBack }] the stair hall footprint behind each porch
export function bodenackerFloors(base, h, storeys)       // { pitch, floors, roof, housingTop }
export function bodenackerLayout(b, base, h)             // { frame, porches, stairs, body, walls, floors, ring: b.ring } — the one object index.html draws from
export function bodenackerHouse(layout, house)           // { porch, stair } for '6a' … '6d'; throws on an unknown house
```

- `frame.outTh` is the heading of +v (out of the house into the street), `frame.inTh = outTh + π` the direction you walk
  **in**; `porch.entrance = { x, z, th: inTh, w: porch.door }` on the porch's street face is exactly #409's absolute entrance
  format, so #411 fills `ENTERABLE_INFO[…].entrances` from `bodenackerHouse(layout, '6c').porch.entrance` and flips `ready`.
- `stairs[i]` gives #411 the stair hall's footprint in the block frame (`u`, `w`, `d`, `vFront`, `vBack`) directly behind the
  porch, and `floors` the landing heights; how the lift sits and the landing windows are #411's design.
- Nothing in the module knows about levels, the walker or three.js; it is unit-tested with node like `holzbruecke.js`.

### Porch detection (why derived, not hard-coded)

The bumps are found in the ring rather than typed in: after `simplifyRing` (the OSM outline splits the bump tops into
two collinear edges), a bump is a run of three edges — out along +v by ≥ `bumpMinDepth`, along u by ≤ `bumpMaxWidth`,
back along −v by ≥ `bumpMinDepth` — on the +v side of the block. Exactly four are expected; any other count throws
(`bodenackerLayout` fails fast; `osmBuilding` catches, logs one `console.warn` and falls back to the generic extrusion so a
world rebuild never leaves a hole in Sisseln — and the Playwright check catches the fallback). This keeps the model
correct when the world is rebuilt from newer OSM with centimetre shifts, and the unit test pins the four `u` centres
against the real ring from `data/world_hochrhein.json`.

## Façade texture design (own work)

Reference only: white plaster, regular window grid, dark window bands, roller-shutter boxes, recessed loggias on the back.

One tile = **one module (4.0 m) × one storey (2.53 m)**, repeated with `uPerFace` so every façade segment starts
on a module boundary (the steps of the plan then read as real corners, not as a cut window). Painted elements of
`TEX.bodenacker` (canvas 256 × 128, y = 0 is the top of the storey):

1. plaster `#f1efe8` + speckle (local LCG, 220 dots, ±12 grey)
2. storey joint: `rgba(0,0,0,.07)` y 0–3
3. window band frame `#4a4f57`: x 17–239, y 27–104
4. shutter box `#9a9ea3`: x 20–236, y 30–48; slats `rgba(0,0,0,.16)` every 4 px
5. glass `#2f3844`: x 20–236, y 48–100; reflection `rgba(255,255,255,.14)` on the left third; mullion `#4a4f57` x 126–130
6. sill shadow `rgba(0,0,0,.22)`: x 17–239, y 100–104

`TEX.bodenackerLoggia` shares steps 1–2 and replaces 3–6 by the recessed loggia opening and railing band described under "Roles
and materials". `bodenackerWalls` decides the tile per wall: outward normal with a clearly negative v component (`< −0.5`) is
`'back'` → `bodenackerLoggia`; positive v → `'street'` and the ±u end walls `'end'` → `bodenacker`.

Not painted: hedges, the ground-floor difference. The painted tiles are the deliverable (no photos, decision 2026-10-21); they
could later be swapped for rectified photo tiles of the same 4.0 × 2.53 m module without touching geometry or UV layout.

## Testing approach

Buildless stack: node unit tests on the pure module are the real gate; one Playwright file confirms the model is on the
page. Playwright runs in the foreground only, after commit and push (CLAUDE.md).

- **Node (`prototype/tests/bodenacker6.test.mjs`)**: frame round trip and headings; `simplifyRing` drops the collinear
  split; a synthetic 2-bump ring yields two porches with the right `u`, `v0`, `v1`, `w`, `d`; the real ring (read from
  `data/world_hochrhein.json`, skipped when missing) yields **four** porches at `u ≈ −23.2, −10.6, 4.3, 19.1` (±0.3) and
  a body ring with 4 × 3 fewer edges; porch `h = 3.0`, `entrance.th = inTh`, entrance on the +v face of the bump; `bodenackerStairs`
  sits behind the façade line (`vBack = v0 − 3.0`) with the porch's `u` and `w`; `bodenackerWalls` classifies the back steps as
  `'back'`, the street run as `'street'`, the ends as `'end'`; floors: `pitch = h/10`, `floors[0] = base`, `floors[9] = base + 9·pitch`,
  `roof = base + h + 0.5`; `bodenackerHouse` honours `houseOrder` (`'6a'` = largest `u`, `'6c'` = third from the north) and throws on `'6e'`; a ring
  with three bumps throws.
- **Playwright (`prototype/tests/test_bodenacker6.py`, pattern of `test_row_houses.py`)**: with the world, `__mm.counts.bodenacker6 == 1`,
  `__mm.bodenacker6()` returns 4 porches and 4 stairs; `wallRoleAt` from 12 m outside the east façade **between two porches**
  hits `bodenacker`, from outside the **west** façade hits `bodenackerLoggia`, aimed at a housing above the roof (`up = h + 1.5`)
  hits `plasterWhite`; aimed at a porch front at 1.5 m hits `glass`; `roles()` contains `glass`. The hand layout (world blocked)
  has no `bodenacker6` count. One file, three tests; also re-run `test_row_houses.py` (its `OTHER_ID` is this block) and
  `test_building_collision.py`.
- No frame-rate check: ≈ 50 parts.

## Acceptance criteria

- [ ] The block shows ten storeys of the own façade texture, four glass entrance porches (the OSM projections: glass sides, flat
      roof, a door leaf facing the street), a white windowless housing above the roof behind each porch, and flush recessed-loggia
      tiles on the back side, on the OSM footprint; no Street View or geo.admin pixels anywhere.
- [ ] `bodenacker6.js` exports the contract above; node tests green; the real ring yields four porches.
- [ ] Other buildings' colours unchanged (no new `rr()` draw before `osmBuilding` returns for this block).
- [ ] Collisions: car and walker are blocked by the body and the porches as before (ring OBB).
- [ ] Playwright check green; `test_row_houses.py` and `test_building_collision.py` still green.
- [ ] CHANGELOG entry in player voice, naming only the address; nothing personal in code, tests, commits or the issue.

## Assumptions

- **A1** [high] Height = the world's measured `h` (25.3 m) with `storeys = 10` as data; no second height source.
- **A2** [high] The four OSM projections are the glass entrance porches (confirmed 2026-10-21); the stair halls lie in the body
  directly behind each porch.
- **A3** [med] A white windowless roof-top stair/lift housing rises 2.6 m above the roof slab behind each porch, flat (Q1, still open).
- **A4** [high] Porch height 3.0 m, door leaf in the street-facing (+v) pane, centred (door side confirmed 2026-10-21).
- **A5** [high] House order along the block north → south = 6a → 6d (confirmed); one constant, #411 keys on `'6c'` through it.
- **A6** [high] Street side and ends: window tile; back (west) side: recessed-loggia tile, flush (confirmed 2026-10-21).
- **A7** [high] Picked by OSM id; the twin block 1a–1d stays generic (Q3).
- **A8** [high] Painted own tile, no photos (default kept).

## Open questions for the maintainer

1. **Roof-top housing:** is there a stair/lift housing above the roof behind each porch, and how far does it rise (≈ one storey,
   2.6 m assumed)? map.geo.admin.ch 3D shows the roof heights per part on click; or an own photo. If there is none, set
   `housingRise` to 0 and nothing else changes.
2. **Parapet rim:** a rim above the roof slab? (Default: no; the 0.5 m white band is under the slab, so the roof edge stays walkable for #411.)
3. **Twin block 1a–1d** (`171822635`, the same plan type by its outline, measured `h` 11.8): out of scope here; worth its
   own issue if the maintainer wants it to match.

Resolved 2026-10-21: projections are the glass porches; porch door at the front; 6a at the north end; back side has flush recessed
loggias; painted tile kept (no photos).

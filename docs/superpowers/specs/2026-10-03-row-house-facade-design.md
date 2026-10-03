# Facade texture for the Bodenackerstrasse row houses (#45) — Design

Status: written in headless enrichment (`/enrich 45 --headless`) 2026-10-03 · Issue #45 · related #43 (roof shape, enriched in parallel), #34 / #17 (heights)

## Problem

The sixteen row-house blocks on the Bodenackerstrasse in Sisseln (3a–3f … 21a–21f, plus the three-unit block 16a–16c) are drawn like every other village house: a random `PLASTER` colour under the generic `TEX.facade` / `TEX.facadeDoor` texture (`prototype/index.html:512-518`). In reality they are a recognisable estate: white plaster, three storeys, yellow window frames and lintels, grey roller shutters, and one yellow vertical panel per house unit stacked over the storeys. The player wants them to look like that.

The reference is the player's Google Street View screenshot of Bodenackerstrasse 4 (June 2023). It is **not** committed and **not** copied: the repo is public, and `docs/07-brands-and-permissions.md` already draws that line for third-party imagery. The texture is painted procedurally in that style, the way every other `TEX.*` texture is.

## Starting point (verified 2026-10-03 on `main` @ `214fae3`)

- **Textures are canvas-painted.** `makeTex(w, h, draw)` (`index.html:235`) draws into a `<canvas>` and wraps it in a `THREE.CanvasTexture` (sRGB, repeat, anisotropy 4). The whole `TEX.*` set (`index.html:241-263`) is built this way; the only image file is `prototype/textures/asphalt_sisseln.jpg`, from the maintainer's own photo. `TEX.facade` (`index.html:241`) is a 256 × 192 tile with two windows on a noisy plaster background, used for every `wall`.
- **One merged mesh per role.** Every geometry is pushed under a *role* (`push(role, geo)`, `index.html:402`); after the world is built, `mergeGeometries` makes one `THREE.Mesh` per role (`index.html:810-811`, `MESH[role]`). The material per role comes from the active style profile: `STYLES.original.mat(role)` maps roles to textures (`index.html:876`), `STYLES.smooth.mat(role)` maps them to flat colours (`index.html:878`). A building therefore cannot carry its own texture unless it gets its own **role**.
- **Vertex colours multiply the texture.** `colorize(geo, c)` (`index.html:403`) writes the wall colour into a `color` attribute and the Original material uses `vertexColors: true`. `TEX.facade` is light beige, and the `PLASTER` colours (`index.html:468`) tint it per house.
- **Two code paths in `osmBuilding()`** (`index.html:507-520`):
  - **gable** (`b.roof === 'gable'`, and not a measured flat roof): `box(w, h + 3, d, …, 'wall' | 'wallDoor', [4, 3], 3.1)` plus `gable(...)`, whose two gable-end triangles are pushed under `'wall'` (`index.html:425`).
  - **flat** (everything else): `extrudeFootprint(ring, base, h, wc, 'wall' | 'hall' | 'hallBand', roofC, tile)` (`index.html:488-505`), which walks the real OSM ring and lets the texture's `u` run **cumulatively** around the footprint (`along / tile[0]`, `index.html:497`), so a tile boundary does not sit on a corner.
  - `box()` (`index.html:404`) scales each face's UV from 0: `u ∈ [0, faceWidth / tile[0]]`, `v ∈ [0, h / tile[1]]`.
- **The RNG is seeded** (`seed = 4334`, `index.html:222`). Every `rr()`/`rnd()` call advances it, so an added call changes the colour, the door variant and the trees of everything built afterwards. The texture code already protects the sequence (`index.html:238`, `:261`: "no rr() here, so the seeded RNG sequence stays the same"). `osmBuilding()` draws one `PLASTER` colour per building in both paths and one coin for `wall`/`wallDoor` in the gable path.
- **The data.** `data/world_hochrhein.json` has the sixteen blocks with their OSM way ids, `addr` ranges, `rect = [cx, cz, w, d, rot]`, measured `h` (6.2–8.1 m), `rh` and `hsrc: 'dsm'`. All sixteen are `roof: 'flat'` today except 16a–16c (`roof: 'gable'`, `rh: 0.1` — the measured-flat guard sends it down the flat path too). So **every block is drawn by the flat path right now**. The data carries no street name per building; `addr` is the only textual field (`pipeline/world_buildings.py:94-98`).

  | Block | OSM way | `rect` w × d | `h` | `rh` |
  |---|---|---|---|---|
  | 3a–3f | 512632899 | 36.3 × 12.1 | 6.3 | 0.1 |
  | 4a–4f | 171822953 | 36.4 × 12.0 | 6.2 | 0.1 |
  | 7a–7f | 171822664 | 36.0 × 12.8 | 6.7 | 0.1 |
  | 8a–8f | 171822908 | 36.1 × 12.6 | 6.2 | 0.1 |
  | 10a–10f | 171822943 | 37.5 × 14.8 | 7.5 | 2.9 |
  | 11a–11f | 171822930 | 36.1 × 13.3 | 6.7 | 0.1 |
  | 12a–12f | 171822937 | 37.3 × 14.8 | 7.7 | 2.9 |
  | 13a–13f | 171822939 | 36.1 × 12.6 | 6.5 | 0.1 |
  | 14a–14f | 171822949 | 37.4 × 15.0 | 7.8 | 2.9 |
  | 15a–15f | 171822935 | 36.6 × 13.1 | 6.3 | 0.1 |
  | 16a–16c | 171822799 | 18.1 × 11.6 | 6.9 | 0.1 |
  | 17a–17f | 171822913 | 36.3 × 12.6 | 6.5 | 0.1 |
  | 18a–18f | 171822938 | 37.7 × 14.7 | 8.1 | 3.0 |
  | 19a–19f | 171822933 | 37.3 × 14.8 | 7.8 | 3.0 |
  | 20a–20f | 171822934 | 37.9 × 14.9 | 7.7 | 3.0 |
  | 21a–21f | 171822932 | 37.2 × 14.7 | 7.8 | 2.9 |

  Two neighbours share the `Na–Nx` address pattern but are **not** row houses: Bodenackerstrasse 6a–6d (171822634, 61 × 22 m, eight storeys) and 1a–1d (171822635, 60 × 20 m).
- **Tests.** Pure helpers live in `prototype/world.js` with `node:test` (`prototype/tests/world.test.mjs`). In-browser behaviour is checked with Playwright (Python, `prototype/tests/test_*.py`, SwiftShader, `window.__mm` hooks, foreground only). `__mm.counts` already reports per-kind totals; `__mm.place(x, z)` teleports the car.

## Goal

The sixteen Bodenackerstrasse blocks show a white facade with one yellow panel per house unit, yellow-framed windows with grey roller shutters, one window per unit and storey, in both graphic styles. Every other building is pixel-identical to today. The texture is painted, nothing from Street View is committed.

## Design

### Texture: `TEX.rowHouse`, one house unit × one storey per tile

A new canvas texture next to the other `TEX.*` entries, 256 × 128 px, representing **6 m × 3 m of wall**: one house unit wide, one storey tall. Painted content, top to bottom:

- white plaster `#f4f1ea` with a faint speckle, drawn from a **local** LCG (so no `rr()` call — the world seed stays untouched);
- a thin shadow line along the top edge (the storey joint);
- a **yellow vertical panel** (`#e3b31f`, ~26 px = 0.6 m) on the left edge of the tile with a soft shadow on its right, so that tiling puts one panel between every two units and stacks it over the storeys;
- one **window**: yellow frame and lintel, a grey roller-shutter box (`#8c9095`, with dark slats) under the lintel, dark blue-grey glass with a light reflection and a yellow mullion, a dark sill shadow below.

Entrances and porches are **not** painted: the tile repeats per storey, and a door on the ground floor only would need a second texture (see A4). The gravel `roofFlat` on top stays as is; the thin metal roof edge belongs to the roof (#43), not to the facade.

### Role: `rowHouse`

A new geometry role. `STYLES.original.mat` maps it to `TEX.rowHouse`; `STYLES.smooth.mat` maps it to the flat colour `#f4f1ea` and lists it among the roles drawn without vertex colours (like `wall`). `MESH.rowHouse` is created by the existing per-role loop with no change; `applyStyle` re-materialises it with every other role. In the hand-traced layout no geometry is pushed under the role, so there is no mesh and nothing changes.

The wall geometry is pushed with the vertex colour **white** (`#ffffff`), so the texture's own colours are shown unchanged.

### Selection: an OSM way-id list in `world.js`

```js
export const ROW_HOUSE_IDS = new Set([512632899, 171822953, 171822664, 171822908, 171822930, 171822939, 171822935, 171822913, 171822943, 171822937, 171822949, 171822938, 171822934, 171822932, 171822933, 171822799]);
export function isRowHouse(b)
export function rowUnits(addr)        // '3a–3f' → 6, '16a–16c' → 3, missing or unreadable → 6
export function rowHouseTile(b)       // [unitWidth, storeyHeight] = [max(w, d) / rowUnits(addr), h / max(1, round(h / 3))]
```

The sixteen ids are #43's table plus 16a–16c (171822799, the "one three row"). 19a–19f is included: it is one of the blocks even though the player did not report its roof. The tile is derived from the data, so the yellow panels fall on the unit joints (36.4 m / 6 = 6.07 m) and the storeys are whole: at today's measured 6.2–6.7 m that is **two** storeys of ~3.1 m; when #34 lifts the eaves to ~9 m, three storeys appear with no further change.

### `osmBuilding()` changes

Both paths handle a row house, so the facade survives #43 (which will route the pitched blocks through the gable path):

- The `PLASTER` draw (and, in the gable path, the `wall`/`wallDoor` coin) **still runs** for a row house and is then ignored, so the RNG sequence for every later building is unchanged.
- **Gable path:** `box(...)` gets vertex colour white, role `rowHouse`, tile `rowHouseTile(b)`. `gable()` is untouched, so the two gable-end triangles keep the plain `wall` texture, as the issue allows ("may share the wall texture").
- **Flat path:** `extrudeFootprint(b.ring, base, h, white, 'rowHouse', col('#8f8a84'), rowHouseTile(b), true)`. The new last argument `uPerFace` makes `u` restart at 0 on every ring edge (`u0 = 0, u1 = L2 / tile[0]`) instead of running cumulatively, so a panel sits on each corner and the panels along the long side line up with the units. The default `false` keeps today's behaviour for every other building. The short sides are 12–15 m, i.e. 2.0–2.5 units: a partial panel at one corner is accepted.
- `__mm.counts.rowHouses` counts the blocks that took the role (for the Playwright test).

### Test hooks (`window.__mm`)

- `__mm.roles()` → `Object.keys(MESH)`.
- `__mm.wallRoleAt(x, z, tx, tz, up = 2.5)` → the role of the first `MESH` mesh hit by a horizontal ray from `(x, terrainH(tx, tz) + up, z)` towards `(tx, …, tz)`, or `null`. Used to prove the role sits on the row houses and not on their neighbour.
- `__mm.place(x, z, th)` accepts an optional heading, so a screenshot can look at a facade.

## Assumptions (headless — no human was asked)

- **A1** [high] Canvas-painted texture, no image file. Every texture but the maintainer's own asphalt photo is painted (`prototype/index.html:241-263`), and the only reference is Google imagery, which must not be committed (issue text; `docs/07-brands-and-permissions.md:12`). Rejected: a PNG in `prototype/textures/`, which would either be traced from Street View or add a hand-painted binary with no source.
- **A2** [med] Selection by an explicit OSM way-id list in `prototype/world.js` (#43's fifteen ids plus 171822799 for 16a–16c). Rejected: an `addr` pattern (`^\d+a–\d+[c-f]$` also matches 6a–6d and 1a–1d, which are the big blocks, `data/world_hochrhein.json`); a pipeline field (needs a world rebuild with the local swisstopo caches, which a CI implementer does not have — `docs/superpowers/plans/2026-10-02-gemeinde-boundaries.md`, world rebuild task); a generic "36 × 13 m, six units" palette (would be fragile and is the same list in disguise).
- **A3** [med] One tile = one house unit × one storey, storeys = `max(1, round(h / 3))`, unit width = long side / units from the `addr` letters. Rejected: a full-height three-storey tile, which `extrudeFootprint` would cut at `v = h / tile[1]` (`index.html:497`), i.e. at two thirds of the second storey at today's 6.2 m.
- **A4** [med] Entrances and porches are not drawn; the ground floor shows the same window tile as the storeys above. Rejected: a `wallDoor`-style second texture plus per-storey UV splitting, roughly doubling the task for a detail seen from the road at 50 km/h.
- **A5** [high] A new role `rowHouse` with its own merged mesh and material. The per-role material lookup (`index.html:876-878`) leaves no other way to give a subset of buildings a texture.
- **A6** [high] Pitched blocks (10, 12, 14, 18, 20, 21) get the facade on the box only; the gable-end triangles stay `wall`. The issue says the pitched blocks "may share the wall texture", and `gable()` (`index.html:418-426`) is shared by every house, church and station.
- **A7** [high] `u` restarts per ring edge for the row houses (new `uPerFace` flag), default off. Without it the panels on the long side are offset by the short side's fractional unit count (`along / tile[0]`, `index.html:497`).
- **A8** [med] The thin grey metal roof edge is not drawn. It belongs to the roof, and #43 owns the roofs of these blocks; the facade tile repeats per storey and cannot carry a top edge.
- **A9** [high] Heights are not touched; the storey count follows `h` and corrects itself when #34 / #17 raise the eaves.
- **A10** [high] The `PLASTER`/door RNG draws keep running for row houses, so no other building changes colour (`index.html:222-224, 512, 517`).

## Consequences

- **#43 and #45 both edit `osmBuilding()`** (`index.html:507-520`). Whichever lands second rebases over a ~12-line function; the changes are orthogonal (roof type vs. wall role/tile), so the merge is mechanical, but it is a real conflict to expect.
- One more role means one more draw call and one more `MESH` entry; `applyStyle` and the shadow flags pick it up with no change.
- Today all sixteen blocks render through the flat path (`roof: 'flat'` or measured flat), so the facade appears on all four sides with the gravel `roofFlat` on top. After #43 the six pitched blocks get a `box` + `gable` with plain-`wall` gable ends.
- At today's measured heights the blocks show two storeys; three appear only once #34 / #17 lift `h` to ~9 m.
- The short facades (12–15 m) end in a partial yellow panel at one corner.
- Blocks 6a–6d and 1a–1d, the big neighbours, are unchanged; they are the negative case in the Playwright test.
- The hand-traced layout has no `rowHouse` mesh; `__mm.roles()` there does not list it.
- A world rebuild is **not** needed; the change is prototype-only.

## Testing

- `node --test prototype/tests/world.test.mjs`: `isRowHouse` (two positives incl. 16a–16c, 6a–6d and an unrelated id as negatives), `rowUnits` (`3a–3f` → 6, `16a–16c` → 3, `undefined` and `'6'` → 6), `rowHouseTile` on 4a–4f at `h = 6.2` (→ `[36.4 / 6, 3.1]`), at `h = 9` (→ `[6, 3]`) and on 16a–16c (→ `[6, 3.45]`).
- Playwright `prototype/tests/test_row_houses.py` (new, foreground): with the real world file, `__mm.counts.rowHouses === 16`, `'rowHouse' ∈ __mm.roles()`, `__mm.wallRoleAt` returns `'rowHouse'` for every block probed from 12 m outside its long face and something else for 6a–6d; in the hand-traced layout the role is absent and the count is 0.
- Visual check for a human: two 960 × 540 screenshots (Original and Smooth style) of 4a–4f from the street, taken by a Playwright snippet and committed under `docs/ai-notes/screenshots/2026-10-03-row-houses/`, linked from the PR description. The reviewer judges "recognisable against the real street"; no pixel assertion.
- Existing suites stay green: `prototype/tests/test_smoke.py` (empty console in both layouts), `test_street_labels.py`, `test_debug.py`.
- Manual: drive the Bodenackerstrasse (J → Sisseln, then east) in both styles and look at blocks 4, 8, 16 and 20.

## Out of scope

Roof shape and the metal roof edge (#43), eaves heights (#34, #17), entrances/porches, any pipeline or world-file change, other estates.

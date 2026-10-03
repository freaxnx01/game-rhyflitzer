# Row-house gable ends in the white facade colour (#87) — Design

**Issue:** [#87](https://github.com/freaxnx01/game-rhyflitzer/issues/87) · fix(buildings) · cosmetic follow-up to #43 (roof from ridge) and #45 (row-house facade, PR #82)

## Problem

Since #43 seven of the sixteen Bodenackerstrasse row-house blocks (10, 12, 14, 18, 19, 20, 21 — `roof: 'gable'`, `rh` 3.2–3.3 m in `data/world_hochrhein.json`) take the gable path of `osmBuilding()`. #45 gives their walls the white `rowHouse` facade, but the two triangular gable ends above the eaves are still drawn in the per-building random `PLASTER` colour on the generic plaster-with-windows texture, so a beige or pink triangle sits on top of a white wall.

## Cause (read from the code, no run needed)

- `osmBuilding()`, gable path (`prototype/index.html:572-577`): the box gets `row ? col('#ffffff') : wc` and role `row ? 'rowHouse' : door` (`:575`), but the very next line calls `gable(w, d, base + h, …, rc, wc)` (`:576`) — the **random plaster colour `wc`**, unconditionally.
- `gable()` (`index.html:475-483`) builds the two roof slabs under role `roof` and the two end triangles under a **hard-coded role `'wall'`** with vertex colour `wallC` (`:483`: `rawGeo(gp, gn, gu, rot, x, z, wallC, 'wall')`). Role `wall` maps to `TEX.facade` (`:951`), the plaster texture with two dark windows per tile.
- So the gable ends of a row house are `PLASTER[i] × TEX.facade` while the wall below is `white × TEX.rowHouse` (`#f4f1ea` plaster, `:306-320`). This is exactly what #45's spec chose on purpose (A6: "the gable-end triangles stay `wall`"), which #87 now reverses.

## Design

The gable ends of a row house take the **same colour and role as the wall below them** — vertex colour white, role `rowHouse` — and sample only the **plain plaster patch** of `TEX.rowHouse`, so the triangle reads as an undecorated white gable end rather than carrying a yellow unit-joint panel and a window into the attic.

### `gable()` gets an optional end descriptor

```js
// index.html:475
function gable(w, d, h0, rh, x, z, rot, roofC, wallC, over = 0.45, end = GABLE_END_WALL)
```

- `end = { role, uv }`. Default `GABLE_END_WALL = { role: 'wall', uv: null }` keeps every existing caller (`house()`, `church()`, `stationAt()`, the hand-layout barns, non-row `osmBuilding()`) byte-identical: `uv: null` means "the current per-triangle UVs `[0, 0, d / 4, 0, d / 8, rh / 3]`".
- The two end triangles are pushed with `end.role` instead of the literal `'wall'`, and with `end.uv` when it is set.

### The row-house end descriptor

Defined next to `TEX.rowHouse` (`index.html:306-320`), where the texture layout is documented:

```js
// #87: gable ends of a row house — plain plaster only. The tile is 256 x 128: yellow panel at x 0-29, window frame at x 96-214 / y 22-116,
// storey joint at y 0-3 (canvas y flips to v). u 0.14-0.35, v 0.05-0.90 is speckled white with nothing painted on it
const ROW_GABLE_END = { role: 'rowHouse', uv: [0.14, 0.05, 0.35, 0.05, 0.245, 0.90] };
```

`uv` holds the three `(u, v)` pairs for the triangle's corners (eave-left, eave-right, ridge) in the order `gable()`'s `tri()` pushes them. The same six numbers serve both ends; the patch is well inside `[0, 1]`, so texture wrap mode is irrelevant.

### `osmBuilding()` passes colour and descriptor

```js
// index.html:576
gable(w, d, base + h, dsm ? b.rh : Math.min(w, d) * 0.4, cx, cz, rot, rc, row ? col('#ffffff') : wc, 0.45, row ? ROW_GABLE_END : GABLE_END_WALL);
```

Nothing else changes: the `PLASTER`/`ROOFS`/door RNG draws keep running for row houses (seeded RNG, `index.html:222`), the roof slabs keep `rc` and role `roof`, the `addOBB` collision box is untouched, and the flat path (nine blocks) is not involved.

### Both graphic styles

Role `rowHouse` already has a material in both style tables (`index.html:951` textured, `:953` flat `#f4f1ea`, vertex colours off), so the gable ends match the wall in the original and the smooth style with no material change.

## Testing

- **Playwright (`prototype/tests/test_row_houses.py`, foreground):** a new test raycasts horizontally at each of the seven pitched blocks from 12 m outside a gable end (local `(w/2 + 12, 0)` of `b.rect`) towards the footprint centre, at `up = b.h + 0.4 · b.rh` above the terrain — inside the end triangle, above the box top (`base + h`), below the ridge, and under the roof slabs on the centre line. `window.__mm.wallRoleAt(x, z, tx, tz, up)` (`index.html:1038`) must return `'rowHouse'` for all seven. Control: Lerchenweg 11 (`171822877`, `gable`, `h 3.0`, `rh 5.7`, no row house) must still return `'wall'` at its gable end. Written first, red against today's code (the seven return `'wall'`).
- **Existing tests** (`test_row_houses.py` long-face check, `test_smoke.py`, `test_street_labels.py`, `test_debug.py`, `node --test prototype/tests/`) stay green — the box, the roles list and the RNG sequence are unchanged.
- **Screenshot for a human:** one PNG of a pitched block's gable end in the original style, committed under `docs/ai-notes/screenshots/2026-10-03-row-house-gable-ends/`; a person judges whether the plain white triangle reads right (and whether the stretched speckle is acceptable).

## Assumptions

- **A1** [high] The gable ends take role `rowHouse` and vertex colour white, i.e. the wall's own material. Rejected: tinting the existing `wall` role white — `TEX.facade`'s base is `#d8d2c6` with two dark windows per 4 m (`index.html:279`), so a white-tinted triangle is still a beige, windowed triangle on a `#f4f1ea` wall; a new plain-white texture and role for two triangles per block (one more `MESH` entry, material and style-table row in both tables, `:951, :953`).
- **A2** [med] The triangle samples the undecorated patch of `TEX.rowHouse` (u 0.14–0.35, v 0.05–0.90) instead of the unit tile. Rejected: tiling the facade pattern over the gable end with `rowHouseTile(b)` UVs — it would paint a yellow unit-joint panel on the house's outer corner and a shuttered window into the attic triangle, and the issue asks for the gable ends "in the white facade colour", not for more facade. The human disagreement risk is taste: the speckle, painted at 2.3 cm/px on the wall, stretches to ~25 cm/px on the 15 m end (soft, alpha .22); the screenshot step exists for this.
- **A3** [high] `gable()` grows one trailing optional parameter with a descriptor default rather than a role string or a boolean. The function is shared by `house()`, `church()`, `stationAt()`, the barns and `osmBuilding()` (`index.html:527, 530, 576, 722, 811`); a defaulted trailing object leaves every existing call untouched and keeps role and UVs together, so no caller can pass one without the other.
- **A4** [high] Only the seven measured-gable blocks change (`roof: 'gable'`, `rh ≥ 0.6`: 10, 12, 14, 18, 19, 20, 21). The nine flat blocks have no gable and are drawn by `extrudeFootprint()` (`index.html:580`). If #34 / #17 re-measure the eaves and flip a block's roof type, that block simply follows the path it lands on.

## Consequences

- Reverses #45's A6 by design; `docs/superpowers/specs/2026-10-03-row-house-facade-design.md` stays as written (history), this spec is the current word.
- `gable()`'s gable-end UVs become data-driven for one caller; the default path still computes `[0, 0, d / 4, 0, d / 8, rh / 3]` inline, so every other gable end renders identically.
- Overlap: **#71** (house-number plates) replaces `osmBuilding()`'s inline gable predicate with `drawsGable(b)` on the same lines (`index.html:572-577`); whichever lands second rebases a one-line conflict on `:576`. **#34** (Bodenackerstrasse 6 height / eaves-from-roof-samples) may change `h`/`rh`/`roof` of measured blocks and therefore which row houses take the gable path; the Playwright test derives its set from the world data (`roof == 'gable' and rh >= 0.6` within `ROW_IDS`) rather than hard-coding seven ids, so it survives that.
- No change to the RNG sequence, the collision OBBs, the flat path, the hand-traced layout (no row houses there) or the materials.

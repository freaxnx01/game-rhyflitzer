# Roof shape from the measured ridge — design

Status: approved in headless enrichment (`/enrich 43 --headless`) 2026-10-03 · Issue #43 · builds on #17

## Goal

A measured building (`hsrc: "dsm"`) gets its roof shape from the ridge the surface model measured, not from the footprint heuristic alone. On the Bodenackerstrasse in Sisseln the row houses 10, 12, 14, 18, 20 and 21 get the pitched roof they really have; 3, 4, 7, 8, 11, 13, 15, 16 and 17 stay flat.

## Starting point (verified 2026-10-03 on the worktree at `214fae3`, against `data/world_hochrhein.json` built 2026-10-03T05:58Z)

- `pipeline/world_buildings.py:40-50` `roof(poly)` decides `"gable"` only for a footprint **under 250 m²** that fills **at least 85 %** of its minimum rotated rectangle. The rectangle (`rect = [cx, cz, w, d, angle]`) has `w >= d` and `angle` along the long edge. Every 36 × 13 m Bodenackerstrasse block is 380–500 m², so all of them are `"flat"`, pitched or not.
- `pipeline/building_heights.py:36-78` `apply()` measures eaves `h` (10th percentile) and ridge `rh` (95th minus 10th) for each footprint and sets `hsrc: "dsm"`. It reads `b["roof"]` once, at line 63: a `"gable"` footprint gets its eaves pushed down to the wall line. It never writes `roof`.
- `prototype/index.html:507-515` `osmBuilding()` draws a gable only when `b.roof === 'gable'`, and overrides that to flat when `dsm && b.rh < 0.6`. The gable path (`gable(w, d, base + h, dsm ? b.rh : …)`) uses the measured `rh` as the ridge rise and puts the ridge along `w`, the long side. It draws a rectangular box on `rect` with the village palette, whatever `b.palette` says. `prototype/world.js:115` `roofTop()` already uses `h + rh` for measured buildings.
- The data for the row houses (`data/world_hochrhein.json`):

  | Block | OSM way | ring area | fill | `rh` | Real |
  |---|---|---|---|---|---|
  | 3a–3f | 512632899 | 381 | 0.87 | 0.1 | flat |
  | 4a–4f | 171822953 | 383 | 0.88 | 0.1 | flat |
  | 7a–7f | 171822664 | 411 | 0.89 | 0.1 | flat |
  | 8a–8f | 171822908 | 395 | 0.87 | 0.1 | flat |
  | 11a–11f | 171822930 | 423 | 0.88 | 0.1 | flat |
  | 13a–13f | 171822939 | 389 | 0.86 | 0.1 | flat |
  | 15a–15f | 171822935 | 405 | 0.85 | 0.1 | flat |
  | 17a–17f | 171822913 | 406 | 0.89 | 0.1 | flat |
  | 10a–10f | 171822943 | 494 | 0.89 | 2.9 | pitched |
  | 12a–12f | 171822937 | 492 | 0.89 | 2.9 | pitched |
  | 14a–14f | 171822949 | 499 | 0.89 | 2.9 | pitched |
  | 18a–18f | 171822938 | 499 | 0.90 | 3.0 | pitched |
  | 20a–20f | 171822934 | 503 | 0.89 | 3.0 | pitched |
  | 21a–21f | 171822932 | 484 | 0.89 | 2.9 | pitched |
  | 19a–19f | 171822933 | 497 | 0.90 | 3.0 | not reported |
  | **16a–16c** | **171822799** | 208 | 1.00 | 0.1 | flat |

  **Building 16 is `w171822799`, `addr` `16a–16c`**, the three-house row from the player's note (18.1 × 11.6 m). The heuristic calls it `"gable"` (208 m² < 250, fill 1.0); the prototype's `rh < 0.6` override already draws it flat. 15a–15f has fill 0.845, just under 0.85 — irrelevant for a flat block, but it shows the fill margin is thin for these rows.

- Among the 1,693 measured buildings: 583 are `"flat"` with `rh >= 1.5`. 261 of those fill ≥ 85 % of their rectangle; 92 of the 261 are over 1,000 m² (halls up to 183 × 93 m with `rh` 3 m, i.e. rooftop plant). 132 buildings are `"gable"` with `rh < 0.6`. 175 buildings have `rh` between 0.6 and 1.5 m (103 `"gable"`, 72 `"flat"`).

## Decisions

| Topic | Decision | Rationale |
|---|---|---|
| Where the shape is decided | In the **pipeline**, in `building_heights.apply()`, right after `h`/`rh` are known. The world file's `roof` field then says what is drawn. `osmBuilding()` is **not** changed. | Three readers use `roof` (`index.html:511`, `world.js:115`, `building_heights.py:63`); fixing the data fixes them all, and the issue's golden test can only pin a data field. Leaving `osmBuilding()` alone also keeps #45 (facade texture, same function) conflict-free. |
| The rule | `roof_shape(kind, rh, fill, area)` — a pure function: `rh >= 1.5` **and** `fill >= 0.85` **and** `area < 1000` → `"gable"`; `rh < 0.6` → `"flat"`; otherwise the footprint heuristic's `kind` stays. | 1.5 m is the issue's own threshold; 0.6 m is the cut the prototype already uses (`index.html:511`). A ridge between the two is a shallow roof the measurement cannot tell from a parapet, so the heuristic keeps deciding there (175 buildings unchanged). |
| Rectangularity and size guards | fill ≥ 0.85 as in `roof()`; ring area < 1,000 m² (the pipeline's `big_area`, the "big hall" threshold). | `gable()` draws a rectangular box on `rect` in the village palette. An L-shaped footprint or a 14,000 m² hall with a 3 m rooftop structure would turn into a plaster-and-tile box. With both guards 169 buildings become `"gable"` and 132 become `"flat"`. |
| Eaves `h` | Unchanged. The pitched-roof push-down (`building_heights.py:62-64`) stays keyed on the heuristic's `kind`, before the new rule runs. | Re-running it for the re-classified blocks would lower 36 × 13 m eaves by ~0.4 m while #34 and #17 already say these eaves are too low. Eaves are out of scope here. |
| Ridge direction and rise | As today: ridge along `rect`'s long side, rise = measured `rh`. | On a 36 × 13 m block a 2.9–3.0 m rise gives a 22–23° slope over the 6.95 m half-depth (with the 0.45 m overhang); that is the look of these row houses. The heuristic's `0.4 × min(w, d)` would have been 5.2 m (37°), too steep. |
| Stats | `apply()` counts `ridge_gable` and `ridge_flat` (re-classifications) in its stats; `osm.py build` logs them with the other height stats. | Makes the rebuild log self-checking: the guard expects about 169 / 132. |
| Prototype override `!(dsm && b.rh < 0.6)` | Stays. | It protects a world file built before this change and costs nothing once the data agrees with it. |
| World file | Rebuilt locally with `--dsm-heights cache`, behind a cache guard; never hand-edited. The CI runner has no tiles and skips the rebuild. | Same pattern as `docs/superpowers/plans/2026-10-02-more-landmarks.md` Task 4. |

## Rebuild guard

The rebuilt world may differ from `main`'s only in `params.built` and in buildings' `roof` values; every other key and every other building field is equal. The guard prints the number of `flat → gable` and `gable → flat` flips (expected about 169 and 132) and lists the 16 Bodenackerstrasse ways with their new `roof`.

## Testing

- **Pipeline unit** (`pipeline/tests/test_building_heights.py`): `roof_shape` on the table above — 500 m²/fill 0.89/`rh` 2.9 → gable; 208 m²/`rh` 0.1 → flat; L-shape (fill 0.7) stays flat; 14,689 m² hall stays flat; `rh` 1.0 keeps `"gable"` and keeps `"flat"`. With the synthetic tiles: a `"flat"`-tagged footprint over the gable surface becomes `"gable"`, a `"gable"`-tagged footprint over the flat roof becomes `"flat"`, and `stats` count both.
- **Golden** (`pipeline/tests/test_golden.py`, `world_dsm`, skips without tiles): 8a–8f (`171822908`) `"flat"`, 20a–20f (`171822934`) `"gable"`, 16a–16c (`171822799`) `"flat"`, and the whole ground-truth list.
- **Playtest** (`test-todo.md`): drive the Bodenackerstrasse; 10, 12, 14, 18, 20, 21 pitched, the rest flat, ridges along the long side, no block looks like a tent.

## Out of scope

- Eaves heights (#34, #17): 4a–4f measures 6.2 m where Street View shows three storeys.
- The facade texture of the same row houses (#45).
- Any change to `osmBuilding()` or `world.js`.

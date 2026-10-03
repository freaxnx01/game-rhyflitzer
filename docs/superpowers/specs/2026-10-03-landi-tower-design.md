# LANDI tower by Bahnhof Sisseln as a landmark — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-03 · Issue #81 · builds on #41, #46

## Goal

The tall LANDI silo tower west of the Bahnhofstrasse, south of the railway by Bahnhof Sisseln, stands in the 3D world at its real height, and the **J** list (#41) offers it as **LANDI-Turm** with its Gemeinde (#46), so the car can jump to it.

## The facts (verified 2026-10-03 against `pipeline/cache/osm/hochrhein.osm.pbf`, swissSURFACE3D / swissALTI3D in `pipeline/cache`, and `data/world_hochrhein.json`; `main` @ `ea601a2`)

The issue places the tower from a Google Maps screenshot that is kept out of the repo (docs/07). The extract and the surface model identify it without that picture:

- **House number 19** near the station is **Sisslerstrasse 19.1 / 19.2 / 19.3, 5074 Eiken** — three `building=commercial` footprints `w197688923`, `w197688924`, `w197688925`, all west of the Bahnhofstrasse (`w285176415`) and south of the railway, opposite the Ackerstrasse (`w1238815832`).
- **The tower is `w197688923` (Sisslerstrasse 19.1).** Measured the `pipeline/building_heights.py` way (swissSURFACE3D roof minus swissALTI3D ground under the centre, ground 305.6 m a.s.l.): the surface over its footprint is **p50 54.4 m, p95 56.0 m, max 57.0 m** above ground. The ≥ 40 m part is a slab of **34.8 × 13.4 m** (hull 447 m²), heading **82.7°** (game angle: 0 = +x east, 90 = +z south), centred at game (1832.8, 617.4); its top is flat at **56 m** (p10 51.7, p50 55.8, p90 56.0, max 57.2). Nothing else within 350 m of the station rises above 23 m. `w197688925` (19.3, a 10 × 10 m square with `roof:shape=pyramidal`) measures 0.3 m: not built when the surface was flown (2020). `w197688924` (19.2) is a 6 m hall with a 22 m part on its west side.
- **OSM footprint of `w197688923`:** 375 m², rotated rectangle **35.4 × 12.6 m**, long edge heading **82.2°**, centroid game **(1832.7, 627.7)** = lon/lat (7.99139, 47.54484). Tags: `building=commercial`, `roof:shape=flat`, `addr:street=Sisslerstrasse`, `addr:housenumber=19.1`, `addr:city=Eiken`, `addr:postcode=5074`. No `name`, no `height`, nothing tagged Landi / silo / tower anywhere near the station (a Nominatim search found nothing either, as the issue says). The tall slab's centre lies 10 m north of the footprint centroid; the footprint's northern half carries it.
- **Gemeinde: Eiken.** Point-in-polygon of the centroid against the OSM `boundary=administrative` + `admin_level=8` relations in the extract (r1684301 Eiken, r1684428 Sisseln): inside Eiken, like Bahnhof Sisseln itself and every building within 350 m of the station. `addr:city=Eiken` agrees. The issue title says "in Sisseln" because the LANDI is the village's shop; the building stands on Eiken ground.
- **World today:** `w197688923` is **not** in `data/world_hochrhein.json` (375 m² < 1,000 m², and the Sisslerstrasse is no main road), so nothing stands there. Only Sisslerstrasse 15 (`197688922`) and 16 (`750692949`) are in the world nearby. Were it kept as a plain building, the generic measurement would give it `h 2.5, rh 56.9` (its 10th percentile sits on a low southern strip): a 2.5 m box. So a generic footprint cannot carry this landmark; it needs the `dsmChimney` / `dsmWaterTower` treatment.

## Starting point in the code

- `pipeline/anchors.json` `landmarks`: an entry resolves to a position from an `osm` ref (area centroid), `game` or `lonlat`; `h`, `kind`, `heading_deg` (→ `rot` radians) and `size` pass through (`pipeline/anchors.py:60-69`). An `osm` area with `addr:housenumber` gives the anchor an `addr` (`:68-69`); the Hallenbad uses this. `exclude_buildings` drops landmark footprints from the generic buildings (`anchors.py:87`, `world_buildings.py:102`), so the model is not drawn twice.
- `prototype/index.html:782-792`: `if (L) { … }` places the landmark models by anchor key: `dsmChimney(x, z, h)` (`:551`), `waterTower(x, z, h)` (`:559`), `hallenbad(x, z, rot, w, d, pool)` (`:549`, size from the anchor). `box(w, h, d, x, y, z, rot, c, role, tile, dark)` (`:436`) builds a rotated box whose `w` runs along heading `rot`; `addOBB(x, z, w, d, rot, h)` (`:480`) makes it solid. The `parts` merge loop is at `:837`; models must be pushed before it.
- `prototype/landmarks.js` `LANDMARK_INFO`: the Eiken block is `DSM-Kamin`, `Bahnhof Sisseln`, `Bahnhof Eiken` (`:19-21`). An entry whose anchor is missing from the loaded world is skipped.
- `prototype/world.js` `addrLabels` (`:125-128`) floats a landmark's `addr` at 9 m over the anchor.
- Tests: `pipeline/tests/test_anchors.py`, `test_golden.py` (needs the extract, skips otherwise); `prototype/tests/landmarks.test.mjs` (24-entry count pinned at 23 today); `prototype/tests/test_jump.py` keys its row counts on the served world (`WORLD46`, `ALL_ROWS`, `SISSELN_ROWS`, `:20-24`) and pins the Eiken chip rows exactly (`:248`); `test_smoke.py:225` shows the solidity pattern (`__mm.sim` drives at a model and must stop).
- The world file can only be rebuilt locally (`pipeline/cache/*`), always with `--dsm-heights cache` (`main`'s world has 1,198 measured heights).

## Decisions

| Topic | Decision | Rationale |
|---|---|---|
| OSM object | `w197688923` (Sisslerstrasse 19.1, Eiken). | The only tall structure near the station; the DSM gives 56 m over its footprint. |
| Anchor | `pipeline/anchors.json` `landmarks.landiTurm = { "osm": "w197688923", "h": 56, "kind": "silo", "heading_deg": 82.2, "size": [35.4, 12.6], "src": "…" }`. Position = footprint centroid (1832.7, 627.7); `h` = measured flat top (p50 55.8 / p90 56.0 m); size and heading from the footprint's rotated rectangle. | One source of truth (the OSM footprint), like the Hallenbad after its playtest fix; the anchor keeps the house number `19.1`. The slab centre is 10 m north of the centroid, inside the 35 m footprint, so the model still stands on the real spot. |
| Generic footprint | `w197688923` goes into `exclude_buildings`. | The model replaces it; the generic measurement (`h 2.5`) would be wrong anyway. 19.2 and 19.3 are not touched (not in the world today, not kept). |
| Model | New `siloTower(x, z, rot, w, d, h)` in `prototype/index.html`: one flat-roofed concrete slab `w × d × h` (`box`, role `stone`, light grey `#c9c5bd`, dark base), a small roof-top head house (`9 × (d − 3) × 2.5 m`, centred, `#b5b1a9`), and `addOBB(x, z, w, d, rot, b + h)` so the tower is solid. `window.__mm.counts.landiTurm = 1` when it is built. No sign, no lettering, no brand colour. | Reads as a tower (56 m next to 6 m halls), not as a hall; the head house gives the silhouette its silo-top bump (max 57.2 m). The repo's brand rule (docs/07): generic look, no logo. The name is text in a list, like `DSM-Kamin` and `Aqualon Therme`. |
| Placement | In the `if (L) { … }` landmark block: `if (at('landiTurm')) { const t = at('landiTurm'); siloTower(t.x, t.z, t.rot, t.size[0], t.size[1], t.h || 56); }`, after the `dsmWaterTower` line. | Same pattern as the other anchor-keyed models. |
| J list | `LANDMARK_INFO` gets `{ name: 'LANDI-Turm', gemeinde: 'Eiken', anchor: 'landiTurm' }` after `Bahnhof Eiken` (end of the Eiken block, the #46 rule). 24 entries. | `landi` finds it; `turm` also lists Gallusturm, Diebsturm and DSM-Wasserturm, which is fine. The Gemeinde is Eiken, by boundary, not the issue title's Sisseln. |
| Before the rebuild | The anchor is missing from the served world, so the entry is skipped and no model is drawn: J shows 24 rows (with #46's world), 25 after the rebuild. Browser tests key on `"landiTurm" in anchors.landmarks` (`WORLD81`). | Graceful degradation, no crash, same as #46. |
| House number | The anchor's `addr: "19.1"` floats at 9 m like the Hallenbad's `2`. | Existing behaviour of `addrLabels`; the number is correct and harmless. |
| Rebuild | Guarded local task (caches present, `--dsm-heights cache`, under the 2 GB cap, foreground). The rebuilt world may differ from `main`'s only by `anchors.landmarks.landiTurm` and `params.built`; anything else stops the task. | Same guard as #46 Task 4. `w197688923` is not in `main`'s world, so excluding it changes no building. |

## Testing

- **Pipeline unit** (`pipeline/tests/test_anchors.py`): an `osm` landmark entry passes `size`, `heading_deg` → `rot` and `addr` through; `exclude_ids` includes `197688923` when `anchors.json` is loaded.
- **Golden** (`pipeline/tests/test_golden.py`, skips without the extract): `anchors.landmarks.landiTurm` has `x ≈ 1832.7`, `z ≈ 627.7` (± 2), `h == 56`, `size == [35.4, 12.6]`, `kind == "silo"`, `addr == "19.1"`, and `197688923` is in no `buildings` entry.
- **Node** (`prototype/tests/landmarks.test.mjs`): `LANDMARK_INFO` has 24 entries; the anchor entries include `['LANDI-Turm', 'Eiken', 'landiTurm']`; with a stub anchor it resolves and `landi` finds it; the Eiken chip lists it after `Bahnhof Eiken`.
- **Browser** (`prototype/tests/test_jump.py`): `WORLD81` switch; `ALL_ROWS` and the Eiken chip rows follow it; `landi` + Enter lands within 80 m of the anchor (skipped until the world is rebuilt).
- **Browser** (`prototype/tests/test_landi_tower.py`, new, skipped until the world is rebuilt): `__mm.counts.landiTurm == 1`; `__mm.ground` at the anchor's centre is ≥ 50 m above `__mm.probe(...).terrain` there (the OBB raises the ground); `__mm.sim` driving at the tower from 30 m west at 15 m/s stops before the centre (solid).
- Manual playtest entry in `test-todo.md`.

## Out of scope

- The 22 m part of Sisslerstrasse 19.2 and the other LANDI halls (not in the world; a `keep_buildings` follow-up if wanted).
- Any LANDI lettering, logo or green livery (docs/07: ask first).
- A name label or sign at the tower; the J list entry is the only text.
- Region or boundary changes.

# German side of the Hochrhein terrain from LGL DGM1 (#1161)

## Problem

`data/terrain_hochrhein.mmh` is built from swissALTI3D only. Its header lists `"sources": ["swissALTI3D (c) swisstopo"]`
and every sample without data is filled with the base height (`pipeline/terrain.py:186-190`), which becomes exactly
`0.0` after subtracting `base` (284 m).

Measured on the shipped file (headless, `read_mmh` + `pipeline/ch_outline.geojson`, 2026-11-23):

| | |
|---|---|
| Grid | 1186 x 1010 samples, 8 m, 1,197,860 cells |
| Cells outside the Swiss outline (German side) | 26.8 % (321,356) |
| Of those, flat no-data fill (exactly `0.0`) | **60.1 %** (192,971 cells = 16.1 % of the whole grid) |
| Of those, real heights | 39.9 %, all from swissALTI3D: its 1 km tiles reach into Germany |
| Fill by distance from the border | 0 % within 200 m, 0.2 % at 200-400 m, 41 % at 400-800 m, 96.5 % beyond 800 m |
| Swiss cells with fill | 0 % |

So today **no sample of the German side comes from LGL**. The first ~400 m north of the border (the Rhine and its
German bank, Holzbrücke and Fridolinsbrücke ends) are real swissALTI3D heights; beyond that, Bad Säckingen and the
Hotzenwald slope are flat at Rhine level, and the edge of the last swissALTI3D tile is a cliff down to `0`. The press
mail of 2026-11-15 said the German side's terrain comes from LGL BW; that was not true of the shipped world and becomes
true with this issue. (`presse/index.html` already names LGL; it is not changed here.)

`pipeline/terrain.py` can already read DGM1 (`--dgm-dir`, GeoTIFF/ASC/XYZ, `german_datasets`, `xyz_to_dataset`), but no
tiles were ever added. The German lakes have level `0.0` in `data/world_hochrhein.json` (Bergsee, Dreiweiher,
Gnädig-Frauenweiher, Rothenbächle), because `world_water.level` ignores the no-data fill (`pipeline/world_water.py:15-17`).

## The data (verified 2026-11-23)

- **Product:** LGL Baden-Württemberg **DGM1**, open data, Open GeoData portal `https://opengeodata.lgl-bw.de/`
  (product `dgm1`, config `assets/config/local/odp-products.json`).
- **Download URL:** `https://opengeodata.lgl-bw.de/data/dgm/dgm1_32_<E>_<N>_2_bw.zip`, `<E>`/`<N>` = south-west
  corner in km, **2 x 2 km tiles, E odd, N even** (e.g. `dgm1_32_419_5266_2_bw.zip`). Tiles outside Baden-Württemberg
  answer **HTTP 404**. One request timed out once in testing, so the downloader retries.
- **Content of a zip:** up to four 1 km XYZ files `dgm1_32_<e>_<n>_1_bw_<year>.xyz` (`x y z`, space separated,
  1 m grid, **pixel centres** at `.50`, rows north to south, 29 MB each), a metadata CSV per file, the licence PDF and a
  metadata link. Border files are partial: points outside Baden-Württemberg are simply missing (e.g. 598,331 of
  1,000,000 lines in `421_5266`), and 1 km files lying wholly in Switzerland are left out of the zip.
- **CRS:** ETRS89 / UTM 32N, **EPSG:25832** (CSV: `ETRS89_UTM32`).
- **Heights:** **NHN in DHHN2016** (CSV: `DE_DHHN2016_NH`, quasigeoid `DE_AdV_GCG2016_QGH`), accuracy +/- 0.15 m,
  survey 2021 for the tiles checked.
- **Tiles for the Hochrhein grid** (its LV95 extent transformed to UTM32: E 417,477-427,113, N 5,261,122-5,269,379):
  30 candidates, **12 exist**: `417, 419, 421, 423, 425, 427` x `5266, 5268`. About 10 MB per zip, ~110 MB in all,
  ~1.2 GB unpacked.
- **Licence:** Datenlizenz Deutschland - Namensnennung - Version 2.0 (`dl-de/by-2-0`). Required attribution text,
  from LGL's open data page: **"Datenquelle: LGL, www.lgl-bw.de, dl-de/by-2-0"**. dl-de/by-2-0 asks that changes
  be marked, so the credit says the data was resampled.

## Height reference and the Rhine seam

swissALTI3D is in LN02, DGM1 in NHN (DHHN2016). Measured with three DGM1 tiles (`419/421/423_5266`, sampled every 8 m)
against the shipped swissALTI3D grid in the overlap band, on flat cells (2 x 2 block range <= 0.5 m):

| Distance from the border | Points | DGM1 - swissALTI3D (median) |
|---|---|---|
| 0-100 m (mostly Rhine water) | 19,504 | -0.665 m |
| 100-300 m | 28,185 | -0.302 m |
| 300-1000 m | 30,760 | -0.287 m |
| all flat overlap | 78,449 | -0.318 m (IQR -0.60 .. -0.27) |

So DGM1 reads about **0.3 m lower** than swissALTI3D on dry ground, consistent with the well-known ~27 cm LN02/NHN
difference at Laufenburg (the 2003 Hochrheinbrücke error). Water surfaces differ more because the two flights saw
different water levels.

The seam is **not on the Rhine**: swissALTI3D covers the river and ~200-800 m of the German bank, so the seam lies
inland where the swissALTI3D tiles end. Swiss samples always win (as today, `terrain.py:166-171`), and DGM1 only fills
the no-data cells, shifted by the measured median offset so the step across the seam is the residual (~0.1 m) instead
of 0.3 m.

## Design

### D1. Keep every measured sample, fill only the no-data cells

The shipped file is **not rebuilt from scratch**. A new `--overlay MMH` mode of `terrain.py` reads the shipped `.mmh`,
reprojects the DGM1 tiles onto its exact grid, and writes DGM1 heights only into cells that are exactly `0.0` (the
no-data marker the game and `world_water.py` already use). Every other sample stays **bit-identical**. A full rebuild
would re-download swissALTI3D and pick up newer survey years (`swiss_tiles` keeps the newest per tile), moving Swiss
heights and every Swiss golden for reasons unrelated to this issue.

The normal build (`sample()`, used by a full `terrain.py` run and `region.py`) gets the same merge rule, so a future full
rebuild with `--dgm-dir` gives the same German side.

### D2. Align DGM1 to swissALTI3D by the overlap median

`dgm_shift(swiss_abs, dgm_abs)`: median of `swiss - dgm` over the cells where both have data, rounded to 0.01 m;
`0.0` when there is no overlap. DGM1 fill = `dgm + shift`. The header records it as `"dgmShift"` (expected about
+0.3 m on the Hochrhein). No datum transformation library (REFRAME/LHN95) is used: on an 8 m game grid a constant
offset measured on the data itself is enough, and it also absorbs the difference between the two models.

### D3. Get the tiles automatically

`terrain.py --lgl` downloads the DGM1 tiles for the grid into `cache/lgl_dgm1/` (once, 404 = outside BW, skipped;
3 tries per tile) and unpacks them there; it then behaves like `--dgm-dir cache/lgl_dgm1`. `dgm1_tiles(hdr)` lists the
candidate tile ids for a grid (pure, unit-tested). Downloads are ~110 MB, fine on a CI runner or the agent box.

### D4. Attribution

- `.mmh` header `sources`: `"DGM1 Datenquelle: LGL, www.lgl-bw.de, dl-de/by-2-0 (resampled to 8 m)"` appended after
  swissALTI3D. The start screen already lists the header sources (`index.html:7852`).
- About tab: a new line `aboutLgl` (en/de) with link `lgl` = `https://www.lgl-bw.de/Produkte/Open-Data/`.
- `data/README.md`, `README.md` licence line, `docs/08-pipeline-terrain.md`: the exact LGL text.

### D5. German water levels follow the new terrain

With the German side at real heights, a lake at level `0.0` would make the game carve its bed down to `0 - bedDepth`
(`index.html:2657`, `index.html:1778`): Bergsee would become a ~100 m pit. A retrofit `pipeline/relevel_water.py`
(like `cap_ridges.py`: no OSM extract needed, the rest of the file byte-identical) sets the `level` of every water
entry whose level is exactly `0.0` from the new `.mmh` (`world_water.level` on that entry's rings), and adds the
source `"Water levels (German side): DGM1 Datenquelle: LGL, www.lgl-bw.de, dl-de/by-2-0"`. `osm.py build` adds the
same source when the `.mmh` header lists LGL, so a future full build agrees.

### D6. The horizon backdrop meets the new edge

`data/backdrop_hochrhein.mmh` takes its rim from the play-area `.mmh` (`pipeline/backdrop.py:58-65`), so the north rim
is `0.0` today. It is rebuilt with `python backdrop.py` (Copernicus range reads, ~20 MB) after the terrain.

## Tests and goldens that move

Found by scanning every coordinate pair in `tests/` and `pipeline/tests/` against the fill cells, plus the readers of the
`.mmh`:

- `tests/world.test.mjs` `roadUnderpassConditions_Hochrhein_TwoNoDataSitesAndLohgerbeOnly`: asserts that the bridges
  w25976772 (Wallbacher Straße over Jurastrasse, (-2882.8, -238.0)) and w28810416 (Feldstraße over Basler Strasse,
  (-3530.7, -1955.9)) have **no** terrain data. After this issue both have data.
- `tests/test_road_underpass.py`: `NO_TERRAIN`, `EXPECTED = 12` and `SEATS[25976772] = (0.04, 0.04)` pin the same two
  German sites.
- `tests/test_jump.py::test_bergsee_jump_lands_on_the_lake_road_facing_the_lake` and `tests/landmarks.test.mjs` use
  the Bergsee at (-2349, -2207): the lake moves from level 0 to its real level; the jump must still land on Am Bergsee.
- `tests/backdrop.test.mjs` shipped-backdrop tests and `tests/test_backdrop.py`: re-run after the backdrop rebuild.
- `tests/about.test.mjs` `ABOUT_LINKS` key list: gains `lgl`.
- Not affected: `pipeline/tests/test_golden.py` builds over `CORE_BBOX` and asserts no German heights; Swiss cells are
  bit-identical (D1).

## Acceptance criteria

1. `data/terrain_hochrhein.mmh` has the same grid (`w`, `h`, `step`, `x0`, `z0`, `origin`, `base`) and every sample that
   was not exactly `0.0` is bit-identical.
2. Of the cells outside `pipeline/ch_outline.geojson`, fewer than 1 % are exactly `0.0` (today 60.1 %).
3. The header `sources` lists swissALTI3D and `DGM1 Datenquelle: LGL, www.lgl-bw.de, dl-de/by-2-0 (resampled to 8 m)`,
   and `dgmShift` is between +0.1 and +0.5 m.
4. Seam: along the edge of the old data (cells that were `0.0` next to cells that were not), the median absolute step
   between neighbours is under 0.5 m.
5. `data/world_hochrhein.json`: no water entry on the German side has level exactly `0.0` any more where the new
   terrain has data; the Bergsee entries sit above +50 m (the lake lies at roughly 380 m a.s.l., ~+95 m over base);
   everything else in the file is unchanged.
6. `data/backdrop_hochrhein.mmh` is rebuilt; its rim matches the new play-area heights.
7. The About tab credits LGL (en and de) with a link; `data/README.md`, `README.md` and `docs/08-pipeline-terrain.md`
   carry the LGL attribution text.
8. `terrain.py --lgl` downloads and unpacks the tiles on its own; `dgm1_tiles` and the merge are unit-tested offline.
9. The moved goldens listed above are re-measured and updated, with the measured values in the commit.

## Assumptions

- **A1** [med] Overlay the shipped `.mmh` (fill only exact `0.0` cells) instead of a full rebuild with `--dgm-dir`.
  Rejected: a full rebuild as the issue text says. `swiss_tiles` keeps the newest survey per tile
  (`pipeline/terrain.py:72-80`), so a rebuild can move Swiss heights and every Swiss golden; the overlay gives the same
  German side and keeps Swiss bits fixed. The full-build path gets the same merge rule (D1).
- **A2** [med] Shift DGM1 by the median overlap offset (~+0.3 m), recorded as `dgmShift`. Rejected: no shift (a 0.3 m
  ledge along the seam) and a formal LN02/LHN95-NHN transformation (needs REFRAME, too fine for an 8 m grid).
  Evidence: measured -0.29 .. -0.32 m on flat dry overlap (table above).
- **A3** [med] The two German #1044 road-under-bridge sites (w25976772, w28810416) become eligible under #1044's
  existing rule "real terrain only" (`world.js:221-231`, spec `2026-11-17-road-bridge-underpass-design.md` lines
  47-53, 99-100): each gets a cut or is dropped as capped, whatever the new data gives; the implementer measures and
  updates the goldens. Rejected: hard-excluding them to keep the old result; that rule existed only because there was
  no data.
- **A4** [high] Re-level German water by a retrofit script, not a full `osm.py build`. Rejected: full build (needs the
  OSM extract, drags in every OSM edit since the last build, see `cap_ridges.py:3-5`). Without it Bergsee becomes a
  pit (`index.html:2657`).
- **A5** [high] Rebuild the backdrop in the same change (D6), else a 0 m rim meets a ~100 m slope at the north edge.
- **A6** [med] Add an automatic downloader (`--lgl`). Rejected: keep the manual portal steps of
  `docs/08-pipeline-terrain.md:33-39`; the URL pattern is stable and public, and the implementing agent needs it.
- **A7** [high] Attribution text "Datenquelle: LGL, www.lgl-bw.de, dl-de/by-2-0" (LGL's own wording) replaces the
  older "Datengrundlage: LGL, www.lgl-bw.de (dl-de/by-2-0)" in `terrain.py:25,171` and `README.md:109`.
- **A8** [high] Independent of #1152/#1151; lands in any order. Rebuilt terrain after #1152 gives German roads profiles
  automatically.

## Consequences

- Bad Säckingen and the Hotzenwald slope get real relief (DGM1 samples on today's fill range from about +10 m to over
  +40 m above base in the three tiles checked; the Bergsee lies roughly +95 m over base). Buildings, roads, forests, props and race
  checkpoints on the German side are draped at runtime, so they follow the new ground without a world rebuild.
- `terrainHasData` turns true on the German side, so any #1044-style logic keyed on it now runs there too.
- German roads get #1152's smoothed profiles automatically once both have landed (#1152 A3).
- The 0.3 m shift means German absolute heights in the `.mmh` are in swissALTI3D's frame (LN02), not NHN.
- The `.mmh` file size does not change (same grid).
- `presse/index.html`'s statement "Daten von ... swisstopo und LGL Baden-Württemberg" becomes true for the terrain.

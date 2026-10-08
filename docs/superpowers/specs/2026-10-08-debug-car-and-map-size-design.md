# Debug panel: car dimensions and map size — design

Status: approved in quick `/enrich` (no human gate) 2026-10-08 · Issue #124.

## Goal

The F3 debug panel (#39) gets two lines: the current car's length × width × height in metres, and the map's extent (length × width in km) and area in km². A tester can then compare the car with roads and 2.5 × 5.0 m parking bays in the game itself, not only in tests (#69).

Success: with debug on, the panel shows `size 4.66 × 2.18 × 1.55 m` and, in the world layout, `map 9.44 × 4.39 km · 41.5 km²` (hand layout: `map 6.40 × 3.80 km · 24.3 km²`). The copied text contains both lines.

## Starting point (verified 2026-10-08 on `main` @ `2d6ae2d`)

- `__mm.carSize()` (`prototype/index.html:1278`, added in #69) already measures the body box in world metres, with the car rotation zeroed, mirrors in, nitro flames out, and returns `{ l, w, h }` (x, z, y extents). It is exercised by `prototype/tests/test_vehicles.py:205` (compact: 4.66 × 2.18 × 1.55).
- Debug registry: `debugSection(fn)` where `fn` returns an array of line strings; `debugTick()` runs every 250 ms, joins the lines into `#debug` and `DEBUG.lines` (`index.html:1435-1440`). Two sections exist: position (`:1456`) and building (`:1457`). `copyText(lines)` joins with ` | ` (`prototype/debug.js:43`).
- Pure helpers live in `prototype/debug.js` (no DOM), unit-tested in `prototype/tests/debug.test.mjs`; Playwright tests in `prototype/tests/test_debug.py` (`open_page(p, server, block_world=..., query=...)`).
- The map extent is the terrain grid `TGRID` (`index.html:468`): with a world it is the water-SDF grid, `(w-1)·step` by `(h-1)·step` = 9440 × 4392 m for `data/world_hochrhein.json` (`waterSdf` w 1181, h 550, step 8); without a world the hand layout falls back to 6400 × 3800 m. `TGRID.GW` / `TGRID.GD` hold those two numbers.
- `bbox` in the world file is `[7.905, 47.532, 8.03, 47.572]` (lon/lat, about 9.46 × 4.45 km) — the data request box, slightly larger than the drawn terrain.
- #74 (labels + legend, spec `2026-10-03-debug-legend-design.md`) is **not** on `main`; its `lineLabelKey` maps line prefixes to labels and returns `null` for unknown ones.

## Decisions

| Topic | Decision |
|---|---|
| Where | Two new `debugSection`s in `index.html`, appended after the building section. Pure formatting in `debug.js`: `sizeLine({ l, w, h })` and `mapLines(widthM, depthM)`. |
| Car line | `size <l> × <w> × <h> m`, each value `toFixed(2)`, order length × width × height (the issue's order). Source: `__mm.carSize()`, reused as is — turned into a named `carSize()` function that the hook returns, no behaviour change. |
| Map lines | One line: `map <W> × <D> km · <A> km²`; W, D in km `toFixed(2)`, A in km² `toFixed(1)`, A computed from the metre values (not from the rounded km). W is the east–west extent (`GW`), D the north–south (`GD`). |
| Map extent | `TGRID.GW × TGRID.GD` — the terrain actually drawn. Not the `bbox` data box. |
| Prefixes | `size` and `map` (not `car`, to stay clear of #74's `car` label for the position line). |
| Number format | Language-neutral `.` decimals, like all other panel lines; the copied bug-report text stays identical across EN/DE. |
| Strings | None. The F1 `keyDebug` text is not changed. |
| Test hook | None added: `__mm.debug().lines` already carries both lines. |
| Changelog | One player-facing `Added` entry under `[Unreleased]`, German voice like its neighbours. |

## Acceptance criteria

- With debug on, `__mm.debug().lines` contains a line `size 4.66 × 2.18 × 1.55 m` for the compact (each value within 0.02 of `__mm.carSize()`), and it follows the selected vehicle.
- With debug on in the hand layout the lines contain `map 6.40 × 3.80 km · 24.3 km²`; in the world layout `map 9.44 × 4.39 km · 41.5 km²`.
- `sizeLine` and `mapLines` are pure and unit-tested (rounding, area from metres).
- The copied text (`copyText`) contains both lines; existing debug tests stay green unchanged (`page.inner_text("#debug")` still starts with `x `).
- The car's rotation and visibility are unchanged by the panel updating (measuring restores the rotation).

## Out of scope

- Labels and legend for the lines (#74), locale-specific separators.
- Showing the parking-bay size or a fit verdict.
- Changing `__mm.carSize()`'s measurement.

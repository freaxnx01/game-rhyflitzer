# Keep farm fields off the Crash-Platz (#629) - Design

## Problem

Since #506 (PR#598) two cereal parcels (one `src: lwb`, one `src: osm`) in `data/world_hochrhein.json` overlap the Crash-Platz rectangle `CRASH_YARD` in `crashyard.js` (region `hochrhein`, x 590-700, z 740-784). The yard ground (`yardGround`) lies 0.04 m over the terrain, the field 0.02 m plus `meshLift` (up to ~0.16 m on 48 m triangles), so the field colour shows through the yard. Tester: "Auf dem Crash Platz fliesst plötzlich die Feldfarbe ein."

## Design

Same rule as roads, rail and car parks (`pipeline/world_fields.py` `_cuts`): fields are cut out in the pipeline, never fixed by render order.

- `world_fields.py` gets `CRASH_YARD = (590.0, 740.0, 700.0, 784.0)` (game metres, x0 z0 x1 z1) and `YARD_GAP = 3.0` (m, like `PARKING_GAP`).
- `world_fields.build(..., keep_out=())` takes extra rectangles; `_cuts` adds `shapely.box(*r).buffer(YARD_GAP, join_style="mitre")` for each. The cut then runs through the existing path (difference, seam inset, small-part drop, hole rule), nothing else changes.
- `osm.py build_world` passes `keep_out=(world_fields.CRASH_YARD,)` only when `origin == geo.DEFAULT_ORIGIN` (the Hochrhein frame, the only frame the yard coordinates are valid in). Generated worlds and Ehrendingen pass nothing.
- Drift guard: a pytest reads `crashyard.js`, parses `x0`, `z0`, `length`, `width` of `CRASH_YARD` and asserts they equal the pipeline constant.
- Rebuild `data/world_hochrhein.json` with the documented command (`docs/11-pipeline-osm.md`), keeping `--fields cache/lwb/hochrhein.geojson --dsm-heights cache`.

## Acceptance criteria

1. In the rebuilt world no field polygon (ring minus holes) intersects the yard rectangle expanded by `YARD_GAP - 0.05`.
2. Diffing the old and new world file: every key except `fields` is byte-identical (buildings, roads, props, parking, forests, counts other than `fields`); within `fields`, only the two overlapping parcels changed (cut or split), all others identical; `sources` unchanged.
3. `pipeline` tests pass (new: cut test, no-keep-out unchanged test, drift test, real-world yard check); the existing real-file road-corridor test still passes.
4. Optional: in game, the Crash-Platz shows only the yard ground.

## Assumptions

- **A1** [high] The pipeline duplicates the yard rectangle as a constant instead of parsing JS at build time. Rejected: reading `crashyard.js` in `build_world` (couples the pipeline to a browser module, fragile regex in the build path). A drift test parses the JS in the test suite only. Evidence: yard defined at `crashyard.js:7-14`; pipeline has no JS dependency today.
- **A2** [high] Gap 3 m (`YARD_GAP`). Rejected: 1 m like `FIELD_GAP`: the yard is a drivable play area, cars run to its edge and the 1.5 m seam inset already costs 0.75 m. Evidence: `world_fields.py:13-15` (FIELD_GAP 1, RAIL_GAP 3, PARKING_GAP 3).
- **A3** [med] Only applied for the Hochrhein origin. Rejected: applying to all worlds (wrong coordinates elsewhere). Rejected: a new CLI flag (not needed, one committed world uses it).
- **A4** [high] Rebuild uses `cache/lwb/hochrhein.geojson` fetched fresh by `fields_ch.py fetch` (not committed). Risk: the WFS data may have changed since 2026-10-31, so more than the two parcels could differ; AC 2 detects this and the implementer reports it instead of committing unrelated changes.
- **A5** [med] Only the yard in `hochrhein` is covered. Other yards or future keep-out areas can append to `keep_out`.

## Consequences

- The two cereal parcels lose about 110 x 44 m plus a 3 m border (roughly 0.7 ha); the field edge next to the yard follows the mitred rectangle.
- World file diff is small (two parcels); size change negligible.
- If `CRASH_YARD` in the JS moves, the drift test fails until the pipeline constant and the world file are updated.

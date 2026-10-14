# NaN bounding sphere on generated worlds: a stream with a repeated point (#319)

## Measured cause

Reproduced headless (Playwright Chromium, SwiftShader) on 2026-10-14 against `https://github.freaxnx01.ch/game-rhyflitzer/`, with `three.module.js` routed through a patch that records every geometry whose bounding sphere comes out NaN and the `Mesh` that `Frustum.intersectsObject` was testing at that moment.

| World | Console error | NaN geometry | Stream with a zero-length segment in `world.json` |
|---|---|---|---|
| default (Hochrhein) | none | – | – |
| `49be1b80e5d3` Baden | none | – | none of 7 |
| `9e4b2d15fc39` Brugg | none | – | none of 7 |
| `60b1701e4c52` Ehrendingen | yes | merged `water` mesh, vertices 2436–2451 of 6192 NaN (x, y and z) | `Moosbach`: `[[439.0, -831.4], [439.0, -831.4], [423.8, -841.7], …]` |
| `ae12d4db5b4d` Lenzburg | yes | merged `water` mesh, vertices 3162–3177 of 7839 NaN | unnamed stream: `[[-437.8, 751.0], [-437.8, 751.0], [-437.8, 723.7]]` |

The NaN vertices sit next to valid vertices at (447, 5.5, −824) and (−433, 17.9, 763) — a ribbon's width away from the repeated point. Roads, boundaries and water polygons in all four worlds have no repeated consecutive points.

**Chain:**

1. `pipeline/world_water.py:streams()` cuts each centre line (clip box, area water, road crossings) and then rounds every coordinate to 0.1 m (`world_water.py:97-98`). When a cut lands within 5 cm of an existing vertex, the two points round to the same value. Both repeats are the first point of a part — the cut end.
2. The prototype drapes each stream with `ribbonGeo(st.pts, …, onTerrain = true)` (`prototype/index.html:1357`). `resample` keeps the zero-length step (`index.html:866`, `n = max(1, …)`), and `ribbonGeo`'s `nz` normalises the segment direction by its length without a guard (`index.html:886`): 0/0 → NaN for both edge points, and the NaN spreads into the quad heights via the bulge pass.
3. The stream geometry is merged into the one `water` mesh (`index.html:1716`); three.js computes its bounding sphere lazily on the first frustum test and logs the error. `Frustum.intersectsSphere` compares against `-radius`; every comparison with NaN is false, so the mesh counts as visible and is never culled — which is why the world looks fine. The few NaN triangles themselves are not drawn: that stream lacks its first metres of water.

## Design

Fix it where it starts, and guard the client for worlds that already exist.

- **Pipeline:** `streams()` drops consecutive repeated points after rounding, and skips a part that has fewer than two points left. New worlds no longer carry the repeat.
- **Client:** a pure `dropRepeats(pts)` in `prototype/world.js` returns the polyline without consecutive repeated points. `ribbonGeo` runs its input through it before resampling, so every ribbon (streams, roads, the hand-made Rhine) is safe against a zero-length step. Worlds already built on the host (until they expire), saved in IndexedDB, or exported as zips keep the repeat and need this.
- No change to `offsetPolyline` (already guards `l || 1`), to `strip`, or to the world format.

## Acceptance criteria

1. `world_water.streams()` never returns two equal consecutive points, also when a cut falls within 5 cm of a vertex; a pytest covers it.
2. `dropRepeats` removes consecutive repeats only (an A–B–A polyline is kept), returns a new array, and keeps the first point; node tests cover it.
3. `ribbonGeo` uses `dropRepeats` on its input; a generated world whose stream starts with a repeated point loads without the `Computed radius is NaN` console error (one Playwright test in `prototype/tests/test_world.py`).
4. `CHANGELOG.md` `[Unreleased]` → `Fixed` gets a player-facing entry.

## Out of scope

- Rebuilding the existing worlds on the host: the client guard covers them, and they expire on their own.
- The same 0.1 m rounding in `world_boundaries.py`, `world_rail.py`, `world_forests.py`, `world_parking.py`: none of them showed a repeat in the four worlds, and their consumers were not measured. Noted, not changed.

## Consequences

- Streams with a repeated first point lose that point: the ribbon starts at the same place, one 0-length segment shorter. Nothing visible changes.
- `ribbonGeo` does one extra pass over each polyline at load time; negligible against the resample and the bulge pass.
- The pipeline change only takes effect on `ionos1` after the service image is rebuilt and redeployed.

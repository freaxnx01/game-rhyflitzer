# Feedback 2026-10-08 — Tab focus, Bahnhof Sisseln, trees, steering wheels

status: done

| # | Note (normalized, short EN) | Att. | Topic | Kind | Disposition | Rationale / link | Status |
|---|---|---|---|---|---|---|---|
| 01 | Holding Tab moves the browser focus through the page elements; it should only show the big map | | Full map (Tab, #77) | Improvement (bug) | Issue #129 | Confirmed: the `keydown` handler (`prototype/index.html:1144`) never calls `preventDefault()` for Tab, so the browser's own focus navigation runs while Tab is held. One-line fix, but it changes keyboard behaviour, so it gets an issue | done |
| 02 | Bahnhof Sisseln is misplaced, not beside the tracks | | Stations (#12, `pipeline/anchors.json`) | Improvement (bug) | Issue #130 | Confirmed: anchor `stationSisseln` (1854.2, 685.8) is 90.9 m from the nearest track; `stationStein` is 35.7 m off too. The "Bahnhof Sisseln" jump point (1780, 560) is 22.8 m from the track | done |
| 03 | The car drives through trees | | Trees / collision | Improvement (bug) | Issue #131 | Confirmed: trees (`window.__TREES`, `index.html:1018-1021`, drawn as billboards and instanced cones) never get a collider; `collide()` only knows `OBB_GRID`. Related: #13 (forests from OSM) | done |
| 04 | When steering, the front wheels should visibly turn | | Vehicles (car model, #5) | New feature | Issue #132 | Confirmed: wheels are built once as static groups (`index.html:1106`) and never rotated, neither steered nor spinning | done |

## Raw notes

Improve/Fix:

- Tab Minimap, Holding Tab Key pressed is tabbing through elements but only Minimap in big should be shown [#01]

- Bahnstation Sisseln is misplaced/not beside train tracks [#02]

- Don't let car drive through trees [#03]

- When steering, the front wheels should turn visibly [#04]

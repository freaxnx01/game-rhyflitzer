# Automatic test drives — design (#1248)

Find world defects automatically instead of on the maintainer's test drives. Two stages:

1. **Road scan** (nightly, exact, no tokens): every non-bridge road, every 4 m, centre plus both edges — is the drawn
   grass/field/meadow above the drawn road?
2. **Visual patrol** (on demand): place the car along a named route every ~25 m, screenshot each step with the debug
   panel on, build a video and 4×4 contact sheets, and let a vision subagent list anomalies as a
   `/processing-test-feedback` triage table.

## Stage 1 — road scan

### Why not node, why not Raycaster

- `world.js` holds helpers only. The heights that are actually drawn are assembled in `index.html`'s inline module:
  `meshH` (index.html:1672), the cut/fit patches in `terrainH` (index.html:1709), the road ribbons in `SURF_GRID` /
  `surfH` (index.html:1910, 1928), and the field/meadow polygons, which are triangulated on their own vertices. A node
  replica would mean duplicating ~2000 lines of world build, and it would test the replica, not what is drawn.
- `__mm.grassOverRoad` (index.html:6255) uses `THREE.Raycaster` on merged meshes. three.js has no BVH there, so each
  ray tests every triangle of every role. That is why a 4 m scan of one 0.5×2.6 km corridor did not finish in 9 min.
- Measured on `data/world_hochrhein.json` (2026-11-27): **420.7 km** of non-bridge road (3.5 km bridge, 13,626
  segments) → about **315,000** probes at 4 m × 3. The 10 % sample today does about 4,000.

### Approach: a vertical-ray triangle index

A vertical ray only needs "which triangles contain (x, z) in plan view" — a 2D question. A new pure module
**`groundscan.js`** (no DOM, no three.js, node-testable like `route.js`):

- `triangleIndex(pos, idx, cell = 16)` — from a world-space position array (and an optional index array) builds a
  uniform 2D grid of triangle ids per cell (by the triangle's xz bounding box).
- `topAt(index, x, z)` — highest y among the triangles whose xz projection contains the point (barycentric
  interpolation), or `null`. That is the first hit of a ray from the sky, the same as the Raycaster's `[0]`.
- `roadProbes(roads, step = 4, inset = 0.3)` — for each non-bridge road, points every `step` m along the polyline
  (by arc length, across vertices), at the centre and at both edges `w/2 - inset` from it (the same inset as
  `grassOverRoad`). Each probe carries `{ x, z, n, cls, side }`.
- `scanProbes(probes, roadAt, greenAt, tol = 0.01)` — with two height functions `(x, z) => y | null`, for every probe with both a road and a green hit,
  `d = green - road`; probes with `d > tol` become spots. Returns `{ done, worst, spots }`.
- `clusterSpots(spots, r = 12)` — one defect is a run of neighbouring 4 m probes; merge spots on the same road within
  `r` m into one, keeping the worst `d` and a `count`.
- `diffKnown(spots, known, r = 12)` — splits into `fresh` (no known spot within `r` m) and `gone` (known spots with no
  current spot within `r` m).

A browser hook **`window.__mm.roadScan(step = 4)`** builds one index over the road roles (`road`, `roadOsm`,
`motorway`) and one over the green roles (`grass`, `field`, `meadow`) — the same roles as `grassOverRoad` — from the
CPU `position` (and `index`) attributes that #323 keeps, applying `matrixWorld` when it is not the identity. It returns
`{ ms, probes, done, worst, spots }` with the spots clustered and each spot carrying `E`/`N` (LV95 via
`debug.js debugPosition`, already imported at index.html:1075).

Cost: the index is built once (a few million triangle entries at most); each probe tests the few triangles of one cell.
`grassOverRoad` and its test stay as they are.

### Nightly gate

A new browser test file **`tests/test_road_scan.py`** (OSM world with measured terrain, skipped without data like
`test_smoke.py`) with one module-scoped page:

1. `test_road_scan_matches_the_raycaster` — at the `GRASS_SPOTS` of `grassOverRoad` plus a handful of probes, the
   index heights (a second hook, `__mm.indexTop(roles, points)`) equal the highest `__mm.rayHits` of the same roles to 1 mm. This proves the index sees what the Raycaster sees.
2. `test_no_new_grass_over_road_spots` — runs `roadScan(4)`; asserts `done >= 0.8 * probes`, `ms < 120000`, and that
   `diffKnown(spots, known).fresh` is empty. `known` is the committed **`tests/road_scan_known.json`**. The failure
   message lists each fresh spot on one line — `x/z`, LV95, road name and class, side, `d` — sorted by `d`, at most
   30 lines (nightly_report.py keeps 40). `gone` spots are printed, not failed.

The nightly full run (`.github/workflows/tests.yml`, cron 02:30, GPU runners) picks the file up without workflow
changes, and `tests/nightly_report.py` files one issue for the red test with that message. A PR whose selection
includes the file is gated the same way.

The known list is seeded from the first full run on the GPU browser: every spot found then goes in with
`"issue": null` and the PR lists them, so the nightly starts green and reports only new spots.

## Stage 2 — visual patrol

### Capture: `scripts/patrol.py`

Python Playwright like `scripts/campath_video.py` (reuses `shots.serve`, `shots.READY`/`LOADED`,
`gpu_browser.resolve_endpoint`, `hermetic_api.route_gallery`):

```
python scripts/patrol.py --route sisseln-eiken --out <dir> [--step 25] [--size 1280x720]
```

- Routes live in **`scripts/patrol_routes.json`**: `{ "<id>": { "from": "<jump entry name>", "to": "<jump entry name>" } }`.
  Start with `sisseln-eiken`: from `Bahnhof Sisseln` to `Bahnhof Eiken` (landmarks.js:38-39).
- A new one-line hook **`window.__mm.dest(name)`** returns the destination entry `{ n, x, z, ... }` (from
  `destEntries()`, index.html:8204) or `null`.
- Flow: open `index.html?debug=1`, start cruise, wait for the measured terrain, `__mm.place(from.x, from.z)`,
  `__mm.naviStart(to.n)`, read the route polyline through a new hook **`window.__mm.naviRoute()`** (returns
  `NAVIS.route.pts`, the polyline `__mm.naviWalk` already walks at index.html:6087, or `null`), then
  `__mm.stepped(true)`. The Navi stays on during the patrol (its panel is part of what is reviewed).
- For each station every `--step` m along the polyline (pure `stations(pts, step)`): heading from the tangent
  (`th = atan2(dz, dx)`, route.js convention), `__mm.place(x, z, th)`, a few `__mm.tick(1/30)` so the chase camera
  settles, `page.screenshot()` (the whole page, so the DOM debug panel with x/z/LV95 is in the picture), and
  `__mm.debug().pos` into the manifest.
- Outputs in `--out`: `frames/f-0001.png …`, `manifest.json` (`[{ i, x, z, E, N, th, s }]`), `patrol.mp4` (ffmpeg,
  2 fps, H.264), and `sheet-01.jpg …` via
  `ffmpeg -v error -y -i patrol.mp4 -vf "fps=2,scale=800:-1,tile=4x4" sheet-%02d.jpg` — the user's idiom with the frame
  rate of the video, so sheet `k` tile `t` (row-major, 1-based) is frame `(k-1)*16 + t`. A pure
  `frame_of(sheet, tile)` exposes that mapping; `review.md` (below) is written next to the sheets.
- No network spend, no tokens. Not wired into CI.

### Review: `.claude/commands/patrol.md`

A project slash command `/patrol <route> [--fable]`:

1. Runs `scripts/patrol.py` in the foreground into its own `mktemp -d`.
2. Dispatches **one** subagent (Sonnet by default, Fable with `--fable`; never Opus) with the prompt in the generated
   `review.md`: look at every contact sheet, open the full frame for anything suspicious, and list anomalies — grass or
   field on the road, stray or coloured triangles, floating or sunken objects, holes, z-fighting, missing textures —
   with the frame's x/z/LV95 from `manifest.json`.
3. The subagent writes `findings.md` in that directory as a triage table in the `/processing-test-feedback` format,
   `| # | Note (normalized, short EN) | Att. | Topic | Kind | Disposition | Rationale / link |`, one row per anomaly,
   `Att.` naming the frame file, the Disposition a proposal only. It files nothing.
4. The command prints the table and the directory and tells the user to run `/processing-test-feedback` on it. Filing
   stays with that skill and its approval gate.

Fixes of found geometry bugs go to Opus/Sonnet sessions; the patrol never fixes anything itself.

## Acceptance criteria

- `groundscan.js` exists, pure, with node tests for every exported function.
- `__mm.roadScan(4)` scans the whole OSM map and returns within 120 s on the GPU browser.
- Its heights equal the Raycaster's to 1 mm at the test points.
- `tests/test_road_scan.py` fails, listing x/z, LV95, road, class, side and height difference, when a spot not in
  `tests/road_scan_known.json` appears; it passes on today's world with the seeded list.
- The nightly run picks the test up without workflow changes.
- `scripts/patrol.py --route sisseln-eiken` writes frames, `manifest.json`, `patrol.mp4`, contact sheets and `review.md`.
- `/patrol` produces a `findings.md` triage table in the `/processing-test-feedback` format and files nothing.
- Nothing in Stage 2 runs in CI.

## Out of scope

- Other defect kinds in Stage 1 (floating objects, stray triangles): Stage 2 covers them visually first.
- Fixing any spot the scan finds (each becomes its own issue).
- Replacing `grassOverRoad` or its test.

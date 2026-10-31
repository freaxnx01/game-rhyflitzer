# Viewpoint hunt: find panorama spots, photograph them for points (#508) - Design

**Issue:** #508. **Builds on #551 (Cruise mode)**, which is enriched but not yet merged: this design assumes the #551 plan
(`docs/superpowers/plans/2026-10-31-cruise-mode.md`) is implemented, i.e. `MODES = ['cruise', 'trial', 'blitz', 'hunt']`,
`startModeFrom`, `hasCheckpoints`, `START_MODE`, `#cruisebtn`, `pauseButtonsFor` exist.
**Gallery:** the curated GitHub gallery is #556. Here only the **in-game album** (maintainer comment on #508).
**Umami (#538):** generic over `MODES`, so the new mode id `view` is counted with no change there.

## Goal

A fifth mode **Viewpoints** (de **Aussichtspunkte**), mode id `view`: a small hand-picked set of panorama spots. Follow the
arrow, stand at the spot, face the sight and press **X**. A photo that counts scores 100 points plus up to 50 for aim.
When every viewpoint is photographed the run ends with a result screen (points and time) and the photo album.

## Today (evidence)

- `photo.js:14` `canPhoto(overlayHidden)`; `index.html:3271` X sets `photoPending`; `capturePhoto`/`savePhoto`
  (`index.html:4674-4692`) download a PNG and toast `photoSaved`. The canvas is only readable in the task that rendered it
  (`index.html:4670`), so anything that reads pixels must run inside `capturePhoto`.
- X passes on foot (`foot.js:88` has no `KeyX`), is blocked in the loco (`train.js:199`), and in the pause menu takes a
  photo of the frozen scene (`pause.js:34`). No new key is needed.
- The surprise hunt (`index.html:4187-4199`, `presents.js`) is the template: `HUNT_RUN`, `stepHunt` sets `R.target`,
  pips/labels in `renderModeLine`/`updatePips`, the minimap branch in `drawMap` (`index.html:4602`), `endHunt` +
  delayed `showHuntResult`, test hooks `__mm.hunt`/`huntSetEndIn`. `nearestPresent(spots, found, x, z)` (`presents.js:103`)
  is generic over `{x, z}` spots and is reused.
- Coordinates: world metres, x east, z south, origin LV95 2639781/1266787 (`data/world_hochrhein.json` `origin`). The
  issue's Rhine car park `x -1515.1 z 870.4` = LV95 2638266/1265917 checks out against that origin.
- Landmark anchors (`world_hochrhein.json` `anchors.landmarks`, read as `L.anchors.landmarks`, `index.html:2137`):
  `plattform` (304.75, 427.08), `dsmChimney` (1065.2, 345.1, 140 m), `fridolinsbruecke` (-1399.9, 480.7),
  `holzbruecke` (-1182.4, -83.4), `muenster` (-1331.0, -172.7); race finish Münsterplatz (-1290.3, -91.4).
- The Plattform deck is `PLATTFORM.deck.y = 5.735` m above the base (`plattform.js:20`), reached on foot via the stair (#413).
- Hand layout (world JSON missing, as in `tests/test_hunt.py` and `tests/test_carselect.py`) has no `L`, so no anchors.

## Design

### Viewpoints (pure, new `viewpoints.js`)

`VIEWPOINT_DEFS.hochrhein`: four entries. A spot is a landmark key or fixed `{x, z}`; the subject is what the photo
must face. Names are proper names (never translated, `strings.js:2-3`).

| id | name | stand at | r (m) | extra | subject |
|---|---|---|---|---|---|
| `rheinblick` | Rheinblick Stein | {x -1515.1, z 870.4} (issue) | 25 | | `fridolinsbruecke` (Fridolinsbrücke) |
| `plattform` | Plattform Sisslerfeld | `plattform` | 6 | at least 5 m above ground (the deck) | `dsmChimney` (DSM-Kamin) |
| `fridolinsbruecke` | Fridolinsbrücke | `fridolinsbruecke` | 40 | | `holzbruecke` (Holzbrücke) |
| `muensterplatz` | Münsterplatz | {x -1290.3, z -91.4} | 30 | | `muenster` (Fridolinsmünster) |

- `resolveViewpoints(defs, landmarks, groundAt)` → `[{ id, n, subjectN, x, z, r, minY, sx, sz }]`; a def whose landmark is
  missing is dropped. `viewpointsFor(region)` → defs of a built-in region, `[]` for generated worlds and Ehrendingen.
- The game resolves them only when the OSM world is loaded (`L`); hand layout → none.
- `standsAt(vp, pose)`: horizontal distance ≤ `r` and `pose.y ≥ minY`. `standingAt(spots, shot, pose)`: first open spot.
- `aimError(vp, pose)`: degrees between the camera's horizontal direction (`dx, dz`) and the direction to the subject.
- `shotPoints(vp, pose)`: 0 unless standing there and `aimError ≤ VIEW.aimDeg` (30); else `100 + round(50 * (1 - err/30))`.
- `maxPoints(spots)` = 150 per spot.
- Pose = player position `P.x/P.y/P.z` (car, walker or heli) + `camera.getWorldDirection()`.

### Mode wiring (`startscreen.js`, `index.html`)

- `MODES = ['cruise', 'trial', 'blitz', 'hunt', 'view']`. `startModeFrom(search, raceless, hasViewpoints = false)` and
  `lastModeFrom(stored, raceless, hasViewpoints = false)`: `view` is only allowed when the world has viewpoints, else
  the #551 fallback (`cruise`) applies. `modeTextKey('view') → 'viewIntro'`. `hasCheckpoints('view')` stays false.
- Button `#viewbtn` after `#huntbtn`, before `#carbtn`; hidden when `VIEWPOINTS` is empty. `MODE_BTN.viewbtn = 'view'`.
  Phone: when `#viewbtn` shows, `#carbtn` spans the full row (hunt + view share a row).
- `startRace('view')`: like the other modes (start Sisseln, `R.state = 'armed'`, armed → racing on first movement),
  checkpoints hidden via #551's `hasCheckpoints`, `VIEW_RUN` reset, toast `viewStart`.
- `stepView` (from `stepRace`): clock; target = nearest open viewpoint (`R.target.view = 'go'`, cpname
  "Viewpoint: <name>"); standing at an open viewpoint → target = its subject (`view = 'aim'`, "Aim at: <subject> · X").
- X in the view mode (`viewShot`, only while armed/racing): not at a viewpoint → note `viewMiss`; at one but aimed off →
  `viewAim(subject)`; else `scoreView(i, pts)`. The photo is still downloaded as before; the note replaces the
  `photoSaved` toast (one `photoNote` read by `savePhoto`), so it is not overwritten a frame later.
- HUD reuses the hunt's: counter label `viewsLabel`, pips = viewpoints. Minimap: open viewpoints as cyan squares
  (target ringed yellow). Mode line `modeView(r)`.
- All shot → `endView` (state finished, `R.last = { mode: 'view', t, pts, max }`), result after `VIEW.endS` (2 s):
  "All viewpoints photographed!", `<pts> / <max> points`, time. `endFoot()` before the result (the Plattform is on foot).
- No best record (points depend on aim only; time is shown, not stored). Pause/restart/main menu as for the hunt.

### Album (phase 2)

- In `capturePhoto`, when the X press scored, a 320 px wide JPEG (quality 0.8) of the same frame is drawn from the WebGL
  canvas and stored per viewpoint in `localStorage['mm.viewAlbum']` = `{ [id]: { img, pts, at } }`; a better-scoring
  photo replaces a worse one (`albumWith`). `parseAlbum` validates on read: known ids only, `img` must match
  `^data:image/jpeg;base64,[A-Za-z0-9+/]+=*$` and be ≤ 60000 chars, finite `pts`/`at`; junk is dropped.
- The view result screen shows `#album`: one figure per viewpoint (photo or an empty frame, name, points), built with
  DOM calls (`img.src`, `textContent`), never innerHTML.

## Out of scope

OSM `tourism=viewpoint` import; curated GitHub gallery (#556); viewpoints in Cruise or Ehrendingen/generated worlds;
an album screen outside the result; 3D markers at the spots; best records.

## Tests

- Unit: new `tests/viewpoints.test.mjs` (resolve, stand, aim, points, album parse/merge, thumb size);
  `tests/startscreen.test.mjs` (MODES with `view`, `startModeFrom`/`lastModeFrom` with and without viewpoints,
  `modeTextKey('view')`); `tests/strings.test.mjs` runs unchanged (key parity).
- Playwright: new `tests/test_viewpoints.py` (button + `?mode=view`, HUD, photo at Rheinblick scores once, result screen,
  album grid, Ehrendingen has no button). Bar lists in `tests/test_start_screen.py` and `tests/test_carselect.py` gain
  `viewbtn`. `tests/test-map.json`: `viewpoints.js` → `test_viewpoints.py`.

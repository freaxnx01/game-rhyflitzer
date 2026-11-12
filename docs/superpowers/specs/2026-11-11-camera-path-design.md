# #900 Camera path with waypoints (design)

Goal: set camera waypoints in the running game, save/load them as JSON, and play them back as one smooth camera move with the HUD hidden, optionally recording with § (#749). The same JSON and the same path module drive the frame-by-frame capture of #875, so **#900 lands first**; #875 consumes `campath.js` and the `__mm.campath` hooks defined here.

## Authoring camera

**Hover on foot** (Z out of the car, F to hover; `foot.js:3` `hover: 11` m/s, N doubles it, Space/Shift up/down, mouse pitch up to `pitchMax: 1.4`, `hoverMaxAgl: 150`). It is already a free first-person camera: no car or heli in the frame, exact eye position (`footCamera`, `index.html:5032`). A waypoint stores **whatever the rendered camera shows** (`camera.position` + its forward vector), so the car chase, the heli chase (`flyCamera`, `index.html:5427`) and the train cab work too; the help text recommends hover.

Rejected: a new debug free-cam mode (new movement code and state for what hover already does); heli only (chase cam keeps the heli in frame).

## Shared format (v1, `campath.js` is the only reader/writer)

```json
{ "format": "rhyflitzer-campath", "version": 1, "region": "hochrhein", "speed": 8, "ease": 1.5,
  "points": [ { "x": -1515.1, "y": 312.4, "z": 870.4, "yaw": 35.0, "pitch": -8.0 },
              { "x": -1480.0, "y": 318.0, "z": 850.0, "yaw": 50.0, "pitch": -12.0, "dt": 6 } ] }
```

- World metres (x east, z south, y up, as `__mm.place`). `yaw`/`pitch` in **degrees**, game heading convention (forward = `(cos yaw, sin yaw)` in x/z, like `P.th`), pitch positive = up.
- `speed` m/s (default 8), `ease` s of speed ramp at start and end (default 1.5).
- `dt` on point *i* (optional) = seconds from point *i-1* to *i*; without it the segment takes `max(len / speed, |Δyaw| / 45°/s, |Δpitch| / 45°/s)` (a turn in place still takes time).
- Limits: 2..200 points, all numbers finite, `speed` 0.5..100, `ease` 0..5, `dt` 0.1..120. Unknown fields ignored. A different `region` loads with a warning toast.

## Evaluation (pure)

- Position: **centripetal Catmull-Rom** (alpha 0.5) through the points, phantom end points mirrored (`2p0 - p1`). Arc-length table per segment (64 samples), so speed is constant inside a segment.
- Orientation: yaw unwrapped to the shortest turn, then yaw/pitch interpolated with uniform Catmull-Rom over the same local parameter; the look point is `pos + dir(yaw, pitch)`.
- Ease: path time `T`, ramp `e = min(ease, T)`, real duration `D = T + e`; `s(t) = t²/2e` for `t < e`, `t - e/2` in the middle, `T - (D-t)²/2e` at the end (C¹, starts and stops at rest).

## In the game

- Keys (all run contexts, overlay hidden, no Ctrl/Alt/Meta, no repeat):
  - **BracketLeft** (`ü` on Swiss, `[` on US): add waypoint (toast "Waypoint 3").
  - **Semicolon** (`ö` / `;`): remove the last waypoint.
  - **Quote** (`ä` / `'`): play / stop. **Shift+Quote**: play and record with § (#749), the recording stops at the end.
- Debug panel (Ctrl+D) gets a "Camera path" block: count, Play, Play + record, Export, Import, Clear (buttons `stopPropagation`, like `debugpawall`, `index.html:6743`).
- Export downloads `rhyflitzer-campath-YYYYMMDD-hhmmss.json` (anchor click like `finishRecord`, `index.html:6873`); Import uses a hidden `<input type=file accept=".json">`.
- Points also persist in `localStorage['mm.campath']` (try/catch), so a reload keeps them.
- Playback: `stepCamera` (`index.html:5436`) gets a first branch: while playing, the camera is set from `sampleTrack(track, t)` and `camTail()` runs; `t += dt` from the loop. The player step in `loop` is skipped (P frozen); world, traffic and water keep running. `body.hud-off` plus `#toast` hidden while playing; the previous HUD state comes back after. Esc pauses as usual (the loop freezes, `SFX.onHold` pauses the recorder).
- Hooks: `__mm.campath.get()`, `.load(obj)` -> `{ ok } | { error }`, `.add()`, `.clear()`, `.play({ record })`, `.stop()`, `.state()` -> `{ playing, t, duration, count }`.

## Key check

Grep over every `*.js` and `index.html` (incl. `pause.js`, `controls.js`, `foot.js:90`, `train.js`, `radio.js`, `ferris.js:64`, `route.js:31`, `settings.js`, `about.js`): `BracketLeft`, `Semicolon`, `Quote` occur nowhere. The `e.key` checks (`z`, `y`, `+`, `=`, `-`, `?` in `index.html:4153`) do not collide: US `[ ; '`, Swiss `ü ö ä`. Not chosen: `Slash` (Swiss `-` = map zoom out, US `?` = help), `Minus`/`Equal` (zoom), `Backquote` (#749), every letter (taken in some context), F-keys (Chromebook).

## Assumptions (quick mode)

- **A1** [med] Hover on foot is the recommended authoring camera, but any camera can be captured. Rejected: a dedicated free-cam (see above).
- **A2** [low] Keys ü/ö/ä (BracketLeft/Semicolon/Quote). Reversible: one constant table in `campath.js` + `controls.js`.
- **A3** [low] Shift+Quote = play with recording. Shift is "down" while hovering, but nobody descends while starting playback.
- **A4** [med] yaw/pitch in degrees in the file (hand-editable), radians inside.
- **A5** [med] Default 8 m/s, 1.5 s ease, 45°/s minimum turn time.
- **A6** [med] Export/Import/Clear only in the debug panel, no keys (too rare to spend keys on).
- **A7** [med] The player is frozen during playback; the camera may fly far from P (labels follow P, tree LOD follows the camera, `index.html:3024`).
- **A8** [high] One path in memory + localStorage, no path library.

## Consequences

- With per-point `dt`, speed changes at that waypoint (constant only within a segment).
- Real-time playback inherits the loop's 0.05 s clamp: on a slow renderer the move slows down and stutters; #875 fixes that with fixed steps.
- Help list and controls table gain three rows; `tests/controls.test.mjs` and the strings test cover them.

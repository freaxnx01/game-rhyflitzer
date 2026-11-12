# #875 Frame-by-frame capture with a fixed time step (design)

Goal: a perfectly smooth 60 fps video of a scripted camera move, even when the renderer draws 1.5-2.3 fps (GPU browser, measured 2026-11-11). Complements #749 (real-time, with sound).

**Depends on #900, which lands first.** The camera move is the #900 camera path: the same JSON file (`rhyflitzer-campath` v1) and the same evaluation (`campath.js`, played through `__mm.campath`). This issue adds no second path format and no second spline: Python never evaluates the path, the game does.

## Design

- **Hook name `__mm.tick(dt, opts)`**, not `__mm.step`: `__mm.step` already exists (car-only sim from where the car is, `index.html:5289`, #101) and tests use it.
- **Loop split:** the body of `loop` (`index.html:6959-6960`, from `const t0` to `drawMirror(false)`) moves into `function frame(dt)`; `loop` calls it. Nothing else changes in real-time mode.
- **Stepped mode:** `__mm.stepped(on)`. While on, `loop` only re-queues itself (no simulation, no render); time advances only through `__mm.tick(dt, { grab })`, which advances the sim clock by `dt`, runs `frame(dt)` once (no 0.05 s clamp; `dt` must be in (0, 0.1]) and, with `grab: 'png'|'jpeg'`, returns `gl.toDataURL(...)` from the same task. The renderer has no `preserveDrawingBuffer` (`index.html:6805`), so the read must happen in the task that drew; `#gl` is canvas-only, the DOM HUD is never in the picture.
- **Sim clock** (`simclock.js`, pure): `{ stepped, ms, offset }`; `simClockNow(c, wall)` = `stepped ? ms : wall + offset`; switching on starts at the current sim time, switching off keeps it continuous through `offset`. `simNow()` in `index.html` replaces `performance.now()` at every **simulation/visual** time read:
  - ferris wheel lights, fireworks, ride (`index.html:3844`, `3850`, `3858`, `3865`, `4078`)
  - blinker/hazard flash (`4565`, `6778`), pulse (`4688`), flames flicker (`5396`), checkpoint opacity (`5522`), presents (`5618`)
  - the Postauto clock (`4445-4447`, `6740`, `6744`): on entering stepped mode a wall-mode `PACLOCK` is converted with `setTime(PACLOCK, postautoClock(), simNow())` so buses move on sim time; leaving restores wall mode if it was wall.
  - UI timing stays on the wall clock: loading logs, toast, debounces (`6581`, `6593`, `6609`), radio panel, debug tick, `REC` clock, stats.
  Everything else already integrates `dt` (water offsets, tree wind, rotor, traffic, trains).
- **Recorder** `scripts/campath_video.py` (Python Playwright, `PW_CDP_ENDPOINT` = GPU browser via `tests/gpu_browser.py`, static server and start as in `scripts/shots.py`):
  1. viewport `--size` (1920×1080), `device_scale_factor=1` (the renderer has no pixel ratio, `index.html:3545`, so the canvas is exactly 1920×1080);
  2. start cruise in the path's `region`, wait for the world (`shots.LOADED`), hide the car (V);
  3. `__mm.campath.load(json)` (error -> exit 2 with the message), `__mm.stepped(true)`, `__mm.campath.play({ record: false })`;
  4. `n = ceil(duration * fps) + 1` frames: `__mm.tick(1/fps, { grab: 'png' })`, base64 PNG bytes piped into `ffmpeg -f image2pipe -framerate 60 -c:v png -i - -c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow -movflags +faststart <out>`;
  5. progress line with ETA every 30 frames; `stepped(false)` at the end.
  Options: `--path` (required), `--out` (default `rhyflitzer-campath-<stamp>.mp4` in the cwd), `--fps 60`, `--crf 18`, `--size 1920x1080` (smaller = faster), `--no-terrain` (like shots.py).
- No sound (music in the YouTube editor). HUD never in the picture (canvas only).

## Assumptions (quick mode)

- **A1** [high] `__mm.tick` instead of the issue's `__mm.step` (name taken, `index.html:5289`).
- **A2** [med] Camera input is only a #900 path file; "drive the car with scripted input" is out of scope (follow-up if needed).
- **A3** [med] PNG frames over CDP (lossless; ~3-5 MB/frame is small next to ~0.5 s render). Rejected: CDP screenshot of the canvas (DOM overlay risk), canvas.toBlob (async, needs a second task, buffer gone).
- **A4** [med] Path time runs through the normal `stepCamera` playback of #900, so the stepped clock drives it automatically; no separate seek API.
- **A5** [low] Car hidden by default (V), the walker is never drawn; the parked car would otherwise sit at the start point.
- **A6** [med] Speed knob = `--size` only. Rejected: a shadows switch (the game has no renderer shadow map to turn off; the car shadow is one mesh, `index.html:3446`).
- **A7** [high] ffmpeg is a host tool (already used for media here); the script checks `shutil.which('ffmpeg')` and exits 2 with a clear message.

## Consequences

- 1 min of video = 3601 frames ≈ 30 min on the GPU browser.
- `Math.random` flicker (flames, sparks) stays random per frame; harmless, not lockstep.
- Real-time play is unchanged; a page left in stepped mode looks frozen (only `__mm.tick` moves it).

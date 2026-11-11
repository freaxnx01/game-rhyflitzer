# #749 In-game video recording with game sound (design)

Goal: record the 3D canvas and the game sound as one video file in the browser, for the YouTube videos (#536, #873). Real-time recording; the fixed-dt frame capture is #875 and out of scope.

## Design

- **Picture:** `canvas.captureStream(60)` on `#gl` (`index.html:437`). The renderer has no `preserveDrawingBuffer` (`index.html:2772`); the stream does not need it. The HUD is DOM and is not in the video.
- **Sound:** the audio graph in `SFX.ctx()` (`index.html:4176`) is `master -> hub -> limit -> destination`; the radio routes into the hub too (`index.html:4215`). Expose `ac.limit = limit` and add `limit.connect(recDest)` with `recDest = ac.createMediaStreamDestination()`, created lazily on first record. Engine, horn, crash and radio/music arrive limited. Music is **in** the recording (the radio feeds the hub, M mutes only the effects bus).
- **Recorder:** `new MediaRecorder(new MediaStream([video, audio]), { mimeType, videoBitsPerSecond, audioBitsPerSecond: 192000 })`, `start(1000)`, chunks collected, on `stop` one Blob is downloaded as `rhyflitzer-YYYYMMDD-hhmmss.mp4|webm` (anchor click as in `savePhoto`, `index.html:~6785`).
- **Pause/hold:** `SFX.onHold(fn)` (`index.html:4216`) fires on pause menu, menu dialogs and hidden tab: `fn(true)` -> `recorder.pause()`, `fn(false)` -> `recorder.resume()`. The timer excludes paused time.
- **UI:** a `#rec` element in `#hud` (red dot + `mm:ss`), shown only while recording or paused. Never drawn into the canvas.
- **Pure logic:** new `record.js` (no DOM): `recordFileName`, `pickRecordFormat`, `recordBitrate`, `recordKeyAction`, `recordNext` (state machine), `recordElapsed`, `formatClock`, `MAX_SECONDS`.
- **Hooks:** `__mm.record(on)` starts/stops, `__mm.recordState()` returns `{ state, mime, bytes, seconds }`.

## Key binding

**Backquote** (the key left of 1; `§` on a Swiss keyboard, `` ` `` on US), no modifiers, no repeat. Same key in the pause menu: it only **stops** a running recording there (like X taking a photo there, `pause.js:43`).

Why not Shift+X (the issue's proposal): Shift is nitro in the car (`controls.js:8`, `nitro` entry) and sink in the heli, and the X handler (`index.html:4130`, `e.code === 'KeyX'`) ignores modifiers, so Shift+X would also take a photo and is pressed while holding nitro. Grep over all `*.js`, `index.html`, `controls.js`, `pause.js`, `radio.js`, `train.js`, `debug.js`: `Backquote`, `IntlBackslash` and `altKey` (besides `radio.js:34`) occur nowhere; every letter is taken in some context (train `Q/E/W/S`, loco `H`, lift digits). F-keys are poor on Chromebooks (top row = browser functions).

## Assumptions (quick mode)

- **A1** [low] Key = Backquote, not Shift+X (see above). Reversible; one constant in `record.js` + `controls.js`.
- **A2** [high] mp4 preferred: list `video/mp4;codecs=avc1,mp4a.40.2`, `video/mp4`, `video/webm;codecs=vp9,opus`, `video/webm;codecs=vp8,opus`, `video/webm`; first `isTypeSupported` wins. Measured on the GPU browser: mp4/avc1 and webm vp9/opus both work.
- **A3** [med] Bitrate by pixel count: 12 Mbit/s up to 2.1 MP (1080p), 20 Mbit/s above; audio 192 kbit/s; 60 fps.
- **A4** [med] No 16:9 crop; the video has the canvas size in device pixels. Changing the canvas size mid-session is not touched (follow-up if black bars bother).
- **A5** [med] Pause/hold calls `recorder.pause()` (issue proposal).
- **A6** [med] Music (radio) is in the recording; no separate track.
- **A7** [med] Hard stop after `MAX_SECONDS = 600`: chunks live in RAM (12 Mbit/s = ~90 MB/min), the toast says why.
- **A8** [high] No MediaRecorder support (`typeof MediaRecorder === 'undefined'` or no format): toast "Recording not supported", no state change.
- **A9** [low] Download only, no upload; no HUD compositing (separate issue).

## Consequences

- Pausing the recorder leaves a hard cut in the video where the game was held.
- An active recording adds encode load (hardware where available); on SwiftShader the video is ~2 fps, that is expected.
- First recording creates the AudioContext (needs the key press as gesture: it is one).
- The help list and touch menu get a new entry (`keyRecord`); `tests/controls.test.mjs` counts must be updated.

## Tests

- `node --test tests/record.test.mjs` for `record.js`, plus `tests/pause.test.mjs` for the new pause action.
- One Playwright file `tests/test_record.py` (foreground): record ~1 s via `__mm.record`, assert a download named `rhyflitzer-\d{8}-\d{6}\.(mp4|webm)` with size > 0 and `recordState().state === 'idle'`.

# Music drops out when a recording starts (#891)

## Problem

Pressing `§` (#749) starts a recording; on Chrome/Edge desktop the music stops for a moment, both live and in the
downloaded MP4. The toast "Aufnahme gestartet" makes no sound (`toast()`, `index.html:5503`). `startRecord`
(`index.html:6842`) does two things at the same moment: `SFX.recordTap()` connects the limiter to a new
`MediaStreamAudioDestinationNode` on the first call (`index.html:4245`), and it creates and starts a
`MediaRecorder` over `canvas.captureStream(60)` plus that audio track.

## Measurements (2026-11-11, before planning)

Probe: an `AudioWorkletNode` on the music's `MediaElementAudioSourceNode` and one on a 440 Hz oscillator. Each
logs wall time, `currentFrame` and RMS for every 128-frame render quantum. Three start/stop rounds per run, so
round 0 is the cold tap and rounds 1 and 2 are warm. Each recording was checked with ffmpeg `silencedetect`
(-50 dB, 10 ms) and with RMS in 20 to 50 ms windows.

| Browser | Format `pickRecordFormat` chose | Music gap in the graph | Gap in the file | Main thread at start |
|---|---|---|---|---|
| Playwright Chromium, SwiftShader, local | `video/mp4` (Opus audio) | none in 3 rounds | none | `startRecord` 14 ms cold, 1 to 3 ms warm |
| GPU browser, HeadlessChrome 153 Linux | `video/mp4` (VP9 + Opus) | none in 3 rounds | none, audio from 0 s | 37 ms cold; long tasks up to 213 ms around the start, music unaffected |

- A cold tap and a warm tap behave the same: connecting `recDest` for the first time does not cause the dropout.
- Main-thread stalls of 100 to 200 ms right after the start do not starve the media element on this platform.
- A simulated 200 ms render-thread stall (a busy loop in an AudioWorklet) did not leave a gap in the recording.
  The graph renders every frame and the recorder takes them continuously. A dropout that **is in the file** is
  therefore a gap in the signal itself, not just an output-device underrun.
- `MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')` is **false** on both Linux browsers and
  **true** on Chrome/Edge for Windows and macOS. The AAC branch of `FORMATS` (`record.js:8`) is the only start path
  the reporter's browser takes that no headless measurement here can take. Chrome encodes AAC through the
  platform encoder (Media Foundation on Windows) in another process. Opus is encoded in the renderer by libopus,
  and that is the path measured here, where nothing dropped out.

**Root cause (by elimination, [med]):** the dropout comes from starting the platform AAC encoder in the
`video/mp4;codecs=avc1,mp4a.40.2` format. The graph change and the main-thread work of `startRecord` are ruled
out. The final proof needs a Windows Chrome/Edge, which the pipeline does not have.

## Design

Prefer **H.264 + Opus in MP4** over H.264 + AAC. `FORMATS` in `record.js` becomes:

```js
export const FORMATS = ['video/mp4;codecs=avc1,opus', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4',
  'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
```

- Chrome/Edge (Windows, macOS, Linux) pick `avc1,opus` (true on the GPU browser, Chrome 153): still an `.mp4` with H.264
  video, which YouTube accepts (#749 A2). The AAC encoder is no longer started.
- A browser without Opus in MP4 (Safari, as far as known) keeps `avc1,mp4a.40.2`, as today.
- Firefox keeps webm.

Nothing else changes: the tap, the recorder options, the state machine and the file name stay as they are.

## Acceptance

- `pickRecordFormat` picks `video/mp4;codecs=avc1,opus` when it is supported, and AAC only when Opus in MP4 is not.
- Unit tests in `tests/record.test.mjs` cover both cases. `tests/test_record.py` still passes.
- On Chrome or Edge for Windows, a person checks that the music keeps playing through `§`, live and in the
  downloaded MP4 (`ffmpeg -i x.mp4 -vn -af silencedetect=n=-50dB:d=0.02 -f null -` reports no silence while
  music plays). Only a person can verify this; the pipeline cannot.

## Out of scope

- Pre-warming the tap at graph creation: measured with no effect.
- `latencyHint: 'playback'` for the AudioContext: it would fight output underruns only, it adds latency to every
  sound effect, and an underrun does not explain the gap in the file.

# #875 Stepped capture Implementation Plan

**Goal:** `__mm.stepped(true)` + `__mm.tick(1/60, { grab: 'png' })` advance the game by exactly one fixed step and return the frame; `scripts/campath_video.py` turns a #900 camera path JSON into a smooth 60 fps H.264 video.
**Prerequisite:** #900 merged (`campath.js`, `__mm.campath`). Do not add a path format or spline here.
**Spec:** `docs/superpowers/specs/2026-11-11-stepped-capture-design.md`. Run only `node --test tests/simclock.test.mjs`, `pytest tests/test_campath_video.py` and `tests/test_stepped.py`, in the foreground.

**Files:** create `simclock.js`, `tests/simclock.test.mjs`, `scripts/campath_video.py`, `tests/test_campath_video.py`, `tests/test_stepped.py`. Modify `index.html`, `CHANGELOG.md`.

## Task 1: simclock.js (pure, TDD)

```js
export function createSimClock()                 // { stepped: false, ms: 0, offset: 0 }
export function simClockNow(c, wall)             // stepped ? c.ms : wall + c.offset
export function simClockSetStepped(c, on, wall)  // new clock; continuous in both directions; same state -> same clock
export function simClockAdvance(c, dt)           // stepped: ms += dt * 1000; real time: unchanged; dt outside (0, 0.1] throws RangeError
```
- [ ] **Step 1: failing tests** `tests/simclock.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimClock, simClockNow, simClockSetStepped, simClockAdvance } from '../simclock.js';

test('simClockNow_RealTime_FollowsWall', () => {
  assert.equal(simClockNow(createSimClock(), 1234), 1234);
});
test('simClockSetStepped_On_FreezesAtCurrentTime', () => {
  const c = simClockSetStepped(createSimClock(), true, 5000);
  assert.equal(simClockNow(c, 9000), 5000);
});
test('simClockAdvance_Stepped_ExactSteps', () => {
  let c = simClockSetStepped(createSimClock(), true, 1000);
  for (let i = 0; i < 60; i++) c = simClockAdvance(c, 1 / 60);
  assert.ok(Math.abs(simClockNow(c, 0) - 2000) < 1e-6);
});
test('simClockSetStepped_Off_ContinuesWithoutJump', () => {
  let c = simClockSetStepped(createSimClock(), true, 1000);
  c = simClockAdvance(c, 0.05);
  c = simClockSetStepped(c, false, 70000);
  assert.ok(Math.abs(simClockNow(c, 70000) - 1050) < 1e-6);
  assert.ok(Math.abs(simClockNow(c, 71000) - 2050) < 1e-6);
});
test('simClockSetStepped_SameState_Unchanged', () => {
  const c = simClockSetStepped(createSimClock(), true, 1000);
  assert.deepEqual(simClockSetStepped(c, true, 9999), c);
});
test('simClockAdvance_BadDt_Throws', () => {
  const c = simClockSetStepped(createSimClock(), true, 0);
  assert.throws(() => simClockAdvance(c, 0), RangeError);
  assert.throws(() => simClockAdvance(c, 0.2), RangeError);
});
test('simClockAdvance_RealTime_NoEffect', () => {
  const c = createSimClock();
  assert.deepEqual(simClockAdvance(c, 1 / 60), c);
});
```
- [ ] **Step 2:** run, see it fail; implement; run, pass. Commit `feat(video): simclock.js fixed-step sim clock (#875)`.

## Task 2: index.html — frame(), simNow(), hooks

- [ ] Import `simclock.js`; `let SIMCLOCK = createSimClock(); const simNow = () => simClockNow(SIMCLOCK, performance.now());`.
- [ ] Replace `performance.now()` with `simNow()` at the sim/visual sites listed in the spec (ferris `3844/3850/3858/3865/4078`, flash `4565/6778`, pulse `4688`, flames `5396`, checkpoint `5522`, presents `5618`, Postauto clock `4445-4447/6740/6744`). Leave the UI-timing sites alone. Line numbers are from `main` at enrich time: re-grep `performance.now()` and decide per site.
- [ ] Move the body of `loop` (from `const t0` to `drawMirror(false)`) into `function frame(dt)`; `loop` keeps its clamp, pause branch and `requestAnimationFrame`. At the top of `loop`: `if (SIMCLOCK.stepped) { last = now; requestAnimationFrame(loop); return; }`.
- [ ] `window.__mm.stepped = (on) => { ... }`: set the clock with `simClockSetStepped(SIMCLOCK, !!on, performance.now())`; on entering with `PACLOCK.mode === 'wall'`, remember it and `PACLOCK = setTime(PACLOCK, postautoClock(), simNow())`; on leaving restore `wallClock()` if it was wall. Returns `{ stepped }`.
- [ ] `window.__mm.tick = (dt, opts = {}) => { if (!SIMCLOCK.stepped) throw new Error('tick needs stepped mode'); SIMCLOCK = simClockAdvance(SIMCLOCK, dt); frame(dt); return opts.grab ? $('gl').toDataURL(opts.grab === 'jpeg' ? 'image/jpeg' : 'image/png', 0.95) : null; }`.
- [ ] Commit.

## Task 3: scripts/campath_video.py

Pure helpers (tested), plus `main()` per the spec (serve/start like `scripts/shots.py`: import `shots` for `serve`, `READY`, `LOADED`; GPU browser via `tests/gpu_browser.py`).
```python
def frame_count(duration: float, fps: int) -> int          # ceil(duration * fps) + 1; duration <= 0 -> ValueError
def ffmpeg_cmd(out: str, fps: int, crf: int) -> list[str]  # image2pipe/png in, libx264 yuv420p, -preset slow, +faststart, -y
def png_bytes(data_url: str) -> bytes                      # 'data:image/png;base64,...' -> bytes; other prefix -> ValueError
def parse_size(text: str) -> tuple[int, int]               # '1920x1080' -> (1920, 1080); bad -> argparse.ArgumentTypeError
def default_out(now) -> str                                # rhyflitzer-campath-YYYYMMDD-hhmmss.mp4
```
- [ ] **Step 1: failing tests** `tests/test_campath_video.py`:
```python
"""#875: the pure parts of scripts/campath_video.py (no browser)."""
import argparse
import base64
import datetime
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
import campath_video as cv  # noqa: E402


def test_frame_count_includes_both_ends():
    assert cv.frame_count(1.0, 60) == 61
    assert cv.frame_count(0.51, 60) == 32
    with pytest.raises(ValueError):
        cv.frame_count(0, 60)


def test_ffmpeg_cmd_pipes_png_to_h264_at_exact_fps():
    cmd = cv.ffmpeg_cmd("out.mp4", 60, 18)
    assert cmd[0] == "ffmpeg" and "-y" in cmd and cmd[-1] == "out.mp4"
    assert cmd[cmd.index("-f") + 1] == "image2pipe"
    assert cmd[cmd.index("-framerate") + 1] == "60"
    assert cmd[cmd.index("-pix_fmt") + 1] == "yuv420p"
    assert cmd[cmd.index("-crf") + 1] == "18"
    assert cmd[cmd.index("-c:v", cmd.index("-i")) + 1] == "libx264"


def test_png_bytes_decodes_and_rejects_other_types():
    raw = b"\x89PNG\r\n\x1a\nxyz"
    assert cv.png_bytes("data:image/png;base64," + base64.b64encode(raw).decode()) == raw
    with pytest.raises(ValueError):
        cv.png_bytes("data:image/jpeg;base64,AAAA")


def test_parse_size():
    assert cv.parse_size("1280x720") == (1280, 720)
    with pytest.raises(argparse.ArgumentTypeError):
        cv.parse_size("big")


def test_default_out_uses_local_stamp():
    assert cv.default_out(datetime.datetime(2026, 11, 1, 7, 5, 3)) == "rhyflitzer-campath-20261101-070503.mp4"
```
- [ ] **Step 2:** run, fail; implement helpers and `main()` (no ffmpeg -> exit 2 with a message; `campath.load` error -> exit 2; ffmpeg non-zero -> exit 1; always `stepped(false)` and close the browser in `finally`). Pass. Commit.

## Task 4: Playwright + changelog

- [ ] `tests/test_stepped.py` (one file, foreground; `server` fixture, start like `tests/test_record.py`): load a 2-point path with `ease: 0`, `speed: 20` (`__mm.campath.load`), `stepped(true)`, `campath.play()`; tick 30 × `1/60`, assert `campath.state().t` ≈ 0.5 (1e-6); grab at tick 30 and tick 60 return different `data:image/png` URLs; wait 1 s real time without ticks and assert `t` is unchanged; `stepped(false)`.
- [ ] CHANGELOG `[Unreleased]` Added, in player voice, by hand (a tool for making videos: "Kamerafahrten lassen sich jetzt Bild für Bild als ruckelfreies 60-fps-Video aufnehmen").
- [ ] Commit + push, then run the Playwright file in the foreground. Manual check (not in CI): `python scripts/campath_video.py --path <a short path>.json --size 1280x720` with `PW_CDP_ENDPOINT` set produces a playable mp4 with `ffprobe` showing 60 fps.

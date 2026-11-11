# #749 Video recording Implementation Plan

**Goal:** Backquote starts/stops an in-game recording of `#gl` plus game sound; download `rhyflitzer-YYYYMMDD-hhmmss.mp4|webm`.
**Spec:** `docs/superpowers/specs/2026-11-11-record-video-design.md`. Buildless: no packages. Run only the touched node tests (record, pause, controls, strings) plus the one Playwright file, in the foreground.

**Files:** create `record.js`, `tests/record.test.mjs`, `tests/test_record.py`. Modify `index.html`, `pause.js`, `controls.js`, `strings.js`, `tests/pause.test.mjs`, `tests/controls.test.mjs`, `CHANGELOG.md` (player-voice entry under `[Unreleased]`, by hand).

## Task 1: record.js (pure, TDD)

**Interfaces** (ES module, no DOM):
```js
export const RECORD_KEY = 'Backquote';
export const MAX_SECONDS = 600;
export const FORMATS = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4',
  'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
export function pickRecordFormat(isSupported)   // first supported -> { mime, ext: 'mp4'|'webm' }, else null
export function recordFileName(date, ext)       // rhyflitzer-YYYYMMDD-hhmmss.<ext>, local clock, zero-padded (as photoFileName)
export function recordBitrate(w, h)             // w*h <= 2_100_000 ? 12_000_000 : 20_000_000
export function recordKeyAction(e)              // {code,repeat,shiftKey,ctrlKey,altKey,metaKey} -> 'toggle' | 'ignore' (held key) | null
export function recordNext(state, event)        // states idle|recording|paused|stopping; events start|pause|resume|stop|stopped|fail
export function recordElapsed(c, now)           // c = { startedAt, pausedAt|null, pausedTotal } in ms -> seconds, excluding pause
export function formatClock(sec)                // 0 -> '0:00', 65 -> '1:05', 3600 -> '60:00'
```
`recordNext`: invalid pairs return the state unchanged; `fail` always -> idle. `recordKeyAction`: `RECORD_KEY` without modifiers; repeat -> `'ignore'`.

- [ ] **Step 1: Write the failing tests** `tests/record.test.mjs` :
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickRecordFormat, recordFileName, recordBitrate, recordKeyAction, recordNext, recordElapsed, formatClock, FORMATS } from '../record.js';

test('pickRecordFormat: mp4 before webm, null when nothing', () => {
  assert.deepEqual(pickRecordFormat(() => true), { mime: FORMATS[0], ext: 'mp4' });
  assert.deepEqual(pickRecordFormat(m => m.startsWith('video/webm')), { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' });
  assert.equal(pickRecordFormat(() => false), null);
});
test('recordFileName: local timestamp, zero-padded, given extension', () => {
  assert.equal(recordFileName(new Date(2026, 9, 9, 7, 5, 3), 'mp4'), 'rhyflitzer-20261009-070503.mp4');
});
test('recordBitrate: 12 Mbit/s up to 1080p, 20 above', () => {
  assert.equal(recordBitrate(1920, 1080), 12_000_000);
  assert.equal(recordBitrate(2560, 1230), 20_000_000);
});
test('recordKeyAction: Backquote only, no modifiers, held key ignored', () => {
  assert.equal(recordKeyAction({ code: 'Backquote' }), 'toggle');
  assert.equal(recordKeyAction({ code: 'Backquote', repeat: true }), 'ignore');
  assert.equal(recordKeyAction({ code: 'Backquote', shiftKey: true }), null);
});
test('recordNext: the state machine, invalid events change nothing', () => {
  assert.equal(recordNext('idle', 'start'), 'recording');
  assert.equal(recordNext('recording', 'pause'), 'paused');
  assert.equal(recordNext('paused', 'resume'), 'recording');
  assert.equal(recordNext('paused', 'stop'), 'stopping');
  assert.equal(recordNext('stopping', 'stopped'), 'idle');
  assert.equal(recordNext('recording', 'fail'), 'idle');
  assert.equal(recordNext('idle', 'stop'), 'idle');
});
test('recordElapsed: paused time does not count', () => {
  assert.equal(recordElapsed({ startedAt: 1000, pausedAt: null, pausedTotal: 2000 }, 8000), 5);
  assert.equal(recordElapsed({ startedAt: 1000, pausedAt: 4000, pausedTotal: 0 }, 9000), 3);
});
test('formatClock: m:ss', () => {
  assert.equal(formatClock(0), '0:00'); assert.equal(formatClock(65), '1:05'); assert.equal(formatClock(3600), '60:00');
});
```
- [ ] **Step 2:** run -> FAIL.
- [ ] **Step 3:** Implement `record.js` to the interfaces above, no hardcoded results.
- [ ] **Step 4:** PASS; commit `feat(record): pure rules (#749)`.

## Task 2: pause.js + controls.js

- [ ] **Step 1: failing tests.** `tests/pause.test.mjs`: paused and not confirm, `Backquote` -> `'record'` (repeat -> `'ignore'`); behind the abandon question -> `'ignore'`. `tests/controls.test.mjs`: `actionFor` of `'car'`, `'foot'`, `'indoors'` with `Backquote` is `'record'`; fix entry counts the new entry breaks.
- [ ] **Step 2:** in `pause.js` `pausedAction` add before `menuAction`: `if (key.code === 'Backquote') return key.repeat ? 'ignore' : 'record';`. In `controls.js` add `menu('record', ['Backquote'], 'keyRecord')` after the `photo` entry in CAR and WALK (keep the `'Backquote'` literal equal to `RECORD_KEY`; `controls.js` does not import record.js, to keep both modules independent).
- [ ] **Step 3:** run the tests -> PASS. Commit.

## Task 3: Strings

- [ ] Add to the `en` and `de` blocks of `strings.js` (next to `photoSaved`, lines ~118 and ~848): `keyRecord` ('record: start · stop a video with sound' / 'Aufnahme: Video mit Ton starten · stoppen'), `recStarted`, `recSaved`, `recFailed`, `recUnsupported`, `recLimit` (10 minutes), each in short en/de wording. Real umlauts (`ä`, not `ae`). Run the strings tests (de/en parity).
- [ ] In the help list (`index.html:~499`) add after the X row: `<kbd data-cmd="Backquote">§</kbd><span data-i18n="keyRecord">...</span>` (use `keycaps.js`'s name for the key if it has one).

## Task 4: Audio tap (index.html, SFX)

- [ ] In `SFX.ctx()` (line ~4176) store the limiter: `ac.limit = limit;`. Add to the SFX object `recordTap() { const a = ctx(); if (!a.recDest) { a.recDest = a.createMediaStreamDestination(); a.limit.connect(a.recDest); } return a.recDest.stream; }`. Master/hub gains stay untouched.

## Task 5: Recorder controller + HUD (index.html)

- [ ] `import { RECORD_KEY, MAX_SECONDS, pickRecordFormat, recordFileName, recordBitrate, recordKeyAction, recordNext, recordElapsed, formatClock } from './record.js';` next to the `photo.js` import (line ~960).
- [ ] Markup: `<div id="rec" hidden><i></i><span>0:00</span></div>` in `#hud`; CSS: top-right, red blinking dot, z-index below dialogs. DOM only, so never in the video.
- [ ] Controller `REC = { state: 'idle', rec: null, chunks: [], bytes: 0, fmt: null, clock: null, timer: 0 }` with functions `startRecord()`, `stopRecord()`, `toggleRecord()`:
  - `startRecord`: guard `REC.state !== 'idle'` and `typeof MediaRecorder === 'undefined'` -> `toast(tr('recUnsupported'))`; `fmt = pickRecordFormat(m => MediaRecorder.isTypeSupported(m))`, null -> same toast. Build the stream `new MediaStream([...canvas.captureStream(60).getVideoTracks(), ...SFX.recordTap().getAudioTracks()])`; `new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: recordBitrate(canvas.width, canvas.height), audioBitsPerSecond: 192000 })`; `ondataavailable` collects chunks and `REC.bytes`; `onstop` -> `finishRecord()`; `onerror` -> `failRecord()`; `rec.start(1000)`; clock `{ startedAt: performance.now(), pausedAt: null, pausedTotal: 0 }`; `REC.state = recordNext(REC.state, 'start')`; show `#rec`, `setInterval` 250 ms updates the label (`formatClock(recordElapsed(..))`) and at `MAX_SECONDS` calls `stopRecord()` + `toast(tr('recLimit'))`; `toast(tr('recStarted'))`.
  - `stopRecord`: only in recording/paused; `REC.state = recordNext(REC.state, 'stop')`; `REC.rec.stop()`.
  - `finishRecord`: `new Blob(REC.chunks, { type: REC.fmt.mime.split(';')[0] })`, download via an anchor like `savePhoto` (`recordFileName(new Date(), REC.fmt.ext)`), stop tracks and timer, hide `#rec`, state `'stopped'`, `toast(tr('recSaved'))`; empty blob -> `failRecord()`.
  - `failRecord`: stop tracks and timer, state `'fail'`, hide `#rec`, `toast(tr('recFailed'))`.
- [ ] Hold: `SFX.onHold(held => { if (held && REC.state === 'recording') { REC.rec.pause(); REC.state = recordNext(REC.state, 'pause'); clock.pausedAt = performance.now(); } else if (!held && REC.state === 'paused') { REC.rec.resume(); clock.pausedTotal += performance.now() - clock.pausedAt; clock.pausedAt = null; REC.state = recordNext(REC.state, 'resume'); } })` (it is already invoked on every hold change, `index.html:4217`).
- [ ] Key: in the main `keydown` handler (line ~4130) directly after `if (radioKey(e)) return;` and before `if (e.repeat) return;` add `const ra = recordKeyAction(e); if (ra) { e.preventDefault(); if (ra === 'toggle') toggleRecord(); return; }`. In `PAUSE_KEYS` (line ~6188) add `record: () => { if (REC.state !== 'idle') stopRecord(); }`. Dialogs that return earlier in the handler keep swallowing the key; that is intended.
- [ ] Hooks next to `window.__mm.photoUrl`: `window.__mm.record = (on) => (on ? startRecord() : stopRecord());` and `window.__mm.recordState = () => ({ state: REC.state, mime: REC.fmt && REC.fmt.mime, bytes: REC.bytes, seconds: REC.clock ? recordElapsed(REC.clock, performance.now()) : 0 });`.

## Task 6: Playwright test (one file) and wrap-up

- [ ] `tests/test_record.py`, modelled on `tests/test_photo.py` (same `start_hand`, `ARGS`, `server` fixture, `accept_downloads`). One test: `page.evaluate("() => __mm.record(true)")`; assert `recordState().state == 'recording'`; `page.wait_for_timeout(1500)`; `with page.expect_download(timeout=60000) as d: page.evaluate("() => __mm.record(false)")`; assert the filename matches `^rhyflitzer-\d{8}-\d{6}\.(mp4|webm)$`, size > 0, state back to `'idle'`. Foreground: `python -m pytest tests/test_record.py -x`. No second file, no full suite.
- [ ] CHANGELOG `[Unreleased]`/Added, German player voice: Die Taste § nimmt das Spielbild mit Ton als Video auf; ein roter Punkt zeigt die Zeit.
- [ ] Node tests green, commit, PR with `Closes #749`.

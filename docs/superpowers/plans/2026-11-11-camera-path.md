# #900 Camera path Implementation Plan

**Goal:** ü adds a camera waypoint, ö removes the last, ä plays the path with the HUD hidden (Shift+ä also records with §); JSON export/import. `campath.js` is the shared path module; #875 builds on it.
**Spec:** `docs/superpowers/specs/2026-11-11-camera-path-design.md`. Run only the touched node tests (campath, controls, strings) plus `tests/test_campath.py`, in the foreground.

**Files:** create `campath.js`, `tests/campath.test.mjs`, `tests/test_campath.py`. Modify `index.html`, `controls.js`, `strings.js`, `tests/controls.test.mjs`, `CHANGELOG.md`.

## Task 1: campath.js (pure, TDD)

**Interfaces** (ES module, no DOM, no three.js):
```js
export const CAMPATH_FORMAT = 'rhyflitzer-campath', CAMPATH_VERSION = 1;
export const CAMPATH_DEFAULTS = { speed: 8, ease: 1.5, turnDegPerS: 45 };
export const CAMPATH_KEYS = { add: 'BracketLeft', undo: 'Semicolon', play: 'Quote' };
export function waypointFrom(pos, dir)        // pos {x,y,z}, dir {x,y,z} -> {x,y,z,yaw,pitch} in degrees, game heading
export function newCamPath(region)            // { format, version, region, speed, ease, points: [] }
export function parseCamPath(input)           // string|object -> { path } | { error: 'json'|'format'|'version'|'points'|'number'|'range' }
export function serializeCamPath(path)        // pretty JSON (2 spaces)
export function camPathFileName(date)         // rhyflitzer-campath-YYYYMMDD-hhmmss.json, local clock
export function easeTime(T, ease, t)          // spec ramp; returns path time in [0, T]; duration = T + min(ease, T)
export function buildTrack(path)              // { duration, T, ease, segs: [{ t0, t1, ... }] } -- t0/t1 = segment bounds in path time
export function sampleTrack(track, t)         // t clamped to [0, duration] -> { x, y, z, yaw, pitch (radians), look: {x,y,z} }
export function camPathKeyAction(e)           // -> 'add'|'undo'|'play'|'playRecord'|'ignore'|null
```
Rules: centripetal Catmull-Rom (alpha 0.5), phantom ends `2p0 - p1`, 64 arc samples/segment, binary search + lerp. Segment duration = point `dt` if set, else `max(len/speed, |Δyaw|/45, |Δpitch|/45)` (degrees), floor 0.1 s; a zero-length segment interpolates by time. Yaw unwrapped to the shortest turn before interpolating. Parse keeps only known fields; an absent `dt` stays absent. `look = pos + unit dir(yaw, pitch)`, with `dir = (cos p·cos y, sin p, cos p·sin y)`. `camPathKeyAction`: Ctrl/Alt/Meta -> null; Shift only allowed on Quote (`'playRecord'`); repeat -> `'ignore'`.

- [ ] **Step 1: Write the failing tests** `tests/campath.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waypointFrom, newCamPath, parseCamPath, serializeCamPath, camPathFileName, easeTime, buildTrack, sampleTrack, camPathKeyAction } from '../campath.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const line = (pts) => ({ ...newCamPath('hochrhein'), points: pts });

test('waypointFrom_ForwardEastLevel_YawZeroPitchZero', () => {
  const w = waypointFrom({ x: 1, y: 2, z: 3 }, { x: 5, y: 0, z: 0 });
  assert.deepEqual([w.x, w.y, w.z], [1, 2, 3]); near(w.yaw, 0); near(w.pitch, 0);
});
test('waypointFrom_SouthAndDown_GameHeadingDegrees', () => {
  const w = waypointFrom({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 1 });
  near(w.yaw, 90); near(w.pitch, -45);
});
test('parseCamPath_RoundTrip_SamePath', () => {
  const p = line([{ x: 0, y: 1, z: 0, yaw: 0, pitch: 0 }, { x: 10, y: 1, z: 0, yaw: 10, pitch: -5, dt: 3 }]);
  assert.deepEqual(parseCamPath(serializeCamPath(p)).path, p);
});
test('parseCamPath_BadInput_NamedError', () => {
  assert.equal(parseCamPath('{').error, 'json');
  assert.equal(parseCamPath({ format: 'x', version: 1, points: [] }).error, 'format');
  assert.equal(parseCamPath({ ...newCamPath('r'), version: 2 }).error, 'version');
  assert.equal(parseCamPath(line([{ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }])).error, 'points');
  assert.equal(parseCamPath(line([{ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, { x: 'a', y: 0, z: 0, yaw: 0, pitch: 0 }])).error, 'number');
  assert.equal(parseCamPath({ ...line([{ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, { x: 1, y: 0, z: 0, yaw: 0, pitch: 0 }]), speed: 500 }).error, 'range');
});
test('camPathFileName_LocalClock_ZeroPadded', () => {
  assert.equal(camPathFileName(new Date(2026, 10, 1, 7, 5, 3)), 'rhyflitzer-campath-20261101-070503.json');
});
test('easeTime_StartsAtRestEndsAtT_ContinuousMiddle', () => {
  near(easeTime(10, 2, 0), 0); near(easeTime(10, 2, 12), 10);
  near(easeTime(10, 2, 2), 1); near(easeTime(10, 2, 6), 5);
  near(easeTime(1, 2, 2), 1);   // ease capped at T: duration 2
});
test('sampleTrack_StraightLine_ConstantSpeedAfterRamp', () => {
  const tr = buildTrack({ ...line([{ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, { x: 80, y: 0, z: 0, yaw: 0, pitch: 0 }]), ease: 1 });
  near(tr.duration, 11, 1e-3);   // 80 m / 8 m/s + 1 s ease
  const a = sampleTrack(tr, 4).x, b = sampleTrack(tr, 5).x, c = sampleTrack(tr, 6).x;
  near(b - a, 8, 0.05); near(c - b, 8, 0.05);
  near(sampleTrack(tr, 0).x, 0); near(sampleTrack(tr, 99).x, 80);
});
test('sampleTrack_PassesThroughEveryWaypoint', () => {
  const pts = [{ x: 0, y: 5, z: 0, yaw: 0, pitch: 0 }, { x: 40, y: 10, z: 30, yaw: 90, pitch: -10 }, { x: 0, y: 5, z: 60, yaw: 180, pitch: 0 }];
  const tr = buildTrack({ ...line(pts), ease: 0 });
  const mid = sampleTrack(tr, tr.segs[0].t1);
  near(mid.x, 40, 1e-3); near(mid.y, 10, 1e-3); near(mid.z, 30, 1e-3); near(mid.yaw, Math.PI / 2, 1e-3);
});
test('sampleTrack_YawWrap_TakesShortTurn', () => {
  const tr = buildTrack({ ...line([{ x: 0, y: 0, z: 0, yaw: 170, pitch: 0 }, { x: 0, y: 0, z: 0, yaw: -170, pitch: 0 }]), ease: 0 });
  near(tr.duration, 20 / 45, 1e-6);   // a turn in place still takes time: 20 deg at 45 deg/s
  const m = sampleTrack(tr, tr.duration / 2);
  near(Math.cos(m.yaw), -1, 1e-3);
});
test('sampleTrack_LookIsOneMetreAlongYawPitch', () => {
  const tr = buildTrack({ ...line([{ x: 0, y: 0, z: 0, yaw: 90, pitch: 0 }, { x: 0, y: 0, z: 10, yaw: 90, pitch: 0, dt: 2 }]), ease: 0 });
  const s = sampleTrack(tr, 1);
  near(s.look.z - s.z, 1, 1e-6); near(s.look.x - s.x, 0, 1e-6);
});
test('camPathKeyAction_Keys_ModifiersAndRepeat', () => {
  assert.equal(camPathKeyAction({ code: 'BracketLeft' }), 'add');
  assert.equal(camPathKeyAction({ code: 'Semicolon' }), 'undo');
  assert.equal(camPathKeyAction({ code: 'Quote' }), 'play');
  assert.equal(camPathKeyAction({ code: 'Quote', shiftKey: true }), 'playRecord');
  assert.equal(camPathKeyAction({ code: 'BracketLeft', shiftKey: true }), null);
  assert.equal(camPathKeyAction({ code: 'Quote', ctrlKey: true }), null);
  assert.equal(camPathKeyAction({ code: 'Quote', repeat: true }), 'ignore');
  assert.equal(camPathKeyAction({ code: 'KeyQ' }), null);
});
```
- [ ] **Step 2:** `node --test tests/campath.test.mjs` fails; implement `campath.js`; it passes. Commit `feat(video): campath.js camera path module (#900)`.

## Task 2: controls + strings

- [ ] Add `entry('camPathAdd', ['BracketLeft'], { label: 'keyCamPathAdd' })`, `entry('camPathUndo', ['Semicolon'], { label: 'keyCamPathUndo' })`, `entry('camPathPlay', ['Quote'], { label: 'keyCamPathPlay' })` (no `touch`) to CAR, WALK, heli and train. Test first in `tests/controls.test.mjs`: `actionFor_CamPathKeys_InEveryRunContext (#900)` for car/foot/indoors/heli/train; `conflicts()` stays empty.
- [ ] Strings en/de: `keyCamPathAdd` ("camera path: add waypoint" / "Kamerafahrt: Wegpunkt setzen"), `keyCamPathUndo`, `keyCamPathPlay`, toasts `camPathPoint`, `camPathRemoved`, `camPathEmpty`, `camPathLoaded`, `camPathBad`, `camPathRegion`, debug labels. Help rows in `index.html` next to `keyRecord` (`index.html:506`): `<kbd data-cmd="BracketLeft">ü</kbd>`, `Semicolon`/`ö`, `Quote`/`ä`.
- [ ] Run controls + strings node tests. Commit.

## Task 3: index.html integration

- [ ] Import from `./campath.js`. State `const CAMPATH = { path: loaded-or-new, play: null }` (`play = { track, t, rec, hud }`); load/save `localStorage['mm.campath']` in try/catch.
- [ ] Keydown (`index.html:4153`): right after the `recordKeyAction` line: `const ca = $('overlay').hidden && !CARSEL.on ? camPathKeyAction(e) : null; if (ca) { e.preventDefault(); runCamPathKey(ca); return; }`.
- [ ] `addWaypoint()`: `camera.getWorldDirection(v)`, push `waypointFrom(camera.position, v)`, save, toast. `undoWaypoint()`. `playCamPath(record)`: under 2 points -> toast `camPathEmpty`; else `play = { track: buildTrack(path), t: 0, rec: record && REC.state === 'idle', hud: body has 'hud-off' }`, add `hud-off` and a `campath-play` class that also hides `#toast`; if `rec` -> `startRecord()`. `stopCamPath()`: restore HUD class, stop the recording it started, `play = null`.
- [ ] `stepCamera` first line: `if (CAMPATH.play) { stepCamPath(dt); camTail(); return; }`; `stepCamPath` advances `t`, sets `camPos`/`camera.position` and `camera.lookAt(look)`, `setCameraNear(CAM_NEAR.out)`, stops after `t >= duration`.
- [ ] `loop`: skip the player step block while `CAMPATH.play` .
- [ ] Debug panel block: count + Play, Play+rec, Export (anchor download of `serializeCamPath`), Import (hidden file input -> `parseCamPath` -> toast), Clear; clicks `stopPropagation()`.
- [ ] `window.__mm.campath = { get, load, add, clear, play, stop, state }` as in the spec. Commit.

## Task 4: Playwright + changelog

- [ ] `tests/test_campath.py` (one file, foreground, `server` fixture and start helper as in `tests/test_record.py`): start the game, `__mm.campath.load()` a 3-point path, `play({record:false})`; wait until `state().t > 0`; assert `document.body` has `hud-off`; wait for `playing === false` (timeout 120 s); assert the HUD class is back to its prior state and `__mm.cam()` is the normal camera again. Second test: `load({format:'x'})` returns `{ error: 'format' }`.
- [ ] CHANGELOG `[Unreleased]` Added, player voice, by hand.
- [ ] Commit + push; then run the Playwright file in the foreground.

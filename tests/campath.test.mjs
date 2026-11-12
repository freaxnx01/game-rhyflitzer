// #900: the camera path -- waypoints, the shared JSON format and the smooth playback. Pure module, so node --test imports it.
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

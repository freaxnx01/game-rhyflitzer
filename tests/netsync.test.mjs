// #835 part a: clock offset, pose track and start column of netsync.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addClockSample, clockOffset, createTrack, pushPose, sampleRemote, gridPose, DELAY, EXTRAP, HIDE } from '../netsync.js';
const pose = (t, x, extra = {}) => ({ id: 1, seq: t, t, x, y: 0, z: 0, rx: 0, ry: 0, rz: 0, vx: 20, vz: 0, steer: 0, flags: 1, ...extra });

test('clockOffset_fiveSamples_median', () => {
  let c = null; assert.equal(clockOffset(c), null);
  for (const [a, b, cc] of [[0, 1000, 20], [100, 1110, 120], [200, 1500, 220], [300, 1310, 320], [400, 1409, 420], [500, 1505, 520]]) c = addClockSample(c, a, b, cc);
  assert.equal(c.length, 5); assert.equal(clockOffset(c), 1000);   // offset = b-(a+c)/2; last five 1000, 1290, 1000, 999, 995 -> median 1000, the 1290 outlier ignored
});

test('sampleRemote_betweenPoses_interpolates', () => {
  const tr = createTrack(); pushPose(tr, pose(1000, 0)); pushPose(tr, pose(1050, 1)); pushPose(tr, pose(1100, 2));
  assert.equal(DELAY, 100); assert.ok(Math.abs(sampleRemote(tr, 1175).x - 1.5) < 1e-9);
});

test('sampleRemote_afterNewest_extrapolatesCapped', () => {
  const tr = createTrack(); pushPose(tr, pose(1000, 0)); pushPose(tr, pose(1050, 1));
  assert.equal(EXTRAP, 250);
  assert.ok(Math.abs(sampleRemote(tr, 1250).x - (1 + 20 * 0.1)) < 1e-9);        // 100 ms past newest at 20 m/s
  assert.ok(Math.abs(sampleRemote(tr, 2000).x - (1 + 20 * 0.25)) < 1e-9);       // held at 250 ms
});

test('sampleRemote_bigGap_snapsNotSlides', () => {
  const tr = createTrack(); pushPose(tr, pose(1000, 0)); pushPose(tr, pose(1050, 400));
  assert.equal(sampleRemote(tr, 1130).x, 400);
});

test('sampleRemote_yaw_shortestPath', () => {
  const tr = createTrack(); pushPose(tr, pose(1000, 0, { ry: 3.1 })); pushPose(tr, pose(1100, 0, { ry: -3.1 }));
  assert.ok(Math.abs(Math.abs(sampleRemote(tr, 1150).ry) - Math.PI) < 0.01);
});

test('sampleRemote_silentOrEmpty_null_andOldOrDuplicateDropped', () => {
  const tr = createTrack(); assert.equal(sampleRemote(tr, 0), null);
  pushPose(tr, pose(1000, 0)); assert.equal(HIDE, 3000); assert.equal(sampleRemote(tr, 4001), null);
  pushPose(tr, pose(5000, 9)); pushPose(tr, pose(5000, 9)); pushPose(tr, pose(3000, 5));
  assert.deepEqual(tr.poses.map((p) => p.t), [5000]);
});

test('gridPose_slots_columnBehindStart', () => {
  assert.deepEqual(gridPose([10, 20, 0], 0), [10, 20, 0]);
  const [x1, z1] = gridPose([10, 20, 0], 1), [x2, z2] = gridPose([10, 20, 0], 2);
  assert.ok(Math.abs(x1 - 2) < 1e-9 && Math.abs(Math.abs(z1 - 20) - 1.5) < 1e-9);
  assert.ok(Math.abs(x2 + 6) < 1e-9 && Math.sign(z2 - 20) === -Math.sign(z1 - 20));
});

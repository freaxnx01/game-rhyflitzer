// #835 part a: clock offset, pose track and start column of netsync.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addClockSample, clockOffset, createTrack, pushPose, sampleRemote, gridPose, fadeAlpha, FADE, tagScale, tagOpacity, remoteLamps, FLAG, DELAY, EXTRAP, HIDE, RTT_MAX, HEAR_NEAR, HEAR_FAR, hearGain, KNOCK_GAP_MS, knockAllowed, PONTOON_GAP_MS, pontoonAllowed } from '../netsync.js';
const pose = (t, x, extra = {}) => ({ id: 1, seq: t, t, x, y: 0, z: 0, rx: 0, ry: 0, rz: 0, vx: 20, vz: 0, steer: 0, flags: 1, ...extra });

test('clockOffset_fiveSamples_median', () => {
  let c = null; assert.equal(clockOffset(c), null);
  for (const [a, b, cc] of [[0, 1000, 20], [100, 1110, 120], [200, 1500, 220], [300, 1310, 320], [400, 1409, 420], [500, 1505, 520]]) c = addClockSample(c, a, b, cc);
  assert.equal(c.length, 5); assert.equal(clockOffset(c), 1000);   // offset = b-(a+c)/2; last five 1000, 1290, 1000, 999, 995 -> median 1000, the 1290 outlier ignored
});

test('addClockSample_lateRoundTrip_droppedOnceAnOffsetExists', () => {
  assert.equal(RTT_MAX, 1000);
  let c = addClockSample(null, 0, 1000, 20);
  c = addClockSample(c, 100, 1110, 120);
  const stalled = addClockSample(c, 200, 9000, 8200);      // the peer stalled ~8 s: round trip 8000 ms
  assert.deepEqual(stalled, c);
  assert.equal(addClockSample(c, 300, 1800, 1300).length, 3);   // exactly RTT_MAX: still a sample
});

test('addClockSample_slowFirstRoundTrip_kept', () => {
  const c = addClockSample(null, 0, 5000, 4000);            // no offset yet: a slow link must still get one
  assert.equal(c.length, 1);
  assert.equal(clockOffset(c), 3000);
});

test('addClockSample_pingsQueuedBehindAStall_offsetUnchanged', () => {
  // #1109: pings every 2 s; while the host is stalled (lift ride, 6-16 s) every pong arrives at 16 s
  let c = null;
  for (const a of [0, 2000, 4000]) c = addClockSample(c, a, 1000 + a + 10, a + 20);   // steady: offset 1000
  for (const a of [6000, 8000, 10000, 12000, 14000]) c = addClockSample(c, a, 17010, 16020);
  assert.equal(clockOffset(c), 1000);
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

test('sampleRemote_velocity_interpolatedAndHeld', () => {
  const tr = createTrack(); pushPose(tr, pose(1000, 0, { vx: 10, vz: 1 })); pushPose(tr, pose(1100, 1, { vx: 20, vz: 2 }));
  assert.ok(Math.abs(sampleRemote(tr, 1150).vx - 15) < 1e-9);             // interpolated (rt 1050, f 0.5)
  assert.ok(Math.abs(sampleRemote(tr, 1150).vz - 1.5) < 1e-9);
  assert.ok(Math.abs(sampleRemote(tr, 1300).vx - 20) < 1e-9);             // past newest: held at the newest's vx
  assert.ok(Math.abs(sampleRemote(tr, 1300).vz - 2) < 1e-9);
  assert.ok(Math.abs(sampleRemote(tr, 1050).vx - 10) < 1e-9);             // before the oldest: the oldest's vx
  assert.ok(Math.abs(sampleRemote(tr, 1050).vz - 1) < 1e-9);
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

test('fadeAlpha_overOneSecond_linearThenZero', () => {
  assert.equal(FADE, 1000);
  assert.equal(fadeAlpha(0), 1); assert.equal(fadeAlpha(500), 0.5); assert.equal(fadeAlpha(1000), 0); assert.equal(fadeAlpha(5000), 0);
  assert.equal(fadeAlpha(-10), 1);
});
test('tagScale_distance_clampedSoTagStaysReadable', () => {
  assert.equal(tagScale(2), tagScale(0));          // never larger than at 3 m
  assert.ok(tagScale(5) < tagScale(10));            // still shrinks right up to a near car, so it does not grow on screen
  assert.ok(tagScale(100) > tagScale(10));          // world size grows with distance (screen size ~constant)
  assert.equal(tagScale(1000), tagScale(400));      // capped far away
});
test('tagOpacity_distance_fadesNearSolidFar', () => {
  assert.equal(tagOpacity(0), tagOpacity(6));        // floor right next to the car
  assert.ok(tagOpacity(6) < 0.5);                    // see-through when close
  assert.ok(tagOpacity(15) > tagOpacity(6) && tagOpacity(15) < tagOpacity(30));
  assert.equal(tagOpacity(30), 1); assert.equal(tagOpacity(500), 1);
});
test('hearGain_distance_fullNearSilentFar', () => {
  assert.equal(hearGain(0), 1); assert.equal(hearGain(HEAR_NEAR), 1);
  assert.equal(hearGain(HEAR_FAR), 0); assert.equal(hearGain(HEAR_FAR + 50), 0);
  assert.equal(hearGain(NaN), 0); assert.equal(hearGain(-5), 1);
  const a = hearGain(40), b = hearGain(80);
  assert.ok(a > b && b > 0 && a < 1);
});
test('FLAG_horn_bit6', () => { assert.equal(FLAG.horn, 64); });
test('remoteLamps_flags_headBrakeBlinkPhase', () => {
  const f = FLAG.visible | FLAG.head | FLAG.brake | FLAG.left;
  assert.deepEqual(remoteLamps(f, true), { head: true, brake: true, left: true, right: false });
  assert.deepEqual(remoteLamps(f, false), { head: true, brake: true, left: false, right: false });   // blink off-phase
  assert.deepEqual(remoteLamps(FLAG.visible, true), { head: false, brake: false, left: false, right: false });
});

test('knockAllowed_firstKnock_allowedAndRecorded', () => {
  const seen = {};
  assert.equal(KNOCK_GAP_MS, 60);
  assert.equal(knockAllowed(seen, 1, 'bin', 1000), true);
});

test('knockAllowed_withinGap_dropped_notRecorded', () => {
  const seen = {};
  knockAllowed(seen, 1, 'bin', 1000);
  assert.equal(knockAllowed(seen, 1, 'bin', 1059), false);
  assert.equal(knockAllowed(seen, 1, 'bin', 1060), true);   // measured from the last accepted one, not the dropped one
});

test('knockAllowed_otherSoundOrSlot_gatedIndependently', () => {
  const seen = {};
  knockAllowed(seen, 1, 'bin', 1000);
  assert.equal(knockAllowed(seen, 1, 'lamp', 1001), true);
  assert.equal(knockAllowed(seen, 2, 'bin', 1001), true);
});

test('knockAllowed_nonFiniteTime_dropped', () => {
  assert.equal(knockAllowed({}, 1, 'bin', NaN), false);
});

test('pontoonAllowed_firstPress_allowedAndRecorded', () => {
  const seen = {};
  assert.equal(PONTOON_GAP_MS, 250);
  assert.equal(pontoonAllowed(seen, 1, 1000), true);
});

test('pontoonAllowed_withinGap_dropped_notRecorded', () => {
  const seen = {};
  pontoonAllowed(seen, 1, 1000);
  assert.equal(pontoonAllowed(seen, 1, 1100), false);
  assert.equal(pontoonAllowed(seen, 1, 1250), true);   // measured from the last accepted one, not the dropped one
});

test('pontoonAllowed_otherSlot_gatedIndependently', () => {
  const seen = {};
  pontoonAllowed(seen, 1, 1000);
  assert.equal(pontoonAllowed(seen, 2, 1001), true);
});

test('pontoonAllowed_nonFiniteTime_dropped', () => {
  assert.equal(pontoonAllowed({}, 1, NaN), false);
});

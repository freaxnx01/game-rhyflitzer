import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vehicleFromQuery, KERB, stepSamples, isKerb, isEdge, launchVy, RAMP_KICK, crossesLip, rampKick } from '../vehicle.js';

test('vehicleFromQuery: known id, unknown id, no parameter', () => {
  const ids = ['compact', 'delorean'];
  assert.equal(vehicleFromQuery('?vehicle=delorean', ids), 'delorean');
  assert.equal(vehicleFromQuery('?debug&vehicle=delorean', ids), 'delorean');
  assert.equal(vehicleFromQuery('?vehicle=tank', ids), null);
  assert.equal(vehicleFromQuery('?debug', ids), null);
  assert.equal(vehicleFromQuery('', ids), null);
  assert.equal(vehicleFromQuery('?vehicle=constructor', ids), null);
});

test('stepSamples_PathOf1m_FivePointsQuarterMetreApartEndsIncluded', () => {
  const s = stepSamples(0, 0, 1, 0);
  assert.equal(s.length, 5);
  assert.deepEqual(s[0], [0, 0]); assert.deepEqual(s[4], [1, 0]);
  assert.ok(Math.abs(s[1][0] - 0.25) < 1e-9);
});

test('stepSamples_ZeroLengthPath_TwoPointsOnTheSpot', () => {
  assert.deepEqual(stepSamples(3, 4, 3, 4), [[3, 4], [3, 4]]);
});

test('isKerb_SprungschanzeGrade_NotAKerb', () => {
  const g = 3.4 / 25.4, run = 1.0, h = [0, 1, 2, 3, 4].map((i) => g * run * i / 4);   // index.html:1651 ramp, 1 m of it
  assert.equal(isKerb(h, run), false);
});

test('isKerb_GeuerenstrasseEdge07mInsideOneFrame_IsKerb', () => {
  // #902 measured: +0.72 m between two frames 0.40 m apart (24 m/s), the step between samples 1 and 2
  assert.equal(isKerb([-0.82, -0.81, -0.10, -0.10], 0.40), true);
});

test('isKerb_SameStepAt100ms_StillAKerb', () => {
  const s = stepSamples(0, 0, 1.7, 0), h = s.map(([x]) => (x > 0.9 ? 0.6 : 0));   // 1.7 m per frame, the step inside one 0.25 m gap
  assert.equal(isKerb(h, 1.7), true);
});

test('isKerb_ZeroRunWithRise_IsKerb', () => {
  assert.equal(isKerb([0, 0.44], 0), true);   // #902: a collider push onto the ribbon edge at ~0 m/s
});

test('isKerb_ZeroRunFlat_NotAKerb', () => {
  assert.equal(isKerb([0, 0], 0), false);
});

test('launchVy_KerbRise_NoLaunch', () => {
  assert.equal(launchVy(0.72, 1 / 60, true), 0);
});

test('launchVy_SlopeRise_SameAsBefore', () => {
  const lift = 0.05, dt = 1 / 60;
  assert.ok(Math.abs(launchVy(lift, dt, false) - lift / dt * KERB.keep) < 1e-9);   // 1.8 m/s
});

test('launchVy_TinyOrNegativeLift_Zero', () => {
  assert.equal(launchVy(0.02, 1 / 60, false), 0);   // 0.72 m/s < min 1
  assert.equal(launchVy(-0.3, 1 / 60, false), 0);
});

test('isEdge_RoadEdge055mAhead_IsEdge', () => {
  // #902 measured: the Geuerenstrasse south edge -- road top, then the yard 0.55 m down within 0.25 m
  assert.equal(isEdge([20.94, 20.94, 20.39, 20.39], 0.39), true);
});

test('isEdge_YardDecliningPastTheEdge_StillAnEdge', () => {
  // the bottom is the ground right after the step, not the lowest point of the look-ahead (a fast car looks further ahead)
  assert.equal(isEdge([20.92, 20.95, 20.36, 20.30, 20.24], 1.0), true);
});

test('isEdge_RampEnd34mDrop_NotAnEdge', () => {
  // the Sprungschanze take-off stands 3.4 m over the terrain beyond: a real jump keeps its launch
  assert.equal(isEdge([23.77, 23.77, 20.42, 20.42], 0.52), false);
});

test('isEdge_SmoothDownslopeAhead_NotAnEdge', () => {
  assert.equal(isEdge([20, 19.95, 19.9, 19.85], 0.4), false);   // a crest's gentle far side, grade 0.125
});

test('isEdge_FlatOrRisingAhead_NotAnEdge', () => {
  assert.equal(isEdge([20, 20, 20], 0.4), false);
  assert.equal(isEdge([20, 20.05, 20.1], 0.4), false);
});

const RAMP = { x0: 397.3, x1: 422.7, z0: 152.4, z1: 188, h: 3.4 };

test('crossesLip_FromRampPastHighEdge_True', () => {
  assert.equal(crossesLip(RAMP, 422.3, 170, 422.8, 170), true);
});

test('crossesLip_StaysOnRamp_False', () => {
  assert.equal(crossesLip(RAMP, 410, 170, 410.5, 170), false);
});

test('crossesLip_AlreadyPastLip_False', () => {
  assert.equal(crossesLip(RAMP, 423, 170, 423.5, 170), false);
});

test('crossesLip_LeavesOverSideEdge_False', () => {
  assert.equal(crossesLip(RAMP, 422.5, 187.9, 422.9, 188.3), false);
});

test('crossesLip_BackwardsOverLowEdge_False', () => {
  assert.equal(crossesLip(RAMP, 397.5, 170, 397.0, 170), false);
});

test('rampKick_RunUpSpeed_ApexAbout2mAboveLip', () => {
  const vy = rampKick(31.3);
  assert.ok(Math.abs(vy - 31.3 * RAMP_KICK) < 1e-9);
  assert.ok(vy * vy / (2 * 22) > 1.8);   // gravity 22 (index.html stepCar)
});

test('rampKick_ReverseOrStill_Zero', () => {
  assert.equal(rampKick(-10), 0);
  assert.equal(rampKick(0), 0);
});

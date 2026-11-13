import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vehicleFromQuery, KERB, stepSamples, isKerb, launchVy } from '../vehicle.js';

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

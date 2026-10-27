// #513: the Ferris wheel of star room 6 -- pure. node --test prototype/tests/ferris.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FERRIS, gondolaAngles, wheelAngle, legSegments } from '../ferris.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''}: ${a} vs ${b}`);

test('FERRIS_IsLifeSize_AHundredMetreWheelOnA59mHub_NoGondolaNearTheFloor', () => {
  assert.equal(FERRIS.key, 'ferris'); near(FERRIS.rim * 2, 100, 1e-9, 'diameter'); near(FERRIS.hub.y, 59, 1e-9);
  const G = FERRIS.gondola, lowest = FERRIS.hub.y - FERRIS.rim - G.drop - G.h / 2;
  assert.ok(lowest >= 5, `the lowest gondola bottom is ${lowest} m over the floor`);
  near(FERRIS.hub.y + FERRIS.rim + G.drop + G.h / 2, FERRIS.h, 1e-9, 'the highest roof is h');
  assert.ok(FERRIS.h < 420, 'inside the helicopter ceiling');
});

test('gondolaAngles_32EvenlySpacedFromZero', () => {
  const a = gondolaAngles(FERRIS); assert.equal(a.length, 32); assert.equal(a[0], 0);
  for (let i = 1; i < a.length; i++) near(a[i] - a[i - 1], 2 * Math.PI / 32, 1e-12, 'step');
});

test('wheelAngle_StartsAtZeroGrowsLinearlyAndWrapsAtATurn', () => {
  assert.equal(wheelAngle(0), 0); near(wheelAngle(10), 0.1, 1e-12, '10 s');
  near(wheelAngle(2 * Math.PI / FERRIS.spin + 5), 5 * FERRIS.spin, 1e-9, 'wraps'); assert.ok(wheelAngle(1e6) < 2 * Math.PI);
});

test('legSegments_FourLegsFromTheFeetUpToTheAxleEnds_TwoFramesEitherSideOfTheWheel', () => {
  const legs = legSegments(FERRIS), F = FERRIS.frame; assert.equal(legs.length, 4);
  for (const l of legs) { assert.equal(l.a[1], 0); near(l.b[1], FERRIS.hub.y, 1e-9); near(l.b[2], 0, 1e-9, 'meet on the axle line'); near(Math.abs(l.a[0]), F.a, 1e-9); near(Math.abs(l.a[2]), F.b, 1e-9); assert.equal(l.r, F.r); }
  assert.deepEqual(new Set(legs.map(l => Math.sign(l.a[0]) + ',' + Math.sign(l.a[2]))).size, 4);
});
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

import { ferrisPlacement } from '../ferris.js';
import { roomLayout, ROOM_Y } from '../rooms.js';

const R6 = roomLayout(6), P = ferrisPlacement({ centre: R6.centre, frame: R6.frame, portal: R6.portal, y: ROOM_Y }, FERRIS);
const toLocal = (R, x, z) => { const dx = x - R.centre[0], dz = z - R.centre[1]; return [dx * R.frame.f[0] + dz * R.frame.f[1], dx * R.frame.v[0] + dz * R.frame.v[1]]; };

test('ferrisPlacement_WheelOnTheRoomCentre_AxleAlongTheRoomFrame', () => {
  assert.deepEqual([P.wheel.x, P.wheel.z], R6.centre); near(P.wheel.th, Math.atan2(R6.frame.f[1], R6.frame.f[0]), 1e-9, 'turned to the room frame');
});

test('ferrisPlacement_FourLowFootCollidersAtTheFrameCorners_SolidToTheHub', () => {
  assert.equal(P.colliders.length, 4);
  for (const c of P.colliders) { assert.equal(c.low, true); assert.equal(c.ferris, 'foot'); near(c.hw, FERRIS.collider.hw, 1e-9); near(c.h, ROOM_Y + FERRIS.hub.y + FERRIS.collider.over, 1e-9); }
  const spots = P.colliders.map(c => toLocal(R6, c.x, c.z).map(Math.round).join(','));
  assert.deepEqual(spots.sort(), ['-8,-30', '-8,30', '8,-30', '8,30']);
});
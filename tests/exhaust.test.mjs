// The blue nitro flames behind the glTF vehicles. Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXHAUST, exhaustSpots } from '../exhaust.js';

const CAR = { min: { x: -2.4, y: 0.1, z: -0.95 }, max: { x: 2.45, y: 1.35, z: 0.95 } };
const TRUCK = { min: { x: -4, y: 0.3, z: -1.25 }, max: { x: 4, y: 3.5, z: 1.25 } };

test('exhaustSpots_TwoPipes_SitBehindTheTailSymmetric', () => {
  const [a, b] = exhaustSpots(CAR, 2);
  assert.ok(a[0] < CAR.min.x, 'the flame starts behind the tail');
  assert.ok(a[0] + EXHAUST.flameLen / 2 >= CAR.min.x, 'it touches the tail, not floating off it');
  assert.equal(a[0], b[0]); assert.equal(a[1], b[1]); assert.equal(a[2], -b[2]);
  assert.ok(a[2] > 0 && a[2] <= EXHAUST.maxZ, a);
});

test('exhaustSpots_OnePipe_IsCentred', () => {
  const spots = exhaustSpots(CAR, 1);
  assert.equal(spots.length, 1);
  assert.equal(spots[0][2], 0);
});

test('exhaustSpots_DefaultsToTwoPipes', () => {
  assert.equal(exhaustSpots(CAR).length, 2);
});

test('exhaustSpots_Height_LowOnTheTail_CappedOnATallTruck', () => {
  const [[, carY]] = exhaustSpots(CAR), [[, truckY]] = exhaustSpots(TRUCK);
  assert.ok(carY > CAR.min.y && carY < (CAR.min.y + CAR.max.y) / 2, carY);
  assert.equal(truckY, TRUCK.min.y + EXHAUST.maxH);
});

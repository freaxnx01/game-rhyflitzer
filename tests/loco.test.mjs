// #462: the steam loco's numbers (an SBB A 3/5-like 4-6-0 with tender); locomesh.js draws from them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCO, wheelTurn, rodOffset } from '../loco.js';
import { TRAIN_CFG } from '../train.js';
const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);

test('LOCO_Size_18_6x3x4_3_AndMatchesTheRide', () => {
  close(LOCO.length, 18.6, 1e-9); close(LOCO.width, 3.0, 1e-9); close(LOCO.height, 4.3, 1e-9);
  close(LOCO.length, TRAIN_CFG.length, 1e-9, 'the ride and the model agree on the footprint');
  close(LOCO.driverR, TRAIN_CFG.wheelR, 1e-9, 'chuffs follow the drawn driving wheels');
});

test('LOCO_Parts_InsideTheEnvelope', () => {
  assert.equal(LOCO.drivers.length, 3); assert.equal(LOCO.bogie.length, 2); assert.equal(LOCO.tenderWheels.length, 3);
  for (const x of [...LOCO.drivers, ...LOCO.bogie, ...LOCO.tenderWheels]) assert.ok(Math.abs(x) < LOCO.length / 2, `wheel at ${x}`);
  close(LOCO.chimney[1], LOCO.height, 1e-9, 'the chimney is the top');
  assert.ok(LOCO.chimney[0] > LOCO.drivers[0], 'the chimney is ahead of the drivers');
  assert.ok(LOCO.cab[0] < LOCO.drivers[2] + 1 && LOCO.cab[0] > LOCO.tenderFront, 'the cab eye sits in the cab');
});

test('wheelTurn_And_rodOffset', () => {
  close(wheelTurn(2 * Math.PI * 0.89, 0.89), 2 * Math.PI, 1e-9);
  const [dx, dy] = rodOffset(Math.PI / 2, 0.35); close(dx, 0, 1e-9); close(dy, 0.35, 1e-9);
});

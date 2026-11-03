// The Rhy Blaze's table entry. Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLAZE } from '../blaze.js';
import { SIREN, hasSiren } from '../siren.js';
import { buildableId, paintOnSelect } from '../gltfvehicle.js';
import { wheelPlan, WHEEL_NODES } from '../hatchback.js';
import { paintable, statBars } from '../carselect.js';
import { checkSound, gearAt } from '../sound.js';
import { checkCrash } from '../impact.js';
import { impactDamage } from '../wreck.js';
import { capsuleOffsets } from '../bus.js';

test('BLAZE_Entry_HasTheShapeCheckVehicleExpects', () => {
  assert.equal(BLAZE.model, 'gltf');
  assert.deepEqual(BLAZE.gltf, { id: 'blaze', url: './assets/blaze.glb', fallback: 'compact' });
  assert.deepEqual(BLAZE.collision, { shape: 'capsule', r: 1.3, hl: 2.6 });
  assert.ok([BLAZE.drive.top, BLAZE.drive.accel, BLAZE.drive.grip, BLAZE.mass, BLAZE.wheelR].every(Number.isFinite));
  assert.doesNotThrow(() => checkSound(BLAZE.sound));
  assert.doesNotThrow(() => checkCrash(BLAZE.sound.crash));
  assert.equal(BLAZE.blinkers.length, 2);
});

test('BLAZE_HasTheSiren', () => {
  assert.equal(hasSiren(BLAZE), true);
  assert.equal(BLAZE.siren, SIREN);
});

test('BLAZE_Capsule_CoversTheBodyFromBumperToTail', () => {
  // tools/prepare-blaze.mjs: the body from x -3.884 to 3.386
  const offsets = capsuleOffsets(BLAZE.collision), r = BLAZE.collision.r;
  assert.ok(Math.max(...offsets) + r >= 3.39 && Math.min(...offsets) - r <= -3.88, JSON.stringify(offsets));
});

test('BLAZE_Wheels_MatchTheModelsWheelNodes', () => {
  // tools/prepare-blaze.mjs: front x 1.892 |z| 1.11, rear x -1.892 |z| 0.989, r 0.478
  assert.deepEqual(BLAZE.wheels, [[1.892, 1.11], [-1.892, 0.989]]);
  assert.equal(BLAZE.wheelR, 0.478);
  assert.equal(wheelPlan(['body', ...WHEEL_NODES]).length, 4);
});

test('BLAZE_Drive_IsAHeavy100KmhTruck', () => {
  assert.equal(Math.round(BLAZE.drive.top * 3.6), 100);
  assert.equal(BLAZE.sound.engine.topKmh, 100);
  assert.ok(impactDamage(1, BLAZE.mass) < impactDamage(1, 3), 'tougher than the Bulldog');
  assert.deepEqual(statBars(BLAZE), { top: 4, accel: 2, handling: 6, mass: 10 });
});

test('BLAZE_Gearbox_HasSixForwardGears', () => {
  assert.equal(gearAt(5, BLAZE.sound.gears), 0);
  assert.equal(gearAt(95, BLAZE.sound.gears), 5);
});

test('BLAZE_Livery_IsFixed_NotPaintable', () => {
  assert.equal(paintable(BLAZE), false);
  assert.equal(paintOnSelect(BLAZE, 'meadow', true), 'meadow', 'a chosen paint stays for the next car');
  assert.equal(buildableId('blaze', BLAZE, 'loading'), 'compact');
  assert.equal(buildableId('blaze', BLAZE, 'ready'), 'blaze');
});

// #521: the Tin Lizzie's table entry. Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_T } from '../modelt.js';
import { buildableId } from '../gltfvehicle.js';
import { paintable, statBars } from '../carselect.js';
import { checkSound, gearAt } from '../sound.js';
import { checkCrash } from '../impact.js';

test('MODEL_T_Entry_HasTheShapeCheckVehicleExpects', () => {
  assert.equal(MODEL_T.model, 'gltf');
  assert.deepEqual(MODEL_T.gltf, { id: 'modelt', url: './assets/modelt.glb', fallback: 'compact' });
  assert.equal(MODEL_T.collision.shape, 'circle');
  assert.ok([MODEL_T.drive.top, MODEL_T.drive.accel, MODEL_T.drive.grip, MODEL_T.mass, MODEL_T.wheelR].every(Number.isFinite));
  assert.doesNotThrow(() => checkSound(MODEL_T.sound));
  assert.doesNotThrow(() => checkCrash(MODEL_T.sound.crash));
  assert.equal(MODEL_T.blinkers.length, 2);
});

test('MODEL_T_Wheels_MatchTheModelsWheelNodes', () => {
  // tools/prepare-modelt.mjs: wheel centres x ±1.27, |z| 0.599, r 0.386
  assert.deepEqual(MODEL_T.wheels.map(([x]) => x), [1.27, -1.27]);
  for (const [, z] of MODEL_T.wheels) assert.ok(Math.abs(z - 0.599) <= 0.01, z);
  assert.equal(MODEL_T.wheelR, 0.386);
});

test('MODEL_T_Drive_IsTheSlowestCarAt72Kmh', () => {
  assert.equal(Math.round(MODEL_T.drive.top * 3.6), 72);
  assert.equal(MODEL_T.sound.engine.topKmh, 72);
  assert.ok(MODEL_T.drive.topNitro > MODEL_T.drive.top && MODEL_T.drive.accelNitro > MODEL_T.drive.accel);
  assert.deepEqual(statBars(MODEL_T), { top: 3, accel: 3, handling: 5, mass: 3 });
});

test('MODEL_T_Gearbox_HasTwoForwardGears', () => {
  assert.equal(gearAt(10, MODEL_T.sound.gears), 0);
  assert.equal(gearAt(60, MODEL_T.sound.gears), 1);
  assert.equal(gearAt(200, MODEL_T.sound.gears), 1);
});

test('MODEL_T_StandsInWithTheCompactUntilLoaded_AndKeepsItsBlackPaint', () => {
  assert.equal(buildableId('modelt', MODEL_T, 'loading'), 'compact');
  assert.equal(buildableId('modelt', MODEL_T, 'ready'), 'modelt');
  assert.equal(paintable(MODEL_T), false);
});

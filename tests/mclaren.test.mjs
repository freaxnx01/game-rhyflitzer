// The Rhy Papaya's table entry. Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MCLAREN } from '../mclaren.js';
import { HYPER } from '../hyper.js';
import { buildableId, paintOnSelect } from '../gltfvehicle.js';
import { paintable, statBars, PAINTS } from '../carselect.js';
import { checkSound, gearAt } from '../sound.js';
import { checkCrash } from '../impact.js';

test('MCLAREN_Entry_HasTheShapeCheckVehicleExpects', () => {
  assert.equal(MCLAREN.model, 'gltf');
  assert.deepEqual(MCLAREN.gltf, { id: 'mclaren', url: './assets/mclaren.glb', fallback: 'compact' });
  assert.equal(MCLAREN.collision.shape, 'circle');
  assert.ok([MCLAREN.drive.top, MCLAREN.drive.accel, MCLAREN.drive.grip, MCLAREN.mass, MCLAREN.wheelR].every(Number.isFinite));
  assert.doesNotThrow(() => checkSound(MCLAREN.sound));
  assert.doesNotThrow(() => checkCrash(MCLAREN.sound.crash));
  assert.equal(MCLAREN.blinkers.length, 2);
});

test('MCLAREN_Wheels_MatchTheModelsWheelNodes', () => {
  // tools/prepare-mclaren.mjs: wheel centres x ±1.335, |z| 0.822 / 0.794, r 0.323 front / 0.33 rear
  assert.deepEqual(MCLAREN.wheels, [[1.335, 0.822], [-1.335, 0.794]]);
  assert.equal(MCLAREN.wheelR, 0.327);
});

test('MCLAREN_Drive_IsA280KmhCornerCarJustUnderTheHyper', () => {
  assert.equal(Math.round(MCLAREN.drive.top * 3.6), 280);
  assert.equal(MCLAREN.sound.engine.topKmh, 280);
  assert.equal(MCLAREN.sound.engine.cylinders, 8);
  assert.ok(MCLAREN.engineAt[0] < 0, 'the engine sits behind the seats');
  assert.ok(MCLAREN.drive.top < HYPER.drive.top && MCLAREN.drive.grip > HYPER.drive.grip && MCLAREN.mass < HYPER.mass, 'slower, grippier and lighter than the Hyper');
  assert.deepEqual(statBars(MCLAREN), { top: 10, accel: 10, handling: 10, mass: 4 });
});

test('MCLAREN_Gearbox_HasSevenForwardGears', () => {
  assert.equal(gearAt(10, MCLAREN.sound.gears), 0);
  assert.equal(gearAt(270, MCLAREN.sound.gears), 6);
});

test('MCLAREN_IsPaintable_AndComesInPapayaOrange', () => {
  assert.equal(paintable(MCLAREN), true);
  assert.equal(MCLAREN.defaultPaint, 'signal');
  assert.ok(PAINTS.some(p => p.id === MCLAREN.defaultPaint));
  assert.equal(paintOnSelect(MCLAREN, 'navy', false), 'signal');
  assert.equal(paintOnSelect(MCLAREN, 'meadow', true), 'meadow');
  assert.equal(buildableId('mclaren', MCLAREN, 'loading'), 'compact');
  assert.equal(buildableId('mclaren', MCLAREN, 'ready'), 'mclaren');
});

// The Rhy Hyper's table entry. Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HYPER } from '../hyper.js';
import { buildableId, paintOnSelect } from '../gltfvehicle.js';
import { paintable, statBars, PAINTS } from '../carselect.js';
import { checkSound, gearAt } from '../sound.js';
import { checkCrash } from '../impact.js';

test('HYPER_Entry_HasTheShapeCheckVehicleExpects', () => {
  assert.equal(HYPER.model, 'gltf');
  assert.deepEqual(HYPER.gltf, { id: 'hyper', url: './assets/hyper.glb', fallback: 'compact' });
  assert.equal(HYPER.collision.shape, 'circle');
  assert.ok([HYPER.drive.top, HYPER.drive.accel, HYPER.drive.grip, HYPER.mass, HYPER.wheelR].every(Number.isFinite));
  assert.doesNotThrow(() => checkSound(HYPER.sound));
  assert.doesNotThrow(() => checkCrash(HYPER.sound.crash));
  assert.equal(HYPER.blinkers.length, 2);
});

test('HYPER_Wheels_MatchTheModelsWheelNodes', () => {
  // tools/prepare-hyper.mjs: wheel centres x ±1.355, |z| 0.809 / 0.807, r 0.364 front / 0.368 rear
  assert.deepEqual(HYPER.wheels, [[1.355, 0.809], [-1.355, 0.807]]);
  assert.equal(HYPER.wheelR, 0.366);
});

test('HYPER_Drive_IsThe300KmhFastestCarWithTheEngineBehindTheSeats', () => {
  assert.equal(Math.round(HYPER.drive.top * 3.6), 300);
  assert.equal(HYPER.sound.engine.topKmh, 300);
  assert.equal(HYPER.sound.engine.cylinders, 16);
  assert.ok(HYPER.engineAt[0] < 0, 'the engine sits behind the seats');
  assert.deepEqual(statBars(HYPER), { top: 10, accel: 10, handling: 8, mass: 6 });
});

test('HYPER_Gearbox_HasSevenForwardGears', () => {
  assert.equal(gearAt(10, HYPER.sound.gears), 0);
  assert.equal(gearAt(290, HYPER.sound.gears), 6);
});

test('HYPER_IsPaintable_AndComesInRacingBlue', () => {
  assert.equal(paintable(HYPER), true);
  assert.equal(HYPER.defaultPaint, 'racing');
  assert.ok(PAINTS.some(p => p.id === HYPER.defaultPaint));
  assert.equal(paintOnSelect(HYPER, 'navy', false), 'racing');
  assert.equal(paintOnSelect(HYPER, 'meadow', true), 'meadow');
  assert.equal(buildableId('hyper', HYPER, 'loading'), 'compact');
  assert.equal(buildableId('hyper', HYPER, 'ready'), 'hyper');
});

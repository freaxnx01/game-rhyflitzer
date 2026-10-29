// The Rhy Coupé's table entry. Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COUPE } from '../coupe.js';
import { buildableId, paintOnSelect } from '../gltfvehicle.js';
import { paintable, statBars, PAINTS } from '../carselect.js';
import { checkSound, gearAt } from '../sound.js';
import { checkCrash } from '../impact.js';

test('COUPE_Entry_HasTheShapeCheckVehicleExpects', () => {
  assert.equal(COUPE.model, 'gltf');
  assert.deepEqual(COUPE.gltf, { id: 'coupe', url: './assets/coupe.glb', fallback: 'compact' });
  assert.equal(COUPE.collision.shape, 'circle');
  assert.ok([COUPE.drive.top, COUPE.drive.accel, COUPE.drive.grip, COUPE.mass, COUPE.wheelR].every(Number.isFinite));
  assert.doesNotThrow(() => checkSound(COUPE.sound));
  assert.doesNotThrow(() => checkCrash(COUPE.sound.crash));
  assert.equal(COUPE.blinkers.length, 2);
});

test('COUPE_Wheels_MatchTheModelsWheelNodes', () => {
  // tools/prepare-coupe.mjs: wheel centres x ±1.33, |z| 0.746, r 0.306
  assert.deepEqual(COUPE.wheels, [[1.33, 0.746], [-1.33, 0.746]]);
  assert.equal(COUPE.wheelR, 0.306);
});

test('COUPE_Drive_IsA250KmhSportsCoupeWithTheEngineInFront', () => {
  assert.equal(Math.round(COUPE.drive.top * 3.6), 250);
  assert.equal(COUPE.sound.engine.topKmh, 250);
  assert.equal(COUPE.sound.engine.cylinders, 6);
  assert.ok(COUPE.engineAt[0] > 0, 'the engine sits in the nose');
  assert.deepEqual(statBars(COUPE), { top: 9, accel: 9, handling: 9, mass: 4 });
});

test('COUPE_Gearbox_HasSixForwardGears', () => {
  assert.equal(gearAt(10, COUPE.sound.gears), 0);
  assert.equal(gearAt(240, COUPE.sound.gears), 5);
});

test('COUPE_IsPaintable_AndComesInSignalOrange', () => {
  assert.equal(paintable(COUPE), true);
  assert.equal(COUPE.defaultPaint, 'signal');
  assert.ok(PAINTS.some(p => p.id === COUPE.defaultPaint));
  assert.equal(paintOnSelect(COUPE, 'navy', false), 'signal');
  assert.equal(paintOnSelect(COUPE, 'meadow', true), 'meadow');
  assert.equal(buildableId('coupe', COUPE, 'loading'), 'compact');
  assert.equal(buildableId('coupe', COUPE, 'ready'), 'coupe');
});

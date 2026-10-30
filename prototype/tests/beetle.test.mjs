// The Ladybug's table entry. Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEETLE } from '../beetle.js';
import { buildableId, paintOnSelect } from '../gltfvehicle.js';
import { paintable, statBars, PAINTS } from '../carselect.js';
import { checkSound, gearAt } from '../sound.js';
import { checkCrash } from '../impact.js';

test('BEETLE_Entry_HasTheShapeCheckVehicleExpects', () => {
  assert.equal(BEETLE.model, 'gltf');
  assert.deepEqual(BEETLE.gltf, { id: 'beetle', url: './assets/beetle.glb', fallback: 'compact' });
  assert.equal(BEETLE.collision.shape, 'circle');
  assert.ok([BEETLE.drive.top, BEETLE.drive.accel, BEETLE.drive.grip, BEETLE.mass, BEETLE.wheelR].every(Number.isFinite));
  assert.doesNotThrow(() => checkSound(BEETLE.sound));
  assert.doesNotThrow(() => checkCrash(BEETLE.sound.crash));
  assert.equal(BEETLE.blinkers.length, 2);
});

test('BEETLE_Wheels_MatchTheModelsWheelNodes', () => {
  // tools/prepare-beetle.mjs: wheel centres x ±1.2, |z| 0.704, r 0.329 front / 0.349 rear
  assert.deepEqual(BEETLE.wheels.map(([x]) => x), [1.2, -1.2]);
  for (const [, z] of BEETLE.wheels) assert.ok(Math.abs(z - 0.704) <= 0.01, z);
  assert.equal(BEETLE.wheelR, 0.349);
});

test('BEETLE_Drive_IsModestUntilTheNitroDoublesTheAccel', () => {
  assert.equal(Math.round(BEETLE.drive.top * 3.6), 137);
  assert.equal(BEETLE.sound.engine.topKmh, 137);
  assert.ok(BEETLE.drive.topNitro >= 1.5 * BEETLE.drive.top && BEETLE.drive.accelNitro >= 3 * BEETLE.drive.accel);
  assert.ok(BEETLE.engineAt[0] < 0, 'the engine sits in the tail');
  assert.deepEqual(statBars(BEETLE), { top: 5, accel: 5, handling: 7, mass: 3 });
});

test('BEETLE_Gearbox_HasFourForwardGears', () => {
  assert.equal(gearAt(10, BEETLE.sound.gears), 0);
  assert.equal(gearAt(120, BEETLE.sound.gears), 3);
  assert.equal(gearAt(300, BEETLE.sound.gears), 3);
});

test('BEETLE_StandsInWithTheCompactUntilLoaded_AndIsPaintableRedFromTheFactory', () => {
  assert.equal(buildableId('beetle', BEETLE, 'loading'), 'compact');
  assert.equal(buildableId('beetle', BEETLE, 'ready'), 'beetle');
  assert.equal(paintable(BEETLE), true);
  assert.ok(PAINTS.some(p => p.id === BEETLE.defaultPaint));
  assert.equal(paintOnSelect(BEETLE, 'navy', false), 'swiss');
  assert.equal(paintOnSelect(BEETLE, 'meadow', true), 'meadow');
});

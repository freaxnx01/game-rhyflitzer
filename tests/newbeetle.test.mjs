// The Rhy Bubble's table entry. Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEW_BEETLE } from '../newbeetle.js';
import { buildableId, paintOnSelect } from '../gltfvehicle.js';
import { paintable, statBars, PAINTS } from '../carselect.js';
import { checkSound, gearAt } from '../sound.js';
import { checkCrash } from '../impact.js';

test('NEW_BEETLE_Entry_HasTheShapeCheckVehicleExpects', () => {
  assert.equal(NEW_BEETLE.model, 'gltf');
  assert.deepEqual(NEW_BEETLE.gltf, { id: 'newbeetle', url: './assets/newbeetle.glb', fallback: 'compact' });
  assert.equal(NEW_BEETLE.collision.shape, 'circle');
  assert.ok([NEW_BEETLE.drive.top, NEW_BEETLE.drive.accel, NEW_BEETLE.drive.grip, NEW_BEETLE.mass, NEW_BEETLE.wheelR].every(Number.isFinite));
  assert.doesNotThrow(() => checkSound(NEW_BEETLE.sound));
  assert.doesNotThrow(() => checkCrash(NEW_BEETLE.sound.crash));
  assert.equal(NEW_BEETLE.blinkers.length, 2);
});

test('NEW_BEETLE_Wheels_MatchTheModelsWheelNodes', () => {
  // tools/prepare-newbeetle.mjs: wheel centres x ±1.255, |z| 0.736, r 0.317
  assert.deepEqual(NEW_BEETLE.wheels, [[1.255, 0.736], [-1.255, 0.736]]);
  assert.equal(NEW_BEETLE.wheelR, 0.317);
});

test('NEW_BEETLE_Drive_IsAFriendly180KmhCityCarWithTheEngineInFront', () => {
  assert.equal(Math.round(NEW_BEETLE.drive.top * 3.6), 180);
  assert.equal(NEW_BEETLE.sound.engine.topKmh, 180);
  assert.ok(NEW_BEETLE.engineAt[0] > 0, 'the engine sits in the nose');
  assert.deepEqual(statBars(NEW_BEETLE), { top: 7, accel: 7, handling: 8, mass: 3 });
});

test('NEW_BEETLE_Gearbox_HasFiveForwardGears', () => {
  assert.equal(gearAt(10, NEW_BEETLE.sound.gears), 0);
  assert.equal(gearAt(170, NEW_BEETLE.sound.gears), 4);
});

test('NEW_BEETLE_IsPaintable_AndComesInSunflowerYellow', () => {
  assert.equal(paintable(NEW_BEETLE), true);
  assert.ok(PAINTS.some(p => p.id === NEW_BEETLE.defaultPaint));
  assert.equal(paintOnSelect(NEW_BEETLE, 'navy', false), 'sunflower');
  assert.equal(paintOnSelect(NEW_BEETLE, 'meadow', true), 'meadow');
  assert.equal(buildableId('newbeetle', NEW_BEETLE, 'loading'), 'compact');
  assert.equal(buildableId('newbeetle', NEW_BEETLE, 'ready'), 'newbeetle');
});

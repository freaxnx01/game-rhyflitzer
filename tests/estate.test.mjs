// The Rhy Estate's table entry. Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESTATE } from '../estate.js';
import { buildableId, paintOnSelect } from '../gltfvehicle.js';
import { paintable, statBars } from '../carselect.js';
import { checkSound, gearAt } from '../sound.js';
import { checkCrash } from '../impact.js';

test('ESTATE_Entry_HasTheShapeCheckVehicleExpects', () => {
  assert.equal(ESTATE.model, 'gltf');
  assert.deepEqual(ESTATE.gltf, { id: 'estate', url: './assets/estate.glb', fallback: 'compact' });
  assert.deepEqual(ESTATE.collision, { shape: 'circle', r: 1.25 });
  assert.ok([ESTATE.drive.top, ESTATE.drive.accel, ESTATE.drive.grip, ESTATE.mass, ESTATE.wheelR].every(Number.isFinite));
  assert.doesNotThrow(() => checkSound(ESTATE.sound));
  assert.doesNotThrow(() => checkCrash(ESTATE.sound.crash));
  assert.equal(ESTATE.blinkers.length, 2);
});

test('ESTATE_Wheels_MatchTheModelsWheelNodes', () => {
  // tools/prepare-estate.mjs: wheel centres x ±1.289, |z| 0.732, r 0.322
  assert.deepEqual(ESTATE.wheels, [[1.289, 0.732], [-1.289, 0.732]]);
  assert.equal(ESTATE.wheelR, 0.322);
});

test('ESTATE_Drive_Is207KmhLikeTheTwoLitreDiesel', () => {
  assert.equal(Math.round(ESTATE.drive.top * 3.6), 207);
  assert.equal(ESTATE.sound.engine.topKmh, 207);
  assert.equal(ESTATE.sound.engine.cylinders, 4);
  assert.ok(ESTATE.sound.engine.limitRpm <= 5000, 'a diesel: it runs out of revs early');
});

test('ESTATE_Gearbox_HasSixForwardGears', () => {
  assert.equal(gearAt(10, ESTATE.sound.gears), 0);
  assert.equal(gearAt(200, ESTATE.sound.gears), 5);
});

test('ESTATE_IsPaintable_RhineBlueFromTheFactory', () => {
  assert.equal(paintable(ESTATE), true);
  assert.equal(ESTATE.defaultPaint, 'rhine');
  assert.equal(paintOnSelect(ESTATE, 'meadow', true), 'meadow', 'a chosen paint stays');
  assert.equal(buildableId('estate', ESTATE, 'loading'), 'compact');
  assert.equal(buildableId('estate', ESTATE, 'ready'), 'estate');
  assert.ok(statBars(ESTATE).top >= 6);
});

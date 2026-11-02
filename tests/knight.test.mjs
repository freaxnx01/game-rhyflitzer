// The Rhy Knight's table entry. Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KNIGHT } from '../knight.js';
import { buildableId, paintOnSelect } from '../gltfvehicle.js';
import { paintable, statBars } from '../carselect.js';
import { checkSound, gearAt } from '../sound.js';
import { checkCrash } from '../impact.js';
import { capsuleOffsets } from '../bus.js';

test('KNIGHT_Entry_HasTheShapeCheckVehicleExpects', () => {
  assert.equal(KNIGHT.model, 'gltf');
  assert.deepEqual(KNIGHT.gltf, { id: 'knight', url: './assets/knight.glb', fallback: 'compact' });
  assert.deepEqual(KNIGHT.collision, { shape: 'capsule', r: 0.95, hl: 1.5 });
  assert.ok([KNIGHT.drive.top, KNIGHT.drive.accel, KNIGHT.drive.grip, KNIGHT.mass, KNIGHT.wheelR].every(Number.isFinite));
  assert.doesNotThrow(() => checkSound(KNIGHT.sound));
  assert.doesNotThrow(() => checkCrash(KNIGHT.sound.crash));
  assert.equal(KNIGHT.blinkers.length, 2);
});

test('KNIGHT_Capsule_CoversTheBodyFromNoseToTail', () => {
  // tools/prepare-knight.mjs: the body from x -2.353 to 2.497
  const offsets = capsuleOffsets(KNIGHT.collision), r = KNIGHT.collision.r;
  assert.ok(Math.max(...offsets) + r >= 2.4 && Math.min(...offsets) - r <= -2.35, JSON.stringify(offsets));
});

test('KNIGHT_Wheels_MatchTheModelsWheelNodes', () => {
  // tools/prepare-knight.mjs: wheel centres x ±1.282, |z| 0.777, r 0.323
  assert.deepEqual(KNIGHT.wheels, [[1.282, 0.777], [-1.282, 0.777]]);
  assert.equal(KNIGHT.wheelR, 0.323);
});

test('KNIGHT_Drive_Is220KmhAnd330WithTheTurboBoost', () => {
  assert.equal(Math.round(KNIGHT.drive.top * 3.6), 220);
  assert.equal(Math.round(KNIGHT.drive.topNitro * 3.6), 331);
  assert.equal(KNIGHT.sound.engine.topKmh, 220);
  assert.equal(KNIGHT.sound.engine.cylinders, 8);
  assert.deepEqual(statBars(KNIGHT), { top: 8, accel: 8, handling: 8, mass: 5 });
});

test('KNIGHT_Gearbox_HasFourForwardGears', () => {
  assert.equal(gearAt(10, KNIGHT.sound.gears), 0);
  assert.equal(gearAt(200, KNIGHT.sound.gears), 3);
});

test('KNIGHT_Livery_IsFixed_NotPaintable', () => {
  assert.equal(paintable(KNIGHT), false);
  assert.equal(paintOnSelect(KNIGHT, 'meadow', true), 'meadow', 'a chosen paint stays for the next car');
  assert.equal(buildableId('knight', KNIGHT, 'loading'), 'compact');
  assert.equal(buildableId('knight', KNIGHT, 'ready'), 'knight');
});

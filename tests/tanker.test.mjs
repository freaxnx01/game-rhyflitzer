// The Rhy Tanker's table entry. Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TANKER } from '../tanker.js';
import { buildableId, paintOnSelect } from '../gltfvehicle.js';
import { paintable } from '../carselect.js';
import { checkSound, gearAt } from '../sound.js';
import { checkCrash } from '../impact.js';
import { impactDamage } from '../wreck.js';
import { capsuleOffsets } from '../bus.js';

test('TANKER_Entry_HasTheShapeCheckVehicleExpects', () => {
  assert.equal(TANKER.type, 'utility');
  assert.equal(TANKER.model, 'gltf');
  assert.deepEqual(TANKER.gltf, { id: 'tanker', url: './assets/tanker.glb', fallback: 'compact' });
  assert.equal(TANKER.collision.shape, 'capsule');
  assert.ok([TANKER.drive.top, TANKER.drive.accel, TANKER.drive.grip, TANKER.mass, TANKER.wheelR].every(Number.isFinite));
  assert.doesNotThrow(() => checkSound(TANKER.sound));
  assert.doesNotThrow(() => checkCrash(TANKER.sound.crash));
  assert.equal(TANKER.blinkers.length, 2);
});

test('TANKER_Capsule_StaysOverTheTruckAndNeverReachesTheTrailer', () => {
  // tools/prepare-tanker.mjs: the truck runs from about +4.6 (bumper) to -5.2 (coupling); the trailer sits behind that
  const offsets = capsuleOffsets(TANKER.collision), r = TANKER.collision.r;
  assert.ok(Math.max(...offsets) + r <= 4.9 && Math.min(...offsets) - r >= -4.9, JSON.stringify(offsets));
  assert.ok(Math.max(...offsets) + r >= 4.0 && Math.min(...offsets) - r <= -4.0, 'it does cover the truck');
});

test('TANKER_Wheels_MatchTheModelsWheelNodes', () => {
  // the front axle x 3.04, |z| 1.054; the tandem's first axle x -2.36, |z| 0.939 (the second at -3.71); r 0.535
  assert.deepEqual(TANKER.wheels, [[3.04, 1.054], [-2.36, 0.939]]);
  assert.equal(TANKER.wheelR, 0.535);
});

test('TANKER_Trailer_MatchesTheModelsExtras', () => {
  assert.deepEqual(TANKER.trailer, { hitch: 5.2, length: 3.85, tail: 4.6, wheelR: 0.544 });
  assert.ok(TANKER.trailer.hitch > 0 && TANKER.trailer.length > 3, 'the axles sit well behind the hitch');
});

test('TANKER_Drive_IsAHeavyTruckAt80Kmh', () => {
  assert.equal(TANKER.drive.top, 22.2);
  assert.equal(Math.round(TANKER.drive.top * 3.6), 80);
  assert.equal(TANKER.sound.engine.topKmh, 80);
  assert.equal(TANKER.mass, 9);
  assert.ok(impactDamage(1, TANKER.mass) < impactDamage(1, 6), 'tougher than the Mixer');
  assert.equal(gearAt(5, TANKER.sound.gears), 0);
});

test('TANKER_Livery_IsFixed_NotPaintable', () => {
  assert.equal(TANKER.paint, false);
  assert.equal(paintable(TANKER), false);
  assert.equal(paintOnSelect(TANKER, 'meadow', true), 'meadow');
  assert.equal(buildableId('tanker', TANKER, 'loading'), 'compact');
  assert.equal(buildableId('tanker', TANKER, 'ready'), 'tanker');
});

test('TANKER_Camera_StaysBehindAndAboveTheTrailer', () => {
  // dist is measured from the car origin; the trailer's tail lies about 13.65 m behind it (18.25 m combination)
  const c = TANKER.camera;
  assert.deepEqual([c.chase.dist, c.chase.h, c.near.dist, c.near.h, c.drone.dist, c.drone.h], [20, 6.5, 15, 5, 32, 20]);
  assert.ok(c.near.dist > 13.65 + 1, 'the near cam clears the trailer tail');
});

// The Rhy Bulldog's table entry. Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BULLDOG } from '../bulldog.js';
import { buildableId, paintOnSelect } from '../gltfvehicle.js';
import { paintable, statBars, PAINTS } from '../carselect.js';
import { checkSound, gearAt } from '../sound.js';
import { checkCrash } from '../impact.js';
import { impactDamage } from '../wreck.js';

test('BULLDOG_Entry_HasTheShapeCheckVehicleExpects', () => {
  assert.equal(BULLDOG.model, 'gltf');
  assert.deepEqual(BULLDOG.gltf, { id: 'bulldog', url: './assets/bulldog.glb', fallback: 'compact' });
  assert.deepEqual(BULLDOG.collision, { shape: 'capsule', r: 1.0, hl: 1.75 });   // the 5.54 m with the push bar: circles reach ±2.75 m
  assert.ok([BULLDOG.drive.top, BULLDOG.drive.accel, BULLDOG.drive.grip, BULLDOG.mass, BULLDOG.wheelR].every(Number.isFinite));
  assert.doesNotThrow(() => checkSound(BULLDOG.sound));
  assert.doesNotThrow(() => checkCrash(BULLDOG.sound.crash));
  assert.equal(BULLDOG.blinkers.length, 2);
});

test('BULLDOG_Wheels_MatchTheModelsWheelNodes', () => {
  // tools/prepare-bulldog.mjs: wheel centres x ±1.473, |z| 0.757, r 0.344
  assert.deepEqual(BULLDOG.wheels, [[1.473, 0.757], [-1.473, 0.757]]);
  assert.equal(BULLDOG.wheelR, 0.344);
});

test('BULLDOG_Drive_IsAHeavySlowTankThatTakesTheLeastDamage', () => {
  assert.equal(Math.round(BULLDOG.drive.top * 3.6), 190);
  assert.equal(BULLDOG.sound.engine.topKmh, 190);
  assert.equal(BULLDOG.sound.engine.cylinders, 8);
  assert.ok(BULLDOG.engineAt[0] > 0, 'the engine sits in the nose');
  assert.ok(impactDamage(1, BULLDOG.mass) <= impactDamage(1, 3) && impactDamage(1, BULLDOG.mass) < impactDamage(1, 2.3), 'tougher than the Tumbler');
  assert.deepEqual(statBars(BULLDOG), { top: 7, accel: 6, handling: 7, mass: 10 });
});

test('BULLDOG_Gearbox_HasFourForwardGears', () => {
  assert.equal(gearAt(10, BULLDOG.sound.gears), 0);
  assert.equal(gearAt(180, BULLDOG.sound.gears), 3);
});

test('BULLDOG_Livery_IsFixed_NotPaintable', () => {
  assert.equal(paintable(BULLDOG), false);
  assert.equal(BULLDOG.defaultPaint, undefined);
  assert.equal(paintOnSelect(BULLDOG, 'meadow', true), 'meadow', 'a chosen paint stays for the next car');
  assert.equal(buildableId('bulldog', BULLDOG, 'loading'), 'compact');
  assert.equal(buildableId('bulldog', BULLDOG, 'ready'), 'bulldog');
});

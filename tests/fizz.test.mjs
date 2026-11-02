// The Rhy Fizz's table entry. Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIZZ } from '../fizz.js';
import { buildableId, paintOnSelect } from '../gltfvehicle.js';
import { wheelPlan, WHEEL_NODES } from '../hatchback.js';
import { paintable, statBars } from '../carselect.js';
import { checkSound, gearAt } from '../sound.js';
import { checkCrash } from '../impact.js';
import { impactDamage } from '../wreck.js';
import { capsuleOffsets } from '../bus.js';

test('FIZZ_Entry_HasTheShapeCheckVehicleExpects', () => {
  assert.equal(FIZZ.model, 'gltf');
  assert.deepEqual(FIZZ.gltf, { id: 'fizz', url: './assets/fizz.glb', fallback: 'compact' });
  assert.deepEqual(FIZZ.collision, { shape: 'capsule', r: 1.4, hl: 4.1 });
  assert.ok([FIZZ.drive.top, FIZZ.drive.accel, FIZZ.drive.grip, FIZZ.mass, FIZZ.wheelR].every(Number.isFinite));
  assert.doesNotThrow(() => checkSound(FIZZ.sound));
  assert.doesNotThrow(() => checkCrash(FIZZ.sound.crash));
  assert.equal(FIZZ.blinkers.length, 2);
});

test('FIZZ_Capsule_CoversTheTruckFromBumperToTrailerTail', () => {
  const offsets = capsuleOffsets(FIZZ.collision), r = FIZZ.collision.r;
  assert.ok(Math.max(...offsets) + r >= 5.46 && Math.min(...offsets) - r <= -5.5, JSON.stringify(offsets));
});

test('FIZZ_Wheels_MatchTheModelsWheelNodes', () => {
  // tools/prepare-fizz.mjs: front axle x 4.551, the first drive axle x 1.961, |z| 1.37; r 0.458
  assert.deepEqual(FIZZ.wheels, [[4.551, 1.37], [1.961, 1.37]]);
  assert.equal(FIZZ.wheelR, 0.458);
});

test('FIZZ_TenWheelNodes_TwoSteerEightRoll', () => {
  const extra = ['RL2', 'RR2', 'RL3', 'RR3', 'RL4', 'RR4'].map(n => `wheel_${n}`), plan = wheelPlan(['body', ...WHEEL_NODES, ...extra]);
  assert.equal(plan.length, 10);
  assert.equal(plan.filter(w => w.front).length, 2);
});

test('FIZZ_Drive_IsAHeavySlowSemi', () => {
  assert.equal(Math.round(FIZZ.drive.top * 3.6), 105);
  assert.equal(FIZZ.sound.engine.topKmh, 105);
  assert.ok(impactDamage(1, FIZZ.mass) < impactDamage(1, 6), 'tougher than the Rhy Mixer');
  assert.deepEqual(statBars(FIZZ), { top: 4, accel: 2, handling: 5, mass: 10 });
});

test('FIZZ_Gearbox_HasEightForwardGears', () => {
  assert.equal(gearAt(5, FIZZ.sound.gears), 0);
  assert.equal(gearAt(100, FIZZ.sound.gears), 7);
});

test('FIZZ_Livery_IsFixed_NotPaintable', () => {
  assert.equal(paintable(FIZZ), false);
  assert.equal(paintOnSelect(FIZZ, 'meadow', true), 'meadow', 'a chosen paint stays for the next car');
  assert.equal(buildableId('fizz', FIZZ, 'loading'), 'compact');
  assert.equal(buildableId('fizz', FIZZ, 'ready'), 'fizz');
});

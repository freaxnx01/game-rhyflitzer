// The Rhy Wobbler's table entry. Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WOBBLER } from '../wobbler.js';
import { buildableId, paintOnSelect } from '../gltfvehicle.js';
import { paintable, statBars, PAINTS } from '../carselect.js';
import { checkSound, gearAt } from '../sound.js';
import { checkCrash } from '../impact.js';
import { impactDamage } from '../wreck.js';
import { TIP_UP, stepTip } from '../tipover.js';

// the game's corner: full lock at speed v (stepCar: steerRate x min(v / 6, 1) / (1 + v / 30) rad/s, times v)
const fullLock = (v) => WOBBLER.drive.steerRate * Math.min(v / 6, 1) / (1 + v / 30) * v;
const holdCorner = (v, secs) => { let s = TIP_UP; for (let i = 0; i < secs * 60; i++) s = stepTip(s, fullLock(v), 1 / 60, WOBBLER.tip); return s; };

test('WOBBLER_Entry_HasTheShapeCheckVehicleExpects', () => {
  assert.equal(WOBBLER.model, 'gltf');
  assert.deepEqual(WOBBLER.gltf, { id: 'wobbler', url: './assets/wobbler.glb', fallback: 'compact' });
  assert.deepEqual(WOBBLER.collision, { shape: 'circle', r: 1.0 });
  assert.ok([WOBBLER.drive.top, WOBBLER.drive.accel, WOBBLER.drive.grip, WOBBLER.mass, WOBBLER.wheelR].every(Number.isFinite));
  assert.doesNotThrow(() => checkSound(WOBBLER.sound));
  assert.doesNotThrow(() => checkCrash(WOBBLER.sound.crash));
  assert.equal(WOBBLER.blinkers.length, 2);
});

test('WOBBLER_Wheels_MatchTheModelsWheelNodes', () => {
  // tools/prepare-wobbler.mjs: the front wheel on the centre line at x 1.085, the rear ones at x -1.085, |z| 0.61; r 0.272
  assert.deepEqual(WOBBLER.wheels, [[1.085, 0], [-1.085, 0.61]]);
  assert.equal(WOBBLER.wheelR, 0.272);
});

test('WOBBLER_Drive_IsASlowLightFourThatTakesTheMostDamage', () => {
  assert.equal(Math.round(WOBBLER.drive.top * 3.6), 137);
  assert.equal(WOBBLER.sound.engine.topKmh, 137);
  assert.equal(WOBBLER.sound.engine.cylinders, 4);
  assert.ok(WOBBLER.engineAt[0] > 0, 'the engine sits in the nose');
  assert.ok(impactDamage(1, WOBBLER.mass) > impactDamage(1, 0.85), 'more fragile than the Ladybug');
  assert.deepEqual(statBars(WOBBLER), { top: 5, accel: 5, handling: 6, mass: 2 });
});

test('WOBBLER_Gearbox_HasFourForwardGears', () => {
  assert.equal(gearAt(10, WOBBLER.sound.gears), 0);
  assert.equal(gearAt(120, WOBBLER.sound.gears), 3);
});

test('WOBBLER_CornerAtTownSpeed_StaysOnItsWheels', () => {
  assert.equal(holdCorner(12, 3).phase, 'up', 'full lock at 43 km/h for 3 s');
});

test('WOBBLER_FastCornerHeld_TipsOverWithinHalfASecond', () => {
  assert.equal(holdCorner(17, 0.5).phase, 'falling', 'full lock at 61 km/h');
});

test('WOBBLER_TippingOver_Hurts15PercentEachTime', () => {
  assert.ok(Math.abs(impactDamage(WOBBLER.tip.hit, WOBBLER.mass) - 0.15) < 1e-9);
});

test('WOBBLER_Paint_IsSunflowerFromTheFactory', () => {
  assert.equal(paintable(WOBBLER), true);
  assert.ok(PAINTS.some(p => p.id === WOBBLER.defaultPaint));
  assert.equal(paintOnSelect(WOBBLER, 'navy'), 'sunflower', 'the factory colour comes with the car');
  assert.equal(paintOnSelect(WOBBLER, 'meadow', true), 'meadow', 'a chosen paint stays');
  assert.equal(buildableId('wobbler', WOBBLER, 'loading'), 'compact');
  assert.equal(buildableId('wobbler', WOBBLER, 'ready'), 'wobbler');
});

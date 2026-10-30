// The Rhy Tumbler's table entry. Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUMBLER } from '../tumbler.js';
import { buildableId } from '../gltfvehicle.js';
import { paintable, statBars } from '../carselect.js';
import { checkSound, gearAt } from '../sound.js';
import { checkCrash } from '../impact.js';

test('TUMBLER_Entry_HasTheShapeCheckVehicleExpects', () => {
  assert.equal(TUMBLER.model, 'gltf');
  assert.deepEqual(TUMBLER.gltf, { id: 'tumbler', url: './assets/tumbler.glb', fallback: 'compact' });
  assert.equal(TUMBLER.collision.shape, 'circle');
  assert.ok([TUMBLER.drive.top, TUMBLER.drive.accel, TUMBLER.drive.grip, TUMBLER.mass, TUMBLER.wheelR].every(Number.isFinite));
  assert.doesNotThrow(() => checkSound(TUMBLER.sound));
  assert.doesNotThrow(() => checkCrash(TUMBLER.sound.crash));
  assert.equal(TUMBLER.blinkers.length, 2);
});

test('TUMBLER_Wheels_MatchTheModelsWheelNodes', () => {
  // tools/prepare-tumbler.mjs: wheel centres x ±1.797, |z| 0.613 front / 0.82 rear, r 0.557 rear
  assert.deepEqual(TUMBLER.wheels, [[1.797, 0.613], [-1.797, 0.82]]);
  assert.equal(TUMBLER.wheelR, 0.557);
});

test('TUMBLER_Drive_IsAHeavy180KmhCarWithAStrongBoostAndTheEngineBehind', () => {
  assert.equal(Math.round(TUMBLER.drive.top * 3.6), 180);
  assert.equal(TUMBLER.sound.engine.topKmh, 180);
  assert.equal(TUMBLER.sound.engine.cylinders, 8);
  assert.ok(TUMBLER.drive.topNitro / TUMBLER.drive.top >= 1.8, 'the jet burner nearly doubles the top speed');
  assert.ok(TUMBLER.engineAt[0] < 0, 'the engine sits behind the cockpit');
  assert.deepEqual(statBars(TUMBLER), { top: 7, accel: 8, handling: 8, mass: 8 });
});

test('TUMBLER_Gearbox_HasFourForwardGears', () => {
  assert.equal(gearAt(10, TUMBLER.sound.gears), 0);
  assert.equal(gearAt(170, TUMBLER.sound.gears), 3);
});

test('TUMBLER_IsMattBlack_NotPaintable', () => {
  assert.equal(paintable(TUMBLER), false);
  assert.equal(buildableId('tumbler', TUMBLER, 'loading'), 'compact');
  assert.equal(buildableId('tumbler', TUMBLER, 'ready'), 'tumbler');
});

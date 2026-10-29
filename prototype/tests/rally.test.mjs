// The Rhy Rally's table entry. Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RALLY } from '../rally.js';
import { buildableId } from '../gltfvehicle.js';
import { paintable, statBars } from '../carselect.js';
import { checkSound, gearAt } from '../sound.js';
import { checkCrash } from '../impact.js';

test('RALLY_Entry_HasTheShapeCheckVehicleExpects', () => {
  assert.equal(RALLY.model, 'gltf');
  assert.deepEqual(RALLY.gltf, { id: 'rally', url: './assets/rally.glb', fallback: 'compact' });
  assert.equal(RALLY.collision.shape, 'circle');
  assert.ok([RALLY.drive.top, RALLY.drive.accel, RALLY.drive.grip, RALLY.mass, RALLY.wheelR].every(Number.isFinite));
  assert.doesNotThrow(() => checkSound(RALLY.sound));
  assert.doesNotThrow(() => checkCrash(RALLY.sound.crash));
  assert.equal(RALLY.blinkers.length, 2);
});

test('RALLY_Wheels_MatchTheModelsWheelNodes', () => {
  // tools/prepare-rally.mjs: wheel centres x ±1.285, |z| 0.833 / 0.835, r 0.323
  assert.deepEqual(RALLY.wheels.map(([x]) => x), [1.285, -1.285]);
  for (const [, z] of RALLY.wheels) assert.ok(Math.abs(z - 0.834) <= 0.01, z);
  assert.equal(RALLY.wheelR, 0.323);
});

test('RALLY_Drive_QuickOffTheLineAndLooseOnTheHandbrake', () => {
  assert.equal(Math.round(RALLY.drive.top * 3.6), 202);
  assert.ok(RALLY.drive.accel >= 19 && RALLY.drive.steerRate >= 3);
  assert.ok(RALLY.drive.gripHandbrake < RALLY.drive.grip / 8);
  assert.deepEqual(statBars(RALLY), { top: 7, accel: 10, handling: 9, mass: 4 });
});

test('RALLY_Gearbox_HasSixForwardGears', () => {
  assert.equal(RALLY.sound.gears.length - 1, 6);
  assert.equal(gearAt(10, RALLY.sound.gears), 0);
  assert.equal(gearAt(190, RALLY.sound.gears), 5);
});

test('RALLY_StandsInWithTheCompactUntilLoaded_AndKeepsItsLivery', () => {
  assert.equal(buildableId('rally', RALLY, 'loading'), 'compact');
  assert.equal(buildableId('rally', RALLY, 'ready'), 'rally');
  assert.equal(paintable(RALLY), false);
});

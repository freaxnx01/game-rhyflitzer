// The Rhy Harvester's table entry. Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HARVESTER } from '../harvester.js';
import { buildableId, paintOnSelect, spinPlan } from '../gltfvehicle.js';
import { paintable, statBars, PAINTS } from '../carselect.js';
import { checkSound, gearAt } from '../sound.js';
import { checkCrash } from '../impact.js';
import { capsuleOffsets } from '../bus.js';

test('HARVESTER_Entry_HasTheShapeCheckVehicleExpects', () => {
  assert.equal(HARVESTER.model, 'gltf');
  assert.deepEqual(HARVESTER.gltf, { id: 'harvester', url: './assets/harvester.glb', fallback: 'compact' });
  assert.deepEqual(HARVESTER.collision, { shape: 'capsule', r: 1.7, hl: 4.6 });
  assert.ok([HARVESTER.drive.top, HARVESTER.drive.accel, HARVESTER.drive.grip, HARVESTER.mass, HARVESTER.wheelR].every(Number.isFinite));
  assert.doesNotThrow(() => checkSound(HARVESTER.sound));
  assert.doesNotThrow(() => checkCrash(HARVESTER.sound.crash));
  assert.equal(HARVESTER.blinkers.length, 2);
});

test('HARVESTER_Capsule_CoversItFromTheHeaderToTheAugerTip', () => {
  const offsets = capsuleOffsets(HARVESTER.collision), r = HARVESTER.collision.r;
  assert.ok(Math.max(...offsets) + r >= 5.42 && Math.min(...offsets) - r <= -6.26, JSON.stringify(offsets));
});

test('HARVESTER_Wheels_MatchTheModelsWheelNodes', () => {
  // tools/prepare-harvester.mjs: x ±1.554, |z| 1.324 front / 1.273 rear; r 0.9 front
  assert.deepEqual(HARVESTER.wheels, [[1.554, 1.324], [-1.554, 1.273]]);
  assert.equal(HARVESTER.wheelR, 0.9);
});

test('HARVESTER_Reel_TurnsBackwardsAboutTheReelNode', () => {
  const [reel] = spinPlan(HARVESTER, ['body', 'reel']);
  assert.equal(reel.node, 'reel');
  assert.ok(reel.rate < 0, 'about local +x (across, to the right): negative sweeps the lower bars back');
});

test('HARVESTER_Drive_IsTheSlowestButTurnsTightly', () => {
  assert.equal(Math.round(HARVESTER.drive.top * 3.6), 40);
  assert.equal(HARVESTER.sound.engine.topKmh, 40);
  assert.deepEqual(statBars(HARVESTER), { top: 1, accel: 1, handling: 5, mass: 10 });
});

test('HARVESTER_Gearbox_HasFourRanges', () => {
  assert.equal(gearAt(5, HARVESTER.sound.gears), 0);
  assert.equal(gearAt(38, HARVESTER.sound.gears), 3);
});

test('HARVESTER_Paint_IsMeadowGreenFromTheFactory', () => {
  assert.equal(paintable(HARVESTER), true);
  assert.ok(PAINTS.some(p => p.id === HARVESTER.defaultPaint));
  assert.equal(paintOnSelect(HARVESTER, 'navy'), 'meadow');
  assert.equal(buildableId('harvester', HARVESTER, 'loading'), 'compact');
  assert.equal(buildableId('harvester', HARVESTER, 'ready'), 'harvester');
});

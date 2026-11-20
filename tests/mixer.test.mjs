// The Rhy Mixer's table entry. Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIXER } from '../mixer.js';
import { buildableId, paintOnSelect, spinPlan } from '../gltfvehicle.js';
import { paintable, statBars } from '../carselect.js';
import { checkSound, gearAt } from '../sound.js';
import { checkCrash } from '../impact.js';
import { impactDamage } from '../wreck.js';
import { capsuleOffsets } from '../bus.js';

test('MIXER_Entry_HasTheShapeCheckVehicleExpects', () => {
  assert.equal(MIXER.model, 'gltf');
  assert.deepEqual(MIXER.gltf, { id: 'mixer', url: './assets/mixer.glb', fallback: 'compact' });
  assert.deepEqual(MIXER.collision, { shape: 'capsule', r: 1.3, hl: 2.6 });
  assert.ok([MIXER.drive.top, MIXER.drive.accel, MIXER.drive.grip, MIXER.mass, MIXER.wheelR].every(Number.isFinite));
  assert.doesNotThrow(() => checkSound(MIXER.sound));
  assert.doesNotThrow(() => checkCrash(MIXER.sound.crash));
  assert.equal(MIXER.blinkers.length, 2);
});

test('MIXER_Capsule_CoversTheBodyFromBumperToTail', () => {
  const offsets = capsuleOffsets(MIXER.collision), r = MIXER.collision.r;
  assert.ok(Math.max(...offsets) + r >= 3.28 && Math.min(...offsets) - r <= -3.9, JSON.stringify(offsets));
});

test('MIXER_Wheels_MatchTheModelsWheelNodes', () => {
  // tools/prepare-mixer.mjs: front axle x 1.73, |z| 1.04; the tandem at x -1.02 and -2.44, |z| 0.87; r 0.535
  assert.deepEqual(MIXER.wheels, [[1.73, 1.04], [-1.02, 0.87]]);
  assert.equal(MIXER.wheelR, 0.535);
});

test('MIXER_Drum_TurnsAboutTheDrumNode', () => {
  assert.deepEqual(spinPlan(MIXER, ['body', 'drum']), [{ node: 'drum', rate: 1.0 }]);
});

test('MIXER_Drive_IsASlowHeavyTruck', () => {
  assert.equal(MIXER.drive.top, 30);   // #1122: the equilibrium with drive.drag is ~80 km/h (see the test below)
  assert.equal(MIXER.sound.engine.topKmh, 80);
  assert.ok(impactDamage(1, MIXER.mass) < impactDamage(1, 3), 'tougher than the Bulldog');
  assert.deepEqual(statBars(MIXER), { top: 4, accel: 2, handling: 5, mass: 10 });   // #1122: top 22.2 -> 30 lifts the bar from 3 to 4
});

test('MIXER_Gearbox_HasSixForwardGears', () => {
  assert.equal(gearAt(5, MIXER.sound.gears), 0);
  assert.equal(gearAt(75, MIXER.sound.gears), 5);
});

test('MIXER_Livery_IsFixed_NotPaintable', () => {
  assert.equal(paintable(MIXER), false);
  assert.equal(paintOnSelect(MIXER, 'meadow', true), 'meadow', 'a chosen paint stays for the next car');
  assert.equal(buildableId('mixer', MIXER, 'loading'), 'compact');
  assert.equal(buildableId('mixer', MIXER, 'ready'), 'mixer');
});

test('MIXER_Drive_BalancesAtAbout80KmhOnADryRoad', () => {   // #1122: v_eq = (accel - 0.6) / (accel / top + drag)
  const d = MIXER.drive, eq = (a, top, drag) => (a - 0.6) / (a / top + drag);
  assert.equal(d.drag, 0.014);
  assert.ok(Math.abs(eq(d.accel, d.top, d.drag) * 3.6 - 80) < 3);
});

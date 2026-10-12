// #277: which level the car is on, and that level's ground and colliders. node --test prototype/tests/levels.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLevels } from '../levels.js';

const make = () => {
  const lv = createLevels();
  lv.register('surface', { groundAt: (x, z) => 100 + x * 0.1, colliders: { name: 'surface-grid' } });
  lv.register('eiffel', { groundAt: () => -600, colliders: { name: 'room-grid' } });
  return lv;
};

test('createLevels_StartsOnTheSurface', () => {
  const lv = make(); assert.equal(lv.id, 'surface'); assert.ok(lv.isSurface()); assert.equal(lv.groundAt(10, 0, 0), 101); assert.equal(lv.colliders.name, 'surface-grid');
});

test('set_SwitchesGroundAndCollidersAndReportsWhetherItChanged', () => {
  const lv = make();
  assert.equal(lv.set('eiffel'), true); assert.equal(lv.id, 'eiffel'); assert.ok(!lv.isSurface());
  assert.equal(lv.groundAt(10, 0, 0), -600); assert.equal(lv.colliders.name, 'room-grid');
  assert.equal(lv.set('eiffel'), false, 'already there');
});

test('set_AnUnknownLevel_Throws', () => { assert.throws(() => make().set('atomium'), /atomium/); });

test('onJump_ResetsToTheSurface_onReset_KeepsTheLevel', () => {
  const lv = make(); lv.set('eiffel');
  assert.equal(lv.onReset(), false); assert.equal(lv.id, 'eiffel', 'R below stays below');
  assert.equal(lv.onJump(), true); assert.equal(lv.id, 'surface');
  assert.equal(lv.onJump(), false, 'a jump on the surface changes nothing');
});

test('onChange_FiresWithTheNewAndTheOldLevelAfterTheSwitch', () => {
  const lv = make(), seen = []; lv.onChange((id, from) => seen.push([id, from, lv.id]));
  lv.set('eiffel'); lv.set('eiffel'); lv.onJump();
  assert.deepEqual(seen, [['eiffel', 'surface', 'eiffel'], ['surface', 'eiffel', 'surface']]);
});

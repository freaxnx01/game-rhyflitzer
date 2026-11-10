// #477: the EG slabs (porch + hall) lie within centimetres of the terrain (the EG is the terrain at the door), so their drawn top must win
// the depth test against the grass. node --test tests/stairhall_ground.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stairHall, groundSlabs, GROUND_DEPTH_OFFSET } from '../stairhall.js';

const EG = 312.4, FLOORS = { pitch: 2.53, floors: Array.from({ length: 10 }, (_, k) => EG + k * 2.53), roof: EG + 25.3 + 0.5, housingTop: EG + 25.3 + 0.5 + 2.6 };
const hall = () => stairHall({ x: 2100, z: -380, th: 0.7, w: 1.0 }, { w: 2.3, d: 2.9 }, FLOORS, EG);

test('groundSlabs_Hall_AreThePorchHallAndLiftThresholdSlabsAtTheEgLevel', () => {
  const h = hall(), g = groundSlabs(h);
  assert.equal(g.length, 3);
  assert.ok(g.every(s => s.y === h.levels[0]));
});

test('groundSlabs_Hall_ExcludeTheLandingsAndHalfLandings', () => {
  const h = hall();
  assert.ok(h.walk.slabs.length > 3);
  assert.ok(groundSlabs(h).every(s => h.walk.slabs.includes(s)));
  assert.ok(groundSlabs(h).length < h.walk.slabs.length);
});

test('GROUND_DEPTH_OFFSET_PullsTheSlabTowardsTheCamera', () => {
  assert.ok(GROUND_DEPTH_OFFSET < 0);
});

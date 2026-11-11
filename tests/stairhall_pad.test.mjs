// #477: the terrain under the porch and hall footprint is lowered below the EG slab (patch cells, like the cuts); the entrance's own
// ground is kept, since the EG is defined as the terrain at the door. node --test tests/stairhall_pad.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAIRHALL, TERRAIN_PAD, terrainPads, padFloorAt, padBounds, hallFrame } from '../stairhall.js';

const EG = 312.4, ENTRANCE = { x: 2100, z: -380, th: 0.7, w: 1.0 }, PORCH = { w: 2.3, d: 2.9 };
const pads = terrainPads(ENTRANCE, PORCH, EG), f = hallFrame(ENTRANCE, PORCH.d);
const world = (a, b) => f.toWorld(a, b);

test('padFloorAt_InsideTheHall_IsBelowTheSlab', () => {
  const [x, z] = world(2.5, 0.5);
  assert.ok(padFloorAt(pads, x, z) <= EG - TERRAIN_PAD.sink + 1e-9);
});

test('padFloorAt_InsideThePorchBehindTheKeptStrip_IsBelowTheSlab', () => {
  const [x, z] = world(-0.5, 0);
  assert.ok(padFloorAt(pads, x, z) <= EG - TERRAIN_PAD.sink + 1e-9);
});

test('padFloorAt_InFrontOfTheEntrance_IsNull', () => {
  for (const d of [1.5, 3]) { const [x, z] = [ENTRANCE.x - Math.cos(ENTRANCE.th) * d, ENTRANCE.z - Math.sin(ENTRANCE.th) * d]; assert.equal(padFloorAt(pads, x, z), null, `${d} m out`); }
});

test('padFloorAt_JustBehindTheEntrance_OnlyClampsTheGroundToTheEgSoItMeetsTheStreet', () => {
  const [x, z] = world(-PORCH.d + 0.5, 0.3);
  const floor = padFloorAt(pads, x, z); assert.ok(floor <= EG - TERRAIN_PAD.edge + 1e-9 && floor > EG - 0.1, String(floor));
});

test('padFloorAt_FarOutside_IsNull', () => {
  const [x, z] = world(30, 30); assert.equal(padFloorAt(pads, x, z), null);
});

test('padBounds_ContainTheWholeHallFootprint', () => {
  const [x0, z0, x1, z1] = padBounds(pads);
  for (const [a, b] of [[0, STAIRHALL.b0], [STAIRHALL.depth, STAIRHALL.b1], [0, STAIRHALL.b1], [STAIRHALL.depth, STAIRHALL.b0]]) {
    const [x, z] = world(a, b); assert.ok(x >= x0 && x <= x1 && z >= z0 && z <= z1, `${a},${b}`);
  }
});

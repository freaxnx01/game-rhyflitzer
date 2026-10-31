import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { BODENACKER6, isBodenacker6, bodenackerFrame, simplifyRing, bodenackerPlinth, bodenackerDoorway } from '../bodenacker6.js';

const RECT = [2039.57, -366.12, 60.9, 22.08, -1.7023];   // data/world_hochrhein.json, OSM w171822634 (© OpenStreetMap contributors, ODbL)
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('BODENACKER6_Constants_TenStoreysFourHousesAndTheOsmId', () => {
  assert.equal(BODENACKER6.id, 171822634);
  assert.equal(BODENACKER6.storeys, 10);
  assert.deepEqual(BODENACKER6.houses, ['6a', '6b', '6c', '6d']);
});

test('isBodenacker6_ByOsmId_TrueOnlyForTheBlock', () => {
  assert.equal(isBodenacker6({ id: 171822634, addr: '6a–6d' }), true);
  assert.equal(isBodenacker6({ id: 171822635, addr: '1a–1d' }), false);   // the twin block keeps the generic model
});

test('bodenackerFrame_RoundTrip_LocalToWorldAndBack', () => {
  const f = bodenackerFrame(RECT);
  const [x, z] = f.toWorld(19.1, 11.0), [u, v] = f.toLocal(x, z);
  assert.ok(near(u, 19.1, 1e-9) && near(v, 11.0, 1e-9));
  assert.deepEqual(f.toWorld(0, 0).map(n => +n.toFixed(2)), [2039.57, -366.12]);
});

test('bodenackerFrame_PlusVHeading_PointsEastTowardsTheStreet', () => {
  const f = bodenackerFrame(RECT);
  assert.ok(Math.cos(f.outTh) > 0.95, 'out of the house = east');
  assert.ok(near(Math.cos(f.inTh), -Math.cos(f.outTh), 1e-9) && near(Math.sin(f.inTh), -Math.sin(f.outTh), 1e-9));
});

test('simplifyRing_CollinearSplit_DropsTheMiddleVertex', () => {
  assert.deepEqual(simplifyRing([[0, 0], [5, 0], [10, 0], [10, 4], [0, 4]]), [[0, 0], [10, 0], [10, 4], [0, 4]]);
});

test('simplifyRing_RealCorner_Kept', () => {
  assert.deepEqual(simplifyRing([[0, 0], [10, 0], [10, 4], [0, 4]]), [[0, 0], [10, 0], [10, 4], [0, 4]]);
});

import { bodenackerPorches, bodenackerBody } from '../bodenacker6.js';

// a 40 x 12 block with two 2.4 x 3 bumps on the +v side; the second bump's top is split by a collinear vertex like OSM does
const TWO_BUMPS = [[-20, -6], [20, -6], [20, 6], [12, 6], [12, 9], [9.6, 9], [9.6, 6], [-8, 6], [-8, 9], [-9, 9], [-10.4, 9], [-10.4, 6], [-20, 6]];
const IDENTITY = { toLocal: (x, z) => [x, z], toWorld: (u, v) => [u, v], inTh: Math.PI, outTh: 0 };

test('bodenackerPorches_SyntheticTwoBumps_FindsBothWithSizesAndEntrance', () => {
  const cfg = { ...BODENACKER6, houses: ['x', 'y'] };
  const p = bodenackerPorches(TWO_BUMPS, IDENTITY, cfg);
  assert.deepEqual(p.map(({ u, v0, v1, w, d, h }) => ({ u, v0, v1, w, d, h })),
    [{ u: -9.2, v0: 6, v1: 9, w: 2.4, d: 3, h: 3 }, { u: 10.8, v0: 6, v1: 9, w: 2.4, d: 3, h: 3 }]);
  assert.deepEqual(p[1].entrance, { x: 10.8, z: 9, th: Math.PI, w: 1.0 });       // on the street face (+v), walking in = -v
  assert.deepEqual(p.map(x => x.house), ['x', 'y']);                              // #455: south (smallest u) is the first house
});

test('bodenackerPorches_WrongCount_Throws', () => {
  assert.throws(() => bodenackerPorches(TWO_BUMPS, IDENTITY), /expected 4 porches, found 2/);
});

test('bodenackerBody_SyntheticTwoBumps_RingWithoutTheBumps', () => {
  const cfg = { ...BODENACKER6, houses: ['x', 'y'] };
  const porches = bodenackerPorches(TWO_BUMPS, IDENTITY, cfg);
  assert.deepEqual(bodenackerBody(TWO_BUMPS, IDENTITY, porches), [[-20, -6], [20, -6], [20, 6], [-20, 6]]);
});

const WORLD = new URL('../data/world_hochrhein.json', import.meta.url);
const block = () => existsSync(WORLD) ? JSON.parse(readFileSync(WORLD, 'utf8')).buildings.find(b => b.id === BODENACKER6.id) : null;

test('bodenackerPorches_RealRing_FourPorchesSouthToNorth', { skip: !block() && 'run pipeline/osm.py build first' }, () => {
  const b = block(), f = bodenackerFrame(b.rect), p = bodenackerPorches(b.ring, f);
  assert.deepEqual(p.map(x => x.house), ['6a', '6b', '6c', '6d']);            // sorted by u ascending; 6d at the north end (largest u), as OSM's address points (#455)
  const us = p.map(x => x.u);
  [-23.2, -10.6, 4.3, 19.1].forEach((u, i) => assert.ok(Math.abs(us[i] - u) < 0.3, `porch ${i} at u ${us[i]}`));
  for (const x of p) { assert.ok(x.w > 2 && x.w < 3, `width ${x.w}`); assert.ok(x.d > 2.4 && x.d < 3.5, `depth ${x.d}`); }
  for (const x of p) { const [, v] = f.toLocal(x.entrance.x, x.entrance.z); assert.ok(near(v, x.v1, 1e-6), 'entrance on the tip face'); assert.ok(near(x.entrance.th, f.inTh)); }
});

test('bodenackerBody_RealRing_NoVertexBeyondTheFacadeLineAndFewerVertices', { skip: !block() && 'run pipeline/osm.py build first' }, () => {
  const b = block(), f = bodenackerFrame(b.rect), p = bodenackerPorches(b.ring, f), body = bodenackerBody(b.ring, f, p);
  const simple = simplifyRing(b.ring.map(([x, z]) => f.toLocal(x, z))), facadeMax = Math.max(...p.map(x => x.v0));
  assert.ok(body.length < simple.length, `body ${body.length} vs ${simple.length}`);
  assert.ok(body.every(([, v]) => v <= facadeMax + 0.5), 'no porch bump left in the body ring');
});

import { bodenackerStairs, bodenackerWalls, bodenackerFloors, bodenackerLayout, bodenackerHouse } from '../bodenacker6.js';

test('bodenackerStairs_OnePorch_BehindTheFacadeLineWithTheSamePlanSize', () => {
  const [s] = bodenackerStairs([{ house: '6c', u: 4.3, v0: 3.8, v1: 7.0, w: 2.4, d: 3.2 }]);
  assert.deepEqual(s, { house: '6c', u: 4.3, w: 2.4, d: 3.0, vFront: 3.8, vBack: 3.8 - 3.0 });
});

test('bodenackerWalls_Rectangle_BackStreetAndEnds', () => {
  const faces = bodenackerWalls([[-20, -6], [20, -6], [20, 6], [-20, 6]], IDENTITY).map(w => w.face).sort();
  assert.deepEqual(faces, ['back', 'end', 'end', 'street']);
});

const STREET_V = { ...IDENTITY, outTh: Math.PI / 2, inTh: -Math.PI / 2 };   // the real frame's heading: out of the house = +v

test('bodenackerDoorway_Rectangle_StreetWallCutAroundThePorchAxisWithTheLintelOverTheGap', () => {
  const walls = bodenackerWalls([[-20, -6], [20, -6], [20, 6], [-20, 6]], STREET_V), street = walls.find(w => w.face === 'street');
  const d = bodenackerDoorway(walls, STREET_V, { house: 'x', u: 5, v0: 6 }, 1.2);
  assert.equal(d.walls.length, walls.length + 1);
  const pieces = d.walls.filter(w => w.face === 'street'), us = [...pieces, d.lintel].flatMap(w => [w.a[0], w.b[0]]).map(u => +u.toFixed(6));
  assert.deepEqual(us.sort((a, b) => a - b), [-20, 4.4, 4.4, 5.6, 5.6, 20]);
  assert.ok([...pieces, d.lintel].every(w => w.a[1] === 6 && w.b[1] === 6), 'all on the façade line');
  const along = (p) => Math.hypot(p[0] - street.a[0], p[1] - street.a[1]);
  for (const w of [...pieces, d.lintel]) assert.ok(near(w.u0, Math.min(along(w.a), along(w.b)), 1e-9), 'u0 = start along the uncut wall');
});

test('bodenackerDoorway_NoStreetWallBehindThePorch_Throws', () => {
  const walls = bodenackerWalls([[-20, -6], [20, -6], [20, 6], [-20, 6]], STREET_V);
  assert.throws(() => bodenackerDoorway(walls, STREET_V, { house: 'x', u: 30, v0: 6 }, 1.2), /no street wall behind porch x/);
});

test('bodenackerFloors_TenStoreys_PitchIsHOverTen', () => {
  const f = bodenackerFloors(300, 25.3);
  assert.ok(near(f.pitch, 2.53));
  assert.equal(f.floors.length, 10);
  assert.equal(f.floors[0], 300);
  assert.ok(near(f.floors[9], 300 + 9 * 2.53));
  assert.ok(near(f.roof, 325.8) && near(f.housingTop, 328.4));
});

test('bodenackerLayout_RealBlock_FourPorchesStairsAndBackWalls', { skip: !block() && 'run pipeline/osm.py build first' }, () => {
  const b = block(), L = bodenackerLayout(b, 300, b.h);
  assert.equal(L.porches.length, 4); assert.equal(L.stairs.length, 4);
  for (const p of L.porches) { const [, v] = L.frame.toLocal(p.entrance.x, p.entrance.z); assert.ok(v >= p.v1 - 1e-6, `entrance v ${v}`); assert.ok(near(p.entrance.th, L.frame.inTh)); }
  assert.ok(L.walls.some(w => w.face === 'back') && L.walls.some(w => w.face === 'street') && L.walls.some(w => w.face === 'end'));
  assert.equal(L.ring, b.ring);
});

test('bodenackerHouse_6c_IsTheSecondEntranceFromTheNorth', { skip: !block() && 'run pipeline/osm.py build first' }, () => {
  const L = bodenackerLayout(block(), 300, 25.3), h = bodenackerHouse(L, '6c');
  assert.equal(h.porch.house, '6c'); assert.equal(h.stair.house, '6c'); assert.equal(h.porch.u, h.stair.u);
  assert.ok(Math.abs(h.porch.u - 4.3) < 0.3);                                     // houseOrder 'southToNorth' (#455)
  assert.ok(bodenackerHouse(L, '6d').porch.u > h.porch.u && bodenackerHouse(L, '6a').porch.u < h.porch.u);
});

test('bodenackerDoorway_RealBlock_6cDoorwayOnItsFacadeLine', { skip: !block() && 'run pipeline/osm.py build first' }, () => {
  const L = bodenackerLayout(block(), 300, 25.3), p = bodenackerHouse(L, '6c').porch, d = bodenackerDoorway(L.walls, L.frame, p, 1.2);
  const [ua, va] = L.frame.toLocal(...d.lintel.a), [ub, vb] = L.frame.toLocal(...d.lintel.b);
  assert.ok(near(Math.abs(ub - ua), 1.2, 1e-6) && near((ua + ub) / 2, p.u, 1e-6), 'the gap is 1.2 m on the porch axis');
  assert.ok(Math.abs((va + vb) / 2 - p.v0) < 0.5, 'on the façade line behind the porch');
});

test('bodenackerHouse_UnknownHouse_Throws', () => {
  assert.throws(() => bodenackerHouse({ porches: [], stairs: [] }, '6e'), /unknown house 6e/);
});
// #445: the block stands on the terrain at its door (street side); a foundation skirt reaches from there down the slope.
// The same rule seats each porch: on the block's level, with its own skirt where its ground lies lower, or on its own higher ground.
test('bodenackerPlinth_GroundBelowTheStand_FloorAtTheStandAndASkirtDownToTheGround', () => {
  assert.deepEqual(bodenackerPlinth(10.54, 7.15), { floor: 10.54, skirt: { y0: 7.15 - 0.3, y1: 10.54 } });
});

test('bodenackerPlinth_GroundAboveTheStand_FloorOnTheGroundWithoutASkirt', () => {
  assert.deepEqual(bodenackerPlinth(10.54, 11.32), { floor: 11.32, skirt: null });
});

test('bodenackerPlinth_GroundAtTheStand_NoSkirt', () => {
  assert.deepEqual(bodenackerPlinth(10.54, 10.53), { floor: 10.54, skirt: null });
});

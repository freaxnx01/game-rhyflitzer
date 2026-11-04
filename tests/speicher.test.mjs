// #666: the Speicherstadt block -- pure. node --test tests/speicher.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPEICHER, warehouseParts } from '../speicher.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''}: ${a} vs ${b}`);

test('SPEICHER_IsLifeSize_BlocksAre30mLong_AlleysAre10m_TheFleetIs120By12', () => {
  const B = SPEICHER.block, F = SPEICHER.fleet;
  assert.equal(SPEICHER.key, 'speicher'); near(SPEICHER.h, B.ridge, 1e-9);
  near(F.len, 120, 1e-9); near(F.hw * 2, 12, 1e-9);
  assert.deepEqual(B.at, [-40, 0, 40]);
  for (let i = 1; i < B.at.length; i++) near(B.at[i] - B.at[i - 1] - B.len, 10, 1e-9, 'alley');
  for (const x of SPEICHER.bridge.at) assert.ok(B.at.some((a, i) => i < 2 && x > a + B.len / 2 && x < B.at[i + 1] - B.len / 2), 'each bridge sits in an alley');
  assert.ok(B.front > SPEICHER.quay.b + SPEICHER.quay.hw, 'the warehouse fronts stand clear of the quay lane');
  assert.ok(SPEICHER.fleet.hw + SPEICHER.fleet.kerb.hd < SPEICHER.quay.b - SPEICHER.quay.hw, 'the kerb stands clear of the quay lane');
});

test('warehouseParts_SixBlocksOfEightParts_RoofsEndAtTheRidge_NothingAboveIt', () => {
  const parts = warehouseParts(SPEICHER), B = SPEICHER.block, C = SPEICHER.colours;
  assert.equal(parts.length, 48);
  for (const p of parts) { assert.ok(['box', 'prism'].includes(p.kind)); assert.ok(p.w > 0 && p.d > 0 && p.y1 > p.y0, `${p.kind} size`); assert.equal(typeof p.colour, 'number'); }
  near(Math.max(...parts.map(p => p.y1)), SPEICHER.h, 1e-9, 'the ridge is the top');
  const bodies = parts.filter(p => p.kind === 'box' && p.colour === C.brick), roofs = parts.filter(p => p.kind === 'prism');
  assert.equal(bodies.length, 6); assert.equal(roofs.length, 6);
  for (const p of bodies) { near(p.y0, 0, 1e-9); near(p.y1, B.eaves, 1e-9); near(p.w, B.len, 1e-9); near(p.d, B.depth, 1e-9); }
  for (const p of roofs) { near(p.y0, B.eaves, 1e-9); near(p.y1, B.ridge, 1e-9); assert.equal(p.colour, C.roof); }
  assert.equal(parts.filter(p => p.colour === C.window).length, 6 * B.bands);
  assert.equal(parts.filter(p => p.colour === C.trim).length, 6);
});

test('warehouseParts_ThreeBlocksPerBank_NothingInTheCanalOrTheQuayLanes', () => {
  const parts = warehouseParts(SPEICHER), B = SPEICHER.block;
  for (const side of [-1, 1]) assert.deepEqual(parts.filter(p => p.kind === 'prism' && Math.sign(p.z) === side).map(p => p.x).sort((a, b) => a - b), B.at);
  for (const p of parts) assert.ok(Math.abs(p.z) - p.d / 2 >= SPEICHER.quay.b + SPEICHER.quay.hw - 1e-9, `${p.kind} at z ${p.z} reaches into the quay lane`);
});

import { speicherPlacement } from '../speicher.js';
import { roomLayout, ROOM_Y } from '../rooms.js';

const R5 = roomLayout(5), CAR_R = 2.6;
const inside = (o, x, z, r = 0) => { const dx = x - o.x, dz = z - o.z, lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c; return Math.abs(lx) <= o.hw + r && Math.abs(lz) <= o.hd + r; };
const toWorld = (R, a, b) => [R.centre[0] + R.frame.f[0] * a + R.frame.v[0] * b, R.centre[1] + R.frame.f[1] * a + R.frame.v[1] * b];
const toLocal = (R, x, z) => { const dx = x - R.centre[0], dz = z - R.centre[1]; return [dx * R.frame.f[0] + dz * R.frame.f[1], dx * R.frame.v[0] + dz * R.frame.v[1]]; };
const S = speicherPlacement({ centre: R5.centre, frame: R5.frame, portal: R5.portal, y: ROOM_Y }, SPEICHER);
const by = (k) => S.colliders.filter(c => c.speicher === k);
const free = (x, z) => !S.colliders.some(c => inside(c, x, z, CAR_R));

test('speicherPlacement_EighteenLowColliders_WarehousesKerbsAndParapets_SolidToTheirTops', () => {
  assert.equal(S.colliders.length, 18); for (const c of S.colliders) { assert.equal(c.low, true); assert.ok(c.h > ROOM_Y); }
  assert.equal(by('warehouse').length, 6); assert.equal(by('kerb').length, 8); assert.equal(by('rail').length, 4);
  for (const w of by('warehouse')) { near(w.h, ROOM_Y + SPEICHER.block.ridge + 2, 1e-9); const [a, b] = toLocal(R5, w.x, w.z); assert.ok(SPEICHER.block.at.some(x => Math.abs(x - a) < 1e-6)); near(Math.abs(b), SPEICHER.block.front + SPEICHER.block.depth / 2, 1e-6); }
  for (const k of by('kerb')) near(k.h, ROOM_Y + SPEICHER.fleet.kerb.h, 1e-9);
});

test('speicherPlacement_TheKerbsLeaveA_GapAtEachBridge_AndTheCarCrossesOnTheDeck_NotInTheWater', () => {
  for (const x of SPEICHER.bridge.at) {
    for (const b of [-11, -4, 0, 4, 11]) assert.ok(free(...toWorld(R5, x, b)), `deck free at ${x},${b}`);
    for (const dx of [-5, 5]) assert.ok(!free(...toWorld(R5, x + dx, 0)), `parapet solid at ${x + dx}`);
  }
  for (const a of [-50, 0, 50]) { assert.ok(!free(...toWorld(R5, a, 6)), `kerb solid at ${a}`); assert.ok(!free(...toWorld(R5, a, -6)), `kerb solid at ${a}`); }
  assert.ok(!free(...toWorld(R5, 60.5, 0)), 'the east end cap'); assert.ok(!free(...toWorld(R5, -60.5, 0)), 'the west end cap');
});

test('speicherPlacement_QuayAlleysAndTheLoopAreFree_WarehousesAreSolid', () => {
  for (const [a, b] of [[-50, 11], [0, 11], [50, -11], [-66, 0], [66, 5], [20, 25], [-20, -25], [95, 0], [0, 95]]) assert.ok(free(...toWorld(R5, a, b)), `free at ${a},${b}`);
  for (const [a, b] of [[0, 26], [-40, -26], [40, 26]]) assert.ok(!free(...toWorld(R5, a, b)), `warehouse at ${a},${b}`);
  for (const [x, z] of [...S.quay, ...S.connector]) assert.ok(free(x, z), 'the gravel paths are drivable');
  assert.equal(S.quay.length, 5); assert.deepEqual(S.quay[0], S.quay[4]);
  assert.deepEqual(toLocal(R5, ...S.connector[0]).map(Math.round), [-SPEICHER.loop, 0]); assert.deepEqual(toLocal(R5, ...S.connector[1]).map(Math.round), [-SPEICHER.quay.endA, 0]);
});

test('speicherPlacement_WaterAndBridgesStandOnTheirSpots', () => {
  assert.deepEqual([S.water.x, S.water.z], R5.centre); near(S.water.len, 120, 1e-9); near(S.water.wid, 12, 1e-9); near(S.water.y, ROOM_Y + SPEICHER.fleet.lift, 1e-9);
  assert.equal(S.bridges.length, 2); S.bridges.forEach((b, i) => { assert.deepEqual([b.x, b.z], toWorld(R5, SPEICHER.bridge.at[i], 0)); near(b.y, ROOM_Y + SPEICHER.bridge.lift, 1e-9); near(b.wid, 10, 1e-9); near(b.len, 16, 1e-9); });
});

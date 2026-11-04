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

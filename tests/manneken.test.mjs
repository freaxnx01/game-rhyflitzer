// #585: the Manneken Pis in his fountain corner beside the Atomium -- pure layout. node --test tests/manneken.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MANNEKEN, mannekenPlacement, jetArc } from '../manneken.js';
import { FRIES } from '../fries.js';
import { roomLayout, ROOM_Y, ROOM_HALF, ROOMS } from '../rooms.js';

const CAR_R = 2.6, R = roomLayout(1);
const inside = (o, x, z, r = 0) => { const dx = x - o.x, dz = z - o.z, lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c; return Math.abs(lx) <= o.hw + r && Math.abs(lz) <= o.hd + r; };
const toLocal = (x, z) => { const dx = x - R.centre[0], dz = z - R.centre[1]; return [dx * R.frame.f[0] + dz * R.frame.f[1], dx * R.frame.v[0] + dz * R.frame.v[1]]; };
const M = mannekenPlacement(R, MANNEKEN);
const reach = Math.hypot(2 * MANNEKEN.box.hw, 2 * MANNEKEN.box.hd) / 2;

test('MANNEKEN_LifeSizeOnAPedestalIn6mHighCorner', () => {
  assert.equal(MANNEKEN.figure.h, 0.61); assert.equal(MANNEKEN.pedestal.top, 1.9); assert.equal(MANNEKEN.walls.h, 6);
  assert.equal(MANNEKEN.url, './assets/models/manneken_pis.glb');
  assert.equal(MANNEKEN.key, 'manneken');
  assert.ok(MANNEKEN.pedestal.top + MANNEKEN.figure.h < MANNEKEN.niche.h, 'the boy fits under the arch');
  assert.ok(MANNEKEN.basin.water < MANNEKEN.basin.rim && MANNEKEN.basin.rim < MANNEKEN.pedestal.top, 'the water stands below the rim, the pedestal above it');
});

test('MANNEKEN_TheWholeCornerFitsInsideItsCollider', () => {
  const back = Math.SQRT1_2 * (MANNEKEN.walls.len + MANNEKEN.walls.t);   // the two walls splay back at a right angle from the chamfer's edges
  assert.ok(MANNEKEN.chamfer.hw + back <= MANNEKEN.box.hd, 'the wall tips stay inside the collider, across');
  assert.ok(MANNEKEN.chamfer.x - back >= -MANNEKEN.box.hw, 'and the wall backs, along');
  assert.ok(MANNEKEN.railing.r <= MANNEKEN.box.hw && MANNEKEN.basin.r <= MANNEKEN.box.hw, 'the railing and the basin too');
  assert.ok(MANNEKEN.chamfer.hw >= MANNEKEN.niche.w / 2, 'the niche fits in the chamfered front');
});

test('mannekenPlacement_NearTheFriesFigure_ClearOfIt', () => {
  const d = Math.hypot(M.x - R.figure.x, M.z - R.figure.z);
  assert.ok(d > 12 && d < 25, `${d.toFixed(1)} m from the fries`);
  assert.ok(d > reach + Math.hypot(FRIES.plinth.w, FRIES.plinth.d) / 2, 'the two never touch');
});

test('mannekenPlacement_BesideTheAtomium_ClearOfItsFeetAndSpheres_OffTheDriveLine', () => {
  const [a, b] = toLocal(M.x, M.z), d = Math.hypot(a, b);
  assert.ok(d > 50 + reach + 5 && d < 95 - 4 - reach - 5, `${d.toFixed(1)} m from the axis: outside the spheres and legs, inside the gravel loop`);
  for (const ft of R.feet) assert.ok(Math.hypot(ft.x - M.x, ft.z - M.z) > ft.hw * Math.SQRT2 + reach + 5, 'clear of every foot');
  assert.ok(Math.abs(b) > 20 + reach, 'off the drive line from the portal');
  assert.ok(a < 0, 'on the portal side of the Atomium, in view on arrival');
  assert.ok(Math.abs(a) < ROOM_HALF - 30 && Math.abs(b) < ROOM_HALF - 30, 'on the lawn, well inside the tree ring');
  assert.deepEqual([M.x, M.z], [R.centre[0] + R.frame.f[0] * MANNEKEN.at[0] + R.frame.v[0] * MANNEKEN.at[1], R.centre[1] + R.frame.f[1] * MANNEKEN.at[0] + R.frame.v[1] * MANNEKEN.at[1]]);
});

test('mannekenPlacement_FacesThePortal', () => {
  const want = Math.atan2(R.portal.c[1] - M.z, R.portal.c[0] - M.x);
  assert.ok(Math.abs(Math.atan2(Math.sin(M.th - want), Math.cos(M.th - want))) < 1e-9);
});

test('mannekenPlacement_OneBoxCollider_TheCarStopsAtTheRailingAndPasses8mInFront', () => {
  assert.equal(M.colliders.length, 1);
  const c = M.colliders[0];
  assert.equal(c.hw, 2.3); assert.equal(c.hd, 3.3); assert.equal(c.low, true);
  assert.equal(c.h, ROOM_Y + 6.3, 'solid over the walls');
  assert.ok(Math.abs(c.c - Math.cos(M.th)) < 1e-12 && Math.abs(c.s - Math.sin(M.th)) < 1e-12);
  assert.ok(inside(c, M.x + Math.cos(M.th) * MANNEKEN.railing.r, M.z + Math.sin(M.th) * MANNEKEN.railing.r, CAR_R), 'the car stops at the railing');
  assert.ok(!inside(c, M.x + Math.cos(M.th) * 8, M.z + Math.sin(M.th) * 8, CAR_R), 'and drives past 8 m in front of it');
});

test('jetArc_StartsAtTheBoy_EndsOnTheWaterInsideTheBasin', () => {
  const pts = jetArc(MANNEKEN), a = pts[0], b = pts.at(-1);
  assert.ok(pts.length > 8, 'enough points for a smooth tube');
  assert.ok(Math.abs(a.y - (MANNEKEN.pedestal.top + MANNEKEN.jet.from[1])) < 1e-9);
  assert.ok(Math.abs(b.y - MANNEKEN.basin.water) < 1e-6 && Math.hypot(b.x, b.z) < MANNEKEN.basin.r);
  assert.ok(Math.hypot(b.x, b.z) < MANNEKEN.basin.r - MANNEKEN.basin.wall, 'it lands on the water, not on the rim');
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i].x >= pts[i - 1].x, 'flows forward');
  assert.ok(Math.max(...pts.map(p => p.y)) > a.y, 'it arches before it falls');
});

test('roomLayout_OnlyTheAtomiumRoomHasTheCorner', () => {
  assert.equal(ROOMS[1].corner, MANNEKEN); assert.deepEqual(R.corner, M);
  assert.ok(R.colliders.includes(R.corner.colliders[0]), 'the corner is solid in the room');
  for (const [k, room] of ROOMS.entries()) if (k !== 1) assert.equal(roomLayout(k).corner, null);
});

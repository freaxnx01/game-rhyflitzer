// #451: the giant fries figure beside the Atomium -- pure layout. node --test tests/fries.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRIES, friesPlacement, fryBundle, bundleTop, coneRadiusAt } from '../fries.js';
import { roomLayout, ROOM_Y, ROOM_HALF, ROOMS } from '../rooms.js';
import { ATOMIUM } from '../hideout.js';

const CAR_R = 2.6, R = roomLayout(1);
const inside = (o, x, z, r = 0) => { const dx = x - o.x, dz = z - o.z, lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c; return Math.abs(lx) <= o.hw + r && Math.abs(lz) <= o.hd + r; };
const toLocal = (x, z) => { const dx = x - R.centre[0], dz = z - R.centre[1]; return [dx * R.frame.f[0] + dz * R.frame.f[1], dx * R.frame.v[0] + dz * R.frame.v[1]]; };
const F = friesPlacement(R, FRIES);

test('FRIES_StandsAbout20mOverItsPlinth_TheTallestFryReachesThatHeight', () => {
  assert.equal(FRIES.h, 20); assert.equal(FRIES.key, 'fries');
  const top = bundleTop(fryBundle(FRIES), FRIES);
  assert.ok(top <= FRIES.h + 1e-9 && top > FRIES.h - 1, `the fries end at ${top} m`);
  assert.ok(FRIES.cone.top < FRIES.h && FRIES.cone.tip > FRIES.plinth.h + FRIES.shoe.h, 'the cone hangs between the shoes and the fries');
});

test('coneRadiusAt_IsZeroAtTheTipAndTheFullRadiusAtTheTop', () => {
  assert.equal(coneRadiusAt(FRIES.cone.tip, FRIES.cone), 0);
  assert.ok(Math.abs(coneRadiusAt(FRIES.cone.top, FRIES.cone) - FRIES.cone.r) < 1e-9);
  assert.ok(Math.abs(coneRadiusAt((FRIES.cone.tip + FRIES.cone.top) / 2, FRIES.cone) - FRIES.cone.r / 2) < 1e-9);
});

test('fryBundle_IsDeterministic_ChunkyFriesOfVariedLengthAndTiltFromInsideTheConesTop', () => {
  const a = fryBundle(FRIES), b = fryBundle(FRIES);
  assert.deepEqual(a, b); assert.equal(a.length, FRIES.fries.n);
  const lens = new Set(), tilts = new Set(), quadrants = new Set();
  for (const f of a) {
    assert.ok(Math.hypot(f.x, f.z) <= FRIES.cone.r + FRIES.fries.spread + 1e-9, 'the base stands over the cone top, at most `spread` beyond the mouth');
    assert.ok(f.len >= FRIES.fries.lenMin - 1e-9 && f.len <= FRIES.fries.lenMax + 1e-9, `length ${f.len}`);
    assert.ok(f.tilt >= 0 && f.tilt <= FRIES.fries.tilt + 1e-9, `tilt ${f.tilt}`);
    assert.ok(f.shade >= 0.9 && f.shade <= 1.1, `shade ${f.shade}`);
    lens.add(f.len.toFixed(2)); tilts.add(f.tilt.toFixed(2)); quadrants.add((f.x < 0 ? 0 : 1) + (f.z < 0 ? 0 : 2));
  }
  assert.ok(lens.size > 8 && tilts.size > 8, 'varied, not a row of the same fry');
  assert.equal(quadrants.size, 4, 'the bundle fills the whole circle, not a fan');
  assert.ok(FRIES.fries.w >= FRIES.fries.lenMax / 5, 'chunky: the sticks are at least a fifth as wide as long');
  assert.ok(a.filter(f => Math.hypot(f.x, f.z) > FRIES.cone.r - FRIES.fries.w).length >= 8, 'a ring of fries stands at and beyond the mouth');
});

test('friesPlacement_BesideTheAtomium_ClearOfItsFeetAndSpheres_OffThePathsAndTheDriveLine', () => {
  const [a, b] = toLocal(F.x, F.z), d = Math.hypot(a, b), reach = Math.hypot(FRIES.plinth.w, FRIES.plinth.d) / 2;
  assert.ok(d > 50 + reach + 5 && d < 95 - 4 - reach - 5, `${d.toFixed(1)} m from the axis: outside the spheres and legs, inside the gravel loop`);
  for (const ft of R.feet) assert.ok(Math.hypot(ft.x - F.x, ft.z - F.z) > ft.hw * Math.SQRT2 + reach + 5, 'clear of every foot');
  assert.ok(Math.abs(b) > 20 + reach, 'off the drive line from the portal');
  assert.ok(a < 0, 'on the portal side of the Atomium, in view on arrival');
  assert.ok(Math.abs(a) < ROOM_HALF - 30 && Math.abs(b) < ROOM_HALF - 30, 'on the lawn, well inside the tree ring');
  assert.deepEqual([F.x, F.z], [R.centre[0] + R.frame.f[0] * FRIES.at[0] + R.frame.v[0] * FRIES.at[1], R.centre[1] + R.frame.f[1] * FRIES.at[0] + R.frame.v[1] * FRIES.at[1]]);
});

test('friesPlacement_FacesThePortal', () => {
  const want = Math.atan2(R.portal.c[1] - F.z, R.portal.c[0] - F.x);
  assert.ok(Math.abs(Math.atan2(Math.sin(F.th - want), Math.cos(F.th - want))) < 1e-9);
});

test('friesPlacement_OnePlinthCollider_SolidForTheCar_TheHelicopterFliesOver', () => {
  assert.equal(F.colliders.length, 1);
  const c = F.colliders[0];
  assert.equal(c.hw, FRIES.plinth.w / 2); assert.equal(c.hd, FRIES.plinth.d / 2); assert.equal(c.low, true);
  assert.ok(Math.abs(c.c - Math.cos(F.th)) < 1e-12 && Math.abs(c.s - Math.sin(F.th)) < 1e-12);
  assert.equal(c.h, ROOM_Y + FRIES.plinth.h + FRIES.h, 'solid to the fry tips, so the helicopter floor lifts over the whole figure');
  assert.ok(inside(c, F.x, F.z, CAR_R) && inside(c, F.x + Math.cos(F.th) * 2, F.z + Math.sin(F.th) * 2, CAR_R), 'the car stops at the plinth and the shoes');
  assert.ok(!inside(c, F.x + Math.cos(F.th) * 12, F.z + Math.sin(F.th) * 12, CAR_R), 'and drives past in front of it');
});

test('roomLayout_TheAtomiumRoomCarriesTheFigure_ItsColliderIsInTheRooms_OtherRoomsHaveNone', () => {
  assert.equal(ROOMS[1].figure, FRIES); assert.equal(ROOMS[1].object, ATOMIUM);
  assert.deepEqual(R.figure, F);
  assert.ok(R.colliders.includes(R.figure.colliders[0]));
  for (const [k, room] of ROOMS.entries()) if (k !== 1) { assert.equal(room.figure, undefined); assert.equal(roomLayout(k).figure, null); }
});

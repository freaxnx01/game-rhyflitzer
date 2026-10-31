// The helicopter in the Eiffel room -- pure permission and clamp. node --test tests/room-fly.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flyAllowed, roomFlyClamp, roomFlyAlt, roomFlyCeiling, ROOM_Y, ROOM_HALF, ROOM_FLY, roomLayout, eiffelRoom } from '../rooms.js';
import { stepHeli, heliFloor, heliStart } from '../heli.js';

const room = eiffelRoom(), [cx, cz] = room.centre;

test('flyAllowed_RoomLevel_AllowedExceptDuringTheRide', () => {
  assert.equal(flyAllowed('eiffel', 'room'), true);
  assert.equal(flyAllowed('eiffel', 'lift'), false);
});

test('flyAllowed_EveryRoomButNotTheRing', () => {
  assert.equal(flyAllowed('room4', 'room'), true); assert.equal(flyAllowed('ring', 'ring'), false); assert.equal(flyAllowed('ring', 'room'), false);
});

test('flyAllowed_SurfaceZones_OnlyUnderOpenSky', () => {
  assert.equal(flyAllowed('surface', 'open'), true);
  assert.equal(flyAllowed('surface', 'roofed'), false);   // tunnel and lift lobby
  assert.equal(flyAllowed('surface', 'lift'), false);
});

test('roomFlyClamp_InsideTheBox_Unchanged', () => {
  assert.deepEqual(roomFlyClamp(cx + 10, ROOM_Y + 100, cz - 20), { x: cx + 10, y: ROOM_Y + 100, z: cz - 20 });
});

test('roomFlyClamp_PushedOutward_StopsInsideTheTreeRing', () => {
  const { f, v } = room.frame;
  const r = roomFlyClamp(cx + f[0] * 9999 + v[0] * 9999, ROOM_Y + 50, cz + f[1] * 9999 + v[1] * 9999);
  const a = (r.x - cx) * f[0] + (r.z - cz) * f[1], b = (r.x - cx) * v[0] + (r.z - cz) * v[1];
  assert.ok(Math.abs(a - ROOM_FLY.wall) < 1e-6 && Math.abs(b - ROOM_FLY.wall) < 1e-6);
  assert.ok(ROOM_FLY.wall < ROOM_HALF - 12 - 5, 'a few metres inside the inner tree row');
});

test('roomFlyClamp_InARotatedRoom_ClampsInItsOwnFrame', () => {
  const R = roomLayout(3), f = R.frame.f, v = R.frame.v, far = roomFlyClamp(R.centre[0] + f[0] * 9999, ROOM_Y + 50, R.centre[1] + f[1] * 9999, R);
  const a = (far.x - R.centre[0]) * f[0] + (far.z - R.centre[1]) * f[1], b = (far.x - R.centre[0]) * v[0] + (far.z - R.centre[1]) * v[1];
  assert.ok(Math.abs(a - ROOM_FLY.wall) < 1e-6 && Math.abs(b) < 1e-6, `${a}, ${b}`);
});

test('roomFlyClamp_PushedUp_StopsAtTheCeilingAboveTheTower', () => {
  assert.equal(roomFlyClamp(cx, ROOM_Y + 5000, cz).y, ROOM_Y + 420);
  assert.ok(ROOM_FLY.ceiling > 330 + 40);
});

test('roomFlyClamp_BelowTheFloor_Untouched', () => {
  assert.equal(roomFlyClamp(cx, ROOM_Y + 3, cz).y, ROOM_Y + 3);   // the floor is stepHeli's job
});

test('roomFlyAlt_TargetBelowTheCeiling_NotPulledDownToTheLaggingHeight', () => {
  assert.equal(roomFlyAlt(ROOM_Y + 300), ROOM_Y + 300);
  assert.equal(roomFlyAlt(ROOM_Y + 9999), roomFlyCeiling());
});

test('roomHeli_HoldingSpace_ReachesTheTowerTopWithin20sAndStaysUnderTheCeiling', () => {
  let s = { x: cx, z: cz, y: ROOM_Y, th: 0, v: 0, alt: heliStart(cx, cz, ROOM_Y, 0, ROOM_Y).alt };
  const floor = heliFloor(ROOM_Y, [], cx, cz);
  let t = 0, reached = null;
  for (; t < 40 * 60; t++) {
    s = stepHeli(s, { fwd: 0, yaw: 0, lift: 1, nitro: 0 }, 1 / 60, ROOM_Y, floor);
    s = { ...s, alt: roomFlyAlt(s.alt), y: Math.min(s.y, roomFlyCeiling()) };
    if (reached === null && s.y > ROOM_Y + 330) reached = t / 60;
  }
  assert.ok(reached !== null && reached <= 20, `tower top reached after ${reached} s`);
  assert.ok(s.y > ROOM_Y + 395 && s.y <= ROOM_Y + 420 + 1e-9, `settles at stepHeli maxAgl (400 m), y=${s.y - ROOM_Y}`);
});

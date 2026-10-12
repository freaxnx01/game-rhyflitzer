// The helicopter in the Eiffel room -- pure permission and clamp. node --test prototype/tests/room-fly.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flyAllowed, roomFlyClamp, ROOM_Y, ROOM_HALF, ROOM_FLY } from '../room-eiffel.js';
import { eiffelRoom } from '../room-eiffel.js';

const room = eiffelRoom(), [cx, cz] = room.centre;

test('flyAllowed_RoomLevel_AllowedExceptDuringTheRide', () => {
  assert.equal(flyAllowed('eiffel', 'room'), true);
  assert.equal(flyAllowed('eiffel', 'lift'), false);
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
  const r = roomFlyClamp(cx + 9999, ROOM_Y + 50, cz - 9999);
  assert.equal(r.x, cx + ROOM_FLY.wall); assert.equal(r.z, cz - ROOM_FLY.wall);
  assert.ok(ROOM_FLY.wall < ROOM_HALF - 12 - 5, 'a few metres inside the inner tree row');
});

test('roomFlyClamp_PushedUp_StopsAtTheCeilingAboveTheTower', () => {
  assert.equal(roomFlyClamp(cx, ROOM_Y + 5000, cz).y, ROOM_Y + 420);
  assert.ok(ROOM_FLY.ceiling > 330 + 40);
});

test('roomFlyClamp_BelowTheFloor_Untouched', () => {
  assert.equal(roomFlyClamp(cx, ROOM_Y + 3, cz).y, ROOM_Y + 3);   // the floor is stepHeli's job
});

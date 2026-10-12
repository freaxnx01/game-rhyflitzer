// #277: the Eiffel room's layout -- pure. node --test prototype/tests/room-eiffel.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eiffelRoom, ROOM_Y, ROOM_HALF } from '../room-eiffel.js';
import { EIFFEL, LIFT, onLiftPlatform } from '../hideout.js';

const room = eiffelRoom(), CAR_R = 2.6;
const inside = (o, x, z, r = 0) => { const dx = x - o.x, dz = z - o.z, lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c; return Math.abs(lx) <= o.hw + r && Math.abs(lz) <= o.hd + r; };
const blocked = (x, z, r = CAR_R) => room.colliders.some(o => inside(o, x, z, r));
// flood fill of the cells a car of radius CAR_R can reach from the spawn, 4 m grid, 8 neighbours
const reach = (start, step = 4) => {
  const [cx, cz] = room.centre, n = Math.ceil((ROOM_HALF + 40) / step), key = (i, j) => i + ',' + j, seen = new Set(), todo = [[Math.round((start.x - cx) / step), Math.round((start.z - cz) / step)]];
  while (todo.length) { const [i, j] = todo.pop(), k = key(i, j); if (seen.has(k) || Math.abs(i) > n || Math.abs(j) > n || blocked(cx + i * step, cz + j * step)) continue; seen.add(k); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (a || b) todo.push([i + a, j + b]); }
  return { seen, cx, cz, step, n };
};

test('eiffelRoom_FloorIs600mDownAnd500mSquare', () => {
  assert.equal(room.y, -600); assert.equal(ROOM_Y, -600); assert.equal(ROOM_HALF, 250);
  assert.equal(room.groundAt(room.centre[0] + 12, room.centre[1] - 99, 0), -600);
});

test('eiffelRoom_TheCarKeepsItsXZ_LiftHouseIsOnTheLobbyPlatformAndTheTowerAheadOfIt', () => {
  assert.deepEqual([room.spawn.x, room.spawn.z], LIFT.c); assert.equal(room.spawn.th, LIFT.th);
  const d = Math.hypot(room.tower.x - room.spawn.x, room.tower.z - room.spawn.z); assert.ok(Math.abs(d - 215) < 1e-6, `${d}`);
  const along = (room.tower.x - room.spawn.x) * Math.cos(LIFT.th) + (room.tower.z - room.spawn.z) * Math.sin(LIFT.th); assert.ok(along > 214.9, 'straight ahead');
  assert.ok(onLiftPlatform(room.spawn.x, room.spawn.z));
  assert.ok(Math.abs(room.spawn.x - room.centre[0]) < ROOM_HALF - 30 && Math.abs(room.spawn.z - room.centre[1]) < ROOM_HALF - 10, 'inside the tree ring');
});

test('eiffelRoom_TowerIsCentredWithLegCollidersOnTheFeet', () => {
  assert.deepEqual([room.tower.x, room.tower.z], room.centre);
  assert.equal(room.feet.length, 4);
  EIFFEL.feet.forEach(([fx, fz], i) => { assert.equal(room.feet[i].x, room.tower.x + fx); assert.equal(room.feet[i].z, room.tower.z + fz); assert.equal(room.feet[i].hw, EIFFEL.footHw); assert.ok(blocked(room.feet[i].x, room.feet[i].z, 0)); });
});

test('eiffelRoom_SpaceUnderTheTowerIsDrivable', () => {
  for (const [x, z] of [[0, 0], [30, 0], [-30, 0], [0, 30], [0, -30], [30, 30], [-30, -30]]) assert.ok(!blocked(room.tower.x + x, room.tower.z + z), `blocked at ${x},${z}`);
  const r = reach(room.spawn);
  assert.ok(r.seen.has('0,0'), 'the cell under the tower is reachable from the lift house (cells are indexed from the tower)');
});

test('eiffelRoom_TreeRingIsClosed_TheCarCannotLeaveTheLawn', () => {
  const r = reach(room.spawn), limit = ROOM_HALF - 3;   // the ring's colliders are centred 3 m inside the edge
  for (const k of r.seen) { const [i, j] = k.split(',').map(Number); assert.ok(Math.abs(i * r.step) <= limit && Math.abs(j * r.step) <= limit, `leaked to ${i * r.step},${j * r.step}`); }
  assert.ok(r.seen.size > 4000, `most of the lawn is reachable (${r.seen.size} cells)`);
});

test('eiffelRoom_TreesStandInTwoClosedRowsWithoutGaps', () => {
  const [cx, cz] = room.centre, cheb = (t) => Math.max(Math.abs(t[0] - cx), Math.abs(t[1] - cz));
  assert.ok(room.trees.length > 600);
  for (const t of room.trees) { assert.ok(cheb(t) > ROOM_HALF - 16 && cheb(t) < ROOM_HALF - 2, `a tree at ${cheb(t)} from the centre`); assert.ok(t[2] >= 8 && t[2] <= 15); }
  // along one edge per axis, sorted, no gap wider than 7 m (crowns are 8+ m wide)
  for (const axis of [0, 1]) {
    const edge = room.trees.filter(t => Math.abs(t[1 - axis] - room.centre[1 - axis]) > ROOM_HALF - 9 && Math.abs(t[1 - axis] - room.centre[1 - axis]) < ROOM_HALF - 2 && t[1 - axis] > room.centre[1 - axis]).map(t => t[axis]).sort((a, b) => a - b);
    for (let i = 1; i < edge.length; i++) assert.ok(edge[i] - edge[i - 1] < 7, `gap ${edge[i] - edge[i - 1]} at ${edge[i]}`);
    assert.ok(edge[0] < room.centre[axis] - ROOM_HALF + 14 && edge[edge.length - 1] > room.centre[axis] + ROOM_HALF - 14, 'runs into the corners');
  }
});

test('eiffelRoom_LiftHouseKeepsItsFrontOpen_PathsRunFromTheHouseToTheTowerAndAroundIt', () => {
  const fwd = [Math.cos(LIFT.th), Math.sin(LIFT.th)];
  assert.ok(!blocked(room.spawn.x + fwd[0] * 20, room.spawn.z + fwd[1] * 20), 'the way out of the house is free');
  assert.ok(blocked(room.spawn.x - fwd[0] * 17.5, room.spawn.z - fwd[1] * 17.5, 0), 'the back wall is solid');
  assert.equal(room.paths.length, 2);
  const [toTower, loop] = room.paths; assert.ok(Math.hypot(toTower.pts[0][0] - room.spawn.x, toTower.pts[0][1] - room.spawn.z) < 25, 'starts at the house');
  const end = toTower.pts[toTower.pts.length - 1]; assert.ok(Math.hypot(end[0] - room.tower.x, end[1] - room.tower.z) < 120, 'ends at the loop');
  assert.ok(loop.pts.length >= 24 && Math.hypot(loop.pts[0][0] - loop.pts[loop.pts.length - 1][0], loop.pts[0][1] - loop.pts[loop.pts.length - 1][1]) < 1e-6, 'the loop is closed');
});

test('eiffelRoom_TowerViewLooksAtTheTowerFromTheLawn', () => {
  const v = room.towerView, d = Math.hypot(room.tower.x - v.x, room.tower.z - v.z); assert.ok(d > 120 && d < 180, `${d}`);
  assert.ok(Math.abs(Math.atan2(room.tower.z - v.z, room.tower.x - v.x) - v.th) < 0.02, 'facing the tower'); assert.ok(!blocked(v.x, v.z));
});

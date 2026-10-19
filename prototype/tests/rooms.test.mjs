// #277 / #361: the room template -- pure. node --test prototype/tests/rooms.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomLayout, eiffelRoom, ROOMS, ROOM_Y, ROOM_HALF, isRoomLevel } from '../rooms.js';
import { EIFFEL, ATOMIUM } from '../hideout.js';
import { SPOKE, spokeFrame, spokeSigns } from '../underground.js';

const CAR_R = 2.6, rooms = ROOMS.map((_, k) => roomLayout(k)), room = rooms[0];
const inside = (o, x, z, r = 0) => { const dx = x - o.x, dz = z - o.z, lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c; return Math.abs(lx) <= o.hw + r && Math.abs(lz) <= o.hd + r; };
const blocked = (R, x, z, r = CAR_R) => R.colliders.some(o => inside(o, x, z, r));
const toWorld = (R, a, b) => [R.centre[0] + R.frame.f[0] * a + R.frame.v[0] * b, R.centre[1] + R.frame.f[1] * a + R.frame.v[1] * b];   // a: towards the far edge, b: across
const toLocal = (R, x, z) => { const dx = x - R.centre[0], dz = z - R.centre[1]; return [dx * R.frame.f[0] + dz * R.frame.f[1], dx * R.frame.v[0] + dz * R.frame.v[1]]; };
const reach = (R, step = 4) => {   // flood fill in the room's frame from the spawn, 8 neighbours
  const n = Math.ceil((ROOM_HALF + 80) / step), seen = new Set(), [a0, b0] = toLocal(R, R.spawn.x, R.spawn.z), todo = [[Math.round(a0 / step), Math.round(b0 / step)]];
  while (todo.length) { const [i, j] = todo.pop(), k = i + ',' + j; if (seen.has(k) || Math.abs(i) > n || Math.abs(j) > n || blocked(R, ...toWorld(R, i * step, j * step))) continue; seen.add(k); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (a || b) todo.push([i + a, j + b]); }
  return { seen, step };
};

test('ROOMS_EightRooms_OnlyTheEiffelAndTheAtomiumHaveAnObject', () => {
  assert.equal(ROOMS.length, 8); assert.deepEqual(ROOMS.map(r => r.id), ['eiffel', 'atomium', 'room2', 'room3', 'room4', 'room5', 'room6', 'room7']);
  assert.equal(ROOMS[0].object, EIFFEL); assert.equal(ROOMS[0].name, 'La Tour Eiffel');
  assert.equal(ROOMS[1].object, ATOMIUM); assert.equal(ROOMS[1].name, 'Atomium');
  for (const r of ROOMS.slice(2)) { assert.equal(r.object, null); assert.equal(r.name, null); }
  assert.ok(isRoomLevel('eiffel') && isRoomLevel('atomium') && isRoomLevel('room7') && !isRoomLevel('ring') && !isRoomLevel('surface'));
});

test('spokeSigns_TheRealRooms_SignTheEiffelAndTheAtomiumOnly', () => {
  const signs = spokeSigns(ROOMS); assert.deepEqual(signs.map(s => [s.k, s.text]), [[0, 'La Tour Eiffel'], [1, 'Atomium']]);
});

test('roomLayout_FloorIs600mDown500mSquare_PortalAtTheSpokesEnd', () => {
  for (const [k, R] of rooms.entries()) {
    assert.equal(R.y, -600); assert.equal(ROOM_Y, -600); assert.equal(R.groundAt(R.centre[0] + 12, R.centre[1] - 99, 0), -600);
    const sp = spokeFrame(k); assert.ok(Math.hypot(R.portal.c[0] - sp.end[0], R.portal.c[1] - sp.end[1]) < 1e-6, `room ${k} portal`);
    const [a, b] = toLocal(R, ...R.portal.c); assert.ok(Math.abs(a + ROOM_HALF) < 1e-6 && Math.abs(b) < 1e-6, 'the portal is in the middle of the near edge');
    assert.ok(Math.abs(R.frame.f[0] - sp.u[0]) < 1e-9 && Math.abs(R.frame.f[1] - sp.u[1]) < 1e-9, 'the room faces along its spoke');
  }
});

test('roomLayout_TheEiffelTowerIsCentredWithLegCollidersOnTheFeet_EmptyRoomsHaveNone', () => {
  assert.deepEqual([room.tower.x, room.tower.z], room.centre); assert.equal(room.feet.length, 4);
  EIFFEL.feet.forEach(([fx, fz], i) => { assert.equal(room.feet[i].x, room.tower.x + fx); assert.equal(room.feet[i].z, room.tower.z + fz); assert.equal(room.feet[i].hw, EIFFEL.footHw); assert.ok(blocked(room, room.feet[i].x, room.feet[i].z, 0)); });
  for (const R of rooms.slice(2)) { assert.equal(R.tower, null); assert.deepEqual(R.feet, []); assert.equal(R.towerView, null); assert.ok(!blocked(R, ...R.centre)); }
});

test('roomLayout_SpaceUnderTheTowerIsDrivable_AndReachableFromThePortal', () => {
  for (const [x, z] of [[0, 0], [30, 0], [-30, 0], [0, 30], [0, -30], [30, 30], [-30, -30]]) assert.ok(!blocked(room, room.tower.x + x, room.tower.z + z), `blocked at ${x},${z}`);
  assert.ok(reach(room).seen.has('0,0'));
});

test('roomLayout_TheTreeRingIsClosed_TheOnlyWayOutIsThePortalTunnel', () => {
  for (const R of [rooms[0], rooms[3]]) {
    const r = reach(R), lim = ROOM_HALF - 3;
    for (const k of r.seen) {
      const [i, j] = k.split(',').map(Number), a = i * r.step, b = j * r.step;
      const inTunnel = a < -lim && Math.abs(b) <= SPOKE.hw && a >= -ROOM_HALF - (SPOKE.len - SPOKE.roomStart);
      assert.ok((Math.abs(a) <= lim && Math.abs(b) <= lim) || inTunnel, `room ${R.k} leaked to ${a},${b}`);
    }
    assert.ok(r.seen.size > 4000, `room ${R.k}: ${r.seen.size} cells`);
    assert.ok([...r.seen].some(k => Number(k.split(',')[0]) * r.step < -ROOM_HALF - 30), 'the portal tunnel is drivable');
  }
});

test('roomLayout_TreesStandInTwoClosedRows_WithAGapOnlyAtThePortal', () => {
  for (const R of [rooms[0], rooms[5]]) {
    const local = R.trees.map(t => [...toLocal(R, t[0], t[1]), t[2]]), cheb = ([a, b]) => Math.max(Math.abs(a), Math.abs(b));
    assert.ok(R.trees.length > 600); for (const t of local) { assert.ok(cheb(t) > ROOM_HALF - 16 && cheb(t) < ROOM_HALF - 2); assert.ok(t[2] >= 8 && t[2] <= 15); }
    const edge = (sel, along) => local.filter(sel).map(along).sort((p, q) => p - q), gaps = (xs) => xs.slice(1).map((x, i) => [x - xs[i], x]);
    for (const [sel, along] of [[t => t[0] > ROOM_HALF - 9, t => t[1]], [t => t[1] > ROOM_HALF - 9, t => t[0]], [t => t[1] < -ROOM_HALF + 9, t => t[0]]]) for (const [g, at] of gaps(edge(sel, along))) assert.ok(g < 7, `gap ${g} at ${at}`);
    const near = gaps(edge(t => t[0] < -ROOM_HALF + 9, t => t[1])), wide = near.filter(([g]) => g >= 7);
    assert.equal(wide.length, 1, 'one gap on the near edge'); assert.ok(Math.abs(wide[0][1] - wide[0][0] / 2) < 4, 'centred on the portal'); assert.ok(wide[0][0] < 2 * (SPOKE.hw + 6) + 7);
  }
});

test('roomLayout_PathsRunFromThePortalToTheCentreAndAroundIt_SpawnFacesIn', () => {
  for (const R of [rooms[0], rooms[2]]) {
    assert.equal(R.paths.length, 2); const [toCentre, loop] = R.paths;
    assert.ok(Math.hypot(toCentre.pts[0][0] - R.portal.c[0], toCentre.pts[0][1] - R.portal.c[1]) < 25, 'starts at the portal');
    const end = toCentre.pts[toCentre.pts.length - 1]; assert.ok(Math.hypot(end[0] - R.centre[0], end[1] - R.centre[1]) < 120);
    assert.ok(loop.pts.length >= 24 && Math.hypot(loop.pts[0][0] - loop.pts[loop.pts.length - 1][0], loop.pts[0][1] - loop.pts[loop.pts.length - 1][1]) < 1e-6);
    const [a] = toLocal(R, R.spawn.x, R.spawn.z); assert.ok(a > -ROOM_HALF + 15 && a < -ROOM_HALF + 30, 'just inside the tree ring'); assert.ok(!blocked(R, R.spawn.x, R.spawn.z));
    assert.ok(Math.abs(Math.atan2(R.centre[1] - R.spawn.z, R.centre[0] - R.spawn.x) - R.spawn.th) < 1e-6, 'facing the centre');
  }
});

test('roomLayout_TowerViewLooksAtTheTowerFromTheLawn', () => {
  const v = room.towerView, d = Math.hypot(room.tower.x - v.x, room.tower.z - v.z); assert.ok(d > 120 && d < 180, `${d}`);
  assert.ok(Math.abs(Math.atan2(room.tower.z - v.z, room.tower.x - v.x) - v.th) < 0.02); assert.ok(!blocked(room, v.x, v.z));
});

test('roomLayout_CeilingOnlyInThePortalTunnel', () => {
  const R = rooms[1]; assert.equal(R.ceilingAt(...R.centre), null);
  const [x, z] = toWorld(R, -ROOM_HALF - 40, 0); assert.equal(R.ceilingAt(x, z), ROOM_Y + SPOKE.ceiling);
  assert.deepEqual(eiffelRoom().centre, room.centre);
});

const atomium = rooms[1];
test('roomLayout_TheAtomiumIsCentredWithColliderPerBipodFootAndOneForTheCentralColumn', () => {
  assert.deepEqual([atomium.tower.x, atomium.tower.z], atomium.centre); assert.equal(atomium.feet.length, 4);
  ATOMIUM.feet.forEach(([fx, fz, hw], i) => { const f = atomium.feet[i]; assert.equal(f.x, atomium.tower.x + fx); assert.equal(f.z, atomium.tower.z + fz); assert.equal(f.hw, hw); assert.equal(f.h, ROOM_Y + ATOMIUM.footH); assert.ok(blocked(atomium, f.x, f.z, 0)); });
  assert.deepEqual(ATOMIUM.feet[0].slice(0, 2), [0, 0], 'the first one is the central column on the axis');
  const legs = ATOMIUM.feet.slice(1).map(([x, z]) => Math.atan2(z, x) * 180 / Math.PI).sort((a, b) => a - b);
  assert.ok(Math.abs(legs[1] - legs[0] - 120) < 8 && Math.abs(legs[2] - legs[1] - 120) < 8, `the three bipods stand 120 degrees apart: ${legs}`);
  assert.ok(ATOMIUM.h > 95 && ATOMIUM.h < 110, 'life size, the real one is 102 m');
});

test('roomLayout_BetweenTheAtomiumsLegsIsDrivable_AndReachableFromThePortal', () => {
  for (const [x, z] of [[-30, 0], [30, 0], [0, 40], [0, -40], [-30, 40], [-30, -40], [50, 0]]) assert.ok(!blocked(atomium, atomium.tower.x + x, atomium.tower.z + z), `blocked at ${x},${z}`);
  const r = reach(atomium); assert.ok(r.seen.has('0,0') === false, 'the column is solid'); assert.ok(r.seen.size > 4000);
  assert.ok([...r.seen].some(k => { const [i, j] = k.split(',').map(Number); return Math.hypot(i * r.step, j * r.step) < 70; }), 'the car gets up to the legs');
});

test('roomLayout_TheAtomiumsTowerViewLooksAtItFromTheLawn', () => {
  const v = atomium.towerView, d = Math.hypot(atomium.tower.x - v.x, atomium.tower.z - v.z); assert.ok(d > 120 && d < 180, `${d}`);
  assert.ok(Math.abs(Math.atan2(atomium.tower.z - v.z, atomium.tower.x - v.x) - v.th) < 0.02); assert.ok(!blocked(atomium, v.x, v.z));
});

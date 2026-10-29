// #277 / #361: the room template -- pure. node --test prototype/tests/rooms.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomLayout, eiffelRoom, ROOMS, ROOM_Y, ROOM_HALF, isRoomLevel, NEXT_ROOMS, shipRing, shipBasin, rimColliders, WATER_LIFT, QUAY, RIM } from '../rooms.js';
import { EIFFEL, ATOMIUM, TITANIC, LIFT } from '../hideout.js';
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

test('ROOMS_EightRooms_EiffelAtomiumArtemisAndTitanicHaveAnObject', () => {
  assert.equal(ROOMS.length, 8); assert.deepEqual(ROOMS.map(r => r.id), ['eiffel', 'atomium', 'room2', 'room3', 'room4', 'room5', 'room6', 'room7']);
  assert.equal(ROOMS[0].object, EIFFEL); assert.equal(ROOMS[0].name, 'La Tour Eiffel');
  assert.equal(ROOMS[1].object, ATOMIUM); assert.equal(ROOMS[1].name, 'Atomium');
  assert.equal(ROOMS[2].object, ARTEMIS); assert.equal(ROOMS[2].name, 'Artemis II'); assert.equal(ROOMS[2].signed, false);
  assert.equal(ROOMS[7].object, TITANIC); assert.equal(ROOMS[7].name, 'Titanic'); assert.equal(ROOMS[7].signed, false);
  for (const r of ROOMS.slice(3, 7)) { assert.equal(r.object, null); assert.equal(r.name, null); }
  assert.ok(isRoomLevel('eiffel') && isRoomLevel('atomium') && isRoomLevel('room7') && !isRoomLevel('ring') && !isRoomLevel('surface'));
});

test('NEXT_ROOMS_NewObjectsFillFromTheLiftOutwards_LeftAndRightInTurn', () => {
  const off = (k) => { const d = spokeFrame(k).a - LIFT.th; return Math.atan2(Math.sin(d), Math.cos(d)); };   // signed angle off the lift's exit
  assert.deepEqual([...NEXT_ROOMS].sort(), [2, 3, 4, 5, 6, 7]);
  for (const side of [-1, 1]) { const d = NEXT_ROOMS.filter(k => Math.sign(off(k)) === side).map(k => Math.abs(off(k))); assert.deepEqual(d, [...d].sort((x, y) => x - y), 'each side fills outwards'); }
  for (let i = 1; i < NEXT_ROOMS.length - 1; i++) assert.notEqual(Math.sign(off(NEXT_ROOMS[i])), Math.sign(off(NEXT_ROOMS[i - 1])), 'the sides alternate');
  const used = ROOMS.flatMap((r, k) => r.object ? [k] : []), taken = used.filter(k => k > 1);
  assert.deepEqual(taken, [...NEXT_ROOMS.slice(0, taken.length)].sort(), 'the objects beyond Eiffel and Atomium sit in the first NEXT_ROOMS');
});

test('spokeSigns_TheRealRooms_AreKeptAsASurpriseForNow', () => {
  const signs = spokeSigns(ROOMS); assert.deepEqual(signs.map(s => [s.k, s.text]), []);
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
  for (const R of rooms.filter(r => !r.object)) { assert.equal(R.tower, null); assert.deepEqual(R.feet, []); assert.equal(R.towerView, null); assert.ok(!blocked(R, ...R.centre)); }
});

test('roomLayout_SpaceUnderTheTowerIsDrivable_AndReachableFromThePortal', () => {
  for (const [x, z] of [[0, 0], [30, 0], [-30, 0], [0, 30], [0, -30], [30, 30], [-30, -30]]) assert.ok(!blocked(room, room.tower.x + x, room.tower.z + z), `blocked at ${x},${z}`);
  assert.ok(reach(room).seen.has('0,0'));
});

test('roomLayout_TheTreeRingIsClosed_TheOnlyWayOutIsThePortalTunnel', () => {
  for (const R of [rooms[0], rooms[3], rooms[4]]) {
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
  for (const R of [rooms[0], rooms[3], rooms[5]]) {
    const local = R.trees.map(t => [...toLocal(R, t[0], t[1]), t[2]]), cheb = ([a, b]) => Math.max(Math.abs(a), Math.abs(b));
    assert.ok(R.trees.length > 600); for (const t of local) { assert.ok(cheb(t) > ROOM_HALF - 16 && cheb(t) < ROOM_HALF - 2); assert.ok(t[2] >= 8 && t[2] <= 15); }
    const edge = (sel, along) => local.filter(sel).map(along).sort((p, q) => p - q), gaps = (xs) => xs.slice(1).map((x, i) => [x - xs[i], x]);
    for (const [sel, along] of [[t => t[0] > ROOM_HALF - 9, t => t[1]], [t => t[1] > ROOM_HALF - 9, t => t[0]], [t => t[1] < -ROOM_HALF + 9, t => t[0]]]) for (const [g, at] of gaps(edge(sel, along))) assert.ok(g < 7, `gap ${g} at ${at}`);
    const near = gaps(edge(t => t[0] < -ROOM_HALF + 9, t => t[1])), wide = near.filter(([g]) => g >= 7);
    assert.equal(wide.length, 1, 'one gap on the near edge'); assert.ok(Math.abs(wide[0][1] - wide[0][0] / 2) < 4, 'centred on the portal'); assert.ok(wide[0][0] < 2 * (SPOKE.hw + 6) + 7);
  }
});

test('roomLayout_PathsRunFromThePortalToTheCentreAndAroundIt_SpawnFacesIn', () => {
  for (const R of [rooms[0], rooms[3], rooms[4]]) {
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

const titanic = rooms[7];
test('roomLayout_TheTitanicIsCentredAndLifeSize_WithTwelveHullSectionsAlongTheCrossAxis', () => {
  assert.deepEqual([titanic.tower.x, titanic.tower.z], titanic.centre); assert.equal(titanic.hull.length, TITANIC.hull.length); assert.deepEqual(titanic.feet, []);
  assert.equal(TITANIC.length, 269, 'the real ship is 269 m'); assert.ok(TITANIC.h > 60 && TITANIC.h < 80, 'keel to masthead, the real one is about 73 m');
  const ends = TITANIC.hull.map(([a, hl]) => [a - hl, a + hl]).flat(); assert.ok(Math.abs(Math.min(...ends) + 134.5) < 1 && Math.abs(Math.max(...ends) - 134.5) < 1, 'the sections span the whole length');
  for (const [i, [along, , hw]] of TITANIC.hull.entries()) {
    const [x, z] = toWorld(titanic, 0, along), c = titanic.hull[i];
    assert.ok(Math.abs(c.x - x) < 1e-6 && Math.abs(c.z - z) < 1e-6); assert.equal(c.h, ROOM_Y + TITANIC.hullH);
    assert.ok(blocked(titanic, x, z, 0)); assert.ok(blocked(titanic, ...toWorld(titanic, hw - 1, along), 0), 'the beam is solid'); assert.ok(!blocked(titanic, ...toWorld(titanic, hw + CAR_R + 1, along)), 'open beside it');
  }
});

test('roomLayout_TheTitanicsHullIsSolid_TheCarDrivesRoundItOnTheQuay_AndReachesBothSides', () => {
  assert.ok(blocked(titanic, ...titanic.centre)); assert.ok(blocked(titanic, ...toWorld(titanic, 0, 130)), 'near the bow or stern');
  const { w, end, lane } = titanic.basin;
  assert.ok(!blocked(titanic, ...toWorld(titanic, 0, lane.end)), 'the quay past the end is open');
  const r = reach(titanic), cell = (a, b) => r.seen.has(Math.round(a / r.step) + ',' + Math.round(b / r.step));
  const q = Math.round((lane.w + 2) / r.step) * r.step, qe = Math.round((lane.end + 2) / r.step) * r.step;
  assert.ok(!cell(0, 0) && cell(-q, 0) && cell(q, 0) && cell(0, qe) && cell(0, -qe), 'both sides and both ends of the quay are reachable'); assert.ok(r.seen.size > 3000);
  assert.ok(!cell(w - 4, 0) && !cell(0, end - 4), 'the water is not reachable');
});

// #422: the ship floats -- the water basin round the hull, kerbed, with the quay lane outside it
test('shipBasin_IsAStadiumRoundTheBeamAtTheWaterline_WithTheLaneAsQuayOutside', () => {
  const beam = Math.max(...TITANIC.hull.map(s => s[2])), b = shipBasin(TITANIC);
  assert.equal(b.waterline, TITANIC.draught); assert.equal(TITANIC.draught, 10.5, 'the real ship drew 10.5 m');
  assert.ok(Math.abs(b.w - (beam + TITANIC.basin)) < 1e-9 && Math.abs(b.end - (TITANIC.length / 2 + TITANIC.basin + 5)) < 1e-9, `${b.w} ${b.end}`);
  assert.equal(b.y, ROOM_Y + WATER_LIFT); assert.ok(WATER_LIFT > 0.08, 'the surface lies above the gravel');
  assert.ok(Math.abs(b.lane.w - b.w - QUAY) < 1e-9 && Math.abs(b.lane.end - b.end - QUAY) < 1e-9, 'the lane runs QUAY m outside the water');
  const r25 = shipRing(TITANIC, 25); assert.ok(Math.abs(r25.w - beam - 25) < 1e-9 && Math.abs(r25.end - TITANIC.length / 2 - 30) < 1e-9 && Math.abs(r25.c + r25.w - r25.end) < 1e-9, 'the old 25 m lane: ends 30 m past bow and stern');
  assert.ok(b.lane.end < ROOM_HALF - 30, 'inside the trees');
});

test('roomLayout_TheTitanicsBasinIsClosedRoundTheShip_ItsKerbBlocksTheCarButNotTheHelicopter', () => {
  const b = titanic.basin, pts = b.pts;
  assert.deepEqual(pts[0], pts[pts.length - 1], 'closed'); assert.equal(b.rim.length, pts.length - 1);
  for (const p of pts) { const [a, bb] = toLocal(titanic, ...p); assert.ok(Math.abs(a) <= b.w + 1e-6 && Math.abs(bb) <= b.end + 1e-6); }
  for (const c of b.rim) { assert.equal(c.h, ROOM_Y + RIM.h); assert.equal(c.low, true); assert.ok(titanic.colliders.includes(c)); }
  assert.ok(blocked(titanic, ...toWorld(titanic, b.w, 0), 0.5) && blocked(titanic, ...toWorld(titanic, 0, b.end), 0.5), 'kerb on the beam side and past the end');
  assert.ok(!blocked(titanic, ...toWorld(titanic, b.w + QUAY, 0)) && !blocked(titanic, ...toWorld(titanic, -b.w - QUAY, 0)), 'the quay is free');
  assert.ok(!blocked(titanic, ...toWorld(titanic, b.w - 6, 0), 0), 'the water inside the kerb is open ground (it is the kerb that keeps the car out)');
  const [[ax, az], [bx, bz]] = [pts[0], pts[1]], [c] = rimColliders([[ax, az], [bx, bz]], 0);
  assert.ok(Math.abs(c.x - (ax + bx) / 2) < 1e-9 && Math.abs(Math.hypot(c.c, c.s) - 1) < 1e-9 && c.hw > Math.hypot(bx - ax, bz - az) / 2, 'one kerb box per segment, overlapping a little');
  for (const [x, z] of titanic.paths[1].pts) assert.ok(!blocked(titanic, x, z), 'the lane stays off the kerb');
});

test('roomLayout_TheTitanicsGravelLaneRoundsTheHullWithoutCrossingIt', () => {
  const [toShip, lane] = titanic.paths;
  for (const [x, z] of lane.pts) assert.ok(!blocked(titanic, x, z), `the lane runs into the hull at ${x},${z}`);
  for (const [x, z] of toShip.pts) assert.ok(!blocked(titanic, x, z), 'the way from the portal is free');
  const [a] = toLocal(titanic, ...toShip.pts[toShip.pts.length - 1]), laneA = lane.pts.map(p => toLocal(titanic, ...p)[0]);
  assert.ok(Math.abs(a + Math.max(...laneA)) < 1, 'the way ends on the lane');
  const bs = lane.pts.map(p => toLocal(titanic, ...p)[1]); assert.ok(Math.max(...bs) > TITANIC.length / 2 && Math.max(...bs) < ROOM_HALF - 30, 'the lane goes round both ends, inside the trees');
});

test('roomLayout_TheTitanicsTowerViewLooksAtItBroadsideFromTheLawn', () => {
  const v = titanic.towerView, d = Math.hypot(titanic.tower.x - v.x, titanic.tower.z - v.z); assert.ok(d > 120 && d < 180, `${d}`); assert.ok(!blocked(titanic, v.x, v.z));
});

// #488: the Artemis II stack and the Orion capsule -- star room 2
import { ARTEMIS } from '../artemis.js';
const artemis = rooms[2];
test('roomLayout_Room2HoldsTheArtemisStackOnTheCentre_AndTheCapsuleBesideIt_UnsignedLikeTheOthers', () => {
  assert.deepEqual([artemis.tower.x, artemis.tower.z], artemis.centre); assert.deepEqual(artemis.feet, []); assert.equal(artemis.hull.length, 0); assert.equal(artemis.basin, null);
  assert.ok(artemis.artemis); assert.deepEqual([artemis.artemis.rocket.x, artemis.artemis.rocket.z], artemis.centre);
  assert.deepEqual([artemis.artemis.capsule.x, artemis.artemis.capsule.z], toWorld(artemis, ...ARTEMIS.capsule.at));
  assert.ok(artemis.towerView && !blocked(artemis, artemis.towerView.x, artemis.towerView.z));
  for (const R of rooms.filter(r => r.k !== 2)) assert.equal(R.artemis, null);
});

test('roomLayout_Room2_MountCoreAndCapsuleAreSolid_TheLawnBetweenAndBothGravelRingsAreFree', () => {
  const D = ARTEMIS.deck.w / 2, C = ARTEMIS.capsule;
  assert.ok(blocked(artemis, ...artemis.centre), 'the core'); assert.ok(blocked(artemis, ...toWorld(artemis, 0, D - 1)), 'the mount edge');
  assert.ok(blocked(artemis, ...toWorld(artemis, ...C.at)), 'the capsule');
  for (const [a, b] of [[0, D + CAR_R + 2], [-D - CAR_R - 2, 0], [C.at[0], C.at[1] + C.hw * Math.SQRT2 + CAR_R + 1], [-30, 20], [95, 0], [0, -95]]) assert.ok(!blocked(artemis, ...toWorld(artemis, a, b)), `free at ${a},${b}`);
  for (const [x, z] of artemis.paths[2].pts) assert.ok(!blocked(artemis, x, z), 'the capsule ring is drivable');
  for (const [x, z] of artemis.paths[1].pts) assert.ok(!blocked(artemis, x, z), 'the 95 m loop is drivable');
});

test('roomLayout_Room2_ThreePaths_TheThirdRingsTheCapsule_AndTheCarReachesRoundBoth', () => {
  assert.equal(artemis.paths.length, 3); const ring = artemis.paths[2]; assert.equal(ring.hw, ARTEMIS.capsule.ring.hw); assert.equal(ring.pts.length, 33);
  for (const [x, z] of ring.pts) assert.ok(Math.abs(Math.hypot(x - artemis.artemis.capsule.x, z - artemis.artemis.capsule.z) - ARTEMIS.capsule.ring.r) < 1e-6);
  const r = reach(artemis), cell = (a, b) => r.seen.has(Math.round(a / r.step) + ',' + Math.round(b / r.step));
  assert.ok(!cell(0, 0), 'the rocket is solid'); assert.ok(cell(40, 0) && cell(0, 40) && cell(0, -40), 'the far side and both sides of the mount');
  const [ca, cb] = ARTEMIS.capsule.at; assert.ok(cell(ca - 12, cb) && cell(ca + 12, cb) && cell(ca, cb + 12) && cell(ca, cb - 12), 'all round the capsule'); assert.ok(r.seen.size > 4000);
});

// #489: ring 2 -- eight empty 1000 m rooms at -1200, levels of their own
import { RINGS, ROOMS2, NEXT_ROOMS2, ROOM2_Y, ROOM2_HALF, isRingLevel, ringOf, ringOfStop, liftStopAt, belowKind, levelY, roomFlyClamp, ROOM_FLY } from '../rooms.js';
import { BELOW_Y } from '../underground.js';
const rooms2 = ROOMS2.map((r, k) => roomLayout(k, r, RINGS[1]));

test('RINGS_Ring1AsBefore_Ring2EightEmptyRoomsTwiceAsWideAtMinus1200', () => {
  assert.deepEqual(RINGS.map(g => [g.id, g.stop, g.y, g.half]), [['ring', 'bottom', -600, 250], ['ring2', 'ring2', -1200, 500]]);
  assert.equal(RINGS[0].rooms, ROOMS); assert.equal(RINGS[1].rooms, ROOMS2);
  assert.deepEqual(ROOMS2.map(r => r.id), ['r2room0', 'r2room1', 'r2room2', 'r2room3', 'r2room4', 'r2room5', 'r2room6', 'r2room7']);
  for (const r of ROOMS2) { assert.equal(r.object, null); assert.equal(r.name, null); }
  assert.deepEqual(spokeSigns(ROOMS2), [], 'no signs in ring 2');
});

test('levelHelpers_BothRings_SurfaceAndRooms', () => {
  assert.ok(isRoomLevel('r2room0') && isRoomLevel('r2room7') && isRoomLevel('eiffel') && !isRoomLevel('ring2'));
  assert.ok(isRingLevel('ring') && isRingLevel('ring2') && !isRingLevel('r2room0') && !isRingLevel('surface'));
  assert.equal(ringOf('r2room5').id, 'ring2'); assert.equal(ringOf('atomium').id, 'ring'); assert.equal(ringOf('ring2').id, 'ring2'); assert.equal(ringOf('surface'), null);
  assert.equal(ringOfStop('ring2').id, 'ring2'); assert.equal(ringOfStop('bottom').id, 'ring'); assert.equal(ringOfStop('top'), null);
  assert.deepEqual(['surface', 'ring', 'ring2', 'eiffel', 'r2room3'].map(liftStopAt), ['top', 'bottom', 'ring2', null, null]);
  assert.deepEqual(['surface', 'ring', 'ring2', 'eiffel', 'r2room3'].map(belowKind), ['surface', 'ring', 'ring2', 'room', 'room']);
  assert.deepEqual(['surface', 'ring', 'room6', 'ring2', 'r2room1'].map(levelY), [null, -600, -600, -1200, -1200]);
});

test('roomLayout_Ring1_UnchangedByTheRingParameter', () => {
  for (let k = 0; k < 8; k++) assert.deepEqual(JSON.stringify(roomLayout(k, ROOMS[k], RINGS[0])), JSON.stringify(rooms[k]));
  assert.equal(room.half, 250); assert.equal(room.ring, 'ring'); assert.deepEqual(room.fly, { wall: 225, ceiling: 420 });
});

test('roomLayout_Ring2_ThousandMetreSquareAtItsDepth_PortalAtTheSpokeEnd', () => {
  rooms2.forEach((R, k) => {
    assert.equal(R.id, `r2room${k}`); assert.equal(R.ring, 'ring2'); assert.equal(R.y, ROOM2_Y); assert.equal(R.half, ROOM2_HALF); assert.equal(R.groundAt(), -1200);
    assert.equal(R.object, null); assert.equal(R.tower, null);
    const sp = spokeFrame(k); assert.deepEqual(R.portal.c, sp.end);
    const [a, b] = toLocal(R, ...sp.end); assert.ok(Math.abs(a + 500) < 1e-6 && Math.abs(b) < 1e-6, 'the portal is 500 m before the centre');
    for (const o of R.colliders) assert.ok(o.h > ROOM2_Y && o.h < BELOW_Y, 'colliders stand at ring 2 depth');
  });
});

test('roomLayout_Ring2_DrivableFromTheSpawnToTheCentreAndTheCorners', () => {
  for (const R of [rooms2[0], rooms2[5]]) {
    assert.ok(!blocked(R, R.spawn.x, R.spawn.z) && !blocked(R, ...R.centre));
    for (const [a, b] of [[450, 450], [450, -450], [-450, 450], [-450, -450], [0, 470]]) assert.ok(!blocked(R, ...toWorld(R, a, b)), `free at ${a}, ${b}`);
    for (const [a, b] of [[499, 0], [0, -499], [-499, 100]]) assert.ok(blocked(R, ...toWorld(R, a, b)), `walled at ${a}, ${b}`);
  }
});

test('roomLayout_Ring2_TwiceTheTreesAlongTheLongerEdge', () => {
  const n1 = rooms[3].trees.length, n2 = rooms2[3].trees.length;
  assert.ok(n2 > 1.9 * n1 && n2 < 2.1 * n1, `${n1} -> ${n2}`);
  for (const [x, z] of rooms2[3].trees) { const [a, b] = toLocal(rooms2[3], x, z); assert.ok(Math.max(Math.abs(a), Math.abs(b)) > 480); }
});

test('roomFlyClamp_Ring2Room_Wall475Ceiling420OverItsFloor', () => {
  const R = rooms2[2], f = R.frame.f, v = R.frame.v; assert.deepEqual(R.fly, { wall: 475, ceiling: ROOM_FLY.ceiling });
  const c = roomFlyClamp(R.centre[0] + f[0] * 9999 + v[0] * 9999, ROOM2_Y + 5000, R.centre[1] + f[1] * 9999 + v[1] * 9999, R);
  const [a, b] = toLocal(R, c.x, c.z); assert.ok(Math.abs(a - 475) < 1e-6 && Math.abs(b - 475) < 1e-6, `${a}, ${b}`); assert.equal(c.y, ROOM2_Y + 420);
  assert.ok(ROOM2_Y + ROOM_FLY.ceiling <= BELOW_Y - 100, 'ring 2 rooms end 100+ m under ring 1');
});

test('NEXT_ROOMS2_AllEight_FromTheLiftOutwards_RightAndLeftInTurn', () => {
  const off = (k) => { const d = spokeFrame(k).a - LIFT.th; return Math.atan2(Math.sin(d), Math.cos(d)); };
  assert.deepEqual([...NEXT_ROOMS2].sort(), [0, 1, 2, 3, 4, 5, 6, 7]);
  for (const side of [-1, 1]) { const d = NEXT_ROOMS2.filter(k => Math.sign(off(k)) === side).map(k => Math.abs(off(k))); assert.deepEqual(d, [...d].sort((x, y) => x - y), 'each side fills outwards'); }
  assert.ok(off(NEXT_ROOMS2[0]) > 0, 'the first room is right of the exit (as the Eiffel in ring 1)');
  for (let i = 1; i < 8; i++) assert.notEqual(Math.sign(off(NEXT_ROOMS2[i])), Math.sign(off(NEXT_ROOMS2[i - 1])), 'the sides alternate');
});

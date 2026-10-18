// #361: the hideout below the lift -- the ring level's pure layout. node --test prototype/tests/underground.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BELOW_Y, RING, EXIT, SPOKE, spokeFrame, spokeAt, belowLevelAt, ringColliders, ringCeilingAt, ringSpawn, spokeSigns } from '../underground.js';
import { HIDEOUT, LIFT, TUNNEL_CEIL } from '../hideout.js';

const C = LIFT.c, F = [Math.cos(LIFT.th), Math.sin(LIFT.th)], IDS = ['eiffel', 'room1', 'room2', 'room3', 'room4', 'room5', 'room6', 'room7'];
const close = (a, b, eps = 1e-6, m = '') => assert.ok(Math.abs(a - b) <= eps, `${m} ${a} vs ${b}`);
const polar = (r, a) => [C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r];
const blocked = (x, z, r = 1.3) => ringColliders().some(o => { const dx = x - o.x, dz = z - o.z; return Math.abs(dx * o.c + dz * o.s) <= o.hw + r && Math.abs(-dx * o.s + dz * o.c) <= o.hd + r; });
const onSpoke = (k, s, d = 0) => { const f = spokeFrame(k); return [f.start[0] + f.u[0] * s + f.v[0] * d, f.start[1] + f.u[1] * s + f.v[1] * d]; };

test('clearance_EverythingFitsAnArticulatedBus', () => {
  const bus = { w: 2.55, h: 3.3 }, gaps = { t1: [2 * HIDEOUT.hw, TUNNEL_CEIL], door: [2 * LIFT.door.hw, LIFT.door.h], cabin: [2 * LIFT.hw, LIFT.height], exit: [2 * EXIT.hw, EXIT.ceiling], ring: [2 * RING.hw, RING.ceiling], spoke: [2 * SPOKE.hw, SPOKE.ceiling] };
  for (const [k, [w, h]] of Object.entries(gaps)) assert.ok(w >= bus.w + 2 && h >= bus.h + 1.5, `${k}: ${w} x ${h}`);
  assert.ok(2 * LIFT.hd >= 18 + 2, 'cabin length'); assert.equal(RING.r, 60); assert.equal(2 * RING.hw, 16); assert.equal(BELOW_Y, -600);
});

test('spokeFrame_EightSpokes45DegreesApart_NoneOnTheExitsAxis', () => {
  for (let k = 0; k < 8; k++) {
    const f = spokeFrame(k); close(f.a - spokeFrame(0).a, k * Math.PI / 4, 1e-9);
    close(Math.hypot(f.start[0] - C[0], f.start[1] - C[1]), RING.r + RING.hw); close(Math.hypot(f.end[0] - C[0], f.end[1] - C[1]), RING.r + RING.hw + SPOKE.len);
    const off = Math.acos(Math.max(-1, Math.min(1, f.u[0] * F[0] + f.u[1] * F[1]))); assert.ok(off > 0.3, `spoke ${k} is ${off} rad off the exit`);
  }
  close(spokeFrame(0).a, LIFT.th + Math.PI / 8, 1e-12, 'spoke 0 is the first one past the exit');
});

test('spokeAt_FindsTheSpokeAndTheMetresAlongIt', () => {
  const p = onSpoke(3, 37.5, 2), sp = spokeAt(...p); assert.equal(sp.k, 3); close(sp.s, 37.5); close(sp.d, 2);
  assert.equal(spokeAt(...polar(RING.r, LIFT.th)), null, 'the ring itself is no spoke');
  assert.equal(spokeAt(...onSpoke(3, 50, SPOKE.hw + 1)), null, 'beside the spoke is rock');
});

test('belowLevelAt_SwitchesInTheDarkStretchWithHysteresis', () => {
  for (const k of [0, 5]) {
    assert.equal(belowLevelAt('ring', ...onSpoke(k, 51), IDS), 'ring'); assert.equal(belowLevelAt('ring', ...onSpoke(k, 52.5), IDS), IDS[k]);
    assert.equal(belowLevelAt(IDS[k], ...onSpoke(k, 49), IDS), IDS[k]); assert.equal(belowLevelAt(IDS[k], ...onSpoke(k, 47.5), IDS), 'ring');
  }
  assert.ok(SPOKE.dark[0] < SPOKE.switchOut && SPOKE.switchIn < SPOKE.dark[1], 'both switch points are in the dark');
  assert.ok(SPOKE.roomStart < SPOKE.dark[0] - 8 && SPOKE.ringEnd > SPOKE.dark[1] + 8, 'each level draws 15+ m past the switch for the camera');
  assert.equal(belowLevelAt('room1', ...onSpoke(0, 47), IDS), 'room1', 'another room never switches via a foreign spoke');
  assert.equal(belowLevelAt('ring', ...polar(RING.r, 1), IDS), 'ring');
});

test('ringColliders_TheRingIsClosedExceptTheExitAndTheSpokes', () => {
  for (let i = 0; i < 360; i += 2) {
    const a = i * Math.PI / 180, inner = polar(RING.r - RING.hw - RING.wall / 2, a), outer = polar(RING.r + RING.hw + RING.wall / 2, a);
    const toExit = Math.abs(Math.atan2(Math.sin(a - LIFT.th), Math.cos(a - LIFT.th))), toSpoke = Math.min(...Array.from({ length: 8 }, (_, k) => Math.abs(Math.atan2(Math.sin(a - spokeFrame(k).a), Math.cos(a - spokeFrame(k).a)))));
    if (toExit > 0.2) assert.ok(blocked(...inner, 0), `inner wall open at ${i}`);
    if (toSpoke > 0.15) assert.ok(blocked(...outer, 0), `outer wall open at ${i}`);
    assert.ok(!blocked(...polar(RING.r, a)), `the ring's middle is blocked at ${i}`);
  }
  for (let s = EXIT.from + 3; s <= EXIT.to; s += 2) assert.ok(!blocked(C[0] + F[0] * s, C[1] + F[1] * s), `exit blocked at ${s}`);
  for (let k = 0; k < 8; k++) { for (let s = 0; s <= SPOKE.ringEnd - 3; s += 2) assert.ok(!blocked(...onSpoke(k, s)), `spoke ${k} at ${s}`); assert.ok(blocked(...onSpoke(k, SPOKE.ringEnd + 0.4), 0), `spoke ${k} capped`); }
  assert.ok(ringColliders().some(o => o.liftDoor === 'bottom'), 'door B is in the ring level');
});

test('ringCeilingAt_RingSpokesExitCabin', () => {
  close(ringCeilingAt(...polar(RING.r, 2)), BELOW_Y + RING.ceiling); close(ringCeilingAt(...onSpoke(1, 20)), BELOW_Y + SPOKE.ceiling);
  close(ringCeilingAt(C[0] + F[0] * 30, C[1] + F[1] * 30), BELOW_Y + EXIT.ceiling); assert.ok(ringCeilingAt(...C) >= BELOW_Y + LIFT.door.h);
  assert.equal(ringCeilingAt(C[0] + 500, C[1]), null);
});

test('ringSpawn_AtTheExitsRingEndFacingOut', () => {
  const s = ringSpawn(); close(Math.hypot(s.x - C[0], s.z - C[1]), RING.r - RING.hw - 2); close(s.th, LIFT.th); assert.ok(!blocked(s.x, s.z));
});

test('spokeSigns_OnlyRoomsWithAnObjectAreSigned', () => {
  const rooms = IDS.map((id, k) => ({ id, name: k === 0 ? 'La Tour Eiffel' : null, object: k === 0 ? { h: 330 } : null }));
  const signs = spokeSigns(rooms); assert.equal(signs.length, 1); assert.equal(signs[0].k, 0); assert.equal(signs[0].text, 'La Tour Eiffel');
  const f = spokeFrame(0); assert.ok(Math.hypot(signs[0].x - f.start[0], signs[0].z - f.start[1]) < 1.5, 'at the spoke mouth');
  assert.ok(signs[0].y > BELOW_Y + SPOKE.ceiling && signs[0].y < BELOW_Y + RING.ceiling, 'over the opening, under the ring ceiling');
  assert.deepEqual(spokeSigns([{ id: 'x', name: 'Atomium', object: null }]), [], 'a named room without its object stays unsigned');
});

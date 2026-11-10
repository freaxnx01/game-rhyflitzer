// #516: riding the Ferris wheel on foot -- pure. node --test tests/ferrisride.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FERRIS, wheelAngle, gondolaAngles } from '../ferris.js';
import { RIDE, gondolaPose, bottomOffset, lowestGondola, toWheel, fromWheel, boardingTarget, rideIdle, rideBegin, rideStep, rideAngle, rideFeet, rideAction, clockOffset } from '../ferrisride.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''}: ${a} vs ${b}`);
const TAU = 2 * Math.PI;
const LOW = 3 * FERRIS.gondola.n / 4;   // #588: the gondola that hangs straight down at angle 0 (n = 48 -> index 36)
const run = (s, secs, leave = false, dt = 1 / 60) => { for (let i = 0; i < Math.round(secs / dt); i++) s = rideStep(s, dt, leave); return s; };

test('gondolaPose_AgreesWithThreeXRotationOfThePivot_TheMeshConvention', () => {
  const t = gondolaAngles(FERRIS);
  for (const A of [0, 0.7, 2.1, 4.4, 6.2]) for (const i of [0, 5, 12, 24, LOW, FERRIS.gondola.n - 1]) {
    const y0 = FERRIS.rim * Math.sin(t[i]), z0 = FERRIS.rim * Math.cos(t[i]);          // ferrismesh.js pivot, in the wheel group
    const y = y0 * Math.cos(A) - z0 * Math.sin(A), z = y0 * Math.sin(A) + z0 * Math.cos(A);   // wheel.rotation.x = A (three.js)
    const p = gondolaPose(i, A);
    near(p.y, FERRIS.hub.y + y - FERRIS.gondola.drop, 1e-9, `y i${i} A${A}`); near(p.z, z, 1e-9, `z i${i} A${A}`); assert.equal(p.x, 0);
    near(p.floor, p.y - FERRIS.gondola.h / 2, 1e-12, 'floor');
  }
});

test('lowestGondola_AtAngleZero_IsThreeQuartersRoundWithItsFloorJustOverTheLawn', () => {
  const l = lowestGondola(0); assert.equal(l.index, LOW); near(l.offset, 0, 1e-9, 'offset');
  const floor = FERRIS.hub.y - FERRIS.rim - FERRIS.gondola.drop - FERRIS.gondola.h / 2;
  near(gondolaPose(LOW, 0).floor, floor, 1e-9, 'floor');
  assert.ok(floor > 5 && floor <= 6.6, `clear over the lawn but low enough to board: ${floor} m`);
});

test('lowestGondola_AnyWheelAngle_IsWithinHalfASpacingOfStraightDown', () => {
  for (let k = 0; k < 400; k++) {
    const A = k / 400 * TAU, l = lowestGondola(A);
    assert.ok(Math.abs(l.offset) <= Math.PI / FERRIS.gondola.n + 1e-9, `A ${A}: ${l.offset}`);
    near(l.offset, bottomOffset(l.index, A), 1e-12, 'same offset');
  }
  assert.ok(Math.PI / FERRIS.gondola.n <= 0.1, 'within the acceptance bound of 0.1 rad');
});

test('toWheelFromWheel_RoundTrip_AndTheAxleIsTheRoomsF', () => {
  const w = { x: 120, z: -40, th: 0.9 };
  const [lx, lz] = toWheel(w, ...fromWheel(w, 3, -7)); near(lx, 3, 1e-9, 'lx'); near(lz, -7, 1e-9, 'lz');
  const [x, z] = fromWheel(w, 1, 0); near(x - w.x, Math.cos(w.th), 1e-9, 'f.x'); near(z - w.z, Math.sin(w.th), 1e-9, 'f.z');
});

test('boardingTarget_WithinReachOfTheLowestGondolasFloorPoint_ElseNull', () => {
  const g = gondolaPose(LOW, 0);
  assert.deepEqual(boardingTarget(0, { x: 0, z: g.z }), { index: LOW, dist: 0 });
  assert.equal(boardingTarget(0, { x: RIDE.reach - 0.1, z: g.z }).index, LOW);
  assert.equal(boardingTarget(0, { x: RIDE.reach + 0.5, z: g.z }), null);
  assert.equal(boardingTarget(0, { x: 0, z: 30 }), null);
});

test('rideStep_Boarding_HoldsTheWheelThenRides_LeaveIsIgnored', () => {
  let s = rideBegin(0.3, lowestGondola(0.3).index, { x: 1, z: 2 });
  assert.equal(s.phase, 'boarding'); near(rideAngle(s), 0.3, 1e-12, 'held');
  s = run(s, RIDE.board / 2, true); assert.equal(s.phase, 'boarding'); near(rideAngle(s), 0.3, 1e-12, 'still held');
  s = run(s, RIDE.board, false); assert.equal(s.phase, 'riding');
});

test('rideStep_Riding_TurnsAtRideSpeedAndEndsAfterExactlyOneTurn', () => {
  let s = run(rideBegin(0, LOW, { x: 0, z: 0 }), RIDE.board + 0.01);
  s = run(s, 10); near(rideAngle(s), 1.0, 0.02, '10 s at 0.1 rad/s');
  s = run(s, TAU / RIDE.spin - 10 + 0.1); assert.equal(s.phase, 'alighting'); near(s.travelled, TAU, 1e-9, 'one turn, clamped');
  s = run(s, RIDE.alight + 0.05); assert.equal(s.phase, 'idle'); near(s.angle, 0, 1e-9, 'back where it started (mod 2pi)');
});

test('rideStep_LeaveInTheBottomWindow_Alights_LeaveElsewhereIsRefused', () => {
  let s = run(rideBegin(0, LOW, { x: 0, z: 0 }), RIDE.board + 0.01);
  assert.equal(rideStep(s, 1 / 60, true).phase, 'alighting');            // just boarded: still at the bottom
  s = run(s, 20);                                                         // 2 rad up: far from the bottom
  assert.equal(rideAction(s, rideAngle(s), { x: 0, z: 0 }, true).do, 'wait');
  assert.equal(rideStep(s, 1 / 60, true).phase, 'riding');
  const s2 = run(s, 12); assert.ok(Math.abs(bottomOffset(LOW, rideAngle(s2))) > RIDE.window);
});

test('rideStep_DoesNotMutateItsInput', () => {
  const s = rideBegin(0, LOW, { x: 0, z: 0 }), copy = JSON.stringify(s);
  rideStep(s, 0.5, true); assert.equal(JSON.stringify(s), copy);
});

test('rideFeet_StartsWhereTheWalkerStood_RidesAtTheGondolaFloor_EndsOnTheGround', () => {
  const g = gondolaPose(LOW, 0);
  let s = rideBegin(0, LOW, { x: 2, z: g.z + 1 });
  assert.deepEqual(rideFeet(s), { x: 2, y: 0, z: g.z + 1 });
  s = run(s, RIDE.board + 0.01); near(rideFeet(s).y, g.floor, 0.05, 'in the gondola'); near(rideFeet(s).x, 0, 1e-9, 'x');
  assert.ok(rideFeet(s).y <= 6.6, 'the acceptance bound at the bottom');
  let top = 0; for (let i = 0; i < 70 * 60 && s.phase === 'riding'; i++) { s = rideStep(s, 1 / 60, false); top = Math.max(top, rideFeet(s) ? rideFeet(s).y : 0); }
  assert.ok(top >= 105, `peak ${top}`);
  near(rideFeet(s).y, g.floor, 0.1, 'bottom again, alighting begins'); s = run(s, RIDE.alight / 2); assert.ok(rideFeet(s).y < 6 && rideFeet(s).y > 0, 'gliding down');
  s = run(s, RIDE.alight); assert.equal(s.phase, 'idle'); assert.equal(rideFeet(s), null);
});

test('rideAction_Idle_BoardOnlyOnTheGroundWithinReach_NoneInTheAir', () => {
  const g = gondolaPose(LOW, 0), here = { x: 0, z: g.z };
  assert.deepEqual(rideAction(rideIdle(), 0, here, true), { do: 'board', index: LOW });
  assert.equal(rideAction(rideIdle(), 0, here, false).do, 'none');
  assert.equal(rideAction(rideIdle(), 0, { x: 40, z: 0 }, true).do, 'none');
  assert.equal(rideAction(rideBegin(0, LOW, here), 0, here, true).do, 'none');
});

test('rideAction_RidingInTheBottomWindow_Leave', () => {
  const s = run(rideBegin(0, LOW, { x: 0, z: 0 }), RIDE.board + 0.01);
  assert.equal(rideAction(s, rideAngle(s), { x: 0, z: 0 }, false).do, 'leave');
});

test('clockOffset_WheelClockAgreesWithTheAngleAtThatMoment_NoJump', () => {
  for (const [a, now] of [[0, 12.5], [1.234, 900], [6.2, 1e5]]) {
    const off = clockOffset(a, now);
    near(wheelAngle(now + off), a, 1e-6, `at ${now}`);
    near(wheelAngle(now + 3 + off), (a + 3 * FERRIS.spin) % TAU, 1e-6, '3 s later it turns at the resting speed');
  }
});

test('RIDE_Pad_CoversTheExitPointOfTheBottomWindow', () => {
  assert.ok(FERRIS.rim * Math.sin(RIDE.window) <= FERRIS.pad.hd, 'exit z inside the pad');
  assert.ok(RIDE.reach >= FERRIS.rim * Math.sin(Math.PI / FERRIS.gondola.n) + 0.05, 'the lowest gondola is always reachable from straight below');
  assert.ok(RIDE.reach >= FERRIS.rim * Math.sin(Math.PI / FERRIS.gondola.n) + 2.55, 'and so is a walker stepping out of a car parked at the pad centre');
});

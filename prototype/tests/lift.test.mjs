// #277: the lift's ride -- pure state machine. node --test prototype/tests/lift.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLift, LIFT_TIMES } from '../lift.js';

const STOP = { onPlatform: true, speed: 0, dir: 'down' };
const run = (lift, secs, input = STOP, dt = 0.05) => { const ev = []; for (let t = 0; t < secs - 1e-9; t += dt) ev.push(...lift.step(dt, input)); return ev; };

test('createLift_StartsIdleWithTheGateOpen', () => {
  const l = createLift(); assert.equal(l.phase, 'idle'); assert.equal(l.gate, 0); assert.equal(l.floor(), null); assert.equal(l.busy, false);
});

test('step_DrivingAcrossWithoutStopping_DoesNothing', () => {
  const l = createLift(); assert.deepEqual(run(l, 3, { onPlatform: true, speed: 6, dir: 'down' }), []); assert.equal(l.phase, 'idle');
});

test('step_StoppedLessThanADwell_DoesNothingAndTheDwellRestarts', () => {
  const l = createLift(); run(l, 0.8); run(l, 0.5, { onPlatform: true, speed: 3, dir: 'down' }); run(l, 0.8); assert.equal(l.phase, 'idle');
});

test('step_StoppedOffThePlatform_DoesNothing', () => {
  const l = createLift(); assert.deepEqual(run(l, 3, { onPlatform: false, speed: 0, dir: 'down' }), []);
});

test('step_StoppedForADwell_StartsThenSwitchesAtTheMidpointThenIsDone', () => {
  const l = createLift(), T = LIFT_TIMES, ev = [];
  const at = (secs) => { const e = run(l, secs); ev.push(...e); return e; };
  at(T.dwell + 0.05);
  assert.equal(l.phase, 'closing'); assert.deepEqual(ev.map(e => e.type), ['start']); assert.equal(ev[0].dir, 'down');
  at(T.close + 0.1); assert.equal(l.phase, 'descending');
  at(T.ride / 2 - 0.2); assert.deepEqual(ev.map(e => e.type), ['start'], 'not yet at the midpoint');
  at(0.3); assert.deepEqual(ev.map(e => e.type), ['start', 'switch']);
  at(T.ride / 2); assert.equal(l.phase, 'opening');
  at(T.open + 0.1); assert.equal(l.phase, 'idle'); assert.deepEqual(ev.map(e => e.type), ['start', 'switch', 'done']);
  assert.equal(ev.filter(e => e.type === 'switch').length, 1, 'exactly one switch');
});

test('step_AfterARide_NeedsTheCarToLeaveThePlatformBeforeTheNextRide', () => {
  const l = createLift(); run(l, LIFT_TIMES.dwell + LIFT_TIMES.close + LIFT_TIMES.ride + LIFT_TIMES.open + 0.5);
  assert.equal(l.phase, 'idle'); assert.deepEqual(run(l, 3, { onPlatform: true, speed: 0, dir: 'up' }), [], 'still standing there: no ride back');
  run(l, 0.2, { onPlatform: false, speed: 5, dir: 'up' });
  assert.equal(run(l, 1.2, { onPlatform: true, speed: 0, dir: 'up' }).find(e => e.type === 'start').dir, 'up');
});

test('step_OneHugeDtStillEmitsTheSwitch', () => {
  const l = createLift(); l.step(LIFT_TIMES.dwell + 0.01, STOP); const ev = l.step(100, STOP);
  assert.ok(ev.some(e => e.type === 'switch'), JSON.stringify(ev));
});

test('gate_ClosesDuringClosingStaysShutWhileDescendingOpensDuringOpening', () => {
  const l = createLift(), T = LIFT_TIMES; run(l, T.dwell + 0.05);
  run(l, T.close / 2); assert.ok(l.gate > 0.3 && l.gate < 0.8, `half closed ${l.gate}`);
  run(l, T.close / 2 + 0.1); assert.equal(l.gate, 1); run(l, T.ride - 0.5); assert.equal(l.gate, 1);
  run(l, 0.5 + T.open / 2); assert.ok(l.gate > 0.2 && l.gate < 0.8, `half open ${l.gate}`);
});

test('floor_CountsMinus1ToMinus12DownAndBackUp', () => {
  const T = LIFT_TIMES, down = createLift(); run(down, T.dwell + T.close + 0.05);
  assert.equal(down.floor(), -1); run(down, T.ride - 0.2); assert.equal(down.floor(), -12);
  const up = createLift(); run(up, T.dwell + T.close + 0.05, { onPlatform: true, speed: 0, dir: 'up' });
  assert.equal(up.floor(), -12); run(up, T.ride - 0.2, { onPlatform: true, speed: 0, dir: 'up' }); assert.equal(up.floor(), -1);
});

test('times_ReflectsSetTimes_abort_EndsARideAtOnceAndDisarms', () => {
  const l = createLift(); l.setTimes({ ride: 2 }); assert.equal(l.times.ride, 2); assert.equal(l.times.dwell, LIFT_TIMES.dwell);
  run(l, LIFT_TIMES.dwell + 0.1); assert.ok(l.busy); l.abort(); assert.equal(l.phase, 'idle'); assert.equal(l.gate, 0);
  assert.deepEqual(run(l, 3), [], 'disarmed until the car leaves the platform');
});

test('setTimes_ShortensTheRideForTests', () => {
  const l = createLift(); l.setTimes({ dwell: 0.1, close: 0.1, ride: 0.2, open: 0.1 });
  const ev = run(l, 1, STOP, 0.02).map(e => e.type); assert.deepEqual(ev, ['start', 'switch', 'done']);
});

// the shaft wall must slide past the car the other way from the ride: three.js samples the texture at uv + offset, so a growing
// offset.y moves the pattern DOWN on screen -- riding down needs it to shrink (the pattern rises past the car), riding up to grow.
import { shaftScrollDelta } from '../lift.js';
test('shaftScrollDelta_RidingDown_ShrinksTheOffsetSoThePatternRises', () => {
  assert.ok(shaftScrollDelta('down', 'descending', 0.1) < 0);
});
test('shaftScrollDelta_RidingUp_GrowsTheOffsetSoThePatternSinks', () => {
  assert.ok(shaftScrollDelta('up', 'descending', 0.1) > 0);
});
test('shaftScrollDelta_WhenTheShaftIsNotMoving_IsZero', () => {
  for (const phase of ['idle', 'closing', 'opening']) assert.equal(shaftScrollDelta('down', phase, 0.1), 0);
});
test('floor_DownAndUp_CountsMinus1ToMinus12AndBack', () => {
  const seq = (dir) => { const l = createLift(); const seen = []; const input = { onPlatform: true, speed: 0, dir };
    for (let i = 0; i < 400; i++) { l.step(0.05, input); const f = l.floor(); if (f !== null && seen[seen.length - 1] !== f) seen.push(f); } return seen; };
  assert.deepEqual(seq('down'), [-1, -2, -3, -4, -5, -6, -7, -8, -9, -10, -11, -12]);
  assert.deepEqual(seq('up'), [-12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1]);
});

// #361: the cabin's level and its two proximity-driven doors
const NEAR = { onPlatform: false, near: true, level: 'top', speed: 3, dir: 'down' };
const AWAY = { onPlatform: false, near: false, level: 'top', speed: 3, dir: 'down' };

test('door_OpensWhenTheCarComesNearOnTheCabinsLevel_AndClosesWhenItLeaves', () => {
  const l = createLift(); assert.equal(l.cabin, 'top'); assert.equal(l.door, 0);
  run(l, LIFT_TIMES.open / 2, NEAR); assert.ok(l.door > 0.4 && l.door < 0.6, `${l.door}`);
  run(l, LIFT_TIMES.open, NEAR); assert.equal(l.door, 1); assert.equal(l.doorAt('top'), 1); assert.equal(l.doorAt('bottom'), 0);
  run(l, LIFT_TIMES.close + 0.1, AWAY); assert.equal(l.door, 0);
});

test('door_StaysShutWhenTheCabinIsOnTheOtherLevel', () => {
  const l = createLift(); run(l, 3, { ...NEAR, level: 'bottom' }); assert.equal(l.door, 0); assert.equal(l.doorAt('bottom'), 0);
  assert.deepEqual(run(l, 3, { onPlatform: true, near: true, level: 'bottom', speed: 0, dir: 'up' }), [], 'no ride from the wrong level');
});

test('ride_ShutsTheDoorFlipsTheCabinAtTheSwitchAndOpensTheArrivalDoor', () => {
  const l = createLift(), T = LIFT_TIMES; run(l, T.dwell + 0.05); assert.equal(l.phase, 'closing'); assert.equal(l.cabin, 'top');
  run(l, T.close + T.ride / 2 - 0.2); assert.equal(l.door, 0); assert.equal(l.cabin, 'top');
  run(l, 0.4); assert.equal(l.cabin, 'bottom', 'flipped at the midpoint');
  run(l, T.ride / 2 + T.open + 0.1, { onPlatform: true, near: true, level: 'bottom', speed: 0, dir: 'down' });
  assert.equal(l.phase, 'idle'); assert.equal(l.doorAt('bottom'), 1); assert.equal(l.doorAt('top'), 0);
});

test('place_PutsTheCabinOnALevelWithItsDoorShut', () => {
  const l = createLift(); run(l, 2, NEAR); l.place('bottom'); assert.equal(l.cabin, 'bottom'); assert.equal(l.door, 0);
  run(l, 2, { ...NEAR, level: 'bottom' }); assert.equal(l.doorAt('bottom'), 1);
  l.abort(); l.place('top'); assert.equal(l.cabin, 'top'); assert.equal(l.phase, 'idle');
});

// #489: the freight lift's three stops
import { FREIGHT_DEPTH, FREIGHT_DEFAULT } from '../lift.js';
const freight = () => createLift(LIFT_TIMES, FREIGHT_DEPTH);
const at = (stop, to = FREIGHT_DEFAULT[stop]) => ({ onPlatform: true, speed: 0, level: stop, to });
const trip = (l, stop) => run(l, 40, at(stop));   // long enough for any ride
const floors = (l, input) => { const seen = []; for (let i = 0; i < 2000 && (l.busy || !seen.length); i++) { l.step(0.05, input); const f = l.floor(); if (f !== null && f !== seen[seen.length - 1]) seen.push(f); } return seen; };

test('freight_NoChoiceOnTheSurface_RidesToRing1AsBefore', () => {
  const l = freight(), ev = run(l, LIFT_TIMES.dwell + 0.05, at('top'));
  assert.deepEqual(ev.map(e => [e.type, e.to, e.dir]), [['start', 'bottom', 'down']]); assert.equal(ev[0].ride, LIFT_TIMES.ride);
  trip(l, 'top'); assert.equal(l.cabin, 'bottom'); assert.equal(l.phase, 'idle');
});

test('freight_NoChoiceInEitherRing_RidesUpToTheSurface', () => {
  for (const stop of ['bottom', 'ring2']) {
    const l = freight(); l.place(stop); const ev = run(l, LIFT_TIMES.dwell + 0.05, at(stop));
    assert.deepEqual(ev.map(e => [e.type, e.to, e.dir]), [['start', 'top', 'up']], stop);
  }
});

test('call_Ring2FromTheSurface_StartsAtOnceWithoutTheDwell_TwelveSecondsOfRide', () => {
  const l = freight(); assert.equal(l.call('ring2'), true); assert.equal(l.chosen, 'ring2');
  const ev = l.step(0.05, at('top')); assert.deepEqual(ev.map(e => [e.type, e.to, e.dir, e.ride]), [['start', 'ring2', 'down', 12]]);
  assert.equal(l.target, 'ring2'); assert.equal(l.chosen, null);
  const all = run(l, LIFT_TIMES.close + 5.9, at('top')); assert.ok(!all.some(e => e.type === 'switch'), 'no switch before the 6 s midpoint');
  const sw = run(l, 0.2, at('top')).find(e => e.type === 'switch'); assert.equal(sw.to, 'ring2'); assert.equal(l.cabin, 'ring2');
  run(l, 6 + LIFT_TIMES.open, at('ring2')); assert.equal(l.phase, 'idle');
});

test('call_AfterArrivingInRing1_RidesOnToRing2_SixSecondsMinus13ToMinus24', () => {
  const l = freight(); trip(l, 'top'); assert.equal(l.cabin, 'bottom');
  assert.deepEqual(run(l, 3, at('bottom')), [], 'an arrival disarms the dwell');
  assert.equal(l.call('ring2'), true);
  const ev = l.step(0.05, at('bottom')); assert.deepEqual(ev.map(e => [e.type, e.to, e.dir, e.ride]), [['start', 'ring2', 'down', 6]]);
  const seen = floors(l, at('bottom')); assert.equal(seen[0], -13); assert.equal(seen[seen.length - 1], -24); assert.equal(seen.length, 12);
});

test('floor_Ring2ToTheSurface_CountsMinus24UpToMinus1', () => {
  const l = freight(); l.place('ring2'); run(l, LIFT_TIMES.dwell + 0.05, at('ring2'));
  const seen = floors(l, at('ring2')); assert.equal(seen[0], -24); assert.equal(seen[seen.length - 1], -1); assert.equal(seen.length, 24);
});

test('call_Refused_WhileBusyAtTheCabinsOwnStopOrForAnUnknownStop', () => {
  const l = freight(); assert.equal(l.call('top'), false); assert.equal(l.call('ring3'), false); assert.equal(l.call(1), false);
  run(l, LIFT_TIMES.dwell + 0.05, at('top')); assert.equal(l.busy, true); assert.equal(l.call('ring2'), false); assert.equal(l.target, 'bottom');
});

test('call_WhileRollingIn_WaitsForRest_AndLeavingThePlatformDropsIt', () => {
  const l = freight(); l.call('ring2');
  assert.deepEqual(run(l, 2, { ...at('top'), speed: 3 }), [], 'still rolling');
  assert.equal(l.step(0.05, at('top'))[0].to, 'ring2');
  const m = freight(); m.call('ring2'); m.step(0.05, { onPlatform: false, speed: 0, level: 'top' }); assert.equal(m.chosen, null);
  assert.equal(run(m, LIFT_TIMES.dwell + 0.05, at('top'))[0].to, 'bottom');
});

test('doorAt_Ring2_OpensOnlyThereAfterTheRide', () => {
  const l = freight(); l.call('ring2'); l.step(0.05, at('top')); run(l, LIFT_TIMES.close + 12 + LIFT_TIMES.open + 0.1, at('ring2'));
  assert.equal(l.doorAt('ring2'), 1); assert.equal(l.doorAt('bottom'), 0); assert.equal(l.doorAt('top'), 0);
});

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

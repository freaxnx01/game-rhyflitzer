import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimClock, simClockNow, simClockSetStepped, simClockAdvance } from '../simclock.js';

test('simClockNow_RealTime_FollowsWall', () => {
  assert.equal(simClockNow(createSimClock(), 1234), 1234);
});
test('simClockSetStepped_On_FreezesAtCurrentTime', () => {
  const c = simClockSetStepped(createSimClock(), true, 5000);
  assert.equal(simClockNow(c, 9000), 5000);
});
test('simClockAdvance_Stepped_ExactSteps', () => {
  let c = simClockSetStepped(createSimClock(), true, 1000);
  for (let i = 0; i < 60; i++) c = simClockAdvance(c, 1 / 60);
  assert.ok(Math.abs(simClockNow(c, 0) - 2000) < 1e-6);
});
test('simClockSetStepped_Off_ContinuesWithoutJump', () => {
  let c = simClockSetStepped(createSimClock(), true, 1000);
  c = simClockAdvance(c, 0.05);
  c = simClockSetStepped(c, false, 70000);
  assert.ok(Math.abs(simClockNow(c, 70000) - 1050) < 1e-6);
  assert.ok(Math.abs(simClockNow(c, 71000) - 2050) < 1e-6);
});
test('simClockSetStepped_SameState_Unchanged', () => {
  const c = simClockSetStepped(createSimClock(), true, 1000);
  assert.deepEqual(simClockSetStepped(c, true, 9999), c);
});
test('simClockAdvance_BadDt_Throws', () => {
  const c = simClockSetStepped(createSimClock(), true, 0);
  assert.throws(() => simClockAdvance(c, 0), RangeError);
  assert.throws(() => simClockAdvance(c, 0.2), RangeError);
});
test('simClockAdvance_RealTime_NoEffect', () => {
  const c = createSimClock();
  assert.deepEqual(simClockAdvance(c, 1 / 60), c);
});

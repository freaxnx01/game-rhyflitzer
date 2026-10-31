import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTowerLift, TOWER_LIFT } from '../towerlift.js';

const LEVELS = Array.from({ length: 10 }, (_, k) => 100 + k * 2.53).concat([100 + 25.3 + 0.5]);
const run = (lift, secs, input = {}, dt = 0.05) => { const ev = []; for (let t = 0; t < secs - 1e-9; t += dt) ev.push(...lift.step(dt, input)); return ev; };

test('createTowerLift_Fresh_StandsAtEgWithTheDoorShut', () => {
  const l = createTowerLift(LEVELS);
  assert.equal(l.at, 0); assert.equal(l.y, LEVELS[0]); assert.equal(l.door, 0); assert.equal(l.busy, false);
});

test('call_ToAnotherLevel_StartsARideThatArrivesThere', () => {
  const l = createTowerLift(LEVELS);
  assert.equal(l.call(5), true);
  const ev = run(l, 30);
  assert.deepEqual(ev.map(e => e.type), ['start', 'arrive']);
  assert.equal(l.at, 5); assert.equal(l.y, LEVELS[5]); assert.equal(l.busy, false);
});

test('call_Roof_ReachesTheRoofLevel', () => {
  const l = createTowerLift(LEVELS);
  l.call(10); run(l, 40);
  assert.equal(l.at, 10); assert.equal(l.y, LEVELS[10]);
});

test('step_DuringTheRide_YRisesMonotonicallyAndTheLeafStaysShut', () => {
  const l = createTowerLift(LEVELS); l.call(4);
  let last = l.y, moved = false;
  for (let i = 0; i < 400 && (l.busy || i < 2); i++) {
    l.step(0.05);
    assert.ok(l.y >= last - 1e-9, 'never down on the way up'); last = l.y;
    if (l.moving) { moved = true; for (let k = 0; k < 11; k++) assert.equal(l.doorOpenAt(k), false); }
  }
  assert.ok(moved);
});

test('call_WhileRiding_IsRefusedAndAnUnknownLevelToo', () => {
  const l = createTowerLift(LEVELS); l.call(3); run(l, 0.5);
  assert.equal(l.call(7), false);
  const m = createTowerLift(LEVELS);
  assert.equal(m.call(11), false); assert.equal(m.call(-1), false); assert.equal(m.call(2.5), false);
});

test('call_AtTheCurrentLevel_OpensTheDoor', () => {
  const l = createTowerLift(LEVELS);
  assert.equal(l.call(0), true);
  run(l, TOWER_LIFT.door + 0.2);
  assert.equal(l.doorOpenAt(0), true);
});

test('step_AfterTheHold_TheDoorClosesUnlessSomeoneIsInside', () => {
  const l = createTowerLift(LEVELS); l.call(2); while (l.busy) l.step(0.05);
  assert.equal(l.doorOpenAt(2), true, 'open on arrival');
  run(l, TOWER_LIFT.hold + 2, { occupied: true }); assert.equal(l.doorOpenAt(2), true, 'kept open');
  run(l, TOWER_LIFT.hold + 2, { occupied: false }); assert.equal(l.door, 0, 'shut again');
});

test('call_RideAfterRide_WorksWithoutLeavingThePlatform', () => {
  const l = createTowerLift(LEVELS);
  l.call(3); run(l, 20); l.call(1); run(l, 20); l.call(9); run(l, 40);
  assert.equal(l.at, 9);
});

test('step_RideTime_GrowsWithTheDistance', () => {
  const dur = (to) => { const l = createTowerLift(LEVELS); l.call(to); let t = 0; while (l.busy && t < 100) { l.step(0.05); t += 0.05; } return t; };
  assert.ok(dur(9) > dur(2));
  assert.ok(dur(1) >= TOWER_LIFT.minRide + 2 * TOWER_LIFT.door - 0.1);
});

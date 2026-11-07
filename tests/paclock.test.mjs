// #726: the pure fleet-clock model for the F3 Postauto section. No DOM, no three.js: node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PA_SPEEDS, wallClock, clockNow, setTime, setFactor, parseFactor, fleetSteps, jumpLimit, clockQuery, clockFromQuery } from '../paclock.js';

test('clockNow_WallMode_FollowsWall', () => assert.equal(clockNow(wallClock(), 5000, 27000), 27000));
test('setTime_RunsOnInRealTime', () => {
  const c = setTime(wallClock(), 27000, 1000);
  assert.equal(clockNow(c, 1000, 0), 27000);
  assert.equal(clockNow(c, 11000, 0), 27010);
});
test('setFactor_RebasesWithoutJump', () => {
  const c = setTime(wallClock(), 27000, 0), d = setFactor(c, 10, 5000, 0);
  assert.equal(clockNow(d, 5000, 0), clockNow(c, 5000, 0));
  assert.equal(clockNow(d, 6000, 0), 27005 + 10);
  assert.equal(d.given, 27000);
});
test('setFactor_FromWall_StartsAtWallTime', () => {
  const d = setFactor(wallClock(), 30, 2000, 40000);
  assert.equal(d.mode, 'set'); assert.equal(d.given, null);
  assert.equal(clockNow(d, 3000, 0), 40030);
});
test('setFactor_WallToOne_StaysWall', () => assert.equal(setFactor(wallClock(), 1, 0, 0).mode, 'wall'));
test('clockNow_WrapsPastMidnight', () => assert.equal(clockNow(setTime(wallClock(), 86395, 0), 10000, 0), 5));
test('parseFactor_OnlyKnownSpeeds', () => {
  for (const f of PA_SPEEDS) assert.equal(parseFactor(String(f)), f);
  for (const bad of ['0', '7', '-5', 'x', '', null]) assert.equal(parseFactor(bad), 1);
});
test('fleetSteps_SubStepsFleetTime', () => {
  assert.deepEqual(fleetSteps(0.05), { n: 1, h: 0.05 });
  const s = fleetSteps(3);   // 60x at the 0.05 s frame clamp
  assert.equal(s.n, 60); assert.ok(Math.abs(s.n * s.h - 3) < 1e-9 && s.h <= 0.05 + 1e-12);
  assert.equal(fleetSteps(1000).n, 64);
  assert.deepEqual(fleetSteps(0), { n: 0, h: 0 });
});
test('jumpLimit_ScalesWithFactor', () => { assert.equal(jumpLimit(1, 5), 5); assert.equal(jumpLimit(60, 5), 300); });
test('clockQuery_NamesSetTimeAndFactor', () => {
  assert.deepEqual(clockQuery(setFactor(setTime(wallClock(), 27000, 0), 10, 0, 0)), { patime: '07:30', pasp: '10' });
  assert.deepEqual(clockQuery(wallClock()), { patime: null, pasp: null });
});
test('clockFromQuery_ParsesPatimeAndFactor', () => {
  assert.deepEqual(clockFromQuery('07:30', '10'), { patime: 27000, factor: 10 });
  assert.deepEqual(clockFromQuery('07:30', null), { patime: 27000, factor: 1 });
  assert.deepEqual(clockFromQuery(null, '30'), { patime: null, factor: 30 });
  assert.deepEqual(clockFromQuery('25:99', '7'), { patime: null, factor: 1 });
});
test('clockFromQuery_ThenInit_CombinesPatimeAndFactor', () => {
  const q = clockFromQuery('07:30', '10');
  let c = q.patime !== null ? setTime(wallClock(), q.patime, 1000) : wallClock();
  if (q.factor > 1) c = setFactor(c, q.factor, 1000, 0);
  assert.equal(c.mode, 'set'); assert.equal(c.given, 27000); assert.equal(c.factor, 10);
  assert.equal(clockNow(c, 1000, 0), 27000);
  assert.equal(clockNow(c, 2000, 0), 27010);
});

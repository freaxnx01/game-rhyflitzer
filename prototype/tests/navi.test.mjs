// #106: the Navi turns a route from route.js plus the car position into a turn instruction. Pure module, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cumulative } from '../route.js';
import { NAVI, turnKind, nextManeuver, roundDistance, newNaviState, naviStep, afterReplan, describe } from '../navi.js';

const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const mk = (pts, joints) => { const cum = cumulative(pts); return { pts, cum, joints, len: cum[cum.length - 1] }; };
// east 100 m, then south 200 m (x east, z south: east-then-south is a right turn), a 3-road junction at the corner
const RIGHT = mk([[0, 0], [100, 0], [100, 200]], [{ s: 100, deg: 3 }]);
const LEFT = mk([[0, 0], [100, 0], [100, -200]], [{ s: 100, deg: 3 }]);
const STRAIGHT = mk([[0, 0], [100, 0], [300, 0]], [{ s: 100, deg: 4 }]);
const BEND = mk([[0, 0], [100, 0], [100, 200]], [{ s: 100, deg: 2 }]);          // a bend, not a junction

test('turnKind classifies the angle and the side', () => {
  const rad = (d) => d * Math.PI / 180;
  assert.equal(turnKind(rad(10)), null);
  assert.equal(turnKind(rad(45)), 'slightRight');
  assert.equal(turnKind(rad(-45)), 'slightLeft');
  assert.equal(turnKind(rad(90)), 'turnRight');
  assert.equal(turnKind(rad(-90)), 'turnLeft');
  assert.equal(turnKind(rad(140)), 'sharpRight');
  assert.equal(turnKind(rad(-140)), 'sharpLeft');
  assert.equal(turnKind(rad(175)), 'uturn');
  assert.equal(turnKind(rad(-175)), 'uturn');
});

test('turnKind uses the same 30 degree threshold as the autopilot blinkers', () => {
  assert.equal(NAVI.minTurnDeg, 30);
});

test('nextManeuver finds the next turn at a junction and its distance', () => {
  const m = nextManeuver(RIGHT, 20);
  assert.equal(m.kind, 'turnRight');
  assert.ok(near(m.dist, 80));
  assert.ok(near(m.s, 100));
  assert.equal(nextManeuver(LEFT, 0).kind, 'turnLeft');
});

test('nextManeuver ignores straight junctions and bends without a junction', () => {
  assert.equal(nextManeuver(STRAIGHT, 0), null);
  assert.equal(nextManeuver(BEND, 0), null);
});

test('nextManeuver drops a turn once it is behind the car', () => {
  assert.ok(nextManeuver(RIGHT, 100 + NAVI.passedM - 1));          // just passed, still shown with distance 0
  assert.equal(nextManeuver(RIGHT, 100 + NAVI.passedM + 1), null);
  assert.equal(nextManeuver(RIGHT, 100 + 2).dist, 0);
});

test('roundDistance rounds in 10 m, 50 m and km steps', () => {
  assert.deepEqual(roundDistance(12), { value: 0, unit: 'm' });
  assert.deepEqual(roundDistance(34), { value: 30, unit: 'm' });
  assert.deepEqual(roundDistance(96), { value: 100, unit: 'm' });
  assert.deepEqual(roundDistance(213), { value: 200, unit: 'm' });
  assert.deepEqual(roundDistance(240), { value: 250, unit: 'm' });
  assert.deepEqual(roundDistance(974), { value: 950, unit: 'm' });
  assert.deepEqual(roundDistance(975), { value: 1, unit: 'km' });
  assert.deepEqual(roundDistance(1449), { value: 1.4, unit: 'km' });
  assert.deepEqual(roundDistance(5400), { value: 5.4, unit: 'km' });
});

test('naviStep tracks progress and reports the maneuver and the distance left', () => {
  const st = newNaviState(), r = naviStep(st, RIGHT, 40, 3, 0.05);
  assert.ok(near(r.s, 40) && near(r.off, 3));
  assert.ok(near(r.left, 260));
  assert.equal(r.man.kind, 'turnRight');
  assert.equal(r.arrived, false);
  assert.equal(r.replan, false);
});

test('naviStep asks for a replan only after 1.5 s off the route, and not twice within 3 s', () => {
  const st = newNaviState();
  st.sincePlan = 10;
  let r;
  for (let t = 0; t < 1.4; t += 0.1) { r = naviStep(st, RIGHT, 50, 60, 0.1); assert.equal(r.replan, false); }
  r = naviStep(st, RIGHT, 50, 60, 0.2);
  assert.equal(r.replan, true);
  afterReplan(st);
  for (let t = 0; t < 2.8; t += 0.1) r = naviStep(st, RIGHT, 50, 60, 0.1);
  assert.equal(r.replan, false);
  r = naviStep(st, RIGHT, 50, 60, 0.5);
  assert.equal(r.replan, true);
});

test('naviStep forgets a short excursion', () => {
  const st = newNaviState(); st.sincePlan = 10;
  for (let i = 0; i < 10; i++) naviStep(st, RIGHT, 50, 60, 0.1);          // 1.0 s off, tracked onto the south leg
  naviStep(st, RIGHT, 100, 60, 0.1);                                      // back on the route, at s = 160
  const r = naviStep(st, RIGHT, 50, 60, 0.1);
  assert.equal(r.replan, false);
});

test('naviStep announces the arrival within 20 m of the end, and only close to the route', () => {
  const st = newNaviState(); st.s = 270;                                   // trackRoute only looks near the last progress
  assert.equal(naviStep(st, RIGHT, 100, 175, 0.05).arrived, false);       // 25 m left
  assert.equal(naviStep(st, RIGHT, 100, 185, 0.05).arrived, true);        // 15 m left
  const far = newNaviState(); far.s = 290;
  assert.equal(naviStep(far, RIGHT, 160, 195, 0.05).arrived, false);       // 60 m beside the end of the route
});

test('naviStep never asks for a replan once it has arrived', () => {
  const st = newNaviState(); st.s = 270; st.offT = 10; st.sincePlan = 10;
  const r = naviStep(st, RIGHT, 100, 190, 0.05);
  assert.equal(r.arrived, true);
  assert.equal(r.replan, false);
});

test('describe says "in", "now" or "destination"', () => {
  const rad = Math.PI / 2;
  const inn = describe({ left: 260, man: { kind: 'turnRight', dist: 80, turn: rad } });
  assert.deepEqual([inn.type, inn.kind, inn.dist.value, inn.dist.unit], ['in', 'turnRight', 80, 'm']);
  assert.ok(near(inn.angle, 90));
  const now = describe({ left: 260, man: { kind: 'turnLeft', dist: 12, turn: -rad } });
  assert.equal(now.type, 'now');
  assert.ok(near(now.angle, -90));
  const dest = describe({ left: 300, man: null });
  assert.deepEqual([dest.type, dest.dist.value, dest.dist.unit, dest.angle], ['dest', 300, 'm', 0]);
});

test('describe reports the distance to the destination, never as 0 m', () => {
  assert.deepEqual(describe({ left: 1430, man: { kind: 'turnRight', dist: 80, turn: 1 } }).left, { value: 1.4, unit: 'km' });
  assert.deepEqual(describe({ left: 25, man: null }).left, { value: 30, unit: 'm' });      // the last 30 m, not "0 m"
  assert.deepEqual(describe({ left: 25, man: null }).dist, { value: 30, unit: 'm' });
});

// #462: the steam loco's track graph, switches and ride. A synthetic network: a trunk east to a Y switch at (100, 0) with a straight
// leg, a right leg (towards +z = south) and a left leg (towards -z), plus a long straight with a buffer stop for the physics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRAIN_CFG, buildTrackGraph, outHeading, branchesAt, pickBranch, nodeAhead, nearestOnGraph, divergingApproaches, wrap,
  trainInput, speedStep, distToEnd, nextSwitch, stepTrain, poseAt, chuffEmit, trainKeyAction,
  TURNTABLE, onTurntable, turnAngle, turnedState } from '../train.js';

const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const TRUNK = [[0, 0], [50, 0], [100, 0]], STRAIGHT = [[100, 0], [200, 0]], RIGHT = [[100.8, 0.5], [150, 30], [200, 60]], LEFT = [[100, 0], [150, -20], [200, -40]];
const yGraph = () => buildTrackGraph([TRUNK, STRAIGHT, RIGHT, LEFT]);
const arriveHeading = (g, arrived) => wrap(outHeading(g, arrived) + Math.PI);

test('buildTrackGraph_EndsWithinSnap_MergeIntoOneNode', () => {
  const g = yGraph();
  assert.equal(g.edges.length, 4);
  const y = g.nodes.find(n => n.ends.length === 4);
  assert.ok(y, 'the Y node joins the trunk end and the three legs (the right leg starts 0.94 m away)');
  assert.equal(g.nodes.length, 5);   // trunk start, Y, and the three leg ends
  close(g.edges[0].len, 100, 1e-9);
});

test('buildTrackGraph_DegeneratePolylines_SkippedNotThrown', () => {
  const g = buildTrackGraph([[[0, 0]], [], [[5, 5], [5, 5]], [[0, 0], [0, 0], [10, 0]]]);
  assert.equal(g.skipped, 3);
  assert.equal(g.edges.length, 1);
  assert.deepEqual(g.edges[0].pts, [[0, 0], [10, 0]], 'duplicate points dropped');
});

test('pickBranch_FromTheTrunk_StraightLeftRight', () => {
  const g = yGraph(), arrived = { edge: 0, end: 1 }, y = g.edges[0].b;
  const br = branchesAt(g, y, arrived, arriveHeading(g, arrived));
  assert.equal(br.length, 3);
  assert.equal(pickBranch(br, 0).edge, 1, 'straight');
  assert.equal(pickBranch(br, -1).edge, 3, 'left = towards -z');
  assert.equal(pickBranch(br, +1).edge, 2, 'right = towards +z');
});

test('pickBranch_FromTheConvergingSide_NoChoice', () => {
  const g = yGraph(), arrived = { edge: 2, end: 0 }, y = g.edges[2].a;   // coming back down the right leg towards the Y
  const br = branchesAt(g, y, arrived, arriveHeading(g, arrived));
  assert.equal(br.length, 1, 'only the trunk lies ahead');
  assert.equal(pickBranch(br, -1).edge, 0);
  assert.equal(pickBranch(br, +1).edge, 0);
});

test('pickBranch_DeadEnd_Null', () => {
  const g = yGraph(), arrived = { edge: 1, end: 1 };
  assert.equal(pickBranch(branchesAt(g, g.edges[1].b, arrived, arriveHeading(g, arrived)), 0), null);
});

test('nodeAhead_FollowsTheMotionNotTheFacing', () => {
  const g = yGraph();
  assert.deepEqual(nodeAhead(g, { edge: 0, s: 30, dir: 1, v: 5 }), { node: g.edges[0].b, arrived: { edge: 0, end: 1 }, dist: 70 });
  assert.deepEqual(nodeAhead(g, { edge: 0, s: 30, dir: 1, v: -2 }), { node: g.edges[0].a, arrived: { edge: 0, end: 0 }, dist: 30 });
});

test('nearestOnGraph_PointBesideTheTrunk', () => {
  const n = nearestOnGraph(yGraph(), 50, 3);
  assert.equal(n.edge, 0); close(n.s, 50, 1e-9); close(n.dist, 3, 1e-9);
});

test('divergingApproaches_OnlyFromTheTrunkSide', () => {
  const a = divergingApproaches(yGraph(), 30);
  assert.equal(a.length, 1);
  assert.deepEqual(a[0], { edge: 0, s: 70, dir: 1, node: yGraph().edges[0].b, left: 3, right: 2, straight: 1 });
});

const LINE = () => buildTrackGraph([[[0, 0], [300, 0]]]);   // one edge, both ends buffer stops
const run = (g, st, input, secs, dt = 1 / 60) => { const events = []; for (let i = 0; i < Math.round(secs / dt); i++) { const r = stepTrain(st, input, g, dt); st = r.state; events.push(...r.events); } return { st, events }; };
const ST = (o) => ({ edge: 0, s: 10, dir: 1, v: 0, choice: 0, atEnd: false, ...o });
const NONE = { throttle: 0, brake: 0 }, GAS = { throttle: 1, brake: 0 }, BRAKE = { throttle: 0, brake: 1 };

test('trainInput_WAndS_ThrottleAndBrake', () => {
  assert.deepEqual(trainInput({ KeyW: true }), { throttle: 1, brake: 0 });
  assert.deepEqual(trainInput({ ArrowDown: true }), { throttle: 0, brake: 1 });
  assert.deepEqual(trainInput({}), { throttle: 0, brake: 0 });
});

test('speedStep_Throttle_AcceleratesToTop', () => {
  let v = 0; for (let i = 0; i < 60 * 60; i++) v = speedStep(v, GAS, 1 / 60);
  close(v, TRAIN_CFG.top, 1e-9);
  close(speedStep(0, GAS, 5), 5 * TRAIN_CFG.accel, 1e-9);
});

test('speedStep_NoInput_CoastsSlowly', () => {
  close(speedStep(10, NONE, 10), 10 - 10 * TRAIN_CFG.coast, 1e-9);
  assert.equal(speedStep(0.01, NONE, 1), 0);
});

test('speedStep_BrakeHeld_StopsThenReversesToTheCap', () => {
  let v = 10; for (let i = 0; i < 60 * 30; i++) v = speedStep(v, BRAKE, 1 / 60);
  close(v, -TRAIN_CFG.reverseMax, 1e-9);
});

test('stepTrain_Throttle_MovesAlongTheEdge', () => {
  const { st } = run(LINE(), ST(), GAS, 5);
  close(st.v, 5, 0.02); close(st.s, 10 + 12.5, 0.2); assert.equal(st.edge, 0);
});

test('stepTrain_CoastingToABufferStop_Stops2mBeforeTheEnd_OneEvent', () => {
  const { st, events } = run(LINE(), ST({ s: 200, v: 20 }), NONE, 30);
  assert.equal(st.v, 0); close(st.s, 298, 0.1); assert.equal(st.atEnd, true);
  assert.deepEqual(events, [{ type: 'trackEnd' }]);
  const again = run(LINE(), st, GAS, 3);
  assert.deepEqual(again.events, [], 'throttle into the buffer stop: no second toast');
  close(again.st.s, 298, 0.1);
  const back = run(LINE(), st, BRAKE, 5);
  assert.ok(back.st.s < 290 && back.st.atEnd === false, 'reversing away is free');
});

test('stepTrain_ChoiceLeftThroughTheY_TakesTheLeftLegAndResets', () => {
  const { st } = run(yGraph(), ST({ s: 80, v: 10, choice: -1 }), NONE, 4);
  assert.equal(st.edge, 3); assert.equal(st.choice, 0); assert.equal(st.dir, 1);
});

test('stepTrain_NoChoiceThroughTheY_GoesStraight', () => {
  const { st } = run(yGraph(), ST({ s: 80, v: 10 }), NONE, 4);
  assert.equal(st.edge, 1);
});

test('stepTrain_ReversingOverASwitch_FollowsTheStraightBranch', () => {
  // on the straight leg facing east (dir +1), reversing (v < 0) = moving west, back over the Y onto the trunk
  const g = yGraph();
  const { st } = run(g, { edge: 1, s: 20, dir: 1, v: -6, choice: 0, atEnd: false }, NONE, 6);
  assert.equal(st.edge, 0, 'backed over the Y onto the trunk');
  assert.ok(st.v < 0 && st.dir === 1, 'still facing east, still reversing');
  const p = poseAt(g, st); close(p.z, 0, 1e-9);
});

test('poseAt_FacingFollowsDir', () => {
  const g = yGraph();
  const f = poseAt(g, ST({ s: 50 })), b = poseAt(g, ST({ s: 50, dir: -1 }));
  close(f.x, 50, 1e-9); close(f.z, 0, 1e-9); close(f.th, 0, 1e-9); close(Math.abs(b.th), Math.PI, 1e-9);
});

test('distToEnd_And_nextSwitch', () => {
  assert.equal(distToEnd(LINE(), ST({ s: 280, v: 1 })), 20);
  assert.equal(distToEnd(LINE(), ST({ s: 50, v: 1 })), Infinity, 'beyond endBrakeDist + endGap (212 m)');
  const n = nextSwitch(yGraph(), ST({ s: 70, v: 3 }));
  close(n.dist, 30, 1e-9); assert.equal(n.branches.length, 3);
  assert.equal(nextSwitch(yGraph(), { edge: 1, s: 50, dir: -1, v: 3, choice: 0 }), null, 'westbound on the straight leg: the Y converges');
});

test('chuffEmit_RateFollowsTheWheels_TrickleAtRest', () => {
  assert.deepEqual(chuffEmit(0, 0, 1), { acc: TRAIN_CFG.idleChuff, n: 0 });
  const oneRev = 2 * Math.PI * TRAIN_CFG.wheelR;
  assert.equal(chuffEmit(0, oneRev, 1).n, TRAIN_CFG.chuffsPerRev);
  assert.equal(chuffEmit(0, -oneRev, 1).n, TRAIN_CFG.chuffsPerRev, 'reversing chuffs too');
});

test('trainKeyAction_SwitchWhistleResetCamera_CarKeysBlocked', () => {
  assert.equal(trainKeyAction('KeyQ'), 'left'); assert.equal(trainKeyAction('KeyE'), 'right');
  assert.equal(trainKeyAction('KeyH'), 'whistle'); assert.equal(trainKeyAction('KeyR'), 'reset'); assert.equal(trainKeyAction('KeyC'), 'camera');
  for (const k of ['KeyF', 'KeyX', 'KeyU', 'KeyO', 'KeyI', 'KeyL', 'Digit1', 'KeyV', 'Enter', 'NumpadEnter']) assert.equal(trainKeyAction(k), 'block', k);
  for (const k of ['KeyW', 'KeyS', 'KeyM', 'KeyJ', 'KeyT', 'Tab', 'F1', 'Escape']) assert.equal(trainKeyAction(k), 'pass', k);
});

test('onTurntable_AtRestNearHome_TrueMovingOrFar_False', () => {
  const g = yGraph(), home = { edge: 0, s: 50, dir: 1, v: 0, choice: 0, atEnd: false };
  assert.equal(onTurntable(g, { ...home, s: 52 }, home), true);
  assert.equal(onTurntable(g, { ...home, s: 52, v: 1 }, home), false, 'moving');
  assert.equal(onTurntable(g, { ...home, s: 54 }, home), false, '4 m off');
});

test('turnAngle_EasesFromZeroToPi_Clamped', () => {
  close(turnAngle(0), 0, 1e-9); close(turnAngle(TURNTABLE.turnTime / 2), Math.PI / 2, 1e-9);
  close(turnAngle(TURNTABLE.turnTime), Math.PI, 1e-9); close(turnAngle(99), Math.PI, 1e-9); close(turnAngle(-1), 0, 1e-9);
  assert.ok(turnAngle(0.5) < Math.PI * 0.5 / TURNTABLE.turnTime, 'slow start');
});

test('turnedState_OnHomeEdge_CentredAtRestFacingBack', () => {
  const g = yGraph(), home = { edge: 0, s: 50, dir: 1, v: 0, choice: 0, atEnd: false };
  const t = turnedState(g, { ...home, s: 52, choice: 1, atEnd: true }, home);
  assert.deepEqual({ edge: t.edge, s: t.s, dir: t.dir, v: t.v, choice: t.choice, atEnd: t.atEnd }, { edge: 0, s: 50, dir: -1, v: 0, choice: 0, atEnd: false });
  close(Math.abs(wrap(poseAt(g, t).th - poseAt(g, home).th)), Math.PI, 1e-6, 'faces back');
  const back = turnedState(g, t, home);
  assert.equal(back.dir, 1, 'turning twice faces the start way again');
});

test('turnedState_FromNeighbouringEdge_StillFlipsTheHeading', () => {
  const g = yGraph(), home = { edge: 0, s: 99, dir: 1, v: 0, choice: 0, atEnd: false };
  const across = { edge: 1, s: 1, dir: 1, v: 0, choice: 0, atEnd: false };   // just past the Y node on the straight leg, facing east
  const t = turnedState(g, across, home);
  assert.equal(t.edge, 0); assert.equal(t.s, 99);
  close(Math.abs(wrap(poseAt(g, t).th - poseAt(g, across).th)), Math.PI, 1e-6);
});

test('trainKeyAction_AD_TurnOnTheTurntable', () => {
  assert.equal(trainKeyAction('KeyA'), 'turnLeft'); assert.equal(trainKeyAction('KeyD'), 'turnRight');
});

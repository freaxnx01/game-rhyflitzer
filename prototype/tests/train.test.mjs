// #462: the steam loco's track graph, switches and ride. A synthetic network: a trunk east to a Y switch at (100, 0) with a straight
// leg, a right leg (towards +z = south) and a left leg (towards -z), plus a long straight with a buffer stop for the physics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRAIN_CFG, buildTrackGraph, outHeading, branchesAt, pickBranch, nodeAhead, nearestOnGraph, divergingApproaches, wrap } from '../train.js';

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

// #18: autopilot — road graph, A* route, turn signals, speed and steering rules. Pure module, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTO, CLASS_KMH, TAKE_OVER_KEYS, buildGraph, snapToGraph, findRoute, turnAt, routeSignals, blinkerAt, trackRoute, steerToward, targetSpeed, autoStep, placeName, streetEntries, placeChips } from '../route.js';

const road = (pts, cls = 'residential', extra = {}) => ({ n: '', cls, w: 6, bridge: false, pts, ...extra });
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const degree = (g, x, z) => { const i = g.nodes.findIndex((n) => near(n.x, x) && near(n.z, z)); return i < 0 ? -1 : g.adj[i].length; };
// a plus sign: two roads crossing at a shared vertex (0, 0)
const PLUS = [road([[-100, 0], [0, 0], [100, 0]]), road([[0, -100], [0, 0], [0, 100]])];

test('buildGraph puts a node where two roads share a vertex', () => {
  const g = buildGraph(PLUS);
  assert.equal(degree(g, 0, 0), 4);
  assert.equal(g.edges.length, 4);
  assert.ok(g.edges.every((e) => near(e.len, 100)));
});

test('buildGraph joins a road end that touches another road within AUTO.snap, not further away', () => {
  const t = buildGraph([road([[-100, 0], [100, 0]]), road([[30, 1], [30, 80]])]);
  assert.equal(degree(t, 30, 0), 3);
  assert.equal(t.main.reduce((a, b) => a + b, 0), 4);
  const far = buildGraph([road([[-100, 0], [100, 0]]), road([[30, 3], [30, 80]]), road([[-100, 0], [-100, -50]])]);
  assert.equal(degree(far, 30, 0), -1);
  assert.equal(far.main.reduce((a, b) => a + b, 0), 3);   // the loose road is not in the main network
});

test('buildGraph skips footways, paths and steps, keeps bridges and never joins onto the middle of a bridge', () => {
  const g = buildGraph([road([[-100, 0], [100, 0]], 'primary', { bridge: true }), road([[0, 1], [0, 80]]), road([[0, 0], [0, -80]], 'footway')]);
  assert.equal(g.edges.filter((e) => e.road.bridge).length, 1);
  assert.ok(g.edges.every((e) => e.road.cls !== 'footway'));
  assert.equal(degree(g, 0, 0), -1);
});

test('snapToGraph finds the nearest point on the main network, within maxDist only', () => {
  const g = buildGraph(PLUS), s = snapToGraph(g, 40, 5);
  assert.ok(near(s.x, 40) && near(s.z, 0) && near(s.d, 5));
  assert.ok(near(g.edges[s.e].len, 100));
  assert.equal(snapToGraph(g, 40, 50, 30), null);
});

// a 100 m square with a diagonal: from (10, 0) to (90, 100) both ways round the square are 200 m, the diagonal 161 m
const SQUARE = [road([[0, 0], [100, 0]]), road([[100, 0], [100, 100]]), road([[0, 0], [0, 100]]), road([[0, 100], [100, 100]]), road([[0, 0], [50, 50], [100, 100]], 'service')];

test('findRoute takes the shortest way and starts and ends at the snapped points', () => {
  const g = buildGraph(SQUARE), r = findRoute(g, snapToGraph(g, 10, 2), [snapToGraph(g, 90, 103)]);
  assert.deepEqual(r.pts[0], [10, 0]);
  assert.deepEqual(r.pts[r.pts.length - 1], [90, 100]);
  assert.ok(near(r.len, 10 + Math.hypot(100, 100) + 10, 1e-6));   // back to (0,0), the diagonal, back to (90,100)
  assert.equal(r.road.length, r.pts.length - 1);
  assert.ok(r.road.some((x) => x.cls === 'service'));
});

test('findRoute stays on one edge when start and goal share it, and picks the nearest of several goals', () => {
  const g = buildGraph(PLUS);
  const same = findRoute(g, snapToGraph(g, 10, 0), [snapToGraph(g, 60, 0)]);
  assert.ok(near(same.len, 50));
  const two = findRoute(g, snapToGraph(g, 10, 0), [snapToGraph(g, -90, 0), snapToGraph(g, 0, 20)]);
  assert.deepEqual(two.pts[two.pts.length - 1], [0, 20]);
  assert.equal(findRoute(g, snapToGraph(g, 10, 0), []), null);
});

test('route joints carry the junction degree', () => {
  const g = buildGraph(PLUS), r = findRoute(g, snapToGraph(g, -50, 0), [snapToGraph(g, 0, 50)]);
  assert.deepEqual(r.joints.map((j) => j.deg), [4]);
  assert.ok(near(r.joints[0].s, 50));
});

test('turn signals: right and left at junctions, none straight on or at a plain bend', () => {
  const g = buildGraph(PLUS);
  const right = findRoute(g, snapToGraph(g, -50, 0), [snapToGraph(g, 0, 50)]);    // east, then south (+z) = right
  const left = findRoute(g, snapToGraph(g, -50, 0), [snapToGraph(g, 0, -50)]);    // east, then north = left
  const straight = findRoute(g, snapToGraph(g, -50, 0), [snapToGraph(g, 50, 0)]);
  assert.deepEqual(routeSignals(right), [{ s: 50, side: 'right' }]);
  assert.deepEqual(routeSignals(left), [{ s: 50, side: 'left' }]);
  assert.deepEqual(routeSignals(straight), []);
  const bendG = buildGraph([road([[0, 0], [100, 0], [100, 100]])]);
  assert.deepEqual(routeSignals(findRoute(bendG, snapToGraph(bendG, 10, 0), [snapToGraph(bendG, 100, 90)])), []);
  assert.ok(turnAt(right, 50) > 0 && turnAt(left, 50) < 0);
});

test('blinkerAt is on from AUTO.signalBefore before the turn to AUTO.signalAfter after it', () => {
  const sig = [{ s: 100, side: 'left' }];
  assert.equal(blinkerAt(sig, 100 - AUTO.signalBefore - 1), null);
  assert.equal(blinkerAt(sig, 100 - AUTO.signalBefore), 'left');
  assert.equal(blinkerAt(sig, 100 + AUTO.signalAfter), 'left');
  assert.equal(blinkerAt(sig, 100 + AUTO.signalAfter + 1), null);
});

test('trackRoute follows progress and reports the distance to the route', () => {
  const g = buildGraph(PLUS), r = findRoute(g, snapToGraph(g, -100, 0), [snapToGraph(g, 100, 0)]);
  const t = trackRoute(r, 30, 4, 100);
  assert.ok(near(t.s, 130) && near(t.d, 4));
});

test('steerToward steers right (positive) towards a route that bends right, left for a left bend', () => {
  const g = buildGraph(PLUS);
  const right = findRoute(g, snapToGraph(g, -5, 0), [snapToGraph(g, 0, 50)]);
  const left = findRoute(g, snapToGraph(g, -5, 0), [snapToGraph(g, 0, -50)]);
  assert.ok(steerToward(right, 0, -5, 0, 0, 5).steer > 0);
  assert.ok(steerToward(left, 0, -5, 0, 0, 5).steer < 0);
  assert.ok(Math.abs(steerToward(right, 0, -5, 0, 0, 5).steer) <= 1);
});

test('targetSpeed: road class, bridges, bends and the stop at the end', () => {
  const long = (cls, extra) => { const g = buildGraph([road([[0, 0], [2000, 0]], cls, extra)]); return findRoute(g, snapToGraph(g, 0, 0), [snapToGraph(g, 2000, 0)]); };
  assert.ok(near(targetSpeed(long('residential'), 500), CLASS_KMH.residential / 3.6));
  assert.ok(near(targetSpeed(long('primary'), 500), CLASS_KMH.primary / 3.6));
  assert.ok(near(targetSpeed(long('primary', { bridge: true }), 500), AUTO.bridgeKmh / 3.6));
  const r = long('primary');
  assert.ok(targetSpeed(r, r.len - 2) < 0.01);
  assert.ok(targetSpeed(r, r.len - 20) < targetSpeed(r, r.len - 40));
  const g = buildGraph([road([[0, 0], [300, 0], [300, 300]], 'primary')]), bend = findRoute(g, snapToGraph(g, 0, 0), [snapToGraph(g, 300, 300)]);
  assert.ok(targetSpeed(bend, 300) < 7);                                       // in a 90° corner
  assert.ok(targetSpeed(bend, 100) > targetSpeed(bend, 280));                  // slows down before it
});

test('autoStep drives, arrives, notices leaving the route and gives up when stuck', () => {
  const g = buildGraph([road([[0, 0], [500, 0]])]), route = findRoute(g, snapToGraph(g, 0, 0), [snapToGraph(g, 500, 0)]);
  const st = () => ({ route, s: 0, signals: [], stuckT: 0 });
  const go = autoStep(st(), { x: 0, z: 0, th: 0, vf: 0, speed: 0 }, 1 / 60);
  assert.equal(go.status, 'drive'); assert.equal(go.gas, 1); assert.equal(go.brake, 0);
  assert.equal(autoStep(st(), { x: 100, z: 0, th: 0, vf: 25, speed: 25 }, 1 / 60).brake, 1);
  assert.equal(autoStep({ ...st(), s: 490 }, { x: 495, z: 0, th: 0, vf: 1, speed: 1 }, 1 / 60).status, 'arrived');
  assert.equal(autoStep(st(), { x: 0, z: AUTO.offRoute + 1, th: 0, vf: 0, speed: 0 }, 1 / 60).status, 'off-route');
  const stuck = st(); let s = 'drive';
  for (let i = 0; i < 60 * (AUTO.stuckSecs + 0.5) && s === 'drive'; i++) s = autoStep(stuck, { x: 50, z: 0, th: 0, vf: 0, speed: 0 }, 1 / 60).status;
  assert.equal(s, 'stuck');
});

test('TAKE_OVER_KEYS: steering, gas, brake, handbrake, nitro and O; not the turn signals or the camera', () => {
  for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ControlLeft', 'ControlRight', 'KeyN', 'KeyO']) assert.ok(TAKE_OVER_KEYS.has(k), k);
  for (const k of ['KeyQ', 'KeyE', 'KeyC', 'KeyB', 'Tab', 'KeyH', 'Enter']) assert.ok(!TAKE_OVER_KEYS.has(k), k);
});

test('placeName turns a village sign into a place name', () => {
  assert.equal(placeName('BAD SÄCKINGEN'), 'Bad Säckingen');
  assert.equal(placeName('MÜNCHWILEN'), 'Münchwilen');
});

test('streetEntries: one entry per street name and nearest village, sorted west to east, unnamed roads skipped', () => {
  const villages = [{ t: 'OST', x: 1000, z: 0 }, { t: 'WEST', x: -1000, z: 0 }];
  const g = buildGraph([road([[-1000, 0], [-900, 0]], 'residential', { n: 'Hauptstrasse' }), road([[-900, 0], [-800, 0]], 'residential', { n: 'Hauptstrasse' }),
    road([[-800, 0], [900, 0]]), road([[900, 0], [1000, 0]], 'residential', { n: 'Hauptstrasse' }), road([[900, 0], [900, 100]], 'residential', { n: 'Bachweg' })]);
  const e = streetEntries(g, villages);
  assert.deepEqual(e.map((s) => [s.n, s.g, s.goals.length]), [['Hauptstrasse', 'West', 2], ['Bachweg', 'Ost', 1], ['Hauptstrasse', 'Ost', 1]]);
  assert.ok(e.every((s) => s.street));
  assert.deepEqual(placeChips([{ g: 'Stein' }, { g: 'Sisseln' }, { g: 'Stein' }, { g: null }]), ['Stein', 'Sisseln']);
});

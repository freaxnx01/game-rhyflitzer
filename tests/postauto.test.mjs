// #500: Postautos drive line 133 by the weekday timetable. Pure module, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../route.js';
import { BUS } from '../bus.js';
import { PA, zurichSeconds, parsePatime, busRoute, busOffset, busPose } from '../postauto.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const road = (pts, cls = 'primary', extra = {}) => ({ n: '', cls, w: 6, bridge: false, pts, ...extra });
// a primary road east along z = 0 with a residential cross road at x = 500 (shared vertex: a 4-way junction)
const MAIN = road([[0, 0], [500, 0], [1000, 0]]), CROSS = road([[500, -100], [500, 0], [500, 100]], 'residential');
const ROADS = [MAIN, CROSS], G = buildGraph(ROADS);
const stop = (uic, s) => ({ uic, name: 'S' + uic, s, x: s, z: 3.5, rot: 0 });   // at the kerb right of eastward travel: w/2 + 0.5
const BR = { id: 1, line: '133', pts: [[0, 0], [500, 0], [1000, 0]], stops: [stop('1', 100), stop('2', 400), stop('3', 900)] };
const R = busRoute(BR, ROADS, G);

test('zurichSeconds: Europe/Zurich local time, winter and summer', () => {
  assert.equal(zurichSeconds(new Date('2026-01-15T06:30:00Z')), 7.5 * 3600);    // CET, UTC+1
  assert.equal(zurichSeconds(new Date('2026-07-15T06:30:00Z')), 8.5 * 3600);    // CEST, UTC+2
  assert.equal(zurichSeconds(new Date('2026-07-15T22:15:30Z')), 15 * 60 + 30); // past midnight in Zurich
});

test('parsePatime: HH:MM to seconds, anything else null', () => {
  assert.equal(parsePatime('07:30'), 27000);
  assert.equal(parsePatime('00:00'), 0);
  for (const bad of ['7:30', '24:00', '12:60', '', null, 'x']) assert.equal(parsePatime(bad), null, String(bad));
});

test('busRoute: road per segment, junction joints, stops with kerb distance', () => {
  assert.equal(R.len, 1000);
  assert.deepEqual(R.road, [MAIN, MAIN]);
  assert.deepEqual(R.joints, [{ s: 500, deg: 4 }]);
  assert.deepEqual(R.signals, []);   // straight through
  assert.ok(R.stops.every((st) => near(st.kerb, 3.5)));
  assert.equal(R.stopS.get('2'), 400);
});

test('busRoute: a turn onto the cross road is on the cross road and signals right', () => {
  const turn = busRoute({ id: 2, line: '133', pts: [[0, 0], [500, 0], [500, 100]], stops: [] }, ROADS, G);
  assert.deepEqual(turn.road, [MAIN, CROSS]);
  assert.equal(turn.signals.length, 1);
  assert.equal(turn.signals[0].side, 'right');   // east, then south: th grows
});

test('busOffset: the lane away from stops, out to the kerb at a stop, blended', () => {
  const kerb = 3.5 - BUS.width / 2 - PA.kerbGap;
  assert.ok(near(busOffset(R, 250), 1.5));
  assert.ok(near(busOffset(R, 400), kerb));
  const mid = busOffset(R, 400 - PA.pullIn / 2);
  assert.ok(mid > 1.5 && mid < kerb);
  assert.ok(near(busOffset(R, 400 + PA.pullOut + 1), 1.5));
});

test('busPose: on the right of travel, heading along the route', () => {
  const p = busPose(R, 250);
  assert.ok(near(p.x, 250) && near(p.z, 1.5) && near(p.th, 0));
});

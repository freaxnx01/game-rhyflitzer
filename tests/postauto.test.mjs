// #500: Postautos drive line 133 by the weekday timetable. Pure module, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../route.js';
import { BUS } from '../bus.js';
import { PA, zurichSeconds, parsePatime, busRoute, busOffset, busPose, tripCalls, tripWindow, tripTime, tripKey, placeTrip } from '../postauto.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const road = (pts, cls = 'primary', extra = {}) => ({ n: '', cls, w: 6, bridge: false, pts, ...extra });
// a primary road east along z = 0 with a residential cross road at x = 500 (shared vertex: a 4-way junction)
const MAIN = road([[0, 0], [500, 0], [1000, 0]]), CROSS = road([[500, -100], [500, 0], [500, 100]], 'residential');
const ROADS = [MAIN, CROSS], G = buildGraph(ROADS);
const DAY_SECS = 86400;
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

const TRIP = { line: '133', route: 1, to: 'Ende, Bahnhof', fromOutside: false, toOutside: false,
  calls: [['1', 36000, 36000], ['2', 36100, 36120], ['3', 36200, 36200]] };

test('placeTrip: outside the window null, standing at stops, driving between them by time', () => {
  assert.equal(placeTrip(TRIP, R, 35000), null);
  assert.equal(placeTrip(TRIP, R, 36300), null);
  let b = placeTrip(TRIP, R, 35950);
  assert.equal(b.phase, 'stand'); assert.equal(b.k, 0); assert.equal(b.s, 100); assert.equal(b.until, 36000);
  b = placeTrip(TRIP, R, 36050);
  assert.equal(b.phase, 'drive'); assert.equal(b.k, 1); assert.ok(near(b.s, 250));
  b = placeTrip(TRIP, R, 36110);
  assert.equal(b.phase, 'stand'); assert.equal(b.k, 1); assert.equal(b.until, 36120);
  b = placeTrip(TRIP, R, 36230);
  assert.equal(b.phase, 'stand'); assert.equal(b.k, 2); assert.equal(b.until, 36200 + PA.layover);
  assert.equal(b.key, tripKey(TRIP));
});

test('placeTrip: a trip past midnight runs on the service-day clock', () => {
  const late = { ...TRIP, calls: [['1', 86380, 86380], ['2', 86450, 86460], ['3', 86500, 86500]] };
  const b = placeTrip(late, R, 70);   // 00:01:10 = 86470 on the service day
  assert.equal(b.phase, 'drive'); assert.equal(b.k, 2); assert.equal(b.shift, DAY_SECS);
  assert.ok(near(b.s, 400 + 500 * 10 / 40));
});

test('placeTrip: fromOutside enters at the route start, toOutside leaves at the end', () => {
  const inbound = { ...TRIP, fromOutside: true };
  assert.ok(near(tripWindow(inbound, tripCalls(inbound, R), R).from, 36000 - 100 / PA.edgeSpeed));
  const b = placeTrip(inbound, R, 35995);
  assert.equal(b.phase, 'drive'); assert.equal(b.k, 0); assert.ok(near(b.s, 100 - 5 * PA.edgeSpeed));
  const outbound = { ...TRIP, toOutside: true, calls: [['1', 36000, 36000], ['2', 36100, 36120], ['3', 36200, 36210]] };
  const o = placeTrip(outbound, R, 36215);
  assert.equal(o.phase, 'drive'); assert.equal(o.k, 3); assert.ok(near(o.s, 900 + 5 * PA.edgeSpeed));
});

test('tripCalls: a call at a stop not on the route drops the trip', () => {
  assert.equal(tripCalls({ ...TRIP, calls: [['1', 1, 1], ['99', 2, 2]] }, R), null);
  assert.equal(tripTime({ from: 10, to: 20 }, 15), 15);
  assert.equal(tripTime({ from: 86390, to: 86500 }, 50), 86450);
  assert.equal(tripTime({ from: 10, to: 20 }, 25), null);
});

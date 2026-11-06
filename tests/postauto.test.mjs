// #500: Postautos drive line 133 by the weekday timetable. Pure module, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../route.js';
import { BUS } from '../bus.js';
import { PA, zurichSeconds, parsePatime, busRoute, busOffset, busPose, tripCalls, tripWindow, tripTime, tripKey, placeTrip,
  busTarget, stepBus, busBlinker, obstacleGap, syncFleet, fleetJumped, busCollider, ledText, stopFaceDeg } from '../postauto.js';

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
  assert.equal(tripTime({ from: -60, to: 500 }, 86380), -20);   // a window opening before midnight, seen the evening before
  assert.equal(tripTime({ from: 10, to: 20 }, 25), null);
});

// runs a bus from wall time t0 for secs at 20 Hz; player(t) gives { x, z, r } or null; returns the samples
function run(b, t0, secs, player = () => null, dt = 0.05) {
  const out = [];
  for (let t = t0; t < t0 + secs; t += dt) {
    const p = player(t), gap = p && b.phase === 'drive' ? obstacleGap(b.route, b.s, p) : null;
    stepBus(b, t, dt, gap);
    out.push({ t, s: b.s, v: b.v, phase: b.phase, k: b.k, blinker: busBlinker(b, t) });
  }
  return out;
}

test('stepBus: leaves on time, stops at the next stop, stands until the departure time', () => {
  const b = placeTrip(TRIP, R, 35950), log = run(b, 35950, 180);
  const left = log.find((x) => x.phase === 'drive');
  assert.ok(left.t >= 36000 && left.t < 36000.1);
  const at = log.find((x) => x.t >= 36100);
  assert.equal(at.phase, 'stand'); assert.equal(at.k, 1); assert.equal(at.s, 400);
  const again = log.find((x) => x.k === 2 && x.phase === 'drive');
  assert.ok(again.t >= 36120);
});

test('stepBus: a late bus stands the minimum dwell only', () => {
  const late = { ...TRIP, calls: [['1', 36000, 36000], ['2', 36005, 36005], ['3', 36200, 36200]] };
  const log = run(placeTrip(late, R, 35999), 35999, 120);
  const arrive = log.find((x) => x.k === 1 && x.phase === 'stand'), leave = log.find((x) => x.k === 2);
  assert.ok(near(leave.t - arrive.t, PA.minDwell, 0.11));
});

test('stepBus: 30 km/h through the junction, blinkers at the stop, gone after the layover', () => {
  const log = run(placeTrip(TRIP, R, 36115), 36115, 160);
  const junction = log.filter((x) => x.s > 500 - PA.junctionBefore && x.s < 500 + PA.junctionAfter);
  assert.ok(junction.length && junction.every((x) => x.v <= PA.junctionKmh / 3.6 + 0.15));   // + one 20 Hz step of braking lag
  assert.ok(log.some((x) => x.s > 600 && x.s < 850 && x.v > PA.junctionKmh / 3.6 + 1));   // primary: faster again after it
  assert.equal(log.find((x) => x.phase === 'drive').blinker, 'left');                     // pulling out of stop 2
  assert.equal(log.find((x) => x.phase === 'drive' && x.s > 900 - PA.pullIn + 1).blinker, 'right');
  const end = log.find((x) => x.k === 2 && x.phase === 'stand');
  assert.equal(log.find((x) => x.phase === 'done')?.t >= end.t + PA.layover - 0.1, true);
});

test('obstacleGap: the player in the lane ahead, not beside, behind or far ahead', () => {
  const p = (x, z) => ({ x, z, r: 1 });
  assert.ok(near(obstacleGap(R, 270, p(300, 1.5)), 30 - BUS.length / 2 - 1 - PA.gap));
  assert.equal(obstacleGap(R, 270, p(300, -3)), null);
  assert.equal(obstacleGap(R, 270, p(200, 1.5)), null);
  assert.equal(obstacleGap(R, 270, p(270 + PA.look + 5, 1.5)), null);
});

test('stepBus: waits for a player in the lane and drives on when he leaves', () => {
  const b = placeTrip(TRIP, R, 36050);   // driving to stop 2 (s 400) from s 250
  const blocked = run(b, 36050, 20, () => ({ x: 330, z: 1.5, r: 1 }));
  const last = blocked[blocked.length - 1];
  assert.equal(last.v, 0);
  assert.ok(last.s <= 330 - BUS.length / 2 - 1 - PA.gap + 0.5 && last.s > 300);
  const free = run(b, 36070, 60);
  assert.ok(free.some((x) => x.k === 1 && x.phase === 'stand' && x.s === 400));
});

const ROUTES = new Map([[1, R]]);

test('syncFleet: starts buses for open windows, keeps finished ones until the window closes, caps the count', () => {
  assert.equal(syncFleet([], [TRIP], ROUTES, 35000).length, 0);
  const fleet = syncFleet([], [TRIP], ROUTES, 35950);
  assert.equal(fleet.length, 1);
  assert.equal(syncFleet(fleet, [TRIP], ROUTES, 35951).length, 1);   // no second bus for the same trip
  fleet[0].phase = 'done';
  const kept = syncFleet(fleet, [TRIP], ROUTES, 36250);
  assert.equal(kept.length, 1); assert.equal(kept[0].phase, 'done');   // not placed again
  assert.equal(syncFleet(kept, [TRIP], ROUTES, 36300).length, 0);
  assert.equal(syncFleet([], [TRIP], ROUTES, 35950, { ...PA, maxBuses: 0 }).length, 0);
  assert.equal(syncFleet([], [{ ...TRIP, route: 99 }], ROUTES, 35950).length, 0);   // unknown route
});

test('fleetJumped: more than PA.resync beyond the frame time', () => {
  assert.equal(fleetJumped(100, 100.05, 0.05), false);
  assert.equal(fleetJumped(100, 130, 0.05), true);
  assert.equal(fleetJumped(86399, 1, 0.05), true);   // midnight: placed again, harmless
});

test('busCollider, ledText, stopFaceDeg', () => {
  const o = busCollider(10, 20, Math.PI / 2, 5);
  assert.equal(o.hw, BUS.length / 2); assert.equal(o.hd, BUS.width / 2);
  assert.ok(near(o.c, 0) && near(o.s, 1)); assert.equal(o.h, 5 + BUS.height); assert.equal(o.low, true);
  assert.deepEqual(ledText(TRIP), { line: '133', dest: 'Ende, Bahnhof' });
  assert.ok(near(stopFaceDeg(0), 180));          // travel east: local -z (shelter) points south, right of travel
  assert.ok(near(stopFaceDeg(Math.PI / 2), 90));  // travel south: shelter to the west
});

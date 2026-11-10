// #500: Postautos drive line 133 by the weekday timetable. Pure module, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildGraph, rightOf } from '../route.js';
import { BUS } from '../bus.js';
import { PA, zurichSeconds, parsePatime, busRoute, busOffset, busPose, tripCalls, tripWindow, tripTime, tripKey, placeTrip,
  busTarget, stepBus, busBlinker, obstacleGap, syncFleet, fleetJumped, busCollider, ledText,
  driveLine, drivePoint, lanePoint, linkTrips, fleetRuns, placeRun } from '../postauto.js';
import { fleetSteps } from '../paclock.js';   // #726

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

// #726: the same fleet seconds in sub-steps of at most 0.05 s (a 60x frame at the dt clamp) keep the timetable
test('stepBus: sub-stepped fleet time keeps the timetable', () => {
  const a = placeTrip(TRIP, R, 36050), b = placeTrip(TRIP, R, 36050);
  run(a, 36050, 30);   // 30 s of fleet time in 0.05 s steps
  const { n, h } = fleetSteps(3);   // one 60x frame: 3 s of fleet time
  assert.ok(n === 60 && h <= 0.05 + 1e-12);
  for (let f = 0; f < 10; f++) for (let i = 0; i < n && b.phase !== 'done'; i++) stepBus(b, 36050 + f * 3 + (i + 1) * h, h, null);
  assert.equal(a.k, b.k); assert.equal(a.phase, b.phase);
  assert.ok(Math.abs(a.s - b.s) < 15);
});

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

test('busCollider, ledText', () => {
  const o = busCollider(10, 20, Math.PI / 2, 5);
  assert.equal(o.hw, BUS.length / 2); assert.equal(o.hd, BUS.width / 2);
  assert.ok(near(o.c, 0) && near(o.s, 1)); assert.equal(o.h, 5 + BUS.height); assert.equal(o.low, true);
  assert.deepEqual(ledText(TRIP), { line: '133', dest: 'Ende, Bahnhof' });
});

// #710: the bus swings through bends on a smoothed driving line
const bendRoute = (pts, stops = []) => { const rd = road(pts); return busRoute({ id: 9, line: '133', pts, stops }, [rd], buildGraph([rd])); };
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// the smallest radius the bus's heading change implies, metres, over [from, to]
const minRadius = (route, from, to) => {
  let worst = 0;
  for (let s = from; s < to; s += 0.25) worst = Math.max(worst, Math.abs(wrapA(busPose(route, s + 0.25).th - busPose(route, s).th)) / 0.25);
  return 1 / worst;
};
const oldLane = (route, s) => rightOf(route.pts, route.cum, s, busOffset(route, s));

test('driveLine_RightAngleCorner_RadiusAtLeast8AndCutsAtMost4_5m', () => {
  const R1 = bendRoute([[0, 0], [100, 0], [100, 100]]);   // east, then south: a right turn
  assert.ok(minRadius(R1, 60, 140) >= 8, `radius ${minRadius(R1, 60, 140)}`);
  let cut = 0;
  for (let s = 60; s < 140; s += 0.5) { const [x, z] = lanePoint(R1, s), [ox, oz] = oldLane(R1, s); cut = Math.max(cut, Math.hypot(x - ox, z - oz)); }
  assert.ok(cut > 1 && cut <= 4.5, `cut ${cut}`);
});

test('driveLine_ClusterOfShortLegs_RadiusAtLeast8', () => {
  const R2 = bendRoute([[0, 0], [100, 0], [104.4, 4.4], [104.4, 30], [104.4, 130]]);   // 45 degrees, 6 m, 45 degrees
  assert.ok(minRadius(R2, 60, 150) >= 8, `radius ${minRadius(R2, 60, 150)}`);
});

test('driveLine_StraightRoad_PoseUnchanged', () => {
  for (const s of [20, 250, 500, 777]) {
    const [x, z] = lanePoint(R, s), [ox, oz] = oldLane(R, s);
    assert.ok(near(x, ox) && near(z, oz), `s ${s}`);
  }
});

test('driveLine_StopBesideCorner_PoseAtStopUnchanged', () => {
  const st = { uic: '1', name: 'S1', s: 105, x: 97, z: 105, rot: 0 };   // 5 m after the corner, kerb right of southward travel
  const R3 = bendRoute([[0, 0], [100, 0], [100, 100], [100, 300]], [st]);
  const [x, z] = lanePoint(R3, 105), [ox, oz] = oldLane(R3, 105);
  assert.ok(Math.hypot(x - ox, z - oz) <= 0.1);
  assert.ok(near(R3.stopS.get('1'), 105));
});

test('busPose_InABend_SwingsInsideThePolylineCorner', () => {
  const R4 = bendRoute([[0, 0], [100, 0], [100, 100]]);
  const p = busPose(R4, 100), [ox, oz] = oldLane(R4, 100);   // at the polyline corner a smoothed bus is well inside it
  assert.ok(Math.hypot(p.x - ox, p.z - oz) > 1.5, `pose ${p.x}, ${p.z}`);
});

test('obstacleGap_InABend_FollowsTheBusLane', () => {
  const R5 = bendRoute([[0, 0], [100, 0], [100, 100]]);
  const [lx, lz] = lanePoint(R5, 105);   // a player standing exactly on the bus's lane, ahead
  assert.ok(obstacleGap(R5, 90, { x: lx, z: lz, r: 1 }) !== null);
});

// #763: the Umlauf -- the bus that arrives at a terminus runs the line's next trip from there
const leg = (line, from, to, arr, dep, route = 1) => ({ line, route, to: 'Z' + to, fromOutside: false, toOutside: false,
  calls: [[from, dep - 100, dep], ['2', dep + 100, dep + 100], [to, arr, arr]] });

test('linkTrips_SameLineSameStopWithinLimit_Links', () => {
  const a = leg('133', '1', '3', 1000, 800), b = leg('133', '3', '1', 1240, 1300);
  assert.equal(linkTrips([a, b]).get(tripKey(a)), b);
});
test('linkTrips_OtherLine_DoesNotLink', () => {
  const a = leg('133', '1', '3', 1000, 800), b = leg('143', '3', '1', 1240, 1300);
  assert.equal(linkTrips([a, b]).size, 0);
});
test('linkTrips_BeyondTurnMaxOrWrongStopOrOutside_DoesNotLink', () => {
  const a = leg('133', '1', '3', 1000, 800);
  assert.equal(linkTrips([a, leg('133', '3', '1', 2000, 1000 + PA.turnMax + 1)]).size, 0);
  assert.equal(linkTrips([a, leg('133', '9', '1', 1240, 1300)]).size, 0);
  assert.equal(linkTrips([a, { ...leg('133', '3', '1', 1240, 1300), fromOutside: true }]).size, 0);
  assert.equal(linkTrips([{ ...a, toOutside: true }, leg('133', '3', '1', 1240, 1300)]).size, 0);
  assert.equal(linkTrips([a, leg('133', '3', '1', 990, 990)]).size, 0);   // departs before the arrival
});
test('linkTrips_TwoCandidates_TheLastArrivalBeforeADepartureTakesIt', () => {
  // #767 (A6): a2 arrives between a1's arrival and b1's departure, so a1 does not take b1 -- a2 does
  const a1 = leg('133', '1', '3', 1000, 800), a2 = leg('133', '1', '3', 1100, 900);
  const b1 = leg('133', '3', '1', 1200, 1250), b2 = leg('133', '3', '1', 1400, 1450);
  const m = linkTrips([a1, a2, b1, b2]);
  assert.equal(m.get(tripKey(a2)), b1); assert.equal(m.has(tripKey(a1)), false); assert.equal(m.size, 1);
});
test('linkTrips_AnotherArrivalBeforeTheDeparture_TheLaterBusTakesIt', () => {
  // #767: 143 at Stein-Saeckingen, two arrivals before one departure -- the earlier bus must not wait across the later one
  const a1 = leg('143', '1', '3', 1000, 800), a2 = leg('143', '1', '3', 1600, 1400), b = leg('143', '3', '1', 2000, 1900);
  const m = linkTrips([a1, a2, b]);
  assert.equal(m.has(tripKey(a1)), false);
  assert.equal(m.get(tripKey(a2)), b);
});
test('fleetRuns_LinkedTrips_OneRunWithContiguousWindowsAtTheArrival', () => {
  const a = leg('133', '1', '3', 1000, 800), b = leg('133', '3', '1', 1240, 1300), c = leg('133', '1', '3', 2300, 2200);   // c far enough past b's arrival (1240) to stay unlinked
  const runs = fleetRuns([b, a, c], new Map([[1, R]]));
  assert.equal(runs.length, 2);                                   // a -> b chained, c alone
  const run = runs.find((r) => r.key === tripKey(a));
  assert.equal(run.legs.length, 2);
  assert.equal(run.legs[0].win.to, 1000); assert.equal(run.legs[1].win.from, 1000);   // split at the arrival
  assert.equal(run.win.from, run.legs[0].win.from); assert.equal(run.win.to, run.legs[1].win.to);
  assert.deepEqual(fleetRuns([a], new Map([[1, R]]))[0].legs[0].win, tripWindow(a, tripCalls(a, R), R));   // unlinked: as today
  assert.equal(fleetRuns([a, b], new Map()).length, 0);          // unknown route: no run
});

// a second route for the return direction: the same physical road as R, but its own pts (and so its own s) run the
// other way, so a linked trip can drive forward (increasing s) on its own route after the turn
const R2 = busRoute({ id: 2, line: '133', pts: [[1000, 0], [500, 0], [0, 0]], stops: [stop('3', 100), stop('2', 400), stop('1', 900)] }, ROADS, G);
const ROUTES2 = new Map([[1, R], [2, R2]]);

test('stepBus_ArrivalAtLinkedTerminus_TurnsIntoTheNextTripAndKeepsTheKey', () => {
  const a = leg('133', '1', '3', 1000, 800), b = { ...leg('133', '3', '1', 1240, 1300, 2) };
  const [fleet] = syncFleet([], [a, b], ROUTES2, 900);
  const key = fleet.key; assert.equal(key, tripKey(a));
  for (let now = 900; fleet.trip === a && now < 1300; now += 0.5) stepBus(fleet, now, 0.5, null);
  assert.equal(fleet.key, key); assert.equal(fleet.trip, b); assert.equal(fleet.route, R2);
  assert.equal(fleet.phase, 'stand'); assert.equal(fleet.k, 0); assert.equal(fleet.s, R2.stopS.get('3'));
  assert.equal(ledText(fleet.trip).dest, 'Z1');
  assert.ok(fleet.until >= 1300);
  assert.equal(syncFleet([fleet], [a, b], ROUTES2, 1100).length, 1);   // no second bus for b
});

test('stepBus_LateArrivalAfterNextDeparture_StandsMinDwellThenLeavesLate', () => {
  // a's scheduled run to the terminus (105 s) is far too tight for the 500 m left to drive (like the existing "late
  // bus" test): the real arrival lands after b's scheduled departure (915), so the turn keeps minDwell and leaves
  // late rather than departing on (an already past) schedule
  const a = leg('133', '1', '3', 905, 800), b = leg('133', '3', '1', 1240, 915, 2);
  const [fleet] = syncFleet([], [a, b], ROUTES2, 800);
  let arriveT = null;
  for (let now = 800; now < 1100 && arriveT === null; now += 0.5) {
    const before = fleet.trip;
    stepBus(fleet, now, 0.5, null);
    if (before === a && fleet.trip === b) arriveT = now;
  }
  assert.ok(arriveT !== null && arriveT > 915);                 // arrives after b's scheduled departure: late
  assert.equal(fleet.phase, 'stand'); assert.equal(fleet.k, 0);
  assert.ok(near(fleet.until, arriveT + PA.minDwell));
});

test('stepBus_LinkedTurn_ThenDrivesTheNextRouteToItsEnd', () => {
  const a = leg('133', '1', '3', 1000, 800), b = leg('133', '3', '1', 1240, 1300, 2);
  const [fleet] = syncFleet([], [a, b], ROUTES2, 900);
  for (let now = 900; fleet.trip === a && now < 1300; now += 0.5) stepBus(fleet, now, 0.5, null);   // turn
  for (let now = 1300; fleet.phase === 'stand' && now < 1310; now += 0.5) stepBus(fleet, now, 0.5, null);   // depart on time
  assert.equal(fleet.phase, 'drive'); assert.equal(fleet.k, 1); assert.equal(fleet.leg, 1);
  for (let now = 1310; fleet.phase !== 'done' && now < 2000; now += 0.5) stepBus(fleet, now, 0.5, null);
  assert.equal(fleet.phase, 'done');
});

test('placeRun_ClockJump_PlacesTheLegForNow', () => {
  const a = leg('133', '1', '3', 1000, 800), b = leg('133', '3', '1', 1500, 1300, 2);   // b's own calls stay chronological, unlike the linking fixtures above (which only read its endpoints)
  const run = fleetRuns([a, b], ROUTES2)[0];
  assert.equal(placeRun(run, 900).trip, a);                       // driving leg a
  const afterA = placeRun(run, 1100);                             // arrival passed: standing at b's first stop, b's destination
  assert.equal(afterA.trip, b); assert.equal(afterA.phase, 'stand'); assert.equal(afterA.k, 0);
  assert.equal(placeRun(run, 1320).trip, b);                      // driving b
  assert.equal(placeRun(run, 1500 + 60 + 10_000), null);          // past the window
});

test('syncFleet_ShortTurnaround_NeverTwoBusesOnTheSameStand', () => {   // fails on main: 60 s gap, layover 60, spawnBefore 90
  const a = leg('133', '1', '3', 1000, 800), b = leg('133', '3', '1', 1060, 1060, 2);
  for (let now = 700; now < 1400; now += 5) {
    const fleet = syncFleet([], [a, b], ROUTES2, now).filter((x) => x.phase === 'stand' && x.k === 0 && x.calls[0].uic === '3');
    assert.ok(fleet.length <= 1, `at ${now}`);
  }
});

test('syncFleet_UnlinkedTrip_BehavesAsBefore', () => {
  const fleet = syncFleet([], [TRIP], ROUTES, 35950);
  assert.equal(fleet.length, 1);
  assert.equal(fleet[0].key, tripKey(TRIP));
  assert.deepEqual(fleet[0].win, tripWindow(TRIP, tripCalls(TRIP, R), R));
});

// #763: the guard for the whole timetable -- at no terminus do two Postautos ever stand at once
const TT = JSON.parse(fs.readFileSync(new URL('../data/timetable_hochrhein.json', import.meta.url), 'utf8'));

// one straight synthetic route per route id: stop spacing sized from the timetable's own call-to-call gap at cruise
// speed (not a flat distance), so a simulated bus arrives close to its scheduled time -- otherwise a short synthetic
// last leg finishes minutes early, clears its layover before the next trip's window even opens, and hides the bug
function synthRoutes(trips) {
  const out = new Map(), longest = new Map();
  for (const t of trips) if (t.calls.length > (longest.get(t.route)?.calls.length ?? 0)) longest.set(t.route, t);   // #767: 143's short trips have 7 and 2 calls
  for (const t of longest.values()) {
    let s = 0;
    const stops = t.calls.map((c, i) => { if (i > 0) s += Math.max(50, (c[1] - t.calls[i - 1][2]) * (PA.topKmh / 3.6)); return stop(String(c[0]), s); });
    const rd = road([[0, 0], [s + 200, 0]]);
    out.set(t.route, busRoute({ id: t.route, line: t.line, pts: [[0, 0], [s + 200, 0]], stops }, [rd], buildGraph([rd])));
  }
  return out;
}
// #808: a terminus is a stop *point* (the world's uic:x:z per route and stop), not a uic (three lines end at Frick Bahnhof)
const WORLD_DATA = JSON.parse(fs.readFileSync(new URL('../data/world_hochrhein.json', import.meta.url), 'utf8'));
const POINT = new Map(WORLD_DATA.busRoutes.flatMap((r) => r.stops.map((s) => [`${r.id}:${s.uic}`, `${s.uic}:${s.x}:${s.z}`])));
const pointOf = (b) => POINT.get(`${b.trip.route}:${b.calls[b.k].uic}`) ?? b.calls[b.k].uic;
function standingAtTerminus(fleet) {
  const by = new Map();
  for (const b of fleet) {
    const first = b.k === 0 && !b.trip.fromOutside, last = b.k === b.calls.length - 1 && !b.trip.toOutside;   // #767: 143's Breitenacher is a through stop
    if (b.phase === 'stand' && (first || last)) by.set(pointOf(b), (by.get(pointOf(b)) ?? 0) + 1);
  }
  return [...by].filter(([, n]) => n > 1);
}
for (const [name, dt, factor] of [['real time', 1, 1], ['time-lapse 60x', 1, 60]]) {
  test(`timetable_NoTwoBusesStandOnTheSameTerminusAtOnce_${name}`, () => {
    const routes = synthRoutes(TT.trips); let fleet = [];
    const end = 18.5 * 3600, seen = new Set();
    for (let now = 5.5 * 3600; now < end; now += dt * factor) {
      fleet = syncFleet(fleet, TT.trips, routes, now);
      const { n, h } = fleetSteps(dt * factor);
      for (const b of fleet) for (let i = 0; i < n; i++) stepBus(b, now + (i + 1) * h, h, null);
      assert.deepEqual(standingAtTerminus(fleet), [], `at ${now}`);
      for (const b of fleet) if (b.trip.line === '133') seen.add(b.key);
    }
    assert.ok(seen.size <= 4);   // 14 trips make a handful of runs, not 14 buses
  });
}

// #763 (found by the Playwright run): Frick's last stop lies 0.3 m before the route end, inside the 2 m where route.js's
// targetSpeed brakes to zero -- the bus stopped 1.7 m short of the stop, never arrived and never turned
test('stepBus_StopWithinTwoMetresOfRouteEnd_StillArrives', () => {
  const rd = road([[0, 0], [500, 0]]), r = busRoute({ id: 7, line: '133', pts: [[0, 0], [500, 0]], stops: [stop('1', 100), stop('2', 499.7)] }, [rd], buildGraph([rd]));
  const trip = { line: '133', route: 7, to: 'Ende', fromOutside: false, toOutside: false, calls: [['1', 36000, 36000], ['2', 36100, 36100]] };
  const b = placeTrip(trip, r, 36001), log = run(b, 36001, 200);
  assert.ok(log.some((x) => x.k === 1 && x.phase === 'stand' && x.s === 499.7));
});

// #796: the weekday timetable has trips of two lines inside the map at the same time (133 runs in the peaks, 143 all day)
const REAL_WORLD = new URL('../data/world_hochrhein.json', import.meta.url);
const REAL_TT = new URL('../data/timetable_hochrhein.json', import.meta.url);
const linesAt = (routes, trips, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return [...new Set(syncFleet([], trips, routes, h * 3600 + m * 60).filter((b) => b.phase !== 'done').map((b) => b.trip.line))].sort();
};
test('realData_PeakHour_TwoLinesOnTheRoadAtOnce', { skip: !fs.existsSync(REAL_WORLD) || !fs.existsSync(REAL_TT) }, () => {
  const L = JSON.parse(fs.readFileSync(REAL_WORLD, 'utf8')), tt = JSON.parse(fs.readFileSync(REAL_TT, 'utf8'));
  const G = buildGraph(L.roads), routes = new Map(L.busRoutes.map((br) => [br.id, busRoute(br, L.roads, G)]));
  assert.deepEqual(linesAt(routes, tt.trips, '07:00'), ['133', '143']);
  assert.deepEqual(linesAt(routes, tt.trips, '16:30'), ['133', '143']);
  assert.deepEqual(linesAt(routes, tt.trips, '12:00'), ['143']);   // 133 has no trip in the map between 09:18 and 14:43
});

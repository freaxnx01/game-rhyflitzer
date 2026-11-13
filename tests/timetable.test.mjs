// #801: the PostAuto timetable view -- pure. node --test tests/timetable.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIMETABLE, lineIds, stopLines, stopDepartures, lineDirections } from '../timetable.js';
import { nextRun, runWindow, cellTime, liveStops, clockText, minutesUntil, stopInReach } from '../timetable.js';
import { tripKey } from '../postauto.js';

const H = (h, m = 0) => h * 3600 + m * 60;
// line 9 east (route 1, leaves the map), line 9 west (route 2, ends inside), line 10 (route 3, ends at C)
const trip = (line, route, to, deps, o = {}) => ({ line, route, to, fromOutside: !!o.from, toOutside: !!o.out, calls: deps.map(([uic, t]) => [uic, t, t]) });
const TRIPS = [
  trip('9', 1, 'East', [['A', H(14, 12)], ['B', H(14, 15)], ['C', H(14, 18)]], { out: true }),
  trip('9', 1, 'East', [['A', H(14, 42)], ['B', H(14, 45)], ['C', H(14, 48)]], { out: true }),
  trip('9', 1, 'B only', [['A', H(15, 0)], ['B', H(15, 3)]]),
  trip('9', 2, 'West', [['C', H(14, 20)], ['B', H(14, 23)], ['A', H(14, 26)]], { from: true }),
  trip('10', 3, 'Cee', [['A', H(16, 41)], ['C', H(16, 50)]]),
];

test('lineIds_SortedNumerically', () => {
  assert.deepEqual(lineIds([...TRIPS, trip('134', 4, 'X', [['A', 1], ['B', 2]])]), ['9', '10', '134']);
});

test('stopLines_LinesCallingAtTheStop', () => {
  assert.deepEqual(stopLines(TRIPS, 'A'), ['9', '10']);
  assert.deepEqual(stopLines(TRIPS, 'B'), ['9']);
});

test('stopDepartures_NextByWait_ThenEveryLineDestinationOnce', () => {
  const rows = stopDepartures(TRIPS, 'A', H(14, 7), 2);
  assert.deepEqual(rows.map((r) => [r.line, r.to, r.dep, r.wait]), [
    ['9', 'East', H(14, 12), 300], ['9', 'East', H(14, 42), 2100],
    ['9', 'B only', H(15, 0), H(0, 53)], ['10', 'Cee', H(16, 41), H(2, 34)],
  ]);
});

test('stopDepartures_LastCallOfTerminatingTrip_NotListed', () => {
  assert.deepEqual(stopDepartures(TRIPS, 'A', H(14, 20)).filter((r) => r.to === 'West'), []);
  assert.ok(stopDepartures(TRIPS, 'C', H(14, 0)).some((r) => r.to === 'East'));   // leaves the map: C is not its end
});

test('stopDepartures_WrapsPastMidnight', () => {
  const rows = stopDepartures(TRIPS, 'A', H(23, 0), 1);
  assert.equal(rows[0].dep, H(14, 12));
  assert.equal(rows[0].wait, H(15, 12));
});

test('lineDirections_OnePerRoute_LongestTripOrder_SortedByName', () => {
  const dirs = lineDirections(TRIPS, '9');
  assert.deepEqual(dirs.map((d) => [d.route, d.to, d.toOutside, d.stops]), [
    [1, 'East', true, ['A', 'B', 'C']], [2, 'West', false, ['C', 'B', 'A']],
  ]);
  assert.deepEqual(dirs[0].trips.map((t) => t.calls[0][2]), [H(14, 12), H(14, 42), H(15, 0)]);
  assert.equal(TIMETABLE.runs, 4);
});

const many = { trips: Array.from({ length: 10 }, (_, i) => trip('9', 1, 'East', [['A', H(6 + i)], ['B', H(6 + i, 30)]])) };

test('nextRun_FirstTripNotYetAtItsLastCall', () => {
  assert.equal(nextRun(many, H(8, 10)), 2);   // the 08:00 run is underway until 08:30
  assert.equal(nextRun(many, H(8, 31)), 3);
});

test('runWindow_FourFromNext_PagesByFour', () => {
  const w = runWindow(many, H(8, 10), 0);
  assert.deepEqual([w.start, w.next, w.trips.length, w.canPrev, w.canNext], [2, 2, 4, true, true]);
  assert.equal(runWindow(many, H(8, 10), 1).start, 6);
  assert.equal(runWindow(many, H(8, 10), -1).start, 0);
});

test('runWindow_Clamped', () => {
  const w = runWindow(many, H(8, 10), 5);
  assert.deepEqual([w.start, w.canNext], [6, false]);
  assert.equal(runWindow(many, H(8, 10), -5).canPrev, false);
});

test('runWindow_PastLastRun_StartsAtFirst', () => {
  assert.equal(runWindow(many, H(23, 50), 0).start, 0);
});

test('cellTime_DepOrNullWhenSkipped', () => {
  assert.equal(cellTime(TRIPS[2], 'B'), H(15, 3));
  assert.equal(cellTime(TRIPS[2], 'C'), null);
});

test('liveStops_LastPassedStop_StandingCounts_EdgeDriveLeftOut', () => {
  const calls = [{ uic: 'A' }, { uic: 'B' }, { uic: 'C' }];
  const live = liveStops([
    { trip: TRIPS[0], phase: 'drive', k: 2, calls },
    { trip: TRIPS[1], phase: 'stand', k: 0, calls },
    { trip: TRIPS[3], phase: 'drive', k: 0, calls },
    { trip: TRIPS[4], phase: 'done', k: 1, calls },
  ]);
  assert.deepEqual([...live], [[tripKey(TRIPS[0]), 'B'], [tripKey(TRIPS[1]), 'A']]);
});

test('clockText_RegionalFormat', () => {
  assert.equal(clockText(H(14, 7), 'de-CH'), '14:07');
  assert.equal(clockText(H(14, 7) + 86400, 'en-GB'), '14:07');
  assert.equal(minutesUntil(300), 5);
  assert.equal(minutesUntil(301), 6);
});

test('stopInReach_NearestPoleWithinReach', () => {
  const stops = [{ uic: 'A', pole: [0, 0] }, { uic: 'B', pole: [3, 0] }];
  assert.equal(stopInReach(stops, 2, 0, 2.5).uic, 'B');
  assert.equal(stopInReach(stops, 10, 0, 2.5), null);
});

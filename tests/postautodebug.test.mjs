// #707: pure helpers for the Postauto section in the F3 debug panel. No DOM, no three.js: node --test only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hhmmss, clockLine, busRow, nextDeparture, chaseCam } from '../postautodebug.js';

const t = (key, a = {}) => ({ dbgPaClock: `Uhr ${a.time}${a.speed} (${a.source})`, dbgPaSrcWall: 'Echtzeit', dbgPaSrcSet: `gesetzt ${a.given}`, dbgPaSrcWallStart: 'ab Echtzeit',
  dbgPaDrive: `fahrt ${a.kmh}`, dbgPaStand: 'steht', dbgPaStop: `Halt ${a.k}/${a.n}`, dbgPaAway: `${a.dist} entfernt` })[key];

test('hhmmss_WrapsAndPads', () => {
  assert.equal(hhmmss(7 * 3600 + 31 * 60 + 5.9), '07:31:05');
  assert.equal(hhmmss(86400 + 61), '00:01:01');
});
test('clockLine_SetWallAndLapse', () => {
  assert.equal(clockLine(27065, { given: 27000, factor: 1, wall: false }, t), 'Uhr 07:31:05 (gesetzt 07:30)');
  assert.equal(clockLine(27065, { given: 27000, factor: 10, wall: false }, t), 'Uhr 07:31:05 · 10× (gesetzt 07:30)');
  assert.equal(clockLine(27065, { given: null, factor: 10, wall: false }, t), 'Uhr 07:31:05 · 10× (ab Echtzeit)');
  assert.equal(clockLine(27065, { given: null, factor: 1, wall: true }, t), 'Uhr 07:31:05 (Echtzeit)');
});
test('busRow_DrivingAndStanding', () => {
  const bus = { key: 'a:1', line: '133', to: 'Stein-Säckingen', phase: 'drive', v: 30 / 3.6, k: 3, n: 11, x: 2100, z: 0 };
  assert.deepEqual(busRow(bus, { x: 0, z: 0 }, t), { key: 'a:1', line1: '133 → Stein-Säckingen  fahrt 30', line2: 'Halt 4/11 · 2.1 km entfernt' });
  assert.equal(busRow({ ...bus, phase: 'stand', v: 0, x: 300 }, { x: 0, z: 0 }, t).line2, 'Halt 4/11 · 300 m entfernt');
  assert.match(busRow({ ...bus, phase: 'stand', v: 0 }, { x: 0, z: 0 }, t).line1, /steht$/);
});
test('nextDeparture_PicksNextAndWrapsMidnight', () => {
  const trips = [{ line: '133', to: 'Frick', calls: [[1, 0, 27720]] }, { line: '133', to: 'Stein', calls: [[1, 0, 3600 + 86400]] }];
  assert.deepEqual(nextDeparture(trips, 27065), { dep: 27720, line: '133', to: 'Frick' });
  assert.deepEqual(nextDeparture(trips, 80000), { dep: 3600, line: '133', to: 'Stein' });
  assert.equal(nextDeparture([], 0), null);
});
test('chaseCam_SitsBehindTheBusLookingAtIt', () => {
  const c = chaseCam({ x: 100, z: 50, th: 0 }, 14, 5);   // bus heads east
  assert.ok(Math.abs(c.x - 86) < 1e-9 && Math.abs(c.z - 50) < 1e-9 && c.y === 5);
  assert.ok(c.lookX > 100 - 1e-9);
});

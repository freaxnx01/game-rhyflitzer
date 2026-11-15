// #834: the lobby state of the multiplayer race. Pure module, so node --test can import it without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLobby, addPlayer, removePlayer, setClass, pickCar, setReady, canStart, carFits, lobbyMessage, admitHello, raceGrid, RACE, createRace, acceptCp, acceptFinish, dropRacer, tickRace, standings, boardRows, nearPoint } from '../netrace.js';

const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

const DEFS = { fast: { drive: { top: 75, accel: 20, grip: 9, steerRate: 2.6 }, mass: 1 }, slow: { drive: { top: 11, accel: 4, grip: 9, steerRate: 2 }, mass: 2 } };

test('addPlayer_upToFour_thenNull', () => {
  let l = createLobby('hochrhein', 'Host');
  for (const n of ['B', 'C', 'D']) ({ lobby: l } = addPlayer(l, n));
  assert.deepEqual(l.players.map(p => p.id), [0, 1, 2, 3]);
  assert.equal(addPlayer(l, 'E'), null);
  assert.deepEqual(removePlayer(l, 2).players.map(p => p.id), [0, 1, 3]);
});

test('pickCar_setClass_classFilter', () => {
  assert.deepEqual([carFits('A', DEFS.fast), carFits('A', DEFS.slow), carFits('all', DEFS.slow)], [true, false, true]);
  const a = setClass(createLobby('hochrhein', 'Host'), 'A', DEFS);
  assert.equal(pickCar(a, 0, 'slow', 'navy', DEFS).reason, 'class');
  assert.equal(pickCar(a, 0, 'fast', 'navy', DEFS).lobby.players[0].car, 'fast');
  let l = setReady(pickCar(createLobby('hochrhein', 'Host'), 0, 'slow', 'navy', DEFS).lobby, 0, true);
  l = setClass(l, 'A', DEFS);   // the car no longer fits: car and ready cleared
  assert.deepEqual([l.players[0].car, l.players[0].ready], [null, false]);
});

test('setReady_canStart_needsCarTwoPlayersAllReady', () => {
  assert.equal(setReady(createLobby('hochrhein', 'Host'), 0, true).players[0].ready, false);
  let l = pickCar(createLobby('hochrhein', 'Host'), 0, 'fast', 'navy', DEFS).lobby;
  l = setReady(l, 0, true); assert.equal(canStart(l), false);
  l = addPlayer(l, 'B').lobby; l = pickCar(l, 1, 'slow', 'signal', DEFS).lobby; assert.equal(canStart(l), false);
  l = setReady(l, 1, true); assert.equal(canStart(l), true);
});

test('lobbyMessage_perPeer_carriesYou', () => {
  const m = lobbyMessage(addPlayer(createLobby('hochrhein', 'Host'), 'B').lobby, 1);
  assert.deepEqual([m.type, m.you, m.region, m.cls, m.players.length], ['lobby', 1, 'hochrhein', 'all', 2]);
});

test('admitHello_sessionRunning_deniesStarted', () => {
  const l = createLobby('hochrhein', 'Host');
  assert.deepEqual(admitHello(l, 'B', true), { deny: 'started' });
  assert.equal(admitHello(l, 'B', false).id, 1);
  let f = l; for (const n of ['B', 'C', 'D']) ({ lobby: f } = addPlayer(f, n));
  assert.deepEqual(admitHello(f, 'E', false), { deny: 'full' });
});

// #979: a generated name that collides gets another one; a typed name stays
const POOL = ['Turbo Tony', 'Pedal Pete', 'Idle Ida'];
test('admitHello_autoNameCollides_hostGivesAnotherPoolName', () => {
  const l = createLobby('hochrhein', 'Turbo Tony');
  const added = admitHello(l, 'turbo tony', false, { custom: false, pool: POOL });
  const name = added.lobby.players[1].name;
  assert.ok(POOL.includes(name) && name !== 'Turbo Tony', name);
});

test('admitHello_typedNameCollides_nameStays', () => {
  const l = createLobby('hochrhein', 'Anna');
  assert.equal(admitHello(l, 'Anna', false, { custom: true, pool: POOL }).lobby.players[1].name, 'Anna');
  assert.equal(admitHello(l, 'Anna', false).lobby.players[1].name, 'Anna', 'no policy: unchanged');
});

test('admitHello_autoNameFree_unchanged', () => {
  const l = createLobby('hochrhein', 'Anna');
  assert.equal(admitHello(l, 'Idle Ida', false, { custom: false, pool: POOL }).lobby.players[1].name, 'Idle Ida');
});

// #837 part a: the pure race rules — grid, checkpoints, standings, board rows.
test('raceGrid_twoAbreast_rowsBack', () => {
  [[0, -2], [0, 2], [-8, -2], [-8, 2]].forEach(([x, z], slot) => assert.ok(near(raceGrid([0, 0, 0], slot), [x, z, 0])));
});

const lobby2 = { region: 'hochrhein', cls: 'all', players: [{ id: 0, name: 'A' }, { id: 1, name: 'B' }] };
test('acceptCp_onlyNewRealNearAndRunning', () => {
  let r = createRace(lobby2, 3);
  for (const a of [[1, 0, 5000, false], [1, 3, 5000, true], [9, 0, 5000, true]]) assert.equal(acceptCp(r, ...a).ok, false);   // far, no cp 3, no racer 9
  r = acceptCp(r, 1, 2, 5000, true).race;                            // any order
  assert.equal(acceptCp(r, 1, 2, 6000, true).ok, false);            // already passed
  r = acceptCp(r, 1, 0, 4000, true).race;                            // earlier t is clamped up
  assert.deepEqual(r.racers[1].times, [5000, 5000]);
});
test('acceptFinish_needsAllCps_thenFin', () => {
  let r = createRace(lobby2, 1);
  assert.equal(acceptFinish(r, 0, 9000, true, 100).ok, false);
  r = acceptCp(r, 0, 0, 3000, true).race;
  r = acceptFinish(r, 0, 9000, true, 100).race;
  assert.deepEqual([r.racers[0].st, r.racers[0].times, r.firstFin, r.over], ['fin', [3000, 9000], 100, false]);
  r = dropRacer(r, 1);
  assert.deepEqual([r.racers[1].st, r.over], ['dnf', true]);
});
test('tickRace_dnfSixtySecondsAfterFirstFinish', () => {
  let r = acceptFinish(acceptCp(createRace(lobby2, 1), 0, 0, 1, true).race, 0, 2, true, 1000).race;
  assert.equal(tickRace(r, 60999).over, false);
  r = tickRace(r, 61000);
  assert.deepEqual([r.racers[1].st, r.over], ['dnf', true]);
});

test('standings_order_ties_gaps', () => {
  const rows = [
    { id: 0, name: 'A', times: [1000], st: 'run' },
    { id: 1, name: 'B', times: [900, 2000], st: 'run' },
    { id: 2, name: 'C', times: [800, 1900, 5000], st: 'fin' },
    { id: 3, name: 'D', times: [1000], st: 'run' },
  ];
  const s = standings(rows);
  assert.deepEqual(s.map((r) => r.id), [2, 1, 0, 3]);              // fin, more passes, tie → lower id
  assert.deepEqual(s.map((r) => r.pos), [1, 2, 3, 4]);
  assert.deepEqual(s.map((r) => r.gap), [-100, 100, 100, 0]);      // B 2000 vs C 1900; A 1000 vs B 900; D vs A
  assert.equal(standings([{ id: 0, name: 'A', times: [], st: 'run' }])[0].gap, null);
  assert.deepEqual(standings([{ id: 0, name: 'A', times: [], st: 'dnf' }, { id: 1, name: 'B', times: [], st: 'run' }]).map((r) => r.id), [1, 0]);
});
test('boardRows_dropsMask', () => assert.deepEqual(boardRows(createRace(lobby2, 1))[0], { id: 0, name: 'A', times: [], st: 'run' }));

test('nearPoint_xzOnly_withinRadiusSlack_trueBeyondFalse', () => {
  const pt = { x: 0, z: 0 };
  assert.equal(nearPoint([{ x: 0, y: 0, z: 0 }], pt), true);                          // on point
  assert.equal(nearPoint([{ x: RACE.radius + RACE.slack, y: 0, z: 0 }], pt), true);   // exactly radius + slack (<=)
  assert.equal(nearPoint([{ x: RACE.radius + RACE.slack + 1, y: 0, z: 0 }], pt), false); // beyond radius + slack
  assert.equal(nearPoint([{ x: 0, y: 9999, z: 0 }], pt), true);                       // y ignored — x/z on point
  assert.equal(nearPoint([{ x: 50, y: 0, z: 50 }, { x: 0, y: 0, z: 0 }], pt), true);   // any pose near
});

test('createRace_clampsCpsPastThirtyOne', () => {
  assert.equal(createRace(lobby2, 32).cps, 31);   // 1 << cps wraps past 31 under JS's 32-bit bitwise
  assert.equal(createRace(lobby2, 3).cps, 3);     // an in-range count is unchanged
});

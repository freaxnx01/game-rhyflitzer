// #834: the lobby state of the multiplayer race. Pure module, so node --test can import it without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLobby, addPlayer, removePlayer, setClass, pickCar, setReady, canStart, carFits, lobbyMessage, admitHello } from '../netrace.js';

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

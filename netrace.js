// netrace.js — #834: the lobby state of the multiplayer race (part 1 of the state machine; countdown and racing follow with #837).
// Pure module: no DOM, no three.js, no RTCPeerConnection, so node --test can import it. The host owns the state and
// broadcasts a `lobby` message after every change; every function here returns a new lobby instead of mutating one.

import { powerClass } from './carselect.js';
import { MAX_PLAYERS } from './netcodec.js';

// carFits(cls, def) — may this vehicle be driven in this class? 'all' takes every one.
export function carFits(cls, def) { return cls === 'all' || powerClass(def) === cls; }

const newPlayer = (id, name) => ({ id, name, car: null, paint: null, ready: false });

// createLobby(region, hostName) — the host is player 0 and the class starts at 'all'
export function createLobby(region, hostName) {
  return { region, cls: 'all', players: [newPlayer(0, hostName)] };
}

// addPlayer(lobby, name) — { lobby, id } with the lowest free id, or null when the lobby is full
export function addPlayer(lobby, name) {
  const taken = new Set(lobby.players.map((p) => p.id));
  const id = [...Array(MAX_PLAYERS).keys()].find((i) => !taken.has(i));
  if (id === undefined) return null;
  return { lobby: { ...lobby, players: [...lobby.players, newPlayer(id, name)] }, id };
}

export function removePlayer(lobby, id) {
  return { ...lobby, players: lobby.players.filter((p) => p.id !== id) };
}

const mapPlayer = (lobby, id, change) => ({ ...lobby, players: lobby.players.map((p) => (p.id === id ? change(p) : p)) });

// setClass(lobby, cls, defs) — the host's class; a car that no longer fits is dropped together with its ready flag
export function setClass(lobby, cls, defs) {
  const drop = (p) => (p.car && !carFits(cls, defs[p.car]) ? { ...p, car: null, paint: null, ready: false } : p);
  return { ...lobby, cls, players: lobby.players.map(drop) };
}

// pickCar(lobby, id, car, paint, defs) — { ok: true, lobby } or { ok: false, lobby, reason: 'class' }
export function pickCar(lobby, id, car, paint, defs) {
  if (!carFits(lobby.cls, defs[car])) return { ok: false, lobby, reason: 'class' };
  return { ok: true, lobby: mapPlayer(lobby, id, (p) => ({ ...p, car, paint })) };
}

// setReady(lobby, id, on) — ready counts only with a car picked
export function setReady(lobby, id, on) {
  return mapPlayer(lobby, id, (p) => ({ ...p, ready: on && p.car !== null }));
}

// canStart(lobby) — at least two players and every one of them ready
export function canStart(lobby) {
  return lobby.players.length >= 2 && lobby.players.every((p) => p.ready);
}

// lobbyMessage(lobby, you) — the `lobby` message as one peer sees it; `you` tells that peer which row is its own
export function lobbyMessage(lobby, you) {
  return {
    type: 'lobby', you, region: lobby.region, cls: lobby.cls,
    players: lobby.players.map((p) => ({ id: p.id, name: p.name, car: p.car, paint: p.paint, ready: p.ready })),
  };
}

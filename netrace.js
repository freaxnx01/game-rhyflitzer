// netrace.js — #834: the lobby state of the multiplayer race (part 1 of the state machine; countdown and racing follow with #837).
// Pure module: no DOM, no three.js, no RTCPeerConnection, so node --test can import it. The host owns the state and
// broadcasts a `lobby` message after every change; every function here returns a new lobby instead of mutating one.

import { powerClass } from './carselect.js';
import { MAX_PLAYERS } from './netcodec.js';
import { uniqueFunnyName } from './netnames.js';

// carFits(cls, def) — may this vehicle be driven in this class? 'all' takes every one.
export function carFits(cls, def) { return cls === 'all' || powerClass(def) === cls; }

const newPlayer = (id, name) => ({ id, name, car: null, paint: null, ready: false });

// createLobby(region, hostName) — the host is player 0 and the class starts at 'all'
export function createLobby(region, hostName) {
  return { region, cls: 'all', players: [newPlayer(0, hostName)] };
}

// admitHello(lobby, name, running, { custom, pool, rnd }) — { lobby, id } for a hello that may join, or { deny } when a
// session already runs ('started') or the lobby is full. A non-custom name that clashes (any case) with a name in the
// lobby is swapped for a free pool name (#979); a custom name always stays.
export function admitHello(lobby, name, running, { custom = true, pool = [], rnd } = {}) {
  if (running) return { deny: 'started' };
  const taken = lobby.players.map((p) => p.name);
  const clash = taken.some((t) => t.trim().toLowerCase() === name.trim().toLowerCase());
  const final = !custom && clash && pool.length ? uniqueFunnyName(pool, taken, rnd) : name;
  return addPlayer(lobby, final) || { deny: 'full' };
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

// ---- #837 part a: the race rules (countdown, host-checked checkpoints, position, result) ----
// Pure state: cps = checkpoint count, firstFin = host-clock ms of the first finish (or null), over, racers.
// Every function returns a new race instead of mutating one; nothing throws on bad input.
export const RACE = { countdown: 4000, dnf: 60000, radius: 7, slack: 15, maxMs: 3600000, row: 8, half: 2 };

// raceGrid([x, z, th], slot) — the world pose of grid slot = lobby id. Two abreast, 4 m apart (±2 m),
// rows 8 m back, slot 0 front left. The pose is rotated by th around (x, z); a 0 heading puts row 0 on START.
export function raceGrid([x, z, th], slot) {
  const back = RACE.row * Math.floor(slot / 2), side = slot % 2 ? RACE.half : -RACE.half;
  return [x - Math.cos(th) * back - Math.sin(th) * side, z - Math.sin(th) * back + Math.cos(th) * side, th];
}

// Racer { id, name, times, mask, st }; race { cps, firstFin, over, racers }. st ∈ run/fin/dnf.
const settle = (race) => ({ ...race, over: race.racers.every((p) => p.st !== 'run') });
const withRacer = (race, id, change) => settle({ ...race, racers: race.racers.map((p) => (p.id === id ? change(p) : p)) });
const runner = (race, id) => race.racers.find((p) => p.id === id && p.st === 'run');
const okTime = (t) => Number.isFinite(t) && t >= 0 && t <= RACE.maxMs;
const stamp = (p, t) => [...p.times, Math.max(p.times[p.times.length - 1] ?? 0, t)];

// createRace(lobby, cps) — every lobby player starts running with an empty pass log; cps = checkpoint count.
// cps is clamped to ≤ 31: `1 << cps` / `(1 << cps) - 1` wrap under JS's 32-bit bitwise semantics past that, so a
// future dynamic-course host setting cps too high can't silently break the checkpoint bitmask math downstream.
export function createRace(lobby, cps) {
  const safe = Math.max(0, Math.min(cps, 31));
  return { cps: safe, firstFin: null, over: false, racers: lobby.players.map((p) => ({ id: p.id, name: p.name, times: [], mask: 0, st: 'run' })) };
}

// acceptCp(race, id, i, t, near) — { ok, race }: a checkpoint pass the host accepts only when the racer is
// still running, `near` (the host found a buffered pose of that racer close enough), t is a real time, i is a
// real checkpoint that racer has not passed yet (any order). The stored time is clamped to ≥ the previous pass.
export function acceptCp(race, id, i, t, near) {
  const p = runner(race, id);
  if (!p || !near || !okTime(t) || !Number.isInteger(i) || i < 0 || i >= race.cps || p.mask & (1 << i)) return { ok: false, race };
  return { ok: true, race: withRacer(race, id, (q) => ({ ...q, times: stamp(q, t), mask: q.mask | (1 << i) })) };
}

// acceptFinish(race, id, t, near, now) — { ok, race }: the finish needs every checkpoint passed and a near pose.
// firstFin keeps the host-clock ms of the first accepted finish; over follows settle (no one still running).
export function acceptFinish(race, id, t, near, now) {
  const p = runner(race, id);
  if (!p || !near || !okTime(t) || p.mask !== (1 << race.cps) - 1) return { ok: false, race };
  const next = withRacer(race, id, (q) => ({ ...q, times: stamp(q, t), st: 'fin' }));
  return { ok: true, race: { ...next, firstFin: race.firstFin ?? now } };
}

// dropRacer(race, id) — a bye/peer-state drop marks a running racer DNF; settle sets over when nobody runs.
export function dropRacer(race, id) { return runner(race, id) ? withRacer(race, id, (q) => ({ ...q, st: 'dnf' })) : race; }

// tickRace(race, now) — 60 s after the first finish, everyone still running goes DNF; otherwise the race stands.
export function tickRace(race, now) {
  if (race.firstFin === null || now - race.firstFin < RACE.dnf) return race;
  return settle({ ...race, racers: race.racers.map((p) => (p.st === 'run' ? { ...p, st: 'dnf' } : p)) });
}

// nearPoint(poses, pt) — the host found a buffered pose (last second) within radius + slack of the point (x/z only).
export function nearPoint(poses, pt) { return poses.some((q) => Math.hypot(q.x - pt.x, q.z - pt.z) <= RACE.radius + RACE.slack); }

// standings(rows) — the pure ranking every device applies to the same board rows, so the order is identical
// everywhere: 1) finished by finish time, 2) running by more passes then earlier last pass, 3) DNF by more
// passes. A tie goes to the lower id. Each row gains pos (1-based) and gap; the leader shows -second's gap.
const GROUP = { fin: 0, run: 1, dnf: 2 };
const last = (r) => r.times[r.times.length - 1] ?? Infinity;
function compare(a, b) {
  if (GROUP[a.st] !== GROUP[b.st]) return GROUP[a.st] - GROUP[b.st];
  if (a.st !== 'fin' && a.times.length !== b.times.length) return b.times.length - a.times.length;
  if (a.st !== 'dnf' && last(a) !== last(b)) return last(a) - last(b);
  return a.id - b.id;
}
const gapTo = (r, ahead) => (r.times.length && ahead.times.length >= r.times.length ? last(r) - ahead.times[r.times.length - 1] : null);
export function standings(rows) {
  const s = [...rows].sort(compare).map((r, k) => ({ ...r, pos: k + 1, gap: null }));
  for (let k = 1; k < s.length; k++) s[k].gap = gapTo(s[k], s[k - 1]);
  if (s.length > 1 && s[1].gap !== null) s[0].gap = -s[1].gap;
  return s;
}

// boardRows(race) — the rows of a `board` message: id, name, times, st (mask is host-internal and dropped).
export function boardRows(race) { return race.racers.map(({ id, name, times, st }) => ({ id, name, times, st })); }

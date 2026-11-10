// #516: riding the Ferris wheel on foot -- pure numbers and a small state machine, no three.js, no DOM.
// The wheel frame is ferris.js's: x along the axle (the room's f), z across (v), y over the floor. Gondola i is
// the pivot at (0, rim sin t_i, rim cos t_i) of a group turned about x by `angle` (ferrismesh.js), so it sits
// at the effective angle phi = t_i - angle; the cabin hangs upright `drop` m below the pivot.
import { FERRIS, gondolaAngles } from './ferris.js';
import { WALKER } from './foot.js';

const TAU = 2 * Math.PI;
// #588: reach covers the lowest gondola's floor point, which is up to rim·sin(π/n) = 8.2 m off the pad centre,
// plus the couple of metres a walker steps out of a car parked at that centre. window: the arc round straight
// down where E gets out early (floor ≤ 6.6 m there). spin: one turn in ~63 s (the resting wheel is ten times slower).
export const RIDE = { reach: 12, window: 0.15, groundTol: 1.5, board: 1.2, alight: 1.2, spin: 0.1, turn: TAU, eye: 1.2 };
const wrap = (a) => ((a % TAU) + TAU) % TAU;
const smooth = (k) => { const x = Math.min(1, Math.max(0, k)); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;

export function gondolaPose(i, angle, cfg = FERRIS) {
  const phi = gondolaAngles(cfg)[i] - angle, y = cfg.hub.y + cfg.rim * Math.sin(phi) - cfg.gondola.drop;
  return { phi, x: 0, y, z: cfg.rim * Math.cos(phi), floor: y - cfg.gondola.h / 2 };
}

// signed angle from straight down (phi = -pi/2) to gondola i, in (-pi, pi]
export function bottomOffset(i, angle, cfg = FERRIS) {
  const d = wrap(gondolaPose(i, angle, cfg).phi + Math.PI / 2);
  return d > Math.PI ? d - TAU : d;
}

export function lowestGondola(angle, cfg = FERRIS) {
  let index = 0, best = Infinity;
  for (let i = 0; i < cfg.gondola.n; i++) { const d = Math.abs(bottomOffset(i, angle, cfg)); if (d < best) { best = d; index = i; } }
  return { index, offset: bottomOffset(index, angle, cfg) };
}

// world <-> wheel frame for w = { x, z, th } (ferrisPlacement's `wheel`): world = c + f*lx + v*lz, f = (cos th, sin th), v = (-sin th, cos th)
export function toWheel(w, x, z) {
  const dx = x - w.x, dz = z - w.z, c = Math.cos(w.th), s = Math.sin(w.th);
  return [dx * c + dz * s, -dx * s + dz * c];
}
export function fromWheel(w, lx, lz) {
  const c = Math.cos(w.th), s = Math.sin(w.th);
  return [w.x + lx * c - lz * s, w.z + lx * s + lz * c];
}

// the lowest gondola if the walker (local = { x, z } in the wheel frame) is within RIDE.reach of its floor point
export function boardingTarget(angle, local, cfg = FERRIS) {
  const { index } = lowestGondola(angle, cfg), g = gondolaPose(index, angle, cfg), dist = Math.hypot(local.x - g.x, local.z - g.z);
  return dist <= RIDE.reach ? { index, dist } : null;
}

export const rideIdle = (angle = 0) => ({ phase: 'idle', angle });
export const rideBegin = (angle, index, from) => ({ phase: 'boarding', index, a0: wrap(angle), t: 0, travelled: 0, from: { x: from.x, z: from.z } });

function alight(s, travelled, cfg) {
  const aEnd = wrap(s.a0 + travelled);
  return { ...s, phase: 'alighting', t: 0, travelled, aEnd };
}

// one step; never mutates s. `leave` is honoured only while riding, within RIDE.window of straight down
export function rideStep(s, dt, leave = false, cfg = FERRIS) {
  if (s.phase === 'boarding') { const t = s.t + dt; return t >= RIDE.board ? { ...s, phase: 'riding', t: 0 } : { ...s, t }; }
  if (s.phase === 'riding') {
    const travelled = Math.min(RIDE.turn, s.travelled + RIDE.spin * dt), angle = s.a0 + travelled;
    const out = travelled >= RIDE.turn || (leave && Math.abs(bottomOffset(s.index, angle, cfg)) <= RIDE.window);
    return out ? alight(s, travelled, cfg) : { ...s, travelled };
  }
  if (s.phase === 'alighting') { const t = s.t + dt; return t >= RIDE.alight ? rideIdle(s.aEnd) : { ...s, t }; }
  return s;
}

// the wheel's angle while a ride holds or drives it (an idle state remembers the last one)
export function rideAngle(s) {
  if (s.phase === 'boarding') return s.a0;
  if (s.phase === 'riding') return wrap(s.a0 + s.travelled);
  if (s.phase === 'alighting') return s.aEnd;
  return s.angle ?? 0;
}

// the walker's feet in the wheel frame (y over the floor), or null when idle
export function rideFeet(s, cfg = FERRIS) {
  if (s.phase === 'idle') return null;
  const g = gondolaPose(s.index, rideAngle(s), cfg);
  if (s.phase === 'boarding') { const k = smooth(s.t / RIDE.board); return { x: lerp(s.from.x, 0, k), y: lerp(0, g.floor, k), z: lerp(s.from.z, g.z, k) }; }
  if (s.phase === 'alighting') return { x: 0, y: lerp(g.floor, 0, smooth(s.t / RIDE.alight)), z: g.z };
  return { x: 0, y: g.floor, z: g.z };
}

// what E does now: board / leave / wait (riding outside the window) / none
export function rideAction(s, angle, local, grounded, cfg = FERRIS) {
  if (s.phase === 'riding') return { do: Math.abs(bottomOffset(s.index, rideAngle(s), cfg)) <= RIDE.window ? 'leave' : 'wait' };
  if (s.phase !== 'idle' || !grounded) return { do: 'none' };
  const t = boardingTarget(angle, local, cfg);
  return t ? { do: 'board', index: t.index } : { do: 'none' };
}

// the resting wheel turns by the wall clock + an offset; this offset makes the clock agree with `angle` at nowS
export const clockOffset = (angle, nowS, cfg = FERRIS) => wrap(angle) / cfg.spin - nowS;

// the eye of a walker standing in the gondola: P.y is the feet, the camera adds WALKER.eye
export const eyeShift = RIDE.eye - WALKER.eye;

// paclock.js (#726): the pure fleet-clock model for the F3 Postauto section -- wall or set time, a time-lapse
// factor, sub-stepping and the ?patime/?pasp URL state. No DOM, no three.js: node --test only.
import { parsePatime } from './postauto.js';

export const PA_SPEEDS = [1, 2, 5, 10, 30, 60];
const DAY = 86400;
const wrap = (secs) => ((secs % DAY) + DAY) % DAY;
const hhmm = (secs) => `${String(Math.floor(secs / 3600)).padStart(2, '0')}:${String(Math.floor(secs / 60) % 60).padStart(2, '0')}`;

// the clock state: mode 'wall' (Europe/Zurich wall time, 1x) or 'set' (base at t0, running at factor)
export const wallClock = () => ({ mode: 'wall', base: 0, t0: 0, factor: 1, given: null });

export function clockNow(c, perf, wall) {
  if (c.mode === 'wall') return wall;
  return wrap(c.base + (perf - c.t0) / 1000 * c.factor);
}

// set the fleet clock to secs after midnight; it runs on from there at the current factor
export function setTime(c, secs, perf) {
  return { mode: 'set', base: secs, t0: perf, factor: c.factor, given: secs };
}

// change the factor without a jump: rebase on the current time. A wall clock becomes a set clock that
// starts at the current wall time (given null, "from real time"); factor 1 on a wall clock stays wall.
export function setFactor(c, factor, perf, wall) {
  if (c.mode === 'wall' && factor === 1) return c;
  const base = c.mode === 'wall' ? wall : clockNow(c, perf, wall);
  return { mode: 'set', base, t0: perf, factor, given: c.mode === 'wall' ? null : c.given };
}

// a PA_SPEEDS member as a number, else 1
export function parseFactor(text) {
  const f = Number(text);
  return PA_SPEEDS.includes(f) ? f : 1;
}

// drive dtFleet of fleet time in sub-steps of at most maxStep, capped at maxN
export function fleetSteps(dtFleet, maxStep = 0.05, maxN = 64) {
  if (!(dtFleet > 0)) return { n: 0, h: 0 };
  const n = Math.max(1, Math.min(Math.ceil(dtFleet / maxStep), maxN));
  return { n, h: dtFleet / n };
}

// the clock-jump limit (fleetJumped's resync) in fleet time: a real stall of resync seconds scaled by the factor
export function jumpLimit(factor, resync) { return resync * Math.max(1, factor); }

// the ?patime/?pasp address-bar state: the last set time and the factor (pasp null at 1x)
export function clockQuery(c) {
  return { patime: c.mode === 'wall' || c.given === null ? null : hhmm(c.given), pasp: c.factor > 1 ? String(c.factor) : null };
}

// ?patime=HH:MM and ?pasp=factor from the URL: patime seconds (or null), the factor (or 1)
export function clockFromQuery(patime, pasp) {
  return { patime: parsePatime(patime), factor: parseFactor(pasp) };
}
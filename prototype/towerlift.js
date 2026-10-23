// #411 stage 1: the tower lift's logic -- pure. A cabin that stops at the 11 levels (EG, 1. ... 9. OG, roof); the ride itself is the lift.js
// state machine (closing -> moving -> opening), re-timed per trip to the distance. Not tied to the freight lift's two levels.
import { createLift } from './lift.js';

export const TOWER_LIFT = { speed: 2.5, minRide: 1.5, door: 1, hold: 4 };   // m/s, s, s (door opens/closes), s (the door stays open after an arrival)

export function createTowerLift(levels, cfg = TOWER_LIFT) {
  const machine = createLift({ dwell: 0, close: cfg.door, ride: 1, open: cfg.door, stopSpeed: 0.5, floors: 12 });
  let at = 0, y = levels[0], from = 0, target = null, pending = null, t = 0, idle = cfg.hold;   // idle: seconds since the last arrival or call
  const api = {
    levels,
    get y() { return y; },
    get at() { return machine.busy ? null : at; },     // the level it stands at, null while a trip runs
    get target() { return target; },
    get moving() { return machine.phase === 'descending'; },
    get busy() { return machine.busy || pending !== null; },
    get door() { return machine.door; },                // 0 shut ... 1 open
    // the leaf of a level is open when the cabin stands there with the door fully open
    doorOpenAt(k) { return !machine.busy && at === k && machine.door >= 0.9; },
    call(k) {
      if (!Number.isInteger(k) || k < 0 || k >= levels.length || machine.busy) return false;
      idle = 0;
      if (k === at) return true;                        // already here: the door just opens (again)
      pending = k; return true;
    },
    // dt, { occupied }: someone in the cabin keeps the door open while it stands. Returns the events: { type: 'start' | 'arrive', level }
    step(dt, { occupied = false } = {}) {
      const out = [];
      if (machine.phase === 'idle') {
        idle += dt;
        if (pending !== null) {
          from = at; target = pending; pending = null;
          machine.setTimes({ ride: Math.max(cfg.minRide, Math.abs(levels[target] - levels[from]) / cfg.speed) });
          machine.step(0, { onPlatform: false });       // re-arm after the last ride
          machine.step(dt, { onPlatform: true, speed: 0, dir: 'down' });
          t = 0; out.push({ type: 'start', level: target, ride: machine.times.ride });   // ride: the seconds this trip takes (the hum's length)
        } else machine.step(dt, { onPlatform: false, near: occupied || idle < cfg.hold });
        return out;
      }
      const wasMoving = machine.phase === 'descending';
      const ev = machine.step(dt, { onPlatform: true, speed: 0, dir: 'down' });
      if (machine.phase === 'descending' || wasMoving) {
        t += dt;
        const k = Math.min(1, t / machine.times.ride), e = k * k * (3 - 2 * k);   // eased
        y = levels[from] + (levels[target] - levels[from]) * e;
      }
      for (const e of ev) if (e.type === 'done') { at = target; target = null; y = levels[at]; idle = 0; out.push({ type: 'arrive', level: at }); }
      return out;
    },
  };
  return api;
}

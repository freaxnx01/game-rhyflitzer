// #277 / #361: the freight lift's ride as a pure state machine (no three.js, no DOM): idle -> closing -> descending -> opening
// -> idle, plus the cabin's level ('top' | 'bottom') and its proximity-driven door. step(dt, { onPlatform, near, level,
// speed, dir }) returns the events of that step: { type: 'start' | 'switch' | 'done', dir }. The 'switch' (both the level
// changes and the cabin flips) comes exactly at the midpoint of the descent. dir is 'down' (surface -> ring) or 'up'. The
// door at the cabin's level opens as a vehicle comes near and the cabin is on that level, closes as it leaves; while idle,
// `level` defaults to the cabin's own level and `near` to `onPlatform` (single-level callers keep working unchanged). After
// a ride the lift is disarmed until the car has left the platform, so arriving on it does not send the car straight back.
// #489: three stops (FREIGHT_*), a dwell's target (to) and a chosen stop (call).
export const LIFT_TIMES = { dwell: 1, close: 1, ride: 6, open: 1, stopSpeed: 0.5, floors: 12 };

// #489: the freight lift's stops, top down, and each one's depth in indicator floors (12 per ring step: a step takes T.ride)
export const FREIGHT_STOPS = ['top', 'bottom', 'ring2'];
export const FREIGHT_DEPTH = { top: 0, bottom: 12, ring2: 24 };
// with no choice made, standing in the cabin rides here: down to ring 1 from the surface (as before #489), up from either ring
export const FREIGHT_DEFAULT = { top: 'bottom', bottom: 'top', ring2: 'top' };

// depth: the stops the cabin knows (default: the two of #277, so towerlift.js and every two-level caller are unchanged).
// step(..., { to }) names the stop a dwell rides to (without it the cabin flips top <-> bottom and `dir` is taken as given);
// call(stop) picks a stop while idle -- it starts as soon as the platform is at rest, without the dwell and even when disarmed.
export function createLift(times = LIFT_TIMES, depth = { top: 0, bottom: times.floors }) {
  let T = { ...times }, phase = 'idle', t = 0, dwell = 0, armed = true, rideDir = 'down', switched = false, cabin = 'top', door = 0;
  let from = 'top', rideTo = 'bottom', rideT = T.ride, chosen = null;
  const span = () => Math.abs(depth[rideTo] - depth[from]);
  const dirTo = (stop) => (depth[stop] > depth[cabin] ? 'down' : 'up');
  const progress = () => (phase === 'descending' ? Math.min(1, t / rideT) : phase === 'opening' ? 1 : 0);
  const begin = (to, dir, out) => {
    phase = 'closing'; t = 0; dwell = 0; chosen = null; from = cabin; rideTo = to; rideDir = dir; switched = false;
    rideT = T.ride * span() / T.floors;
    out.push({ type: 'start', dir, to, ride: rideT });
  };
  const advance = (out) => {
    if (phase === 'closing' && t >= T.close) { phase = 'descending'; t -= T.close; }
    if (phase === 'descending') {
      if (!switched && t >= rideT / 2) { switched = true; cabin = rideTo; out.push({ type: 'switch', dir: rideDir, to: rideTo }); }
      if (t >= rideT) { phase = 'opening'; t -= rideT; }
    }
    if (phase === 'opening' && t >= T.open) { phase = 'idle'; t = 0; armed = false; door = 1; out.push({ type: 'done', dir: rideDir, to: rideTo }); }
  };
  return {
    get phase() { return phase; },
    get busy() { return phase !== 'idle'; },
    get dir() { return rideDir; },
    get cabin() { return cabin; },
    get chosen() { return chosen; },
    get target() { return phase === 'idle' ? null : rideTo; },
    // 0 = gate open, 1 = shut
    get gate() { return phase === 'closing' ? Math.min(1, t / T.close) : phase === 'descending' ? 1 : phase === 'opening' ? Math.max(0, 1 - t / T.open) : 0; },
    // the door at the cabin's level: proximity-driven while idle, the inverse of the ride's gate during a ride
    get door() { return phase === 'idle' ? door : 1 - this.gate; },
    doorAt(level) { return level === cabin ? this.door : 0; },
    place(level) { cabin = level; door = 0; chosen = null; },
    // the indicator: counts the floors passed, -1 below the top; null when idle
    floor() {
      if (phase === 'idle') return null;
      const lo = Math.min(depth[from], depth[rideTo]), hi = Math.max(depth[from], depth[rideTo]), n = Math.min(hi - lo - 1, Math.floor(progress() * (hi - lo)));
      return rideDir === 'down' ? -(lo + 1 + n) : -(hi - n);
    },
    call(stop) {
      if (phase !== 'idle' || !(stop in depth) || stop === cabin) return false;
      chosen = stop; return true;
    },
    setTimes(partial) { T = { ...T, ...partial }; },
    get times() { return { ...T }; },
    abort() { phase = 'idle'; t = 0; dwell = 0; armed = false; door = 0; chosen = null; },   // a jump ends a ride at once
    step(dt, { onPlatform, near = onPlatform, level = cabin, speed, dir, to }) {
      const out = [];
      if (phase === 'idle') {
        const here = level === cabin;
        door = here && near ? Math.min(1, door + dt / T.open) : Math.max(0, door - dt / T.close);
        if (!onPlatform) { armed = true; dwell = 0; chosen = null; return out; }
        if (!here || speed >= T.stopSpeed) { dwell = 0; return out; }
        if (chosen !== null) { begin(chosen, dirTo(chosen), out); return out; }
        if (!armed) { dwell = 0; return out; }
        dwell += dt;
        if (dwell < T.dwell) return out;
        if (to === undefined) begin(cabin === 'top' ? 'bottom' : 'top', dir, out); else begin(to, dirTo(to), out);
        return out;
      }
      t += dt; advance(out);
      return out;
    },
  };
}

// the cab's shaft wall texture: how far offset.y moves in dt seconds. three.js samples uv + offset, so a growing offset.y slides the
// pattern DOWN on screen; riding down the wall has to rise past the car (offset shrinks), riding up it has to sink (offset grows).
export const SHAFT_SCROLL = 0.5;
export function shaftScrollDelta(dir, phase, dt) { return phase === 'descending' ? (dir === 'down' ? -1 : 1) * dt * SHAFT_SCROLL : 0; }

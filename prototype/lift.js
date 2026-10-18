// #277 / #361: the freight lift's ride as a pure state machine (no three.js, no DOM): idle -> closing -> descending -> opening
// -> idle, plus the cabin's level ('top' | 'bottom') and its proximity-driven door. step(dt, { onPlatform, near, level,
// speed, dir }) returns the events of that step: { type: 'start' | 'switch' | 'done', dir }. The 'switch' (both the level
// changes and the cabin flips) comes exactly at the midpoint of the descent. dir is 'down' (surface -> ring) or 'up'. The
// door at the cabin's level opens as a vehicle comes near and the cabin is on that level, closes as it leaves; while idle,
// `level` defaults to the cabin's own level and `near` to `onPlatform` (single-level callers keep working unchanged). After
// a ride the lift is disarmed until the car has left the platform, so arriving on it does not send the car straight back.
export const LIFT_TIMES = { dwell: 1, close: 1, ride: 6, open: 1, stopSpeed: 0.5, floors: 12 };

export function createLift(times = LIFT_TIMES) {
  let T = { ...times }, phase = 'idle', t = 0, dwell = 0, armed = true, rideDir = 'down', switched = false, cabin = 'top', door = 0;
  const progress = () => (phase === 'descending' ? Math.min(1, t / T.ride) : phase === 'opening' ? 1 : 0);
  const advance = (out) => {
    if (phase === 'closing' && t >= T.close) { phase = 'descending'; t -= T.close; }
    if (phase === 'descending') {
      if (!switched && t >= T.ride / 2) { switched = true; cabin = cabin === 'top' ? 'bottom' : 'top'; out.push({ type: 'switch', dir: rideDir }); }
      if (t >= T.ride) { phase = 'opening'; t -= T.ride; }
    }
    if (phase === 'opening' && t >= T.open) { phase = 'idle'; t = 0; armed = false; door = 1; out.push({ type: 'done', dir: rideDir }); }
  };
  return {
    get phase() { return phase; },
    get busy() { return phase !== 'idle'; },
    get dir() { return rideDir; },
    get cabin() { return cabin; },
    // 0 = gate open, 1 = shut
    get gate() { return phase === 'closing' ? Math.min(1, t / T.close) : phase === 'descending' ? 1 : phase === 'opening' ? Math.max(0, 1 - t / T.open) : 0; },
    // the door at the cabin's level: proximity-driven while idle, the inverse of the ride's gate during a ride
    get door() { return phase === 'idle' ? door : 1 - this.gate; },
    doorAt(level) { return level === cabin ? this.door : 0; },
    place(level) { cabin = level; door = 0; },
    // the indicator: -1 ... -12 down, -12 ... -1 up; null when idle
    floor() {
      if (phase === 'idle') return null;
      const n = Math.min(T.floors - 1, Math.floor(progress() * T.floors)), down = -(1 + n);
      return rideDir === 'down' ? down : -(T.floors - n);
    },
    setTimes(partial) { T = { ...T, ...partial }; },
    get times() { return { ...T }; },
    abort() { phase = 'idle'; t = 0; dwell = 0; armed = false; door = 0; },   // a jump ends a ride at once
    step(dt, { onPlatform, near = onPlatform, level = cabin, speed, dir }) {
      const out = [];
      if (phase === 'idle') {
        const here = level === cabin;
        door = here && near ? Math.min(1, door + dt / T.open) : Math.max(0, door - dt / T.close);
        if (!onPlatform) { armed = true; dwell = 0; return out; }
        if (!here || !armed || speed >= T.stopSpeed) { dwell = 0; return out; }
        dwell += dt;
        if (dwell < T.dwell) return out;
        phase = 'closing'; t = 0; dwell = 0; rideDir = dir; switched = false; out.push({ type: 'start', dir });
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

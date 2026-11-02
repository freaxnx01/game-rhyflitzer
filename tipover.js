// tipover.js — a top-heavy vehicle (the Rhy Wobbler, a three-wheeler) tips over in a fast corner. Pure: no three.js, no DOM.
// Unit-tested with `node --test tests/*.test.mjs`. Units m, s, rad. Roll is about the car's forward axis: roll > 0 lowers its
// right side (+z), the same sense as car.rotation.x.
//
// The lateral acceleration (forward speed x yaw rate) is smoothed, so a tap of the key at speed only rocks it; held over
// cfg.latAccel, it falls onto the outside of the corner, lies there for cfg.lie seconds and is set back on its wheels.
// While it is down (any phase but 'up') the game ignores the driver. cfg: { latAccel, rate, lean, fall, lie, rise, pivot, slide }.
//   latAccel  m/s², the tipping limit       rate   1/s, how fast the felt load follows the corner
//   lean      rad, the warning lean at the limit   fall / lie / rise  s, the three phases on the ground
//   pivot     m, from the centre line to the edge it rolls over   slide  1/s, how fast it stops sliding on its side
export const TIP_UP = Object.freeze({ phase: 'up', load: 0, roll: 0, side: 0, t: 0, from: 0, landed: false });

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// vf: signed forward speed; th0 -> th1: the heading over dt. > 0 = pulled to the right (+z)
export function lateralAccel(vf, th0, th1, dt) {
  return vf * wrap(th1 - th0) / dt;
}

export const tipped = (s) => s.phase !== 'up';

// one step; a = lateralAccel of this step (ignored unless up). `landed` is true on the one step it hits the ground
export function stepTip(s, a, dt, cfg) {
  if (s.phase === 'up') return stepUp(s, a, dt, cfg);
  const t = s.t + dt;
  if (s.phase === 'falling') {
    if (t >= cfg.fall) return { ...s, phase: 'down', t: 0, roll: s.side * Math.PI / 2, landed: true };
    const u = t / cfg.fall;
    return { ...s, t, roll: s.side * (s.from + (Math.PI / 2 - s.from) * u * u), landed: false };
  }
  if (s.phase === 'down') return t >= cfg.lie ? { ...s, phase: 'righting', t: 0, landed: false } : { ...s, t, landed: false };
  if (t >= cfg.rise) return TIP_UP;
  const u = t / cfg.rise;
  return { ...s, t, roll: s.side * Math.PI / 2 * (1 - u * u * (3 - 2 * u)), landed: false };
}

function stepUp(s, a, dt, cfg) {
  const load = s.load + (a - s.load) * (1 - Math.exp(-cfg.rate * dt)), side = load > 0 ? -1 : load < 0 ? 1 : 0;   // the outside of the corner
  const roll = side * cfg.lean * clamp01(Math.abs(load) / cfg.latAccel) ** 2;
  if (Math.abs(load) < cfg.latAccel) return { ...TIP_UP, load, roll, side };
  return { phase: 'falling', load, roll, side, t: 0, from: Math.abs(roll), landed: false };
}

// the body turns about its outer bottom edge (pivot metres out on the side it falls to), not its centre: the offset of the
// centre in the car's frame, dy up and dz across, that keeps that edge on the ground
export function tipLift(roll, pivot) {
  const cz = pivot * Math.sign(roll);
  return { dy: cz * Math.sin(roll), dz: cz * (1 - Math.cos(roll)) };
}

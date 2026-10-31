// #463: Little Classic -- a 1970s city-car look-alike (Mr. Bean's Mini; primitives only, no logo, no lettering).
// The side profiles, the roof armchair and the cockpit sway, pure (no three.js, no DOM). Model metres: x forward, y up.
// The builder in index.html extrudes the profiles along z. Unit-tested with `node --test tests/*.test.mjs`.

export { profileSize } from './delorean.js';

// rear bottom -> up the rear -> over the roof -> down the bonnet -> bottom. x extremes ±1.455 and the roof at 1.30 give
// 3.01 m x 1.35 m with the 0.05 m bevel; the builder's proud chrome (round lamps, bumpers) lands the car at its real
// 3.05 m (the series car: 3.05 m long, 1.41 m wide, 1.35 m high, 10" wheels)
export const MINI_BODY = [[-1.40, 0.20], [-1.455, 0.44], [-1.42, 0.70], [-1.26, 0.84], [-1.00, 0.90], [-0.84, 1.22], [-0.76, 1.30], [0.04, 1.30], [0.44, 1.04], [0.60, 0.88], [0.94, 0.80], [1.34, 0.77], [1.455, 0.70], [1.455, 0.52], [1.40, 0.20], [1.00, 0.18], [-1.00, 0.18]];
// the cabin: steep rear window, flat roof, raked windscreen, above the belt line (y > 0.85)
export const MINI_GLASS = [[-0.96, 0.88], [-0.78, 1.16], [-0.04, 1.16], [0.40, 0.92], [0.54, 0.88]];

// the empty armchair on the roof: box sizes in model metres, the group centred at x = 0, facing forward. The seat
// cushion's top sits seatY above the roof (1.35 with the bevel); eye = where the cockpit view watches from.
export const CHAIR = {
  seatY: 0.45,                 // seat cushion top, above the roof
  seat: [0.52, 0.14, 0.56],    // cushion: length (x), thickness (y), width (z)
  back: [0.13, 0.60, 0.56],    // backrest: thickness (x), height (y), width (z), flush at the seat's rear edge
  arm: [0.40, 0.16, 0.09],     // armrests: length (x), height above the cushion (y), thickness (z)
  eye: [-0.20, 2.45, 0],       // the driver's eye: head height above the cushion, just in front of the backrest
};

// the chair's gentle sway, camera-only: max roll / pitch in rad, smoothing rate in 1/s
export const SWAY = { roll: 0.06, pitch: 0.03, rate: 2.2 };

// steer: the front-wheel yaw in rad (> 0 right), speed in m/s (>= 0). Target roll = steer x a saturating speed factor
// (the load swings out of the turn), target pitch from speed alone; exponential approach: frame-rate independent,
// never overshoots, no randomness, exactly 0 at rest.
export function stepSway(sway, input, dt) {
  const speedF = Math.tanh(Math.max(0, input.speed) / 25);
  const target = { roll: input.steer * speedF * SWAY.roll, pitch: speedF * SWAY.pitch };
  const k = 1 - Math.exp(-SWAY.rate * dt);
  return { roll: sway.roll + (target.roll - sway.roll) * k, pitch: sway.pitch + (target.pitch - sway.pitch) * k };
}

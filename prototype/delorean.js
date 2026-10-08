// #126: DeLorean look-alike -- the side profiles and the door animation, pure (no three.js, no DOM).
// Model metres: x forward, y up. The builder in index.html extrudes the profiles along z and places the louvres.
// Unit-tested with `node --test prototype/tests/*.test.mjs`.

// rear bottom -> up the rear -> over the roof -> down the wedge nose -> bottom. x extremes -2.09 / 2.08 and the roof
// at 1.09 give 4.27 m x 1.14 m with the 0.05 m bevel (DMC-12: 4.27 x 1.14; body 1.85 wide, 1.99 over the mirrors)
export const DELOREAN_BODY = [[-2.05, 0.30], [-2.09, 0.52], [-2.04, 0.78], [-1.92, 0.90], [-1.25, 0.95], [-0.78, 1.09], [0.05, 1.09], [0.95, 0.85], [1.78, 0.70], [2.04, 0.58], [2.08, 0.42], [2.02, 0.30], [1.6, 0.24], [-1.6, 0.24]];
// the cabin: rear window slope, flat roof, raked windscreen, belt line
export const DELOREAN_GLASS = [[-1.22, 0.94], [-0.80, 1.07], [0.02, 1.07], [0.90, 0.84], [0.72, 0.82], [-1.05, 0.90]];

export function profileSize(pts) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

// n slat centres along the segment, each tilted to its slope (rotation.z for a box lying along x)
export function louvreSlots(x0, y0, x1, y1, n) {
  const tilt = Math.atan2(y1 - y0, x1 - x0), out = [];
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; out.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, tilt }); }
  return out;
}

// gull-wing doors: open (1) while the car waits on the start screen, closed (0) for the run; angle in rad, rate in 1/s
export const DOOR = { angle: 1.2, rate: 3 };

export function doorTarget(raceState, speed) {
  return raceState === 'ready' && speed < 0.1 ? 1 : 0;
}

// exponential approach: frame-rate independent, never overshoots
export function stepDoor(open, target, dt, cfg = DOOR) {
  return open + (target - open) * (1 - Math.exp(-cfg.rate * dt));
}

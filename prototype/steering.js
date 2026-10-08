// #132: wheel steering and roll -- pure, no three.js, no DOM. Unit-tested with `node --test prototype/tests/*.test.mjs`.
// Units rad, m, m/s, s. yaw > 0 steers right (D), the same sign as the car's heading P.th.
export const WHEEL = { maxYaw: Math.PI / 6, speedFade: 30, rate: 10 };

const TAU = 2 * Math.PI;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// the lock shrinks with speed like the physics' steering authority (1 / (1 + speed / 30) in stepCar)
export function wheelTargetYaw(steer, speed, cfg = WHEEL) {
  return clamp(steer, -1, 1) * cfg.maxYaw / (1 + speed / cfg.speedFade);
}

// exponential approach: frame-rate independent, never overshoots
export function stepWheelYaw(yaw, steer, speed, dt, cfg = WHEEL) {
  return yaw + (wheelTargetYaw(steer, speed, cfg) - yaw) * (1 - Math.exp(-cfg.rate * dt));
}

// vf: signed forward speed; the angle is wrapped to 0..2*pi so it never loses precision
export function stepWheelSpin(spin, vf, wheelR, dt) {
  return (((spin + vf * dt / wheelR) % TAU) + TAU) % TAU;
}

export const frontAxleX = (wheels) => wheels.reduce((m, [x]) => Math.max(m, x), -Infinity);

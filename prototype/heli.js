// #10: helicopter flight model (F) -- pure, no three.js, no DOM. Unit-tested with `node --test prototype/tests/*.test.mjs`.
// Units m, m/s, m/s², rad/s. Same frame as the car: x east, z south, th = heading (0 = +x; D makes it grow, like steering).
export const HELI = { takeoffAgl: 120, clearance: 10, maxAgl: 400, top: 40, back: 10, accel: 12, yawRate: 1.2, climb: 15, follow: 2, rotorMargin: 4, camDist: 35, camH: 22 };

const held = (keys, codes) => codes.some(c => keys[c]);
const axis = (plus, minus) => (plus ? 1 : 0) - (minus ? 1 : 0);

// keys: KeyboardEvent.code → bool (the game's keys object); touch: the on-screen buttons { l, r, g, b, h }
export function heliInput(keys, touch) {
  return {
    fwd: axis(held(keys, ['KeyW', 'ArrowUp']) || touch.g, held(keys, ['KeyS', 'ArrowDown']) || touch.b),
    yaw: axis(held(keys, ['KeyD', 'ArrowRight']) || touch.r, held(keys, ['KeyA', 'ArrowLeft']) || touch.l),
    lift: axis(held(keys, ['Space']), held(keys, ['ShiftLeft', 'ShiftRight'])),
  };
}

// lowest allowed height at (x, z): the ground or the top of any non-bridge box within rotorMargin, plus clearance
export function heliFloor(ground, boxes, x, z, cfg = HELI) {
  let top = ground;
  for (const o of boxes) {
    if (o.bridge) continue;
    const dx = x - o.x, dz = z - o.z, lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c;
    if (Math.abs(lx) <= o.hw + cfg.rotorMargin && Math.abs(lz) <= o.hd + cfg.rotorMargin) top = Math.max(top, o.h);
  }
  return top + cfg.clearance;
}

export function heliStart(x, z, y, th, ground, cfg = HELI) {
  return { x, z, y, th, v: 0, alt: ground + cfg.takeoffAgl };
}

const approach = (value, target, maxStep) => value + Math.max(-maxStep, Math.min(maxStep, target - value));

// one fixed step: yaw, speed towards top / -back / 0, target altitude within [floor, ground + maxAgl], y follows it smoothly but never below the floor
export function stepHeli(s, input, dt, ground, floor, cfg = HELI) {
  const th = s.th + input.yaw * cfg.yawRate * dt;
  const target = input.fwd > 0 ? cfg.top : input.fwd < 0 ? -cfg.back : 0;
  const v = approach(s.v, target, cfg.accel * dt);
  const alt = Math.max(floor, Math.min(ground + cfg.maxAgl, s.alt + input.lift * cfg.climb * dt));
  const y = Math.max(floor, s.y + (alt - s.y) * (1 - Math.exp(-cfg.follow * dt)));
  return { x: s.x + Math.cos(th) * v * dt, z: s.z + Math.sin(th) * v * dt, y, th, v, alt };
}

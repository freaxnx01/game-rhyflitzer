// #202: on foot (Z) -- the walker's pure model, no three.js, no DOM. Unit-tested with `node --test prototype/tests/*.test.mjs`.
// Same frame as the car: x east, z south, th = heading (0 = +x, grows to the right). Units m, m/s, m/s², rad.
export const WALKER = { eye: 1.7, radius: 0.35, walk: 4.5, hover: 11, nitro: 2, climb: 6, turnRate: 2.2, gravity: 22, jumpV: 6, stepUp: 0.6, enterReach: 2.5, exitGap: 0.6, mouse: 0.0025, pitchMax: 1.4, hoverMaxAgl: 150 };

const held = (keys, codes) => codes.some(c => keys[c]);
const axis = (plus, minus) => (plus ? 1 : 0) - (minus ? 1 : 0);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// W/S or up/down walk, A/D sidestep, left/right turn (the keyboard-only look), Space up (or jump), Shift down, N held = nitro (#404)
export function footInput(keys) {
  return {
    fwd: axis(held(keys, ['KeyW', 'ArrowUp']), held(keys, ['KeyS', 'ArrowDown'])),
    side: axis(held(keys, ['KeyD']), held(keys, ['KeyA'])),
    turn: axis(held(keys, ['ArrowRight']), held(keys, ['ArrowLeft'])),
    lift: axis(held(keys, ['Space']), held(keys, ['ShiftLeft', 'ShiftRight'])),
    nitro: held(keys, ['KeyN']) ? 1 : 0,
  };
}

// one fixed step: turn, move along the heading (diagonals not faster; nitro doubles the horizontal speed, not the climb), then the height -- floorAt(x, z, y) is asked at the new spot
export function stepFoot(s, input, dt, floorAt, cfg = WALKER) {
  const th = s.th + input.turn * cfg.turnRate * dt, fx = Math.cos(th), fz = Math.sin(th);
  let mx = input.fwd * fx - input.side * fz, mz = input.fwd * fz + input.side * fx;
  const m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; }
  const speed = (s.hover ? cfg.hover : cfg.walk) * (input.nitro ? cfg.nitro : 1), vx = mx * speed, vz = mz * speed, x = s.x + vx * dt, z = s.z + vz * dt;
  const moved = { ...s, x, z, th, vx, vz }, floor = floorAt(x, z, s.y);
  return s.hover ? hoverStep(moved, input, dt, floor, cfg) : walkStep(moved, input, dt, floor, cfg);
}

function hoverStep(s, input, dt, floor, cfg) { return { ...s, vy: 0, y: Math.max(floor, s.y + input.lift * cfg.climb * dt) }; }

// on the ground (within stepUp above the floor and not rising) you stick to it, and Space jumps; in the air gravity pulls.
// The position step averages the old and new vy (trapezoidal, not semi-implicit Euler) so a held Space does not creep
// above the analytic apex (jumpV^2 / 2*gravity) frame by frame.
function walkStep(s, input, dt, floor, cfg) {
  const grounded = s.y - floor <= cfg.stepUp && s.vy <= 0;
  if (grounded && input.lift <= 0) return { ...s, y: floor, vy: 0 };
  const vy = grounded ? cfg.jumpV : s.vy - cfg.gravity * dt, y = s.y + (s.vy + vy) / 2 * dt;
  return y <= floor ? { ...s, y: floor, vy: 0 } : { ...s, y, vy };
}

const inside = (o, x, z) => {
  const dx = x - o.x, dz = z - o.z;
  if (o.circle) return Math.hypot(dx, dz) <= o.circle;
  return Math.abs(dx * o.c + dz * o.s) <= o.hw && Math.abs(-dx * o.s + dz * o.c) <= o.hd;
};

// the floor under the walker: the ground, or the top of a non-bridge box under you that is at most stepUp above your feet
export function footFloor(ground, boxes, x, z, y, cfg = WALKER) {
  let top = ground;
  for (const o of boxes) if (!o.bridge && o.h <= y + cfg.stepUp && o.h > top && inside(o, x, z)) top = o.h;
  return top;
}

// mouse look: right turns right (th grows, like D steering), up looks up; pitch clamped
export function footLook(th, pitch, dx, dy, cfg = WALKER) {
  return { th: th + dx * cfg.mouse, pitch: clamp(pitch - dy * cfg.mouse, -cfg.pitchMax, cfg.pitchMax) };
}

// where you step out: left (driver's) side first, then right, behind, front -- each clear of the body by exitGap
export function exitSpots(car, size, cfg = WALKER) {
  const fx = Math.cos(car.th), fz = Math.sin(car.th), side = size.w / 2 + cfg.radius + cfg.exitGap, end = size.l / 2 + cfg.radius + cfg.exitGap;
  return [[fz, -fx, side], [-fz, fx, side], [-fx, -fz, end], [fx, fz, end]].map(([ux, uz, d]) => ({ x: car.x + ux * d, z: car.z + uz * d }));
}

// the parked car as a collider (same OBB shape as the world's: hw along the heading)
export function parkedBox(car, size) {
  return { x: car.x, z: car.z, hw: size.l / 2, hd: size.w / 2, c: Math.cos(car.th), s: Math.sin(car.th), h: car.y + size.h, parked: true };
}

export function carReach(x, z, b) {
  const dx = x - b.x, dz = z - b.z, lx = dx * b.c + dz * b.s, lz = -dx * b.s + dz * b.c;
  return Math.hypot(Math.max(0, Math.abs(lx) - b.hw), Math.max(0, Math.abs(lz) - b.hd));
}

// keydown on foot: F toggles hover, E enters a building (#409); the car's own controls are swallowed; everything else is handled as usual
const FOOT_BLOCKED = new Set(['KeyC', 'KeyO', 'KeyI', 'KeyU', 'KeyH', 'Enter', 'NumpadEnter', 'KeyQ', 'KeyL', 'Digit1', 'KeyV']);
export function footKeyAction(code) {
  if (code === 'KeyF') return 'hover';
  if (code === 'KeyE') return 'enter';
  return FOOT_BLOCKED.has(code) ? 'block' : 'pass';
}

// footsteps: one step per `stride` metres walked on the ground (nitro strides longer but at twice the speed, so the steps come faster).
// The strides are longer than a real pace because the walker moves at 4.5 m/s. `acc` is the distance carried over; hovering or airborne walks nothing.
export const STEP_STRIDE = { walk: 2, nitro: 2.6 };
export function footSteps(acc, dist, nitro, grounded, stride = STEP_STRIDE) {
  if (!grounded || !(dist > 0)) return { acc: grounded ? acc : 0, steps: 0 };
  const len = nitro ? stride.nitro : stride.walk, total = acc + dist, steps = Math.floor(total / len);
  return { acc: total - steps * len, steps };
}

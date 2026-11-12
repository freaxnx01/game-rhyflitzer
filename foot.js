// #202: on foot (Z) -- the walker's pure model, no three.js, no DOM. Unit-tested with `node --test tests/*.test.mjs`.
// Same frame as the car: x east, z south, th = heading (0 = +x, grows to the right). Units m, m/s, m/s², rad.
export const WALKER = { eye: 1.7, radius: 0.35, walk: 4.5, hover: 11, nitro: 2, climb: 6, turnRate: 2.2, walkTau: 0.10, turnTau: 0.12, gravity: 22, jumpV: 6, stepUp: 0.6, enterReach: 2.5, exitGap: 0.6, mouse: 0.0025, pitchMax: 1.4, hoverMaxAgl: 150 };

const held = (keys, codes) => codes.some(c => keys[c]);
const axis = (plus, minus) => (plus ? 1 : 0) - (minus ? 1 : 0);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// W/S or up/down walk, A/D sidestep, left/right turn (the keyboard-only look), Space up (or jump), Shift down, N held = nitro (#404).
// #535: the phone's touch stick adds to the same axes -- its y walks, its x sidesteps, both analog
export function footInput(keys, stick = null) {
  return {
    fwd: clamp(axis(held(keys, ['KeyW', 'ArrowUp']), held(keys, ['KeyS', 'ArrowDown'])) + (stick ? stick.y : 0), -1, 1),
    side: clamp(axis(held(keys, ['KeyD']), held(keys, ['KeyA'])) + (stick ? stick.x : 0), -1, 1),
    turn: axis(held(keys, ['ArrowRight']), held(keys, ['ArrowLeft'])),
    lift: axis(held(keys, ['Space']), held(keys, ['ShiftLeft', 'ShiftRight'])),
    nitro: held(keys, ['KeyN']) ? 1 : 0,
  };
}

// one fixed step: turn, move along the heading (diagonals not faster; nitro doubles the horizontal speed, not the climb), then the height -- floorAt(x, z, y) is asked at the new spot.
// #895: the turn rate and the walking/sidestepping speeds ease in and out (walkTau/turnTau ~0.3 s to full); the eased
// values ride in s.tw/s.lf/s.ls (missing = 0), so old callers and saves still work. Smoothing the local-frame velocity
// (not the world's) keeps a turn while walking a clean arc; the height, jump, hover climb and gravity stay instant.
export function stepFoot(s, input, dt, floorAt, cfg = WALKER) {
  const tw = easeTo(s.tw ?? 0, input.turn * cfg.turnRate, dt, cfg.turnTau), th = s.th + tw.avg * dt, fx = Math.cos(th), fz = Math.sin(th);
  let f = input.fwd, r = input.side; const m = Math.hypot(f, r); if (m > 1) { f /= m; r /= m; }
  const speed = (s.hover ? cfg.hover : cfg.walk) * (input.nitro ? cfg.nitro : 1);
  const lf = easeTo(s.lf ?? 0, f * speed, dt, cfg.walkTau), ls = easeTo(s.ls ?? 0, r * speed, dt, cfg.walkTau);
  const vx = lf.avg * fx - ls.avg * fz, vz = lf.avg * fz + ls.avg * fx, x = s.x + vx * dt, z = s.z + vz * dt;
  const moved = { ...s, x, z, th, vx, vz, lf: lf.v, ls: ls.v, tw: tw.v }, floor = floorAt(x, z, s.y);
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

// #895: frame-rate independent easing -- the fraction of the gap closed over dt for a time constant tau
export const smoothK = (dt, tau) => (tau > 0 ? 1 - Math.exp(-dt / tau) : 1);
// v eases from v0 to target; avg is the exact mean value over dt (so a distance integrates exactly, whatever the dt split)
export function easeTo(v0, target, dt, tau) {
  if (!(tau > 0) || !(dt > 0)) return { v: target, avg: target };
  const k = smoothK(dt, tau);
  return { v: v0 + (target - v0) * k, avg: target + (v0 - target) * (k * tau / dt) };
}

// #895: the camera's yaw/pitch follow the body's lightly damped (tau ~40 ms), the yaw by the shortest angle; a gap
// over `snap` rad (a teleport, entering foot) snaps instead of sweeping
export const LOOK_EASE = { tau: 0.04, snap: 1.2 };
const wrapAngle = (a) => { const w = (a + Math.PI) % (2 * Math.PI); return w <= 0 ? w + Math.PI : w - Math.PI; };
export function easeLook(view, th, pitch, dt, ease = LOOK_EASE) {
  if (!view) return { th, pitch };
  const d = wrapAngle(th - view.th);
  if (Math.abs(d) > ease.snap || Math.abs(pitch - view.pitch) > ease.snap) return { th, pitch };
  const k = smoothK(dt, ease.tau);
  return { th: view.th + d * k, pitch: view.pitch + (pitch - view.pitch) * k };
}

// #592: the camera's eye height eases out over a tread snap; the body's y (physics) stays exact.
export const EYE_EASE = { tau: 0.05, minStep: 0.05 };
export function easeEye(prev, y, steady, dt, cfg = WALKER, ease = EYE_EASE) {
  if (!prev || !steady) return { y, off: 0 };
  const dy = y - prev.y;
  if (Math.abs(dy) > cfg.stepUp) return { y, off: 0 };
  const raw = Math.abs(dy) >= ease.minStep ? prev.off - dy : prev.off;
  return { y, off: clamp(raw * Math.exp(-dt / ease.tau), -cfg.stepUp, cfg.stepUp) };
}

const inside = (o, x, z) => {
  const dx = x - o.x, dz = z - o.z;
  if (o.circle) return Math.hypot(dx, dz) <= o.circle;
  return Math.abs(dx * o.c + dz * o.s) <= o.hw && Math.abs(-dx * o.s + dz * o.c) <= o.hd;
};

// the floor under the walker: the ground, the top of a non-bridge box under you that is at most stepUp above your feet,
// #412: plus `walkway`, the walkwayFloor(...) of the walkway surfaces under you (a slab or stair ramp inside a building) or null -- the second source
export function footFloor(ground, boxes, x, z, y, cfg = WALKER, walkway = null) {
  let top = ground;
  for (const o of boxes) if (!o.bridge && o.h <= y + cfg.stepUp && o.h > top && inside(o, x, z)) top = o.h;
  return walkway !== null && walkway > top ? walkway : top;
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

// keydown on foot: F toggles hover (blocked indoors, #412), E is the context key (#535: enters a glowing door outside, leaves inside);
// the car's own controls are swallowed (incl. its signal keys); everything else is handled as usual
const FOOT_BLOCKED = new Set(['KeyC', 'KeyO', 'KeyI', 'KeyU', 'KeyH', 'Enter', 'NumpadEnter', 'KeyQ', 'Comma', 'Period', 'KeyL', 'Digit1', 'Digit2', 'KeyV']);
export function footKeyAction(code, indoors = false) {
  if (code === 'KeyF') return indoors ? 'block' : 'hover';
  if (code === 'KeyE') return indoors ? 'leave' : 'enter';   // #535: E is the context key (B is only look-back)
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

// a left click on the landscape: on foot it toggles the look mode -- 'lock' grabs the mouse, 'unlock' lets it go again; null in the car or a menu
export function footClickAction({ foot, locked, menu }) {
  if (!foot || menu) return null;
  return locked ? 'unlock' : 'lock';
}

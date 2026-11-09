// #10: helicopter flight model (F) -- pure, no three.js, no DOM. Unit-tested with `node --test tests/*.test.mjs`.
// Units m, m/s, m/s², rad/s. Same frame as the car: x east, z south, th = heading (0 = +x; D makes it grow, like steering).
// #731: handling, attitude and chase camera adapted from mrdoob/slop-newyork (MIT) js/controllers.js updateHelicopter, js/cameras.js:
// speed brakes exponentially (drag) instead of a linear ramp, the climb is a vertical speed with damping instead of a lagging target
// altitude, and the machine leans (pitch nose down with speed, roll into the turn) -- see docs/superpowers/specs/2026-11-07-heli-flight-feel-design.md
export const HELI = { takeoffAgl: 120, clearance: 3, maxAgl: 400, top: 40, topNitro: 60, back: 10, accel: 20, accelNitro: 30, drag: 1.8,
  rest: 0.05, yawRate: 1.2, climb: 16, climbAccel: 22, climbDrag: 3.5, assistStop: 5, pitchMax: 0.24, rollMax: 0.28, tiltRate: 5,
  bobAmp: 0.18, bobRate: 2.6, rotorMargin: 8, landRadius: 150, camDist: 16, camH: 6, camAhead: 8, camUp: 2, camRate: 8.5, camSpeedRate: 3 };
// rotorMargin covers the model: nose 3.9 m, tail rotor 7.85 m and blades 6 m from the hub (#99). landRadius: F lands only with a road this close (review of #84)
// clearance: the skids hang about 3 m over the road, the field or a roof -- low enough to skim along a street (playtest 2026-11-08)
// rest: below this speed the exponential brake snaps to 0 (a hover stays put). assistStop: take-off assist ends this far below its goal
// (the climb coasts climb / climbDrag = 4.6 m after the last push)

const held = (keys, codes) => codes.some(c => keys[c]);
const axis = (plus, minus) => (plus ? 1 : 0) - (minus ? 1 : 0);

// keys: KeyboardEvent.code → bool (the game's keys object); touch: the on-screen buttons { l, r, g, b, h }. N (nitro, #99) counts as forward, like gas for the car
export function heliInput(keys, touch) {
  const nitro = held(keys, ['KeyN']) ? 1 : 0;
  return {
    fwd: axis(held(keys, ['KeyW', 'ArrowUp']) || touch.g || nitro, held(keys, ['KeyS', 'ArrowDown']) || touch.b),
    yaw: axis(held(keys, ['KeyD', 'ArrowRight']) || touch.r, held(keys, ['KeyA', 'ArrowLeft']) || touch.l),
    lift: axis(held(keys, ['Space']), held(keys, ['ShiftLeft', 'ShiftRight'])),
    nitro,
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
  return { x, z, y, th, v: 0, vy: 0, pitch: 0, roll: 0, assist: ground + cfg.takeoffAgl };
}

const approach = (value, target, maxStep) => value + Math.max(-maxStep, Math.min(maxStep, target - value));
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const settle = (value, target, rate, dt) => value + (target - value) * Math.min(1, rate * dt);

function stepSpeed(v, input, dt, cfg) {
  if (input.fwd === 0) { const braked = v * Math.max(0, 1 - cfg.drag * dt); return Math.abs(braked) < cfg.rest ? 0 : braked; }
  const target = input.fwd > 0 ? (input.nitro ? cfg.topNitro : cfg.top) : -cfg.back;
  return approach(v, target, (input.nitro ? cfg.accelNitro : cfg.accel) * dt);
}

// the take-off climb: F arms `assist` (goal height); until the player touches Space/Shift or the goal is near, the step climbs as if Space were held
function stepLift(s, input, cfg) {
  const assisting = input.lift === 0 && s.assist != null && s.y < s.assist - cfg.assistStop;
  return { lift: assisting ? 1 : input.lift, assist: assisting ? s.assist : null };
}

// one fixed step. ceiling defaults to ground + maxAgl; the Eiffel room passes its own
export function stepHeli(s, input, dt, ground, floor, cfg = HELI, ceiling = ground + cfg.maxAgl) {
  const th = s.th + input.yaw * cfg.yawRate * dt;
  const v = stepSpeed(s.v, input, dt, cfg);
  const { lift, assist } = stepLift(s, input, cfg);
  let vy = lift !== 0 ? clamp(s.vy + lift * cfg.climbAccel * dt, -cfg.climb, cfg.climb) : s.vy * Math.max(0, 1 - cfg.climbDrag * dt);
  let y = s.y + vy * dt;
  if (y > ceiling) { y = ceiling; vy = Math.min(vy, 0); }
  if (y < floor) { y = floor; vy = Math.max(vy, 0); }
  const pitch = settle(s.pitch, clamp(v / cfg.top, -1, 1) * cfg.pitchMax, cfg.tiltRate, dt);
  const roll = settle(s.roll, input.yaw * cfg.rollMax, cfg.tiltRate, dt);
  return { x: s.x + Math.cos(th) * v * dt, z: s.z + Math.sin(th) * v * dt, y, th, v, vy, pitch, roll, assist };
}

// drawn only, never physics: a slow swing so the machine is never dead still (slop-newyork: sin(t * 2.6) * 0.18)
export const heliBob = (t, cfg = HELI) => Math.sin(t * cfg.bobRate) * cfg.bobAmp;

// engine load 0..1 for the rotor sound, ported from slop-newyork js/audio-sources.js helicopterLoad: hover 0.45, collective up harder, down softer
export function heliLoad(v, vy, input, cfg = HELI) {
  const unit = (x) => clamp(x, 0, 1);
  return unit(0.45 + 0.28 * Math.max(input.lift, 0) - 0.16 * Math.max(-input.lift, 0)
    + 0.15 * unit(vy / cfg.climb) - 0.08 * unit(-vy / cfg.climb) + 0.1 * Math.abs(input.fwd) + 0.12 * unit(Math.abs(v) / cfg.top));
}

// #731 chase camera, adapted from mrdoob/slop-newyork (MIT) js/cameras.js: the offset behind the helicopter is eased in the helicopter's
// own frame (not in world space, which trails a fast target by about speed / rate and swings on turns); only the height base is eased in
// world space; the distance grows with a smoothed speed. State c = { ox, oy, oz (camera offset), lx, ly, lz (look offset), base, speed }.
const chaseGoal = (th, speed, cfg) => {
  const dist = cfg.camDist * (1 + Math.min(0.25, speed * 0.01)) + speed * 0.1, fx = Math.cos(th), fz = Math.sin(th);
  return { ox: -fx * dist, oy: cfg.camH, oz: -fz * dist, lx: fx * cfg.camAhead, ly: cfg.camUp, lz: fz * cfg.camAhead };
};

// start from where the camera really is (car camera, or the camera of the last flight), so the take-off glides instead of cutting
export function heliChaseFrom(cam, p, th, cfg = HELI) {
  const g = chaseGoal(th, 0, cfg);
  return { ox: cam.x - p.x, oy: cam.y - p.y, oz: cam.z - p.z, lx: g.lx, ly: g.ly, lz: g.lz, base: p.y, speed: 0 };
}

export function heliChaseStep(c, p, th, v, dt, cfg = HELI) {
  const speed = c.speed + (Math.abs(v) - c.speed) * (1 - Math.exp(-cfg.camSpeedRate * dt));
  const k = 1 - Math.exp(-cfg.camRate * dt), g = chaseGoal(th, speed, cfg), ease = (a, b) => a + (b - a) * k;
  const base = ease(c.base, p.y), n = { ox: ease(c.ox, g.ox), oy: ease(c.oy, g.oy), oz: ease(c.oz, g.oz), lx: ease(c.lx, g.lx), ly: ease(c.ly, g.ly), lz: ease(c.lz, g.lz), base, speed };
  return { ...n, pos: { x: p.x + n.ox, y: base + n.oy, z: p.z + n.oz }, look: { x: p.x + n.lx, y: base + n.ly, z: p.z + n.lz } };
}

// the road to land on: the nearest one ({ d, x, z, th }) if it lies within landRadius, else null -- no teleport to a far road
export function landingSpot(spot, cfg = HELI) { return spot && spot.d <= cfg.landRadius ? spot : null; }

// HUD height (#99): whole metres above the ground under the helicopter, and above sea level when the terrain header's base (m a.s.l. of y = 0) is known
export function heliAltitude(y, ground, base) {
  return { agl: Math.round(y - ground), asl: Number.isFinite(base) ? Math.round(y + base) : null };
}

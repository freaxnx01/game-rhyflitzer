// #93: the drone chase camera -- pure, no three.js, no DOM. Unit-tested with `node --test tests/*.test.mjs`.
// rate / aimRate: lerp rates (1/s) of the camera position and of its aim point; aimAhead / aimUp: the aim point relative to the car (m);
// sway*: a small deterministic hover around the target, driven by the camera's own clock (CAM.t), so it freezes with the pause and never uses rnd()
export const DRONE = { rate: 2.5, aimRate: 4, aimAhead: 4, aimUp: 1, swaySide: 0.5, swayUp: 0.3, swaySideHz: 0.33, swayUpHz: 0.21 };

// side: along the car's right vector; up: world y
export function droneSway(t, cfg = DRONE) {
  return { side: Math.sin(2 * Math.PI * cfg.swaySideHz * t) * cfg.swaySide, up: Math.sin(2 * Math.PI * cfg.swayUpHz * t) * cfg.swayUp };
}

// #202: the walker's first-person view: the eye `eye` metres over the feet, looking along th, pitched up by `pitch` (rad)
// #408: back = true looks over the shoulder (the heading turned by half a circle, the pitch kept)
export function footView(x, y, z, th, pitch, eye, back = false) {
  if (back) th += Math.PI;
  const ey = y + eye, cp = Math.cos(pitch);
  return { eye: [x, ey, z], at: [x + Math.cos(th) * cp * 10, ey + Math.sin(pitch) * 10, z + Math.sin(th) * cp * 10] };
}

// #777: the chase cam's obstacle pull-in, eased, held and looking ahead (the old step loop snapped by up to 1.2 m a frame).
// pull is the fraction of the chase distance the camera keeps; min: the closest it gets; inRate / outRate: 1/s;
// hold: s the camera stays in after the last closer need; rise: m of extra height at pull 0; lookAhead: s of the spin
// checked ahead; samples: steps over that window; maxYawRate: rad/s clamp; still: rad/s under which only now is checked
export const PULL = { min: 0.2, inRate: 1.0, outRate: 0.4, hold: 1.5, rise: 2.5, lookAhead: 0.6, samples: 4, maxYawRate: 12, still: 0.05 };

// blocked(t): is the camera point at fraction t of the chase distance inside a solid? Returns the largest free t,
// searching inward from the ideal spot (0.05 scan, then 5 bisection steps), or cfg.min when nothing is free.
export function clearFraction(blocked, cfg = PULL) {
  if (!blocked(1)) return 1;
  let hi = 1, lo = null;
  for (let t = 0.95; t >= cfg.min - 1e-9; t -= 0.05) { if (!blocked(t)) { lo = t; break; } hi = t; }
  if (lo === null) return cfg.min;
  for (let i = 0; i < 5; i++) { const m = (lo + hi) / 2; if (blocked(m)) hi = m; else lo = m; }
  return lo;
}

// the headings to check: now and, for a turning car, where it will point within cfg.lookAhead s
export function aheadHeadings(th, yawRate, cfg = PULL) {
  if (Math.abs(yawRate) < cfg.still) return [th];
  const w = Math.max(-cfg.maxYawRate, Math.min(cfg.maxYawRate, yawRate)), out = [];
  for (let k = 0; k <= cfg.samples; k++) out.push(th + w * cfg.lookAhead * k / cfg.samples);
  return out;
}

// state { pull, hold } -> next state: in towards a closer need at cfg.inRate, re-arming the hold; out towards a farther
// need at cfg.outRate only once the hold has run out
export function pullStep(state, need, dt, cfg = PULL) {
  if (need < state.pull) return { pull: Math.max(need, state.pull - cfg.inRate * dt), hold: cfg.hold };
  const hold = state.hold - dt;
  if (hold > 0) return { pull: state.pull, hold };
  return { pull: Math.min(need, state.pull + cfg.outRate * dt), hold: 0 };
}

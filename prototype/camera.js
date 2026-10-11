// #93: the drone chase camera -- pure, no three.js, no DOM. Unit-tested with `node --test prototype/tests/*.test.mjs`.
// rate / aimRate: lerp rates (1/s) of the camera position and of its aim point; aimAhead / aimUp: the aim point relative to the car (m);
// sway*: a small deterministic hover around the target, driven by the camera's own clock (CAM.t), so it freezes with the pause and never uses rnd()
export const DRONE = { rate: 2.5, aimRate: 4, aimAhead: 4, aimUp: 1, swaySide: 0.5, swayUp: 0.3, swaySideHz: 0.33, swayUpHz: 0.21 };

// side: along the car's right vector; up: world y
export function droneSway(t, cfg = DRONE) {
  return { side: Math.sin(2 * Math.PI * cfg.swaySideHz * t) * cfg.swaySide, up: Math.sin(2 * Math.PI * cfg.swayUpHz * t) * cfg.swayUp };
}

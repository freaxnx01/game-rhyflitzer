// trailer.js — #1103: the tank truck's drawbar trailer. Pure module: no DOM, no three.js.
// phi = trailer heading minus truck heading, in the game's th frame (x east, z south, th grows to the right, see foot.js):
// phi > 0 = the trailer swings to the truck's RIGHT (its +z side when the truck faces +x), phi < 0 = to the left.
// yawRate = d(th)/dt of the truck: > 0 turns right (steer +1 / D), < 0 turns left, so a steady turn settles phi on the inside (sign -yawRate).
// Single pivot: the hitch sits `hitch` behind the truck origin, the trailer's axle `length` behind the hitch. The hitch velocity
// v*u1 - hitch*yawRate*n1 turns the trailer by its component across the trailer, divided by length; phi also loses the truck's own yaw.
export const TRAILER = { maxAngle: 1.4, maxStep: 1 / 120 };

const dPhi = (phi, v, yawRate, { hitch, length }) => -yawRate - (v * Math.sin(phi) + hitch * yawRate * Math.cos(phi)) / length;

// the new angle after dt; sub-stepped so a long frame stays stable, clamped to +-maxAngle (reversing folds it up to the clamp)
export function trailerStep(phi, v, yawRate, geom, dt) {
  const n = Math.ceil(dt / TRAILER.maxStep - 1e-9), h = dt / n;
  for (let i = 0; i < n; i++) phi = Math.max(-TRAILER.maxAngle, Math.min(TRAILER.maxAngle, phi + dPhi(phi, v, yawRate, geom) * h));
  return phi;
}

// #163: the car's ground shadow -- pure, no three.js, no DOM. Unit-tested with `node --test prototype/tests/*.test.mjs`.
// Frame as the car: x east, z south, th = heading (0 = +x); car model +x forward, +z right. Metres and radians.
export const SHADOW = { margin: 0.5, core: 0.92, lift: 0.04, hideAbove: 6, minFade: 0.2, bodyMid: 0.4, roll: 1.0 };
// margin: soft edge outside the dark core; core: the box fraction that is tyres and body, not mirror tips; lift: above the ground, against
// z-fighting; hideAbove: air height where the shadow is gone; minFade: opacity floor while fading; bodyMid: the body-centre height as a
// fraction of the car height (what the sun displaces); roll: lateral ground-sample distance for the roll tilt

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

// box: { l, w, h } from measureCar. l/w = quad size, cl/cw = dark core size
export function shadowSize(box) {
  const cl = box.l * SHADOW.core, cw = box.w * SHADOW.core;
  return { l: cl + 2 * SHADOW.margin, w: cw + 2 * SHADOW.margin, cl, cw };
}

// u, v in [-1, 1] across the quad; fu, fv = margin as a fraction of the half size per axis. 1 in the core, a smoothstep to 0 at the edge,
// a rounded rectangle: the distance outside the core box, normalised per axis, combined by length.
// The guard is exact, not just an optimisation: (1 - fu) rounds, so the arithmetic alone leaves a ~1e-31 residue at the quad edge
export function shadowAlpha(u, v, fu, fv) {
  if (Math.abs(u) >= 1 || Math.abs(v) >= 1) return 0;
  const du = Math.max(0, Math.abs(u) - (1 - fu)) / fu, dv = Math.max(0, Math.abs(v) - (1 - fv)) / fv;
  return smooth(1 - Math.hypot(du, dv));
}

// fore/aft: ground dx ahead of / behind the centre; left/right: ground dz to each side. pitch > 0 = nose up, roll > 0 = right side up
export function groundTilt(fore, aft, left, right, dx, dz) {
  return { pitch: Math.atan((fore - aft) / (2 * dx)), roll: Math.atan((right - left) / (2 * dz)) };
}

// sun: vector from the scene toward the sun (sun.position as-is). Where a point `height` above the ground lands along the light
export function sunShift(sun, height) {
  if (!(sun.y > 0)) return { x: 0, z: 0 };
  const k = height / sun.y;
  return { x: -sun.x * k || 0, z: -sun.z * k || 0 };
}

export function shadowOpacity(base, air) { return base * clamp(1 - air / SHADOW.hideAbove, SHADOW.minFade, 1); }

export function shadowShown({ fly, wet, air, eye, hidden }) { return !fly && !wet && air < SHADOW.hideAbove && !eye && !hidden; }

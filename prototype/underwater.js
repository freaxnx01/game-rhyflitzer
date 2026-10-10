// #101: the underwater Rhine -- pure helpers (no three.js, no DOM). node --test prototype/tests/underwater.test.mjs
// Units m, m/s, rad/s. riverDist is negative inside the water (index.html riverDist / the pipeline SDF).
export const UW = {
  slope: 0.3, maxDepth: 6,          // bed: 0 at the shoreline, slope x distance in, capped (the Rhine above the Säckingen weir)
  sink: 3, drag: 1.2, topFactor: 0.2,   // a car in the water sinks at 3 m/s; on the bed: 1.2 /s drag, a fifth of the top speed
  camUnder: 0.8,                     // the chase target is pulled this far under the surface once the car is submerged
  fogColor: '#17505f', skyHor: '#2b7a86', fogDensity: 0.035, hemiFactor: 0.6, sunFactor: 0.5,   // the look under the surface
  hintAt: 3,                         // seconds after the splash: "drive up to the bank, or press R"
  schools: 14, sampleStep: 12, shoreClear: 8,   // content: fish schools; bed samples every 12 m, at least 8 m from the shore
};

export function bedDepth(riverDist) { return riverDist >= 0 ? 0 : Math.min(UW.maxDepth, -riverDist * UW.slope); }

// the car counts as submerged half a metre under the surface (the splash itself is not "underwater")
export function submerged(y, wl) { return wl !== null && wl !== undefined && y < wl - 0.5; }

export function underwaterCamY(targetY, wl) { return Math.min(targetY, wl - UW.camUnder); }

// a jittered grid over [x0, z0, x1, z1]: one point per step x step cell, moved by up to +-step/2 * (rnd - 0.5) * 2 ... kept if inside(x, z)
export function bedSamples([x0, z0, x1, z1], step, inside, rnd) {
  const out = [];
  for (let z = z0 + step / 2; z < z1; z += step) for (let x = x0 + step / 2; x < x1; x += step) {
    const px = x + (rnd() - 0.5) * step, pz = z + (rnd() - 0.5) * step;
    if (inside(px, pz)) out.push([px, pz]);
  }
  return out;
}

const COLOURS = ['#b9c3cc', '#7d9a6a', '#d88a4a'];   // silver, green, Rotfeder
const rr = (rnd, a, b) => a + rnd() * (b - a);

// a school circling (x, z), between 0.8 and 2.5 m above the bed, colour by school index
export function makeSchool(x, z, bed, rnd, index = 0) {
  return { x, z, y: bed + rr(rnd, 0.8, 2.5), r: rr(rnd, 5, 12), n: Math.floor(rr(rnd, 8, 15)), omega: rr(rnd, 0.3, 0.6), phase: rr(rnd, 0, Math.PI * 2), colour: COLOURS[index % COLOURS.length] };
}

// fish k of the school at time t: on the circle, a share of the turn ahead of fish 0, heading along the tangent, bobbing 0.3 m;
// written into out (the render loop passes one scratch object: no allocation per fish per frame)
export function schoolPose(s, k, t, out = {}) {
  const a = s.phase + s.omega * t + (k / s.n) * Math.PI * 2;
  const x = s.x + Math.cos(a) * s.r, z = s.z + Math.sin(a) * s.r;
  out.x = x; out.y = s.y + 0.3 * Math.sin(t * 2 + k); out.z = z; out.th = Math.atan2(Math.cos(a), -Math.sin(a));
  return out;
}

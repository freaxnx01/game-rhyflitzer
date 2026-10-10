// #100: pontoon bridge -- pure rules and geometry (no DOM, no three.js). Unit-tested with `node --test prototype/tests/*.test.mjs`.
// Frame as the car: x east, z south, metres. The deck runs from a (near bank, inland) to b (far bank, on the road) along (ux, uz).
// env = { dist(x, z), nameAt(x, z), waterLevel(x, z), roadAt(x, z), bridgeNear(x, z), ground(x, z) }: the world's adapters, so tests use a synthetic river.
import { bridgeAccepts } from './world.js';

export const PONTOON_CFG = { reach: 30, maxWidth: 400, roadReach: 80, apron: 6, hw: 2.2, deckAbove: 0.9, maxGrade: 0.15, minRamp: 6, maxRamp: 60, bay: 6, buildSecs: 3, bridgeClear: 25, sweepDeg: [0, 5, -5, 10, -10, 15, -15, 20, -20, 25, -25], dropH: 1.5, dropSecs: 0.4, minGrad: 0.2 };

// unit vector towards the water: minus the SDF gradient (central differences over ±h); null where the field is flat (no bank near)
export function bankNormal(dist, x, z, h = 4, cfg = PONTOON_CFG) {
  const gx = (dist(x + h, z) - dist(x - h, z)) / (2 * h), gz = (dist(x, z + h) - dist(x, z - h)) / (2 * h), g = Math.hypot(gx, gz);
  return g < cfg.minGrad ? null : [-gx / g, -gz / g];
}

// distance t along u from (x, z), starting at t0 and up to max, to the first point that is water (dist < 0) / land (dist >= 0): 1 m steps, bisected to 0.1 m; null if none
export function marchToWater(dist, x, z, u, t0, max) { return march(dist, x, z, u, t0, max, v => v < 0); }
export function marchToLand(dist, x, z, u, t0, max) { return march(dist, x, z, u, t0, max, v => v >= 0); }
function march(dist, x, z, u, t0, max, hit) {
  const at = (t) => dist(x + u[0] * t, z + u[1] * t);
  if (hit(at(t0))) return t0;
  let lo = t0;
  for (let t = t0 + 1; t <= max; t += 1) {
    if (hit(at(t))) { let hi = t; while (hi - lo > 0.1) { const m = (lo + hi) / 2; if (hit(at(m))) hi = m; else lo = m; } return hi; }
    lo = t;
  }
  return null;
}

function rotate([ux, uz], deg) { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [ux * c - uz * s, ux * s + uz * c]; }

// the bank: on land, within reach of the water, with a bank direction, and the water there is the Rhine -- returns the normal or null
function bankAt(env, x, z, cfg) {
  const d0 = env.dist(x, z); if (d0 < 0 || d0 > cfg.reach) return null;
  const n = bankNormal(env.dist, x, z, 4, cfg); if (!n) return null;
  const t = marchToWater(env.dist, x, z, n, 0, cfg.reach); if (t === null) return null;
  return env.nameAt(x + n[0] * (t + 2), z + n[1] * (t + 2)) === 'Rhein' ? n : null;
}
export function atRhineBank(env, x, z, cfg = PONTOON_CFG) { return bankAt(env, x, z, cfg) !== null; }

// the crossing from the car at (x, z): perpendicular to the bank, swept ±25°, to the first road on the far bank (else 6 m onto it); the pick reaches a road if any does, shortest first
export function crossingLine(env, x, z, cfg = PONTOON_CFG) {
  const n = bankAt(env, x, z, cfg); if (!n) return { error: 'noBank' };
  let best = null;
  for (const deg of cfg.sweepDeg) {
    const u = rotate(n, deg), tIn = marchToWater(env.dist, x, z, u, 0, cfg.reach + 10); if (tIn === null) continue;
    const tOut = marchToLand(env.dist, x, z, u, tIn + 1, tIn + cfg.maxWidth); if (tOut === null) continue;
    let tEnd = tOut + cfg.apron, road = false;
    for (let t = tOut + cfg.apron; t <= tOut + cfg.roadReach; t += 2) if (env.roadAt(x + u[0] * t, z + u[1] * t)) { tEnd = t; road = true; break; }
    const cand = { u, tIn, tOut, tEnd, road, len: tEnd - (tIn - cfg.apron) };
    if (!best || (cand.road && !best.road) || (cand.road === best.road && cand.len < best.len)) best = cand;
  }
  if (!best) return { error: 'noFarBank' };
  const { u, tIn, tOut, tEnd, len } = best, tA = tIn - cfg.apron, a = [x + u[0] * tA, z + u[1] * tA], b = [x + u[0] * tEnd, z + u[1] * tEnd];
  for (let t = 0; t <= len + 1e-9; t += 10) if (env.bridgeNear(a[0] + u[0] * t, a[1] + u[1] * t)) return { error: 'hasBridge' };
  if (env.bridgeNear(b[0], b[1])) return { error: 'hasBridge' };
  const tMid = (tIn + tOut) / 2, deckH = env.waterLevel(x + u[0] * tMid, z + u[1] * tMid) + cfg.deckAbove, hNear = env.ground(a[0], a[1]), hFar = env.ground(b[0], b[1]);
  const ramp = (h) => Math.max(cfg.minRamp, Math.min(cfg.maxRamp, Math.abs(h - deckH) / cfg.maxGrade));
  let rampNear = ramp(hNear), rampFar = ramp(hFar); const sum = rampNear + rampFar; if (sum > len) { rampNear *= len / sum; rampFar *= len / sum; }
  return { a, b, len, ux: u[0], uz: u[1], hw: cfg.hw, deckH, hNear, hFar, rampNear, rampFar, nBays: Math.ceil(len / cfg.bay), built: 0, dir: 1 };
}

// (t along the deck from a, s to the right of it)
export function pontoonLocal(d, x, z) { const dx = x - d.a[0], dz = z - d.a[1]; return [dx * d.ux + dz * d.uz, -dx * d.uz + dz * d.ux]; }
// surface height at t: linear from hNear up/down to deckH over rampNear, flat, linear to hFar over rampFar; clamped to the ends (no extrapolation)
export function pontoonSurfaceAt(d, t) {
  const u = Math.max(0, Math.min(d.len, t));
  if (u < d.rampNear) return d.hNear + (d.deckH - d.hNear) * (u / d.rampNear);
  if (u > d.len - d.rampFar) return d.hFar + (d.deckH - d.hFar) * ((d.len - u) / d.rampFar);
  return d.deckH;
}
// the car drives only on whole laid bays
export function drivableLength(d, cfg = PONTOON_CFG) { return Math.min(d.len, Math.floor(d.built * d.nBays + 1e-9) * cfg.bay); }
// onBridge's answer for the pontoon: { b, t, pontoon: true } or null; y as in bridgeAccepts (an object 1.5 m under the deck is not on it)
export function pontoonHit(d, x, z, y) {
  if (!d) return null;
  const [t, s] = pontoonLocal(d, x, z);
  if (t < 0 || t > drivableLength(d) || Math.abs(s) > d.hw) return null;
  return bridgeAccepts(pontoonSurfaceAt(d, t), y) ? { b: d, t, pontoon: true } : null;
}

// one fixed step of the build (dir 1) or the removal (dir -1); null once a removal is complete
export function stepPontoon(d, dt, cfg = PONTOON_CFG) {
  if (!d) return null;
  const built = Math.max(0, Math.min(1, d.built + d.dir * dt / cfg.buildSecs));
  return d.dir < 0 && built === 0 ? null : { ...d, built };
}
export function togglePontoon(d) { return { ...d, dir: -d.dir }; }
// the HUD line: 'remove' while a deck exists, 'build' at a bank, else nothing
export function pontoonPrompt(deck, atBank) { return deck ? 'remove' : atBank ? 'build' : null; }

// one frame per bay for the meshes: centre, surface heights at both ends, floating (a hull) or on the ramp (legs)
export function bayFrames(d, cfg = PONTOON_CFG) {
  const out = [];
  for (let i = 0; i < d.nBays; i++) {
    const t0 = i * cfg.bay, t1 = Math.min(d.len, t0 + cfg.bay), tm = (t0 + t1) / 2, y0 = pontoonSurfaceAt(d, t0), y1 = pontoonSurfaceAt(d, t1);
    out.push({ i, t0, t1, x: d.a[0] + d.ux * tm, z: d.a[1] + d.uz * tm, y0, y1, floating: y0 === d.deckH && y1 === d.deckH });
  }
  return out;
}
// bay i shows once the build front has reached it; it is drivable one bay later (drivableLength)
export function bayVisible(d, i) { return d.built * d.nBays > i; }
// how high bay i still hangs over its place: laid dropH high, settled after dropSecs; nothing drops while removing
export function bayDrop(d, i, cfg = PONTOON_CFG) {
  if (d.dir < 0) return 0;
  const since = (d.built * d.nBays - i) * cfg.buildSecs / d.nBays;
  return since < 0 ? cfg.dropH : cfg.dropH * Math.max(0, 1 - since / cfg.dropSecs);
}
// obstacles for #101: one box per laid floating bay, OBB-style (hw along the deck, hd across; c, s = deck direction), y0..y1 absolute
export function pontoonHulls(d, cfg = PONTOON_CFG) {
  const out = [], laid = drivableLength(d, cfg);
  for (const f of bayFrames(d, cfg)) if (f.floating && f.t1 <= laid + 1e-9) out.push({ x: f.x, z: f.z, hw: 0.9, hd: 4.0, c: d.ux, s: d.uz, y0: d.deckH - 1.5, y1: d.deckH - 0.4 });
  return out;
}

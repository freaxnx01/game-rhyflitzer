// #491: the U.S.S. Enterprise NCC-1701-D in ring-2 room 0 -- pure numbers, no three.js, no DOM: the descriptor loadModel reads,
// where the ship hangs in its room, its hover bob, the lettering decals and the room's holodeck-and-stars look.
// index.html builds the meshes. Unit-tested with `node --test tests/enterprise.test.mjs`.
//
// The model (assets/models/enterprise_d.glb, tools/prepare-enterprise.mjs) is in metres: bow on +x, +y up, +z starboard,
// y = 0 at the lowest hull point (the engineering hull's underside), x = z = 0 the centre of its footprint. Measured 2026-10-29:
// 642.5 x 476.7 x 143.1 m, the saucer underside 81 .. 102 m over the lowest point, its top 123 .. 135 m forward of the bridge.
export const ENTERPRISE = {
  key: 'enterprise', h: 143.1, length: 642.5, beam: 476.7, scale: 1, anchor: [0, 0, 0],
  hover: 25,                                   // the lowest hull point over the floor: the bus and the walker pass, the hull still fills the view
  yaw: Math.PI / 6,                            // bow towards the portal, turned 30 degrees to the right: the three-quarter view on approach
  bob: { amp: 1.5, period: 14 },               // a slow hover, metres and seconds
  glow: { saucer: 1.6, drive: 1.6, aux: 1.8, nacelles: 2.6 },   // emissiveIntensity per section (the materials' extras.glow): windows, deflector, warp grilles + bussards
  // canvas text draped on the saucer (ship frame: x along the ship, the text runs across it, w metres wide, h metres tall); top only --
  // underneath, the decals ran into the windows and bumps of the hull
  lettering: [
    { side: 'top', text: 'U.S.S. ENTERPRISE', x: 235, w: 180, h: 14 }, { side: 'top', text: 'NCC-1701-D', x: 205, w: 150, h: 20 },
  ],
  // #607: how a decal is draped on the hull -- the plane's segments (along the text, across it), the metres it keeps clear of it,
  // and the spacing of the 3 x 3 ray cluster each vertex casts: the lowest hit (top side: the highest) wins, so the plane
  // clears bumps that bulge out between its vertices
  drape: { seg: [96, 12], offset: 1.5, spread: 1 },
  // #607: the model's own saucer texture ships with a red "NCC-1701-D / U.S.S. ENTERPRISE" baked in, which would double the
  // white canvas lettering -- the column (inclusive px bounds at `size`, measured 2026-11-01: x 825-838, y 236-352, +3 px
  // margin) is painted over with the hull colour round it at load (paintOutBakedLettering); the .glb itself stays as shipped
  bakedLettering: [{ size: 1024, x0: 822, y0: 233, x1: 841, y1: 355 }],
  url: './assets/models/enterprise_d.glb', loadWithin: 400,
};

// the ship's footprint centre on the room centre, `hover` m up; th = the bow's heading: back out towards the portal, turned `yaw` towards +v
export function enterprisePlacement(room, cfg = ENTERPRISE) {
  const [cx, cz] = room.centre, { f, v } = room.frame, c = Math.cos(cfg.yaw), s = Math.sin(cfg.yaw);
  const bow = [-f[0] * c + v[0] * s, -f[1] * c + v[1] * s];
  return { x: cx, z: cz, y: room.y + cfg.hover, th: Math.atan2(bow[1], bow[0]) };
}
// In memory of Sir Patrick Stewart (1940-2026), Captain Jean-Luc Picard: a plaque just inside the room's portal, right of the lane, its
// front to the way in. a / b portal-relative metres (a into the room, b to the right driving in), w x h the panel, its lower edge `lift`
// over the floor, `depth` its thickness
export const DEDICATION = { a: 45, b: 14, w: 8, h: 4.5, lift: 1.2, depth: 0.4 };
export function dedicationPlacement(room, cfg = DEDICATION) {
  const [px, pz] = room.portal.c, { f, v } = room.frame;
  const x = px + f[0] * cfg.a + v[0] * cfg.b, z = pz + f[1] * cfg.a + v[1] * cfg.b;
  const colliders = [{ x, z, hw: cfg.depth / 2 + 0.2, hd: cfg.w / 2, c: f[0], s: f[1], h: room.y + cfg.lift + cfg.h }];
  return { x, z, y: room.y, face: Math.atan2(-f[1], -f[0]), colliders };
}
export const enterpriseHover = (t, cfg = ENTERPRISE) => cfg.bob.amp * Math.sin(2 * Math.PI * t / cfg.bob.period);
// a PlaneGeometry (in xy, facing +z, text up = +y) turned so the letters' up points to the bow (+x) and the face away from the hull
export const letteringFrame = (side) => (side === 'top' ? { rx: -Math.PI / 2, ry: -Math.PI / 2 } : { rx: Math.PI / 2, ry: Math.PI / 2 });
// #607: the mean RGB of the `ring`-px frame of texels round `rect` (inclusive px bounds, minus the rect itself, clamped to the
// image) -- the hull colour just outside a patch, which the patch is filled with. Pure: works on any RGBA byte array.
export function ringMean(px, w, h, rect, ring) {
  let n = 0, r = 0, g = 0, b = 0;
  for (let y = Math.max(0, rect.y0 - ring); y <= Math.min(h - 1, rect.y1 + ring); y++)
    for (let x = Math.max(0, rect.x0 - ring); x <= Math.min(w - 1, rect.x1 + ring); x++) {
      if (x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1) continue;   // inside the rect, not the ring
      const i = (y * w + x) * 4; r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
    }
  return n ? [r / n, g / n, b / n] : [0, 0, 0];
}

// the room's look (blendLook's keys, as ROOM_LOOK): near-black sky behind the star dome, fog so thin it takes 0.6 % at 1000 m,
// the sun as a strong key light from the upper front-left of the car, a cool low hemisphere fill
export const SPACE_LOOK = { fog: '#04050a', density: 0.00008, skyTop: '#04050a', skyHor: '#04050a', hemiSky: '#8fa3c8', hemiGround: '#141a26', hemi: 0.45, sun: 2.2 };
// the holodeck floor: one 256 px tile per 10 m cell, a light-blue line on two edges, a dim half-line through the middle; a brighter rim along the walls
export const HOLODECK = { cell: 10, tile: 256, line: '#5fd0ff', sub: '#1f4a66', ground: '#05070d', rim: '#8fe0ff', rimW: 1 };

const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
// the dome's texture, in texture coordinates (u round the horizon, v = 0 at the zenith, 0.5 the horizon, 1 the nadir): about 2200 stars above
// the floor, a few big ones, three nebula clouds and a faint milky band. Deterministic per seed.
export function starField(seed = 1701) {
  const r = rng(seed), stars = [];
  for (let i = 0; i < 2200; i++) { const big = r() < 0.015; stars.push({ u: r(), v: r() * 0.68, r: big ? 2.5 + r() * 0.5 : 0.5 + r() * 1.3, b: 0.35 + r() * 0.65, tint: r() < 0.7 ? 'white' : r() < 0.5 ? 'blue' : 'amber' }); }
  const clouds = [{ u: 0.22, v: 0.28, r: 0.17, colour: '#6a3fb0', alpha: 0.32 }, { u: 0.31, v: 0.2, r: 0.12, colour: '#2a8f9c', alpha: 0.28 }, { u: 0.7, v: 0.33, r: 0.2, colour: '#b03f8a', alpha: 0.22 }];
  return { stars, clouds, band: { v: 0.3, alpha: 0.08, width: 0.12 } };
}
// #607: the hull height under a point, fast -- `tris` holds the saucer's triangles in the ship frame (9 floats each); columnIndex buckets
// them by their xz bounds in `cell`-metre squares once, columnExtent then tests only the triangles of the point's cell and returns the
// lowest and highest hull crossing of the vertical through (x, z), or null when nothing lies beneath. Same answer as a vertical ray
// from above (hi) or below (lo), without testing every triangle per ray.
export function columnIndex(tris, cell = 4) {
  const cells = new Map();
  for (let t = 0; t < tris.length; t += 9) {
    const xs = [tris[t], tris[t + 3], tris[t + 6]], zs = [tris[t + 2], tris[t + 5], tris[t + 8]];
    const i0 = Math.floor(Math.min(...xs) / cell), i1 = Math.floor(Math.max(...xs) / cell), j0 = Math.floor(Math.min(...zs) / cell), j1 = Math.floor(Math.max(...zs) / cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = i + ',' + j; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(t); }
  }
  return { tris, cell, cells };
}
export function columnExtent(idx, x, z) {
  const list = idx.cells.get(Math.floor(x / idx.cell) + ',' + Math.floor(z / idx.cell)); if (!list) return null;
  const T = idx.tris; let lo = Infinity, hi = -Infinity;
  for (const t of list) {
    const ax = T[t], ay = T[t + 1], az = T[t + 2], bx = T[t + 3], by = T[t + 4], bz = T[t + 5], cx = T[t + 6], cy = T[t + 7], cz = T[t + 8];
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(d) < 1e-12) continue;   // edge-on seen from above
    const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, w = 1 - u - v;
    if (u < -1e-9 || v < -1e-9 || w < -1e-9) continue;
    const y = u * ay + v * by + w * cy; if (y < lo) lo = y; if (y > hi) hi = y;
  }
  return lo === Infinity ? null : { lo, hi };
}

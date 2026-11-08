// #734: unit crown geometries, pure (no three.js). Every crown is a non-indexed, flat-shaded triangle soup as plain typed
// arrays -- base at y = 0, top at y = 1, widest radius 1 -- that index.html wraps in a BufferGeometry (position, normal,
// color). The vertex colour is a brightness (shaded underside, sunlit top, a little per-face grain); the per-tree tint from
// treeColour multiplies it through instanceColor.
import { SPECIES, SPECIES_SHAPE } from './trees.js';

export const CROWN_BUDGET = { fine: 80, coarse: 20 };   // triangles per crown and LOD tier (a trunk adds 12 fine / 8 coarse)
// the spruce: [radius, baseY, height] per tier, open cones stacked with overlap; coarse is today's single open cone
export const SPRUCE_TIERS = { fine: { tiers: [[1, 0, 0.50], [0.78, 0.28, 0.46], [0.52, 0.56, 0.44]], segments: 7 }, coarse: { tiers: [[1, 0, 1]], segments: 6 } };

const PHI = (1 + Math.sqrt(5)) / 2;
const ICO_V = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]];
const ICO_F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];

const norm = ([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
const mid = (a, b) => norm([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);

// a hash of a direction (quantised to 1e-4, so float noise never moves a lump) and a seed, in [0, 1)
export function dirHash([x, y, z], seed) {
  let h = Math.imul(Math.round(x * 1e4) | 0, 0x27d4eb2d) ^ Math.imul(Math.round(y * 1e4) | 0, 0x165667b1) ^ Math.imul(Math.round(z * 1e4) | 0, 0x9e3779b1) ^ Math.imul((seed | 0) + 1, 0x85ebca6b);
  h = Math.imul(h ^ h >>> 15, 0x85ebca6b); h = Math.imul(h ^ h >>> 13, 0xc2b2ae35);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}

function icosphere(detail) {
  let faces = ICO_F.map(f => f.map(i => norm(ICO_V[i])));
  for (let d = 0; d < detail; d++) faces = faces.flatMap(([a, b, c]) => { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); return [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]]; });
  return faces;
}

const brightness = y => 0.74 + 0.26 * y;

// faces [[x, y, z] x 3] (already in the unit frame) -> the arrays; the normal is the face normal from the winding
function pack(faces) {
  const n = faces.length, position = new Float32Array(n * 9), normal = new Float32Array(n * 9), color = new Float32Array(n * 9);
  faces.forEach(([a, b, c], f) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const fn = norm([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
    const grain = (dirHash(fn, f) - 0.5) * 0.08;
    [a, b, c].forEach((p, k) => { const o = f * 9 + k * 3; position.set(p, o); normal.set(fn, o); const br = brightness(p[1]) + grain; color.set([br, br, br], o); });
  });
  return { position, normal, color, tris: n };
}

// fit faces into the unit frame: y 0..1, widest radius 1
function unit(faces) {
  let y0 = Infinity, y1 = -Infinity, r = 0;
  for (const f of faces) for (const [x, y, z] of f) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); r = Math.max(r, Math.hypot(x, z)); }
  return faces.map(f => f.map(([x, y, z]) => [x / r, (y - y0) / (y1 - y0), z / r]));
}

// an icosphere (detail 0: 20 faces, 1: 80) with every vertex pushed radially by 1 + bump * (hash - 0.5) * 2, squashed to the unit frame
export function lumpyBall(detail, bump, seed) {
  const faces = icosphere(detail).map(f => f.map(d => { const r = 1 + bump * (dirHash(d, seed) - 0.5) * 2; return [d[0] * r, d[1] * r, d[2] * r]; }));
  return pack(unit(faces));
}

// stacked open cones; winding [apex, next, this] gives outward normals (checked by the tests)
export function tieredCone(tiers, segments) {
  const faces = [];
  for (const [r, y0, h] of tiers) {
    const apex = [0, y0 + h, 0];
    for (let i = 0; i < segments; i++) {
      const a0 = i / segments * Math.PI * 2, a1 = (i + 1) / segments * Math.PI * 2;
      faces.push([apex, [r * Math.cos(a1), y0, r * Math.sin(a1)], [r * Math.cos(a0), y0, r * Math.sin(a0)]]);
    }
  }
  return pack(unit(faces));
}

export function crownFor(species, tier) {
  const S = SPECIES_SHAPE[species]; if (!S) throw new Error(`Unknown tree species '${species}'`);
  if (!CROWN_BUDGET[tier]) throw new Error(`Unknown LOD tier '${tier}'`);
  if (S.crown === 'cone') { const t = SPRUCE_TIERS[tier]; return tieredCone(t.tiers, t.segments); }
  return lumpyBall(tier === 'fine' ? 1 : 0, S.bump, SPECIES.indexOf(species));
}

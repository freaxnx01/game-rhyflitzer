// #359: tree species. Pure: which of the species a tree is (a hash of its position, so a tree always looks the same),
// how each species is proportioned relative to its height h, and its crown colour. index.html turns this into geometry.
export const SPECIES = ['spruce', 'deciduous', 'birch', 'poplar', 'fruit'];   // #734: fruit = Hochstamm-Obstbaum (the Fricktal's Chriesibaum)
export const KINDS = ['single', 'edge', 'fill'];   // a scattered single tree, a tree on a forest edge, a tree inside a forest

export const SPECIES_WEIGHTS = {
  single: { spruce: 0.18, deciduous: 0.40, birch: 0.10, poplar: 0.12, fruit: 0.20 },
  edge:   { spruce: 0.32, deciduous: 0.36, birch: 0.22, poplar: 0.06, fruit: 0.04 },
  fill:   { spruce: 0.52, deciduous: 0.36, birch: 0.07, poplar: 0.05, fruit: 0 },
};

// crown/trunk as before, now scaled by h * heightFactor (a fruit tree is a small tree; the collider keeps h).
// bump: the crown's radial lumpiness (treegeo.js), 0 for the cone. colour: 2-3 HSL varieties, the first is the old colour;
// treeColour picks one by u3 and adds the per-tree jitter.
export const SPECIES_SHAPE = {
  spruce:    { crown: 'cone', crownY: 0.22, crownW: 0.33, crownH: 0.80, trunkH: 0.28, trunkW: 0.90, bump: 0,    heightFactor: 1,    colour: [[0.33, 0.45, 0.19], [0.41, 0.30, 0.22]] },
  deciduous: { crown: 'ball', crownY: 0.30, crownW: 0.46, crownH: 0.72, trunkH: 0.38, trunkW: 0.85, bump: 0.18, heightFactor: 1,    colour: [[0.27, 0.45, 0.30], [0.23, 0.40, 0.28], [0.21, 0.52, 0.37]] },
  birch:     { crown: 'ball', crownY: 0.50, crownW: 0.27, crownH: 0.52, trunkH: 0.62, trunkW: 0.42, bump: 0.24, heightFactor: 1,    colour: [[0.21, 0.50, 0.40], [0.19, 0.46, 0.44]], trunk: 'birch' },
  poplar:    { crown: 'ball', crownY: 0.14, crownW: 0.19, crownH: 0.90, trunkH: 0.26, trunkW: 0.70, bump: 0.10, heightFactor: 1,    colour: [[0.29, 0.42, 0.27], [0.26, 0.40, 0.30]] },
  fruit:     { crown: 'ball', crownY: 0.26, crownW: 0.60, crownH: 0.56, trunkH: 0.34, trunkW: 1.15, bump: 0.22, heightFactor: 0.62, colour: [[0.25, 0.46, 0.33], [0.22, 0.42, 0.30]] },
};

// the billboard style: a width factor on the one tree texture and a vertex tint, deciduous being today's billboard
const BILL = {
  spruce:    { w: 0.72, tint: [0.72, 0.86, 0.78] },
  deciduous: { w: 1,    tint: [1, 1, 1] },
  birch:     { w: 0.66, tint: [1, 1, 0.82] },
  poplar:    { w: 0.48, tint: [0.88, 1, 0.86] },
  fruit:     { w: 0.78, tint: [1, 0.96, 0.86] },
};

// a 2-D integer hash of the position at 0.1 m, so float noise never flips a species
export function treeHash(x, z) {
  let h = Math.imul(Math.round(x * 10) | 0, 0x27d4eb2d) ^ Math.imul(Math.round(z * 10) | 0, 0x165667b1);
  h = Math.imul(h ^ h >>> 15, 0x85ebca6b); h = Math.imul(h ^ h >>> 13, 0xc2b2ae35);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}

export function treeSpecies(x, z, kind) {
  const w = SPECIES_WEIGHTS[kind];
  if (!w) throw new Error(`Unknown tree kind '${kind}'`);
  let u = treeHash(x, z);
  for (const s of SPECIES) { u -= w[s]; if (u < 0) return s; }
  return SPECIES[SPECIES.length - 1];
}

export function treeParts(species, h) {
  const S = SPECIES_SHAPE[species], e = h * S.heightFactor;
  return { crown: { kind: S.crown, y: S.crownY * e, sx: S.crownW * e, sy: S.crownH * e }, trunk: { kind: S.trunk || 'bark', sx: S.trunkW * e, sy: S.trunkH * e } };
}

// u1, u2, u3 in [0, 1): u3 picks the variety and nudges the saturation +-0.06; hue +-0.04 and lightness +0..0.12 as before
export function treeColour(species, u1, u2, u3 = 0) {
  const pal = SPECIES_SHAPE[species].colour, i = Math.min(pal.length - 1, Math.floor(u3 * pal.length)), f = u3 * pal.length - i;
  const [h, s, l] = pal[i];
  return [h + (u1 - 0.5) * 0.08, Math.min(1, Math.max(0, s + (f - 0.5) * 0.12)), l + u2 * 0.12];
}

// #734: a forest tile draws its fine crowns within fineIn m of the camera and its coarse ones beyond coarseOut; in between it keeps its tier
export const LOD = { fineIn: 700, coarseOut: 800 };
export function lodTier(dist, tier) { if (dist < LOD.fineIn) return 'fine'; if (dist > LOD.coarseOut) return 'coarse'; return tier; }

export function billShape(species) { return BILL[species]; }

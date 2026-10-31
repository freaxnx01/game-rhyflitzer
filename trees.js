// #359: tree species. Pure: which of the four species a tree is (a hash of its position, so a tree always looks the same),
// how each species is proportioned relative to its height h, and its crown colour. index.html turns this into geometry.
export const SPECIES = ['spruce', 'deciduous', 'birch', 'poplar'];
export const KINDS = ['single', 'edge', 'fill'];   // a scattered single tree, a tree on a forest edge, a tree inside a forest

export const SPECIES_WEIGHTS = {
  single: { spruce: 0.22, deciduous: 0.46, birch: 0.12, poplar: 0.20 },
  edge:   { spruce: 0.34, deciduous: 0.38, birch: 0.22, poplar: 0.06 },
  fill:   { spruce: 0.52, deciduous: 0.36, birch: 0.07, poplar: 0.05 },
};

// crown: the unit crown geometry (radius 1, height 1, base at y = 0) scaled by (crownW, crownH) * h and lifted crownY * h;
// trunk: the unit trunk (height 1, base at y = 0) scaled by (trunkW, trunkH) * h -- trunkW 1 is today's radius 0.12..0.16 h.
// colour: the crown's base HSL; treeColour adds the per-tree jitter.
export const SPECIES_SHAPE = {
  spruce:    { crown: 'cone', crownY: 0.22, crownW: 0.33, crownH: 0.80, trunkH: 0.28, trunkW: 0.90, colour: [0.33, 0.45, 0.19] },
  deciduous: { crown: 'ball', crownY: 0.30, crownW: 0.46, crownH: 0.72, trunkH: 0.38, trunkW: 0.85, colour: [0.27, 0.45, 0.30] },
  birch:     { crown: 'ball', crownY: 0.50, crownW: 0.27, crownH: 0.52, trunkH: 0.62, trunkW: 0.42, colour: [0.21, 0.50, 0.40], trunk: 'birch' },
  poplar:    { crown: 'ball', crownY: 0.14, crownW: 0.19, crownH: 0.90, trunkH: 0.26, trunkW: 0.70, colour: [0.29, 0.42, 0.27] },
};

// the billboard style: a width factor on the one tree texture and a vertex tint, deciduous being today's billboard
const BILL = {
  spruce:    { w: 0.72, tint: [0.72, 0.86, 0.78] },
  deciduous: { w: 1,    tint: [1, 1, 1] },
  birch:     { w: 0.66, tint: [1, 1, 0.82] },
  poplar:    { w: 0.48, tint: [0.88, 1, 0.86] },
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
  const S = SPECIES_SHAPE[species];
  return { crown: { kind: S.crown, y: S.crownY * h, sx: S.crownW * h, sy: S.crownH * h }, trunk: { kind: S.trunk || 'bark', sx: S.trunkW * h, sy: S.trunkH * h } };
}

// u1, u2 in [0, 1): hue +-0.04 and lightness +0..0.12, as the old per-tree jitter
export function treeColour(species, u1, u2) {
  const [h, s, l] = SPECIES_SHAPE[species].colour;
  return [h + (u1 - 0.5) * 0.08, s, l + u2 * 0.12];
}

export function billShape(species) { return BILL[species]; }

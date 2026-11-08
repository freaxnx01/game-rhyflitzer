# Nicer trees (#734, trees half): implementation plan

**Goal:** in the Smooth style every tree is a lumpy, individually coloured crown of one of five Fricktal species (the new one
is the Hochstamm fruit tree), the crowns sway in the wind, and the richer geometry is drawn only in the tiles near the camera
so phones keep their frame rate. Colliders, placement and the Original style's billboards do not change.

**Spec:** [docs/superpowers/specs/2026-11-07-nicer-trees-design.md](../specs/2026-11-07-nicer-trees-design.md)

**Global constraints:**
- Buildless, no new dependency, no CC0 models (the design is procedural; nothing to add to `CREDITS.md`). three.js stays
  r170 (`index.html:692` importmap).
- `trees.js` and the new `treegeo.js` stay pure (no `three` import): `node --test tests/` covers them.
- Tests: `node --test tests/` and Playwright **only** `tests/test_trees.py` (new), `tests/test_tree_collision.py`,
  `tests/test_smoke.py -k "forest or trees"` and `tests/test_region.py::test_ehrendingen_has_its_osm_woods`, in the
  foreground with a generous timeout (the headless renderer draws about 1 fps: wait on `window.__mm.pause().frame`, never on a
  fixed sleep). Not the whole Playwright suite.
- Do not touch `data/world_hochrhein.json`, `world.js` (`FOREST_BUDGET`, colliders) or `pipeline/`.
- Commit and push after each task.
- CHANGELOG under `[Unreleased]`, timestamp `TZ=Europe/Zurich date '+%F %H:%M'`, written for the player (Task 4).

### Task 1: the fifth species, palettes and the LOD tier in trees.js

**Files:** `trees.js`, `tests/trees.test.mjs`

- [ ] **Update the tests first** in `tests/trees.test.mjs` (the spec changes `SPECIES` and the shape of `colour`):
  - "four species, three kinds, …": `assert.deepEqual(SPECIES, ['spruce', 'deciduous', 'birch', 'poplar', 'fruit'])`; add
    `assert.equal(SPECIES_WEIGHTS.fill.fruit, 0, 'no fruit trees inside a wood')`.
  - "all four species occur for every kind": skip `fruit` for `fill`: `for (const s of SPECIES) if (!(k === 'fill' && s === 'fruit')) assert.ok(c[s] > 0, …)`.
  - "treeParts scales …": `const top = p.crown.y + p.crown.sy, e = h * SPECIES_SHAPE[s].heightFactor;` and compare `top` with
    `e` instead of `h`; add `assert.ok(treeParts('fruit', 10).crown.y + treeParts('fruit', 10).crown.sy < 6.5, 'a fruit tree is a small tree');`
    and `assert.ok(treeParts('fruit', 10).trunk.sx > treeParts('deciduous', 10).trunk.sx, 'thick fruit trunk');`.
  - "treeColour gives the species hue …": keep as it is (`u3` defaults to 0 = today's colour) and append:

```js
test('treeColour: u3 picks a variety of the species palette and nudges the saturation', () => {
  for (const s of SPECIES) {
    const pal = SPECIES_SHAPE[s].colour; assert.ok(pal.length >= 2 && pal.length <= 3, `${s}: ${pal.length} varieties`);
    for (let k = 0; k < pal.length; k++) {
      const u3 = (k + 0.5) / pal.length, [h, sat, l] = treeColour(s, 0.5, 0, u3);
      assert.ok(Math.abs(h - pal[k][0]) < 1e-9 && Math.abs(l - pal[k][2]) < 1e-9, `${s} variety ${k}`);
      assert.ok(Math.abs(sat - pal[k][1]) <= 0.06 + 1e-9 && sat >= 0 && sat <= 1);
    }
    assert.deepEqual(treeColour(s, 0.5, 0, 0).slice(0, 1), [pal[0][0]], 'u3 = 0 is the first variety');
    assert.ok(treeColour(s, 0.5, 0, 0.999)[0] === pal[pal.length - 1][0], 'u3 near 1 is the last variety');
  }
  assert.deepEqual(SPECIES_SHAPE.deciduous.colour[0], [0.27, 0.45, 0.30], 'the first variety is today\'s colour');
});

test('lodTier: fine inside 700 m, coarse beyond 800 m, unchanged in between', () => {
  assert.deepEqual(LOD, { fineIn: 700, coarseOut: 800 });
  assert.equal(lodTier(0, 'coarse'), 'fine'); assert.equal(lodTier(699, 'coarse'), 'fine');
  assert.equal(lodTier(801, 'fine'), 'coarse'); assert.equal(lodTier(3000, 'fine'), 'coarse');
  assert.equal(lodTier(750, 'fine'), 'fine'); assert.equal(lodTier(750, 'coarse'), 'coarse');
});

test('every species has a bump and a heightFactor, the cone has no bump', () => {
  for (const s of SPECIES) { const S = SPECIES_SHAPE[s]; assert.ok(S.bump >= 0 && S.bump <= 0.3, s); assert.ok(S.heightFactor > 0.5 && S.heightFactor <= 1, s); }
  assert.equal(SPECIES_SHAPE.spruce.bump, 0); assert.equal(SPECIES_SHAPE.fruit.heightFactor, 0.62);
  assert.ok(billShape('fruit').w > 0.3);
});
```

  and import `LOD, lodTier` from `../trees.js`.
- [ ] `node --test tests/trees.test.mjs`: the new and changed tests fail.
- [ ] **Implement** in `trees.js`:

```js
export const SPECIES = ['spruce', 'deciduous', 'birch', 'poplar', 'fruit'];   // #734: fruit = Hochstamm-Obstbaum (the Fricktal's Chriesibaum)
export const KINDS = ['single', 'edge', 'fill'];

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

const BILL = {
  spruce:    { w: 0.72, tint: [0.72, 0.86, 0.78] },
  deciduous: { w: 1,    tint: [1, 1, 1] },
  birch:     { w: 0.66, tint: [1, 1, 0.82] },
  poplar:    { w: 0.48, tint: [0.88, 1, 0.86] },
  fruit:     { w: 0.78, tint: [1, 0.96, 0.86] },
};
```

  `treeParts`:

```js
export function treeParts(species, h) {
  const S = SPECIES_SHAPE[species], e = h * S.heightFactor;
  return { crown: { kind: S.crown, y: S.crownY * e, sx: S.crownW * e, sy: S.crownH * e }, trunk: { kind: S.trunk || 'bark', sx: S.trunkW * e, sy: S.trunkH * e } };
}
```

  `treeColour` and the LOD helpers:

```js
// u1, u2, u3 in [0, 1): u3 picks the variety and nudges the saturation +-0.06; hue +-0.04 and lightness +0..0.12 as before
export function treeColour(species, u1, u2, u3 = 0) {
  const pal = SPECIES_SHAPE[species].colour, i = Math.min(pal.length - 1, Math.floor(u3 * pal.length)), f = u3 * pal.length - i;
  const [h, s, l] = pal[i];
  return [h + (u1 - 0.5) * 0.08, Math.min(1, Math.max(0, s + (f - 0.5) * 0.12)), l + u2 * 0.12];
}

// #734: a forest tile draws its fine crowns within fineIn m of the camera and its coarse ones beyond coarseOut; in between it keeps its tier
export const LOD = { fineIn: 700, coarseOut: 800 };
export function lodTier(dist, tier) { if (dist < LOD.fineIn) return 'fine'; if (dist > LOD.coarseOut) return 'coarse'; return tier; }
```

- [ ] `node --test tests/`: all green (`tests/world.test.mjs` does not import `trees.js`; if any other test asserts four
  species, update it to the spec). Commit `feat(trees): fruit trees, colour varieties and the LOD tier (#734)`, push.

### Task 2: the pure crown geometry module treegeo.js

**Files:** `treegeo.js` (new), `tests/treegeo.test.mjs` (new)

- [ ] **Write the failing tests** `tests/treegeo.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirHash, lumpyBall, tieredCone, crownFor, CROWN_BUDGET, SPRUCE_TIERS } from '../treegeo.js';
import { SPECIES } from '../trees.js';

const TIERS = ['fine', 'coarse'];
const vec = (a, i) => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]];
const faces = (c) => Array.from({ length: c.tris }, (_, f) => [0, 1, 2].map(k => vec(c.position, f * 3 + k)));
const minMax = (c, axis) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < c.position.length / 3; i++) { const v = c.position[i * 3 + axis]; lo = Math.min(lo, v); hi = Math.max(hi, v); } return [lo, hi]; };
const maxRadius = (c) => { let r = 0; for (let i = 0; i < c.position.length / 3; i++) r = Math.max(r, Math.hypot(c.position[i * 3], c.position[i * 3 + 2])); return r; };

test('dirHash is deterministic, in [0, 1), and differs by seed and direction', () => {
  assert.equal(dirHash([0, 1, 0], 1), dirHash([0, 1, 0], 1));
  assert.equal(dirHash([0.3, 0.4, 0.5], 2), dirHash([0.3 + 1e-7, 0.4, 0.5], 2), 'float noise never changes a lump');
  assert.notEqual(dirHash([0, 1, 0], 1), dirHash([0, 1, 0], 2));
  assert.notEqual(dirHash([0, 1, 0], 1), dirHash([1, 0, 0], 1));
  for (let i = 0; i < 50; i++) { const u = dirHash([Math.sin(i), Math.cos(i * 1.3), Math.sin(i * 0.7)], i); assert.ok(u >= 0 && u < 1); }
});

test('a crown is non-indexed flat-shaded arrays: 9 floats per triangle, unit face normals', () => {
  for (const c of [lumpyBall(0, 0, 0), lumpyBall(1, 0.2, 3), tieredCone(SPRUCE_TIERS.fine.tiers, 7)]) {
    assert.equal(c.position.length, c.tris * 9); assert.equal(c.normal.length, c.tris * 9); assert.equal(c.color.length, c.tris * 9);
    for (let f = 0; f < c.tris; f++) {
      const n = vec(c.normal, f * 3); assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-5, `face ${f} normal length`);
      for (let k = 1; k < 3; k++) assert.deepEqual(vec(c.normal, f * 3 + k), n, 'one normal per face');
    }
  }
});

test('lumpyBall: 20 or 80 triangles, base 0, top 1, widest radius 1, deterministic', () => {
  assert.equal(lumpyBall(0, 0, 0).tris, 20); assert.equal(lumpyBall(1, 0, 0).tris, 80);
  for (const c of [lumpyBall(0, 0, 0), lumpyBall(1, 0.24, 2), lumpyBall(1, 0.1, 3)]) {
    const [y0, y1] = minMax(c, 1); assert.ok(Math.abs(y0) < 1e-6 && Math.abs(y1 - 1) < 1e-6, `y ${y0}..${y1}`);
    assert.ok(Math.abs(maxRadius(c) - 1) < 1e-6);
  }
  assert.deepEqual(lumpyBall(1, 0.18, 1).position, lumpyBall(1, 0.18, 1).position);
  assert.notDeepEqual(lumpyBall(1, 0.18, 1).position, lumpyBall(1, 0.18, 2).position, 'another seed lumps elsewhere');
});

test('lumpyBall: the bump moves the vertices off the sphere, no bump is the squashed icosphere', () => {
  const smooth = lumpyBall(1, 0, 0), lumpy = lumpyBall(1, 0.2, 0);
  const radii = (c) => Array.from({ length: c.position.length / 3 }, (_, i) => { const [x, y, z] = vec(c.position, i); return Math.hypot(x, (y - 0.5) * 2, z); });
  const spread = (rs) => Math.max(...rs) - Math.min(...rs);
  assert.ok(spread(radii(smooth)) < 1e-5, 'no bump: every vertex on the unit sphere (after unsquashing y)');
  assert.ok(spread(radii(lumpy)) > 0.2, 'bump 0.2: radii spread over at least 0.2');
});

test('normals face outward: nearly every face normal points away from the crown axis', () => {
  for (const s of SPECIES) for (const t of TIERS) {
    const c = crownFor(s, t); let out = 0;
    for (let f = 0; f < c.tris; f++) {
      const [a, b, d] = [0, 1, 2].map(k => vec(c.position, f * 3 + k)), n = vec(c.normal, f * 3);
      const dot = n[0] * (a[0] + b[0] + d[0]) / 3 + n[2] * (a[2] + b[2] + d[2]) / 3;   // radial only: a tall cone's lower faces point up more than out
      assert.ok(dot > -1e-6, `${s}/${t} face ${f} points inward`); if (dot > 0.01) out++;
    }
    assert.ok(out >= c.tris * 0.9, `${s}/${t}: ${out}/${c.tris} clearly outward`);
  }
});

test('tieredCone: tiers x segments triangles, apex of the last tier at 1, base radius 1', () => {
  const fine = tieredCone(SPRUCE_TIERS.fine.tiers, 7), coarse = tieredCone(SPRUCE_TIERS.coarse.tiers, 6);
  assert.equal(fine.tris, 21); assert.equal(coarse.tris, 6);
  for (const c of [fine, coarse]) { const [y0, y1] = minMax(c, 1); assert.ok(Math.abs(y0) < 1e-6 && Math.abs(y1 - 1) < 1e-6); assert.ok(Math.abs(maxRadius(c) - 1) < 1e-6); }
  assert.ok(SPRUCE_TIERS.fine.tiers.length === 3 && SPRUCE_TIERS.fine.tiers[1][1] < SPRUCE_TIERS.fine.tiers[0][1] + SPRUCE_TIERS.fine.tiers[0][2], 'tiers overlap');
});

test('vertex colours: brighter at the top than at the bottom, within 0.6..1.1', () => {
  for (const s of SPECIES) for (const t of TIERS) {
    const c = crownFor(s, t); let lo = [Infinity, 0], hi = [-Infinity, 0];
    for (let i = 0; i < c.position.length / 3; i++) { const y = c.position[i * 3 + 1], br = c.color[i * 3]; assert.ok(br > 0.6 && br < 1.1, `${s}/${t} ${br}`); assert.equal(c.color[i * 3 + 1], br); if (y < lo[0]) lo = [y, br]; if (y > hi[0]) hi = [y, br]; }
    assert.ok(hi[1] > lo[1] + 0.15, `${s}/${t}: top ${hi[1]} vs bottom ${lo[1]}`);
  }
});

test('crownFor: every species and tier within the budget, the cone for the spruce, lumpy balls otherwise', () => {
  assert.deepEqual(CROWN_BUDGET, { fine: 80, coarse: 20 });
  for (const s of SPECIES) for (const t of TIERS) {
    const c = crownFor(s, t); assert.ok(c.tris <= CROWN_BUDGET[t], `${s}/${t}: ${c.tris}`);
    assert.equal(c.tris, s === 'spruce' ? (t === 'fine' ? 21 : 6) : (t === 'fine' ? 80 : 20));
  }
  assert.notDeepEqual(crownFor('deciduous', 'fine').position, crownFor('birch', 'fine').position, 'each species lumps its own way');
  assert.throws(() => crownFor('hedge', 'fine'), /species/); assert.throws(() => crownFor('birch', 'medium'), /tier/);
});
```

- [ ] `node --test tests/treegeo.test.mjs`: fails (module missing).
- [ ] **Implement** `treegeo.js`:

```js
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
```

  (This module and these tests were run once in node while planning, 2026-11-07: all green as written. If the outward test
  ever fails for the cone, the winding in `faces.push` is the thing to swap, not the test.)
- [ ] `node --test tests/`: all green. Commit `feat(trees): pure crown geometry module (#734)`, push.

### Task 3: lumpy crowns, per-tile LOD and wind in index.html

**Files:** `index.html`, `tests/test_trees.py` (new)

- [ ] **Write the failing Playwright tests** `tests/test_trees.py`:

```python
"""#734: the nicer trees -- the per-tile LOD budget, the wind clock and the fruit trees. Smoke-level: the headless renderer
draws about 1 fps, so every wait is on window.__mm.pause().frame, never a fixed sleep."""
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[1] / "data" / "world_hochrhein.json"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")

# the centre of the fullest 512 m forest tile: the car is placed there, so the camera stands inside a wood
FULLEST_TILE_JS = """() => { const n = {}; for (const [x, z] of window.__FOREST) { const k = Math.floor(x / 512) + ',' + Math.floor(z / 512); n[k] = (n[k] || 0) + 1; }
  const [k] = Object.entries(n).sort((a, b) => b[1] - a[1])[0], [i, j] = k.split(',').map(Number); return [(i + 0.5) * 512, (j + 0.5) * 512]; }"""


def open_world(p, server):
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 480, "height": 270})
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && window.__mm.counts.forest && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    assert page.evaluate("() => window.__mm.layout") == "osm"
    return b, page


def frames(page, n):
    """Let the loop draw n more frames."""
    f0 = page.evaluate("() => window.__mm.pause().frame")
    page.wait_for_function(f"() => window.__mm.pause().frame >= {f0 + n}", timeout=120000)


@needs_world
def test_forest_lod_stays_within_the_budget(server):
    """At most 9 tiles (about 7000 trees) draw the fine crowns, wherever the car is; the Original style draws no solid tree."""
    with sync_playwright() as p:
        b, page = open_world(p, server)
        try:
            total = page.evaluate("() => window.__mm.counts.forest.trees")
            page.evaluate("() => window.__mm.setStyle('smooth')"); frames(page, 3)
            at_start = page.evaluate("() => window.__mm.treeLod()")
            cx, cz = page.evaluate(FULLEST_TILE_JS)
            page.evaluate(f"() => window.__mm.place({cx}, {cz}, 0)"); frames(page, 4)
            in_wood = page.evaluate("() => window.__mm.treeLod()")
            page.evaluate("() => window.__mm.setStyle('original')"); frames(page, 2)
            original = page.evaluate("() => window.__mm.treeLod()")
        finally:
            b.close()
    for r in (at_start, in_wood):
        assert r["fineTrees"] + r["coarseTrees"] == total, r
        assert r["fineTiles"] <= 9 and r["fineTrees"] <= 7000, r
        assert r["visibleSolid"] == r["fineTiles"] + r["coarseTiles"], r   # every tile shows exactly one tier
    assert in_wood["fineTiles"] >= 1 and in_wood["fineTrees"] > 0, in_wood
    assert original["visibleSolid"] == 0 and original["fineTiles"] == in_wood["fineTiles"], original   # the tier is kept, only hidden


@needs_world
def test_wind_clock_runs_and_pauses(server):
    """The crown shader is patched with the wind, its clock runs while playing and stands still in the pause."""
    with sync_playwright() as p:
        b, page = open_world(p, server)
        try:
            page.evaluate("() => window.__mm.setStyle('smooth')"); frames(page, 2)
            w0 = page.evaluate("() => window.__mm.treeWind()"); frames(page, 3)
            w1 = page.evaluate("() => window.__mm.treeWind()")
            page.keyboard.press("Escape")
            page.wait_for_function("() => window.__mm.pause().on", timeout=30000); frames(page, 1)
            p0 = page.evaluate("() => window.__mm.treeWind()"); frames(page, 3)
            p1 = page.evaluate("() => window.__mm.treeWind()")
        finally:
            b.close()
    assert w1["patched"] is True and w1["amp"] > 0, w1
    assert w1["time"] > w0["time"], (w0, w1)
    assert p1["time"] == p0["time"], (p0, p1)


@needs_world
def test_fruit_trees_stand_alone_not_in_the_woods(server):
    with sync_playwright() as p:
        b, page = open_world(p, server)
        try:
            n = page.evaluate("() => window.__mm.treeSpecies()")
        finally:
            b.close()
    assert n["single"].get("fruit", 0) > 0, n
    assert n["forest"].get("fruit", 0) < n["forest"]["spruce"] / 4, n   # only the 4 % on the edges, never in the fill
```

  Before relying on `window.__mm.place(x, z, th)` (`index.html:4435`) and `window.__mm.pause()` (`:5127`), read them; the
  camera follows the car in `stepCamera`, so a few frames after `place` the LOD sees the new position.
- [ ] Run `python -m pytest tests/test_trees.py` in the foreground: fails (`treeLod`, `treeWind` missing).
- [ ] **Implement** in `index.html`:
  - Imports (`:696`): `import { SPECIES, treeSpecies, treeParts, treeColour, billShape, treeHash, lodTier } from './trees.js';`
    and a new line `import { crownFor } from './treegeo.js';`.
  - Replace `treeGeometries` (`:2552-2564`); the trunks stay as they are:

```js
// #734: crowns come from treegeo.js (pure, lumpy, flat-shaded, vertex-coloured), one per species and LOD tier: 'single' = the
// fine tier (80-triangle balls, 3-tier spruce), 'forest' = the coarse tier (today's 20-triangle ball and 6-triangle cone).
// Trunks: 6-segment closed (fine) or 4-segment open (coarse) cylinders; the birch trunk is white with dark marks on a few faces.
function crownGeometry(species, tier) {
  const c = crownFor(species, tier), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(c.position, 3)); g.setAttribute('normal', new THREE.BufferAttribute(c.normal, 3)); g.setAttribute('color', new THREE.BufferAttribute(c.color, 3));
  return g;
}
function treeGeometries(detail) {
  const fine = detail === 'single', tier = fine ? 'fine' : 'coarse', unit = g => { g.translate(0, 0.5, 0); return g; };
  const birch = (fine ? new THREE.CylinderGeometry(0.12, 0.16, 1, 6, 1, true) : new THREE.CylinderGeometry(0.12, 0.16, 1, 4, 1, true)).toNonIndexed();
  { const n = birch.attributes.position.count, rgb = new Float32Array(n * 3); for (let v = 0; v < n; v++) { const mark = Math.floor(v / 3) % 3 === 1 ? 0.22 : 0.9; rgb[v * 3] = mark; rgb[v * 3 + 1] = mark; rgb[v * 3 + 2] = mark * 0.97; } birch.setAttribute('color', new THREE.BufferAttribute(rgb, 3)); }
  return {
    crowns: Object.fromEntries(SPECIES.map(s => [s, crownGeometry(s, tier)])),
    trunks: { bark: unit(fine ? new THREE.CylinderGeometry(0.12, 0.16, 1, 6) : new THREE.CylinderGeometry(0.12, 0.16, 1, 4, 1, true)), birch: unit(birch) },
  };
}
```

  - `TREE_MAT.crown` (`:2566`) gets `vertexColors: true`, and right after it the wind:

```js
// #734: the wind. The crown's vertex shader bends the unit crown by its height (the base stands, the top moves uWind crown
// radii) with a phase from the tree's position, so neighbours are out of step. uTime is advanced by the loop while playing.
const TREE_WIND = { time: { value: 0 }, amp: { value: 0.035 }, patched: false };
TREE_MAT.crown.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = TREE_WIND.time; shader.uniforms.uWind = TREE_WIND.amp;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
    .replace('#include <begin_vertex>', ['#include <begin_vertex>',
      '#ifdef USE_INSTANCING', 'float treePhase = instanceMatrix[3].x * 0.17 + instanceMatrix[3].z * 0.23;', '#else', 'float treePhase = 0.0;', '#endif',
      'float treeK = position.y * position.y;',
      'transformed.x += uWind * treeK * sin(uTime * 1.3 + treePhase);',
      'transformed.z += uWind * treeK * 0.6 * sin(uTime * 0.9 + treePhase * 1.7);'].join('\n'));
  TREE_WIND.patched = true;
};
TREE_MAT.crown.customProgramCacheKey = () => 'tree-wind';
```

    (`instanceMatrix` is declared by three r170's program prefix under `USE_INSTANCING`, before the shader body, so it is in
    scope after `begin_vertex`. The shadow-depth material is not patched on purpose: see the spec.)
  - `speciesMeshes` (`:2569-2585`): `crown = new THREE.InstancedMesh(G.crowns[s], TREE_MAT.crown, idx.length)` (the crown is
    per species now; `kinds` is still needed for the trunk) and
    `c.setHSL(...treeColour(s, u1, u2, treeHash(z, x)))` (a second, independent hash of the position as `u3`: no change to
    any rng sequence, so nothing else in the world moves).
  - Forest tiles (`:2590-2606`): build the coarse set as today and keep what the fine set needs; the fine set is built on
    first use so the load and the GPU memory do not double for tiles the player never comes near:

```js
const FOREST_MESHES = [];
{ const tiles = new Map(); for (const t of window.__FOREST) { t[3] = lidGround(t[0], t[1]); const k = tileKey(t[0], t[1], FOREST_BUDGET.tile); if (!tiles.has(k)) tiles.set(k, []); tiles.get(k).push(t); }
  const fbill = …as today…;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), frnd = rng(31);
  for (const list of tiles.values()) {
    const bill = …as today, including the jitter.push([frnd(), frnd()]) loop…;
    bill.computeBoundingSphere(); scene.add(bill);
    const coarse = speciesMeshes(list, TREE_GEO.forest, jitter, false); scene.add(...coarse);
    let cx = 0, cz = 0; for (const t of list) { cx += t[0]; cz += t[1]; } cx /= list.length; cz /= list.length;
    FOREST_MESHES.push({ coarse, fine: null, bill, cx, cz, tier: 'coarse', list, jitter });   // #734: fine is built when the tile first comes within LOD.fineIn
  }
  if (window.__mm.counts.forest) window.__mm.counts.forest.tiles = tiles.size;
}
// #734: the fine tier of one tile, built once, added hidden (stepTreeLod shows it)
function fineTile(f) { const fine = speciesMeshes(f.list, TREE_GEO.single, f.jitter, false); for (const im of fine) im.visible = false; scene.add(...fine); return fine; }
const TREES_ON = { solid: false };
// #734: per frame, each tile shows the tier for its distance to the camera (lodTier's hysteresis keeps a tile from flickering)
function stepTreeLod() {
  if (!TREES_ON.solid) return;
  for (const f of FOREST_MESHES) {
    const tier = lodTier(Math.hypot(f.cx - camera.position.x, f.cz - camera.position.z), f.tier); if (tier === f.tier) continue;
    f.tier = tier; if (tier === 'fine' && !f.fine) f.fine = fineTile(f);
    for (const im of f.coarse) im.visible = tier === 'coarse'; for (const im of f.fine) im.visible = tier === 'fine';
  }
}
window.__mm.treeLod = () => { const r = { fineTiles: 0, coarseTiles: 0, fineTrees: 0, coarseTrees: 0, visibleSolid: 0 }; for (const f of FOREST_MESHES) { r[f.tier + 'Tiles']++; r[f.tier + 'Trees'] += f.list.length; if (f.coarse[0].visible || (f.fine && f.fine[0].visible)) r.visibleSolid++; } return r; };
window.__mm.treeWind = () => ({ time: TREE_WIND.time.value, amp: TREE_WIND.amp.value, patched: TREE_WIND.patched });
```

  - `window.__mm.treeSpecies` (`:2607`): iterate `f.coarse` instead of `f.solid` (the fine set holds the same species counts).
  - `treesVisible` (`:3015`):

```js
function treesVisible(on) { on = on && LEVELS.isSurface(); const St = STYLES[styleKey], bill = on && St.trees === 'bill', solid = on && St.trees === 'cone'; TREES_ON.solid = solid; treeBill.visible = bill; for (const im of TREE_SOLID) im.visible = solid; for (const f of FOREST_MESHES) { f.bill.visible = bill; for (const im of f.coarse) im.visible = solid && f.tier === 'coarse'; if (f.fine) for (const im of f.fine) im.visible = solid && f.tier === 'fine'; } }
```

  - `window.__mm.cave` (`:4554`): `treesVisible: … || FOREST_MESHES.some(f => f.bill.visible || f.coarse.some(im => im.visible) || (f.fine && f.fine.some(im => im.visible)))`.
  - `loop` (`:5614`), in the unpaused branch right after `stepCamera(dt);`: `TREE_WIND.time.value += dt; stepTreeLod();`.
    The paused branch (`:5613`) is untouched, so the wind stands still in the pause.
  - Search `index.html` for every other `f.solid` / `.solid` on a forest mesh (`grep -n "\.solid" index.html`) and move it to
    `coarse`/`fine`; `disposeGroup`'s comment (`:3256`) only mentions the shared tree meshes, no code.
- [ ] Run in the foreground: `python -m pytest tests/test_trees.py tests/test_tree_collision.py tests/test_smoke.py -k "forest or trees or lod or wind or fruit"`
  and `python -m pytest tests/test_region.py::test_ehrendingen_has_its_osm_woods`: all pass. `node --test tests/`: all pass.
  Also open the page once in Playwright with `page.on("pageerror")` and `console` captured (the `load()` helper in
  `tests/test_smoke.py::test_forest_loaded` does this): a shader compile error from the wind patch shows up there as a
  `THREE.WebGLProgram` console error, and `test_forest_loaded` asserts `msgs == []`.
- [ ] Commit `feat(trees): lumpy crowns, per-tile LOD and wind sway (#734)`, push.

### Task 4: the hideout rooms and the CHANGELOG

**Files:** `index.html`, `CHANGELOG.md`

- [ ] `roomTrees` (`:3414-3417`) already uses `TREE_GEO.single` (the fine tier) and its own `rng(278)` jitter: nothing to
  change in code. Verify once with Playwright that the hideout still loads without a console error:
  `python -m pytest tests/test_hideout.py -k "cave_mode_toggles_and_restores"` (it reads `treesVisible` through
  `window.__mm.cave()`, `tests/test_hideout.py:487`). If it is red, the cause is in `treesVisible`/`__mm.cave` of Task 3, not
  in the room.
- [ ] CHANGELOG under `[Unreleased]` → `### Changed` (timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`):
  ``- `<timestamp>` The **trees** in the Smooth style have a new look: lumpy broadleaf crowns in several greens, spruces with tiers, slim birches, poplars and the **Hochstamm fruit trees** of the Fricktal, every tree a little different, and the crowns **sway in the wind**. Woods far away stay as light to draw as before, so phones keep their frame rate.``
- [ ] Commit `docs(changelog): nicer trees (#734)`, push.

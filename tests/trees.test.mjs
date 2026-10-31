import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES, KINDS, SPECIES_WEIGHTS, SPECIES_SHAPE, treeHash, treeSpecies, treeParts, treeColour, billShape } from '../trees.js';
import { rng } from '../world.js';

const samples = (kind, n, seed = 7) => { const r = rng(seed), out = {}; for (const s of SPECIES) out[s] = 0; for (let i = 0; i < n; i++) out[treeSpecies(-3000 + r() * 6000, -3000 + r() * 6000, kind)]++; return out; };

test('four species, three kinds, weights sum to one per kind', () => {
  assert.deepEqual(SPECIES, ['spruce', 'deciduous', 'birch', 'poplar']);
  assert.deepEqual(KINDS, ['single', 'edge', 'fill']);
  for (const k of KINDS) {
    const sum = SPECIES.reduce((a, s) => a + SPECIES_WEIGHTS[k][s], 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${k}: ${sum}`);
  }
});

test('treeHash is in [0, 1), deterministic and differs between nearby trees', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) { const u = treeHash(100 + i * 1.7, -50 + i * 0.9); assert.ok(u >= 0 && u < 1); seen.add(u); }
  assert.ok(seen.size > 190);
  assert.equal(treeHash(12.34, -56.78), treeHash(12.34, -56.78));
  assert.equal(treeHash(12.34, -56.78), treeHash(12.34 + 1e-9, -56.78), 'float noise must not change the species');
});

test('treeSpecies is deterministic per position and always one of the four', () => {
  for (const k of KINDS) for (let i = 0; i < 50; i++) {
    const x = i * 37.3 - 900, z = i * -13.1 + 200, s = treeSpecies(x, z, k);
    assert.ok(SPECIES.includes(s), s);
    assert.equal(treeSpecies(x, z, k), s);
  }
  assert.throws(() => treeSpecies(0, 0, 'hedge'), /kind/);
});

test('all four species occur for every kind', () => {
  for (const k of KINDS) { const c = samples(k, 2000); for (const s of SPECIES) assert.ok(c[s] > 0, `${k}: no ${s}`); }
});

test('the distribution matches the weights over many samples', () => {
  for (const k of KINDS) {
    const n = 40000, c = samples(k, n, 11);
    for (const s of SPECIES) assert.ok(Math.abs(c[s] / n - SPECIES_WEIGHTS[k][s]) < 0.015, `${k}/${s}: ${c[s] / n} vs ${SPECIES_WEIGHTS[k][s]}`);
  }
});

test('kind-dependent mix: forests are mostly spruce and deciduous, birch likes edges, poplars stand alone', () => {
  const fill = samples('fill', 20000, 3), edge = samples('edge', 20000, 3), single = samples('single', 20000, 3);
  assert.ok(fill.spruce + fill.deciduous > 0.8 * 20000);
  assert.ok(fill.spruce > fill.deciduous);
  assert.ok(edge.birch > fill.birch * 1.5);
  assert.ok(single.poplar > fill.poplar * 2);
  assert.ok(single.deciduous > single.spruce);
});

test('treeParts scales the species shape with the height: top near h, parts above ground', () => {
  for (const s of SPECIES) for (const h of [6, 9, 14]) {
    const p = treeParts(s, h);
    const top = p.crown.y + p.crown.sy;
    assert.ok(top > h * 0.95 && top < h * 1.1, `${s} top ${top} for h ${h}`);
    assert.ok(p.crown.y >= 0 && p.crown.sx > 0 && p.trunk.sy > 0 && p.trunk.sx > 0);
    assert.ok(p.trunk.sy >= p.crown.y, `${s}: the trunk must reach into the crown`);
    assert.equal(p.crown.kind, SPECIES_SHAPE[s].crown);
  }
  const spruce = treeParts('spruce', 10), beech = treeParts('deciduous', 10), birch = treeParts('birch', 10), poplar = treeParts('poplar', 10);
  assert.ok(spruce.crown.sx < 4.2, 'spruce is narrower than the old 0.42 h cone');
  assert.ok(beech.crown.sx > spruce.crown.sx && beech.crown.sx > beech.crown.sy / 2, 'round, slightly squashed crown');
  assert.ok(beech.trunk.sy < birch.trunk.sy, 'short deciduous trunk, tall birch trunk');
  assert.ok(birch.crown.sx < beech.crown.sx && birch.trunk.sx < beech.trunk.sx, 'small crown, slim trunk');
  assert.ok(poplar.crown.sy > 3 * poplar.crown.sx, 'tall narrow column');
});

test('treeColour gives the species hue with a slight per-tree jitter', () => {
  for (const s of SPECIES) {
    const [h0, s0, l0] = treeColour(s, 0.5, 0), [h1, , l1] = treeColour(s, 1, 1), [h2] = treeColour(s, 0, 0);
    assert.ok(h0 > 0.15 && h0 < 0.4 && s0 > 0 && s0 <= 1 && l0 > 0 && l0 < 1, `${s}: ${[h0, s0, l0]}`);
    assert.ok(Math.abs(h1 - h0) <= 0.045 && Math.abs(h2 - h0) <= 0.045);
    assert.ok(l1 > l0 && l1 - l0 <= 0.15);
  }
  assert.ok(treeColour('deciduous', 0.5, 0)[2] > treeColour('spruce', 0.5, 0)[2], 'deciduous lighter than spruce');
  assert.ok(treeColour('birch', 0.5, 0)[2] > treeColour('deciduous', 0.5, 0)[2], 'birch lightest');
});

test('billShape: per-species width and tint for the billboard style', () => {
  for (const s of SPECIES) { const b = billShape(s); assert.ok(b.w > 0.3 && b.w <= 1); assert.equal(b.tint.length, 3); for (const c of b.tint) assert.ok(c > 0 && c <= 1); }
  assert.deepEqual(billShape('deciduous'), { w: 1, tint: [1, 1, 1] }, 'the deciduous billboard is today\'s');
  assert.ok(billShape('poplar').w < billShape('spruce').w && billShape('spruce').w < billShape('deciduous').w);
});

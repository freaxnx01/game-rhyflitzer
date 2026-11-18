import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES, KINDS, SPECIES_WEIGHTS, SPECIES_SHAPE, LOD, lodTier, treeHash, treeSpecies, treeParts, treeColour, billShape, seasonFor } from '../trees.js';
import { rng } from '../world.js';

const samples = (kind, n, seed = 7) => { const r = rng(seed), out = {}; for (const s of SPECIES) out[s] = 0; for (let i = 0; i < n; i++) out[treeSpecies(-3000 + r() * 6000, -3000 + r() * 6000, kind)]++; return out; };

test('five species, three kinds, weights sum to one per kind', () => {
  assert.deepEqual(SPECIES, ['spruce', 'deciduous', 'birch', 'poplar', 'fruit']);
  assert.deepEqual(KINDS, ['single', 'edge', 'fill']);
  for (const k of KINDS) {
    const sum = SPECIES.reduce((a, s) => a + SPECIES_WEIGHTS[k][s], 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${k}: ${sum}`);
  }
  assert.equal(SPECIES_WEIGHTS.fill.fruit, 0, 'no fruit trees inside a wood');
});

test('treeHash is in [0, 1), deterministic and differs between nearby trees', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) { const u = treeHash(100 + i * 1.7, -50 + i * 0.9); assert.ok(u >= 0 && u < 1); seen.add(u); }
  assert.ok(seen.size > 190);
  assert.equal(treeHash(12.34, -56.78), treeHash(12.34, -56.78));
  assert.equal(treeHash(12.34, -56.78), treeHash(12.34 + 1e-9, -56.78), 'float noise must not change the species');
});

test('treeSpecies is deterministic per position and always one of the five', () => {
  for (const k of KINDS) for (let i = 0; i < 50; i++) {
    const x = i * 37.3 - 900, z = i * -13.1 + 200, s = treeSpecies(x, z, k);
    assert.ok(SPECIES.includes(s), s);
    assert.equal(treeSpecies(x, z, k), s);
  }
  assert.throws(() => treeSpecies(0, 0, 'hedge'), /kind/);
});

test('all species occur for every kind (fruit never inside a wood)', () => {
  for (const k of KINDS) { const c = samples(k, 2000); for (const s of SPECIES) if (!(k === 'fill' && s === 'fruit')) assert.ok(c[s] > 0, `${k}: no ${s}`); }
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

test('treeParts scales the species shape with the height: top near the scaled height, parts above ground', () => {
  for (const s of SPECIES) for (const h of [6, 9, 14]) {
    const p = treeParts(s, h);
    const top = p.crown.y + p.crown.sy, e = h * SPECIES_SHAPE[s].heightFactor;
    assert.ok(top > e * 0.8 && top < e * 1.1, `${s} top ${top} for h ${h}`);
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
  assert.ok(treeParts('fruit', 10).crown.y + treeParts('fruit', 10).crown.sy < 6.5, 'a fruit tree is a small tree');
  assert.ok(treeParts('fruit', 10).trunk.sx > treeParts('deciduous', 10 * SPECIES_SHAPE.fruit.heightFactor).trunk.sx, 'thick fruit trunk');
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

test('billShape: per-species width and tint for the billboard style', () => {
  for (const s of SPECIES) { const b = billShape(s); assert.ok(b.w > 0.3 && b.w <= 1); assert.equal(b.tint.length, 3); for (const c of b.tint) assert.ok(c > 0 && c <= 1); }
  assert.deepEqual(billShape('deciduous'), { w: 1, tint: [1, 1, 1] }, 'the deciduous billboard is today\'s');
  assert.ok(billShape('poplar').w < billShape('spruce').w && billShape('spruce').w < billShape('deciduous').w);
});

// #1062: autumn colours from September to November, by date; the green season stays bit-identical
const AUTUMN_SPECIES = ['deciduous', 'birch', 'poplar', 'fruit'];
const hsl2rgb = (h, s, l) => { const f = (n) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; };

test('seasonFor: September to November are autumn, every other month is green (local time)', () => {
  for (let m = 0; m < 12; m++) {
    const season = seasonFor(new Date(2026, m, 15, 12));
    assert.equal(season, m >= 8 && m <= 10 ? 'autumn' : 'green', `month ${m + 1}`);
  }
  assert.equal(seasonFor(new Date(2026, 8, 1, 0, 0, 1)), 'autumn', 'the first second of September');
  assert.equal(seasonFor(new Date(2026, 11, 1, 0, 0, 0)), 'green', 'the first second of December');
  assert.equal(seasonFor(new Date(2026, 10, 30, 23, 59)), 'autumn', 'the last minute of November');
});

test('treeColour in the green season (and without a season) is exactly what it was', () => {
  for (const s of SPECIES) for (const [u1, u2, u3] of [[0, 0, 0], [0.5, 0.5, 0.5], [0.99, 0.01, 0.999], [0.13, 0.77, 0.42]]) {
    const pal = SPECIES_SHAPE[s].colour, i = Math.min(pal.length - 1, Math.floor(u3 * pal.length)), f = u3 * pal.length - i;
    const before = [pal[i][0] + (u1 - 0.5) * 0.08, Math.min(1, Math.max(0, pal[i][1] + (f - 0.5) * 0.12)), pal[i][2] + u2 * 0.12];
    assert.deepEqual(treeColour(s, u1, u2, u3), before, `${s} ${[u1, u2, u3]}`);
    assert.deepEqual(treeColour(s, u1, u2, u3, 'green'), before, `${s} green ${[u1, u2, u3]}`);
  }
});

test('the deciduous species have an autumn palette, the spruce has none', () => {
  for (const s of AUTUMN_SPECIES) assert.ok(Array.isArray(SPECIES_SHAPE[s].autumn) && SPECIES_SHAPE[s].autumn.length >= 2, s);
  assert.equal(SPECIES_SHAPE.spruce.autumn, undefined);
  for (const s of AUTUMN_SPECIES) for (const [h, sat, l] of SPECIES_SHAPE[s].autumn) {
    assert.ok(h >= 0 && h < 0.26, `${s}: hue ${h} is yellow, orange, red or yellow-green`);
    assert.ok(sat >= 0.4 && sat <= 0.7, `${s}: saturation ${sat}`);
    assert.ok(l >= 0.27 && l <= 0.46, `${s}: lightness ${l} stays in today's range`);
  }
});

test('treeColour in autumn: a mix of yellow, orange and red per species, the spruce unchanged', () => {
  const hues = (s) => { const out = []; for (let i = 0; i < 200; i++) out.push(treeColour(s, 0.5, 0, i / 200, 'autumn')[0]); return out; };
  for (const s of AUTUMN_SPECIES) {
    const hs = hues(s);
    assert.ok(hs.every(h => h >= 0 && h < 0.26), `${s}: all autumn hues`);
    assert.ok(new Set(hs).size >= 2, `${s}: more than one variety`);
    assert.ok(hs.some(h => h >= 0.11 && h <= 0.17), `${s}: some yellow`);
  }
  const share = (s, lo, hi) => hues(s).filter(h => h >= lo && h < hi).length / 200;
  assert.ok(share('birch', 0.11, 0.18) >= 0.6, 'birch: mostly bright yellow');
  assert.ok(share('poplar', 0.11, 0.18) >= 0.6, 'poplar: yellow');
  assert.ok(share('fruit', 0, 0.11) >= 0.3, 'fruit: a share of orange and red');
  assert.ok(share('deciduous', 0, 0.11) > 0 && share('deciduous', 0.11, 0.18) > 0 && share('deciduous', 0.18, 0.3) > 0, 'deciduous: the widest mix, some still green');
  assert.ok(share('deciduous', 0, 0.11) < 0.6, 'deciduous: not a uniform orange blob');
  for (const [u1, u2, u3] of [[0, 0, 0], [0.5, 0.5, 0.5], [0.9, 0.1, 0.999]]) assert.deepEqual(treeColour('spruce', u1, u2, u3, 'autumn'), treeColour('spruce', u1, u2, u3));
});

test('billShape in autumn: tinted yellow, orange and red per tree, the spruce and the green season unchanged', () => {
  for (const s of SPECIES) { assert.deepEqual(billShape(s, 'green', 0.3), billShape(s)); assert.deepEqual(billShape(s, undefined, 0.7), billShape(s)); }
  for (const u of [0, 0.3, 0.6, 0.999]) assert.deepEqual(billShape('spruce', 'autumn', u), billShape('spruce'));
  for (const s of AUTUMN_SPECIES) {
    const tints = new Set(); let warm = 0;
    for (let i = 0; i < 50; i++) {
      const b = billShape(s, 'autumn', i / 50);
      assert.equal(b.w, billShape(s).w, `${s}: the width is the species'`);
      assert.equal(b.tint.length, 3); tints.add(b.tint.join());
      assert.ok(b.tint[0] >= b.tint[1] && b.tint[1] >= b.tint[2], `${s}: the tint never cools the green texture (${b.tint})`);
      if (b.tint[0] > b.tint[1]) warm++;
    }
    assert.ok(tints.size >= 2, `${s}: more than one autumn tint`);
    assert.ok(warm >= 35, `${s}: most tints turn the green texture warm`);
  }
});

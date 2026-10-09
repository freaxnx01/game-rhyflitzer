// #108: the surprise hunt's pure rules. node --test, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nearestOnPolyline } from '../world.js';
import { HUNT, SURPRISES, PRESENT_ROAD_CLASSES, presentCandidates, deckFootprints, pickPresentSpots, seededRng, nextSurprise, tickSurprises, gravityScale, nearestPresent, canCollect, isNewHuntBest, confettiBurst, stepConfetti } from '../presents.js';

// a 2 km street grid every 100 m, each street split into 50 m segments
const grid = () => { const roads = [], line = (f) => Array.from({ length: 41 }, (_, k) => f(-1000 + k * 50)); for (let i = -10; i <= 10; i++) { roads.push({ cls: 'residential', pts: line(t => [i * 100, t]) }); roads.push({ cls: 'residential', pts: line(t => [t, i * 100]) }); } return roads; };

test('presentCandidates: segment midpoints of drivable, non-bridge, ground-level roads', () => {
  const roads = [
    { cls: 'residential', pts: [[0, 0], [10, 0], [10, 20]] },
    { cls: 'motorway', pts: [[0, 0], [100, 0]] },
    { cls: 'footway', pts: [[0, 0], [100, 0]] },
    { cls: 'primary', bridge: true, pts: [[0, 0], [100, 0]] },
    { cls: 'tertiary', layer: 1, pts: [[0, 0], [100, 0]] },
    { n: 'Hauptstrasse', w: 9, pts: [[0, 50], [40, 50]] },   // hand layout: no cls
  ];
  assert.deepEqual(presentCandidates(roads), [[5, 0], [10, 10], [20, 50]]);
});

test('pickPresentSpots: five spots in the ring, spaced, deterministic per seed', () => {
  const cands = presentCandidates(grid()), start = { x: 0, z: 0 };
  const a = pickPresentSpots(cands, start, seededRng(1)), b = pickPresentSpots(cands, start, seededRng(1)), c = pickPresentSpots(cands, start, seededRng(2));
  assert.equal(a.length, HUNT.count);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  for (const p of a) { const d = Math.hypot(p.x, p.z); assert.ok(d >= HUNT.minR && d <= HUNT.maxR, `ring ${d}`); }
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) assert.ok(Math.hypot(a[i].x - a[j].x, a[i].z - a[j].z) >= HUNT.gap);
});

test('pickPresentSpots: relaxes the gap, then the radius, when the ring is sparse', () => {
  const cands = [[200, 0], [260, 0], [320, 0], [380, 0], [1500, 0]];
  const spots = pickPresentSpots(cands, { x: 0, z: 0 }, seededRng(3));
  assert.equal(spots.length, 5);
  assert.ok(spots.some(p => p.x === 1500));
});

test('pickPresentSpots: returns what exists when even the fallback cannot reach five', () => {
  assert.equal(pickPresentSpots([[200, 0]], { x: 0, z: 0 }, seededRng(1)).length, 1);
});

test('seededRng: deterministic, in [0, 1)', () => {
  const r1 = seededRng(42), r2 = seededRng(42);
  for (let i = 0; i < 100; i++) { const v = r1(); assert.equal(v, r2()); assert.ok(v >= 0 && v < 1); }
});

test('nextSurprise: the first four draws are the four kinds, then the bag refills', () => {
  const rng = seededRng(7); let bag = []; const ids = [];
  for (let i = 0; i < 5; i++) { const r = nextSurprise(bag, rng); ids.push(r.surprise.id); bag = r.bag; }
  assert.deepEqual([...ids.slice(0, 4)].sort(), SURPRISES.map(s => s.id).sort());
  assert.ok(SURPRISES.some(s => s.id === ids[4]));
});

test('tickSurprises: counts down to zero, never below; pure', () => {
  const t0 = { turbo: 1, moon: 0.5 };
  assert.deepEqual(tickSurprises(t0, 0.75), { turbo: 0.25, moon: 0 });
  assert.deepEqual(t0, { turbo: 1, moon: 0.5 });
});

test('gravityScale: moon gravity only while its timer runs', () => {
  const moon = SURPRISES.find(s => s.id === 'moon');
  assert.equal(gravityScale({ turbo: 0, moon: 0 }), 1);
  assert.equal(gravityScale({ turbo: 0, moon: 3 }), moon.gravity);
});

test('nearestPresent: nearest not-yet-found box, -1 when all are found', () => {
  const spots = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 50, z: 0 }];
  assert.equal(nearestPresent(spots, [false, false, false], 90, 0), 1);
  assert.equal(nearestPresent(spots, [false, true, false], 90, 0), 2);
  assert.equal(nearestPresent(spots, [true, true, true], 90, 0), -1);
});

test('canCollect: within 7 m and 4 m of height, in a run, never while flying', () => {
  const box = { x: 0, z: 0, y: 10 };
  assert.equal(canCollect(box, { x: 5, z: 0, y: 10 }, 'racing', false), true);
  assert.equal(canCollect(box, { x: 5, z: 0, y: 10 }, 'armed', false), true);
  assert.equal(canCollect(box, { x: 8, z: 0, y: 10 }, 'racing', false), false);
  assert.equal(canCollect(box, { x: 0, z: 0, y: 15 }, 'racing', false), false);   // on a deck above the box
  assert.equal(canCollect(box, { x: 0, z: 0, y: 10 }, 'racing', true), false);    // helicopter
  assert.equal(canCollect(box, { x: 0, z: 0, y: 10 }, 'finished', false), false);
});

test('isNewHuntBest: first finish or faster', () => {
  assert.equal(isNewHuntBest(null, 200), true);
  assert.equal(isNewHuntBest(180, 200), false);
  assert.equal(isNewHuntBest(180, 170), true);
});

test('confetti: a burst flies up and out, then falls and expires', () => {
  const parts = confettiBurst(80, seededRng(5));
  assert.equal(parts.length, 80);
  assert.ok(parts.every(p => p.vy > 0 && p.life > 0));
  let left = parts; for (let i = 0; i < 60; i++) left = stepConfetti(left, 0.05);
  assert.equal(left.length, 0);
  const one = stepConfetti([{ x: 0, y: 0, z: 0, vx: 1, vy: 5, vz: 0, life: 1, c: 0 }], 0.1)[0];
  assert.ok(one.x > 0 && one.y > 0 && one.vy < 5 && one.life < 1);
});

test('SURPRISES: four kinds with the spec values', () => {
  const by = Object.fromEntries(SURPRISES.map(s => [s.id, s]));
  assert.deepEqual(Object.keys(by).sort(), ['hop', 'moon', 'repair', 'turbo']);
  assert.equal(by.turbo.secs, 6); assert.equal(by.moon.secs, 10); assert.equal(by.moon.gravity, 0.35);
  assert.ok(by.hop.vy > 0 && by.hop.vy < 9);   // lands below the 9 m/s damage threshold (stepCar)
});

test('HUNT: the spec table', () => {
  assert.deepEqual(HUNT, { count: 5, minR: 150, maxR: 900, gap: 200, minGap: 50, maxRScale: 3, pickup: 7, pickupDy: 4, celebrate: 1.5 });
});

// ---- the real OSM layout (data/world_hochrhein.json), as served in production ----
const WORLD = JSON.parse(readFileSync(new URL('../../data/world_hochrhein.json', import.meta.url), 'utf8'));
const OSM_START = { x: WORLD.anchors.start[0], z: WORLD.anchors.start[1] };
// every deck a car can drive under: OSM road bridges (the hero decks are up to 4.2 m half-wide) and railway bridges (2.75 m, index.html)
const OSM_DECKS = [...WORLD.roads.filter(r => r.bridge).map(r => ({ pts: r.pts, hw: Math.max(4.2, r.w / 2) })), ...(WORLD.railBridges || []).map(rb => ({ pts: rb.pts, hw: 2.75 }))];
const underADeck = (x, z) => OSM_DECKS.some(d => nearestOnPolyline(d.pts, x, z).d <= d.hw);

test('presentCandidates on the OSM layout: no candidate lies under a road or railway deck', () => {
  assert.ok(presentCandidates(WORLD.roads).some(([x, z]) => underADeck(x, z)), 'the world has candidates under a deck to filter');
  const cands = presentCandidates(WORLD.roads, deckFootprints(WORLD.roads, WORLD.railBridges));
  assert.ok(cands.length > 1000, `${cands.length} candidates`);
  const under = cands.filter(([x, z]) => underADeck(x, z));
  assert.deepEqual(under, []);
});

test('pickPresentSpots on the OSM layout: five reachable spots for every seed, none under a deck', () => {
  const cands = presentCandidates(WORLD.roads, deckFootprints(WORLD.roads, WORLD.railBridges));
  for (let seed = 1; seed <= 300; seed++) {
    const spots = pickPresentSpots(cands, OSM_START, seededRng(seed));
    assert.equal(spots.length, HUNT.count, `seed ${seed}`);
    for (const p of spots) assert.ok(!underADeck(p.x, p.z), `seed ${seed}: spot ${p.x},${p.z} under a deck`);
  }
});

test('presentCandidates on the OSM layout: only whitelisted classes, never a bridge or a non-ground layer', () => {
  const key = ([x, z]) => `${x},${z}`, mids = (r) => r.pts.slice(1).map((q, i) => key([(r.pts[i][0] + q[0]) / 2, (r.pts[i][1] + q[1]) / 2]));
  const allowed = new Set(), excluded = { cls: new Set(), bridge: new Set(), layer: new Set() };
  for (const r of WORLD.roads) {
    const why = r.bridge ? 'bridge' : (r.layer || 0) !== 0 ? 'layer' : !PRESENT_ROAD_CLASSES.has(r.cls) ? 'cls' : null;
    for (const m of mids(r)) (why ? excluded[why] : allowed).add(m);
  }
  // the real world has every kind of road the filter must drop
  for (const why of ['cls', 'bridge', 'layer']) assert.ok(excluded[why].size > 0, `no ${why} roads in the world`);
  assert.ok(WORLD.roads.some(r => r.cls === 'motorway') && WORLD.roads.some(r => r.cls === 'footway') && WORLD.roads.some(r => r.cls === 'service'));
  const cands = presentCandidates(WORLD.roads, deckFootprints(WORLD.roads, WORLD.railBridges)).map(key);
  for (const c of cands) assert.ok(allowed.has(c), `candidate ${c} is not on a whitelisted ground-level road`);
  const onlyExcluded = [...excluded.cls, ...excluded.bridge, ...excluded.layer].filter(m => !allowed.has(m));
  const candSet = new Set(cands);
  assert.deepEqual(onlyExcluded.filter(m => candSet.has(m)), []);
  // the unfiltered whitelist minus the deck footprints: nothing else is dropped
  assert.equal(presentCandidates(WORLD.roads).length, [...WORLD.roads].filter(r => !r.bridge && !(r.layer || 0) && PRESENT_ROAD_CLASSES.has(r.cls)).reduce((s, r) => s + r.pts.length - 1, 0));
});

test('pickPresentSpots on the OSM layout: spots in the ring around the start, spaced, deterministic', () => {
  const cands = presentCandidates(WORLD.roads, deckFootprints(WORLD.roads, WORLD.railBridges));
  for (let seed = 1; seed <= 50; seed++) {
    const a = pickPresentSpots(cands, OSM_START, seededRng(seed));
    assert.deepEqual(a, pickPresentSpots(cands, OSM_START, seededRng(seed)));
    for (const p of a) { const d = Math.hypot(p.x - OSM_START.x, p.z - OSM_START.z); assert.ok(d >= HUNT.minR && d <= HUNT.maxR * HUNT.maxRScale, `seed ${seed}: ring ${d}`); }
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) assert.ok(Math.hypot(a[i].x - a[j].x, a[i].z - a[j].z) >= HUNT.minGap, `seed ${seed}: gap`);
  }
});

test('pickPresentSpots: the radius relaxation reaches exactly maxR x maxRScale, and no further', () => {
  const R = HUNT.maxR * HUNT.maxRScale, ring = (r) => [[r, 0], [0, r], [-r, 0], [0, -r], [r * Math.SQRT1_2, r * Math.SQRT1_2]];
  assert.equal(pickPresentSpots(ring(R - 10), { x: 0, z: 0 }, seededRng(1)).length, HUNT.count, 'spots just inside maxR x maxRScale are found');
  assert.equal(pickPresentSpots(ring(R + 10), { x: 0, z: 0 }, seededRng(1)).length, 0, 'spots beyond maxR x maxRScale are not');
});

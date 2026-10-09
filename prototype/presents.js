// #108: pure rules for the surprise hunt -- no DOM, no three.js. Unit-tested with `node --test prototype/tests/*.test.mjs`.
import { nearestOnPolyline } from './world.js';

export const HUNT = { count: 5, minR: 150, maxR: 900, gap: 200, minGap: 50, maxRScale: 3, pickup: 7, pickupDy: 4, celebrate: 1.5 };

// every kind is good news (spec A3); hop.vy lands below stepCar's 9 m/s damage threshold
export const SURPRISES = [
  { id: 'hop', vy: 8.5 },
  { id: 'turbo', secs: 6 },
  { id: 'moon', secs: 10, gravity: 0.35 },
  { id: 'repair' },
];

export const PRESENT_ROAD_CLASSES = new Set(['residential', 'tertiary', 'secondary', 'primary', 'unclassified', 'living_street']);

// OSM roads carry cls / layer / bridge; hand-traced roads carry none of them and all count.
// decks: the footprints a car can drive under (deckFootprints) -- a box there would sit on the deck, out of reach from the road below.
export function presentCandidates(roads, decks = []) {
  const out = [];
  for (const r of roads) {
    if (r.bridge || (r.layer || 0) !== 0) continue;
    if (r.cls && !PRESENT_ROAD_CLASSES.has(r.cls)) continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const x = (r.pts[i][0] + r.pts[i + 1][0]) / 2, z = (r.pts[i][1] + r.pts[i + 1][1]) / 2;
      if (!underDeck(decks, x, z)) out.push([x, z]);
    }
  }
  return out;
}

// metres kept clear around a deck's edge, so a box is never half under it
export const DECK_CLEARANCE = 2;

// road bridges (the hero decks are up to 4.2 m half-wide) and railway bridges (2.75 m half-wide, as index.html builds them)
export function deckFootprints(roads, railBridges = []) {
  return [...roads.filter(r => r.bridge).map(r => ({ pts: r.pts, hw: Math.max(4.2, r.w / 2) })), ...railBridges.map(rb => ({ pts: rb.pts, hw: 2.75 }))];
}

function underDeck(decks, x, z) {
  return decks.some(d => nearestOnPolyline(d.pts, x, z).d <= d.hw + DECK_CLEARANCE);
}

function shuffled(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function pickOnce(pool, start, minR, maxR, gap, count) {
  const out = [];
  for (const [x, z] of pool) {
    const d = Math.hypot(x - start.x, z - start.z);
    if (d < minR || d > maxR) continue;
    if (out.some(p => Math.hypot(p.x - x, p.z - z) < gap)) continue;
    out.push({ x, z });
    if (out.length === count) break;
  }
  return out;
}

// x1.5 steps from 1, the last one clamped to maxRScale: 1, 1.5, 2.25, 3
function radiusScales(maxRScale) {
  const out = [1];
  while (out[out.length - 1] < maxRScale) out.push(Math.min(out[out.length - 1] * 1.5, maxRScale));
  return out;
}

// shuffle once, then relax: gap halves down to minGap, then the radius grows x1.5 up to maxRScale
export function pickPresentSpots(cands, start, rng, rules = HUNT) {
  const pool = shuffled(cands, rng);
  let best = [];
  for (const scale of radiusScales(rules.maxRScale)) {
    for (let gap = rules.gap; gap >= rules.minGap; gap /= 2) {
      const got = pickOnce(pool, start, rules.minR, rules.maxR * scale, gap, rules.count);
      if (got.length === rules.count) return got;
      if (got.length > best.length) best = got;
    }
  }
  return best;
}

// mulberry32: a small seeded generator, so tests can fix the draw
export function seededRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// a shuffled bag of the four kinds, refilled when empty: the first four boxes are four different surprises
export function nextSurprise(bag, rng) {
  const full = bag.length ? bag : shuffled(SURPRISES.map(s => s.id), rng);
  const [id, ...rest] = full;
  return { surprise: SURPRISES.find(s => s.id === id), bag: rest };
}

export function tickSurprises(timers, dt) {
  return { turbo: Math.max(0, timers.turbo - dt), moon: Math.max(0, timers.moon - dt) };
}

export function gravityScale(timers) {
  return timers.moon > 0 ? SURPRISES.find(s => s.id === 'moon').gravity : 1;
}

export function nearestPresent(spots, found, x, z) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < spots.length; i++) {
    if (found[i]) continue;
    const d = Math.hypot(spots[i].x - x, spots[i].z - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// as checkpoints: in 'armed' or 'racing', not while flying; the height rule keeps a box under a bridge from being taken off the deck
export function canCollect(spot, car, raceState, flying, rules = HUNT) {
  if (flying || (raceState !== 'armed' && raceState !== 'racing')) return false;
  return Math.hypot(spot.x - car.x, spot.z - car.z) < rules.pickup && Math.abs(spot.y - car.y) < rules.pickupDy;
}

export function isNewHuntBest(best, t) {
  return best === null || t < best;
}

// c: index into the four box colours; positions relative to the box
export function confettiBurst(n, rng) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, s = 3 + rng() * 5;
    out.push({ x: 0, y: 2, z: 0, vx: Math.cos(a) * s, vy: 7 + rng() * 6, vz: Math.sin(a) * s, life: 1.5 + rng() * 0.5, c: i % 4 });
  }
  return out;
}

export function stepConfetti(parts, dt) {
  return parts.filter(p => p.life > dt).map(p => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, z: p.z + p.vz * dt, vx: p.vx * 0.98, vy: p.vy - 9 * dt, vz: p.vz * 0.98, life: p.life - dt }));
}

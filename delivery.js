// #107: pure rules for the delivery mode -- no DOM, no three.js, no Math.random. Unit-tested with `node --test tests/*.test.mjs`.

import { placeName } from './route.js';

export const DELIV = {
  orders: 5, refSpeed: 9, grace: 25, minTime: 45,
  minRoute: 400, maxRoute: 3000, wideMin: 250, wideMax: 5000, tries: 200, recent: 3,
  stopRadius: 10, stopSpeed: 1.5, perMeter: 0.1, perSecond: 2, cargoLoss: 40, resetPenalty: 15,
  nameRadius: 40, depotRadius: 120, lowTime: 20,
  abroadWeight: 0.1, maxAbroad: 1, publicShare: 0.4,   // #1035: German-side orders are rare, public buildings are favoured
};

// invented names, no real brands; `near` is a landmark key of the world's anchors (data/world_*.json -> anchors.landmarks)
export const DEPOTS = [
  { name: 'Pizza Fridolin', near: 'muenster' },
  { name: 'Pizza Rheinblick', near: 'stationStein' },
  { name: 'Pizza Sissla', near: 'stationSisseln' },
];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// '6', '36A', '6c' -> itself; ranges ('6a–6d', '14-18') and oddities ('65/1', '19.1') -> null: those have no single door
export function parseHouse(addr) {
  const m = /^(\d+)([a-zA-Z]?)$/.exec(String(addr ?? '').trim());
  return m ? m[1] + m[2] : null;
}

// #1035: the town a point belongs to: nearest village (no Flur) on the same Rhine bank, else the nearest of all
export function nearestPlace(villages, x, z, sameBank = () => true, gemeindenDe = []) {
  const towns = villages.filter(v => !v.flur);
  const nearest = list => list.reduce((best, v) => (!best || Math.hypot(v.x - x, v.z - z) < Math.hypot(best.x - x, best.z - z) ? v : best), null);
  const v = nearest(towns.filter(t => sameBank(x, z, t.x, t.z))) ?? nearest(towns);
  if (!v) return null;
  const place = placeName(v.t);
  return { place, abroad: gemeindenDe.includes(place) };
}

export function addressLabel({ street, no, place }) {
  const line = no ? `${street} ${no}` : street;
  return place ? `${line}, ${place}` : line;
}

// nearestNamedRoad(x, z) -> { n, d } | null (the glue answers from ROAD_GRID); placeOf(x, z) -> { place, abroad } | null.
// A house needs a plain number or a public `use`, a road inside nameRadius (that road point is where the pizza is handed over)
// and a street name -- its own OSM `st`, else the road's.
export function buildAddresses(buildings, nearestNamedRoad, placeOf = () => null) {
  const out = [];
  for (const b of buildings) {
    const no = parseHouse(b.addr) ?? '';
    if ((!no && !b.use) || !b.rect) continue;
    const [x, z] = b.rect;
    const road = nearestNamedRoad(x, z);
    if (!road || road.d > DELIV.nameRadius) continue;
    const street = b.st || road.n;
    if (!street) continue;
    const p = placeOf(x, z), place = p?.place ?? null;
    out.push({ id: b.id, street, no, place, abroad: p?.abroad ?? false, kind: b.use ?? null, label: addressLabel({ street, no, place }), x, z });
  }
  return out;
}

// each depot sits at the addressed building nearest its landmark; a landmark the world does not have drops the depot
export function resolveDepots(depots, landmarks, addresses) {
  const out = [];
  for (const d of depots) {
    const lm = landmarks.find(l => l.n === d.near);
    if (!lm) continue;
    let best = null, bd = DELIV.depotRadius;
    for (const a of addresses) { const dist = Math.hypot(a.x - lm.x, a.z - lm.z); if (dist <= bd) { bd = dist; best = a; } }
    if (best) out.push({ name: d.name, label: best.label, x: best.x, z: best.z, abroad: !!best.abroad });
  }
  return out;
}

// #1035: depots on the Swiss side only, unless the world has no other
export function homeDepots(depots) {
  const home = depots.filter(d => !d.abroad);
  return home.length ? home : depots;
}

export const timeLimit = len => Math.max(DELIV.minTime, Math.round(DELIV.grace + len / DELIV.refSpeed));

export function orderScore({ len, left, cargo }) {
  const base = Math.round(len * DELIV.perMeter), bonus = DELIV.perSecond * Math.floor(Math.max(0, left));
  return { base, bonus, tip: Math.round((base + bonus) * cargo / 100) };
}

export const hitCargo = (cargo, strength) => Math.max(0, cargo - DELIV.cargoLoss * strength);
export const isHandover = (dist, speed) => dist < DELIV.stopRadius && speed < DELIV.stopSpeed;

// routeLen(addr) -> metres | null (unreachable); public buildings first (publicShare), then all; the normal band first, one wider band after that.
// A German-side address is accepted rarely (abroadWeight) and never once abroadLeft is used up.
export function pickOrder({ addresses, rng, routeLen, recent, abroadLeft = Infinity }) {
  const pools = [];
  if (rng() < DELIV.publicShare) pools.push(addresses.filter(a => a.kind));
  pools.push(addresses);
  for (const pool of pools) {
    for (const [lo, hi] of [[DELIV.minRoute, DELIV.maxRoute], [DELIV.wideMin, DELIV.wideMax]]) {
      for (let i = 0; i < DELIV.tries; i++) {
        const addr = pool[Math.floor(rng() * pool.length)];
        if (!addr || recent.includes(addr.id)) continue;
        if (addr.abroad && (abroadLeft <= 0 || rng() >= DELIV.abroadWeight)) continue;
        const len = routeLen(addr);
        if (len != null && len >= lo && len <= hi) return { addr, len };
      }
    }
  }
  return null;
}

export function newShift(best) {
  return { phase: 'running', idx: 0, total: DELIV.orders, score: 0, results: [], order: null, best, recent: [], abroad: 0 };
}

export function beginOrder(st, addr, len) {
  const limit = timeLimit(len);
  st.order = { label: addr.label, x: addr.x, z: addr.z, id: addr.id, place: addr.place, abroad: addr.abroad, kind: addr.kind, len, limit, left: limit, cargo: 100 };
  if (addr.abroad) st.abroad++;
  if (addr.id != null) st.recent = [...st.recent, addr.id].slice(-DELIV.recent);
}

export function finishOrder(st, outcome) {
  const o = st.order;
  const tip = outcome === 'delivered' ? orderScore({ len: o.len, left: o.left, cargo: o.cargo }).tip : 0;
  st.results.push({ label: o.label, outcome, tip, cargo: o.cargo });
  st.score += tip; st.idx++; st.order = null;
  if (st.idx >= st.total) st.phase = 'over';
}

// -> null | 'delivered' | 'late'; dist = metres to the drop point, speed in m/s
export function tick(st, dt, dist, speed) {
  if (st.phase !== 'running' || !st.order) return null;
  st.order.left = Math.max(0, st.order.left - dt);
  const outcome = isHandover(dist, speed) ? 'delivered' : st.order.left <= 0 ? 'late' : null;
  if (outcome) finishOrder(st, outcome);
  return outcome;
}

// strength = impactStrength(closing speed) of impact.js: a tap below CRASH_MIN is 0 and costs nothing
export function applyImpact(st, strength) {
  if (st.phase !== 'running' || !st.order || !(strength > 0)) return null;
  st.order.cargo = hitCargo(st.order.cargo, strength);
  if (st.order.cargo > 0) return null;
  finishOrder(st, 'ruined');
  return 'ruined';
}

export function applyPenalty(st, secs) {
  if (st.phase === 'running' && st.order) st.order.left = Math.max(0, st.order.left - secs);
}

export const isNewBest = (score, best) => score > 0 && score > best;

// #107: pure rules for the delivery mode -- no DOM, no three.js, no Math.random. Unit-tested with `node --test tests/*.test.mjs`.

export const DELIV = {
  orders: 5, refSpeed: 9, grace: 25, minTime: 45,
  minRoute: 400, maxRoute: 3000, wideMin: 250, wideMax: 5000, tries: 200, recent: 3,
  stopRadius: 10, stopSpeed: 1.5, perMeter: 0.1, perSecond: 2, cargoLoss: 40, resetPenalty: 15,
  nameRadius: 40, depotRadius: 120, lowTime: 20,
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

// nearestNamedRoad(x, z) -> { n, d } | null (the glue answers from ROAD_GRID). A house needs a plain number, a road
// inside nameRadius (that road point is where the pizza is handed over) and a street name -- its own OSM `st`, else the road's.
export function buildAddresses(buildings, nearestNamedRoad) {
  const out = [];
  for (const b of buildings) {
    const no = parseHouse(b.addr);
    if (!no || !b.rect) continue;
    const [x, z] = b.rect;
    const road = nearestNamedRoad(x, z);
    if (!road || road.d > DELIV.nameRadius) continue;
    const street = b.st || road.n;
    if (!street) continue;
    out.push({ id: b.id, street, no, label: `${street} ${no}`, x, z });
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
    if (best) out.push({ name: d.name, label: best.label, x: best.x, z: best.z });
  }
  return out;
}

export const timeLimit = len => Math.max(DELIV.minTime, Math.round(DELIV.grace + len / DELIV.refSpeed));

export function orderScore({ len, left, cargo }) {
  const base = Math.round(len * DELIV.perMeter), bonus = DELIV.perSecond * Math.floor(Math.max(0, left));
  return { base, bonus, tip: Math.round((base + bonus) * cargo / 100) };
}

export const hitCargo = (cargo, strength) => Math.max(0, cargo - DELIV.cargoLoss * strength);
export const isHandover = (dist, speed) => dist < DELIV.stopRadius && speed < DELIV.stopSpeed;

// routeLen(addr) -> metres | null (unreachable); the normal band first, one wider band after that
export function pickOrder({ addresses, rng, routeLen, recent }) {
  for (const [lo, hi] of [[DELIV.minRoute, DELIV.maxRoute], [DELIV.wideMin, DELIV.wideMax]]) {
    for (let i = 0; i < DELIV.tries; i++) {
      const addr = addresses[Math.floor(rng() * addresses.length)];
      if (!addr || recent.includes(addr.id)) continue;
      const len = routeLen(addr);
      if (len != null && len >= lo && len <= hi) return { addr, len };
    }
  }
  return null;
}

export function newShift(best) {
  return { phase: 'running', idx: 0, total: DELIV.orders, score: 0, results: [], order: null, best, recent: [] };
}

export function beginOrder(st, addr, len) {
  const limit = timeLimit(len);
  st.order = { label: addr.label, x: addr.x, z: addr.z, id: addr.id, len, limit, left: limit, cargo: 100 };
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

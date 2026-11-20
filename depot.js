// depot.js — #553: the vehicle depot's home slots on the DSM car park. Pure module: no DOM, no three.js.
// index.html keeps the glue: building the parked meshes, the solids and the boarding.
import { VEHICLE_TYPES, galleryOrder } from './carselect.js';
import { parkedBox, carReach } from './foot.js';

// the strip: centre, usable length along +x, depth along z; a slot is the footprint plus the gap beside it
// #807: near/nearMax = how many real models live at once (the rest are boxes boxH high, boxHLong for a long vehicle),
// keep/keepMax = the looser set a built model may stay in, so a step over the edge does not flicker
export const DEPOT = { x: 832.3, z: -107.5, len: 130, depth: 30, gap: 1.2, inset: 0.5, longL: 7, build: 400, show: 300, reachCar: 4, reachSpeed: 2, near: 100, nearMax: 6, keep: 130, keepMax: 8, boxH: 1.5, boxHLong: 3 };

// #1103: how far the trailer's body reaches behind its axles' midpoint
const TRAILER_TAIL = 4.6;

// the footprint from the collision entry (pure data, known before any model loads): 2r square, a capsule 2(hl + r) long.
// #1103: a drawbar trailer adds hitch + length + TRAILER_TAIL behind the origin; then `body` is the truck's own length (the solid and
// the reach stay the truck's) and `off` is how far the origin stands ahead of the footprint's middle
export function footprint(def) {
  const c = def.collision;
  if (!c || (c.shape !== 'circle' && c.shape !== 'capsule')) throw new Error(`footprint: unknown collision shape ${c?.shape}`);
  const w = 2 * c.r, l = c.shape === 'capsule' ? 2 * (c.hl + c.r) : 2 * c.r;
  if (!def.trailer) return { w, l };
  const front = l / 2, rear = Math.max(front, def.trailer.hitch + def.trailer.length + TRAILER_TAIL);
  return { w, l: front + rear, body: l, off: (rear - front) / 2 };
}

// the row order: the types in VEHICLE_TYPES order, each strongest first (galleryOrder); unknown types last, table order
function depotOrder(ids, defs) {
  const out = [], seen = new Set();
  for (const type of VEHICLE_TYPES) for (const id of galleryOrder(ids, defs, type)) { out.push(id); seen.add(id); }
  for (const id of ids) if (!seen.has(id)) out.push(id);
  return out;
}

const placed = (v, cx, cz, th) => ({ id: v.id, x: cx + Math.cos(th) * v.off, z: cz + Math.sin(th) * v.off, th, w: v.w, l: v.body, span: v.l, off: v.off });
// one home slot per id, every vehicle nose to the middle of the strip: long vehicles (l > longL) on the low-z edge
// from the east (a slot's x, z is the vehicle's origin, `off` ahead of its footprint's middle), all others on the high-z edge from the west, rear inset inside the edge, so you drive out forwards.
// l = the solid's length (the truck), span = the whole footprint. Throws instead of stacking cars on top of each other when a vehicle is too long or the rows would meet.
export function depotLayout(ids, defs, cfg = DEPOT) {
  const x0 = cfg.x - cfg.len / 2, x1 = cfg.x + cfg.len / 2, zHigh = cfg.z + cfg.depth / 2, zLow = cfg.z - cfg.depth / 2;
  const rows = { high: [], low: [] };
  for (const id of depotOrder(ids, defs)) {
    const { w, l, body = l, off = 0 } = footprint(defs[id]);
    if (l + cfg.inset > cfg.depth) throw new Error(`depotLayout: vehicle ${id} is longer than the strip is deep`);
    rows[l > cfg.longL ? 'low' : 'high'].push({ id, w, l, body, off });
  }
  let hiX = x0, loX = x1;
  const slots = [];
  for (const v of rows.high) { const slot = v.w + cfg.gap; slots.push(placed(v, hiX + slot / 2, zHigh - cfg.inset - v.l / 2, -Math.PI / 2)); hiX += slot; }
  for (const v of rows.low) { const slot = v.w + cfg.gap; loX -= slot; slots.push(placed(v, loX + slot / 2, zLow + cfg.inset + v.l / 2, Math.PI / 2)); }
  if (hiX > loX) throw new Error('depotLayout: the rows meet');
  return slots;
}

// #807: which slots get a real model: `load` the nearest nearMax within near (nearest first), `keep` the looser set a
// built model may stay in (hysteresis); never the driven vehicle
export function depotWants(x, z, slots, drivenId, cfg = DEPOT) {
  const ranked = slots.filter(s => s.id !== drivenId).map(s => ({ id: s.id, d: Math.hypot(s.x - x, s.z - z) })).sort((a, b) => a.d - b.d);
  const pick = (r, n) => ranked.filter(s => s.d <= r).slice(0, n).map(s => s.id);
  return { load: pick(cfg.near, cfg.nearMax), keep: new Set(pick(cfg.keep, cfg.keepMax)) };
}

// the closest parked vehicle within reach, never the driven one (its home slot stands empty)
export function nearestSlot(x, z, slots, drivenId, reach) {
  let best = null;
  for (const s of slots) {
    if (s.id === drivenId) continue;
    const d = carReach(x, z, parkedBox({ x: s.x, z: s.z, y: 0, th: s.th }, { l: s.l, w: s.w, h: 0 }));
    if (d > reach || (best && d >= best.d)) continue;
    best = { id: s.id, d };
  }
  return best;
}

// depot.js — #553: the vehicle depot's home slots on the DSM car park. Pure module: no DOM, no three.js.
// index.html keeps the glue: building the parked meshes, the solids and the boarding.
import { VEHICLE_TYPES, galleryOrder } from './carselect.js';
import { parkedBox, carReach } from './foot.js';

// the strip: centre, usable length along +x, depth along z; a slot is the footprint plus the gap beside it
export const DEPOT = { x: 832.3, z: -107.5, len: 130, depth: 30, gap: 1.2, inset: 0.5, longL: 7, build: 400, show: 300, reachCar: 4, reachSpeed: 2 };

// the footprint from the collision entry (pure data, known before any model loads): 2r square, a capsule 2(hl + r) long
export function footprint(def) {
  const c = def.collision;
  if (!c || (c.shape !== 'circle' && c.shape !== 'capsule')) throw new Error(`footprint: unknown collision shape ${c?.shape}`);
  const w = 2 * c.r, l = c.shape === 'capsule' ? 2 * (c.hl + c.r) : 2 * c.r;
  return { w, l };
}

// the row order: the types in VEHICLE_TYPES order, each strongest first (galleryOrder); unknown types last, table order
function depotOrder(ids, defs) {
  const out = [], seen = new Set();
  for (const type of VEHICLE_TYPES) for (const id of galleryOrder(ids, defs, type)) { out.push(id); seen.add(id); }
  for (const id of ids) if (!seen.has(id)) out.push(id);
  return out;
}

// one home slot per id, every vehicle nose to the middle of the strip: long vehicles (l > longL) on the low-z edge
// from the east, all others on the high-z edge from the west, rear inset inside the edge, so you drive out forwards.
// Throws instead of stacking cars on top of each other when a vehicle is too long or the rows would meet.
export function depotLayout(ids, defs, cfg = DEPOT) {
  const x0 = cfg.x - cfg.len / 2, x1 = cfg.x + cfg.len / 2, zHigh = cfg.z + cfg.depth / 2, zLow = cfg.z - cfg.depth / 2;
  const rows = { high: [], low: [] };
  for (const id of depotOrder(ids, defs)) {
    const { w, l } = footprint(defs[id]);
    if (l + cfg.inset > cfg.depth) throw new Error(`depotLayout: vehicle ${id} is longer than the strip is deep`);
    rows[l > cfg.longL ? 'low' : 'high'].push({ id, w, l });
  }
  let hiX = x0, loX = x1;
  const slots = [];
  for (const v of rows.high) { const slot = v.w + cfg.gap; slots.push({ id: v.id, x: hiX + slot / 2, z: zHigh - cfg.inset - v.l / 2, th: -Math.PI / 2, w: v.w, l: v.l }); hiX += slot; }
  for (const v of rows.low) { const slot = v.w + cfg.gap; loX -= slot; slots.push({ id: v.id, x: loX + slot / 2, z: zLow + cfg.inset + v.l / 2, th: Math.PI / 2, w: v.w, l: v.l }); }
  if (hiX > loX) throw new Error('depotLayout: the rows meet');
  return slots;
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

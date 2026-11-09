// depot.js — #553: the vehicle depot's pure layout. One home slot per vehicle on the DSM car park strip (OSM lot 118856561
// by the bus stop in Sisseln), long vehicles on the low-z edge, every other on the high-z edge, nose to the middle.
// Pure module: no DOM, no three.js, no window, so node --test can import it. index.html keeps the glue.
import { VEHICLE_TYPES, galleryOrder } from './carselect.js';
import { parkedBox, carReach } from './foot.js';

// the strip: centre, usable length along +x, depth along z; the radii around the centre for building, showing, boarding
export const DEPOT = { x: 832.3, z: -107.5, len: 130, depth: 30, gap: 1.2, inset: 0.5, longL: 7, build: 400, show: 300, reachCar: 4, reachSpeed: 2 };

// a vehicle's parking footprint from its collision entry (pure data, known before any model loads): width 2r, length 2r (circle) or 2(hl + r) (capsule)
export function footprint(def) {
  const c = def?.collision;
  if (!c || (c.shape !== 'circle' && c.shape !== 'capsule')) throw new Error(`footprint: collision shape '${c?.shape}' is not supported, only 'circle' or 'capsule'`);
  return { w: 2 * c.r, l: c.shape === 'capsule' ? 2 * (c.hl + c.r) : 2 * c.r };
}

// the depot's order: the known types in VEHICLE_TYPES order, each strongest first (galleryOrder), then the rest in table order
const depotOrder = (ids, defs) => [
  ...VEHICLE_TYPES.flatMap(t => galleryOrder(ids, defs, t)),
  ...ids.filter(id => !VEHICLE_TYPES.includes(defs[id].type)),
];

// one home slot per id: { id, x, z, th, w, l }, th the nose heading ((cos th, sin th)), the same pose as P and FOOT.car.
// Long vehicles (l > longL) back onto the low-z edge from the east end; every other onto the high-z edge from the west;
// each vehicle takes its footprint plus the gap beside it, its rear inset inside the edge. Fails fast instead of stacking cars.
export function depotLayout(ids, defs, cfg = DEPOT) {
  const x0 = cfg.x - cfg.len / 2, x1 = cfg.x + cfg.len / 2;
  const zHigh = cfg.z + cfg.depth / 2, zLow = cfg.z - cfg.depth / 2;
  let hi = x0, lo = x1;
  const rows = { high: [], low: [] };
  for (const id of depotOrder(ids, defs)) {
    const { w, l } = footprint(defs[id]);
    if (l + cfg.inset > cfg.depth) throw new Error(`depotLayout: vehicle ${id} is longer than the strip is deep`);
    const long = l > cfg.longL, slot = w + cfg.gap;
    if (long) { rows.low.push({ id, x: lo - slot / 2, z: zLow + cfg.inset + l / 2, th: Math.PI / 2, w, l }); lo -= slot; }
    else { rows.high.push({ id, x: hi + slot / 2, z: zHigh - cfg.inset - l / 2, th: -Math.PI / 2, w, l }); hi += slot; }
  }
  if (hi > lo) throw new Error('depotLayout: the rows meet');
  return [...rows.high, ...rows.low];
}

// the closest parked vehicle within reach (its box's carReach), never the driven one's own slot
export function nearestSlot(x, z, slots, drivenId, reach) {
  let best = null;
  for (const s of slots) {
    if (s.id === drivenId) continue;
    const d = carReach(x, z, parkedBox({ x: s.x, z: s.z, y: 0, th: s.th }, { l: s.l, w: s.w, h: 0 }));
    if (d <= reach && (!best || d < best.d)) best = { id: s.id, d };
  }
  return best;
}

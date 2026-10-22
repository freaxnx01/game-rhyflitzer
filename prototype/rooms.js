// #277 / #361: the room template -- pure layout (no three.js, no DOM): a 500 x 500 m lawn at ROOM_Y under the Hübel, facing
// along its own spoke, the object (if any) in its centre, a closed ring of trees at the edge with a gap only at the
// portal, gravel paths, a ship's water basin, and the tunnel stub leading back to the portal. Eight rooms share this template (ROOMS); only the
// Eiffel, Atomium (room 1) and Titanic (room 7) rooms have an object today; new objects take NEXT_ROOMS in turn. index.html builds the meshes from a room's layout the first time its spoke is
// entered (#308: only one room's meshes exist at a time). Unit-tested with `node --test prototype/tests/rooms.test.mjs`.
import { EIFFEL, ATOMIUM, TITANIC } from './hideout.js';
import { BELOW_Y, SPOKE, spokeFrame } from './underground.js';

export const ROOM_Y = BELOW_Y, ROOM_HALF = 250;
const TREE_ROWS = [6, 12], TREE_STEP = 4;   // rows at ROOM_HALF - 6 and - 12 from the centre, a tree every 4 m (crowns 8+ m)
const GAP = SPOKE.hw + 1;   // the portal gap left in the near tree-ring edge and its wall strip
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };   // small LCG, deterministic

// #361: eight rooms, star-shaped round the ring; only the Eiffel, Atomium and Titanic rooms have their object and name today (#355 was the Atomium, #422 the Titanic; the rest follow,
// one issue per landmark) -- an empty room's spoke stays unsigned (spokeSigns in underground.js) so it raises no expectations.
export const ROOMS = [
  { id: 'eiffel', name: 'La Tour Eiffel', object: EIFFEL, signed: false },   // signed: false -- unsigned for now, so finding them stays a surprise
  { id: 'atomium', name: 'Atomium', object: ATOMIUM, signed: false },
  { id: 'room2', name: null, object: null },
  { id: 'room3', name: null, object: null },
  { id: 'room4', name: null, object: null },
  { id: 'room5', name: null, object: null },
  { id: 'room6', name: null, object: null },
  { id: 'room7', name: 'Titanic', object: TITANIC, signed: false },
];
// #422: the free rooms in the order new objects take them -- from the lift outwards, left and right in turn. The lift's exit meets
// the ring between spoke 7 (front left) and spoke 0 (front right, the Eiffel); 1 (the Atomium) follows on the right, so the Titanic
// opens the left side, then 2, 6, 3, 5 and last 4, the room straight behind the lift.
export const NEXT_ROOMS = [7, 2, 6, 3, 5, 4];
export const isRoomLevel = (id) => ROOMS.some(r => r.id === id);

// #422: a closed stadium round a ship (two straights, two half circles) at `off` m from the widest beam; w = its half width, c = the
// half length of the straights, so it ends 5 m further past the bow and stern than off the beam
export function shipRing(obj, off) {
  const w = Math.max(...obj.hull.map(s => s[2])) + off, c = obj.length / 2 + off + 5 - w;
  return { w, c, end: c + w };
}
function stadium({ w, c }, loc) {
  const pts = [];
  for (let i = 0; i <= 16; i++) { const p = i / 16 * Math.PI; pts.push(loc(w * Math.cos(p), c + w * Math.sin(p))); }
  for (let i = 0; i <= 16; i++) { const p = Math.PI + i / 16 * Math.PI; pts.push(loc(w * Math.cos(p), -c + w * Math.sin(p))); }
  pts.push(pts[0]);
  return pts;
}
// the water the ship floats in: a stadium `basin` m off the beam, its surface WATER_LIFT over the lawn (above the gravel's 0.08), the ship's
// draught telling how deep the hull sits; the gravel lane runs QUAY m outside it as the quay. The basin's edge is a low kerb (RIM) the car
// cannot cross (the helicopter flies over it: `low`), so the water is never driven into. Pure -- index.html draws the surface and kerb.
export const WATER_LIFT = 0.12, QUAY = 5, RIM = { h: 0.6, hd: 0.5 };
export function shipBasin(obj) {
  const ring = shipRing(obj, obj.basin), lane = shipRing(obj, obj.basin + QUAY);
  return { ...ring, waterline: obj.draught, y: ROOM_Y + WATER_LIFT, lane };
}
export function rimColliders(pts, y) {
  const rim = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    rim.push({ x: (ax + bx) / 2, z: (az + bz) / 2, hw: len / 2 + 0.2, hd: RIM.hd, c: dx / len, s: dz / len, h: y + RIM.h, low: true, rim: true });
  }
  return rim;
}

export function roomLayout(k, room = ROOMS[k]) {
  const sp = spokeFrame(k), f = sp.u, v = sp.v, P = sp.end;
  const at = (a, b) => [P[0] + f[0] * a + v[0] * b, P[1] + f[1] * a + v[1] * b];   // portal-relative: a = 0 at the portal, growing into the room
  const centre = at(ROOM_HALF, 0), [cx, cz] = centre;
  const loc = (a, b) => [cx + f[0] * a + v[0] * b, cz + f[1] * a + v[1] * b];   // centre-relative: a = 0 at the centre
  const h = ROOM_Y + 40, colliders = [];
  const box = (a, b, hw, hd) => { const [x, z] = loc(a, b); return { x, z, hw, hd, c: f[0], s: f[1], h }; };
  const atBox = (a, b, hw, hd) => { const [x, z] = at(a, b); return { x, z, hw, hd, c: f[0], s: f[1], h }; };
  // the ring: far strip, two side strips, the near strip split in two round the portal gap (all 6 m thick, overlapping in the corners)
  colliders.push(box(ROOM_HALF - 3, 0, 3, ROOM_HALF));
  colliders.push(box(0, ROOM_HALF - 3, ROOM_HALF, 3));
  colliders.push(box(0, -(ROOM_HALF - 3), ROOM_HALF, 3));
  colliders.push(box(-ROOM_HALF + 3, (GAP + ROOM_HALF) / 2, 3, (ROOM_HALF - GAP) / 2));
  colliders.push(box(-ROOM_HALF + 3, -(GAP + ROOM_HALF) / 2, 3, (ROOM_HALF - GAP) / 2));
  // the portal tunnel's side walls and end cap, spanning from the dark stretch (#361's level switch) up through the gap
  const tunA0 = -(SPOKE.len - SPOKE.roomStart), tunA1 = 6, tunMid = (tunA0 + tunA1) / 2, tunHalf = (tunA1 - tunA0) / 2;
  colliders.push(atBox(tunMid, SPOKE.hw + 0.5, tunHalf, 0.5));
  colliders.push(atBox(tunMid, -(SPOKE.hw + 0.5), tunHalf, 0.5));
  colliders.push(atBox(tunA0 - 0.5, 0, 0.5, SPOKE.hw));
  // the object's feet (solid up to its footH; the car drives between and under them) -- only the rooms with an object have any
  const feet = (room.object && room.object.feet)
    ? room.object.feet.map(([fx, fz, hw = room.object.footHw]) => ({ x: cx + fx, z: cz + fz, hw, hd: hw, c: 1, s: 0, h: ROOM_Y + room.object.footH }))
    : [];
  colliders.push(...feet);
  // #422: a ship lies along the room's cross axis; its hull is a row of boxes (centre along the ship, half length, half width), solid up to hullH
  const hull = (room.object && room.object.hull)
    ? room.object.hull.map(([along, hl, hwAcross]) => ({ ...box(0, along, hwAcross, hl), h: ROOM_Y + room.object.hullH }))
    : [];
  colliders.push(...hull);
  // #422: the ship floats in a basin of water, kerbed; the gravel lane runs round it as the quay
  const basin = (room.object && room.object.hull) ? shipBasin(room.object) : null;
  if (basin) { basin.pts = stadium(basin, loc); basin.rim = rimColliders(basin.pts, ROOM_Y); colliders.push(...basin.rim); }
  // two rows of trees all the way round the square (Chebyshev distance from the centre), jittered along and across the row,
  // with a gap left near the portal so the tunnel opens into the lawn
  const rand = rng(277), trees = [];
  for (const inset of TREE_ROWS) {
    const r = ROOM_HALF - inset, n = Math.round(8 * r / TREE_STEP);
    for (let i = 0; i < n; i++) {
      const u = (i / n) * 4, side = Math.floor(u), s = (u - side) * 2 * r - r, j = (rand() - 0.5) * 1.6, k = (rand() - 0.5) * 1.6;
      const [x, z] = side === 0 ? [s + j, -r + k] : side === 1 ? [r + k, s + j] : side === 2 ? [-s + j, r + k] : [-r + k, -s + j];
      if (x < -(r - 3) && Math.abs(z) < GAP + 3) continue;
      trees.push([...loc(x, z), 9 + rand() * 6]);
    }
  }
  // gravel: portal -> centre loop, and the loop round the centre (radius 95 m, outside the feet); a ship gets the lane round its basin instead
  const loop = basin ? stadium(basin.lane, loc) : Array.from({ length: 33 }, (_, i) => [cx + Math.cos(i / 32 * 2 * Math.PI) * 95, cz + Math.sin(i / 32 * 2 * Math.PI) * 95]);
  const reachA = basin ? basin.lane.w : 95;
  const start = at(10, 0), end = [cx - f[0] * reachA, cz - f[1] * reachA], paths = [{ pts: [start, end], hw: 4 }, { pts: loop, hw: 4 }];
  const view = [cx - f[0] * 150, cz - f[1] * 150];
  return {
    id: room.id, k, y: ROOM_Y, half: ROOM_HALF, centre, frame: { f, v }, groundAt: () => ROOM_Y,
    ceilingAt(x, z) {
      const dx = x - P[0], dz = z - P[1], a = dx * f[0] + dz * f[1], b = dx * v[0] + dz * v[1];
      return a >= tunA0 && a <= 0 && Math.abs(b) <= SPOKE.hw + 1 ? ROOM_Y + SPOKE.ceiling : null;
    },
    object: room.object, tower: room.object ? { x: cx, z: cz } : null, feet, hull, basin, colliders, trees, paths,
    portal: { c: P, th: Math.atan2(f[1], f[0]), hw: SPOKE.hw, h: SPOKE.ceiling },
    spawn: { x: at(20, 0)[0], z: at(20, 0)[1], th: Math.atan2(f[1], f[0]) },
    towerView: room.object ? { x: view[0], z: view[1], th: Math.atan2(f[1], f[0]) } : null,
  };
}
export const eiffelRoom = () => roomLayout(0);

// The helicopter below (F): allowed in every room except during the lift ride, and on the surface only under open sky
// (zone 'open'); the ring, the tunnels and any ride ('lift') have no sky. Kept inside a room by a soft wall 25 m inside the
// half width (the tree rows stand at 6 and 12 m) and a ceiling 420 m over the floor (the tallest object so far, 330 m, fits).
export const ROOM_FLY = { wall: ROOM_HALF - 25, ceiling: 420 };
export const flyAllowed = (level, zone) => zone !== 'lift' && (isRoomLevel(level) ? zone === 'room' : level === 'surface' && zone === 'open');
export const roomFlyCeiling = (cfg = ROOM_FLY) => ROOM_Y + cfg.ceiling;
// The target altitude is limited by the ceiling itself, never by the (lagging) current height: clamping it to y pinned the climb at ~0.5 m/s.
export const roomFlyAlt = (alt, cfg = ROOM_FLY) => Math.min(alt, roomFlyCeiling(cfg));
export function roomFlyClamp(x, y, z, room = eiffelRoom(), cfg = ROOM_FLY) {
  const [cx, cz] = room.centre, { f, v } = room.frame, dx = x - cx, dz = z - cz;
  const a = dx * f[0] + dz * f[1], b = dx * v[0] + dz * v[1], c = (val) => Math.max(-cfg.wall, Math.min(cfg.wall, val));
  const ca = c(a), cb = c(b);
  if (ca === a && cb === b) return { x, y: Math.min(y, roomFlyCeiling(cfg)), z };
  return { x: cx + f[0] * ca + v[0] * cb, y: Math.min(y, roomFlyCeiling(cfg)), z: cz + f[1] * ca + v[1] * cb };
}

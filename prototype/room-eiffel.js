// #277: the Eiffel room -- pure layout (no three.js, no DOM): a 500 x 500 m lawn at ROOM_Y under the Hübel, the tower in its centre,
// a closed ring of trees at the edge, a lift house at the back (on the lobby's x/z, so the ride only changes y), gravel paths.
// index.html builds the meshes from this (roomBuild) the first time the lift goes down. A later room returns the same shape.
import { EIFFEL, LIFT } from './hideout.js';

export const ROOM_Y = -600, ROOM_HALF = 250, HOUSE_BACK = 215;
const TREE_ROWS = [6, 12], TREE_STEP = 4;   // rows at ROOM_HALF - 6 and - 12 from the centre, a tree every 4 m (crowns 8+ m)
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };   // small LCG, deterministic

export function eiffelRoom(lift = LIFT) {
  const f = [Math.cos(lift.th), Math.sin(lift.th)], v = [-f[1], f[0]];
  const centre = [lift.c[0] + f[0] * HOUSE_BACK, lift.c[1] + f[1] * HOUSE_BACK], [cx, cz] = centre;
  const at = (a, b) => [lift.c[0] + f[0] * a + v[0] * b, lift.c[1] + f[1] * a + v[1] * b];   // the house frame: a along the lift's heading, b to its right
  const h = ROOM_Y + 40, colliders = [];
  // the ring: four long solid strips 6 m thick, centred 3 m inside the edge, overlapping in the corners (the trees are the picture, these are the wall)
  for (const [x, z, hw, hd] of [[cx, cz - ROOM_HALF + 3, ROOM_HALF, 3], [cx, cz + ROOM_HALF - 3, ROOM_HALF, 3], [cx - ROOM_HALF + 3, cz, 3, ROOM_HALF], [cx + ROOM_HALF - 3, cz, 3, ROOM_HALF]]) colliders.push({ x, z, hw, hd, c: 1, s: 0, h });
  // the tower's four feet (solid up to footH; the car drives between and under the legs)
  const feet = EIFFEL.feet.map(([fx, fz]) => ({ x: cx + fx, z: cz + fz, hw: EIFFEL.footHw, hd: EIFFEL.footHw, c: 1, s: 0, h: ROOM_Y + EIFFEL.footH }));
  colliders.push(...feet);
  // the lift house: back wall 17 m behind the platform centre and two side walls, the front stays open (10.5 m half width, walls 1 m)
  const wall = (a, b, hw, hd) => { const [x, z] = at(a, b); return { x, z, hw, hd, c: f[0], s: f[1], h: ROOM_Y + 12 }; };
  colliders.push(wall(-17.5, 0, 0.5, 11.5), wall(-9, -10.5, 8.5, 0.5), wall(-9, 10.5, 8.5, 0.5));
  // two rows of trees all the way round the square (Chebyshev distance from the centre), jittered along and across the row
  const rand = rng(277), trees = [];
  for (const inset of TREE_ROWS) {
    const r = ROOM_HALF - inset, n = Math.round(8 * r / TREE_STEP);
    for (let i = 0; i < n; i++) {
      const u = (i / n) * 4, side = Math.floor(u), s = (u - side) * 2 * r - r, j = (rand() - 0.5) * 1.6, k = (rand() - 0.5) * 1.6;
      const [x, z] = side === 0 ? [s + j, -r + k] : side === 1 ? [r + k, s + j] : side === 2 ? [-s + j, r + k] : [-r + k, -s + j];
      trees.push([cx + x, cz + z, 9 + rand() * 6]);
    }
  }
  // gravel: house -> tower loop, and the loop round the tower (radius 95 m, outside the feet)
  const loop = Array.from({ length: 33 }, (_, i) => [cx + Math.cos(i / 32 * 2 * Math.PI) * 95, cz + Math.sin(i / 32 * 2 * Math.PI) * 95]);
  const start = at(10, 0), end = [cx - f[0] * 95, cz - f[1] * 95], paths = [{ pts: [start, end], hw: 4 }, { pts: loop, hw: 4 }];
  const view = [cx - f[0] * 150, cz - f[1] * 150];
  return {
    id: 'eiffel', y: ROOM_Y, half: ROOM_HALF, centre, groundAt: () => ROOM_Y,
    tower: { x: cx, z: cz }, feet, colliders, trees, paths,
    house: { c: lift.c, th: lift.th, hw: 10.5, hd: 17.5, front: at(lift.hd, 0) },
    spawn: { x: lift.c[0], z: lift.c[1], th: lift.th },
    towerView: { x: view[0], z: view[1], th: lift.th },
  };
}

// The helicopter in the room (F): allowed on the room level except during the lift ride, and on the surface only under open sky
// (zone 'open'); the tunnel and the lift lobby ('roofed') and any ride ('lift') have no sky. Kept inside the room by a soft wall
// 25 m inside the half width (the tree rows stand at 6 and 12 m) and a ceiling 420 m over the floor (the tower is 330 m).
export const ROOM_FLY = { wall: ROOM_HALF - 25, ceiling: 420 };
export const flyAllowed = (level, zone) => zone !== 'lift' && (level === 'eiffel' || (level === 'surface' && zone === 'open'));
export const roomFlyCeiling = (cfg = ROOM_FLY) => ROOM_Y + cfg.ceiling;
// The target altitude is limited by the ceiling itself, never by the (lagging) current height: clamping it to y pinned the climb at ~0.5 m/s.
export const roomFlyAlt = (alt, cfg = ROOM_FLY) => Math.min(alt, roomFlyCeiling(cfg));
export function roomFlyClamp(x, y, z, room = eiffelRoom(), cfg = ROOM_FLY) {
  const [cx, cz] = room.centre, c = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  return { x: c(x, cx - cfg.wall, cx + cfg.wall), y: Math.min(y, roomFlyCeiling(cfg)), z: c(z, cz - cfg.wall, cz + cfg.wall) };
}

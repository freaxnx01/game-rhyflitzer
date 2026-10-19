// #361: the hideout below the lift -- pure layout (no three.js, no DOM): the tunnel ring round the lift shaft, the exit from
// the lift into it, the eight star-shaped spokes 45 degrees apart, the dark stretch where each spoke switches the active
// level (ring <-> its room, with hysteresis so jitter near the switch point does not flicker), the ring's colliders and
// ceiling, where the car respawns in the ring, and the name signs over a spoke mouth once its room has its object. Unit-
// tested with `node --test prototype/tests/underground.test.mjs`.
import { LIFT, liftColliders, ringStations } from './hideout.js';

export const BELOW_Y = -600;
export const RING = { r: 60, hw: 8, ceiling: 9, wall: 1 };
export const EXIT = { from: LIFT.hd, to: RING.r - RING.hw, hw: 5, ceiling: 7 };
export const SPOKE = { n: 8, len: 100, hw: 5, ceiling: 7, phase: Math.PI / 8, dark: [40, 60], switchIn: 52, switchOut: 48, ringEnd: 70, roomStart: 30 };

// spoke k's frame: a = its angle off the lift's centre, u = outward unit vector, v = across it, start = the ring's outer
// edge, end = SPOKE.len further out
export function spokeFrame(k) {
  const [cx, cz] = LIFT.c, a = LIFT.th + SPOKE.phase + k * 2 * Math.PI / SPOKE.n, u = [Math.cos(a), Math.sin(a)], v = [-u[1], u[0]];
  const r0 = RING.r + RING.hw, start = [cx + u[0] * r0, cz + u[1] * r0], end = [start[0] + u[0] * SPOKE.len, start[1] + u[1] * SPOKE.len];
  return { k, a, u, v, start, end };
}
// the spoke (and metres s along it, d off its axis) that holds (x, z) + pad, else null
export function spokeAt(x, z, pad = 0) {
  for (let k = 0; k < SPOKE.n; k++) {
    const f = spokeFrame(k), dx = x - f.start[0], dz = z - f.start[1], s = dx * f.u[0] + dz * f.u[1], d = Math.abs(dx * f.v[0] + dz * f.v[1]);
    if (d <= SPOKE.hw + pad && s >= -pad && s <= SPOKE.len + pad) return { k, s, d };
  }
  return null;
}
// the level the car should be on: the ring switches into a room past switchIn, a room switches back to the ring before
// switchOut; a spoke foreign to the current room never switches it (only its own spoke, or the ring, can)
export function belowLevelAt(current, x, z, roomIds) {
  const sp = spokeAt(x, z);
  if (!sp) return current;
  if (current === 'ring') return sp.s >= SPOKE.switchIn ? roomIds[sp.k] : 'ring';
  if (roomIds[sp.k] === current) return sp.s <= SPOKE.switchOut ? 'ring' : current;
  return current;
}
// the arcs of a circle left open at each angle in gapAngles (each a half-angle wide), sorted and wrapped
function arcsWithGaps(gapAngles, half) {
  const sorted = gapAngles.map(a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).sort((a, b) => a - b), out = [];
  for (let i = 0; i < sorted.length; i++) {
    const a0 = sorted[i] + half, a1 = (i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 2 * Math.PI) - half;
    if (a1 > a0) out.push({ a0, a1 });
  }
  return out;
}
// the ring's walls (inner, round the shaft; outer, round the spokes), the exit's side walls, each spoke's side walls and
// end cap, and the lift's own shaft house on this level
export function ringColliders() {
  const [cx, cz] = LIFT.c, wall = RING.wall, h = BELOW_Y + RING.ceiling, out = [];
  const innerR = RING.r - RING.hw - wall / 2, outerR = RING.r + RING.hw + wall / 2;
  const innerHalf = Math.asin(Math.min(1, (EXIT.hw + wall) / innerR)), outerHalf = Math.asin(Math.min(1, (SPOKE.hw + wall) / outerR));
  const spokeAngles = Array.from({ length: SPOKE.n }, (_, k) => spokeFrame(k).a);
  const arcWall = (r, a0, a1) => {
    const n = Math.max(1, Math.round((a1 - a0) * r / 4));
    return ringStations(cx, cz, r, n, a0, a1).map(st => ({ x: st.x, z: st.z, hw: st.len / 2, hd: wall / 2, c: Math.cos(st.rot), s: Math.sin(st.rot), h, secret: true }));
  };
  for (const { a0, a1 } of arcsWithGaps([LIFT.th], innerHalf)) out.push(...arcWall(innerR, a0, a1));
  for (const { a0, a1 } of arcsWithGaps(spokeAngles, outerHalf)) out.push(...arcWall(outerR, a0, a1));
  const f = [Math.cos(LIFT.th), Math.sin(LIFT.th)], v = [-f[1], f[0]], exitMid = (EXIT.from + EXIT.to) / 2, exitHalf = (EXIT.to - EXIT.from) / 2;
  for (const side of [-1, 1]) {
    const off = side * (EXIT.hw + wall / 2);
    out.push({ x: cx + f[0] * exitMid + v[0] * off, z: cz + f[1] * exitMid + v[1] * off, hw: exitHalf, hd: wall / 2, c: f[0], s: f[1], h, secret: true });
  }
  for (let k = 0; k < SPOKE.n; k++) {
    const fr = spokeFrame(k), mid = SPOKE.ringEnd / 2;
    for (const side of [-1, 1]) {
      const off = side * (SPOKE.hw + wall / 2);
      out.push({ x: fr.start[0] + fr.u[0] * mid + fr.v[0] * off, z: fr.start[1] + fr.u[1] * mid + fr.v[1] * off, hw: mid, hd: wall / 2, c: fr.u[0], s: fr.u[1], h, secret: true });
    }
    const cap = SPOKE.ringEnd + 0.5;
    out.push({ x: fr.start[0] + fr.u[0] * cap, z: fr.start[1] + fr.u[1] * cap, hw: SPOKE.hw + wall, hd: wall / 2, c: fr.v[0], s: fr.v[1], h, secret: true });
  }
  return [...out, ...liftColliders('bottom', BELOW_Y)];
}
// the ceiling over (x, z) on the ring level: the cabin, the exit strip, the ring annulus, a spoke, else null (rock)
export function ringCeilingAt(x, z) {
  const [cx, cz] = LIFT.c, f = [Math.cos(LIFT.th), Math.sin(LIFT.th)], v = [-f[1], f[0]], dx = x - cx, dz = z - cz;
  const along = dx * f[0] + dz * f[1], across = dx * v[0] + dz * v[1];
  if (Math.abs(along) <= LIFT.hd + 1 && Math.abs(across) <= LIFT.hw + 1) return BELOW_Y + LIFT.height - 1;
  if (along >= EXIT.from - 1 && along <= EXIT.to + 1 && Math.abs(across) <= EXIT.hw + 1) return BELOW_Y + EXIT.ceiling;
  if (Math.abs(Math.hypot(dx, dz) - RING.r) <= RING.hw + RING.wall) return BELOW_Y + RING.ceiling;
  if (spokeAt(x, z, RING.wall)) return BELOW_Y + SPOKE.ceiling;
  return null;
}
// where the car appears when it rides down: the exit's ring end, facing out into the ring
export function ringSpawn() {
  const [cx, cz] = LIFT.c, f = [Math.cos(LIFT.th), Math.sin(LIFT.th)], d = RING.r - RING.hw - 2;
  return { x: cx + f[0] * d, z: cz + f[1] * d, th: LIFT.th };
}
// one sign per room that has both a name and its object, hung at its spoke's mouth on the ring side
export function spokeSigns(rooms) {
  const out = [];
  rooms.forEach((room, k) => {
    if (!room.object || !room.name) return;
    const f = spokeFrame(k);
    out.push({ k, text: room.name, x: f.start[0] - f.u[0] * 0.6, z: f.start[1] - f.u[1] * 0.6, y: BELOW_Y + (SPOKE.ceiling + RING.ceiling) / 2, th: f.a + Math.PI });
  });
  return out;
}

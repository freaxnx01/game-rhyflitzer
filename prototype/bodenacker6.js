// #410: the block Bodenackerstrasse 6a–6d (Sisseln) modelled from its own data instead of a generic extrusion: ten storeys,
// four glass entrance porches taken from the OSM outline's projections, stair halls behind them, a roof-top housing each.
// Sources: OSM way 171822634 (© OpenStreetMap contributors, ODbL), the world file's measured eaves height (swissSURFACE3D
// © swisstopo) and the federal building register's storey count (GWR, public). Pure: no three.js, no DOM.
// See docs/superpowers/specs/2026-10-21-bodenackerstrasse-6-model-design.md.

export const BODENACKER6 = {
  id: 171822634, storeys: 10, houses: ['6a', '6b', '6c', '6d'],
  houseOrder: 'southToNorth',          // #455: 6a at the south end, 6d at the north, as OSM's address points; 6c is the second entrance from the north
  housingRise: 2.6, parapet: 0.5,      // m above the roof slab (Q1, maintainer decision) / white band under the slab
  moduleWidth: 4.0,                    // façade texture tile width (one window module)
  porch: { h: 3.0, door: 1.0, post: 0.15, slab: 0.25, overhang: 0.1 },
  stair: { d: 3.0 },                   // stair hall depth behind the façade line (m into the body)
  bumpMinDepth: 1.5, bumpMaxWidth: 4.0 // what counts as a porch bump in the ring
};

export function isBodenacker6(b) { return !!b && b.id === BODENACKER6.id; }

// the box() frame of rect = [cx, cz, w, d, rot]: world = centre + R(rot)·(u, v); outTh heads +v (out into the street)
const wrap = (th) => Math.atan2(Math.sin(th), Math.cos(th));
export function bodenackerFrame(rect) {
  const [cx, cz, , , rot] = rect, c = Math.cos(rot), s = Math.sin(rot);
  return {
    cx, cz, rot,
    toWorld: (u, v) => [cx + u * c - v * s, cz + u * s + v * c],
    toLocal: (x, z) => [(x - cx) * c + (z - cz) * s, -(x - cx) * s + (z - cz) * c],
    outTh: wrap(rot + Math.PI / 2), inTh: wrap(rot + Math.PI / 2 + Math.PI),
  };
}

// closed ring [[u, v]] without near-collinear vertices: a vertex goes when |cross of its two edges| / longer edge < tol
export function simplifyRing(points, tol = 0.15) {
  let ring = points.slice();
  for (let changed = true; changed && ring.length > 3;) {
    changed = false;
    for (let i = 0; i < ring.length; i++) {
      const p0 = ring[(i + ring.length - 1) % ring.length], p1 = ring[i], p2 = ring[(i + 1) % ring.length];
      const au = p1[0] - p0[0], av = p1[1] - p0[1], bu = p2[0] - p1[0], bv = p2[1] - p1[1];
      const cross = Math.abs(au * bv - av * bu), edge = Math.max(Math.hypot(au, av), Math.hypot(bu, bv));
      if (cross / edge < tol) { ring.splice(i, 1); changed = true; break; }
    }
  }
  return ring;
}

// v0 is the outer of the two façade corners (OSM noise): the porch never undercuts the wall.
// the three-edge run of a porch bump in the simplified local ring: out (+v), across (|u| <= bumpMaxWidth), back (-v)
function scanBumps(s, cfg) {
  const at = (k) => s[(k + s.length) % s.length], out = [];
  for (let i = 0; i < s.length; i++) {
    const p0 = at(i), p1 = at(i + 1), p2 = at(i + 2), p3 = at(i + 3);
    const out0 = p1[1] - p0[1], acrossU = p2[0] - p1[0], acrossV = p2[1] - p1[1], back = p3[1] - p2[1];
    const sideways = Math.abs(p1[0] - p0[0]) < 1 && Math.abs(p3[0] - p2[0]) < 1;
    if (sideways && out0 >= cfg.bumpMinDepth && back <= -cfg.bumpMinDepth && Math.abs(acrossV) < 0.5
      && Math.abs(acrossU) > 0.1 && Math.abs(acrossU) <= cfg.bumpMaxWidth)
      out.push({ i, p0, p1, p2, p3, u: (p1[0] + p2[0]) / 2, v0: Math.max(p0[1], p3[1]), v1: (p1[1] + p2[1]) / 2,
        // the bump width is centimetre-clean: OSM carries float noise that a deepEqual test would otherwise see
        w: +Math.abs(acrossU).toFixed(6) });
  }
  return out;
}

// the four street-side projections of the OSM outline are the entrance porches: one per house, entrance on the +v tip face
export function bodenackerPorches(ring, frame, cfg = BODENACKER6) {
  const local = ring.map(([x, z]) => frame.toLocal(x, z));
  const bumps = scanBumps(simplifyRing(local), cfg);
  if (bumps.length !== cfg.houses.length) throw new Error(`bodenacker6: expected ${cfg.houses.length} porches, found ${bumps.length}`);
  bumps.sort((a, b) => a.u - b.u);
  const order = cfg.houseOrder === 'northToSouth' ? cfg.houses.slice().reverse() : cfg.houses;
  return bumps.map((b, i) => {
    const [x, z] = frame.toWorld(b.u, b.v1);
    return { house: order[i], u: b.u, v0: b.v0, v1: b.v1, w: b.w, d: b.v1 - b.v0, h: cfg.porch.h,
      entrance: { x, z, th: frame.inTh, w: cfg.porch.door } };
  });
}

// the body ring: the local ring with every porch bump replaced by one edge along the façade line (drop the two tip corners)
export function bodenackerBody(ring, frame, porches, cfg = BODENACKER6) {
  const simple = simplifyRing(ring.map(([x, z]) => frame.toLocal(x, z)));
  const drop = new Set();
  for (const b of scanBumps(simple, cfg)) { drop.add((b.i + 1) % simple.length); drop.add((b.i + 2) % simple.length); }
  return simplifyRing(simple.filter((_, k) => !drop.has(k)));
}

// the stair hall footprint directly behind each porch: the porch's plan size, cfg.stair.d into the body
export function bodenackerStairs(porches, cfg = BODENACKER6) {
  return porches.map(p => ({ house: p.house, u: p.u, w: p.w, d: cfg.stair.d, vFront: p.v0, vBack: p.v0 - cfg.stair.d }));
}

const shoelace = (pts) => pts.reduce((s, p, i) => s + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0) / 2;

// one wall per body edge, in world coordinates, classified by the outward normal's v component
export function bodenackerWalls(body, frame) {
  let ring = body.slice();
  if (shoelace(ring) > 0) ring.reverse();                    // normalise the winding: outward = right of the walking direction
  const walls = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    const [ax, az] = frame.toWorld(p[0], p[1]), [bx, bz] = frame.toWorld(q[0], q[1]);
    const L2 = Math.hypot(bx - ax, bz - az);
    if (L2 < 0.05) continue;
    const nx = -(bz - az) / L2, nz = (bx - ax) / L2, nv = nx * Math.cos(frame.outTh) + nz * Math.sin(frame.outTh);
    walls.push({ a: [ax, az], b: [bx, bz], face: nv < -0.5 ? 'back' : nv > 0.5 ? 'street' : 'end' });
  }
  return walls;
}

// #467: the doorway behind a porch: the street wall crossing the porch's axis is cut at u ± w/2 into the two wall pieces either side
// and the piece over the gap (the lintel, drawn from the door's top up). u0 = the piece's start along the uncut wall, so the façade tile runs on
export function bodenackerDoorway(walls, frame, porch, w) {
  const at = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  for (const [k, wall] of walls.entries()) {
    const [ua, va] = frame.toLocal(...wall.a), [ub, vb] = frame.toLocal(...wall.b);
    if (wall.face !== 'street' || Math.abs(ub - ua) < 1e-9) continue;
    const t0 = (porch.u - w / 2 - ua) / (ub - ua), t1 = (porch.u + w / 2 - ua) / (ub - ua), lo = Math.min(t0, t1), hi = Math.max(t0, t1);
    if (lo <= 0 || hi >= 1 || Math.abs(va + (vb - va) * (lo + hi) / 2 - porch.v0) > 0.5) continue;
    const L = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]), pa = at(wall.a, wall.b, lo), pb = at(wall.a, wall.b, hi);
    const piece = (a, b, t) => ({ a, b, face: 'street', u0: L * t });
    return { walls: [...walls.slice(0, k), piece(wall.a, pa, 0), piece(pb, wall.b, hi), ...walls.slice(k + 1)], lintel: piece(pa, pb, lo) };
  }
  throw new Error(`bodenacker6: no street wall behind porch ${porch.house}`);
}

// #445: what stands on sloping ground. stand = the level the block (or a porch) is meant to stand on, ground = the terrain under it:
// the floor is the higher of the two, and where the ground lies lower a foundation skirt fills the gap (sunk `below` m so no slope shows under it)
export function bodenackerPlinth(stand, ground, below = 0.3) {
  const floor = Math.max(stand, ground);
  return { floor, skirt: floor - ground > 0.02 ? { y0: ground - below, y1: floor } : null };
}

export function bodenackerFloors(base, h, cfg = BODENACKER6) {
  const pitch = h / cfg.storeys;
  const floors = Array.from({ length: cfg.storeys }, (_, k) => base + k * pitch);
  return { pitch, floors, roof: base + h + cfg.parapet, housingTop: base + h + cfg.parapet + cfg.housingRise };
}

export function bodenackerLayout(b, base, h, cfg = BODENACKER6) {
  const frame = bodenackerFrame(b.rect);
  const porches = bodenackerPorches(b.ring, frame, cfg);
  return { frame, porches, stairs: bodenackerStairs(porches, cfg), body: bodenackerBody(b.ring, frame, porches, cfg),
    walls: bodenackerWalls(bodenackerBody(b.ring, frame, porches, cfg), frame), floors: bodenackerFloors(base, h, cfg), ring: b.ring };
}

export function bodenackerHouse(layout, house) {
  const porch = layout.porches.find(p => p.house === house), stair = layout.stairs.find(s => s.house === house);
  if (!porch || !stair) throw new Error(`bodenacker6: unknown house ${house}`);
  return { porch, stair };
}
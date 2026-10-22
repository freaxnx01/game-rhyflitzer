// #410: the block Bodenackerstrasse 6a–6d (Sisseln) modelled from its own data instead of a generic extrusion: ten storeys,
// four glass entrance porches taken from the OSM outline's projections, stair halls behind them, a roof-top housing each.
// Sources: OSM way 171822634 (© OpenStreetMap contributors, ODbL), the world file's measured eaves height (swissSURFACE3D
// © swisstopo) and the federal building register's storey count (GWR, public). Pure: no three.js, no DOM.
// See docs/superpowers/specs/2026-10-21-bodenackerstrasse-6-model-design.md.

export const BODENACKER6 = {
  id: 171822634, storeys: 10, houses: ['6a', '6b', '6c', '6d'],
  houseOrder: 'northToSouth',          // 6a at the north end (confirmed 2026-10-21); 6c is the third entrance from the north
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
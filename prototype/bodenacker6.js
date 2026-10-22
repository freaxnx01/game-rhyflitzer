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
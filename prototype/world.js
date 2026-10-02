// Pure helpers for the OSM world (no three.js, no DOM): spatial grid, water distance field,
// water levels, polyline tools, world file -> layout. Unit-tested with `node --test prototype/tests/`.

export function makeGrid(cell = 32) { return { cell, m: new Map() }; }
const gk = (i, j) => i + ',' + j;
export function gridAdd(g, x0, z0, x1, z1, item) {
  const c = g.cell;
  for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) {
    const k = gk(i, j); let a = g.m.get(k); if (!a) g.m.set(k, a = []); a.push(item);
  }
}
export function gridAddSegment(g, ax, az, bx, bz, pad, item) { gridAdd(g, Math.min(ax, bx) - pad, Math.min(az, bz) - pad, Math.max(ax, bx) + pad, Math.max(az, bz) + pad, item); }
export function gridQuery(g, x, z, r) {
  const c = g.cell, out = new Set();
  for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++) for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) {
    const a = g.m.get(gk(i, j)); if (a) for (const it of a) out.add(it);
  }
  return out;
}

function b64(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Int8Array(u.buffer); }
export function sdfSampler(sdf) {
  const d = b64(sdf.data), { x0, z0, step, w, h } = sdf;
  return (x, z) => {
    const fx = (x - x0) / step, fz = (z - z0) / step;
    if (fx < 0 || fz < 0 || fx > w - 1 || fz > h - 1) return 127;
    const i = Math.max(0, Math.min(Math.floor(fx), w - 2)), j = Math.max(0, Math.min(Math.floor(fz), h - 2));
    const tx = w > 1 ? fx - i : 0, tz = h > 1 ? fz - j : 0;
    const at = (a, b) => d[Math.min(b, h - 1) * w + Math.min(a, w - 1)];
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * tx, bot = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * tx;
    return top + (bot - top) * tz;
  };
}

function inRing(r, x, z) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; }
export function waterIndex(water) {
  const items = water.map(w => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of w.rings[0]) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z); } return { w, bb: [a, b, c, d] }; });
  return { levelAt(x, z) { for (const { w, bb } of items) { if (x < bb[0] || x > bb[2] || z < bb[1] || z > bb[3]) continue; if (inRing(w.rings[0], x, z) && !w.rings.slice(1).some(h => inRing(h, x, z))) return w.level; } return null; },
    nameAt(x, z) { for (const { w, bb } of items) { if (x < bb[0] || x > bb[2] || z < bb[1] || z > bb[3]) continue; if (inRing(w.rings[0], x, z) && !w.rings.slice(1).some(h => inRing(h, x, z))) return w.name || ''; } return ''; } };
}

export function polylineLength(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }
export function nearestOnPolyline(pts, x, z) {
  let best = { d: Infinity, t: 0, i: 0 }, acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, L = Math.sqrt(L2);
    const u = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0;
    const d = Math.hypot(x - ax - dx * u, z - az - dz * u);
    if (d < best.d) best = { d, t: acc + u * L, i };
    acc += L;
  }
  return best;
}
export function offsetPolyline(pts, d) {
  const n = pts.length, out = [];
  const nrm = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; };
  for (let i = 0; i < n; i++) {
    const a = i > 0 ? nrm(pts[i - 1], pts[i]) : null, b = i < n - 1 ? nrm(pts[i], pts[i + 1]) : null;
    let m = a && b ? [a[0] + b[0], a[1] + b[1]] : (a || b); const l = Math.hypot(m[0], m[1]) || 1; m = [m[0] / l, m[1] / l];
    const k = a && b ? 1 / Math.max(0.35, m[0] * a[0] + m[1] * a[1]) : 1;
    out.push([pts[i][0] + m[0] * d * k, pts[i][1] + m[1] * d * k].map(v => Math.round(v * 1000) / 1000 + 0));   // +d = right of travel (x east, z south)
  }
  return out;
}

export function layoutFromWorld(w) {
  const roads = w.roads.map(r => ({ ...r, tex: r.cls === 'motorway' || r.cls === 'motorway_link' ? 'motorway' : 'road' }));
  return { roads, bridges: roads.filter(r => r.bridge), junctions: w.junctions, water: w.water, buildings: w.buildings,
           rail: w.rail, props: w.props || [], streams: w.streams || [], anchors: w.anchors, bbox: w.bbox, sdf: w.waterSdf, sources: w.sources || [] };
}

export function bridgeDeckAt(b, t) { const u = Math.max(0, Math.min(1, t / (b.len || 1))); return b.h0 + (b.h1 - b.h0) * u; }
// Surface sits up to 0.3 m above the deck, fading in over the first/last 5 m so the bridge meets the terrain at both ends.
export function bridgeDeckOffset(b, t) { return 0.3 * Math.max(0, Math.min(1, Math.min(t, b.len - t) / 5)); }
export function bridgeSurfaceAt(b, t) { return bridgeDeckAt(b, t) + bridgeDeckOffset(b, t); }
// An OSM bridge is ground for a query at height y only from 1.5 m below its surface upward: a car on the road underneath an overpass
// is not snapped onto the deck. Callers that pass no height (placement code) keep the plain 2D test.
export function bridgeAccepts(surface, y) { return y === undefined || y >= surface - 1.5; }
// Water surface height at a point: the chunk's level (0 when unknown) inside the water, null on land. Callers test bridges first.
export function waterSurface(riverDist, level) { return riverDist < 0 ? (level ?? 0) : null; }

// Road markings, metres. Dash/gap/width follow VSS SN 640 850a ("Markierungen: Ausgestaltung und Anwendungsbereiche") as quoted by
// the cantonal guidelines Luzern vif 653.201 "Richtlinie Markierung" (2024, p. 8: Leitlinie innerorts 3.00 m / 3.00 m, ausserorts
// 3.00 m / 6.00 m, width 15 cm) and Zürich TBA "Markierungen auf Haupt- und Nebenstrassen" (Radstreifen 3/3, 1/1 across junctions).
// The norm itself is paywalled, so these are second-hand but consistent. Our roads with a centre line are mostly inner-town, so the
// innerorts 3/3 rhythm is used everywhere. Not from the norm: the solid line width (taken as the Leitlinie's 15 cm) and the cycle-lane
// inset (1.3 m, measured on design/reference/2026-09-29_sisseln-hauptstrasse-cycle-lanes.jpg; the usual Radstreifen is 1.25-1.5 m).
export const MARK = {
  centre: { dash: 3, gap: 3, w: 0.15, color: 'white' },
  'centre-solid': { dash: 1, gap: 0, w: 0.15, color: 'white' },
  cycle: { dash: 3, gap: 3, w: 0.15, color: 'yellow', inset: 1.3 },
};
// One-sided cycle lanes also get a white centre line (pipeline contract). Order: left yellow, right yellow, centre.
export function markLines(r) {
  const out = [], e = r.w / 2 - MARK.cycle.inset;
  if (r.mark === 'centre' || r.mark === 'centre-solid') out.push({ pts: r.pts, spec: MARK[r.mark] });
  if (r.mark === 'cycle' || r.mark === 'cycle-left') out.push({ pts: offsetPolyline(r.pts, -e), spec: MARK.cycle });
  if (r.mark === 'cycle' || r.mark === 'cycle-right') out.push({ pts: offsetPolyline(r.pts, e), spec: MARK.cycle });
  if (r.mark === 'cycle-left' || r.mark === 'cycle-right') out.push({ pts: r.pts, spec: MARK.centre });
  return out;
}

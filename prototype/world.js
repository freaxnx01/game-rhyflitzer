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

// car parks (#72): is a disc (a tree's footprint) clear of every lot surface? holes are islands, not car park
function ringDist(r, x, z) {
  let best = Infinity;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [ax, az] = r[j], [bx, bz] = r[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return best;
}
export function parkingIndex(lots) {
  const items = lots.map(l => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of l.ring) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z); } return { rings: [l.ring, ...(l.holes || [])], bb: [a, b, c, d] }; });
  return {
    clear(x, z, r = 0) {
      for (const { rings, bb } of items) {
        if (x < bb[0] - r || x > bb[2] + r || z < bb[1] - r || z > bb[3] + r) continue;
        if (inRing(rings[0], x, z) && !rings.slice(1).some(h => inRing(h, x, z))) return false;
        if (rings.some(ring => ringDist(ring, x, z) < r)) return false;
      }
      return true;
    },
  };
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
           rail: w.rail, props: w.props || [], parking: w.parking || [], streams: w.streams || [], boundaries: w.boundaries || [], anchors: w.anchors, bbox: w.bbox, sdf: w.waterSdf, sources: w.sources || [], origin: w.origin || null };
}

export function bridgeDeckAt(b, t) { const u = Math.max(0, Math.min(1, t / (b.len || 1))); return b.h0 + (b.h1 - b.h0) * u; }
// Surface sits up to 0.3 m above the deck, fading in over the first/last 5 m so the bridge meets the terrain at both ends; an end
// flagged fade0/fade1 === false is a joint with the next piece of a chain (#78) and keeps the full offset.
export function bridgeDeckOffset(b, t) { const a = b.fade0 === false ? Infinity : t, e = b.fade1 === false ? Infinity : b.len - t; return 0.3 * Math.max(0, Math.min(1, Math.min(a, e) / 5)); }
export function bridgeSurfaceAt(b, t) { return bridgeDeckAt(b, t) + bridgeDeckOffset(b, t); }
// An OSM bridge is ground for a query at height y only from 1.5 m below its surface upward: a car on the road underneath an overpass
// is not snapped onto the deck. Callers that pass no height (placement code) keep the plain 2D test.
export function bridgeAccepts(surface, y) { return y === undefined || y >= surface - 1.5; }
// #78: indices of the bridge pieces that join the hero piece `seed`: same non-empty name and an endpoint within 0.5 m of the group,
// generic pieces only (so #76's rail decks never join). The Fridolinsbrücke is four OSM ways.
export function bridgeChain(pieces, seed) {
  const out = [seed], name = pieces[seed].name, ends = (p) => [p.pts[0], p.pts[p.pts.length - 1]];
  const touches = (p) => ends(p).some(e => out.some(j => ends(pieces[j]).some(q => Math.hypot(e[0] - q[0], e[1] - q[1]) <= 0.5)));
  if (!name) return out;
  for (let grew = true; grew;) { grew = false; for (let i = 0; i < pieces.length; i++) { const p = pieces[i]; if (out.includes(i) || p.kind !== 'generic' || p.name !== name || !touches(p)) continue; out.push(i); grew = true; } }
  return out;
}
// #78: first sample (1 m apart) whose rise over the next `run` samples is below maxGrade: the top of the bank an approach road climbs
export function bankTop(hs, maxGrade = 0.08, run = 4) { for (let i = 0; i + run < hs.length; i++) if ((hs[i + run] - hs[i]) / run < maxGrade) return i; return hs.length - 1; }
// #78: -1 behind the polyline's first vertex, 1 beyond its last, else 0 (nearestOnPolyline clamps, this does not)
export function pastEnd(pts, x, z) {
  const n = pts.length, [ax, az] = pts[0], [bx, bz] = pts[1], [cx, cz] = pts[n - 2], [dx, dz] = pts[n - 1];
  if ((x - ax) * (bx - ax) + (z - az) * (bz - az) < 0) return -1;
  return (x - dx) * (dx - cx) + (z - dz) * (dz - cz) > 0 ? 1 : 0;
}
// #78: height on the straight deck line from bank point a (height ha) to bank point b (height hb), clamped at both banks
export function deckLine(a, ha, b, hb, x, z) { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); return ha + (hb - ha) * u; }
// #78: the first s metres of a polyline
export function cutPolyline(pts, s) {
  const out = [pts[0]]; let acc = 0; s = Math.max(0, s);
  for (let i = 0; i < pts.length - 1; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0); if (acc + L >= s) { const u = L ? (s - acc) / L : 0; out.push([x0 + (x1 - x0) * u, z0 + (z1 - z0) * u]); return out; } out.push(pts[i + 1]); acc += L; }
  return out;
}
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

// #12: name of the road under the car -- the nearest named segment whose centre line is within half its width (+ margin)
export function roadNameAt(cands, x, z, margin = 1) {
  let best = '', bd = Infinity;
  for (const { r, i } of cands) {
    if (!r.n) continue;
    const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const u = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0, d = Math.hypot(x - ax - dx * u, z - az - dz * u);
    if (d <= r.w / 2 + margin && d < bd) { bd = d; best = r.n; }
  }
  return best;
}
// roof top above the base, as osmBuilding draws it (roughly); shared by the house-number (#12) and debug height (#39) labels
export function roofTop(b) { return typeof b.rh === 'number' ? b.h + b.rh : b.roof === 'gable' ? b.h + 0.4 * Math.min(b.rect[2], b.rect[3]) : Math.max(b.h, 3); }
// #45: the Bodenackerstrasse row houses in Sisseln, by OSM way id -- the six-unit blocks 3-21 plus the three-unit block 16a-16c.
// Picked by id, not by addr: 6a-6d and 1a-1d share the a-x pattern and are the big blocks next door.
export const ROW_HOUSE_IDS = new Set([512632899, 171822953, 171822664, 171822908, 171822930, 171822939, 171822935, 171822913, 171822943, 171822937, 171822949, 171822938, 171822934, 171822932, 171822933, 171822799]);
export function isRowHouse(b) { return ROW_HOUSE_IDS.has(b.id); }
// house units from the OSM addr range ('3a–3f' -> 6); 6 when the range is missing or unreadable
export function rowUnits(addr) { const m = /^\d+([a-z])[–-]\d+([a-z])$/.exec(addr || ''); return m ? m[2].charCodeAt(0) - m[1].charCodeAt(0) + 1 : 6; }
// texture tile for a row house: one unit wide, one whole storey tall (3 m nominal), so the yellow panels fall on the unit joints
export function rowHouseTile(b) { const w = Math.max(b.rect[2], b.rect[3]), h = Math.max(b.h, 3); return [w / rowUnits(b.addr), h / Math.max(1, Math.round(h / 3))]; }
// #12: house-number labels (OSM addr) at the footprint centre
export function addrLabels(buildings, landmarks = {}) {
  return [...buildings.filter(b => b.addr).map(b => ({ t: b.addr, x: b.rect[0], z: b.rect[1], top: roofTop(b) })),
          ...Object.values(landmarks).filter(l => l.addr).map(l => ({ t: l.addr, x: l.x, z: l.z, top: 9 }))];
}
export function pickLabels(items, x, z, maxDist = 60, maxN = 40) {
  const out = [];
  for (const it of items) { const d = Math.hypot(it.x - x, it.z - z); if (d <= maxDist) out.push({ ...it, d }); }
  return out.sort((a, b) => a.d - b.d).slice(0, maxN);
}
// #38: one label per façade of a w x d hall rotated like box() (rotateY(-rot)) -- façades +z, +x, -z, -x in the local frame, each
// just off its wall and facing outward, 0.6 x the façade long (at most 20 m) with the sign texture's 16:2.2 aspect.
export function facadeLabels(x, z, rot, w, d, off = 0.1) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [[0, d / 2 + off, w], [w / 2 + off, 0, d], [0, -(d / 2 + off), w], [-(w / 2 + off), 0, d]].map(([lx, lz, len], k) => {
    const lw = Math.min(0.6 * len, 20);
    return { x: x + lx * c - lz * s, z: z + lx * s + lz * c, rotY: -rot + k * Math.PI / 2, w: lw, h: lw * 2.2 / 16 };
  });
}

// car parks (#40): split triangles at their longest edge until no edge is longer than maxEdge, so a lot draped on the
// terrain follows it; midpoints are shared between neighbours. pts: [[x, z]], tris: [[i, j, k]] (winding kept)
export function subdivideTris(pts, tris, maxEdge) {
  const out = pts.slice(), done = [], todo = tris.map(t => t.slice()), mid = new Map();
  const len = (a, b) => Math.hypot(out[a][0] - out[b][0], out[a][1] - out[b][1]);
  const midpoint = (a, b) => {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    if (!mid.has(key)) { out.push([(out[a][0] + out[b][0]) / 2, (out[a][1] + out[b][1]) / 2]); mid.set(key, out.length - 1); }
    return mid.get(key);
  };
  while (todo.length) {
    const [a, b, c] = todo.pop();
    const [p, q, r] = [[a, b, c], [b, c, a], [c, a, b]].reduce((best, e) => len(e[0], e[1]) > len(best[0], best[1]) ? e : best);
    if (len(p, q) <= maxEdge) { done.push([a, b, c]); continue; }
    const m = midpoint(p, q);
    todo.push([p, m, r], [m, q, r]);
  }
  return { pts: out, tris: done };
}

// car parks (#40): each [ax, az, bx, bz] line becomes a quad `width` wide, corners [[x, z] x4] in order around it
export function lineQuads(lines, width) {
  const out = [];
  for (const [ax, az, bx, bz] of lines) {
    const length = Math.hypot(bx - ax, bz - az);
    if (!length) continue;
    const nx = -(bz - az) / length * width / 2, nz = (bx - ax) / length * width / 2;
    out.push([[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]]);
  }
  return out;
}

// #16: big village names (Midtown Madness style). Centres are the OSM place=town/village nodes inside the world, converted with
// pipeline/geo.py Frame(*DEFAULT_ORIGIN).to_game on 2026-10-02; Sisslerfeld has no place node and uses its map label (pipeline/anchors.json).
// r = rough village radius in metres: within it the village's own name is hidden.
export const VILLAGES = [
  { t: 'BAD SÄCKINGEN', x: -1372.9, z: -263.1, r: 800 },   // node 240042433 (town)
  { t: 'STEIN', x: -981.8, z: 615.7, r: 450 },             // node 240097537
  { t: 'SISSELN', x: 1677.6, z: -329.8, r: 450 },          // node 240055476
  { t: 'SISSLERFELD', x: 420, z: 300, r: 600 },            // map label, no place node
  { t: 'MÜNCHWILEN', x: -299.3, z: 1408.4, r: 350 },       // node 240115055
  { t: 'MUMPF', x: -3484.8, z: 596.6, r: 450 },            // node 192826016
  { t: 'MURG', x: 4361.6, z: -689.8, r: 550 },             // node 240124251
  { t: 'WALLBACH', x: -3984.9, z: -1744.8, r: 450 },       // node 3608448837 (Wallbach, Bad Säckingen)
];
export const VILLAGE_FADE = { in: 200, full: 2600, out: 3400 };
// Opacity by the car's distance d to the centre: hidden inside r, fades in over f.in, full until f.full, gone at f.out.
export function villageFade(d, r, f = VILLAGE_FADE) {
  if (d <= r || d >= f.out) return 0;
  if (d < r + f.in) return (d - r) / f.in;
  if (d > f.full) return (f.out - d) / (f.out - f.full);
  return 1;
}
// World height of the name: a constant ~3.4 deg of view beyond 500 m, at least 30 m, at most 180 m.
export function villageHeight(d) { return Math.max(30, Math.min(180, 0.06 * d)); }
export function villageLabels(villages, x, z) {
  const out = [];
  for (const v of villages) {
    const d = Math.hypot(v.x - x, v.z - z), opacity = villageFade(d, v.r);
    if (opacity > 0) out.push({ t: v.t, x: v.x, z: v.z, d, opacity, h: villageHeight(d) });
  }
  return out.sort((a, b) => a.d - b.d);
}

// #36: a circle of radius r against a building footprint ring (either winding). null when it is clear; else the unit push
// (wx, wz) out of the footprint and the overlap pen: r - d from outside, r + d from inside, r with the centre on the wall
export function ringPush(ring, x, z, r) {
  let best = Infinity, px = 0, pz = 0, ex = 0, ez = 0, inside = false, area = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % n], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    area += ax * bz - bx * az;
    if ((az > z) !== (bz > z) && x < ax + (z - az) * dx / dz) inside = !inside;
    const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0, cx = ax + dx * t, cz = az + dz * t, d2 = (x - cx) ** 2 + (z - cz) ** 2;
    if (d2 < best) { best = d2; px = cx; pz = cz; ex = dx; ez = dz; }
  }
  const d = Math.sqrt(best);
  if (!inside && d > r) return null;
  if (d < 1e-6) { const L = Math.hypot(ex, ez) || 1, sg = area > 0 ? 1 : -1; return { wx: sg * ez / L, wz: -sg * ex / L, pen: r }; }   // centre on the wall: its outward normal
  const k = inside ? -1 / d : 1 / d;
  return { wx: (x - px) * k, wz: (z - pz) * k, pen: inside ? r + d : r - d };
}

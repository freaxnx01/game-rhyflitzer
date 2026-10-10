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
  const roads = w.roads.map(r => ({ ...r, tex: r.trail ? 'gravel' : r.cls === 'motorway' || r.cls === 'motorway_link' ? 'motorway' : 'road' }));
  return { roads, bridges: roads.filter(r => r.bridge), junctions: w.junctions, water: w.water, buildings: w.buildings,
           rail: w.rail, railBridges: w.railBridges || [], props: w.props || [], parking: w.parking || [], streams: w.streams || [], boundaries: w.boundaries || [], forests: w.forests || [], anchors: w.anchors, bbox: w.bbox, sdf: w.waterSdf, sources: w.sources || [], origin: w.origin || null };
}

export function bridgeDeckAt(b, t) { const u = Math.max(0, Math.min(1, t / (b.len || 1))); return b.h0 + (b.h1 - b.h0) * u; }
// Surface sits up to 0.3 m above the deck, fading in over the first/last 5 m so the bridge meets the terrain at both ends; an end
// flagged fade0/fade1 === false is a joint with the next piece of a chain (#78) and keeps the full offset.
export function bridgeDeckOffset(b, t) { const a = b.fade0 === false ? Infinity : t, e = b.fade1 === false ? Infinity : b.len - t; return 0.3 * Math.max(0, Math.min(1, Math.min(a, e) / 5)); }
export function bridgeSurfaceAt(b, t) { return bridgeDeckAt(b, t) + bridgeDeckOffset(b, t); }

// #76: railway bridges over roads. The road dips into a cut so the deck's underside (surface - deck) clears it by `clear` m;
// the cut ramps out along the road at `grade`, never deeper than `maxDepth`. #119: `wall` m thick stone walls retain the
// ground beside it instead of grass banks, their face `margin` m out from the road edge.
// #120: side roads joining inside a cut descend with it on arms ramping at sideGrade (the same street going on: grade).
export const UNDERPASS = { clear: 4.5, deck: 1.2, lift: 0.04, grade: 0.08, sideGrade: 0.12, margin: 1, wall: 2, maxDepth: 6, apron: 3, runout: 0.25 };

export function pointAtLength(pts, t) {
  let acc = 0;
  if (t <= 0) return pts[0].slice();
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    if (acc + L >= t) { const u = L ? (t - acc) / L : 0; return [ax + (bx - ax) * u, az + (bz - az) * u]; }
    acc += L;
  }
  return pts[pts.length - 1].slice();
}

function segmentHit(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz, den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = cx - ax, qz = cz - az, u = (qx * sz - qz * sx) / den, v = (qx * rz - qz * rx) / den;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? { u, v, sin: Math.abs(den) / (Math.hypot(rx, rz) * Math.hypot(sx, sz)) } : null;
}

export function railRoadCrossings(roads, railBridges) {
  const out = [];
  railBridges.forEach((rb, bridge) => {
    for (const road of roads) {
      if (road.bridge || (road.layer ?? 0) >= rb.layer) continue;
      let ta = 0;
      for (let i = 0; i < road.pts.length - 1; i++) {
        const [ax, az] = road.pts[i], [bx, bz] = road.pts[i + 1], la = Math.hypot(bx - ax, bz - az);
        let tb = 0;
        for (let j = 0; j < rb.pts.length - 1; j++) {
          const [cx, cz] = rb.pts[j], [dx, dz] = rb.pts[j + 1], lb = Math.hypot(dx - cx, dz - cz), h = segmentHit(ax, az, bx, bz, cx, cz, dx, dz);
          if (h) out.push({ road, bridge, x: ax + (bx - ax) * h.u, z: az + (bz - az) * h.u, tRoad: ta + la * h.u, tRail: tb + lb * h.v, sin: h.sin });
          tb += lb;
        }
        ta += la;
      }
    }
  });
  return out;
}

export function cutFlat(deckHalfWidth, sin, u = UNDERPASS) { return deckHalfWidth / Math.max(0.3, sin) + u.apron; }

// #119: a cut is an absolute floor along its road, level across the corridor: f0 under the deck band, ramping out at
// u.grade until it meets the ground. The road ribbon lies u.lift above the floor.
export function cutFloorTarget(deckMin, ground, u = UNDERPASS) { return Math.max(deckMin - u.deck - u.clear - u.lift, ground - u.maxDepth); }
// #120: the points the network cannot descend through (dead ends, bridge joins, arms out of budget) keep their ground:
// f0 >= ground - rise, rise = how far the floor climbs from the crossing to that point along the network
export function capFloor(f0, caps) {
  let out = { f0, capped: null };
  for (const p of caps) { const f = p.ground - p.rise; if (f > out.f0) out = { f0: f, capped: p }; }
  return out;
}
// #120, review of #156: reach -> network -> cap until no cap lifts the floor any more. A cap only ever raises f0, so the last
// one applied is the shallowest floor seen: if the floor has still not settled after `tries` lifts, the cut keeps that floor
// (never the deeper one a cap rejected), rebuilds its arms from it and is flagged `unsettled` for the build to report.
export function settleCut(cut, network, tries = 8) {
  cut.unsettled = false;
  for (let k = 0; ; k++) {
    const net = network(cut), cap = capFloor(cut.f0, net.caps);
    cut.arms = net.arms;
    if (!cap.capped) return cut;
    cut.f0 = cap.f0; cut.capped = cap.capped;
    if (k === tries) { cut.arms = network(cut).arms; cut.unsettled = true; return cut; }
  }
}
export function cutFloor(c, s, u = UNDERPASS) { return c.f0 + (c.grade ?? u.grade) * Math.max(0, Math.abs(s) - c.flat); }
// #120: per side of the anchor t, how far a cut or arm reaches and why it stops: the floor meets the ground ('ground', first
// whole metre), its road piece ends first ('end'), or it is still below the ground after flat + maxDepth / grade ('budget')
export function armReach(a, groundAt, len, u = UNDERPASS) {
  const max = a.flat + u.maxDepth / (a.grade ?? u.grade);
  return [-1, 1].map((dir) => {
    const room = Math.max(0, dir < 0 ? a.t : len - a.t);   // #156: an anchor on a piece end can land a hair past it
    for (let s = 0; s <= Math.min(room, max); s++) if (cutFloor(a, s, u) >= groundAt(dir * s) - 1e-9) return { s, why: 'ground' };
    return room <= max ? { s: room, why: 'end' } : { s: max, why: 'budget' };
  });
}
// #120: the nodes along a cut or arm inside its reach -- junction points on its road and the piece ends it reaches, never its
// own anchor; s is signed from the anchor; one node per 0.5 m (a piece end on a junction is one node, an end)
export function armNodes(a, junctions, len) {
  const out = [], add = (x, z, s, end) => {
    if (Math.abs(s) <= 0.5 || s < -a.reach[0] - 1e-9 || s > a.reach[1] + 1e-9 || out.some((o) => Math.hypot(o.x - x, o.z - z) < 0.5)) return;
    out.push({ x, z, s, end });
  };
  add(...a.pts[0], -a.t, true); add(...a.pts[a.pts.length - 1], len - a.t, true);
  for (const [jx, jz] of junctions) { const n = nearestOnPolyline(a.pts, jx, jz); if (n.d < a.hw + 2) add(jx, jz, n.t - a.t, false); }
  return out;
}
const sameStreet = (a, b) => a.id === b.id || (!!a.n && a.n === b.n);
// #156: how long a side road starting at t on `pts` stays in the corridor of the cut or arm `a` it leaves, and the floor of `a`
// where it gets out. Leaving square-on that is the corridor's half-width at the junction's own floor; leaving at a slant it is
// longer, and `a`'s floor climbs under it meanwhile, so the side road waits level at the floor where it gets out -- held at the
// junction's floor it would sink below `a`'s road and step across its carriageway where its own corridor ends.
function leaveCorridor(a, pts, t, floor, u) {
  const half = a.hw + u.margin + u.wall / 2, len = polylineLength(pts);
  const inside = (s) => { const [x, z] = pointAtLength(pts, t + s); return cutFloorAt(a, x, z, u) !== null; };
  let best = { flat: half, f0: floor };
  for (const dir of [-1, 1]) {
    const room = dir < 0 ? t : len - t;
    let s = 0;
    while (s + 0.25 <= room && inside(dir * (s + 0.25))) s += 0.25;
    if (s + 0.25 <= room) for (let lo = s, hi = s + 0.25, k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (inside(dir * m)) lo = s = m; else hi = m; }
    if (s <= best.flat + 1e-6) continue;
    const [x, z] = pointAtLength(pts, t + dir * s);
    best = { flat: s, f0: cutFloorAt(a, x, z, u) };
  }
  return best;
}
// #120: every road piece meeting the cut (or one of its arms) at a node below the ground descends with it: an arm anchored
// there, starting at the floor of the road it leaves and ramping back up at u.grade (same street) or u.sideGrade. Breadth-
// first, each piece once. What cannot take an arm becomes a cap point for capFloor.
export function cutNetwork(cut, roads, junctions, ground, u = UNDERPASS) {
  const arms = [], caps = [], used = new Set([cut.road]), queue = [{ a: cut, rise0: 0 }];
  while (queue.length) {
    const { a, rise0 } = queue.shift();
    for (const nd of armNodes(a, junctions, polylineLength(a.pts))) {
      const floor = cutFloor(a, nd.s, u), g = ground(nd.x, nd.z), rise = rise0 + floor - a.f0;
      if (floor >= g - 0.05) continue;
      const touch = roads.filter((o) => o !== a.road && nearestOnPolyline(o.pts, nd.x, nd.z).d < 0.6), open = touch.filter((o) => !o.bridge && (o.layer ?? 0) === 0);
      if (open.length < touch.length) caps.push({ x: nd.x, z: nd.z, rise, ground: g, kind: 'bridge' });
      else if (nd.end && !open.length) caps.push({ x: nd.x, z: nd.z, rise, ground: g, kind: 'dead' });
      for (const o of open) {
        if (used.has(o)) continue;
        used.add(o);
        // a side road crosses the trough it leaves before it can ramp, so it stays level over that corridor (else the floor
        // steps up by grade * corridor where the parent's corridor ends); the same street going on has no trough to cross
        const on = sameStreet(o, a.road), t = nearestOnPolyline(o.pts, nd.x, nd.z).t, lev = on ? { flat: 0, f0: floor } : leaveCorridor(a, o.pts, t, floor, u);
        const arm = { pts: o.pts, road: o, t, hw: o.w / 2, flat: lev.flat, f0: lev.f0, grade: on ? u.grade : u.sideGrade, x: nd.x, z: nd.z };
        const r = armReach(arm, (s) => ground(...pointAtLength(o.pts, t + s)), polylineLength(o.pts), u);
        arm.reach = r.map((p) => p.s); arm.stop = r.map((p) => p.why);
        // an arm that runs out of budget on a road climbing steeper than its grade ends there, below the ground (capping it
        // instead lifts the floor above the deck's underside and loses the underpass); from there its floor runs out to the
        // ground, losing the depth d left at the end over d / u.runout m, so the road has no step (review of #156)
        arm.out = r.map((p, k) => {
          const s = k ? p.s : -p.s, d = p.why === 'budget' ? ground(...pointAtLength(o.pts, t + s)) - cutFloor(arm, s, u) : 0;
          return d > 0 ? { d, len: d / u.runout } : null;
        });
        arms.push(arm); queue.push({ a: arm, rise0: rise });
      }
    }
  }
  return { arms, caps };
}
// the floor at (x, z), or null outside the corridor and the reach; past an end with a run-out (`out`, see cutNetwork) it rises
// from the floor there to `ground` on the centre line, linearly in the depth left
export function cutFloorAt(c, x, z, u = UNDERPASS, ground = null) {
  const n = nearestOnPolyline(c.pts, x, z), s = n.t - c.t, k = s < 0 ? 0 : 1, past = Math.abs(s) - c.reach[k];
  if (n.d > (c.lat ?? c.hw + u.margin + u.wall / 2)) return null;   // #156: lat, if set, keeps the patch bleed behind the wall
  const b = c.roundEnds ? 0 : beyondEnd(c.pts, x, z, n.t);     // roundEnds (the hideout's cuts): the corridor runs on as a level disc
  if (b !== 0 && Math.abs(s) < 1e-9) return null;                 // behind an anchor at the road end: the road it leaves covers that
  if (past <= 0) return cutFloor(c, s + b, u);
  const o = c.out?.[k];
  if (!o || !ground || past > o.len) return null;
  return ground(...pointAtLength(c.pts, n.t)) - o.d * (1 - past / o.len);
}
// #156: how far (x, z) lies past the polyline's end along its last segment (+), or behind its start along the first (-), when
// the nearest road point t is that end; else 0
function beyondEnd(pts, x, z, t) {
  const last = pts.length - 1, atStart = t <= 1e-9, atEnd = !atStart && t >= polylineLength(pts) - 1e-9;
  if (!atStart && !atEnd) return 0;
  const [ax, az] = atStart ? pts[1] : pts[last - 1], [bx, bz] = atStart ? pts[0] : pts[last], L = Math.hypot(bx - ax, bz - az) || 1;
  const ext = Math.max(0, ((x - bx) * (bx - ax) + (z - bz) * (bz - az)) / L);
  return atStart ? -ext : ext;
}
// PR #156, option (a): (x, z) lies in a shared trough when its two nearest road corridors face each other across it (the
// directions to their nearest points within 30 deg of opposite) and their edges there are less than margin + wall + margin
// apart. No wall fits between them without standing in one of the corridors, so the two roads share one trough with no bank
// between them to retain (the Bahndammstrasse and the service road beside it). A junction corner is not one: its roads meet.
export function sharedTrough(x, z, roads, u = UNDERPASS) {
  const near = roads.map((r) => { const n = nearestOnPolyline(r.pts, x, z), [px, pz] = pointAtLength(r.pts, n.t); return { d: n.d, e: n.d - r.w / 2, hw: r.w / 2, px, pz }; }).sort((p, q) => p.e - q.e);
  if (near.length < 2 || near[0].d < 1e-9 || near[1].d < 1e-9) return false;
  const [a, b] = near, facing = ((a.px - x) * (b.px - x) + (a.pz - z) * (b.pz - z)) / (a.d * b.d) <= -Math.cos(Math.PI / 6);
  return facing && Math.hypot(a.px - b.px, a.pz - b.pz) - a.hw - b.hw < u.margin + u.wall + u.margin;
}
// the part of its road a cut or arm lowers, run-outs included: [t0, t1]
export function armSpan(c) { return [c.t - c.reach[0] - (c.out?.[0]?.len ?? 0), c.t + c.reach[1] + (c.out?.[1]?.len ?? 0)]; }
export function cutBounds(c, u = UNDERPASS) {
  const [a, b] = armSpan(c), pad = c.hw + u.margin + u.wall + 1, n = Math.max(1, Math.ceil(b - a));
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let k = 0; k <= n; k++) { const [x, z] = pointAtLength(c.pts, a + (b - a) * k / n); x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  return [x0 - pad, z0 - pad, x1 + pad, z1 + pad];
}

export function mergeIntervals(iv) {
  const out = [];
  for (const [a, b] of [...iv].sort((p, q) => p[0] - q[0])) { const last = out[out.length - 1]; if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]); }
  return out;
}
// #119: wall pieces along a road over the (merged) spans, `offset` m to each side; (nx, nz) points away from the road.
// #156: each piece is the chord of the wall line itself (both ends offset along the road's normal there, as wallSpans tests
// them), so on the outside of a bend the pieces still meet; where the wall line folds back on the inside of a tight bend the
// piece keeps the road's chord, moved out.
export function wallStations(pts, intervals, offset, step, sides = [-1, 1]) {
  const out = [];
  for (const [a, b] of mergeIntervals(intervals)) {
    const n = Math.max(1, Math.round((b - a) / step)), len = (b - a) / n;
    for (let k = 0; k < n; k++) {
      const t = a + (k + 0.5) * len, [x0, z0] = pointAlong(pts, t - len / 2), [x1, z1] = pointAlong(pts, t + len / 2), rot = Math.atan2(z1 - z0, x1 - x0);
      for (const side of sides) {
        const [ax, az] = wallPoint(pts, t - len / 2, offset, side), [bx, bz] = wallPoint(pts, t + len / 2, offset, side);
        const along = (bx - ax) * Math.cos(rot) + (bz - az) * Math.sin(rot) > 1e-6;
        const r = along ? Math.atan2(bz - az, bx - ax) : rot, nx = -Math.sin(r) * side, nz = Math.cos(r) * side;
        out.push(along ? { t, side, len: Math.hypot(bx - ax, bz - az), rot: r, nx, nz, x: (ax + bx) / 2, z: (az + bz) / 2 }
          : { t, side, len, rot, nx, nz, x: (x0 + x1) / 2 + nx * offset, z: (z0 + z1) / 2 + nz * offset });
      }
    }
  }
  return out;
}
// #156: the cap piece for an acute corner, where a wall run stops short of another road's corridor and the run of that road
// stops short of this one. a, b: a point q on each road's centre line, its unit normal n towards the corner, its half width hw.
// The piece lies across the corner's bisector, its centre where its inner face meets both margins, its ends `end` m off both
// edges (the run-end distance); null at 90 deg or more, where the two runs close the corner themselves.
export function cornerPiece(a, b, end, u = UNDERPASS) {
  const cosA = -(a.n[0] * b.n[0] + a.n[1] * b.n[1]), det = a.n[0] * b.n[1] - a.n[1] * b.n[0];
  if (cosA <= 1e-9 || Math.abs(det) < 1e-9) return null;
  const sinH = Math.sqrt((1 - cosA) / 2), cosH = Math.sqrt((1 + cosA) / 2), c = u.margin + u.wall / 2 * sinH, len = 2 * (c - end) / cosH;
  if (len <= 0) return null;
  const ra = a.n[0] * a.q[0] + a.n[1] * a.q[1] + a.hw + c, rb = b.n[0] * b.q[0] + b.n[1] * b.q[1] + b.hw + c;
  const x = (ra * b.n[1] - rb * a.n[1]) / det, z = (a.n[0] * rb - b.n[0] * ra) / det;
  const bx = a.n[0] + b.n[0], bz = a.n[1] + b.n[1], L = Math.hypot(bx, bz), nx = bx / L, nz = bz / L;
  return { x, z, len, rot: Math.atan2(nz, nx) + Math.PI / 2, nx, nz };
}
// the point `offset` m to `side` of the road at t, along the road's normal there (tangent over +-0.1 m, so a vertex gets the mitre)
export function wallPoint(pts, t, offset, side) {
  const [x0, z0] = pointAlong(pts, t - 0.1), [x1, z1] = pointAlong(pts, t + 0.1), rot = Math.atan2(z1 - z0, x1 - x0), [x, z] = pointAlong(pts, t);
  return [x - Math.sin(rot) * side * offset, z + Math.cos(rot) * side * offset];
}
// pointAtLength, but past either end it goes on along the end segment (a wall overhang keeps its normal there)
function pointAlong(pts, t) {
  const len = polylineLength(pts);
  if (t >= 0 && t <= len) return pointAtLength(pts, t);
  const [ax, az] = t < 0 ? pts[0] : pts[pts.length - 1], [bx, bz] = t < 0 ? pts[1] : pts[pts.length - 2], L = Math.hypot(bx - ax, bz - az) || 1, e = t < 0 ? t : len - t;
  return [ax + (bx - ax) / L * e, az + (bz - az) / L * e];
}
// #120: the parts of the spans where the wall centre line (`offset` m to `side`, normal as in wallStations) stays outside
// `blocked` -- another road's corridor -- sampled every 0.25 m, so a run ends at that road's wall face; bits < 0.5 m dropped
export function wallSpans(pts, intervals, offset, side, blocked, overhang = 0) {
  const out = [], len = polylineLength(pts);
  // on the road, or at most `overhang` m past its ends (#156, see pointAlong): past an end pointAtLength clamps and the normal
  // is lost (review of #156)
  for (const [a, b] of mergeIntervals(intervals).map(([a, b]) => [Math.max(-overhang, a), Math.min(len + overhang, b)]).filter(([a, b]) => b - a >= 0.5)) {
    const n = Math.max(1, Math.ceil((b - a) / 0.25)), freeAt = (t) => !blocked(...wallPoint(pts, t, offset, side));
    // #156: between a free and a blocked sample, the last free t to the centimetre
    const edge = (free, blockedT) => { for (let k = 0; k < 6; k++) { const m = (free + blockedT) / 2; if (freeAt(m)) free = m; else blockedT = m; } return free; };
    let start = null, last = null, prev = null;
    for (let k = 0; k <= n; k++) {
      const t = a + (b - a) * k / n, free = freeAt(t);
      if (free) { if (start === null) start = prev === null ? t : edge(t, prev); last = t; }
      if ((!free || k === n) && start !== null) { const end = free ? last : edge(last, t); if (end - start >= 0.5) out.push([start, end]); start = null; }
      prev = t;
    }
  }
  return out;
}

export function patchCells([bx0, bz0, bx1, bz1], G) {
  const cl = (v, n) => Math.max(0, Math.min(n - 1, v)), out = [];
  const i0 = cl(Math.floor((bx0 - G.x0) / G.dx), G.nx), i1 = cl(Math.floor((bx1 - G.x0) / G.dx), G.nx);
  const j0 = cl(Math.floor((bz0 - G.z0) / G.dz), G.nz), j1 = cl(Math.floor((bz1 - G.z0) / G.dz), G.nz);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push([i, j]);
  return out;
}

export function triLerp(ha, hb, hc, hd, u, v) { return u + v <= 1 ? ha + (hd - ha) * u + (hb - ha) * v : hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v); }
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

// forests (#13): woods from the world file -> an 8 m bit mask, edge segments with inward normals, and seeded trees under a budget.
// mulberry32, the same generator as the page's rnd(); forests get their own seed so the main scatter's sequence stays as it is
export function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function forestIndex(forests, step = 8) {
  if (!forests.length) return { w: 0, h: 0, step, x0: 0, z0: 0, mask: new Uint8Array(0), inside: () => false };
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const f of forests) for (const [x, z] of f.ring) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  const w = Math.ceil((x1 - x0) / step) + 1, h = Math.ceil((z1 - z0) / step) + 1, mask = new Uint8Array(w * h);
  for (const f of forests) {                       // even-odd scanline fill of ring + holes at the grid nodes, OR-ed into the mask
    const rings = [f.ring, ...(f.holes || [])];
    let j0 = Infinity, j1 = -Infinity; for (const [, z] of f.ring) { j0 = Math.min(j0, z); j1 = Math.max(j1, z); }
    for (let j = Math.max(0, Math.ceil((j0 - z0) / step)); j <= Math.min(h - 1, Math.floor((j1 - z0) / step)); j++) {
      const z = z0 + j * step, xs = [];
      for (const r of rings) for (let i = 0, k = r.length - 1; i < r.length; k = i++) { const [xi, zi] = r[i], [xk, zk] = r[k]; if ((zi > z) !== (zk > z)) xs.push(xi + (z - zi) * (xk - xi) / (zk - zi)); }
      xs.sort((a, b) => a - b);
      for (let n = 0; n + 1 < xs.length; n += 2) { const ia = Math.max(0, Math.ceil((xs[n] - x0) / step)), ib = Math.min(w - 1, Math.floor((xs[n + 1] - x0) / step)); for (let i = ia; i <= ib; i++) mask[j * w + i] = 1; }
    }
  }
  return { w, h, step, x0, z0, mask, inside(x, z) { const i = Math.round((x - x0) / step), j = Math.round((z - z0) / step); return i >= 0 && j >= 0 && i < w && j < h && mask[j * w + i] === 1; } };
}

export function forestEdges(forests, index, maxLen = 48) {
  const out = [], s = index.step;
  for (const f of forests) for (const ring of [f.ring, ...(f.holes || [])]) for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
    const [ax, az] = ring[k], [bx, bz] = ring[i], full = Math.hypot(bx - ax, bz - az); if (full < 0.5) continue;
    const n = Math.ceil(full / maxLen), len = full / n, ux = (bx - ax) / full, uz = (bz - az) / full, px = -uz, pz = ux;
    for (let q = 0; q < n; q++) {
      const x0 = ax + ux * len * q, z0 = az + uz * len * q, x1 = x0 + ux * len, z1 = z0 + uz * len, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      let side = 0;
      for (const d of [0.75 * s, 1.5 * s]) { if (index.inside(mx + px * d, mz + pz * d)) { side = 1; break; } if (index.inside(mx - px * d, mz - pz * d)) { side = -1; break; } }
      out.push({ x0, z0, x1, z1, mx, mz, len, rot: Math.atan2(z1 - z0, x1 - x0), nx: px * side, nz: pz * side });
    }
  }
  return out;
}

export const FOREST_BUDGET = { edgeStep: 6, fillArea: 600, cap: 70000, edgeH: [7, 12], fillH: [8, 14], tile: 512 };
export function forestTrees(forests, index, edges, rnd, budget = FOREST_BUDGET) {
  const edge = [], fill = [], rr = ([a, b]) => a + rnd() * (b - a);
  for (const e of edges) {
    const n = Math.max(1, Math.round(e.len / budget.edgeStep)), ux = (e.x1 - e.x0) / e.len, uz = (e.z1 - e.z0) / e.len;
    for (let k = 0; k < n; k++) {
      const t = ((k + 0.5) / n + (rnd() - 0.5) * 0.5 / n) * e.len, d = 0.5 + rnd() * 2.5;
      edge.push([e.x0 + ux * t + e.nx * d, e.z0 + uz * t + e.nz * d, rr(budget.edgeH)]);
    }
  }
  const g = Math.sqrt(budget.fillArea);
  for (let z = index.z0; z <= index.z0 + index.h * index.step; z += g) for (let x = index.x0; x <= index.x0 + index.w * index.step; x += g) {
    const px = x + (rnd() - 0.5) * g, pz = z + (rnd() - 0.5) * g, h = rr(budget.fillH);
    if (index.inside(px, pz)) fill.push([px, pz, h]);
  }
  const keep = Math.max(0, Math.min(fill.length, budget.cap - edge.length));
  const kept = keep === fill.length ? fill : fill.filter((_, i) => Math.floor((i + 1) * keep / fill.length) > Math.floor(i * keep / fill.length));
  return { edge, fill: kept, thinned: fill.length - kept.length };
}

export function tileKey(x, z, size) { return Math.floor(x / size) + ',' + Math.floor(z / size); }

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
// #127: Ehrendingen's village names, place nodes converted with geo.Frame(*EHRENDINGEN_ORIGIN).to_game on 2026-10-09
export const VILLAGES_EHRENDINGEN = [
  { t: 'UNTEREHRENDINGEN', x: 377.2, z: -995.5, r: 450 },   // node 102311519
  { t: 'OBEREHRENDINGEN', x: 26.2, z: 127.2, r: 450 },      // node 102311797
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

// #73: the national border runs in the Rhine. It is every #48 Gemeinde line between one German Gemeinde (BORDER_DE, the
// admin_level=8 relations with a de:amtlicher_gemeindeschluessel) and a Swiss one, joined into one polyline. Names from the
// other bank are hidden, except within VILLAGE_BANK_FADE metres of the border (on the river and its bridges).
export const BORDER_DE = ['Bad Säckingen', 'Murg'];
export const VILLAGE_BANK_FADE = 150;
function joinPiece(chain, p, same) {
  if (same(chain.at(-1), p[0])) return chain.concat(p.slice(1));
  if (same(chain.at(-1), p.at(-1))) return chain.concat(p.slice(0, -1).reverse());
  if (same(chain[0], p.at(-1))) return p.slice(0, -1).concat(chain);
  return p.slice(1).reverse().concat(chain);
}
// One polyline from the CH/DE border lines, or null when there are none or they don't join end to end.
export function nationalBorder(boundaries, de = BORDER_DE, tol = 1) {
  const pieces = boundaries.filter(b => b.names.length === 2 && b.names.filter(n => de.includes(n)).length === 1).map(b => b.pts);
  if (!pieces.length) return null;
  const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;
  let chain = pieces.shift().slice();
  while (pieces.length) {
    const i = pieces.findIndex(p => [p[0], p.at(-1)].some(e => same(chain[0], e) || same(chain.at(-1), e)));
    if (i < 0) return null;
    chain = joinPiece(chain, pieces.splice(i, 1)[0], same);
  }
  return chain;
}
function crossZ(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
function segmentsCross(a, b, c, d) { return (crossZ(c, d, a) > 0) !== (crossZ(c, d, b) > 0) && (crossZ(a, b, c) > 0) !== (crossZ(a, b, d) > 0); }
// The border splits the world in two (it ends on the world edge): an even number of crossings means the same bank.
export function sameBank(border, ax, az, bx, bz) {
  if (!border) return true;
  let crossings = 0;
  for (let i = 0; i < border.length - 1; i++) if (segmentsCross([ax, az], [bx, bz], border[i], border[i + 1])) crossings++;
  return crossings % 2 === 0;
}
export function bankFade(border, x, z, w = VILLAGE_BANK_FADE) {
  if (!border) return 1;
  return Math.max(0, 1 - nearestOnPolyline(border, x, z).d / w);
}
// Inside any village every name is hidden; it comes back over f.in metres as the car leaves the village.
export function villageQuiet(villages, x, z, f = VILLAGE_FADE) {
  let quiet = 1;
  for (const v of villages) quiet = Math.min(quiet, Math.max(0, (Math.hypot(v.x - x, v.z - z) - v.r) / f.in));
  return quiet;
}
export function villageNames(villages, x, z, border = null) {
  const quiet = villageQuiet(villages, x, z), across = bankFade(border, x, z);
  return villageLabels(villages, x, z)
    .map(l => ({ ...l, opacity: Math.min(l.opacity, quiet, sameBank(border, x, z, l.x, l.z) ? 1 : across) }))
    .filter(l => l.opacity > 0);
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

// #131: trees are solid at the trunk, not the crown -- one circle per tree, in the shape collide() already reads
// (circle, like the Smile-Kreisel island); hw/hd = r so the coarse bounds, heliFloor and the camera box test work as is.
// Billboard trunks are ~0.04 h wide in radius, the cone style's ~0.14 h: one value in between for both styles.
export const TREE_TRUNK = 0.06;
export function treeTrunkR(h) { return TREE_TRUNK * h; }
export function treeCollider(x, z, h, base) { const r = treeTrunkR(h); return { x, z, hw: r, hd: r, c: 1, s: 0, h: base + h, circle: r, low: true }; }

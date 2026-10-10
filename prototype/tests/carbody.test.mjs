import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPACT, FILLET, fillet, crossSection, loftBody, bodyBox, WHEEL_PROFILE, SPOKES, spokeBars, ARCH, archRadius } from '../carbody.js';

const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);

test('COMPACT: stations rise in x, tumblehome everywhere, flags on every span', () => {
  const st = COMPACT.stations;
  assert.ok(st.length >= 8);
  for (let i = 1; i < st.length; i++) assert.ok(st[i].x > st[i - 1].x, `x rises at ${i}`);
  for (const s of st) { assert.ok(s.floor < s.belt && s.belt < s.roof, `heights at x=${s.x}`); assert.ok(s.wRoof < s.wBelt && s.wBelt <= s.wSill, `tumblehome at x=${s.x}`); }
  for (let i = 0; i < st.length - 1; i++) assert.ok(typeof st[i].span.top === 'boolean' && typeof st[i].span.side === 'boolean', `span flags at ${i}`);
  assert.ok(st.some(s => s.span?.top) && st.some(s => s.span?.side), 'some glass');
  close(st[0].x, -2.33, 1e-9); close(st[st.length - 1].x, 2.33, 1e-9);
  close(Math.max(...st.map(s => s.roof)), 1.55, 1e-9); close(Math.max(...st.map(s => s.wSill)), 0.90, 1e-9);
});

test('fillet: a right-angle corner becomes a quarter arc tangent to both legs', () => {
  const pts = fillet([0, 2], [0, 0], [2, 0], 0.5, 4);
  assert.equal(pts.length, 5);
  close(pts[0][0], 0, 1e-9); close(pts[0][1], 0.5, 1e-9);
  close(pts[4][0], 0.5, 1e-9); close(pts[4][1], 0, 1e-9);
  for (const p of pts) close(Math.hypot(p[0] - 0.5, p[1] - 0.5), 0.5, 1e-9, 'on the arc');
});

test('fillet: the tangent length is clamped to 45 % of the shorter leg', () => {
  const pts = fillet([0, 0.1], [0, 0], [1, 0], 0.5, 4);
  close(pts[0][1], 0.045, 1e-9); close(pts[4][0], 0.045, 1e-9);
});

test('crossSection: same point count for every station, from the floor centre to the roof centre, z >= 0, band index fixed', () => {
  const sections = COMPACT.stations.map(s => crossSection(s));
  const m = sections[0].pts.length;
  assert.equal(m, 2 + 3 * (FILLET.n + 1));
  for (const { pts, band } of sections) {
    assert.equal(pts.length, m); assert.equal(band, 2 * FILLET.n + 2);
    close(pts[0][1], 0, 1e-9); close(pts[m - 1][1], 0, 1e-9);
    for (const p of pts) assert.ok(p[1] >= -1e-9, 'right half');
  }
  const mid = crossSection(COMPACT.stations[4]);
  close(mid.pts[0][0], 0.30, 1e-9, 'floor'); close(mid.pts[m - 1][0], 1.55, 1e-9, 'roof');
  assert.ok(Math.max(...mid.pts.map(p => p[1])) <= 0.90 + 1e-9, 'never wider than the sill');
});

test('loftBody: closed, symmetric in z, two index groups, uv in [0, 1], v markers', () => {
  const L = loftBody(COMPACT);
  const n = L.positions.length / 3;
  assert.equal(L.uvs.length, n * 2);
  assert.equal(L.bodyIndices.length % 3, 0); assert.equal(L.glassIndices.length % 3, 0);
  assert.ok(L.glassIndices.length > 0 && L.bodyIndices.length > L.glassIndices.length);
  // watertight by position: the ring repeats its first point as its last (the uv seam), so merge vertices that coincide
  const canon = new Map(), id = new Array(n);
  for (let i = 0; i < n; i++) { const k = [0, 1, 2].map(j => L.positions[3 * i + j].toFixed(6)).join(','); if (!canon.has(k)) canon.set(k, i); id[i] = canon.get(k); }
  const edges = new Map();
  for (const idx of [L.bodyIndices, L.glassIndices]) for (let i = 0; i < idx.length; i += 3) for (const [a, b] of [[idx[i], idx[i + 1]], [idx[i + 1], idx[i + 2]], [idx[i + 2], idx[i]]]) { const p = id[a], q = id[b], k = p < q ? `${p}-${q}` : `${q}-${p}`; edges.set(k, (edges.get(k) ?? 0) + 1); }
  for (const [k, c] of edges) assert.equal(c, 2, `edge ${k} shared by two triangles (watertight)`);
  let sumZ = 0; for (let i = 0; i < n; i++) sumZ += L.positions[3 * i + 2];
  close(sumZ, 0, 1e-6, 'symmetric');
  for (let i = 0; i < L.uvs.length; i++) assert.ok(L.uvs[i] >= -1e-9 && L.uvs[i] <= 1 + 1e-9, 'uv range');
  assert.ok(L.v.sill > 0 && L.v.sill < L.v.belt && L.v.belt < L.v.roof && L.v.roof <= 0.5, JSON.stringify(L.v));
});

test('bodyBox: the loft alone is 4.66 long, 1.80 wide, 1.25 high and sits on y = 0.30', () => {
  const b = bodyBox(COMPACT);
  close(b.l, 4.66, 0.02); close(b.w, 1.80, 0.02); close(b.h, 1.25, 0.02); close(b.minY, 0.30, 1e-9);
});

test('WHEEL_PROFILE: radii within [0, R], tread at R, rim lip at 0.66 R, tyreCount splits the run', () => {
  const R = 0.34, w = 0.24, p = WHEEL_PROFILE(R, w);
  assert.ok(p.points.length > p.tyreCount && p.tyreCount >= 4);
  for (const [r, y] of p.points) { assert.ok(r >= 0 && r <= R + 1e-9, `r ${r}`); assert.ok(Math.abs(y) <= w / 2 + 1e-9, `y ${y}`); }
  assert.ok(p.points.some(([r]) => Math.abs(r - R) < 1e-9), 'tread');
  close(p.points[p.tyreCount - 1][0], 0.66 * R, 1e-9, 'rim lip');
  close(p.points[p.points.length - 1][0], 0, 1e-9, 'closes at the axis');
});

test('spokeBars: five bars 72 degrees apart from the hub to the rim lip', () => {
  const bars = spokeBars(0.34);
  assert.equal(bars.length, SPOKES); assert.equal(SPOKES, 5);
  for (let i = 0; i < bars.length; i++) { close(bars[i].angle, i * 2 * Math.PI / 5, 1e-9); close(bars[i].r0, 0.22 * 0.34, 1e-9); close(bars[i].r1, 0.66 * 0.34, 1e-9); assert.ok(bars[i].width > 0 && bars[i].thick > 0); }
});

test('archRadius: the wheel plus the gap', () => {
  close(archRadius(0.34), 0.34 + ARCH.gap, 1e-12); assert.ok(ARCH.lip > 0 && ARCH.gap > ARCH.lip);
});

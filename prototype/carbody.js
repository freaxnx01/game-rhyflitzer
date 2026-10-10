// #164: the compact's body as a loft of cross-sections, the wheel lathe profile and the rim spokes -- pure (no three.js, no DOM).
// Model metres: x forward, y up, z right. The builder in index.html turns the arrays into BufferGeometry.
// Unit-tested with `node --test prototype/tests/*.test.mjs`.

// one station per x: floor / belt (shoulder, where the glass starts) / roof heights and the half-widths at sill, belt and roof
// (wRoof < wBelt <= wSill: tumblehome). span = the material of the stretch from this station to the next: top (windscreen, rear
// window) and side (door glass) are glass, everything else is paint. The last station has no span.
export const COMPACT = {
  stations: [
    { x: -2.33, floor: 0.42, belt: 0.86, roof: 1.00, wSill: 0.76, wBelt: 0.76, wRoof: 0.58, span: { top: false, side: false } },
    { x: -2.15, floor: 0.33, belt: 0.94, roof: 1.10, wSill: 0.86, wBelt: 0.86, wRoof: 0.70, span: { top: true, side: false } },
    { x: -1.80, floor: 0.30, belt: 0.96, roof: 1.36, wSill: 0.90, wBelt: 0.87, wRoof: 0.70, span: { top: true, side: true } },
    { x: -1.35, floor: 0.30, belt: 0.96, roof: 1.50, wSill: 0.90, wBelt: 0.87, wRoof: 0.68, span: { top: false, side: true } },
    { x: -0.90, floor: 0.30, belt: 0.96, roof: 1.55, wSill: 0.90, wBelt: 0.87, wRoof: 0.66, span: { top: false, side: true } },
    { x: 0.15, floor: 0.30, belt: 0.96, roof: 1.55, wSill: 0.90, wBelt: 0.87, wRoof: 0.66, span: { top: true, side: true } },
    { x: 0.85, floor: 0.30, belt: 0.98, roof: 1.16, wSill: 0.90, wBelt: 0.87, wRoof: 0.78, span: { top: false, side: false } },
    { x: 1.40, floor: 0.30, belt: 0.98, roof: 1.04, wSill: 0.90, wBelt: 0.87, wRoof: 0.80, span: { top: false, side: false } },
    { x: 2.00, floor: 0.33, belt: 0.92, roof: 1.00, wSill: 0.88, wBelt: 0.86, wRoof: 0.76, span: { top: false, side: false } },
    { x: 2.33, floor: 0.42, belt: 0.82, roof: 0.90, wSill: 0.78, wBelt: 0.78, wRoof: 0.60 },
  ],
};

// corner radii (floor edge, shoulder, roof edge) and the arc subdivision
export const FILLET = { floor: 0.08, shoulder: 0.06, roof: 0.10, n: 4 };

// replace corner b of the polyline a-b-c by an arc of radius r tangent to both legs: n + 1 points from the a-leg to the c-leg.
// The tangent length is clamped to 45 % of the shorter leg so short legs never fold over.
export function fillet(a, b, c, r, n) {
  const u1 = [a[0] - b[0], a[1] - b[1]], u2 = [c[0] - b[0], c[1] - b[1]];
  const l1 = Math.hypot(...u1), l2 = Math.hypot(...u2);
  u1[0] /= l1; u1[1] /= l1; u2[0] /= l2; u2[1] /= l2;
  const theta = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
  const t = Math.min(r / Math.tan(theta / 2), 0.45 * Math.min(l1, l2)), rr = t * Math.tan(theta / 2);
  const p1 = [b[0] + u1[0] * t, b[1] + u1[1] * t], p2 = [b[0] + u2[0] * t, b[1] + u2[1] * t];
  const bis = [u1[0] + u2[0], u1[1] + u2[1]], bl = Math.hypot(...bis);
  const centre = [b[0] + bis[0] / bl * rr / Math.sin(theta / 2), b[1] + bis[1] / bl * rr / Math.sin(theta / 2)];
  const a1 = Math.atan2(p1[1] - centre[1], p1[0] - centre[0]);
  let da = Math.atan2(p2[1] - centre[1], p2[0] - centre[0]) - a1;
  if (da > Math.PI) da -= 2 * Math.PI;
  if (da < -Math.PI) da += 2 * Math.PI;
  const out = [];
  for (let i = 0; i <= n; i++) { const ang = a1 + da * i / n; out.push([centre[0] + rr * Math.cos(ang), centre[1] + rr * Math.sin(ang)]); }
  return out;
}

// the right half of one station's ring, [y, z] from the floor centre up the side to the roof centre:
// floor corner, side, shoulder, the glass band (one straight segment, index `band`), roof corner.
export function crossSection(st, f = FILLET) {
  const A = [st.floor, 0], B = [st.floor, st.wSill], C = [st.belt, st.wBelt], D = [st.roof, st.wRoof], E = [st.roof, 0];
  const pts = [A, ...fillet(A, B, C, f.floor, f.n), ...fillet(B, C, D, f.shoulder, f.n), ...fillet(C, D, E, f.roof, f.n), E];
  return { pts, band: 2 * f.n + 2 };
}

// full ring (closed: the last point repeats the first) from the right half: right side up, left side mirrored back down
function ring(st, f) {
  const { pts, band } = crossSection(st, f), m = pts.length, out = [];
  for (const [y, z] of pts) out.push([y, z]);
  for (let i = m - 2; i >= 1; i--) out.push([pts[i][0], -pts[i][1]]);
  out.push([pts[0][0], pts[0][1]]);
  return { ring: out, m, band };
}

// segment s of the ring: 'lower' (paint), 'band' (door glass when the span says so) or 'top' (windscreen / roof / rear window)
function segmentKind(s, m, band) {
  const j = s < m - 1 ? s : 2 * m - 3 - s;
  return j < band ? 'lower' : j === band ? 'band' : 'top';
}

// positions / uvs as flat arrays, triangle indices split into the paint group and the glass group, plus the v of the
// floor corner, the belt and the roof on the right side (the body texture is drawn in this uv space; left side = 1 - v)
export function loftBody(def, f = FILLET) {
  const st = def.stations, rings = st.map(s => ring(s, f)), m = rings[0].m, band = rings[0].band, R = rings[0].ring.length;
  const xMin = st[0].x, L = st[st.length - 1].x - xMin;
  const positions = [], uvs = [], bodyIndices = [], glassIndices = [];
  for (let i = 0; i < st.length; i++) for (let k = 0; k < R; k++) { const [y, z] = rings[i].ring[k]; positions.push(st[i].x, y, z); uvs.push((st[i].x - xMin) / L, k / (R - 1)); }
  for (let i = 0; i < st.length - 1; i++) {
    const span = st[i].span;
    for (let k = 0; k < R - 1; k++) {
      const kind = segmentKind(k, m, band), glass = (kind === 'band' && span.side) || (kind === 'top' && span.top);
      const a = i * R + k, b = a + 1, c = a + R, d = c + 1, idx = glass ? glassIndices : bodyIndices;
      idx.push(a, c, b, b, c, d);
    }
  }
  for (const [i, flip] of [[0, true], [st.length - 1, false]]) {
    const centre = positions.length / 3;
    positions.push(st[i].x, (st[i].floor + st[i].roof) / 2, 0); uvs.push(i === 0 ? 0 : 1, 0.5);
    for (let k = 0; k < R - 1; k++) { const a = i * R + k, b = a + 1; if (flip) bodyIndices.push(centre, a, b); else bodyIndices.push(centre, b, a); }
  }
  const v = { sill: (f.n + 1) / (R - 1), belt: (2 * f.n + 2) / (R - 1), roof: (3 * f.n + 3) / (R - 1) };
  return { positions, uvs, bodyIndices, glassIndices, v };
}

export function bodyBox(def) {
  const st = def.stations;
  return { l: st[st.length - 1].x - st[0].x, w: 2 * Math.max(...st.map(s => s.wSill)), h: Math.max(...st.map(s => s.roof)) - Math.min(...st.map(s => s.floor)), minY: Math.min(...st.map(s => s.floor)) };
}

// lathe points [r, y] for one wheel, y along the axle from the inner face (-w/2) to the outer face (+w/2): tread with rounded
// shoulders, sidewall down to the rim lip at 0.66 R, then the rim dish in to the hub boss and the axis. The first tyreCount
// points are rubber, the rest polished alloy.
export function WHEEL_PROFILE(R, w) {
  const points = [[0.66 * R, -w / 2], [0.94 * R, -w / 2 + 0.015], [R, -0.35 * w], [R, 0.35 * w], [0.94 * R, w / 2 - 0.015], [0.66 * R, w / 2], [0.60 * R, w / 2 - 0.02], [0.30 * R, w / 2 - 0.08], [0.22 * R, w / 2 - 0.05], [0, w / 2 - 0.05]];
  return { points, tyreCount: 6 };
}

export const SPOKES = 5;
export function spokeBars(R) {
  return Array.from({ length: SPOKES }, (_, i) => ({ angle: i * 2 * Math.PI / SPOKES, r0: 0.22 * R, r1: 0.66 * R, width: 0.11 * R, thick: 0.025 }));
}

// the dark wheel opening: gap between tyre and arch, and the arch lip's tube radius
export const ARCH = { lip: 0.04, gap: 0.09 };
export const archRadius = (R) => R + ARCH.gap;

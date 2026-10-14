// #169: the editor's geometry. Frames are LV95 rectangles [e0, n0, e1, n1] in metres (EPSG:2056), as the API takes them.
// Pure: no DOM, no Leaflet, so node --test can import it.

export const GRID = 250, MIN_SIDE = 1000, MAX_SIDE = 4000;
export const DEFAULT_RECT = [2667000, 1259750, 2669000, 1261750];   // 2 x 2 km around Ehrendingen

// swisstopo "Approximate formulas for the transformation between Swiss projection coordinates and WGS84" (about 1 m).
export function wgsToLv95(lat, lon) {
  const p = (lat * 3600 - 169028.66) / 1e4, l = (lon * 3600 - 26782.5) / 1e4;
  const E = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3;
  const N = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3;
  return [E, N];
}

export function lv95ToWgs(E, N) {
  const y = (E - 2600000) / 1e6, x = (N - 1200000) / 1e6;
  const l = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y ** 3;
  const p = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x ** 3;
  return [p * 100 / 36, l * 100 / 36];
}

const snap = (v) => Math.round(v / GRID) * GRID;

export function snapRect([a, b, c, d]) {
  return [snap(Math.min(a, c)), snap(Math.min(b, d)), snap(Math.max(a, c)), snap(Math.max(b, d))];
}

const clampSide = (s) => Math.min(MAX_SIDE, Math.max(MIN_SIDE, s));

export function clampRect([e0, n0, e1, n1], fixed) {
  const w = clampSide(e1 - e0), h = clampSide(n1 - n0);
  const east = fixed === 'nw' || fixed === 'sw', south = fixed === 'sw' || fixed === 'se';
  return [east ? e0 : e1 - w, south ? n0 : n1 - h, east ? e0 + w : e1, south ? n0 + h : n1];
}

const OPPOSITE = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' };

// after a corner is dragged past the opposite one the rectangle flips; the corner that stayed still (the dragged
// corner's old opposite) is now a different corner of the re-ordered rect. Return it so clampRect keeps it fixed.
export function fixedCornerAfterResize(rect0, corner, rect) {
  const west = corner === 'nw' || corner === 'sw', north = corner === 'nw' || corner === 'ne';
  const fixedE = west ? rect0[2] : rect0[0], fixedN = north ? rect0[1] : rect0[3];
  const fixedIsWest = fixedE === rect[0] && fixedE !== rect[2], fixedIsEast = fixedE === rect[2] && fixedE !== rect[0];
  const fixedIsSouth = fixedN === rect[1] && fixedN !== rect[3], fixedIsNorth = fixedN === rect[3] && fixedN !== rect[1];
  const [defaultNs, defaultEw] = OPPOSITE[corner];
  const ns = fixedIsNorth ? 'n' : fixedIsSouth ? 's' : defaultNs, ew = fixedIsEast ? 'e' : fixedIsWest ? 'w' : defaultEw;
  return ns + ew;
}

export function moveRect([e0, n0, e1, n1], dE, dN) {
  return [e0 + dE, n0 + dN, e1 + dE, n1 + dN];
}

export function resizeRect([e0, n0, e1, n1], corner, dE, dN) {
  const west = corner === 'nw' || corner === 'sw', north = corner === 'nw' || corner === 'ne';
  return [west ? e0 + dE : e0, north ? n0 : n0 + dN, west ? e1 : e1 + dE, north ? n1 + dN : n1];
}

export const sizeKm = ([e0, n0, e1, n1]) => ({ w: (e1 - e0) / 1000, h: (n1 - n0) / 1000 });
export const centre = ([e0, n0, e1, n1]) => [(e0 + e1) / 2, (n0 + n1) / 2];
export const corners = ([e0, n0, e1, n1]) => [[e0, n1], [e1, n1], [e1, n0], [e0, n0]];   // nw ne se sw
export const formatBbox = (r) => r.map((v) => String(Math.round(v))).join(',');

export function parseBbox(search) {
  const raw = new URLSearchParams(search).get('bbox');
  if (!raw) return null;
  const v = raw.split(',').map(Number);
  if (v.length !== 4 || v.some((x) => !Number.isFinite(x))) return null;
  const r = snapRect(v), { w, h } = sizeKm(r);
  if (w * 1000 < MIN_SIDE || w * 1000 > MAX_SIDE || h * 1000 < MIN_SIDE || h * 1000 > MAX_SIDE) return null;
  if (r[0] < 2400000 || r[2] > 2900000 || r[1] < 1000000 || r[3] > 1400000) return null;   // not even near Switzerland
  return r;
}

// --- rectangle inside the outline (GeoJSON Feature, Polygon or MultiPolygon, LV95 coordinates) ---

function polygons(geojson) {
  const g = geojson.geometry || geojson;
  return g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
}

function inRing([x, y], ring) {   // even-odd rule
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function segmentsCross(p1, p2, q1, q2) {
  const d1 = cross(q1, q2, p1), d2 = cross(q1, q2, p2), d3 = cross(p1, p2, q1), d4 = cross(p1, p2, q2);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

function ringTouchesRect(ring, [e0, n0, e1, n1]) {
  const c = corners([e0, n0, e1, n1]), edges = [[c[0], c[1]], [c[1], c[2]], [c[2], c[3]], [c[3], c[0]]];
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = ring[i];
    if (x > e0 && x < e1 && y > n0 && y < n1) return true;                       // a vertex inside the frame (a hole inside the frame)
    if (i && edges.some(([a, b]) => segmentsCross(ring[i - 1], ring[i], a, b))) return true;
  }
  return false;
}

export function rectInside(rect, geojson) {
  const cs = corners(rect);
  for (const rings of polygons(geojson)) {
    if (!cs.every((c) => inRing(c, rings[0]))) continue;
    if (rings.some((ring) => ringTouchesRect(ring, rect))) return false;
    if (rings.slice(1).some((hole) => cs.some((c) => inRing(c, hole)))) return false;
    return true;
  }
  return false;
}

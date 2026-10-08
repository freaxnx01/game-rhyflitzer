// #39: pure helpers for the debug overlay (F3 / ?debug) -- no three.js, no DOM. Unit-tested with `node --test prototype/tests/*.test.mjs`.
import { roofTop } from './world.js';

const OFF = new Set(['0', 'false', 'off', 'no']);
export function debugFromQuery(search) {
  const p = new URLSearchParams(search);
  return p.has('debug') && !OFF.has(p.get('debug').toLowerCase());
}

// the game frame is LV95 shifted to the world origin, x east, z south (pipeline/geo.py Frame.lv95_to_game)
export function gameToLv95(origin, x, z) {
  if (!origin || typeof origin.E !== 'number' || typeof origin.N !== 'number') return null;
  return { E: origin.E + x, N: origin.N - z };
}
// swisstopo's approximate formulas LV95 -> WGS84 (under 1 m off in Switzerland)
export function lv95ToWgs84(E, N) {
  const y = (E - 2600000) / 1e6, x = (N - 1200000) / 1e6;
  const lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
  const lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x * x * x;
  return { lat: lat * 100 / 36, lon: lon * 100 / 36 };
}
export function debugPosition(origin, x, z) {
  const lv = gameToLv95(origin, x, z);
  if (!lv) return { x, z, E: null, N: null, lat: null, lon: null };
  return { x, z, ...lv, ...lv95ToWgs84(lv.E, lv.N) };
}

// data values, not the drawn height: eaves h, +ridge rh when measured, source ('osm' = OSM tag, levels or type default)
export function heightText(b) {
  const ridge = typeof b.rh === 'number' ? ` +${b.rh.toFixed(1)}` : '';
  return `${b.h.toFixed(1)} m${ridge} ${b.hsrc || 'osm'}`;
}
export function heightLabels(buildings) {
  return buildings.map(b => ({ t: heightText(b), x: b.rect[0], z: b.rect[1], top: roofTop(b), id: b.id }));
}

export function positionLines(pos, y, bearing) {
  const head = `x ${pos.x.toFixed(1)}  z ${pos.z.toFixed(1)}  y ${y.toFixed(1)}  ${Math.round(bearing)}°`;
  if (pos.E === null) return [head, 'LV95 —'];
  return [head, `LV95 ${Math.round(pos.E)} / ${Math.round(pos.N)}`, `WGS84 ${pos.lat.toFixed(6)}, ${pos.lon.toFixed(6)}`];
}
export function buildingLines(label) { return [label ? `bldg ${label.id} · ${label.t}` : 'bldg —']; }
export function copyText(lines) { return lines.join(' | '); }

// #124: car body box (metres) and the drawn map extent (metres in, km / km2 out)
export function sizeLine(s) { return `size ${s.l.toFixed(2)} × ${s.w.toFixed(2)} × ${s.h.toFixed(2)} m`; }
export function mapLines(widthM, depthM) {
  const km = m => (m / 1000).toFixed(2);
  return [`map ${km(widthM)} × ${km(depthM)} km · ${(widthM * depthM / 1e6).toFixed(1)} km²`];
}

// #70: keep debug height labels on screen. view = camera.matrixWorldInverse.elements (column-major), tanHalf = tan(fov / 2).
export const DEBUG_LABEL_NDC_MAX = 0.8;
export function labelNdcY(view, tanHalf, x, y, z) {
  const e = view, yc = e[1] * x + e[5] * y + e[9] * z + e[13], zc = e[2] * x + e[6] * y + e[10] * z + e[14];
  return zc < 0 ? yc / (-zc * tanHalf) : NaN;
}
// lower y along the vertical axis until the point projects to ndcMax (closed form: yc(y) = -ndcMax * tanHalf * zc(y)); never raise, never below floor
export function clampLabelY(view, tanHalf, x, y, z, ndcMax, floor) {
  if (!(labelNdcY(view, tanHalf, x, y, z) > ndcMax)) return y;
  const e = view, k = ndcMax * tanHalf, den = e[5] + k * e[6];
  if (den <= 0) return y;
  const a = e[1] * x + e[9] * z + e[13], c = e[2] * x + e[10] * z + e[14];
  return Math.max(floor, Math.min(y, -(a + k * c) / den));
}

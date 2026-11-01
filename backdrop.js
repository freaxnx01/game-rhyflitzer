// backdrop.js (#593): the horizon backdrop -- Hotzenwald, Dinkelberg, Jura and the Rhine valley around the play
// area, from data/backdrop_<region>.mmh (pipeline/backdrop.py). Pure: no DOM, no three.js, so node --test imports it.

export const BACKDROP_SCALE = 0.08;               // drawn scaled about the camera: angles stay, 45 km fit inside far 4200 m
export const CURVE_R = 6371000 / (1 - 0.13);      // earth radius with standard refraction
export const HAZE = Object.freeze({ min: 0.45, max: 0.88, d0: 2000, len: 8000 });
// the ground palette (index.html groundCol: lo, mid, hi) and a dark Black Forest green for the high ground
export const TINT_STOPS = Object.freeze([[0, '#6f8a4a'], [120, '#5d7a40'], [350, '#3f5a35'], [800, '#34482e']]);

export const hazeAt = (d) => HAZE.min + (HAZE.max - HAZE.min) * (1 - Math.exp(-Math.max(d - HAZE.d0, 0) / HAZE.len));
export const curveDrop = (d) => d * d / (2 * CURVE_R);
export const backdropVisible = (s) => s.surface && !s.underwater && !s.cave;

export function heightAt(hdr, data, x, z) {
  const fx = (x - hdr.x0) / hdr.step, fz = (z - hdr.z0) / hdr.step;
  const i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= hdr.w - 1 || j >= hdr.h - 1) return NaN;
  const tx = fx - i, tz = fz - j, k = j * hdr.w + i;
  const a = data[k], b = data[k + 1], c = data[k + hdr.w], d = data[k + hdr.w + 1];
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;   // NaN propagates
}

function tintAt(stops, y) {
  let n = 1;
  while (n < stops.length - 1 && y > stops[n][0]) n++;
  const [h0, c0] = stops[n - 1], [h1, c1] = stops[n];
  const t = Math.min(1, Math.max(0, (y - h0) / (h1 - h0)));
  return c0.map((v, q) => v + (c1[q] - v) * t);
}

function vertices(hdr, data, stops) {
  const n = hdr.w * hdr.h, position = new Float32Array(n * 3), tint = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const y = Number.isFinite(data[k]) ? data[k] : 0;
    position.set([hdr.x0 + (k % hdr.w) * hdr.step, y, hdr.z0 + Math.floor(k / hdr.w) * hdr.step], k * 3);
    tint.set(tintAt(stops, y), k * 3);
  }
  return { position, tint };
}

function sortedQuads(hdr, data) {
  const [hx0, hz0, hx1, hz1] = hdr.hole, cx = (hx0 + hx1) / 2, cz = (hz0 + hz1) / 2, quads = [];
  for (let j = 0; j < hdr.h - 1; j++) for (let i = 0; i < hdr.w - 1; i++) {
    const a = j * hdr.w + i, b = a + 1, c = a + hdr.w, d = c + 1;
    if (![a, b, c, d].every((k) => Number.isFinite(data[k]))) continue;
    quads.push({ a, b, c, d, r: Math.hypot(hdr.x0 + (i + 0.5) * hdr.step - cx, hdr.z0 + (j + 0.5) * hdr.step - cz) });
  }
  return quads.sort((p, q) => q.r - p.r);   // painter's order: far first, the rim last
}

export function backdropMesh(hdr, data, rgbOf) {
  const { position, tint } = vertices(hdr, data, TINT_STOPS.map(([h, c]) => [h, rgbOf(c)]));
  const quads = sortedQuads(hdr, data), index = new Uint32Array(quads.length * 6);
  quads.forEach((q, n) => index.set([q.a, q.c, q.b, q.b, q.c, q.d], n * 6));   // counter-clockwise from above: normal up
  return { position, tint, index, tris: quads.length * 2 };
}

export function horizon(hdr, data, eye, azDeg) {
  const sx = Math.sin(azDeg * Math.PI / 180), sz = -Math.cos(azDeg * Math.PI / 180);
  let best = { elev: -90, dist: 0 };
  for (let r = 300; r < 40000; r += hdr.step / 4) {
    const y = heightAt(hdr, data, eye.x + sx * r, eye.z + sz * r);
    if (!Number.isFinite(y)) continue;
    const elev = Math.atan2(y - curveDrop(r) - eye.y, r) * 180 / Math.PI;
    if (elev > best.elev) best = { elev, dist: r };
  }
  return best;
}

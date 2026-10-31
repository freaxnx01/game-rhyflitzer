// #421: the Vasa (Swedish warship, 1628, Vasa Museum Stockholm) as numbers — life-size dimensions, hull lines and the rig table
// that scripts/vasa/build.mjs turns into assets/models/vasa.glb. Pure: no three.js, no DOM, so tests can
// check it. Sources: Vasa Museum / en.wikipedia.org "Vasa (ship)": sparred length 69 m, 47.5 m between perpendiculars,
// beam 11.7 m, 52.5 m keel to main truck, draught 4.8 m, 64 guns on two gun decks, stern 19.3 m above the keel.
//
// Frame: metres, +x forward (bow), +y up, +z starboard. Origin: keel underside at the midpoint between the perpendiculars.
// s runs along the hull from the sternpost (s = 0) to the stem (s = 1); the hull surface is x(s, y) = lerp(sternX(y), stemX(y), s).

export const VASA = {
  AP: -23.75, FP: 23.75,              // aft / forward perpendicular: 47.5 m between them
  beam: 11.7, draught: 4.8,
  keel: [-19.5, 19.5],                // keel underside from sternpost foot to stem foot
  wingTransomY: 7.2,                  // the flat transom starts here; below it the stern runs into the sternpost
  sternTop: 19.3,                     // taffrail above the keel
  taffrailX: -28.0,                   // aftmost timber of the stern cresting
  railMid: 12.2,                      // main rail amidships (the strake rows are scaled by railY(s) / railMid)
  mastTop: 52.5,                      // main truck above the keel
  bowsprit: { root: [21.5, 12.4], angle: 24 * Math.PI / 180, length: 21.3 },   // tip at x = 41 → 69 m sparred length
  masts: {                            // x on deck, truck above the keel, rake aft in degrees
    fore: { x: 15.0, truck: 46.0, rake: 1, yard: 25.0, shrouds: 7 },
    main: { x: -1.5, truck: 52.5, rake: 2, yard: 29.0, shrouds: 8 },
    mizzen: { x: -14.5, truck: 36.0, rake: 4, yard: 22.0, shrouds: 5 },
  },
  floorY: -2.0,                       // the museum cradle keeps the keel this far above the hall floor
  ports: { lower: 12, upper: 12 },    // gunports per side per gun deck (48 × 24-pounders) + 4 + 3 per side on the castles + 2 chase = 64
};

export const deg = (d) => d * Math.PI / 180;
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export function smoothstep(e0, e1, v) { const t = clamp((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }

// Fritsch–Carlson monotone cubic through (xs, ys): no overshoot between the key breadths
export function monotoneCubic(xs, ys) {
  const n = xs.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], q = a * a + b * b;
    if (q > 9) { const t = 3 / Math.sqrt(q); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// half-breadths (m) at key heights, tabulated along s from the sternpost (0) to the stem (1)
const S_NODES = [0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1];
const BREADTH = {
  bilge: { y: 2.2, v: [0.2, 0.6, 1.2, 2.6, 3.7, 4.4, 4.6, 4.55, 4.3, 3.6, 2.4, 1.3, 0.25] },
  lower: { y: 4.0, v: [0.3, 0.95, 1.9, 3.6, 4.7, 5.35, 5.6, 5.55, 5.35, 4.8, 3.6, 2.2, 0.3] },
  max: { y: 5.8, v: [0.5, 1.4, 2.4, 4.0, 5.0, 5.6, 5.85, 5.8, 5.6, 5.1, 4.0, 2.7, 0.3] },
  wing: { y: 7.2, v: [3.3, 3.6, 3.9, 4.6, 5.2, 5.6, 5.8, 5.75, 5.55, 5.1, 4.1, 2.9, 0.3] },
  upper: { y: 9.2, v: [3.6, 3.9, 4.3, 4.8, 5.15, 5.4, 5.55, 5.5, 5.35, 4.95, 4.15, 3.1, 0.3] },
  rail: { y: null, v: [2.7, 3.15, 3.6, 4.2, 4.45, 4.6, 4.7, 4.65, 4.55, 4.3, 3.8, 3.0, 0.3] },
};
const along = Object.fromEntries(Object.entries(BREADTH).map(([k, t]) => [k, monotoneCubic(S_NODES, t.v)]));
const KEEL_HALF = 0.2;
const BEAM_FIT = 0.976;                  // the tables above plus the 0.14 m wales give 11.98 m; this brings the extreme beam to 11.7 m

// weather deck at the side, following the sheer (lowest amidships, rising towards both ends, most of all aft)
const deckCurve = monotoneCubic([0, 0.2, 0.5, 0.8, 1], [12.1, 11.4, 10.8, 11.2, 12.4]);
export function deckY(s) { return deckCurve(clamp(s, 0, 1)); }
export function railY(s) { return deckY(s) + 1.4; }

// top of the side: main rail, forecastle (s > 0.78), quarterdeck (0.17–0.36) and the poop running up to the 19.3 m taffrail
export const BREAKS = { poop: 0.17, quarter: 0.36, fore: 0.78 };
const STEP = 0.012;
export function topY(s) {
  const r = railY(s);
  let y = lerp(r, r + 2.4, smoothstep(BREAKS.fore - STEP, BREAKS.fore + STEP, s));
  y = lerp(r + 2.6, y, smoothstep(BREAKS.quarter - STEP, BREAKS.quarter + STEP, s));
  return lerp(lerp(VASA.sternTop, 18.3, s / BREAKS.poop), y, smoothstep(BREAKS.poop - STEP, BREAKS.poop + STEP, s));
}
// deck surface of the raised castles, 1.25 m below their bulwark top
export function castleDeckY(s) { return topY(s) - 1.25; }

// profile of the sternpost (raked, then the stern overhanging above the wing transom) and of the stem (curving forward)
export function sternX(y) {
  if (y <= VASA.wingTransomY) return lerp(VASA.keel[0], VASA.AP, y / VASA.wingTransomY);
  return lerp(VASA.AP, -27.2, (y - VASA.wingTransomY) / (VASA.sternTop - VASA.wingTransomY));
}
export function stemX(y) {
  if (y <= VASA.draught) return VASA.keel[1] + (VASA.FP - VASA.keel[1]) * Math.pow(y / VASA.draught, 0.7);
  return VASA.FP + 1.85 * (y - VASA.draught) / 7.8;
}
export function hullX(s, y) { return lerp(sternX(y), stemX(y), s); }

// half-breadth of the hull at station s and height y (above the rail the tumblehome just carries on)
export function halfBreadth(s, y) {
  s = clamp(s, 0, 1);
  const rail = railY(s), scale = rail / VASA.railMid;
  if (y >= rail) return Math.max(1.2, along.rail(s) * BEAM_FIT - (y - rail) * 0.2);
  const keys = ['bilge', 'lower', 'max', 'wing', 'upper'];
  const xs = [0, 0.9 * scale, ...keys.map((k) => BREADTH[k].y * scale), rail];
  const ys = [KEEL_HALF, ...[0.5 * along.bilge(s), ...keys.map((k) => along[k](s)), along.rail(s)].map((v) => v * BEAM_FIT)];
  return monotoneCubic(xs, ys)(y);
}

// the planking rows amidships (m above the keel); each pair of rows is one strake, the wales stand proud
export const ROWS = [0, 0.35, 0.9, 1.6, 2.2, 2.9, 3.6, 4.3, 4.85, 5.1, 5.6, 6.0, 6.6, 7.2, 7.7, 8.2, 8.7, 9.3, 9.9, 10.5, 11.0, 11.6, 12.2];
export const WALES = new Set([9, 14, 19]);     // row index of the strake (ROWS[i]..ROWS[i+1]) that is a wale
export function rowY(i, s) { return ROWS[i] * railY(s) / VASA.railMid; }

// gunports: [s, y, kind] per side; the gun decks follow the sheer, the lower tier is staggered against the upper one
export function gunports() {
  const out = [];
  const tier = (n, s0, s1, yAt, kind) => { for (let i = 0; i < n; i++) { const s = lerp(s0, s1, (i + 0.5) / n); out.push([s, yAt(s), kind]); } };
  tier(VASA.ports.lower, 0.09, 0.9, (s) => 6.55 + (deckY(s) - 10.8) * 0.7, 'lower');
  tier(VASA.ports.upper, 0.05, 0.94, (s) => 9.45 + (deckY(s) - 10.8) * 0.85, 'upper');
  tier(4, 0.19, 0.35, (s) => railY(s) + 1.45, 'castle');
  tier(3, 0.8, 0.95, (s) => railY(s) + 1.3, 'castle');
  return out;
}

export function bowspritTip() {
  const { root, angle, length } = VASA.bowsprit;
  return [root[0] + Math.cos(angle) * length, root[1] + Math.sin(angle) * length];
}
export function sparredLength() { return bowspritTip()[0] - VASA.taffrailX; }

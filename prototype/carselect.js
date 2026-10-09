// carselect.js — car selection screen pure rules (#7): stats, paints, choice, turntable spin, camera shift.
// Pure module: no DOM, no three.js, no window, so node --test can import it. index.html keeps the glue.

// ---- paints ----
export const PAINTS = [
  { id: 'navy', hex: '#1b2d5e', nameKey: 'paintNavy' },      // default, today's factory colour
  { id: 'sunflower', hex: '#ffc61a', nameKey: 'paintSunflower' },
  { id: 'signal', hex: '#ff7a1a', nameKey: 'paintSignal' },   // mockup's orange
  { id: 'swiss', hex: '#e0322d', nameKey: 'paintSwiss' },
  { id: 'rhine', hex: '#2f6a96', nameKey: 'paintRhine' },
  { id: 'ice', hex: '#7fd1ff', nameKey: 'paintIce' },
  { id: 'meadow', hex: '#5f8a4c', nameKey: 'paintMeadow' },
  { id: 'cream', hex: '#f5efe0', nameKey: 'paintCream' },
  { id: 'charcoal', hex: '#2a2e38', nameKey: 'paintCharcoal' },
  { id: 'plum', hex: '#7b3fa0', nameKey: 'paintPlum' },       // #25: absorbed into #7
  { id: 'flamingo', hex: '#ff6fa8', nameKey: 'paintFlamingo' }, // #25: absorbed into #7
];

export const DEFAULT_CHOICE = { id: 'compact', paint: 'navy' };

// ---- stats ----
// Fixed reference ceilings: a new vehicle never moves an existing bar. Compact: 8/8/8/3; tractor 1/3/?/8; bus 3/2/?/10.
export const STAT_REF = { top: 75, accel: 20, handling: 11.25, mass: 3 };
export const STAT_KEYS = ['top', 'accel', 'handling', 'mass'];
export const STAT_LABEL_KEYS = { top: 'statTop', accel: 'statAccel', handling: 'statHandling', mass: 'statMass' };

// carselect.js: statBars(def) — score of each stat (1..10) based on the vehicle def and fixed reference ceilings
export function statBars(def) {
  const drive = def.drive || {};
  return {
    top: Math.max(1, Math.min(10, Math.round(drive.top / STAT_REF.top * 10))),
    accel: Math.max(1, Math.min(10, Math.round(drive.accel / STAT_REF.accel * 10))),
    handling: Math.max(1, Math.min(10, Math.round(drive.grip / STAT_REF.handling * 10))),
    mass: Math.max(1, Math.min(10, Math.round(def.mass / STAT_REF.mass * 10))),
  };
}

// barCells(score) — an array of 10 cell states: 'lit', 'tip' (last lit), 'off'
export function barCells(score) {
  const cells = Array(10).fill('off');
  for (let i = 0; i < Math.min(score, 10); i++) cells[i] = i === score - 1 ? 'tip' : 'lit';
  return cells;
}

// ---- choice cycling and validation ----
export function cycle(i, n, step) { return ((i + step) % n + n) % n; }

export function paintable(def) { return def.paint === true || (def.paint !== false && def.model !== 'gltf'); }

// parseChoice: validate a stringified choice object, fall back field by field
export function parseChoice(raw, validIds, validPaintIds) {
  try {
    const obj = raw ? JSON.parse(raw) : null;
    if (!obj || typeof obj !== 'object') return { ...DEFAULT_CHOICE };
    const id = validIds.includes(obj.id) ? obj.id : DEFAULT_CHOICE.id;
    const paint = validPaintIds.includes(obj.paint) ? obj.paint : DEFAULT_CHOICE.paint;
    return { id, paint };
  } catch (e) {
    return { ...DEFAULT_CHOICE };
  }
}

// initialChoice: merge stored choice with ?vehicle= query param (query wins for this load)
export function initialChoice(stored, search, validIds, validPaintIds) {
  const parsed = parseChoice(stored, validIds, validPaintIds);
  // extract ?vehicle=<id> from the search string
  const vehicleMatch = search.match(/[?&]vehicle=([^&]*)/);
  if (vehicleMatch && validIds.includes(vehicleMatch[1])) {
    return { id: vehicleMatch[1], paint: parsed.paint };
  }
  return parsed;
}

// ---- keys ----
export function carselKeyAction(e) {
  if (e.code === 'Escape') return 'back';
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') return 'spin';
  if (e.code === 'Tab' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') return 'pass';
  // all game keys (T, C, R, H, M, J, F, B, V, G, P, L, etc.) are ignored; browser defaults untouched
  return 'ignore';
}

// ---- turntable spin ----
export const SPIN_AUTO = 0.4;     // rad/s: automatic idle rotation speed
export const SPIN_KEY = 1.2;      // rad/s: arrow key rotation speed
export const SPIN_DRAG = 0.01;    // rad per pixel: drag sensitivity
export const SPIN_RESUME = 2;     // seconds: time to resume auto-rotate after release

// spinStep: accumulate angle and idle timer
export function spinStep(spin, dt, input) {
  let { angle, idle } = spin;
  const { dir, drag } = input;

  if (dir !== 0) {
    idle = 0;
    angle += dir * SPIN_KEY * dt;
  } else if (drag !== 0) {
    idle = 0;
    angle += drag * SPIN_DRAG;
  } else if (idle < SPIN_RESUME) {
    idle += dt;
  } else {
    angle += SPIN_AUTO * dt;
  }

  // wrap angle to [0, 2π)
  angle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

  return { angle, idle };
}

// ---- camera ----
// lookShift(ox, oy, dist, fovDeg, aspect) — compute the camera look-target shift so the car sits centred in the stage
// The stage is a rectangular cut-out; if off-centre (ox, oy in NDC), shift the look target so the car ends up in the centre
export function lookShift(ox, oy, dist, fovDeg, aspect) {
  const halfH = dist * Math.tan((fovDeg / 2) * Math.PI / 180);
  const halfW = halfH * aspect;
  const sx = -ox * halfW || 0;
  const sy = -oy * halfH || 0;
  return [sx, sy];
}

// ---- text ----
export function vehicleText(tr, id, part) {
  // part: 'name', 'class', 'desc'
  const key = `veh_${id}_${part}`;
  const text = tr(key);
  return text === key ? (part === 'name' ? id : '') : text;
}

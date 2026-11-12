// campath.js (#900): the camera path -- waypoints, the shared JSON format and the evaluation of one smooth move.
// Pure: no DOM, no three.js (node --test imports it, and #875 renders the same path frame by frame).
// World metres, x east / z south / y up. yaw and pitch are degrees in the file and inside the path, radians only in a sample.
// Game heading: forward = (cos yaw, sin yaw) in x/z, like P.th; pitch positive = up.

export const CAMPATH_FORMAT = 'rhyflitzer-campath';
export const CAMPATH_VERSION = 1;
export const CAMPATH_DEFAULTS = { speed: 8, ease: 1.5, turnDegPerS: 45 };
export const CAMPATH_KEYS = { add: 'BracketLeft', undo: 'Semicolon', play: 'Quote' };
export const CAMPATH_LIMITS = { points: [2, 200], speed: [0.5, 100], ease: [0, 5], dt: [0.1, 120] };

const ARC_SAMPLES = 64;      // per segment, for the arc-length table: constant speed inside a segment
const MIN_SEG_S = 0.1;       // no segment is shorter than this, so a dense cluster of points cannot stall the move
const DEG = Math.PI / 180;

const toDeg = (rad) => rad / DEG;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const inRange = (v, [lo, hi]) => v >= lo && v <= hi;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pad = (n) => String(n).padStart(2, '0');

// the signed shortest turn from one heading to another, in degrees (-180 .. 180]
const shortTurn = (fromDeg, toDeg_) => ((((toDeg_ - fromDeg) + 180) % 360) + 360) % 360 - 180;

// a waypoint from a rendered camera: its position plus the direction it looks in (camera.getWorldDirection)
export function waypointFrom(pos, dir) {
  const flat = Math.hypot(dir.x, dir.z);
  return { x: pos.x, y: pos.y, z: pos.z, yaw: toDeg(Math.atan2(dir.z, dir.x)), pitch: toDeg(Math.atan2(dir.y, flat)) };
}

export function newCamPath(region) {
  return { format: CAMPATH_FORMAT, version: CAMPATH_VERSION, region, speed: CAMPATH_DEFAULTS.speed, ease: CAMPATH_DEFAULTS.ease, points: [] };
}

export function serializeCamPath(path) {
  return JSON.stringify(path, null, 2);
}

// rhyflitzer-campath-YYYYMMDD-hhmmss.json, from the player's local clock (like recordFileName)
export function camPathFileName(date) {
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `rhyflitzer-campath-${day}-${time}.json`;
}

// a point with only the known fields; an absent dt stays absent. null = a field is not a finite number, 'range' = dt is out of bounds
function parsePoint(raw) {
  if (!raw || typeof raw !== 'object') return null;
  for (const key of ['x', 'y', 'z', 'yaw', 'pitch']) if (!isNum(raw[key])) return null;
  const point = { x: raw.x, y: raw.y, z: raw.z, yaw: raw.yaw, pitch: raw.pitch };
  if (raw.dt === undefined) return point;
  if (!isNum(raw.dt)) return null;
  if (!inRange(raw.dt, CAMPATH_LIMITS.dt)) return 'range';
  point.dt = raw.dt;
  return point;
}

// a file or an object -> { path } or { error: 'json' | 'format' | 'version' | 'points' | 'number' | 'range' }. Unknown fields are dropped.
export function parseCamPath(input) {
  let raw = input;
  if (typeof input === 'string') {
    try { raw = JSON.parse(input); } catch (e) { return { error: 'json' }; }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'format' };
  if (raw.format !== CAMPATH_FORMAT) return { error: 'format' };
  if (raw.version !== CAMPATH_VERSION) return { error: 'version' };
  if (!Array.isArray(raw.points) || !inRange(raw.points.length, CAMPATH_LIMITS.points)) return { error: 'points' };
  const points = [];
  for (const rawPoint of raw.points) {
    const point = parsePoint(rawPoint);
    if (point === null) return { error: 'number' };
    if (point === 'range') return { error: 'range' };
    points.push(point);
  }
  const speed = raw.speed === undefined ? CAMPATH_DEFAULTS.speed : raw.speed;
  const ease = raw.ease === undefined ? CAMPATH_DEFAULTS.ease : raw.ease;
  if (!isNum(speed) || !isNum(ease)) return { error: 'number' };
  if (!inRange(speed, CAMPATH_LIMITS.speed) || !inRange(ease, CAMPATH_LIMITS.ease)) return { error: 'range' };
  const region = typeof raw.region === 'string' ? raw.region : null;
  return { path: { format: CAMPATH_FORMAT, version: CAMPATH_VERSION, region, speed, ease, points } };
}

// the speed ramp: path time T, ramp e = min(ease, T), real duration D = T + e. C1, starts and stops at rest.
export function easeTime(T, ease, t) {
  const e = Math.min(ease, T);
  const D = T + e;
  const u = clamp(t, 0, D);
  if (e <= 0) return u;
  if (u < e) return (u * u) / (2 * e);
  if (u <= T) return u - e / 2;
  return T - ((D - u) * (D - u)) / (2 * e);
}

// ---------- splines ----------
// centripetal Catmull-Rom (alpha 0.5) through four control points, Barry-Goldman form; u in [0, 1] runs p1 -> p2
const knot = (a, b) => Math.sqrt(Math.max(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), 1e-9));
const mix = (a, b, w) => ({ x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w, z: a.z + (b.z - a.z) * w });

function catmullRom3(p0, p1, p2, p3, u) {
  const t0 = 0, t1 = t0 + knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3);
  const t = t1 + u * (t2 - t1);
  const a1 = mix(p0, p1, (t - t0) / (t1 - t0));
  const a2 = mix(p1, p2, (t - t1) / (t2 - t1));
  const a3 = mix(p2, p3, (t - t2) / (t3 - t2));
  const b1 = mix(a1, a2, (t - t0) / (t2 - t0));
  const b2 = mix(a2, a3, (t - t1) / (t3 - t1));
  return mix(b1, b2, (t - t1) / (t2 - t1));
}

// uniform Catmull-Rom over a scalar (yaw, pitch): the angles ride the same local parameter as the position
function catmullRom1(v0, v1, v2, v3, u) {
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * (2 * v1 + (v2 - v0) * u + (2 * v0 - 5 * v1 + 4 * v2 - v3) * u2 + (-v0 + 3 * v1 - 3 * v2 + v3) * u3);
}

// the phantom ends are mirrored: 2p0 - p1 before the first point, 2pn - pn-1 after the last
const mirror3 = (a, b) => ({ x: 2 * a.x - b.x, y: 2 * a.y - b.y, z: 2 * a.z - b.z });
const mirror1 = (a, b) => 2 * a - b;

const withEnds3 = (points) => [mirror3(points[0], points[1]), ...points, mirror3(points[points.length - 1], points[points.length - 2])];
const withEnds1 = (values) => [mirror1(values[0], values[1]), ...values, mirror1(values[values.length - 1], values[values.length - 2])];

// the yaws of the path, each unwrapped onto the shortest turn from the one before, so 170 -> -170 turns by 20 degrees
function unwrapYaws(points) {
  const out = [points[0].yaw];
  for (let i = 1; i < points.length; i++) out.push(out[i - 1] + shortTurn(out[i - 1], points[i].yaw));
  return out;
}

// cumulative chord lengths of one segment, ARC_SAMPLES steps -- the table that turns an arc length into a parameter
function arcTable(control, i) {
  const table = [0];
  let previous = catmullRom3(control[i], control[i + 1], control[i + 2], control[i + 3], 0);
  for (let s = 1; s <= ARC_SAMPLES; s++) {
    const point = catmullRom3(control[i], control[i + 1], control[i + 2], control[i + 3], s / ARC_SAMPLES);
    table.push(table[s - 1] + Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z));
    previous = point;
  }
  return table;
}

// the curve parameter at a given arc length: binary search in the table, then lerp inside the step
function paramAt(table, arc) {
  const total = table[table.length - 1];
  if (total <= 0) return 0;
  const target = clamp(arc, 0, total);
  let lo = 0, hi = table.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid] <= target) lo = mid; else hi = mid;
  }
  const span = table[hi] - table[lo];
  const inside = span > 0 ? (target - table[lo]) / span : 0;
  return (lo + inside) / ARC_SAMPLES;
}

// a path -> { duration, T, ease, segs }. A segment lasts its point's dt, else the longest of the move and the two turns.
export function buildTrack(path) {
  const points = path.points;
  const speed = path.speed ?? CAMPATH_DEFAULTS.speed;
  const ease = path.ease ?? CAMPATH_DEFAULTS.ease;
  const control = withEnds3(points);
  const yaws = withEnds1(unwrapYaws(points));
  const pitches = withEnds1(points.map((p) => p.pitch));
  const segs = [];
  let T = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const table = arcTable(control, i);
    const len = table[table.length - 1];
    const turn = Math.max(Math.abs(yaws[i + 2] - yaws[i + 1]), Math.abs(pitches[i + 2] - pitches[i + 1])) / CAMPATH_DEFAULTS.turnDegPerS;
    const given = points[i + 1].dt;
    const seconds = Math.max(given === undefined ? Math.max(len / speed, turn) : given, MIN_SEG_S);
    segs.push({ i, t0: T, t1: T + seconds, len, table });
    T += seconds;
  }
  return { duration: T + Math.min(ease, T), T, ease, speed, control, yaws, pitches, segs };
}

const segmentAt = (segs, t) => segs.find((s) => t <= s.t1) || segs[segs.length - 1];

// the camera at playback time t (seconds, clamped to the duration): position, yaw / pitch in radians and a look point 1 m ahead
export function sampleTrack(track, t) {
  const s = easeTime(track.T, track.ease, t);
  const seg = segmentAt(track.segs, s);
  const fraction = seg.t1 > seg.t0 ? clamp((s - seg.t0) / (seg.t1 - seg.t0), 0, 1) : 1;
  const u = seg.len > 0 ? paramAt(seg.table, fraction * seg.len) : fraction;
  const i = seg.i;
  const p = catmullRom3(track.control[i], track.control[i + 1], track.control[i + 2], track.control[i + 3], u);
  const yaw = catmullRom1(track.yaws[i], track.yaws[i + 1], track.yaws[i + 2], track.yaws[i + 3], u) * DEG;
  const pitch = catmullRom1(track.pitches[i], track.pitches[i + 1], track.pitches[i + 2], track.pitches[i + 3], u) * DEG;
  const look = { x: p.x + Math.cos(pitch) * Math.cos(yaw), y: p.y + Math.sin(pitch), z: p.z + Math.cos(pitch) * Math.sin(yaw) };
  return { x: p.x, y: p.y, z: p.z, yaw, pitch, look };
}

// key = { code, repeat, shiftKey, ctrlKey, altKey, metaKey }
// -> 'add' | 'undo' | 'play' | 'playRecord' | 'ignore' (a held key) | null (not a path key / a modifier is held)
export function camPathKeyAction(key) {
  const code = key.code;
  if (code !== CAMPATH_KEYS.add && code !== CAMPATH_KEYS.undo && code !== CAMPATH_KEYS.play) return null;
  if (key.ctrlKey || key.altKey || key.metaKey) return null;
  if (key.shiftKey && code !== CAMPATH_KEYS.play) return null;   // Shift is nitro / sink: only the play key reads it
  if (key.repeat) return 'ignore';
  if (code === CAMPATH_KEYS.add) return 'add';
  if (code === CAMPATH_KEYS.undo) return 'undo';
  return key.shiftKey ? 'playRecord' : 'play';
}

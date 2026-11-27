// netcodec.js — #834: connection codes and the reliable lobby messages of the multiplayer race.
// Pure module: no DOM, no three.js, no RTCPeerConnection, so node --test can import it. index.html and netlink.js wire it up.
// Nothing here ever throws and nothing is ever eval'd: a bad code or a bad message comes back as a named error or null.

import { KINDS, KNOCKABLE, KNOCK_SOUNDS } from './knock.js';   // #1112: the sounds a knock message may carry; #1191: the kinds and their sounds. knock.js is pure too

export const CODE_VERSION = 5;      // the R<version> prefix: a code from another game version is refused, not misread (#1112: bit 6 became the horn bit, so old and new builds must not mix; #1191: knock names the prop; #1190: the pontoon message; #1117: the race start names its course)
export const CODE_TTL = 600;        // seconds a code stays valid (10 minutes, shown as a countdown)
export const CODE_SKEW = 60;        // seconds a code may lie in the future before it reads as expired (clock skew between devices)
export const CODE_MAX = 16000;      // characters: a longer code is refused unread
export const MSG_MAX = 4096;        // characters per JSON message on the reliable channel
export const NAME_MAX = 24;         // characters of a player name
export const CLASSES = ['A', 'B', 'C', 'D'];        // the power classes a host can set, plus 'all'
export const MAX_PLAYERS = 4;
const DENY_REASONS = ['class', 'full', 'started'];

// ---- binary pose record (#835) ----
export const POSE_BYTES = 36;       // the record size: byteLength of a pose, asserted by the tests and read by part b
export const POSE_KIND = 1;         // u8 at byte 0: this record kind; other kinds are refused, room is left for #836/#837
export const START_MODES = ['cruise', 'race'];  // the modes a 'start' message may carry; 'race' adds t0/now (#837)
const POS_MAX = 50000;              // m: |x| and |z| bound, "region bounds plus margin"
const Y_MIN = -1000, Y_MAX = 10000; // m: the height band a car can plausibly be in
const V_MAX = 150;                  // m/s: the speed bound, checked on the combined velocity
const ROT_SCALE = 10000;            // rotations and steer are carried as i16 radians × 10000
const V_SCALE = 100;                // velocities are carried as i16 cm/s
const I16_MAX = 0x7fff, I16_MIN = -0x8000;
const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));
const scaledInt16 = (v, scale) => clampInt(v * scale, I16_MIN, I16_MAX);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));   // #1146: into ±pi, so an unwrapped yaw (-P.th grows with every turn) is never clamped to the wrong direction
const HIT_PRESENT = 4;       // bit 2 of byte 33: set when a hit is carried, so zero bytes (no hit) stay valid
const HIT_C_MAX = 240;       // m/s: matches netbump.js MAX_CLOSING — the physical cap ("two cars at top nitro speed head-on"); a peer-reported closing speed above this is refused, so a crafted hit.c cannot impose a stronger impulse than a legitimate collision

// encodePose(pose) — the 36-byte little-endian record of the spec table. Ints are clamped into range, so a caller
// that hands in an out-of-range value still gets a decodable record, not a wrapped one.
export function encodePose(p) {
  const buf = new ArrayBuffer(POSE_BYTES);
  const v = new DataView(buf);
  v.setUint8(0, POSE_KIND);
  v.setUint8(1, clampInt(p.id, 0, 255));
  v.setUint16(2, clampInt(p.seq, 0, 0xffff), true);
  v.setUint32(4, clampInt(p.t, 0, 0xffffffff), true);
  v.setFloat32(8, p.x, true);
  v.setFloat32(12, p.y, true);
  v.setFloat32(16, p.z, true);
  v.setInt16(20, scaledInt16(wrapAngle(p.rx), ROT_SCALE), true);
  v.setInt16(22, scaledInt16(wrapAngle(p.ry), ROT_SCALE), true);
  v.setInt16(24, scaledInt16(wrapAngle(p.rz), ROT_SCALE), true);
  v.setInt16(26, scaledInt16(p.vx, V_SCALE), true);
  v.setInt16(28, scaledInt16(p.vz, V_SCALE), true);
  v.setInt16(30, scaledInt16(wrapAngle(p.steer), ROT_SCALE), true);
  v.setUint8(32, p.flags & 0x7f);   // bit 7 is reserved and must stay 0, also in what we send (bit 6 is the horn, #1112)
  // bytes 33–35: #836 part b hit relay — byte 33 = to (bits 0–1) | present (bit 2) | n (bits 3–7); bytes 34–35 = closing speed in cm/s
  if (p.hit) {
    v.setUint8(33, (p.hit.to & 3) | HIT_PRESENT | ((p.hit.n & 31) << 3));
    v.setUint16(34, clampInt(p.hit.c * V_SCALE, 0, 0xffff), true);
  }
  return buf;
}

// parsePose(buf) — the pose as a fresh object, or null for anything this version refuses: not an ArrayBuffer of
// exactly 36 bytes, a wrong kind, an id beyond MAX_PLAYERS, a non-finite float, a position or speed out of bounds,
// or a set reserved flag bit. Never throws on peer input.
// The id inside the record is the sender's claim, not a verified fact: parsePose cannot know which peer the buffer
// arrived from, so a guest could stuff another player's id into a relayed record. Whoever consumes poses (#835 parts
// b/c) must take the player from netlink's peerId (onPose) and drop a record whose id disagrees with it — anything
// else lets a guest steer another player's car.
// #1112: bit 6 of the flags is the horn bit and accepted; bit 7 stays reserved and refused.
export function parsePose(buf) {
  if (!(buf instanceof ArrayBuffer) || buf.byteLength !== POSE_BYTES) return null;
  const v = new DataView(buf);
  if (v.getUint8(0) !== POSE_KIND) return null;
  const id = v.getUint8(1);
  if (id >= MAX_PLAYERS) return null;
  const x = v.getFloat32(8, true), y = v.getFloat32(12, true), z = v.getFloat32(16, true);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  if (Math.abs(x) > POS_MAX || Math.abs(z) > POS_MAX || y < Y_MIN || y > Y_MAX) return null;
  const vx = v.getInt16(26, true) / V_SCALE, vz = v.getInt16(28, true) / V_SCALE;
  if (Math.hypot(vx, vz) > V_MAX) return null;
  const flags = v.getUint8(32);
  if (flags & 0x80) return null;
  const hb = v.getUint8(33), hc = v.getUint16(34, true);
  let hit = null;
  if (hb & HIT_PRESENT) { hit = { to: hb & 3, n: hb >> 3, c: hc / V_SCALE }; if (hit.c > HIT_C_MAX) return null; }
  else if (hb || hc) return null;
  return {
    id,
    seq: v.getUint16(2, true),
    t: v.getUint32(4, true),
    x, y, z,
    rx: v.getInt16(20, true) / ROT_SCALE,
    ry: v.getInt16(22, true) / ROT_SCALE,
    rz: v.getInt16(24, true) / ROT_SCALE,
    vx, vz,
    steer: v.getInt16(30, true) / ROT_SCALE,
    flags,
    hit,
  };
}

// ---- base64url ----
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function fromB64url(text) {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4);
  try {
    const raw = atob(padded);
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  } catch (e) {
    return null;
  }
}

// ---- deflate-raw, via the streams the browser and node both ship ----
async function through(stream, bytes) {
  const chunks = [];
  const sink = new WritableStream({ write(chunk) { chunks.push(chunk); } });
  const done = stream.readable.pipeTo(sink);
  const writer = stream.writable.getWriter();
  await writer.write(bytes);
  await writer.close();
  await done;
  const size = chunks.reduce((n, c) => n + c.length, 0), out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

const deflate = (bytes) => through(new CompressionStream('deflate-raw'), bytes);
const inflate = (bytes) => through(new DecompressionStream('deflate-raw'), bytes);

// ---- connection codes ----
// encodeCode(role, sdp, region, nowSec) — 'R1H.<base64url>' for the host (carries the region), 'R1G.…' for a guest,
// or null when this browser has no working deflate-raw stream: then there is no code to show, and the caller says so
// instead of letting the rejection travel on. Like decodeCode, this never throws.
export async function encodeCode(role, sdp, region, nowSec) {
  const payload = role === 'H' ? { t: nowSec, g: region, s: sdp } : { t: nowSec, s: sdp };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let packed;
  try {
    packed = await deflate(bytes);
  } catch (e) {
    return null;
  }
  return `R${CODE_VERSION}${role}.${b64url(packed)}`;
}

// decodeCode(code, expectRole, nowSec) — { ok: true, t, g?, sdp } or { ok: false, error } with
// error ∈ size | format | version | role | expired. Never throws.
export async function decodeCode(code, expectRole, nowSec) {
  if (typeof code !== 'string') return { ok: false, error: 'format' };
  if (code.length > CODE_MAX) return { ok: false, error: 'size' };

  const parts = code.trim().match(/^R(\d+)([HG])\.(.+)$/);
  if (!parts) return { ok: false, error: 'format' };
  if (Number(parts[1]) !== CODE_VERSION) return { ok: false, error: 'version' };
  if (parts[2] !== expectRole) return { ok: false, error: 'role' };

  const bytes = fromB64url(parts[3]);
  if (!bytes) return { ok: false, error: 'format' };

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(await inflate(bytes)));
  } catch (e) {
    return { ok: false, error: 'format' };
  }
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'format' };
  if (!Number.isFinite(payload.t) || typeof payload.s !== 'string' || !payload.s.startsWith('v=0')) return { ok: false, error: 'format' };
  if (expectRole === 'H' && typeof payload.g !== 'string') return { ok: false, error: 'format' };

  const age = nowSec - payload.t;
  if (age > CODE_TTL || age < -CODE_SKEW) return { ok: false, error: 'expired' };

  return expectRole === 'H'
    ? { ok: true, t: payload.t, g: payload.g, sdp: payload.s }
    : { ok: true, t: payload.t, sdp: payload.s };
}

// ---- player names ----
// cleanName(raw) — the name as it may be shown: control characters out, trimmed, 1..24 characters, else null
export function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
  return name.length >= 1 && name.length <= NAME_MAX ? name : null;
}

// ---- reliable lobby messages ----
// Every validator reads only the fields it knows and returns a fresh object, so nothing an unknown field carries
// can reach the game state. An unknown type, a missing field or one out of range reads as null.
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

// ---- #837 race messages: start race (t0/now), cp, finish, cpno, board, back ----
const RACE_MS = 3600000;
export const CP_MAX = 15;
const TIMES_MAX = 17, ST = ['run', 'fin', 'dnf'];
const raceTime = (t) => finite(t) && t >= 0 && t <= RACE_MS;
const cpIndex = (i, lo) => Number.isInteger(i) && i >= lo && i <= CP_MAX;

export const COURSE_WIRE_MAX = 7;   // #1117: the highest course index a race start may name (five today, room for more)
const SEED_MAX = 0xffffffff;
const courseField = (m) => {
  const hasCourse = m.course !== undefined, hasSeed = m.seed !== undefined;
  if (hasCourse === hasSeed) return null;
  if (hasCourse) return Number.isInteger(m.course) && m.course >= 0 && m.course <= COURSE_WIRE_MAX ? { course: m.course } : null;
  return Number.isInteger(m.seed) && m.seed >= 0 && m.seed <= SEED_MAX ? { seed: m.seed } : null;
};

// parseStart — 'cruise' is the lobby cruise; 'race' carries the host-clock T0, the host's now for the offset, and
// the course: `course` (rotation index) or `seed` (random draw), exactly one (#1117).
function parseStart(m) {
  if (!START_MODES.includes(m.mode)) return null;
  if (m.mode !== 'race') return { type: 'start', mode: m.mode };
  const course = courseField(m);
  return finite(m.t0) && finite(m.now) && course ? { type: 'start', mode: 'race', t0: m.t0, now: m.now, ...course } : null;
}

// parseRow — one row of a board: id 0..3, a clean name, st ∈ run/fin/dnf, ≤ 17 finite non-decreasing times,
// an optional integer mask in 0 .. 2^CP_MAX - 1 (which checkpoints were passed, #1119).
function parseRow(r) {
  if (!r || typeof r !== 'object' || !Number.isInteger(r.id) || r.id < 0 || r.id >= MAX_PLAYERS) return null;
  const name = cleanName(r.name);
  if (!name || !ST.includes(r.st) || !Array.isArray(r.times) || r.times.length > TIMES_MAX) return null;
  if (!r.times.every((t, k) => raceTime(t) && (k === 0 || t >= r.times[k - 1]))) return null;
  if (r.mask !== undefined && (!Number.isInteger(r.mask) || r.mask < 0 || r.mask >= (1 << CP_MAX))) return null;
  return r.mask === undefined ? { id: r.id, name, times: [...r.times], st: r.st } : { id: r.id, name, times: [...r.times], st: r.st, mask: r.mask };
}

// parseBoard — over is a boolean; rows 1..4, each a clean row, ids unique. The host is the only sender.
function parseBoard(m) {
  if (typeof m.over !== 'boolean' || !Array.isArray(m.rows) || m.rows.length < 1 || m.rows.length > MAX_PLAYERS) return null;
  const rows = m.rows.map(parseRow);
  if (rows.some((r) => r === null) || new Set(rows.map((r) => r.id)).size !== rows.length) return null;
  return { type: 'board', over: m.over, rows };
}

// #1112: s = primary knock sound, l = level 0..1, id stamped by the host only. #1191: k/i/a = kind, index, direction; all or none
const PROP_I_MAX = 65535;
function parseKnock(m) {
  if (!KNOCK_SOUNDS.includes(m.s) || !finite(m.l) || m.l < 0 || m.l > 1) return null;
  if (m.id !== undefined && !(Number.isInteger(m.id) && m.id >= 0 && m.id < MAX_PLAYERS)) return null;
  const out = m.id === undefined ? { type: 'knock', s: m.s, l: m.l } : { type: 'knock', s: m.s, l: m.l, id: m.id };
  if (m.k === undefined && m.i === undefined && m.a === undefined) return out;
  if (!KNOCKABLE.includes(m.k) || KINDS[m.k].sound !== m.s) return null;
  if (!Number.isInteger(m.i) || m.i < 0 || m.i > PROP_I_MAX || !finite(m.a) || Math.abs(m.a) > Math.PI) return null;
  return { ...out, k: m.k, i: m.i, a: m.a };
}

// #1190: one pontoon bridge action. lay/take are a guest's request to the host, sync the host's state to the guests
// (d absent = no bridge). The deck carries only the geometry that cannot be re-derived; everything else is
// range-checked against what crossingLine can produce, so a forged deck cannot place a bridge in the sky.
const PONTOON_LEN_MAX = 600;        // m: maxWidth 400 + roadReach 80 + aprons
function parseDeck(d) {
  if (!d || typeof d !== 'object') return null;
  for (const k of ['a', 'b', 'h', 'r']) if (!Array.isArray(d[k])) return null;
  if (d.a.length !== 2 || d.b.length !== 2 || d.h.length !== 3 || d.r.length !== 2) return null;
  if (![...d.a, ...d.b, ...d.h, ...d.r, d.built, d.dir].every(finite)) return null;
  if ([...d.a, ...d.b].some((v) => Math.abs(v) > POS_MAX)) return null;
  const len = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]);
  if (len <= 0 || len > PONTOON_LEN_MAX) return null;
  if (!d.h.every((v) => v >= Y_MIN && v <= Y_MAX)) return null;
  if (d.r.some((v) => v < 0) || d.r[0] + d.r[1] > len + 0.01) return null;
  if (d.built < 0 || d.built > 1) return null;
  if (d.dir !== 1 && d.dir !== -1) return null;
  return { a: [...d.a], b: [...d.b], h: [...d.h], r: [...d.r], built: d.built, dir: d.dir };
}
function parsePontoon(m) {
  if (m.op === 'take') return m.d === undefined ? { type: 'pontoon', op: 'take' } : null;          // a take carries no deck
  if (m.op === 'lay') { const d = parseDeck(m.d); return d && d.built === 0 && d.dir === 1 ? { type: 'pontoon', op: 'lay', d } : null; }   // a lay is a fresh build
  if (m.op === 'sync') { const d = m.d === undefined ? undefined : parseDeck(m.d); return d ? { type: 'pontoon', op: 'sync', d } : d === undefined ? { type: 'pontoon', op: 'sync' } : null; }
  return null;
}

const VALIDATORS = {
  hello: (m) => { const name = cleanName(m.name); return name ? { type: 'hello', name, custom: m.custom === true } : null; },
  pick: (m, ctx) => (ctx.carIds.has(m.car) && ctx.paintIds.has(m.paint) ? { type: 'pick', car: m.car, paint: m.paint } : null),
  ready: (m) => (typeof m.on === 'boolean' ? { type: 'ready', on: m.on } : null),
  deny: (m) => (DENY_REASONS.includes(m.reason) ? { type: 'deny', reason: m.reason } : null),
  bye: () => ({ type: 'bye' }),
  lobby: parseLobby,
  ping: (m) => (finite(m.a) ? { type: 'ping', a: m.a } : null),
  pong: (m) => (finite(m.a) && finite(m.b) ? { type: 'pong', a: m.a, b: m.b } : null),
  start: parseStart,
  cp: (m) => (cpIndex(m.i, 0) && raceTime(m.t) ? { type: 'cp', i: m.i, t: m.t } : null),
  finish: (m) => (raceTime(m.t) ? { type: 'finish', t: m.t } : null),
  cpno: (m) => (cpIndex(m.i, -1) ? { type: 'cpno', i: m.i } : null),
  board: parseBoard,
  back: () => ({ type: 'back' }),
  // #1112: one knocked-over prop. #1191: k/i/a name it and say which way it went.
  knock: parseKnock,
  // #1190: one pontoon bridge action -- a guest's lay/take request or the host's sync.
  pontoon: parsePontoon,
};

function parsePlayer(raw, ctx) {
  if (!raw || typeof raw !== 'object') return null;
  if (!Number.isInteger(raw.id) || raw.id < 0 || raw.id >= MAX_PLAYERS) return null;
  const name = cleanName(raw.name);
  if (!name || typeof raw.ready !== 'boolean') return null;
  const car = raw.car === null ? null : (ctx.carIds.has(raw.car) ? raw.car : undefined);
  const paint = raw.paint === null ? null : (ctx.paintIds.has(raw.paint) ? raw.paint : undefined);
  if (car === undefined || paint === undefined) return null;
  return { id: raw.id, name, car, paint, ready: raw.ready };
}

function parseLobby(m, ctx) {
  if (!ctx.regions.has(m.region) || !(m.cls === 'all' || CLASSES.includes(m.cls))) return null;
  if (!Array.isArray(m.players) || m.players.length < 1 || m.players.length > MAX_PLAYERS) return null;
  const players = m.players.map((p) => parsePlayer(p, ctx));
  if (players.some((p) => p === null)) return null;
  const ids = players.map((p) => p.id);
  if (new Set(ids).size !== ids.length || !ids.includes(m.you)) return null;
  return { type: 'lobby', you: m.you, region: m.region, cls: m.cls, players };
}

// parseMessage(raw, ctx) — the normalised message, or null for anything this version does not accept.
// ctx: { carIds, paintIds, regions } as Sets of the ids that exist. Never throws, never eval's.
export function parseMessage(raw, ctx) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MSG_MAX) return null;
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch (e) {
    return null;
  }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return null;
  const validate = Object.prototype.hasOwnProperty.call(VALIDATORS, msg.type) ? VALIDATORS[msg.type] : null;
  return validate ? validate(msg, ctx) : null;
}

// ---- the invite link (#980) ----
const JOIN_PREFIX = '#join=';
export function joinLinkFor(origin, pathname, code) { return `${origin}${pathname}${JOIN_PREFIX}${encodeURIComponent(code)}`; }
// readJoinHash(hash) — the code a `#join=` fragment carries, or null; decodeCode judges the code itself
export function readJoinHash(hash) {
  if (typeof hash !== 'string' || !hash.startsWith(JOIN_PREFIX)) return null;
  let code = hash.slice(JOIN_PREFIX.length);
  try { code = decodeURIComponent(code); } catch (e) { /* a broken escape: hand the raw text on */ }
  return code.trim() || null;
}

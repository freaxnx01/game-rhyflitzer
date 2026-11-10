// netcodec.js — #834: connection codes and the reliable lobby messages of the multiplayer race.
// Pure module: no DOM, no three.js, no RTCPeerConnection, so node --test can import it. index.html and netlink.js wire it up.
// Nothing here ever throws and nothing is ever eval'd: a bad code or a bad message comes back as a named error or null.

export const CODE_VERSION = 1;      // the R<version> prefix: a code from another game version is refused, not misread
export const CODE_TTL = 300;        // seconds a code stays valid (5 minutes, shown as a countdown)
export const CODE_SKEW = 60;        // seconds a code may lie in the future before it reads as expired (clock skew between devices)
export const CODE_MAX = 16000;      // characters: a longer code is refused unread
export const MSG_MAX = 4096;        // characters per JSON message on the reliable channel
export const NAME_MAX = 24;         // characters of a player name
export const CLASSES = ['A', 'B', 'C', 'D'];        // the power classes a host can set, plus 'all'
export const MAX_PLAYERS = 4;
const DENY_REASONS = ['class', 'full'];

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
const VALIDATORS = {
  hello: (m) => { const name = cleanName(m.name); return name ? { type: 'hello', name } : null; },
  pick: (m, ctx) => (ctx.carIds.has(m.car) && ctx.paintIds.has(m.paint) ? { type: 'pick', car: m.car, paint: m.paint } : null),
  ready: (m) => (typeof m.on === 'boolean' ? { type: 'ready', on: m.on } : null),
  deny: (m) => (DENY_REASONS.includes(m.reason) ? { type: 'deny', reason: m.reason } : null),
  bye: () => ({ type: 'bye' }),
  lobby: parseLobby,
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

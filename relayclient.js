// relayclient.js — #1198: the browser side of the signaling relay that turns one short room code into a connected
// multiplayer session. Game-agnostic and self-contained: it imports nothing, knows no game strings and touches no DOM,
// so it can be copied into another `game-*` repo like `i18n.js` — only the url, the game name and the code prefix differ.
// The wire contract it speaks is `docs/relay-protocol.md`; keep the two in sync.
//
// The relay only forwards opaque strings between the host of a room and its guests. It is NOT trusted: everything it
// delivers comes back out of here as a plainly-typed frame object built field by field, and whatever a frame's `data`
// carries is the game's to validate (in Rhyflitzer: netcodec.js `decodeCode`) before anything acts on it.
//
// The WebSocket class is a parameter, not a global, so node --test can drive the whole protocol against a fake socket.

export const RELAY_VERSION = 1;     // travels in every create/join; a relay speaking another version answers `error` `bad`
export const DATA_MAX = 16000;      // characters per forwarded payload (matches netcodec.js CODE_MAX)
export const FRAME_MAX = 20000;     // characters per frame; a longer one is refused unread
export const OPEN_MS = 5000;        // milliseconds the socket has to open before the relay counts as unreachable

const ERROR_CODES = ['bad', 'no-room', 'full', 'rate', 'taken'];
const ROOM_RE = /^[A-Z]{3}-[0-9]{4}$/;
const ROOM_TTL_MAX = 3600;   // seconds: a room lives at most 60 minutes (docs/relay-protocol.md)

const isPeer = (value) => Number.isInteger(value) && value >= 0;
const isPayload = (value) => typeof value === 'string' && value.length >= 1 && value.length <= DATA_MAX;

// Every reader returns a fresh object with only the fields this version knows, so nothing an unknown field carries
// can travel on, and anything out of range reads as null.
const FRAMES = {
  created: (f) => (ROOM_RE.test(f.room) && Number.isInteger(f.ttl) && f.ttl > 0 && f.ttl <= ROOM_TTL_MAX ? { t: 'created', room: f.room, ttl: f.ttl } : null),
  joined: (f) => (isPeer(f.peer) ? { t: 'joined', peer: f.peer } : null),
  guest: (f) => (isPeer(f.peer) ? { t: 'guest', peer: f.peer } : null),
  left: (f) => (isPeer(f.peer) ? { t: 'left', peer: f.peer } : null),
  signal: (f) => (isPeer(f.from) && isPayload(f.data) ? { t: 'signal', from: f.from, data: f.data } : null),
  closed: () => ({ t: 'closed' }),
  expired: () => ({ t: 'expired' }),
  error: (f) => (ERROR_CODES.includes(f.code) ? { t: 'error', code: f.code } : null),
};

// normalizeRoom(text, prefix) — what a player typed as the canonical `PPP-NNNN` code, or null when it cannot be one.
// Spaces, a missing dash and lower case are all forgiven, and so is leaving the prefix off ('4827' in Rhyflitzer).
export function normalizeRoom(text, prefix) {
  if (typeof text !== 'string' || typeof prefix !== 'string' || !/^[A-Z]{3}$/.test(prefix)) return null;
  const packed = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const digits = packed.startsWith(prefix) ? packed.slice(prefix.length) : packed;
  return /^[0-9]{4}$/.test(digits) ? `${prefix}-${digits}` : null;
}

// parseFrame(raw) — one relay→client frame as a fresh object, or null for anything this version does not accept.
// Never throws, never eval's.
export function parseFrame(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > FRAME_MAX) return null;
  let frame;
  try {
    frame = JSON.parse(raw);
  } catch (e) {
    return null;
  }
  if (!frame || typeof frame !== 'object' || Array.isArray(frame)) return null;
  const read = Object.prototype.hasOwnProperty.call(FRAMES, frame.t) ? FRAMES[frame.t] : null;
  return read ? read(frame) : null;
}

// openRelay({ url, game, prefix, WebSocketImpl, onEvent }) — opens the socket at once and returns
// { create(max), join(room), signal(to, data), close(), bad }. A call made before the socket is open is queued and
// sent on open, so the caller never waits for a connection.
//
// onEvent(event) gets every parsed frame as it is, plus two of this module's own:
//   { t: 'unreachable' } — no `open` within OPEN_MS, or an error/close before the socket ever opened
//   { t: 'lost' }        — the socket closed after it had opened, without close() having been called
// Either ends the relay: at most one of them fires, and after it (or after close()) nothing else is reported.
// `bad` counts the frames the relay sent that parseFrame refused; they are dropped.
export function openRelay({ url, game, prefix, WebSocketImpl = globalThis.WebSocket, onEvent = () => {} }) {
  const socket = new WebSocketImpl(url);
  const queued = [];
  let opened = false, done = false, bad = 0;

  // one way out for all four endings — the timeout, an error, a close and the caller's own close()
  function finish(event) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    try { socket.close(); } catch (e) { /* already gone */ }
    if (event) onEvent({ t: event });
  }
  const timer = setTimeout(() => finish('unreachable'), OPEN_MS);

  function send(frame) {
    if (done) return;
    if (opened) socket.send(JSON.stringify(frame));
    else queued.push(frame);
  }

  socket.addEventListener('open', () => {
    if (done) return;
    clearTimeout(timer);
    opened = true;
    for (const frame of queued.splice(0)) socket.send(JSON.stringify(frame));
  });
  socket.addEventListener('message', (e) => {
    if (done) return;
    const frame = parseFrame(e.data);
    if (!frame) { bad++; return; }
    onEvent(frame);
  });
  socket.addEventListener('error', () => { if (!opened) finish('unreachable'); });
  socket.addEventListener('close', () => finish(opened ? 'lost' : 'unreachable'));

  return {
    create: (max) => send({ t: 'create', v: RELAY_VERSION, game, prefix, max }),
    join: (room) => send({ t: 'join', v: RELAY_VERSION, game, room }),
    signal: (to, data) => { if (isPayload(data)) send({ t: 'signal', to, data }); },
    close: () => finish(null),
    get bad() { return bad; },
  };
}

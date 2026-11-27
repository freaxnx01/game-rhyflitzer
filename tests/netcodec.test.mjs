// #834: connection codes and lobby messages. Pure module, so node --test can import it without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeCode, decodeCode, CODE_TTL, parseMessage, cleanName, encodePose, parsePose, POSE_BYTES, joinLinkFor, readJoinHash, CP_MAX, COURSE_WIRE_MAX } from '../netcodec.js';

const SDP = 'v=0\r\n' + 'a=candidate:1 1 udp 1 192.168.1.2 5000 typ host\r\n'.repeat(8);

test('encodeCode_hostOffer_roundTripsWithRegion', async () => {
  const c = await encodeCode('H', SDP, 'hochrhein', 1000);
  assert.match(c, /^R5H\.[A-Za-z0-9_-]+$/); assert.ok(c.length < SDP.length);
  assert.deepEqual(await decodeCode(c, 'H', 1010), { ok: true, t: 1000, g: 'hochrhein', sdp: SDP });
});

test('encodeCode_noDeflateStream_null', async () => {
  const real = globalThis.CompressionStream;
  globalThis.CompressionStream = function () { throw new TypeError('deflate-raw is not supported'); };
  try {
    assert.equal(await encodeCode('H', SDP, 'hochrhein', 1000), null);
  } finally {
    globalThis.CompressionStream = real;
  }
});

test('decodeCode_wrongRoleVersionOrAge_namedError', async () => {
  const g = await encodeCode('G', SDP, null, 1000), h = await encodeCode('H', SDP, 'hochrhein', 1000);
  assert.equal((await decodeCode(g, 'H', 1000)).error, 'role'); assert.equal((await decodeCode(g, 'G', 1000)).ok, true);
  assert.equal((await decodeCode(h.replace(/^R5/, 'R6'), 'H', 1000)).error, 'version');
  assert.equal(CODE_TTL, 600);
  assert.equal((await decodeCode(h, 'H', 1601)).error, 'expired'); assert.equal((await decodeCode(h, 'H', 939)).error, 'expired'); assert.equal((await decodeCode(h, 'H', 1600)).ok, true);
});

test('decodeCode_garbageOrHuge_formatOrSize', async () => {
  for (const g of ['', 'hello', 'R5H.', 'R5H.!!!!', 'R5H.' + btoa('not deflate')]) assert.equal((await decodeCode(g, 'H', 0)).error, 'format', g);
  assert.equal((await decodeCode('R5H.' + 'A'.repeat(16001), 'H', 0)).error, 'size');
});

const CTX = { carIds: new Set(['compact', 'bus']), paintIds: new Set(['navy', 'signal']), regions: new Set(['hochrhein', 'ehrendingen']) };
const P = (o) => parseMessage(JSON.stringify(o), CTX);

test('parseMessage_validLobbyMessages_normalised', () => {
  assert.deepEqual(P({ type: 'hello', name: '  Kicsi\x07 ' }), { type: 'hello', name: 'Kicsi', custom: false });
  assert.deepEqual(P({ type: 'hello', name: 'Ben', custom: true }), { type: 'hello', name: 'Ben', custom: true });
  assert.equal(P({ type: 'hello', name: 'Ben', custom: 'yes' }).custom, false);
  for (const m of [{ type: 'pick', car: 'bus', paint: 'navy' }, { type: 'ready', on: true }, { type: 'bye' }, { type: 'deny', reason: 'class' }]) assert.deepEqual(P(m), m);
  const lobby = { type: 'lobby', you: 1, region: 'hochrhein', cls: 'B', players: [{ id: 0, name: 'A', car: 'bus', paint: 'navy', ready: true }, { id: 1, name: 'B', car: null, paint: null, ready: false }] };
  assert.deepEqual(P(lobby), lobby);
});

test('parseMessage_invalid_null', () => {
  const pl = (id) => ({ id, name: 'A', car: null, paint: null, ready: false }), L = (o) => ({ type: 'lobby', you: 0, region: 'hochrhein', cls: 'B', players: [pl(0)], ...o });
  for (const bad of [{ type: 'eval' }, { type: 'hello', name: '' }, { type: 'hello', name: 'x'.repeat(25) }, { type: 'pick', car: 'tank', paint: 'navy' },
    { type: 'pick', car: 'bus', paint: 'red' }, { type: 'ready', on: 'yes' }, { type: 'deny', reason: 'x' },
    L({ you: 4 }), L({ players: [] }), L({ region: 'mars' }), L({ cls: 'E' }), L({ players: [pl(0), pl(0)] })])
    assert.equal(P(bad), null, JSON.stringify(bad));
  for (const raw of ['', '{', 'null', '[]', '"x"', 'x'.repeat(4097), 42]) assert.equal(parseMessage(raw, CTX), null);
});

test('cleanName_badInput_null', () => { assert.equal(cleanName('x'.repeat(30)), null); assert.equal(cleanName(7), null); });

// #835 part a: the binary pose record and the ping/pong/start messages.
const POSE = { id: 2, seq: 65535, t: 4294967000, x: 1234.5, y: 312.25, z: -876.125, rx: 0.05, ry: -3.1, rz: -0.2, vx: 30.12, vz: -4.5, steer: 0.31, flags: 0b100011 };

test('parsePose_encoded_roundTripsWithinQuantisation', () => {
  const buf = encodePose(POSE); assert.equal(buf.byteLength, POSE_BYTES); assert.equal(POSE_BYTES, 36);
  const p = parsePose(buf);
  for (const k of ['id', 'seq', 't', 'flags']) assert.equal(p[k], POSE[k], k);
  for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(p[k] - POSE[k]) < 1e-3, k);
  for (const k of ['rx', 'ry', 'rz', 'steer']) assert.ok(Math.abs(p[k] - POSE[k]) <= 1e-4, k);
  for (const k of ['vx', 'vz']) assert.ok(Math.abs(p[k] - POSE[k]) <= 0.01, k);
});

// #1146: the car's yaw (-P.th) is never wrapped, it grows with every turn; the record carries ±3.2767 rad only
test('encodePose_HeadingBeyondHalfTurn_ArrivesAsTheSameDirection', () => {
  const same = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) <= 2e-4;
  for (const ry of [3.5, -7, 12.6, -40.2, 2 * Math.PI * 9 + 0.3]) {
    for (const k of ['ry', 'rx', 'rz', 'steer']) {
      const p = parsePose(encodePose({ ...POSE, [k]: ry }));
      assert.ok(same(p[k], ry), `${k} ${ry} -> ${p[k]}`);
      assert.ok(Math.abs(p[k]) <= Math.PI + 1e-4, `${k} ${ry} wrapped into ±pi`);
    }
  }
});

test('parsePose_hit_roundTrips', () => {
  assert.equal(parsePose(encodePose(POSE)).hit, null);
  const p = parsePose(encodePose({ ...POSE, hit: { to: 3, n: 31, c: 42.5 } }));
  assert.deepEqual(p.hit, { to: 3, n: 31, c: 42.5 });
});
test('parsePose_badHit_null', () => {
  const bad = (patch) => { const b = encodePose(POSE), v = new DataView(b); patch(v); return b; };
  assert.equal(parsePose(bad((v) => v.setUint8(33, 1))), null);               // bits without the present bit
  assert.equal(parsePose(bad((v) => v.setUint16(34, 5, true))), null);        // a speed without the present bit
  assert.equal(parsePose(bad((v) => { v.setUint8(33, 4); v.setUint16(34, 30001, true); })), null);   // > 300 m/s
});

test('parsePose_badRecords_null', () => {
  const bad = (patch) => { const b = encodePose(POSE), v = new DataView(b); patch(v); return b; };
  assert.equal(parsePose('x'.repeat(36)), null); assert.equal(parsePose(new ArrayBuffer(35)), null); assert.equal(parsePose(new ArrayBuffer(37)), null);
  assert.equal(parsePose(bad((v) => v.setUint8(0, 2))), null);            // unknown kind
  assert.equal(parsePose(bad((v) => v.setUint8(1, 4))), null);            // id beyond MAX_PLAYERS
  assert.equal(parsePose(bad((v) => v.setFloat32(8, NaN, true))), null);
  assert.equal(parsePose(bad((v) => v.setFloat32(16, 60000, true))), null);   // |z| > 50 km
  assert.equal(parsePose(bad((v) => v.setFloat32(12, -2000, true))), null);   // y below -1000
  assert.equal(parsePose(bad((v) => v.setInt16(26, 20000, true))), null);     // vx 200 m/s
  assert.equal(parsePose(bad((v) => v.setUint8(32, 0b10000000))), null);       // reserved flag bit (7)
});

test('encodePose_hornBit_roundTrips', () => {
  const p = parsePose(encodePose({ ...POSE, flags: 1 | 64 }));
  assert.equal(p.flags, 65);
  assert.equal(new DataView(encodePose({ ...POSE, flags: 0xff })).getUint8(32), 0x7f);   // bit 7 is still never sent
});

test('parseMessage_pingPongStart_validated', () => {
  assert.deepEqual(parseMessage('{"type":"ping","a":12.5}', CTX), { type: 'ping', a: 12.5 });
  assert.deepEqual(parseMessage('{"type":"pong","a":12.5,"b":99}', CTX), { type: 'pong', a: 12.5, b: 99 });
  assert.deepEqual(parseMessage('{"type":"start","mode":"cruise"}', CTX), { type: 'start', mode: 'cruise' });
  for (const m of ['{"type":"ping","a":"1"}', '{"type":"pong","a":1}', '{"type":"pong","a":1,"b":null}', '{"type":"start","mode":"race"}', '{"type":"start"}'])
    assert.equal(parseMessage(m, CTX), null, m);
});

test('parseMessage_knock_validated', () => {
  assert.deepEqual(parseMessage('{"type":"knock","s":"glass","l":0.6}', CTX), { type: 'knock', s: 'glass', l: 0.6 });
  assert.deepEqual(parseMessage('{"type":"knock","s":"lamp","l":1,"id":2}', CTX), { type: 'knock', s: 'lamp', l: 1, id: 2 });
  for (const m of ['{"type":"knock","s":"boom","l":0.5}', '{"type":"knock","s":"glass","l":2}', '{"type":"knock","s":"glass"}',
    '{"type":"knock","s":"glass","l":0.5,"id":4}', '{"type":"knock","s":"glass","l":0.5,"id":"1"}', '{"type":"knock","l":0.5}'])
    assert.equal(parseMessage(m, CTX), null, m);
});

const WD = { a: [0, 0], b: [100, 0], h: [3, 2.5, 2.5], r: [10, 10], built: 0, dir: 1 };
test('parseMessage_pontoon_validated', () => {
  const j = (o) => JSON.stringify({ type: 'pontoon', ...o });
  assert.deepEqual(parseMessage(j({ op: 'lay', d: WD }), CTX), { type: 'pontoon', op: 'lay', d: WD });
  assert.deepEqual(parseMessage(j({ op: 'take' }), CTX), { type: 'pontoon', op: 'take' });
  assert.deepEqual(parseMessage(j({ op: 'sync' }), CTX), { type: 'pontoon', op: 'sync' });
  assert.equal(parseMessage(j({ op: 'sync', d: { ...WD, built: 0.4, dir: -1 } }), CTX).d.built, 0.4);
  for (const o of [{ op: 'x' }, { op: 'lay' }, { op: 'lay', d: { ...WD, built: 0.5 } }, { op: 'lay', d: { ...WD, dir: -1 } },
    { op: 'sync', d: { ...WD, dir: 0 } }, { op: 'sync', d: { ...WD, b: [700, 0] } }, { op: 'sync', d: { ...WD, a: [60000, 0] } },
    { op: 'sync', d: { ...WD, r: [60, 60] } }, { op: 'sync', d: { ...WD, r: [-1, 5] } }, { op: 'sync', d: { ...WD, h: [3, 2.5, 99999] } },
    { op: 'sync', d: { ...WD, built: 2 } }, { op: 'sync', d: { ...WD, b: [0, 0] } }, { op: 'take', d: WD }, { op: 'sync', d: { ...WD, a: [null, 0] } }])
    assert.equal(parseMessage(j(o), CTX), null, JSON.stringify(o));
});

test('parseMessage_knockWithProp_validated', () => {
  assert.deepEqual(parseMessage('{"type":"knock","s":"clatter","l":0.5,"k":"bin","i":3,"a":-1.2}', CTX),
    { type: 'knock', s: 'clatter', l: 0.5, k: 'bin', i: 3, a: -1.2 });
  assert.deepEqual(parseMessage('{"type":"knock","s":"lamp","l":1,"id":1,"k":"lamp","i":0,"a":3.14}', CTX),
    { type: 'knock', s: 'lamp', l: 1, id: 1, k: 'lamp', i: 0, a: 3.14 });
  for (const m of [
    '{"type":"knock","s":"clatter","l":0.5,"k":"tree","i":3,"a":0}',
    '{"type":"knock","s":"glass","l":0.5,"k":"bin","i":3,"a":0}',
    '{"type":"knock","s":"clatter","l":0.5,"k":"bin","i":1.5,"a":0}',
    '{"type":"knock","s":"clatter","l":0.5,"k":"bin","i":65536,"a":0}',
    '{"type":"knock","s":"clatter","l":0.5,"k":"bin","i":3,"a":4}',
    '{"type":"knock","s":"clatter","l":0.5,"k":"bin","i":3}',
    '{"type":"knock","s":"clatter","l":0.5,"k":"__proto__","i":3,"a":0}'])
    assert.equal(parseMessage(m, CTX), null, m);
});

test('joinLinkFor_readJoinHash_roundTrip', () => {
  const link = joinLinkFor('https://github.freaxnx01.ch', '/game-rhyflitzer/index.html', 'R5H.abc-_XYZ');
  assert.equal(link, 'https://github.freaxnx01.ch/game-rhyflitzer/index.html#join=R5H.abc-_XYZ');
  assert.equal(readJoinHash(new URL(link).hash), 'R5H.abc-_XYZ');
});

test('readJoinHash_noJoinOrEmpty_null', () => {
  for (const h of ['', '#', '#join=', '#join=   ', '#other=R5H.x', undefined, 7]) assert.equal(readJoinHash(h), null, String(h));
});

// #837 part a: the race messages — start race (t0, now), cp, finish, cpno, back, and the board.
test('parseMessage_raceMessages', () => {
  assert.deepEqual(P({ type: 'start', mode: 'race', t0: 5000, now: 1000, course: 2 }), { type: 'start', mode: 'race', t0: 5000, now: 1000, course: 2 });
  assert.deepEqual(P({ type: 'start', mode: 'race', t0: 5000, now: 1000, seed: 4294967295 }), { type: 'start', mode: 'race', t0: 5000, now: 1000, seed: 4294967295 });
  assert.equal(P({ type: 'start', mode: 'race', t0: 'x', now: 1, course: 0 }), null);
  assert.deepEqual(P({ type: 'cp', i: 2, t: 4100 }), { type: 'cp', i: 2, t: 4100 });
  for (const bad of [{ i: 16, t: 1 }, { i: 1.5, t: 1 }, { i: 0, t: -1 }, { i: 0, t: 3600001 }]) assert.equal(P({ type: 'cp', ...bad }), null);
  assert.deepEqual(P({ type: 'finish', t: 9 }), { type: 'finish', t: 9 });
  assert.deepEqual(P({ type: 'cpno', i: -1 }), { type: 'cpno', i: -1 });
  assert.deepEqual(P({ type: 'back', x: 1 }), { type: 'back' });
});

// #1117: a race start names the course -- an index into the rotation or a seed for the random draw, exactly one
test('parseMessage_raceStart_courseOrSeed', () => {
  assert.equal(COURSE_WIRE_MAX, 7);
  const base = { type: 'start', mode: 'race', t0: 5000, now: 1000 };
  assert.equal(P(base), null);                                               // neither
  assert.equal(P({ ...base, course: 1, seed: 5 }), null);                    // both
  for (const course of [-1, 8, 1.5, '1', null]) assert.equal(P({ ...base, course }), null, String(course));
  for (const seed of [-1, 4294967296, 2.5, '7', null]) assert.equal(P({ ...base, seed }), null, String(seed));
  assert.deepEqual(P({ ...base, course: 0 }), { ...base, course: 0 });
  assert.deepEqual(P({ ...base, seed: 0 }), { ...base, seed: 0 });
  assert.deepEqual(P({ type: 'start', mode: 'cruise', course: 3 }), { type: 'start', mode: 'cruise' });   // a cruise ignores it
});
test('parseMessage_board', () => {
  const row = { id: 0, name: 'A', times: [1, 2], st: 'run' };
  assert.deepEqual(P({ type: 'board', over: false, rows: [row] }), { type: 'board', over: false, rows: [row] });
  for (const bad of [{ ...row, times: [2, 1] }, { ...row, st: 'won' }, { ...row, id: 4 }, { ...row, times: Array(18).fill(1) }, { ...row, name: '' }])
    assert.equal(P({ type: 'board', over: false, rows: [bad] }), null);
  assert.equal(P({ type: 'board', over: false, rows: [row, row] }), null);   // duplicate id
  assert.equal(P({ type: 'board', over: 1, rows: [row] }), null);
});
test('parseMessage_boardMask', () => {
  const row = { id: 0, name: 'A', times: [100], st: 'run', mask: 5 };
  assert.deepEqual(P({ type: 'board', over: false, rows: [row] }), { type: 'board', over: false, rows: [row] });
  for (const bad of [-1, 1.5, 1 << CP_MAX, 'x', null])
    assert.equal(P({ type: 'board', over: false, rows: [{ ...row, mask: bad }] }), null);
});

// #834: connection codes and lobby messages. Pure module, so node --test can import it without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeCode, decodeCode, CODE_TTL, parseMessage, cleanName, encodePose, parsePose, POSE_BYTES, joinLinkFor, readJoinHash } from '../netcodec.js';

const SDP = 'v=0\r\n' + 'a=candidate:1 1 udp 1 192.168.1.2 5000 typ host\r\n'.repeat(8);

test('encodeCode_hostOffer_roundTripsWithRegion', async () => {
  const c = await encodeCode('H', SDP, 'hochrhein', 1000);
  assert.match(c, /^R1H\.[A-Za-z0-9_-]+$/); assert.ok(c.length < SDP.length);
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
  assert.equal((await decodeCode(h.replace(/^R1/, 'R2'), 'H', 1000)).error, 'version');
  assert.equal(CODE_TTL, 600);
  assert.equal((await decodeCode(h, 'H', 1601)).error, 'expired'); assert.equal((await decodeCode(h, 'H', 939)).error, 'expired'); assert.equal((await decodeCode(h, 'H', 1600)).ok, true);
});

test('decodeCode_garbageOrHuge_formatOrSize', async () => {
  for (const g of ['', 'hello', 'R1H.', 'R1H.!!!!', 'R1H.' + btoa('not deflate')]) assert.equal((await decodeCode(g, 'H', 0)).error, 'format', g);
  assert.equal((await decodeCode('R1H.' + 'A'.repeat(16001), 'H', 0)).error, 'size');
});

const CTX = { carIds: new Set(['compact', 'bus']), paintIds: new Set(['navy', 'signal']), regions: new Set(['hochrhein', 'ehrendingen']) };
const P = (o) => parseMessage(JSON.stringify(o), CTX);

test('parseMessage_validLobbyMessages_normalised', () => {
  assert.deepEqual(P({ type: 'hello', name: '  Kicsi\x07 ' }), { type: 'hello', name: 'Kicsi' });
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

test('parsePose_badRecords_null', () => {
  const bad = (patch) => { const b = encodePose(POSE), v = new DataView(b); patch(v); return b; };
  assert.equal(parsePose('x'.repeat(36)), null); assert.equal(parsePose(new ArrayBuffer(35)), null); assert.equal(parsePose(new ArrayBuffer(37)), null);
  assert.equal(parsePose(bad((v) => v.setUint8(0, 2))), null);            // unknown kind
  assert.equal(parsePose(bad((v) => v.setUint8(1, 4))), null);            // id beyond MAX_PLAYERS
  assert.equal(parsePose(bad((v) => v.setFloat32(8, NaN, true))), null);
  assert.equal(parsePose(bad((v) => v.setFloat32(16, 60000, true))), null);   // |z| > 50 km
  assert.equal(parsePose(bad((v) => v.setFloat32(12, -2000, true))), null);   // y below -1000
  assert.equal(parsePose(bad((v) => v.setInt16(26, 20000, true))), null);     // vx 200 m/s
  assert.equal(parsePose(bad((v) => v.setUint8(32, 0b1000000))), null);       // reserved flag bit
});

test('parseMessage_pingPongStart_validated', () => {
  assert.deepEqual(parseMessage('{"type":"ping","a":12.5}', CTX), { type: 'ping', a: 12.5 });
  assert.deepEqual(parseMessage('{"type":"pong","a":12.5,"b":99}', CTX), { type: 'pong', a: 12.5, b: 99 });
  assert.deepEqual(parseMessage('{"type":"start","mode":"cruise"}', CTX), { type: 'start', mode: 'cruise' });
  for (const m of ['{"type":"ping","a":"1"}', '{"type":"pong","a":1}', '{"type":"pong","a":1,"b":null}', '{"type":"start","mode":"race"}', '{"type":"start"}'])
    assert.equal(parseMessage(m, CTX), null, m);
});

test('joinLinkFor_readJoinHash_roundTrip', () => {
  const link = joinLinkFor('https://github.freaxnx01.ch', '/game-rhyflitzer/index.html', 'R1H.abc-_XYZ');
  assert.equal(link, 'https://github.freaxnx01.ch/game-rhyflitzer/index.html#join=R1H.abc-_XYZ');
  assert.equal(readJoinHash(new URL(link).hash), 'R1H.abc-_XYZ');
});

test('readJoinHash_noJoinOrEmpty_null', () => {
  for (const h of ['', '#', '#join=', '#join=   ', '#other=R1H.x', undefined, 7]) assert.equal(readJoinHash(h), null, String(h));
});

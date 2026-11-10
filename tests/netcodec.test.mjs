// #834: connection codes and lobby messages. Pure module, so node --test can import it without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeCode, decodeCode, CODE_TTL, parseMessage, cleanName } from '../netcodec.js';

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
  assert.equal(CODE_TTL, 300);
  assert.equal((await decodeCode(h, 'H', 1301)).error, 'expired'); assert.equal((await decodeCode(h, 'H', 939)).error, 'expired');
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

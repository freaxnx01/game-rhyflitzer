// #834: connection codes and lobby messages. Pure module, so node --test can import it without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeCode, decodeCode, CODE_TTL } from '../netcodec.js';

const SDP = 'v=0\r\n' + 'a=candidate:1 1 udp 1 192.168.1.2 5000 typ host\r\n'.repeat(8);

test('encodeCode_hostOffer_roundTripsWithRegion', async () => {
  const c = await encodeCode('H', SDP, 'hochrhein', 1000);
  assert.match(c, /^R1H\.[A-Za-z0-9_-]+$/); assert.ok(c.length < SDP.length);
  assert.deepEqual(await decodeCode(c, 'H', 1010), { ok: true, t: 1000, g: 'hochrhein', sdp: SDP });
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

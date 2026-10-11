/* #167: the zip subset of a world file. Pure: no DOM. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, readZip, writeZip, ZipError } from '../zip.js';

const enc = (s) => new TextEncoder().encode(s);
const LIM = { 'a.txt': 1000, 'b.bin': 1000 };
const code = async (p) => { try { await p; return 'ok'; } catch (e) { assert.ok(e instanceof ZipError, String(e)); return e.code; } };

/* a stored (method 0) zip with one entry, written by hand, so the reader is tested against bytes not made by writeZip */
function stored(name, data, { method = 0, flags = 0, usize = data.length, crc = crc32(data), localName = name } = {}) {
  const nb = enc(name), lb = enc(localName), local = new Uint8Array(30 + lb.length + data.length), cd = new Uint8Array(46 + nb.length), end = new Uint8Array(22);
  const L = new DataView(local.buffer), C = new DataView(cd.buffer), E = new DataView(end.buffer);
  L.setUint32(0, 0x04034b50, true); L.setUint16(4, 20, true); L.setUint16(6, flags, true); L.setUint16(8, method, true); L.setUint32(14, crc, true); L.setUint32(18, data.length, true); L.setUint32(22, usize, true); L.setUint16(26, lb.length, true); local.set(lb, 30); local.set(data, 30 + lb.length);
  C.setUint32(0, 0x02014b50, true); C.setUint16(4, 20, true); C.setUint16(6, 20, true); C.setUint16(8, flags, true); C.setUint16(10, method, true); C.setUint32(16, crc, true); C.setUint32(20, data.length, true); C.setUint32(24, usize, true); C.setUint16(28, nb.length, true); C.setUint32(42, 0, true); cd.set(nb, 46);
  E.setUint32(0, 0x06054b50, true); E.setUint16(8, 1, true); E.setUint16(10, 1, true); E.setUint32(12, cd.length, true); E.setUint32(16, local.length, true);
  const out = new Uint8Array(local.length + cd.length + end.length); out.set(local, 0); out.set(cd, local.length); out.set(end, local.length + cd.length); return out;
}

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(enc('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('writeZip -> readZip round trip, deflated, binary safe', async () => {
  const bin = new Uint8Array(900).map((_, i) => (i * 37) & 255);
  const z = await writeZip([{ name: 'a.txt', data: enc('hello world '.repeat(50)) }, { name: 'b.bin', data: bin }]);
  const files = await readZip(z, LIM);
  assert.deepEqual([...files.keys()], ['a.txt', 'b.bin']);
  assert.equal(new TextDecoder().decode(files.get('a.txt')), 'hello world '.repeat(50));
  assert.deepEqual(files.get('b.bin'), bin);
  assert.ok(z.length < 600 + 900 + 200, 'text was deflated');
});

test('a stored entry written by another tool reads', async () => {
  const files = await readZip(stored('a.txt', enc('plain')), LIM);
  assert.equal(new TextDecoder().decode(files.get('a.txt')), 'plain');
});

test('refuses names off the allowlist, folders, traversal and duplicates', async () => {
  for (const n of ['c.txt', '../a.txt', 'dir/a.txt', '/a.txt', 'A.TXT']) assert.equal(await code(readZip(stored(n, enc('x')), LIM)), 'bad-names', n);
  const twice = await writeZip([{ name: 'a.txt', data: enc('1') }, { name: 'a.txt', data: enc('2') }]);
  assert.equal(await code(readZip(twice, LIM)), 'bad-names');
  const many = await writeZip([{ name: 'a.txt', data: enc('1') }, { name: 'b.bin', data: enc('2') }]);
  assert.equal(await code(readZip(many, LIM, 1)), 'bad-names');
});

test('refuses encryption, unknown methods, a local name that differs, a bad CRC', async () => {
  assert.equal(await code(readZip(stored('a.txt', enc('x'), { flags: 1 }), LIM)), 'bad-entry');
  assert.equal(await code(readZip(stored('a.txt', enc('x'), { method: 12 }), LIM)), 'bad-entry');
  assert.equal(await code(readZip(stored('a.txt', enc('x'), { localName: 'b.bin' }), LIM)), 'not-zip');
  assert.equal(await code(readZip(stored('a.txt', enc('x'), { crc: 1 }), LIM)), 'bad-entry');
});

test('refuses oversized entries by declared size and while inflating (zip bomb)', async () => {
  assert.equal(await code(readZip(stored('a.txt', enc('x'), { usize: 5000 }), LIM)), 'too-big');
  assert.equal(await code(readZip(stored('a.txt', enc('x'), { usize: 0xffffffff }), LIM)), 'too-big');
  const bomb = await writeZip([{ name: 'a.txt', data: new Uint8Array(200000) }]);
  const dv = new DataView(bomb.buffer, bomb.byteOffset);
  const cd = dv.getUint32(bomb.length - 6, true);
  dv.setUint32(cd + 24, 10, true);
  assert.equal(await code(readZip(bomb, LIM)), 'too-big');
});

test('refuses non-zips and truncated files', async () => {
  assert.equal(await code(readZip(enc('not a zip at all, just text that is long enough'), LIM)), 'not-zip');
  assert.equal(await code(readZip(new Uint8Array(10), LIM)), 'not-zip');
  const z = await writeZip([{ name: 'a.txt', data: enc('hello') }]);
  assert.equal(await code(readZip(z.slice(0, z.length - 30), LIM)), 'not-zip');
});

test('reads a deflated zip written by Python zipfile (interop)', async () => {
  const PY = 'UEsDBBQAAAAIAG18S12F5MxoGQAAAGgBAAAFAAAAYS50eHTLSM3JyVdIK8rPVSioLMnIz1PIGBWhgQgAUEsBAhQDFAAAAAgAbXxLXYXkzGgZAAAAaAEAAAUAAAAAAAAAAAAAAIABAAAAAGEudHh0UEsFBgAAAAABAAEAMwAAADwAAAAAAA==';
  const files = await readZip(Uint8Array.from(Buffer.from(PY, 'base64')), LIM);
  assert.equal(new TextDecoder().decode(files.get('a.txt')), 'hello from python '.repeat(20));
});

test('writeZip stores incompressible and tiny entries instead of rejecting them', async () => {
  const { randomBytes } = await import('node:crypto');
  const random = new Uint8Array(randomBytes(200000));
  const files = await readZip(await writeZip([{ name: 'a.txt', data: enc('x') }, { name: 'b.bin', data: random }]), { 'a.txt': 10, 'b.bin': 300000 });
  assert.deepEqual(files.get('b.bin'), random);
  assert.equal(new TextDecoder().decode(files.get('a.txt')), 'x');
  const empty = await readZip(await writeZip([{ name: 'a.txt', data: new Uint8Array(0) }]), LIM);
  assert.equal(empty.get('a.txt').length, 0);
});

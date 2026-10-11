/* zip.js (#167): the zip subset a world file needs -- stored or deflated entries; no zip64, no encryption, no multi-disk.
   Pure (no DOM). Inflate and deflate use the native compression streams ('deflate-raw'), which Node has too. */
const SIG_LOCAL = 0x04034b50, SIG_CENTRAL = 0x02014b50, SIG_END = 0x06054b50;

export class ZipError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/* Runs bytes through a (de)compression stream, stopping as soon as the output passes limit (a zip bomb never fills memory). */
async function pump(stream, input, limit) {
  const writer = stream.writable.getWriter(), reader = stream.readable.getReader();
  writer.write(input).catch(() => {});
  writer.close().catch(() => {});
  const parts = [];
  let total = 0;
  for (;;) {
    let r;
    try { r = await reader.read(); } catch (e) { throw new ZipError('bad-entry'); }
    if (r.done) return concat(parts);
    total += r.value.length;
    if (total > limit) { reader.cancel().catch(() => {}); throw new ZipError('too-big'); }
    parts.push(r.value);
  }
}

function findEnd(dv) {
  if (dv.byteLength < 22) throw new ZipError('not-zip');
  for (let i = dv.byteLength - 22, min = Math.max(0, i - 0xffff); i >= min; i--) if (dv.getUint32(i, true) === SIG_END) return i;
  throw new ZipError('not-zip');
}

const nameAt = (u8, at, n) => String.fromCharCode(...u8.subarray(at, at + n));

function centralEntry(u8, dv, p, cdEnd) {
  if (p + 46 > cdEnd || dv.getUint32(p, true) !== SIG_CENTRAL) throw new ZipError('not-zip');
  const nlen = dv.getUint16(p + 28, true), size = 46 + nlen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  if (p + size > cdEnd) throw new ZipError('not-zip');
  return { size, flags: dv.getUint16(p + 8, true), method: dv.getUint16(p + 10, true), crc: dv.getUint32(p + 16, true),
    csize: dv.getUint32(p + 20, true), usize: dv.getUint32(p + 24, true), off: dv.getUint32(p + 42, true), name: nameAt(u8, p + 46, nlen) };
}

async function entryData(u8, dv, e, dataEnd) {
  if (e.off + 30 > dataEnd || dv.getUint32(e.off, true) !== SIG_LOCAL) throw new ZipError('not-zip');
  const nlen = dv.getUint16(e.off + 26, true), start = e.off + 30 + nlen + dv.getUint16(e.off + 28, true);
  if (nameAt(u8, e.off + 30, nlen) !== e.name || start + e.csize > dataEnd) throw new ZipError('not-zip');
  const raw = u8.subarray(start, start + e.csize);
  const data = e.method === 0 ? raw.slice() : await pump(new DecompressionStream('deflate-raw'), raw, e.usize);
  if (data.length !== e.usize || crc32(data) !== e.crc) throw new ZipError('bad-entry');
  return data;
}

function checkEntry(e, limits, seen) {
  if (!Object.hasOwn(limits, e.name) || seen.has(e.name)) throw new ZipError('bad-names');
  if (e.flags & 1 || (e.method !== 0 && e.method !== 8)) throw new ZipError('bad-entry');
  if (e.usize > limits[e.name] || e.csize === 0xffffffff) throw new ZipError('too-big');
}

export async function readZip(buf, limits, maxEntries = 8) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const endPos = findEnd(dv);
  const cdPos = dv.getUint32(endPos + 16, true), nEntries = dv.getUint16(endPos + 10, true);
  if (nEntries > maxEntries || cdPos >= endPos) throw new ZipError('bad-names');
  const seen = new Set(), files = new Map();
  let pos = cdPos;
  for (let i = 0; i < nEntries; i++) {
    const e = centralEntry(u8, dv, pos, endPos);
    checkEntry(e, limits, seen);
    seen.add(e.name);
    const data = await entryData(u8, dv, e, cdPos);
    files.set(e.name, data);
    pos += e.size;
  }
  return files;
}

export async function writeZip(entries) {
  const localHeaders = [], centralHeaders = [], offsets = [];
  let offset = 0;
  for (const e of entries) {
    const name = new TextEncoder().encode(e.name);
    const rawData = e.data instanceof Uint8Array ? e.data : new Uint8Array(e.data);
    const crc = crc32(rawData);
    const deflated = await pump(new CompressionStream('deflate-raw'), rawData, Math.max(rawData.length * 2, 256));
    const useDeflate = deflated.length < rawData.length;
    const compressed = useDeflate ? deflated : rawData;
    const method = useDeflate ? 8 : 0;
    offsets.push(offset);
    const localH = new Uint8Array(30 + name.length);
    const lhDv = new DataView(localH.buffer);
    lhDv.setUint32(0, SIG_LOCAL, true);
    lhDv.setUint16(4, 20, true);
    lhDv.setUint16(6, 0, true);
    lhDv.setUint16(8, method, true);
    lhDv.setUint16(10, 0, true);
    lhDv.setUint16(12, 0, true);
    lhDv.setUint32(14, crc, true);
    lhDv.setUint32(18, compressed.length, true);
    lhDv.setUint32(22, rawData.length, true);
    lhDv.setUint16(26, name.length, true);
    lhDv.setUint16(28, 0, true);
    localH.set(name, 30);
    localHeaders.push(localH, compressed);
    offset += localH.length + compressed.length;
    const centralH = new Uint8Array(46 + name.length);
    const chDv = new DataView(centralH.buffer);
    chDv.setUint32(0, SIG_CENTRAL, true);
    chDv.setUint16(4, 20, true);
    chDv.setUint16(6, 20, true);
    chDv.setUint16(8, 0, true);
    chDv.setUint16(10, method, true);
    chDv.setUint16(12, 0, true);
    chDv.setUint16(14, 0, true);
    chDv.setUint32(16, crc, true);
    chDv.setUint32(20, compressed.length, true);
    chDv.setUint32(24, rawData.length, true);
    chDv.setUint16(28, name.length, true);
    chDv.setUint16(30, 0, true);
    chDv.setUint16(32, 0, true);
    chDv.setUint16(34, 0, true);
    chDv.setUint16(36, 0, true);
    chDv.setUint32(38, 0, true);
    chDv.setUint32(42, offsets[offsets.length - 1], true);
    centralH.set(name, 46);
    centralHeaders.push(centralH);
  }
  const cdOffset = offset;
  const endH = new Uint8Array(22);
  const ehDv = new DataView(endH.buffer);
  ehDv.setUint32(0, SIG_END, true);
  ehDv.setUint16(4, 0, true);
  ehDv.setUint16(6, 0, true);
  ehDv.setUint16(8, entries.length, true);
  ehDv.setUint16(10, entries.length, true);
  ehDv.setUint32(12, centralHeaders.reduce((s, h) => s + h.length, 0), true);
  ehDv.setUint32(16, cdOffset, true);
  ehDv.setUint16(20, 0, true);
  return concat([...localHeaders, ...centralHeaders, endH]);
}

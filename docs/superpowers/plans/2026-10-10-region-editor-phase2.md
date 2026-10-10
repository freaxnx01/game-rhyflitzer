# Region editor phase 2: load a generated world (`?world=<id>`, zip download and upload) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The game opens a generated world with `?world=<id>` from the world host, downloads it as a zip, loads such a zip locally (IndexedDB, works offline and after expiry), and shows "This world has expired. Build it again?" for a dead link (#167).

**Architecture:** Two new pure ES modules, `zip.js` (minimal zip reader/writer on the native `DecompressionStream` / `CompressionStream('deflate-raw')`) and `worlds.js` (id, host, URLs, strict file checks, loader with injected `fetch`/`idbGet`, zip pack/unpack), plus `generatedRegion()` in `regions.js`, which turns a world's `region` block (phase 1, #166) into a REGION-shaped entry whose storage keys derive from the id. `index.html` only wires them in: load before the layout, race-less worlds, a region-row button, the expired panel, upload and download. Spec: `docs/superpowers/specs/2026-10-10-region-editor-phase2-design.md`.

**Tech Stack:** vanilla JS ES modules, three.js (unchanged), `node --test`, Playwright (Python, pytest).

## Global Constraints

- **Never put a `//` comment in the middle of a one-line statement in `prototype/index.html`** (much of the file is one statement per line; a trailing `//` swallows the rest of the line). Use `/* ... */` or a comment on its own line. New code in `index.html` is multi-line.
- Buildless: no `package.json`, no framework, no vendored library. `zip.js` and `worlds.js` are plain ES modules like `carselect.js`.
- Untrusted input: the id is checked against `^[0-9a-f]{12}$` before it builds any URL or key; world files go through `worlds.js` checks before use; `JSON.parse` only, never `eval` / `new Function`. Every world-derived string reaches the DOM through `textContent` or `esc()` (#176), never a raw `innerHTML` interpolation. Status / error lines use `textContent` or `toast()` (text-only since #176), never `toastHtml()`.
- Do not change Hochrhein or Ehrendingen behaviour: `REGIONS`, their keys and the existing `regions.test.mjs` expectations stay.
- Tests: node via `node --test prototype/tests/*.test.mjs`. Playwright is slow: foreground only (never `run_in_background`), frame-light (viewport 480x270, poll with `wait_for_function`, no long sleeps), only the affected files, always under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest <files> -x`. Not the full ~2 h suite. Exit 137 = cap hit: stop and report, never raise the cap.
- Commit and push the branch before the Playwright run (Task 7). Conventional Commits, explicit `git add <paths>`.
- CHANGELOG: English, player-facing, written by hand under `[Unreleased]`; never `git cliff -o`.

## Review Focus

- A crafted zip (`../x`, a folder, a duplicate name, an encrypted or zip64 entry, a lying size, a CRC mismatch, a 1 GB inflate) is refused with a reason and never reaches IndexedDB (`zip.test.mjs`, `worlds.test.mjs`, `test_world.py::test_bad_zips_are_refused`).
- `?worldhost=` cannot redirect the deployed game (`worlds.test.mjs: worldHost ...`).
- A world name like `<img src=x onerror=...>` shows as text everywhere (`test_world.py::test_world_name_is_text`).
- A world without a race (`anchors.cps` empty) never shows Hochrhein's checkpoints or start.

---

### Task 1: `zip.js` — minimal zip reader and writer (TDD)

**Files:** create `prototype/zip.js`, `prototype/tests/zip.test.mjs`.

**Interfaces:** `crc32(u8) -> uint32`; `readZip(buf, limits, maxEntries = 8) -> Promise<Map<name, Uint8Array>>` (`limits = {name: maxBytes}` is also the name allowlist); `writeZip([{name, data: Uint8Array}]) -> Promise<Uint8Array>` (deflated); `ZipError` with `.code` in `not-zip | bad-names | bad-entry | too-big`.

- [ ] **Step 0: Preconditions.** `git fetch origin && git checkout -b feature/167-generated-world origin/main`. `test -f prototype/escape.js || echo "#176 NOT MERGED"`: if #176 is not merged, stop and report (this phase must not ship before it). `node --version` must be ≥ 21.2 (`deflate-raw`).
- [ ] **Step 1: Write the failing test** `prototype/tests/zip.test.mjs`:

```js
// #167: the zip subset of a world file. Pure: no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, readZip, writeZip, ZipError } from '../zip.js';

const enc = (s) => new TextEncoder().encode(s);
const LIM = { 'a.txt': 1000, 'b.bin': 1000 };
const code = async (p) => { try { await p; return 'ok'; } catch (e) { assert.ok(e instanceof ZipError, String(e)); return e.code; } };
// a stored (method 0) zip with one entry, written by hand, so the reader is tested against bytes not made by writeZip
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
  const cd = dv.getUint32(bomb.length - 6, true);   // central directory offset
  dv.setUint32(cd + 24, 10, true);                  // lie: claims 10 bytes uncompressed
  assert.equal(await code(readZip(bomb, LIM)), 'too-big');
});

test('refuses non-zips and truncated files', async () => {
  assert.equal(await code(readZip(enc('not a zip at all, just text that is long enough'), LIM)), 'not-zip');
  assert.equal(await code(readZip(new Uint8Array(10), LIM)), 'not-zip');
  const z = await writeZip([{ name: 'a.txt', data: enc('hello') }]);
  assert.equal(await code(readZip(z.slice(0, z.length - 30), LIM)), 'not-zip');
});

test('reads a deflated zip written by Python zipfile (interop)', async () => {
  // python3 -c "import zipfile,io,base64;b=io.BytesIO();z=zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED);z.writestr('a.txt','hello from python '*20);z.close();print(base64.b64encode(b.getvalue()).decode())"
  const PY = '<paste the base64 printed by the command above>';
  const files = await readZip(Uint8Array.from(Buffer.from(PY, 'base64')), LIM);
  assert.equal(new TextDecoder().decode(files.get('a.txt')), 'hello from python '.repeat(20));
});
```

  Generate `PY` once with the command in the comment and paste it (the only hand step; the test must not shell out).

- [ ] **Step 2:** `node --test prototype/tests/zip.test.mjs` fails (module missing).
- [ ] **Step 3: Implement** `prototype/zip.js`:

```js
// zip.js (#167): the zip subset a world file needs -- stored or deflated entries; no zip64, no encryption, no multi-disk.
// Pure (no DOM). Inflate and deflate use the native compression streams ('deflate-raw'), which Node has too.
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

// Runs bytes through a (de)compression stream, stopping as soon as the output passes limit (a zip bomb never fills memory).
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
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const end = findEnd(dv), count = dv.getUint16(end + 10, true), cdSize = dv.getUint32(end + 12, true), cdOff = dv.getUint32(end + 16, true);
  if (dv.getUint16(end + 4, true) || dv.getUint16(end + 6, true) || dv.getUint16(end + 8, true) !== count || cdOff + cdSize > end) throw new ZipError('not-zip');
  if (count === 0 || count > maxEntries) throw new ZipError('bad-names');
  const files = new Map();
  for (let k = 0, p = cdOff; k < count; k++) {
    const e = centralEntry(u8, dv, p, cdOff + cdSize);
    checkEntry(e, limits, files);
    files.set(e.name, await entryData(u8, dv, e, cdOff));
    p += e.size;
  }
  return files;
}

function header(central, nb, crc, csize, usize, off) {
  const s = central ? 2 : 0, h = new Uint8Array((central ? 46 : 30) + nb.length), dv = new DataView(h.buffer);
  dv.setUint32(0, central ? SIG_CENTRAL : SIG_LOCAL, true);
  if (central) dv.setUint16(4, 20, true);   /* version made by; the rest of a central header is the local one shifted by 2 */
  dv.setUint16(4 + s, 20, true); dv.setUint16(8 + s, 8, true); dv.setUint16(12 + s, 33, true);   /* deflate, date 1980-01-01 */
  dv.setUint32(14 + s, crc, true); dv.setUint32(18 + s, csize, true); dv.setUint32(22 + s, usize, true); dv.setUint16(26 + s, nb.length, true);
  if (central) dv.setUint32(42, off, true);
  h.set(nb, central ? 46 : 30);
  return h;
}

export async function writeZip(files) {
  const locals = [], centrals = [];
  let off = 0;
  for (const { name, data } of files) {
    const nb = new TextEncoder().encode(name), body = await pump(new CompressionStream('deflate-raw'), data, Infinity), crc = crc32(data);
    const local = header(false, nb, crc, body.length, data.length, 0);
    centrals.push(header(true, nb, crc, body.length, data.length, off));
    locals.push(local, body);
    off += local.length + body.length;
  }
  const end = new Uint8Array(22), dv = new DataView(end.buffer), cdSize = centrals.reduce((s, c) => s + c.length, 0);
  dv.setUint32(0, SIG_END, true); dv.setUint16(8, files.length, true); dv.setUint16(10, files.length, true); dv.setUint32(12, cdSize, true); dv.setUint32(16, off, true);
  return concat([...locals, ...centrals, end]);
}
```

  (The `/* */` comments are deliberate; this file is not `index.html`, but keep the habit.) If a test fails, fix the implementation, never the test; after three failed attempts stop and report.
- [ ] **Step 4:** `node --test prototype/tests/zip.test.mjs` passes. Commit `feat(region): minimal zip reader and writer for world files (#167)`.

---

### Task 2: `worlds.js` — file checks (TDD)

**Files:** create `prototype/worlds.js`, `prototype/tests/worlds.test.mjs`.

**Interfaces:** `isWorldId(s)`; `WorldError` (`.code`: `bad-world | bad-meta | bad-terrain | too-big | not-zip | bad-names | bad-entry`); `LIMITS`; `MAX_ZIP`; `parseMmh(buf) -> {hdr, data: Float32Array, buf: ArrayBuffer}` (strict; `hdr.sources` always an array); `checkMeta(m) -> m`; `checkWorld(w, id) -> w`; `checkFiles({worldText, terrain, metaText}, id) -> {world, meta, mmh, worldText, terrain, metaText}`; `licenseText(meta) -> string`.

- [ ] **Step 1: Write the failing test** `prototype/tests/worlds.test.mjs` (Task 3 appends to it):

```js
// #167: generated worlds -- checks, host, loader, zip. Pure: no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../worlds.js';

const ID = '0123456789ab';
function mmh(w = 3, h = 2, { extra = 0, hdr = {} } = {}) {
  let hj = JSON.stringify({ format: 'MMH1', w, h, step: 4, x0: -4, z0: -2, base: 400, sources: ['swissALTI3D'], ...hdr });
  while ((8 + hj.length) % 4) hj += ' ';
  const buf = new ArrayBuffer(8 + hj.length + w * h * 4 + extra), u8 = new Uint8Array(buf);
  u8.set([77, 77, 72, 49], 0); new DataView(buf).setUint32(4, hj.length, true); u8.set(new TextEncoder().encode(hj), 8);
  return buf;
}
const meta = (o = {}) => ({ format: 'MMR1', id: ID, pipelineVersion: '1', name: 'Ahausen', bbox: { lv95: [2667000, 1259750, 2669000, 1261750], lonlat: [8.32, 47.48, 8.35, 47.5] },
  built: '2026-10-10T08:00:00+00:00', sources: ['Terrain: swissALTI3D © swisstopo'], license: 'Contains information from OpenStreetMap ... (ODbL) 1.0', lastPlayed: null, ...o });
const world = (r = {}, o = {}) => ({ format: 'MMW1', origin: { lat: 47.49, lon: 8.34 }, bbox: [8.32, 47.48, 8.35, 47.5], sources: ['OpenStreetMap'],
  roads: [], junctions: [], water: [], buildings: [], rail: [], waterSdf: { x0: -1000, z0: -1000, w: 2, h: 2, step: 8, data: '' },
  anchors: { landmarks: {}, cps: [], labels: [], areas: {}, start: [0, 0, 0] },
  region: { id: ID, name: 'Ahausen', gemeinden: ['Ahausen'], villages: [{ t: 'AHAUSEN', x: 0, z: 0, r: 450 }],
    jlist: [{ n: 'Kirche', kind: 'place_of_worship', x: 10, z: 20, g: 'Ahausen' }], treeBox: [-1000, 1000, -1000, 1000], forestAbove: null, race: null, ...r }, ...o });
const code = (fn) => { try { fn(); return 'ok'; } catch (e) { assert.ok(e instanceof W.WorldError, String(e)); return e.code; } };

test('isWorldId: exactly 12 lowercase hex', () => {
  assert.ok(W.isWorldId(ID));
  for (const s of ['0123456789AB', '0123456789a', '0123456789abc', '../../etc/pa', '', null, 123]) assert.equal(W.isWorldId(s), false, String(s));
});

test('parseMmh reads a good file and always gives sources', () => {
  const { hdr, data } = W.parseMmh(mmh());
  assert.equal(hdr.w, 3); assert.equal(data.length, 6); assert.deepEqual(hdr.sources, ['swissALTI3D']);
  assert.deepEqual(W.parseMmh(mmh(3, 2, { hdr: { sources: undefined } })).hdr.sources, []);
  assert.equal(W.parseMmh(new Uint8Array(mmh())).data.length, 6);
});

test('parseMmh refuses a bad magic, header, size or shape', () => {
  const bad = new Uint8Array(mmh()); bad[0] = 88;
  assert.equal(code(() => W.parseMmh(bad.buffer)), 'bad-terrain');
  assert.equal(code(() => W.parseMmh(new ArrayBuffer(6))), 'bad-terrain');
  assert.equal(code(() => W.parseMmh(mmh(3, 2, { extra: 4 }))), 'bad-terrain');
  assert.equal(code(() => W.parseMmh(mmh(3, 2).slice(0, -4))), 'bad-terrain');
  for (const hdr of [{ w: 1.5 }, { w: 5000 }, { step: 0 }, { step: 'x' }, { x0: null }]) assert.equal(code(() => W.parseMmh(mmh(3, 2, { hdr }))), 'bad-terrain', JSON.stringify(hdr));
  const huge = new Uint8Array(mmh()); new DataView(huge.buffer).setUint32(4, 1e6, true);
  assert.equal(code(() => W.parseMmh(huge.buffer)), 'bad-terrain');
});

test('checkMeta accepts phase 1 meta and refuses a wrong shape', () => {
  assert.equal(W.checkMeta(meta()).id, ID);
  for (const o of [{ format: 'X' }, { id: 'nope' }, { name: '' }, { name: 'x'.repeat(81) }, { bbox: { lv95: [1, 2, 3] } }, { bbox: { lv95: [1, 2, 3, NaN] } }, { license: 5 }]) assert.equal(code(() => W.checkMeta(meta(o))), 'bad-meta', JSON.stringify(o));
  assert.equal(code(() => W.checkMeta(null)), 'bad-meta');
});

test('checkWorld accepts a phase 1 world and refuses a wrong shape', () => {
  assert.equal(W.checkWorld(world(), ID).region.name, 'Ahausen');
  assert.equal(code(() => W.checkWorld(world(), 'ffffffffffff')), 'bad-world');
  for (const [r, o] of [[{}, { format: 'MMW2' }], [{}, { roads: {} }], [{}, { waterSdf: null }], [{}, { anchors: { landmarks: {} } }], [{ name: 7 }, {}], [{ jlist: [{ n: 'x', x: 'a', z: 0 }] }, {}],
    [{ jlist: Array.from({ length: 51 }, () => ({ n: 'x', kind: 'k', x: 0, z: 0, g: 'A' })) }, {}], [{ villages: [{ t: 'X', x: 0, z: 0 }] }, {}], [{ treeBox: [0, 1, 2] }, {}], [{ forestAbove: 'high' }, {}], [{ gemeinden: [3] }, {}]])
    assert.equal(code(() => W.checkWorld(world(r, o), ID)), 'bad-world', JSON.stringify([r, o]).slice(0, 80));
  assert.equal(code(() => W.checkWorld({ format: 'MMW1' }, ID)), 'bad-world');
});

test('checkFiles parses, cross-checks ids and caps sizes', () => {
  const ok = W.checkFiles({ worldText: JSON.stringify(world()), terrain: mmh(), metaText: JSON.stringify(meta()) }, ID);
  assert.equal(ok.world.region.id, ID); assert.equal(ok.meta.name, 'Ahausen'); assert.equal(ok.mmh.hdr.w, 3);
  assert.equal(code(() => W.checkFiles({ worldText: '{', terrain: mmh(), metaText: JSON.stringify(meta()) }, ID)), 'bad-world');
  assert.equal(code(() => W.checkFiles({ worldText: JSON.stringify(world()), terrain: mmh(), metaText: JSON.stringify(meta({ id: 'aaaaaaaaaaaa' })) }, ID)), 'bad-meta');
  assert.equal(code(() => W.checkFiles({ worldText: ' '.repeat(W.LIMITS['world.json'] + 1), terrain: mmh(), metaText: JSON.stringify(meta()) }, ID)), 'too-big');
});

test('licenseText carries the ODbL notice and the sources', () => {
  const t = W.licenseText(meta());
  assert.match(t, /ODbL/); assert.match(t, /swisstopo/); assert.match(t, /Ahausen/); assert.match(t, new RegExp(ID));
});
```

- [ ] **Step 2:** `node --test prototype/tests/worlds.test.mjs` fails (module missing).
- [ ] **Step 3: Implement** the checks in `prototype/worlds.js`:

```js
// worlds.js (#167): generated worlds (region editor phase 2) -- the id, the host, strict file checks, loading, zip in and out.
// Pure: no DOM; fetch and storage are passed in. Everything here treats world files as untrusted input.
import { readZip, writeZip } from './zip.js';

export const LIMITS = { 'world.json': 16e6, 'terrain.mmh': 16e6, 'meta.json': 65536, 'LICENSE-ODbL.txt': 65536 };
export const MAX_ZIP = 32e6;
const ID_RE = /^[0-9a-f]{12}$/;

export class WorldError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export const isWorldId = (s) => typeof s === 'string' && ID_RE.test(s);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const str = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
const nums = (a, n) => Array.isArray(a) && a.length === n && a.every(fin);
const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const need = (ok, code) => { if (!ok) throw new WorldError(code); };

function ownBuffer(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength ? u8.buffer : u8.slice().buffer;
}

export function parseMmh(buf) {
  const ab = ownBuffer(buf), dv = new DataView(ab);
  need(ab.byteLength >= 8 && String.fromCharCode(...new Uint8Array(ab, 0, 4)) === 'MMH1', 'bad-terrain');
  const n = dv.getUint32(4, true);
  need(n >= 2 && n <= 4096 && (8 + n) % 4 === 0 && 8 + n <= ab.byteLength, 'bad-terrain');
  let hdr;
  try { hdr = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 8, n))); } catch (e) { throw new WorldError('bad-terrain'); }
  need(hdr && intIn(hdr.w, 2, 4096) && intIn(hdr.h, 2, 4096) && fin(hdr.step) && hdr.step > 0 && fin(hdr.x0) && fin(hdr.z0), 'bad-terrain');
  need(ab.byteLength === 8 + n + hdr.w * hdr.h * 4, 'bad-terrain');
  const sources = Array.isArray(hdr.sources) ? hdr.sources.filter((s) => str(s, 200)) : [];
  return { hdr: { ...hdr, sources }, data: new Float32Array(ab, 8 + n, hdr.w * hdr.h), buf: ab };
}

export function checkMeta(m) {
  need(m && m.format === 'MMR1' && isWorldId(m.id) && str(m.name, 80) && str(String(m.pipelineVersion ?? ''), 16)
    && m.bbox && nums(m.bbox.lv95, 4) && str(m.license, 2000), 'bad-meta');
  return m;
}

const placeOk = (e) => e && str(e.n, 120) && fin(e.x) && fin(e.z) && (e.g === undefined || str(e.g, 80)) && (e.kind === undefined || str(e.kind, 40));
const villageOk = (v) => v && str(v.t, 80) && fin(v.x) && fin(v.z) && fin(v.r);
const sdfOk = (s) => s && fin(s.x0) && fin(s.z0) && fin(s.step) && s.step > 0 && intIn(s.w, 1, 8192) && intIn(s.h, 1, 8192);

function regionOk(r, id) {
  return r && r.id === id && str(r.name, 80) && Array.isArray(r.gemeinden) && r.gemeinden.every((g) => str(g, 80))
    && Array.isArray(r.villages) && r.villages.length <= 200 && r.villages.every(villageOk)
    && Array.isArray(r.jlist) && r.jlist.length <= 50 && r.jlist.every(placeOk)
    && nums(r.treeBox, 4) && (r.forestAbove === null || r.forestAbove === undefined || fin(r.forestAbove));
}

export function checkWorld(w, id) {
  need(w && w.format === 'MMW1' && ['roads', 'junctions', 'water', 'buildings', 'rail'].every((k) => Array.isArray(w[k]))
    && sdfOk(w.waterSdf) && w.anchors && typeof w.anchors.landmarks === 'object' && Array.isArray(w.anchors.cps)
    && (w.anchors.start === undefined || nums(w.anchors.start, 3)) && regionOk(w.region, id), 'bad-world');
  return w;
}

function parseJson(text, limit, code) {
  need(typeof text === 'string', code);
  need(text.length <= limit, 'too-big');
  try { return JSON.parse(text); } catch (e) { throw new WorldError(code); }
}

export function checkFiles({ worldText, terrain, metaText }, id) {
  const meta = checkMeta(parseJson(metaText, LIMITS['meta.json'], 'bad-meta'));
  need(meta.id === id, 'bad-meta');
  const world = checkWorld(parseJson(worldText, LIMITS['world.json'], 'bad-world'), id);
  need(terrain && terrain.byteLength <= LIMITS['terrain.mmh'], 'too-big');
  const mmh = parseMmh(terrain);
  return { world, meta, mmh, worldText, terrain: mmh.buf, metaText };
}

export function licenseText(meta) {
  const sources = Array.isArray(meta.sources) ? meta.sources.filter((s) => typeof s === 'string') : [];
  return [`Map Madness world "${meta.name}" (${meta.id}), built ${meta.built || '?'}.`, '', meta.license, '',
    'Sources:', ...sources.map((s) => `- ${s}`), ''].join('\n');
}
```

- [ ] **Step 4:** the test passes. Commit `feat(region): strict checks for generated world files (#167)`.

---

### Task 3: host, loader, zip pack/unpack, `generatedRegion`, strings (TDD)

**Files:** modify `prototype/worlds.js`, `prototype/regions.js`, `prototype/strings.js`, `prototype/tests/worlds.test.mjs`, `prototype/tests/regions.test.mjs`, `prototype/tests/strings.test.mjs`.

**Interfaces:** `WORLD_HOST`, `EDITOR_URL`; `worldHost(href) -> origin`; `worldIdFromQuery(search) -> id | null`; `worldSearch(search, id)`; `worldUrls(host, id) -> {world, terrain, meta, status}`; `editorUrl(bbox | null)`; `loadGenerated(id, {host, fetch, idbGet}) -> {world, meta, mmh, worldText, terrain, metaText, from: 'file' | 'host'} | {gone: {reason: 'expired' | 'offline' | 'invalid', bbox: [4] | null}}`; `unpackWorldZip(buf) -> Promise<{id, files}>` (`files` = `checkFiles` result); `packWorldZip(files) -> Promise<Uint8Array>`; `savedKey(id) = 'world:' + id`. `regions.js`: `generatedRegion(id, world)`; `regionSearch` also drops `world`.

- [ ] **Step 1: Write the failing tests** — append to `prototype/tests/worlds.test.mjs`:

```js
import { writeZip } from '../zip.js';
const enc = (s) => new TextEncoder().encode(s);
const HOST = 'https://api.example';
const files = () => ({ 'world.json': JSON.stringify(world()), 'terrain.mmh': mmh(), 'meta.json': JSON.stringify(meta()) });
const fakeFetch = (map, log = []) => async (url) => { log.push(url); if (map === 'offline') throw new TypeError('network'); const b = map[url]; return b === undefined ? new Response('', { status: 404 }) : new Response(b, { status: 200 }); };
const hosted = (id = ID) => Object.fromEntries(Object.entries(files()).map(([k, v]) => [`${HOST}/worlds/${id}/${k}`, v]));

test('worldIdFromQuery / worldSearch', () => {
  assert.equal(W.worldIdFromQuery(`?world=${ID}`), ID);
  assert.equal(W.worldIdFromQuery(`?vehicle=delorean&world=${ID.toUpperCase()}`), ID);
  for (const q of ['', '?world=', '?world=../x', '?world=0123456789abc', '?region=ehrendingen']) assert.equal(W.worldIdFromQuery(q), null, q);
  assert.equal(W.worldSearch('?region=ehrendingen&vehicle=delorean', ID), `?vehicle=delorean&world=${ID}`);
});

test('worldHost: the constant, a local override only on a local page', () => {
  assert.equal(W.worldHost('https://github.freaxnx01.ch/game-rhyflitzer/prototype/?world=x'), W.WORLD_HOST);
  assert.equal(W.worldHost('https://github.freaxnx01.ch/game-rhyflitzer/prototype/?worldhost=http://127.0.0.1:9000'), W.WORLD_HOST);
  assert.equal(W.worldHost('http://127.0.0.1:8000/prototype/index.html?worldhost=http://127.0.0.1:9000/x'), 'http://127.0.0.1:9000');
  assert.equal(W.worldHost('http://localhost:8000/prototype/?worldhost=http://localhost:9001'), 'http://localhost:9001');
  for (const o of ['https://evil.example', 'javascript:alert(1)', 'not a url', 'file:///etc']) assert.equal(W.worldHost(`http://127.0.0.1:8000/?worldhost=${encodeURIComponent(o)}`), W.WORLD_HOST, o);
  assert.match(W.WORLD_HOST, /^https:\/\/[^/]+$/);
});

test('worldUrls and editorUrl', () => {
  assert.deepEqual(W.worldUrls(HOST, ID), { world: `${HOST}/worlds/${ID}/world.json`, terrain: `${HOST}/worlds/${ID}/terrain.mmh`, meta: `${HOST}/worlds/${ID}/meta.json`, status: `${HOST}/api/worlds/${ID}` });
  assert.equal(W.editorUrl([2667000.4, 1259750, 2669000, 1261750]), `${W.EDITOR_URL}?bbox=2667000,1259750,2669000,1261750`);
  assert.equal(W.editorUrl(null), W.EDITOR_URL);
  assert.equal(W.editorUrl(['<x>', 1, 2, 3]), W.EDITOR_URL);
});

test('loadGenerated: a saved copy wins and needs no network', async () => {
  const f = files(), log = [];
  const saved = { worldText: f['world.json'], terrain: f['terrain.mmh'], metaText: f['meta.json'] };
  const got = await W.loadGenerated(ID, { host: HOST, fetch: fakeFetch('offline', log), idbGet: async (k) => (k === W.savedKey(ID) ? saved : null) });
  assert.equal(got.from, 'file'); assert.equal(got.world.region.name, 'Ahausen'); assert.deepEqual(log, []);
});

test('loadGenerated: from the host; a broken saved copy falls through', async () => {
  const got = await W.loadGenerated(ID, { host: HOST, fetch: fakeFetch(hosted()), idbGet: async () => ({ worldText: '{', terrain: mmh(), metaText: '{}' }) });
  assert.equal(got.from, 'host'); assert.equal(got.meta.id, ID); assert.ok(got.terrain instanceof ArrayBuffer);
});

test('loadGenerated: expired with and without a status bbox, offline, invalid', async () => {
  const none = async () => null;
  const status = { [`${HOST}/api/worlds/${ID}`]: JSON.stringify({ id: ID, status: 'expired', bbox: { lv95: [2667000, 1259750, 2669000, 1261750] } }) };
  assert.deepEqual(await W.loadGenerated(ID, { host: HOST, fetch: fakeFetch(status), idbGet: none }), { gone: { reason: 'expired', bbox: [2667000, 1259750, 2669000, 1261750] } });
  assert.deepEqual(await W.loadGenerated(ID, { host: HOST, fetch: fakeFetch({}), idbGet: none }), { gone: { reason: 'expired', bbox: null } });
  assert.deepEqual(await W.loadGenerated(ID, { host: HOST, fetch: fakeFetch('offline'), idbGet: none }), { gone: { reason: 'offline', bbox: null } });
  const bad = { ...hosted(), [`${HOST}/worlds/${ID}/terrain.mmh`]: 'MMH1 nonsense' };
  assert.deepEqual(await W.loadGenerated(ID, { host: HOST, fetch: fakeFetch(bad), idbGet: none }), { gone: { reason: 'invalid', bbox: null } });
});

test('packWorldZip -> unpackWorldZip round trip with the licence', async () => {
  const f = files(), checked = W.checkFiles({ worldText: f['world.json'], terrain: f['terrain.mmh'], metaText: f['meta.json'] }, ID);
  const z = await W.packWorldZip(checked);
  const { id, files: back } = await W.unpackWorldZip(z.buffer);
  assert.equal(id, ID); assert.equal(back.worldText, f['world.json']); assert.deepEqual(new Uint8Array(back.terrain), new Uint8Array(f['terrain.mmh']));
});

test('unpackWorldZip refuses a too big file, missing parts and bad content', async () => {
  const code2 = async (p) => { try { await p; return 'ok'; } catch (e) { return e.code; } };
  assert.equal(await code2(W.unpackWorldZip(new ArrayBuffer(W.MAX_ZIP + 1))), 'too-big');
  const f = files();
  const noTerrain = await writeZip([{ name: 'world.json', data: enc(f['world.json']) }, { name: 'meta.json', data: enc(f['meta.json']) }]);
  assert.equal(await code2(W.unpackWorldZip(noTerrain)), 'bad-names');
  const badUtf8 = await writeZip([{ name: 'world.json', data: new Uint8Array([0xff, 0xfe]) }, { name: 'terrain.mmh', data: new Uint8Array(f['terrain.mmh']) }, { name: 'meta.json', data: enc(f['meta.json']) }]);
  assert.equal(await code2(W.unpackWorldZip(badUtf8)), 'bad-world');
  const evil = await writeZip([{ name: 'world.json', data: enc(f['world.json']) }, { name: 'terrain.mmh', data: new Uint8Array(f['terrain.mmh']) }, { name: 'meta.json', data: enc(JSON.stringify(meta({ id: '../../x' }))) }]);
  assert.equal(await code2(W.unpackWorldZip(evil)), 'bad-meta');
});
```

Append to `prototype/tests/regions.test.mjs` (import `generatedRegion` beside the others; reuse the `world()` builder by importing it from `./worlds.test.mjs` is **not** allowed — `node --test` would run that file twice; copy a minimal world literal instead):

```js
test('generatedRegion: name, lists and keys from the world id (#167)', () => {
  const region = { id: '0123456789ab', name: 'Ahausen', gemeinden: ['Ahausen'], villages: [{ t: 'AHAUSEN', x: 0, z: 0, r: 450 }],
    jlist: [{ n: 'Kirche', kind: 'place_of_worship', x: 10, z: 20, g: 'Ahausen' }], treeBox: [-1000, 1000, -1000, 1000], forestAbove: null, race: null };
  const g = generatedRegion('0123456789ab', { anchors: { cps: [] }, region });
  assert.equal(g.id, 'world:0123456789ab'); assert.equal(g.worldId, '0123456789ab'); assert.equal(g.generated, true); assert.equal(g.name, 'Ahausen');
  assert.equal(g.idbKey, 'terrain:world:0123456789ab'); assert.equal(g.bestKey, 'mm.best2.world.0123456789ab');
  assert.equal(g.forestAbove, Infinity); assert.equal(g.handFallback, false); assert.equal(g.race, false); assert.deepEqual(g.borderDe, []);
  assert.deepEqual(g.jlist, [{ n: 'Kirche', g: 'Ahausen', x: 10, z: 20 }]);
  assert.equal(g.strings.intro, 'introWorldFree');
  const raced = generatedRegion('0123456789ab', { anchors: { cps: [{ n: 'A', x: 0, z: 0 }] }, region: { ...region, forestAbove: 90 } });
  assert.equal(raced.race, true); assert.equal(raced.strings.intro, 'introWorld'); assert.equal(raced.forestAbove, 90);
  for (const key of Object.values(g.strings)) { assert.ok(key in STRINGS.en, key); assert.ok(key in STRINGS.de, key); }
  for (const k of Object.keys(REGIONS)) assert.notEqual(REGIONS[k].bestKey, g.bestKey);
});

test('regionSearch drops a world parameter too (#167)', () => {
  assert.equal(regionSearch('?world=0123456789ab&vehicle=delorean', 'ehrendingen'), '?vehicle=delorean&region=ehrendingen');
});
```

Append to `prototype/tests/strings.test.mjs`:

```js
test('#167: generated-world texts exist in both languages; error reasons fall back', () => {
  for (const k of ['introWorld', 'introWorldFree', 'finishedWorld', 'blurbOsmWorld', 'regionWorld', 'worldGoneTitle', 'worldGoneText', 'worldGoneUnknown', 'worldOffline', 'worldInvalid',
    'buildAgain', 'driveHochrhein', 'loadWorldFile', 'downloadWorld', 'worldFileChecking', 'worldFromFile', 'forgetWorld'])
    for (const lang of ['en', 'de']) assert.equal(typeof STRINGS[lang][k], 'string', `${lang}.${k}`);
  for (const lang of ['en', 'de']) {
    const bad = STRINGS[lang].worldFileBad;
    assert.notEqual(bad('too-big'), bad('bad-names')); assert.equal(bad('whatever'), bad('bad-entry'));
  }
  assert.doesNotMatch(STRINGS.de.worldGoneText + STRINGS.de.worldOffline, /\bdu\b|\bdein/);
});
```

- [ ] **Step 2:** `node --test prototype/tests/*.test.mjs` — the new tests fail.
- [ ] **Step 3: Implement** — append to `prototype/worlds.js`:

```js
export const WORLD_HOST = 'https://rhyflitzer-api.freaxnx01.ch';   // phase 3 (#168) names the real host; one constant, nothing else to change
export const EDITOR_URL = '../editor.html';                        // phase 4 (#169), relative to prototype/
const LOCAL = new Set(['localhost', '127.0.0.1']);
const PARTS = ['world.json', 'terrain.mmh', 'meta.json'];

export const savedKey = (id) => `world:${id}`;
export function worldIdFromQuery(search) {
  const id = (new URLSearchParams(search).get('world') || '').toLowerCase();
  return isWorldId(id) ? id : null;
}
export function worldSearch(search, id) {
  const p = new URLSearchParams(search);
  p.delete('region'); p.delete('world'); p.set('world', id);
  return `?${p}`;
}
// ?worldhost= serves tests and local playtests only: honoured on a localhost page and only for a localhost target.
export function worldHost(href) {
  const page = new URL(href), wanted = page.searchParams.get('worldhost');
  if (!wanted || !LOCAL.has(page.hostname)) return WORLD_HOST;
  try { const u = new URL(wanted); return LOCAL.has(u.hostname) && (u.protocol === 'http:' || u.protocol === 'https:') ? u.origin : WORLD_HOST; } catch (e) { return WORLD_HOST; }
}
export const worldUrls = (host, id) => ({ world: `${host}/worlds/${id}/world.json`, terrain: `${host}/worlds/${id}/terrain.mmh`,
  meta: `${host}/worlds/${id}/meta.json`, status: `${host}/api/worlds/${id}` });
export const editorUrl = (bbox) => (nums(bbox, 4) ? `${EDITOR_URL}?bbox=${bbox.map((v) => Math.round(v)).join(',')}` : EDITOR_URL);

async function expiredBbox(fetchFn, url) {
  try { const s = await (await fetchFn(url)).json(); return s && s.status === 'expired' && s.bbox && nums(s.bbox.lv95, 4) ? s.bbox.lv95 : null; } catch (e) { return null; }
}

async function fromSaved(id, idbGet) {
  const saved = await idbGet(savedKey(id));
  if (!saved) return null;
  try { return { ...checkFiles(saved, id), from: 'file' }; } catch (e) { return null; }   // a broken saved copy: try the host
}

async function fromHost(id, host, fetchFn) {
  const u = worldUrls(host, id);
  let res;
  try { res = await Promise.all([fetchFn(u.world), fetchFn(u.terrain), fetchFn(u.meta)]); } catch (e) { return { gone: { reason: 'offline', bbox: null } }; }
  if (res.some((r) => r.status === 404 || r.status === 410)) return { gone: { reason: 'expired', bbox: await expiredBbox(fetchFn, u.status) } };
  if (!res.every((r) => r.ok)) return { gone: { reason: 'offline', bbox: null } };
  try {
    const [worldText, terrain, metaText] = await Promise.all([res[0].text(), res[1].arrayBuffer(), res[2].text()]);
    return { ...checkFiles({ worldText, terrain, metaText }, id), from: 'host' };
  } catch (e) { return { gone: { reason: 'invalid', bbox: null } }; }
}

export async function loadGenerated(id, { host, fetch: fetchFn, idbGet }) {
  need(isWorldId(id), 'bad-world');
  return (await fromSaved(id, idbGet)) || fromHost(id, host, fetchFn);
}

export async function unpackWorldZip(buf) {
  need(buf && buf.byteLength <= MAX_ZIP, 'too-big');
  let zip;
  try { zip = await readZip(buf, LIMITS); } catch (e) { throw new WorldError(e.code || 'not-zip'); }
  need(PARTS.every((n) => zip.has(n)), 'bad-names');
  const text = (n, code) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(zip.get(n)); } catch (e) { throw new WorldError(code); } };
  const metaText = text('meta.json', 'bad-meta'), worldText = text('world.json', 'bad-world');
  let id;
  try { id = JSON.parse(metaText).id; } catch (e) { throw new WorldError('bad-meta'); }
  need(isWorldId(id), 'bad-meta');
  return { id, files: checkFiles({ worldText, terrain: zip.get('terrain.mmh'), metaText }, id) };
}

export function packWorldZip({ worldText, terrain, metaText, meta }) {
  const enc = new TextEncoder();
  return writeZip([{ name: 'world.json', data: enc.encode(worldText) }, { name: 'terrain.mmh', data: new Uint8Array(terrain) },
    { name: 'meta.json', data: enc.encode(metaText) }, { name: 'LICENSE-ODbL.txt', data: enc.encode(licenseText(meta)) }]);
}
```

  `prototype/regions.js`: in `regionSearch` add `p.delete('world');` beside `p.delete('region');`, and add:

```js
// #167: a generated world (?world=<id>, region editor) as a region. Everything comes from the world's `region` block
// (pipeline region.py, #166); the storage keys derive from the id, so worlds never share a best time or a terrain.
export function generatedRegion(id, world) {
  const r = world.region, race = world.anchors.cps.length > 0;
  return {
    id: `world:${id}`, worldId: id, generated: true, name: r.name, world: null, terrain: null,
    idbKey: `terrain:world:${id}`, bestKey: `mm.best2.world.${id}`,
    strings: { intro: race ? 'introWorld' : 'introWorldFree', finished: 'finishedWorld', blurb: 'blurbOsmWorld' },
    villages: r.villages, gemeinden: r.gemeinden, landmarks: [], borderDe: [],
    jlist: r.jlist.map((e) => ({ n: e.n, g: e.g ?? r.name, x: e.x, z: e.z })),
    treeBox: r.treeBox, forestAbove: r.forestAbove ?? Infinity, handFallback: false, race,
  };
}
```

  `prototype/strings.js` — add to `en` (and the same keys to `de`, Swiss spelling, capitalised `Du`/`Dir`/`Dein`; all are rendered with `textContent`, so no markup):

```js
  introWorld: 'A world built from the map. Five checkpoints in any order, then the finish. Nobody told the timer about the shortcuts.',
  introWorldFree: 'A world built from the map, with no race in it: drive around, press J to jump to a place, or start a surprise hunt.',
  finishedWorld: 'Finish reached. Retry for a better line.',
  blurbOsmWorld: 'Roads, houses and woods from OpenStreetMap, terrain and building heights from swisstopo. Timer starts when you move.',
  regionWorld: 'Generated world',
  worldGoneTitle: 'This world has expired.',
  worldGoneText: 'Generated worlds are kept for 30 days after the last drive. Build it again? Same frame, same link.',
  worldGoneUnknown: 'This world link does not work: the world has expired or never existed.',
  worldOffline: 'The world server cannot be reached right now. Try again later, or load a world file you saved.',
  worldInvalid: 'The world server sent a damaged world. Try again later, or load a world file you saved.',
  buildAgain: 'Build it again',
  driveHochrhein: 'Drive Hochrhein instead',
  loadWorldFile: 'Load world file (.zip)',
  downloadWorld: 'Download world',
  worldFileChecking: 'Checking the world file…',
  worldFromFile: 'World from your saved file',
  forgetWorld: 'Remove saved copy',
  worldFileBad: (code) => `Not a usable world file: ${({ 'too-big': 'it is too big', 'not-zip': 'it is not a zip', 'bad-names': 'it does not hold world.json, terrain.mmh and meta.json', 'bad-world': 'world.json is damaged', 'bad-meta': 'meta.json is damaged', 'bad-terrain': 'terrain.mmh is damaged', 'no-storage': 'the browser would not store it' })[code] || 'it could not be read'}.`,
```

  German values (same keys): `'Eine Welt, gebaut aus der Karte. Fünf Checkpoints in beliebiger Reihenfolge, dann das Ziel. Von den Abkürzungen hat der Stoppuhr niemand etwas gesagt.'`, `'Eine Welt, gebaut aus der Karte, ohne Rennen: fahr herum, spring mit J zu einem Ort oder starte eine Überraschungsjagd.'`, `'Ziel erreicht. Nochmals für eine bessere Linie.'`, `'Strassen, Häuser und Wälder aus OpenStreetMap, Gelände und Gebäudehöhen von swisstopo. Die Zeit läuft, sobald Du fährst.'`, `'Generierte Welt'`, `'Diese Welt ist abgelaufen.'`, `'Generierte Welten bleiben 30 Tage nach der letzten Fahrt erhalten. Neu bauen? Gleicher Rahmen, gleicher Link.'`, `'Dieser Welt-Link funktioniert nicht: Die Welt ist abgelaufen oder hat nie existiert.'`, `'Der Welt-Server ist gerade nicht erreichbar. Versuch es später nochmals oder lade eine gespeicherte Weltdatei.'`, `'Der Welt-Server hat eine beschädigte Welt geschickt. Versuch es später nochmals oder lade eine gespeicherte Weltdatei.'`, `'Neu bauen'`, `'Stattdessen Hochrhein fahren'`, `'Weltdatei laden (.zip)'`, `'Welt herunterladen'`, `'Die Weltdatei wird geprüft…'`, `'Welt aus Deiner gespeicherten Datei'`, `'Gespeicherte Kopie entfernen'`, and `worldFileBad` with `Keine brauchbare Weltdatei: …` and the reasons `sie ist zu gross`, `sie ist kein Zip`, `sie enthält nicht world.json, terrain.mmh und meta.json`, `world.json ist beschädigt`, `meta.json ist beschädigt`, `terrain.mmh ist beschädigt`, `der Browser wollte sie nicht speichern`, fallback `sie konnte nicht gelesen werden`. (The strings test's `\bdu\b` check is case-sensitive on purpose: lower-case `du` must not appear.)
- [ ] **Step 4:** `node --test prototype/tests/*.test.mjs` all green (existing `regions.test.mjs` expectations unchanged). Commit `feat(region): world host, loader and zip pack/unpack for generated worlds (#167)`.

---

### Task 4: `index.html` — load `?world=<id>` before the layout

**Files:** modify `prototype/index.html` (imports ~327; `REGION` ~352; world/terrain load ~507-513; `CPS`/`START` ~685-694; jump entries ~1569; region row markup ~268-272 and loop ~1855; best time ~1815).

- [ ] **Step 1:** imports: `generatedRegion` from `./regions.js`; `{ worldIdFromQuery, worldHost, loadGenerated, savedKey, unpackWorldZip, packWorldZip, editorUrl }` from `./worlds.js`. Below `let REGION = …` add `const WORLD_ID = worldIdFromQuery(location.search);` and `let GEN = null, WORLD_GONE = null;` (comment on its own line: `?world=` wins over `?region=`; an invalid id is ignored, like an unknown region).
- [ ] **Step 2:** replace the `let WORLD = await fetch(REGION.world)…` line with a multi-line block (keep the Hochrhein fallback exactly):

```js
let WORLD = null;
if (WORLD_ID) {
  const got = await loadGenerated(WORLD_ID, { host: worldHost(location.href), fetch: (u) => fetch(u), idbGet });
  if (got.gone) { WORLD_GONE = { id: WORLD_ID, ...got.gone }; REGION = REGIONS.hochrhein; }
  else { GEN = got; WORLD = got.world; REGION = generatedRegion(WORLD_ID, got.world); }
}
if (!GEN) WORLD = await fetch(REGION.world).then(r => r.ok ? r.json() : null).catch(() => null);
```

  The existing `if (!WORLD && !REGION.handFallback) { … }` line stays after it unchanged. In the `REAL` loader, the bundled fetch becomes `GEN ? GEN.terrain : await fetch(REGION.terrain)…` (the uploaded-`.mmh` override via `REGION.idbKey` still wins); keep `REAL_SRC` semantics (`'bundled'` for the world's own terrain). Then re-run the two `modetext` / `maptext` lines from `applyStaticStrings` (or call it again) so the HUD names the world (both use `textContent`).
- [ ] **Step 3: race-less worlds.** Change the anchors block (~690) so a generated world never inherits Hochrhein's hand values:

```js
if (L && L.anchors.cps.length) { /* unchanged three lines */ }
else if (REGION.generated) {
  const s = L.anchors.start, [bx0, bx1, bz0, bz1] = REGION.treeBox;
  const [x, z] = s ? snapRoad(s[0], s[1]) : snapRoad((bx0 + bx1) / 2, (bz0 + bz1) / 2);
  START = { x, z, th: s ? s[2] : 0 }; CPS = []; FINISH = { n: REGION.name, x, z };
}
```

  Find every use of `CPS` / `FINISH` / `cpObjs` / `finishG` (`grep -n "CPS\|FINISH\|cpObjs\|finishG" prototype/index.html`) and make sure an empty `CPS` is safe (pips, minimap markers, autopilot/navi targets, hunt). When `REGION.generated && !REGION.race`: hide `#startbtn`, `#blitzbtn`, `#blitzhint` and the pause menu's "restart race" if it would start a trial; the surprise hunt stays. Never leave Hochrhein's checkpoints in a generated world.
- [ ] **Step 4:** J list: in `jumpEntriesNow`, a generated region returns `REGION.jlist.map(e => ({ ...e }))` instead of `landmarkEntries(…)` (chips come from `REGION.gemeinden` = `[name]`). The names go through #176's `esc()` in `renderJump` already; check that.
- [ ] **Step 5:** region row: add `<button id="region-world" class="btn small" type="button" aria-pressed="true" hidden></button>` after the Ehrendingen button. When `REGION.generated`: unhide it and set its `textContent` to `REGION.name` (never `innerHTML`); its click does nothing. Clicking Hochrhein/Ehrendingen from a world uses `regionSearch`, which now drops `world`. `window.__mm.region` becomes `world:<id>`; also expose `window.__mm.world = GEN ? { id: WORLD_ID, from: GEN.from, name: REGION.name } : null` and `window.__mm.worldGone = WORLD_GONE`.
- [ ] **Step 6:** best time uses `REGION.bestKey` already (`mm.best2.world.<id>`); confirm nothing else stores per-region data under a fixed key that would now mix worlds (`grep -n "localStorage" prototype/index.html`; blitz and hunt bests are global today; leave them).
- [ ] **Step 7:** quick manual check: `python3 -m http.server 8000` in the repo root plus Task 7's fixture server, open `http://127.0.0.1:8000/prototype/?world=<id>&worldhost=http://127.0.0.1:<port>`. Commit `feat(region): play a generated world with ?world=<id> (#167)`.

---

### Task 5: the expired-link panel

**Files:** modify `prototype/index.html` (overlay markup ~242-250, CSS near `.regionrow`, a render function next to `renderOverlay`).

- [ ] **Step 1:** in the overlay panel, above `#ovtext`, add hidden markup:

```html
<div id="worldgone" hidden role="alert">
  <h2 id="worldgonetitle"></h2>
  <p id="worldgonetext"></p>
  <div class="row"><a id="buildagain" class="btn primary" href="../editor.html"></a><button id="drivehere" class="btn" type="button"></button></div>
</div>
```

- [ ] **Step 2:** `renderWorldGone()` (multi-line, `textContent` only): hidden unless `WORLD_GONE`. `reason === 'expired'`: title `worldGoneTitle`, text `bbox ? worldGoneText : worldGoneUnknown`, `#buildagain.href = editorUrl(WORLD_GONE.bbox)` (built only from validated numbers), label `buildAgain`. `offline`: title-less, text `worldOffline`, `#buildagain` hidden. `invalid`: text `worldInvalid`, `#buildagain` hidden. `#drivehere` (`driveHochrhein`) hides the panel and drops `world` from the URL with `history.replaceState(null, '', location.pathname + regionSearch(location.search, 'hochrhein'))` (no reload: Hochrhein is already loaded behind it). Call it from the same place the other standing texts render (language switch included).
- [ ] **Step 3:** while the panel shows, the region-fallback toast is not shown (`REGION_FALLBACK` stays `null` on this path). Commit `feat(region): expired world links offer to build the world again (#167)`.

---

### Task 6: Load world file and Download world

**Files:** modify `prototype/index.html` (start-screen markup after `.terrainrow` ~273-279, handlers next to `$('mmhfile').onchange` ~1932, status in `renderStatus`).

- [ ] **Step 1: markup**

```html
<div class="terrainrow">
  <label for="worldfile" class="btn small" data-i18n="loadWorldFile">Load world file (.zip)</label>
  <input id="worldfile" type="file" accept=".zip,application/zip" hidden>
  <button id="worlddl" class="btn small" type="button" hidden data-i18n="downloadWorld">Download world</button>
  <button id="worldforget" class="btn small" type="button" hidden data-i18n="forgetWorld">Remove saved copy</button>
  <span id="worldfilestatus" role="status"></span>
</div>
```

- [ ] **Step 2: upload handler** (multi-line):

```js
$('worldfile').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const status = $('worldfilestatus');
  status.textContent = tr('worldFileChecking');
  try {
    if (f.size > MAX_ZIP) throw Object.assign(new Error('too-big'), { code: 'too-big' });
    const { id, files } = await unpackWorldZip(await f.arrayBuffer());
    const ok = await idbSet(savedKey(id), { worldText: files.worldText, terrain: files.terrain, metaText: files.metaText });
    if (!ok) throw Object.assign(new Error('no-storage'), { code: 'no-storage' });
    location.search = worldSearch(location.search, id);
  } catch (err) { status.textContent = tr('worldFileBad', err.code); e.target.value = ''; }
};
```

  (import `MAX_ZIP`, `worldSearch` too.) Nothing is stored unless every check passed.
- [ ] **Step 3: download** — `#worlddl` visible only when `GEN`:

```js
$('worlddl').onclick = async () => {
  const bytes = await packWorldZip(GEN);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
  a.download = `rhyflitzer-${WORLD_ID}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
};
```

  (`WORLD_ID` is checked hex, so the file name is safe. `GEN.terrain` holds the exact bytes loaded.)
- [ ] **Step 4:** `#worldforget` visible only when `GEN && GEN.from === 'file'`: `await idbSet(savedKey(WORLD_ID), null); location.reload();`. In `renderStatus`, when `GEN && GEN.from === 'file'`, `#worldfilestatus` shows `worldFromFile` (text) unless it is showing an error.
- [ ] **Step 5:** the buttons sit on the start screen, which already blurs focus for keyboard play; check that pressing Enter/Space after using them does not re-trigger them (blur after click, like `i18n.js`). Commit `feat(region): download a world as a zip and load a saved world file (#167)`.

---

### Task 7: Playwright — a local world host with fixture files

**Files:** create `prototype/tests/test_world.py`; modify `prototype/tests/conftest.py` (a `world_host` fixture).

- [ ] **Step 1: fixture host** in `conftest.py`: a session-scoped `world_host` that serves a temp directory over `ThreadingHTTPServer` on `127.0.0.1:<free port>` with a handler subclass adding `Access-Control-Allow-Origin: *` to every response (the game page and the host are different origins, as in production), and returns `(url, root)`. Fixture builder in `test_world.py`:

```python
ID, RAW_ID = "0123456789ab", "abcdefabcdef"
EHR = ROOT / "data" / "world_ehrendingen.json"

def flat_mmh(path, box):
    """A tiny flat terrain covering the box: fast to parse, still a real MMH1."""
    x0, x1, z0, z1 = box
    w, h, step = 17, 17, max(x1 - x0, z1 - z0) / 16
    hj = json.dumps({"format": "MMH1", "w": w, "h": h, "step": step, "x0": x0, "z0": z0, "base": 400.0, "min": 0, "max": 0, "sources": ["test"]}).encode()
    hj += b" " * ((-(8 + len(hj))) % 4)
    path.write_bytes(b"MMH1" + struct.pack("<I", len(hj)) + hj + struct.pack(f"<{w*h}f", *([0.0] * (w * h))))

def make_world(root, wid, *, race=True, name="Testdorf"):
    w = json.loads(EHR.read_text("utf-8"))
    box = [-1520, 1840, -2225, 2065]
    lm = next(iter(w["anchors"]["landmarks"].values()))
    w["region"] = {"id": wid, "name": name, "gemeinden": [name], "villages": [{"t": "TESTDORF", "x": 26.2, "z": 127.2, "r": 450}],
                   "jlist": [{"n": "Testkirche", "kind": "place_of_worship", "x": lm["x"], "z": lm["z"], "g": name}],
                   "treeBox": box, "forestAbove": None, "race": {"par": 400, "len": 5000} if race else None}
    w["anchors"]["landmarks"] = {}
    if not race:
        w["anchors"]["cps"] = []; w["anchors"].pop("finish", None)
    d = root / "worlds" / wid; d.mkdir(parents=True, exist_ok=True)
    (d / "world.json").write_text(json.dumps(w), "utf-8"); flat_mmh(d / "terrain.mmh", box)
    meta = {"format": "MMR1", "id": wid, "pipelineVersion": "1", "name": name, "bbox": {"lv95": [2666500, 1257750, 2670000, 1261750], "lonlat": [8.32, 47.47, 8.37, 47.51]},
            "built": "2026-10-10T08:00:00+00:00", "sources": ["Terrain: swissALTI3D © swisstopo"], "license": "Contains information from OpenStreetMap ... ODbL 1.0", "lastPlayed": None}
    (d / "meta.json").write_text(json.dumps(meta), "utf-8")
    return d
```

  `needs_ehr` skip as in `test_region.py`. Boot like `test_region.boot` but viewport 480x270, `?world=<id>&worldhost=<url>`, and wait for `window.__mm && window.__mm.sim`.
- [ ] **Step 2: tests** (one browser per test, each ≤ a few page loads):
  - `test_world_loads_from_the_host`: `__mm.region == "world:0123456789ab"`, `__mm.layout == "osm"`, `#region-world` visible with text "Testdorf", J opens and lists "Testkirche"; trial start button visible (race world).
  - `test_world_without_race_is_free_driving`: a `race=False` world: `#startbtn` and `#blitzbtn` hidden, `#huntbtn` visible, the car start is inside `treeBox` (not Hochrhein's), no checkpoint objects visible.
  - `test_download_world_zip`: `page.expect_download()` around `#worlddl`; open it with `zipfile`: names exactly `{world.json, terrain.mmh, meta.json, LICENSE-ODbL.txt}`, `world.json`/`terrain.mmh` bytes equal the fixture files, licence mentions ODbL.
  - `test_expired_link_offers_build_again`: no files for `RAW_ID`, `api/worlds/abcdefabcdef` serving `{"id": RAW_ID, "status": "expired", "bbox": {"lv95": [2666500, 1257750, 2670000, 1261750]}}`: `#worldgone` visible, `#buildagain` href ends with `editor.html?bbox=2666500,1257750,2670000,1261750`, `__mm.region == "hochrhein"`; "Drive Hochrhein instead" hides it and removes `world=` from the URL. Another id with no status file: `worldGoneUnknown` text, link without `bbox`. A `worldhost` pointing at a closed port: `worldOffline` text, no build link.
  - `test_upload_world_zip_plays_offline`: build a zip with Python `zipfile.ZIP_DEFLATED` from the fixture of a third id, start on plain Hochrhein, `set_input_files("#worldfile", path)`, expect navigation to `?world=<that id>`; the `worldhost` serves nothing for that id, so the world loaded from IndexedDB: `__mm.world.from == "file"`, `#worldforget` visible; click it and the page reloads into the expired panel (`worldGoneUnknown`).
  - `test_bad_zips_are_refused`: on one page, for each of: a 33 MB file, a text file renamed `.zip`, a zip with `../world.json`, a zip without `terrain.mmh`, a zip whose `terrain.mmh` has a bad magic, a zip whose `meta.json` id is `../../x`: `set_input_files`, wait for `#worldfilestatus` to change, assert it starts with "Not a usable world file" (English), no navigation happened, and `indexedDB` holds no `world:` key (`page.evaluate` over the `mapmadness`/`kv` keys).
  - `test_world_name_is_text`: a world named `<img src=x onerror="window.__xss=1">` (meta and region): `#region-world` `textContent` equals it, `document.querySelectorAll('#overlay img, #jumplist img, #jumpchips img, #toast img').length == 0`, `window.__xss` undefined after opening J.
- [ ] **Step 3:** `git push -u origin HEAD` first, then run in the foreground:

```bash
node --test prototype/tests/*.test.mjs
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_world.py prototype/tests/test_region.py prototype/tests/test_xss.py -x
```

  All green; a test failing three times: stop and report. Commit `test(region): generated worlds against a local world host (#167)`.

---

### Task 8: Changelog, docs, verify, PR

**Files:** modify `CHANGELOG.md`, `docs/11-pipeline-osm.md` (or the doc that describes `?region=`; `grep -rn "?region=" docs README.md`).

- [ ] **Step 1:** `CHANGELOG.md`, under `## [Unreleased]` → `### Added`: `- Worlds built with the region editor open in the game from their link (\`?world=…\`). **Download world** on the start screen saves the world as a zip file, and **Load world file** opens such a file again, even offline or after the link has expired. An expired link says so and offers to build the same world again.`
- [ ] **Step 2:** docs: a short section "Generated worlds (`?world=<id>`, #167)": the host constant and where phase 3 changes it, the URL layout (`/worlds/<id>/…`, `/api/worlds/<id>` status with `bbox.lv95`), the zip contents and limits, the storage keys, `?worldhost=` for local testing (localhost only).
- [ ] **Step 3:** run Task 7 Step 3's commands once more on the final branch (foreground, capped).
- [ ] **Step 4:** PR `feat(region): load a generated world with ?world=<id>, zip download and upload (editor phase 2)`, repo template, `Closes #167`. In the body: depends on #176 (merged: Task 1 Step 0), reads #166's format (fixtures stand in until real worlds exist), `WORLD_HOST` is a placeholder until #168 serves it (until then a `?world=` link shows the offline text, file upload works), the editor link targets #169's `editor.html?bbox=`.

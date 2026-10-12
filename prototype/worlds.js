/* worlds.js (#167): generated worlds (region editor phase 2) -- the id, the host, strict file checks, loading, zip in and out.
   Pure: no DOM; fetch and storage are passed in. Everything here treats world files as untrusted input. */
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

export const WORLD_HOST = 'https://rhyflitzer-api.freaxnx01.ch';
export const EDITOR_URL = '../editor.html';
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

/* ?worldhost= serves tests and local playtests only: honoured on a localhost page and only for a localhost target. */
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
  try { return { ...checkFiles(saved, id), from: 'file' }; } catch (e) { return null; }
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

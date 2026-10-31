/* #167: generated worlds -- checks, host, loader, zip. Pure: no DOM. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../worlds.js';
import { writeZip } from '../zip.js';

const ID = '0123456789ab';
const enc = (s) => new TextEncoder().encode(s);

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
  for (const s of ['0123456789AB', '0123456789a', '0123456789abc', '../etc/pa', '', null, 123]) assert.equal(W.isWorldId(s), false, String(s));
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

test('worldIdFromQuery / worldSearch', () => {
  assert.equal(W.worldIdFromQuery(`?world=${ID}`), ID);
  assert.equal(W.worldIdFromQuery(`?vehicle=delorean&world=${ID.toUpperCase()}`), ID);
  for (const q of ['', '?world=', '?world=../x', '?world=0123456789abc', '?region=ehrendingen']) assert.equal(W.worldIdFromQuery(q), null, q);
  assert.equal(W.worldSearch('?region=ehrendingen&vehicle=delorean', ID), `?vehicle=delorean&world=${ID}`);
});

test('worldHost: the constant, a local override only on a local page', () => {
  assert.equal(W.worldHost('https://github.freaxnx01.ch/game-rhyflitzer/?world=x'), W.WORLD_HOST);
  assert.equal(W.worldHost('https://github.freaxnx01.ch/game-rhyflitzer/?worldhost=http://127.0.0.1:9000'), W.WORLD_HOST);
  assert.equal(W.worldHost('http://127.0.0.1:8000/index.html?worldhost=http://127.0.0.1:9000/x'), 'http://127.0.0.1:9000');
  assert.equal(W.worldHost('http://localhost:8000/?worldhost=http://localhost:9001'), 'http://localhost:9001');
  for (const o of ['https://evil.example', 'javascript:alert(1)', 'not a url', 'file:///etc']) assert.equal(W.worldHost(`http://127.0.0.1:8000/?worldhost=${encodeURIComponent(o)}`), W.WORLD_HOST, o);
  assert.match(W.WORLD_HOST, /^https:\/\/[^/]+$/);
});

test('worldUrls and editorUrl', () => {
  const HOST = 'https://api.example';
  assert.deepEqual(W.worldUrls(HOST, ID), { world: `${HOST}/worlds/${ID}/world.json`, terrain: `${HOST}/worlds/${ID}/terrain.mmh`, meta: `${HOST}/worlds/${ID}/meta.json`, status: `${HOST}/api/worlds/${ID}` });
  assert.equal(W.editorUrl([2667000.4, 1259750, 2669000, 1261750]), `${W.EDITOR_URL}?bbox=2667000,1259750,2669000,1261750`);
  assert.equal(W.editorUrl(null), W.EDITOR_URL);
  assert.equal(W.editorUrl(['<x>', 1, 2, 3]), W.EDITOR_URL);
});

const HOST = 'https://api.example';
const files = () => ({ 'world.json': JSON.stringify(world()), 'terrain.mmh': mmh(), 'meta.json': JSON.stringify(meta()) });
const fakeFetch = (map, log = []) => async (url) => { log.push(url); if (map === 'offline') throw new TypeError('network'); const b = map[url]; return b === undefined ? new Response('', { status: 404 }) : new Response(b, { status: 200 }); };
const hosted = (id = ID) => Object.fromEntries(Object.entries(files()).map(([k, v]) => [`${HOST}/worlds/${id}/${k}`, v]));

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

test('unpackWorldZip refuses a too big file, missing parts and bad content', async () => {
  const code2 = async (p) => { try { await p; return 'ok'; } catch (e) { return e.code; } };
  assert.equal(await code2(W.unpackWorldZip(new ArrayBuffer(W.MAX_ZIP + 1))), 'too-big');
  const f = files();
  const noTerrain = await writeZip([{ name: 'world.json', data: enc(f['world.json']) }, { name: 'meta.json', data: enc(f['meta.json']) }]);
  assert.equal(await code2(W.unpackWorldZip(noTerrain)), 'bad-names');
  const badUtf8 = await writeZip([{ name: 'world.json', data: new Uint8Array([0xff, 0xfe]) }, { name: 'terrain.mmh', data: new Uint8Array(f['terrain.mmh']) }, { name: 'meta.json', data: enc(f['meta.json']) }]);
  assert.equal(await code2(W.unpackWorldZip(badUtf8)), 'bad-world');
  const evil = await writeZip([{ name: 'world.json', data: enc(f['world.json']) }, { name: 'terrain.mmh', data: new Uint8Array(f['terrain.mmh']) }, { name: 'meta.json', data: enc(JSON.stringify(meta({ id: '../x' }))) }]);
  assert.equal(await code2(W.unpackWorldZip(evil)), 'bad-meta');
});

// #169: the editor's API contract (phase 3, #168) as pure functions. node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORLD_HOST } from '../worlds.js';
import { API_BASE, GAME_URL, WMTS_URL, jobsUrl, challengeUrl, parsePreview, parseMeta, jobUrl, fileUrl, metaUrl, previewUrl, shareUrl, driveUrl, identifyUrl, isWorldId, STATUSES, STEPS, parseJob, errorKey, failKey, pollDelay, gemeindeName } from '../../editor/api.js';

const ID = '0123456789ab', EHR = [2667000, 1259750, 2669000, 1261750];

test('URLs: everything hangs off the one API_BASE; the share link is the game root; Drive is relative', () => {
  assert.match(API_BASE, /^https:\/\/[^/]+$/);
  assert.equal(API_BASE, WORLD_HOST);   // one host in the repo: the game's
  assert.equal(GAME_URL, 'https://github.freaxnx01.ch/game-rhyflitzer/');
  assert.equal(jobsUrl(), `${API_BASE}/api/jobs`);
  assert.equal(challengeUrl(), `${API_BASE}/api/challenge`);
  assert.equal(jobUrl(ID), `${API_BASE}/api/jobs/${ID}`);   // progress; /api/worlds/<id> is #167's tombstone, not read here
  assert.equal(previewUrl(EHR), `${API_BASE}/api/preview?bbox=2667000,1259750,2669000,1261750`);
  assert.equal(fileUrl(ID, 'world.json'), `${API_BASE}/worlds/${ID}/world.json`);   // #168 has no zip route
  assert.equal(metaUrl(ID), `${API_BASE}/worlds/${ID}/meta.json`);
  assert.equal(shareUrl(ID), `https://github.freaxnx01.ch/game-rhyflitzer/?world=${ID}`);
  assert.equal(driveUrl(ID), `../?world=${ID}`);
  assert.match(WMTS_URL, /^https:\/\/wmts\.geo\.admin\.ch\/1\.0\.0\/ch\.swisstopo\.pixelkarte-farbe\/default\/current\/3857\/\{z\}\/\{x\}\/\{y\}\.jpeg$/);
  const u = new URL(identifyUrl([2668000, 1260750], 2026));
  assert.equal(u.origin + u.pathname, 'https://api3.geo.admin.ch/rest/services/api/MapServer/identify');
  assert.equal(u.searchParams.get('geometry'), '2668000,1260750'); assert.equal(u.searchParams.get('sr'), '2056');
  assert.equal(u.searchParams.get('layers'), 'all:ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill'); assert.equal(u.searchParams.get('timeInstant'), '2026');
  assert.equal(u.searchParams.get('returnGeometry'), 'false'); assert.equal(u.searchParams.get('tolerance'), '0');
});

test('isWorldId: 12 lowercase hex, nothing else goes into a URL', () => {
  assert.equal(isWorldId(ID), true);
  for (const s of ['', '0123456789AB', '0123456789a', '0123456789abc', '../x', '0123456789a<', null, undefined, 12]) assert.equal(isWorldId(s), false, String(s));
  for (const f of [jobUrl, metaUrl, shareUrl, driveUrl, (id) => fileUrl(id, 'world.json')]) assert.throws(() => f('../x'), /world id/);
});

test('parseJob: maps #168 state + step onto the page status, throws on an unknown state', () => {
  const job = (o) => ({ id: ID, state: 'queued', step: null, error: null, message: null, lv95: EHR, ...o });
  assert.deepEqual(parseJob(job({ position: 3 })), { id: ID, status: 'queued', position: 3, reason: null });
  assert.equal(parseJob(job({ state: 'building' })).status, 'cutting');   // no STEP line yet
  for (const [step, status] of [['cutting', 'cutting'], ['terrain', 'terrain'], ['world', 'world'], ['places', 'race'], ['done', 'race']]) {   // the build never emits 'race' itself
    assert.equal(parseJob(job({ state: 'building', step })).status, status, step);
  }
  assert.equal(parseJob(job({ state: 'ready', step: 'done', files: `/worlds/${ID}/` })).status, 'done');
  assert.deepEqual(parseJob(job({ state: 'failed', error: 'too-complex', message: 'x' })), { id: ID, status: 'failed', position: null, reason: 'too-complex' });
  assert.equal(parseJob(job({ state: 'expired' })).status, 'expired');
  assert.equal(parseJob(job({ position: 'x' })).position, null);   // wrong types become null, never rendered
  assert.deepEqual(STATUSES, ['queued', 'cutting', 'terrain', 'world', 'race', 'done', 'failed', 'expired']);
  assert.deepEqual(STEPS, ['queued', 'cutting', 'terrain', 'world', 'race', 'done']);
  for (const bad of [null, {}, { id: ID }, job({ state: 'done' }), job({ state: 'constructor' }), job({ id: 'nope' }), 'ready']) assert.throws(() => parseJob(bad), /job/, JSON.stringify(bad));
});

test('parseMeta: the final name and whether the world has a race (null when unknown)', () => {
  assert.deepEqual(parseMeta({ id: ID, name: 'Ehrendingen · Freienwil', race: true }), { name: 'Ehrendingen · Freienwil', race: true });
  assert.deepEqual(parseMeta({ name: 7, race: 'yes' }), { name: null, race: null });
  assert.deepEqual(parseMeta(null), { name: null, race: null });
});

test('errorKey: HTTP status + #168 error code -> string key; failKey: a failed job error -> string key', () => {
  assert.equal(errorKey(400, { error: 'outside-ch' }), 'errOutsideCh');
  for (const e of ['too-big', 'too-small', 'bad-bbox', 'bad-request']) assert.equal(errorKey(400, { error: e }), 'errBadFrame');
  assert.equal(errorKey(400, {}), 'errBadFrame');
  assert.equal(errorKey(429, { error: 'one-at-a-time' }), 'errOneAtATime');
  assert.equal(errorKey(429, { error: 'daily-limit' }), 'errRateLimit');
  assert.equal(errorKey(429, { error: 'server-daily-limit' }), 'errServerDaily');
  assert.equal(errorKey(429, null), 'errRateLimit');
  assert.equal(errorKey(503, { error: 'busy' }), 'errBusy');
  assert.equal(errorKey(503, { error: 'human-check-unavailable' }), 'errServer');
  for (const s of [0, 500, 502, 404, 413, 418]) assert.equal(errorKey(s, null), 'errServer', String(s));
  assert.equal(errorKey(413, { error: 'too-large' }), 'errServer');
  assert.equal(failKey('too-complex'), 'errTooComplex');
  assert.equal(failKey('source-unreachable'), 'errSource');
  assert.equal(failKey('outside-ch'), 'errOutsideCh');   // the pipeline's own frame check can fail a build
  for (const r of ['too-big', 'too-small', 'bad-bbox']) assert.equal(failKey(r), 'errBadFrame', r);
  assert.equal(failKey('expired'), 'errExpired');
  for (const r of ['timeout', 'build-failed', 'anything', null]) assert.equal(failKey(r), 'errBuildFailed', String(r));
});

test('human check: 403 maps to errHuman; the preview is read as raceOk true/false/null plus id and exists', () => {
  assert.equal(errorKey(403, { error: 'human_check_failed' }), 'errHuman');
  assert.equal(errorKey(403, null), 'errHuman');
  assert.deepEqual(parsePreview({ id: ID, exists: false, name: 'Ehrendingen', gemeinden: ['Ehrendingen'], raceOk: false }), { name: 'Ehrendingen', raceOk: false, id: ID, exists: false, gemeinden: ['Ehrendingen'] });
  assert.deepEqual(parsePreview({ id: ID, exists: true, name: null, gemeinden: [], raceOk: true, reason: 'x' }), { name: null, raceOk: true, id: ID, exists: true, gemeinden: [] });
  assert.equal(parsePreview({ id: 'nope', exists: true }).exists, false);   // no valid id, no skipped human check
  assert.equal(parsePreview({ id: ID, exists: 'yes' }).exists, false);
  assert.deepEqual(parsePreview({ gemeinden: ['A', 7, null, 'B'] }).gemeinden, ['A', 'B']);   // only strings survive
  assert.deepEqual(parsePreview({ gemeinden: 'A' }).gemeinden, []);
  assert.deepEqual(parsePreview(null).gemeinden, []);
  for (const j of [null, {}, { raceOk: null, reason: 'no-road-index' }, { raceOk: 'yes' }, { name: 7, raceOk: 1 }, 'x']) assert.equal(parsePreview(j).raceOk, null, JSON.stringify(j));
  assert.equal(parsePreview({ name: 7 }).name, null);
});

test('pollDelay: 2 s in the first minute, 5 s afterwards', () => {
  assert.equal(pollDelay(0), 2000); assert.equal(pollDelay(59999), 2000); assert.equal(pollDelay(60000), 5000); assert.equal(pollDelay(1e7), 5000);
});

test('gemeindeName: the current year wins, else the first, null when empty or malformed', () => {
  const r = (jahr, cur, gemname) => ({ attributes: { jahr, is_current_jahr: cur, gemname } });
  assert.equal(gemeindeName({ results: [r(2006, false, 'Oberehrendingen'), r(2026, true, 'Ehrendingen')] }), 'Ehrendingen');
  assert.equal(gemeindeName({ results: [r(2025, false, 'Ehrendingen')] }), 'Ehrendingen');
  for (const j of [{ results: [] }, {}, null, { results: [{ attributes: { gemname: 7 } }] }]) assert.equal(gemeindeName(j), null);
});

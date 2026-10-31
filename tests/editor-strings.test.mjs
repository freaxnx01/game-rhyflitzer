// #169: the editor's string table. Same rules as strings.test.mjs (#9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, translate, numberLocale, formatKm } from '../editor/strings.js';

const render = (v) => (typeof v === 'function' ? v(...Array(v.length).fill('x')) : v);

test('English and German have exactly the same keys, same types and arity', () => {
  assert.deepEqual(Object.keys(STRINGS.de).sort(), Object.keys(STRINGS.en).sort());
  for (const key of Object.keys(STRINGS.en)) {
    const en = STRINGS.en[key], de = STRINGS.de[key];
    assert.ok(['string', 'function'].includes(typeof en), key); assert.equal(typeof de, typeof en, key);
    if (typeof en === 'function') assert.equal(de.length, en.length, key);
  }
});

test('Swiss spelling, no markup in any string (the page renders with textContent)', () => {
  for (const lang of ['en', 'de']) for (const [key, value] of Object.entries(STRINGS[lang])) {
    assert.ok(!render(value).includes('ß'), key); assert.ok(!/[<>]/.test(render(value)), `${lang}.${key} has markup`);
  }
});

test('every error key of api.js and every step has a string', () => {
  for (const k of ['errOutsideCh', 'errBadFrame', 'errRateLimit', 'errBusy', 'errTooComplex', 'errSource', 'errBuildFailed', 'errServer', 'errHuman', 'errExpired', 'verifying', 'humanNote',
    'stepQueued', 'stepCutting', 'stepTerrain', 'stepWorld', 'stepRace', 'stepDone']) assert.ok(k in STRINGS.en, k);
});

test('translate picks the language, falls back to English, then to the key; names pass through', () => {
  assert.equal(translate('de', 'build'), 'Bauen'); assert.equal(translate('en', 'build'), 'Build'); assert.equal(translate('fr', 'build'), 'Build');
  assert.equal(translate('de', 'nope'), 'nope');
  assert.equal(translate('en', 'sizeKm', 2.5, 3), '2.5 × 3 km'); assert.equal(translate('de', 'queuedAt', 3), 'In der Warteschlange (Nr. 3)');
});

test('formatKm: the region of the browser decides, de without a region is de-CH, a broken tag falls back', () => {
  assert.equal(formatKm(2.5, 'de', 'de-DE'), '2,5');
  assert.equal(formatKm(2.5, 'de', 'de-CH'), '2.5');
  assert.equal(formatKm(2.5, 'de', 'en-US'), '2.5');   // page language de, browser en: de-CH
  assert.equal(formatKm(2.5, 'en', 'en-GB'), '2.5');
  assert.equal(formatKm(3, 'en', ''), '3');
  assert.equal(formatKm(2.25, 'en', 'x_@@'), '2.25');   // invalid tag: no throw
  assert.equal(numberLocale('de', 'de'), 'de-CH'); assert.equal(numberLocale('en', undefined), 'en');
});

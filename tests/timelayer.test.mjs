import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEraKey, eraAvailable, clearExempt, eraShown } from '../timelayer.js';
import { translate } from '../strings.js';

test('isEraKey: Ctrl+Y by letter; a US key on QWERTZ does not count', () => {
  assert.equal(isEraKey({ key: 'y', ctrlKey: true }), true);
  assert.equal(isEraKey({ key: 'Y', ctrlKey: true }), true);
  assert.equal(isEraKey({ key: 'y', ctrlKey: false }), false);
  assert.equal(isEraKey({ key: 'z', code: 'KeyY', ctrlKey: true }), false);
});

test('eraAvailable: only a world with an era block', () => {
  assert.equal(eraAvailable({ era: { year: 1952 } }), true);
  assert.equal(eraAvailable({}), false);
  assert.equal(eraAvailable(null), false);
});

test('clearExempt: drops modern where keep holds and counts them', () => {
  const bs = [{ id: 1, modern: true }, { id: 2, modern: true }, { id: 3 }];
  assert.equal(clearExempt(bs, b => b.id === 1), 1);
  assert.equal('modern' in bs[0], false);
  assert.equal(bs[1].modern, true);
});

test('eraShown: a modern entry hides while the layer is on', () => {
  assert.equal(eraShown({ modern: true }, true), false);
  assert.equal(eraShown({ modern: true }, false), true);
  assert.equal(eraShown({}, true), true);
});

test('strings: era texts exist in en and de', () => {
  for (const lang of ['en', 'de']) for (const k of ['eraOn', 'eraOff', 'eraNone', 'eraNoDelivery', 'keyEra', 'aboutGwr']) assert.notEqual(translate(lang, k), k, `${lang}.${k}`);
  assert.match(translate('en', 'eraOn'), /Ctrl\+Y/);
  assert.match(translate('de', 'eraOn'), /Ctrl\+Y/);
});

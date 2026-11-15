// #979: funny default player names. Pure module, so node --test can import it without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePool, funnyName, uniqueFunnyName } from '../netnames.js';
import { STRINGS } from '../strings.js';
import { NAME_MAX } from '../netcodec.js';

const POOL = ['Turbo Tony', 'Pedal Pete', 'Idle Ida'];

test('pools_bothLanguages_fourteenShortDistinctNames', () => {
  for (const lang of ['en', 'de']) {
    const pool = parsePool(STRINGS[lang].mpFunnyNames);
    assert.equal(pool.length, 14, lang);
    assert.equal(new Set(pool.map((n) => n.toLowerCase())).size, 14, lang);
    assert.ok(pool.every((n) => n.length >= 3 && n.length <= 17 && n.length + 2 <= NAME_MAX), lang);
  }
});

test('funnyName_rndPicksByIndex', () => {
  assert.equal(funnyName(POOL, () => 0), 'Turbo Tony');
  assert.equal(funnyName(POOL, () => 0.99), 'Idle Ida');
});

test('uniqueFunnyName_takenIgnoringCase_picksAFreeOne', () => {
  for (let i = 0; i < 20; i++) assert.notEqual(uniqueFunnyName(POOL, ['turbo tony', ' PEDAL PETE ']), 'Turbo Tony');
  assert.equal(uniqueFunnyName(POOL, ['turbo tony', 'Pedal Pete']), 'Idle Ida');
});

test('uniqueFunnyName_poolExhausted_numberedSuffix', () => {
  const name = uniqueFunnyName(POOL, [...POOL, 'Turbo Tony 2'], () => 0);
  assert.equal(name, 'Turbo Tony 3');
});
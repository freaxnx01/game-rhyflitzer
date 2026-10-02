// #9: the UI string table. Pure module, so node --test can import it without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, translate } from '../strings.js';

const render = (v) => (typeof v === 'function' ? v(...Array(v.length).fill('x')) : v);

test('English and German have exactly the same keys', () => {
  assert.deepEqual(Object.keys(STRINGS.de).sort(), Object.keys(STRINGS.en).sort());
});

test('every value is a string or a function in both languages, and functions agree on arity', () => {
  for (const key of Object.keys(STRINGS.en)) {
    const en = STRINGS.en[key], de = STRINGS.de[key];
    assert.ok(['string', 'function'].includes(typeof en), key);
    assert.equal(typeof de, typeof en, key);
    if (typeof en === 'function') assert.equal(de.length, en.length, key);
  }
});

test('German strings use Swiss spelling (no sharp s)', () => {
  for (const [key, value] of Object.entries(STRINGS.de)) assert.ok(!render(value).includes('ß'), key);
});

test('translate picks the language, falls back to English, then to the key', () => {
  assert.equal(translate('de', 'fishes'), 'Grüss mir die Fische!');
  assert.equal(translate('en', 'fishes'), 'Sleep with the fishes!');
  assert.equal(translate('fr', 'fishes'), 'Sleep with the fishes!');
  assert.equal(translate(undefined, 'fishes'), 'Sleep with the fishes!');
  assert.equal(translate('de', 'no-such-key'), 'no-such-key');
});

test('function values interpolate their arguments; names pass through untouched', () => {
  assert.equal(translate('de', 'cpTarget', 2, 'Bahnhof Sisseln'), 'Checkpoint 2 · Bahnhof Sisseln');
  assert.equal(translate('en', 'finishTarget', 'Münsterplatz'), 'Finish · Münsterplatz');
  assert.equal(translate('de', 'finishTarget', 'Münsterplatz'), 'Ziel · Münsterplatz');
  assert.equal(translate('en', 'camera', translate('en', 'camNear')), 'Camera: Chase near');
  assert.equal(translate('de', 'camera', translate('de', 'camNear')), 'Kamera: Verfolger nah');
  assert.equal(translate('en', 'best', null), 'Best —');
  assert.equal(translate('de', 'best', '01:02.3'), 'Bestzeit 01:02.3');
  assert.equal(translate('de', 'cpToast', 3, 'Smile-Kreisel'), 'Checkpoint 3/5<br><span style="font-size:17px">Smile-Kreisel</span>');
});

test('English texts stay exactly as the existing tests expect', () => {
  assert.ok(translate('en', 'terrainMeasured', false, 100, 50, 10, 'swisstopo').startsWith('Terrain: measured ·'));
  assert.ok(translate('en', 'terrainMeasured', true, 100, 50, 10, 'swisstopo').includes('(your file)'));
  assert.ok(translate('en', 'worldHand').includes('traced by hand'));
  assert.equal(translate('en', 'randomSpot'), 'Random spot');
  assert.equal(translate('en', 'chipAll'), 'All');
  assert.ok(translate('en', 'keyZoom').includes('zoom the map') && translate('en', 'keyZoom').includes('double-click'));
  assert.equal(translate('en', 'keySignals'), 'Turn signals left · right');
  assert.equal(translate('en', 'keyNitro'), 'Nitro (hold)');
  assert.ok(translate('en', 'worldOsm', 7, 9, 'OSM').startsWith('World: OpenStreetMap · 7 roads · 9 buildings ·'));
});

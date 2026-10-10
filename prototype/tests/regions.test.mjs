// #127: the region table and its URL helpers. Pure: no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS, DEFAULT_REGION, regionFromQuery, regionSearch } from '../regions.js';
import { STRINGS } from '../strings.js';
import { VILLAGES, BORDER_DE } from '../world.js';
import { GEMEINDEN, LANDMARK_INFO } from '../landmarks.js';

test('regionFromQuery: default, case-insensitive, unknown falls back', () => {
  assert.equal(DEFAULT_REGION, 'hochrhein');
  assert.equal(regionFromQuery(''), 'hochrhein');
  assert.equal(regionFromQuery('?region=ehrendingen'), 'ehrendingen');
  assert.equal(regionFromQuery('?vehicle=delorean&region=Ehrendingen'), 'ehrendingen');
  assert.equal(regionFromQuery('?region=atlantis'), 'hochrhein');
});

test('regionSearch keeps other parameters and drops region for the default', () => {
  assert.equal(regionSearch('?vehicle=delorean&debug', 'ehrendingen'), '?vehicle=delorean&debug=&region=ehrendingen');
  assert.equal(regionSearch('?region=ehrendingen&vehicle=delorean', 'hochrhein'), '?vehicle=delorean');
  assert.equal(regionSearch('?region=ehrendingen', 'hochrhein'), '');
});

test('Hochrhein keeps exactly today\'s values', () => {
  const h = REGIONS.hochrhein;
  assert.equal(h.world, '../data/world_hochrhein.json');
  assert.equal(h.terrain, '../data/terrain_hochrhein.mmh');
  assert.equal(h.idbKey, 'terrain');
  assert.equal(h.bestKey, 'mm.best2');
  assert.deepEqual(h.treeBox, [-3100, 3100, -1800, 1900]);
  assert.equal(h.forestAbove, 18);
  assert.equal(h.handFallback, true);
  assert.equal(h.villages, VILLAGES); assert.equal(h.gemeinden, GEMEINDEN); assert.equal(h.landmarks, LANDMARK_INFO);
  assert.deepEqual(h.strings, { intro: 'intro', finished: 'finishedText', blurb: 'blurbOsm' });
});

test('the national border names are per region: Hochrhein has them, Ehrendingen has no border (#73)', () => {
  assert.equal(REGIONS.hochrhein.borderDe, BORDER_DE);
  assert.deepEqual(REGIONS.ehrendingen.borderDe, []);
});

test('every region is complete and its string keys exist', () => {
  for (const [id, r] of Object.entries(REGIONS)) {
    assert.equal(r.id, id);
    for (const k of ['name', 'world', 'terrain', 'idbKey', 'bestKey', 'villages', 'gemeinden', 'landmarks', 'treeBox', 'forestAbove']) assert.ok(r[k] !== undefined, `${id}.${k}`);
    for (const key of Object.values(r.strings)) { assert.ok(key in STRINGS.en, key); assert.ok(key in STRINGS.de, key); }
  }
  assert.notEqual(REGIONS.ehrendingen.idbKey, REGIONS.hochrhein.idbKey);
  assert.notEqual(REGIONS.ehrendingen.bestKey, REGIONS.hochrhein.bestKey);
  assert.equal(REGIONS.ehrendingen.handFallback, false);
});

// The loading screen's stages. Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOAD_STAGES, loadLines, loadProgress, numberLocale } from '../loading.js';
import { translate } from '../strings.js';

test('loadProgress_FirstStage_StartsAtZero_LastStageShortOfFull', () => {
  assert.deepEqual(loadProgress(LOAD_STAGES[0]), { step: 1, of: LOAD_STAGES.length, fraction: 0 });
  const last = loadProgress(LOAD_STAGES.at(-1));
  assert.equal(last.step, LOAD_STAGES.length);
  assert.ok(last.fraction < 1 && last.fraction > 0.9, last);
});

test('loadProgress_UnknownStage_Throws', () => {
  assert.throws(() => loadProgress('nope'), /unknown load stage/);
});

test('loadProgress_StagesRiseInOrder', () => {
  const f = LOAD_STAGES.map(s => loadProgress(s).fraction);
  assert.deepEqual([...f].sort((a, b) => a - b), f);
});

test('loadStrings_EveryStageHasAMessage_InBothLanguages', () => {
  for (const lang of ['en', 'de']) for (const s of LOAD_STAGES) {
    const msg = translate(lang, `load_${s}`, { roads: '3673', houses: '3077', robidogs: '83', lamps: '1952' });
    assert.ok(typeof msg === 'string' && msg.length > 10 && !msg.startsWith('load_'), `${lang} ${s}: ${msg}`);
  }
});

test('loadStrings_CountsShowWhenKnown_AndAreLeftOutWithoutThem', () => {
  assert.match(translate('de', 'load_props', { robidogs: '83', lamps: '1952' }), /83 Robidogs/);
  assert.doesNotMatch(translate('de', 'load_props', {}), /undefined/);
  assert.match(translate('en', 'load_houses', { houses: '3077' }), /3077/);
  assert.doesNotMatch(translate('en', 'load_houses', {}), /undefined/);
});

test('numberLocale_FollowsTheOsRegion_GermanWithoutRegionFallsBackToSwiss', () => {
  assert.equal(numberLocale('de', 'de'), 'de-CH');
  assert.equal(numberLocale('de', 'de-DE'), 'de-DE');
  assert.equal(numberLocale('de', 'en-US'), 'en-US');
  assert.equal(numberLocale('en', 'en-US'), 'en-US');
  assert.equal(numberLocale('en', 'de-CH'), 'de-CH');
});

test('loadLines_AllStagesInOrder_WithAndWithoutCounts', () => {
  const t = (key, args) => translate('de', key, args);
  const counts = { roads: { roads: "1'234" }, props: { robidogs: '83', lamps: '1952' } };
  const lines = loadLines(t, counts);
  assert.equal(lines.length, LOAD_STAGES.length);
  assert.deepEqual(lines, LOAD_STAGES.map(s => translate('de', `load_${s}`, counts[s] || {})));
  assert.match(lines[LOAD_STAGES.indexOf('roads')], /1'234 Strassen/);
  assert.match(lines[LOAD_STAGES.indexOf('props')], /83 Robidogs/);
  assert.equal(lines[LOAD_STAGES.indexOf('houses')], 'Häuser aufstellen, Geranien giessen …');
  for (const l of lines) assert.doesNotMatch(l, /undefined|^load_/);
});

test('loadLines_NoCountsAtAll_GivesTheLinesWithoutNumbers', () => {
  const lines = loadLines((key, args) => translate('en', key, args), {});
  assert.equal(lines[0], 'Fetching the map from OpenStreetMap …');
  assert.equal(lines[LOAD_STAGES.indexOf('roads')], 'Paving the roads, still warm …');
});

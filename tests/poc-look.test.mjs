import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIME_ORDER, nextTimePreset, roadWetness, isLookKey } from '../poc/webgpu/js/poc-look.js';

test('nextTimePreset_cycles', () => {
  assert.equal(nextTimePreset('golden'), 'midday');
  assert.equal(nextTimePreset('midday'), 'twilight');
  assert.equal(nextTimePreset('twilight'), 'midnight');
  assert.equal(nextTimePreset('midnight'), 'golden');
});

test('nextTimePreset_unknown_golden', () => {
  assert.equal(nextTimePreset('nope'), 'golden');
});

test('roadWetness_dry_keepsPreset', () => {
  assert.equal(roadWetness(0.08, false), 0.08);
});

test('roadWetness_wet_raisesToFloor', () => {
  assert.equal(roadWetness(0.08, true), 0.9);
});

test('roadWetness_wetAcrossPresets_staysWet', () => {
  assert.equal(TIME_ORDER.length, 4);
  for (const preset of [0.28, 0.08, 0.55, 0.62]) assert.equal(roadWetness(preset, true), 0.9);
});

test('isLookKey_plainT_time', () => {
  assert.equal(isLookKey({ code: 'KeyT' }), 'time');
});

test('isLookKey_plainR_wet', () => {
  assert.equal(isLookKey({ code: 'KeyR' }), 'wet');
});

test('isLookKey_withModifierOrRepeat_ignored', () => {
  for (const mod of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { repeat: true }]) {
    assert.equal(isLookKey({ code: 'KeyT', ...mod }), null);
  }
});

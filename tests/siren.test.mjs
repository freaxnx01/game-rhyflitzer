// The Rhy Blaze's siren and blue lights. Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIREN, hasSiren, toggleSiren, sirenNote, beaconLevels, beaconGlow } from '../siren.js';

test('hasSiren_OnlyAVehicleWithASirenEntry', () => {
  assert.equal(hasSiren({ siren: SIREN }), true);
  assert.equal(hasSiren({}), false);
});

test('toggleSiren_SwitchesOnAndOff_OnAFireEngine', () => {
  assert.equal(toggleSiren(false, { siren: SIREN }), true);
  assert.equal(toggleSiren(true, { siren: SIREN }), false);
});

test('toggleSiren_StaysOff_OnACarWithoutOne', () => {
  assert.equal(toggleSiren(false, {}), false);
});

test('sirenNote_TwoTones_TakeTurnsEveryStep', () => {
  const { notes, step } = SIREN;
  assert.equal(notes.length, 2);
  assert.ok(notes[1] > notes[0], 'the second tone is the higher one: ta-tü');
  assert.equal(sirenNote(0), notes[0]);
  assert.equal(sirenNote(step * 1.5), notes[1]);
  assert.equal(sirenNote(step * 2.5), notes[0]);
});

test('beaconLevels_TheTwoSidesFlashInTurn_NeverTogether', () => {
  const seen = [false, false];
  for (let t = 0; t < SIREN.flash * 2; t += 0.01) {
    const [left, right] = beaconLevels(t);
    assert.ok(!(left && right), `both lit at ${t}`);
    if (left) seen[0] = true;
    if (right) seen[1] = true;
  }
  assert.deepEqual(seen, [true, true]);
});

test('beaconLevels_EachSideFlashesTwicePerTurn', () => {
  let flashes = 0, was = 0;
  for (let t = 0; t < SIREN.flash; t += 0.005) { const [left] = beaconLevels(t); if (left && !was) flashes++; was = left; }
  assert.equal(flashes, 2);
});

test('beaconGlow_OffIsAFaintBlue_AFlashIsBright', () => {
  assert.ok(beaconGlow(0) > 0 && beaconGlow(1) > beaconGlow(0) * 10);
});

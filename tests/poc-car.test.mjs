import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAR_URL, TAXI_LENGTH_M, fitScale, setLampsLit, lampMaterials, isNightPreset } from '../poc/webgpu/js/poc-car.js';

test('fitScale_halfLength_doubles', () => {
  assert.equal(fitScale(2.5, 5.05), 2.02);
});

test('fitScale_zero_throws', () => {
  assert.throws(() => fitScale(0, 5.05), RangeError);
});

test('fitScale_negative_throws', () => {
  assert.throws(() => fitScale(-1, 5.05), RangeError);
});

test('constants_match_brief', () => {
  assert.equal(CAR_URL, '../../assets/bulldog.glb');
  assert.equal(TAXI_LENGTH_M, 5.05);
});

test('setLampsLit_on_setsEmissive', () => {
  const lamps = [{ emissiveIntensity: 0 }, { emissiveIntensity: 0 }];
  setLampsLit(lamps, true);
  assert.deepEqual(lamps.map((l) => l.emissiveIntensity), [3, 3]);
});

test('setLampsLit_off_zero', () => {
  const lamps = [{ emissiveIntensity: 3 }];
  setLampsLit(lamps, false);
  assert.equal(lamps[0].emissiveIntensity, 0);
});

test('lampMaterials_picksHeadAndTailOnly', () => {
  const head = { userData: { lamp: 'head' } };
  const tail = { userData: { lamp: 'tail' } };
  const other = { userData: { glass: true } };
  const bare = {};
  assert.deepEqual(lampMaterials([head, other, tail, bare, head]), [head, tail]);
});

test('isNightPreset_twilightAndMidnightOnly', () => {
  assert.equal(isNightPreset('twilight'), true);
  assert.equal(isNightPreset('midnight'), true);
  assert.equal(isNightPreset('golden'), false);
  assert.equal(isNightPreset('midday'), false);
});

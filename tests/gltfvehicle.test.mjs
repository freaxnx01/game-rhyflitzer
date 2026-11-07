// #709: which materials of a glTF vehicle are drawn from both sides. Pure module, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doubleSidedNames } from '../gltfvehicle.js';

const def = (list) => ({ gltf: { id: 'bus', url: './assets/bus.glb', fallback: 'bus', ...(list ? { doubleSided: list } : {}) } });

test('doubleSidedNames: none listed gives an empty list', () => {
  assert.deepEqual(doubleSidedNames(def(), ['Body', 'Plain_7']), []);
});
test('doubleSidedNames: returns the listed names that the model has', () => {
  assert.deepEqual(doubleSidedNames(def(['Plain_7']), ['Body', 'Plain_7']), ['Plain_7']);
});
test('doubleSidedNames: a listed name the model lacks fails fast', () => {
  assert.throws(() => doubleSidedNames(def(['Plain_7']), ['Body']), /Plain_7 missing/);
});
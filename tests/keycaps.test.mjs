// #700: key caps as key graphics -- a cap token as <kbd> HTML
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capKeys, capsRow, capsCross } from '../keycaps.js';

test('capKeys_Clusters_SplitIntoFourKeys', () => {
  assert.deepEqual(capKeys('WASD'), ['W', 'A', 'S', 'D']);
  assert.deepEqual(capKeys('Arrows'), ['↑', '←', '↓', '→']);
});

test('capKeys_SingleKey_IsOneKey', () => {
  assert.deepEqual(capKeys('Shift'), ['Shift']);
  assert.deepEqual(capKeys('Z'), ['Z']);
});

test('capsRow_Wasd_IsFourKbdInARow', () => {
  assert.equal(capsRow('WASD'), '<span class="caps"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span>');
});

test('capsRow_SingleKey_IsOneKbd', () => {
  assert.equal(capsRow('F1'), '<span class="caps"><kbd>F1</kbd></span>');
});

test('capsCross_Arrows_IsACrossOfFourKbd', () => {
  assert.equal(capsCross('Arrows'), '<span class="caps cross"><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></span>');
});

test('capsCross_SingleKey_FallsBackToTheRow', () => {
  assert.equal(capsCross('Space'), capsRow('Space'));
});

test('capsRow_MarkupInTheLabel_IsEscaped', () => {
  assert.equal(capsRow('<b>&'), '<span class="caps"><kbd>&lt;b&gt;&amp;</kbd></span>');
});
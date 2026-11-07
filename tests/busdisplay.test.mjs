import test from 'node:test';
import assert from 'node:assert/strict';
import { DISPLAY_TEX, displayLayout } from '../busdisplay.js';

const measure = (text, size) => text.length * size * 0.55;   // a fixed-width fake font

test('displayLayout_ShortTexts_KeepFullSize', () => {
  const l = displayLayout({ line: '133', dest: 'Frick' }, measure);
  assert.equal(l.line.size, 0.75 * DISPLAY_TEX.h);
  assert.equal(l.dest.size, 0.75 * DISPLAY_TEX.h);
});

test('displayLayout_LineNumber_StaysInsideTheRearWindow', () => {
  for (const line of ['7', '133', '811', '1234']) {
    const l = displayLayout({ line, dest: 'x' }, measure);
    assert.ok(l.line.x + measure(line, l.line.size) <= 0.205 * DISPLAY_TEX.w, line);
  }
});

test('displayLayout_LongDestination_ShrinksToFit', () => {
  const dest = 'Stein-Säckingen, Bahnhof (Umleitung über Rheinfelden)';
  const l = displayLayout({ line: '133', dest }, measure);
  assert.ok(l.dest.size < 0.75 * DISPLAY_TEX.h);
  assert.ok(l.dest.x + measure(dest, l.dest.size) <= 0.984 * DISPLAY_TEX.w);
});

test('displayLayout_Destination_StartsRightOfTheRearWindow', () => {
  const l = displayLayout({ line: '133', dest: 'Frick' }, measure);
  assert.ok(l.dest.x > 0.22 * DISPLAY_TEX.w);
});

test('displayLayout_ImpossibleWidth_StopsAtMinimumSize', () => {
  const l = displayLayout({ line: '133', dest: 'x'.repeat(500) }, measure);
  assert.equal(l.dest.size, 20);
});

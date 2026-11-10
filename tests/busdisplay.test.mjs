import test from 'node:test';
import assert from 'node:assert/strict';
import { DISPLAY_TEX, displayLayout, REAR_TEX, SMILEY, rearLayout, thanksLayout, splitRearTriangles, normalizeUv } from '../busdisplay.js';

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

// #800
test('rearLayout_LineNumber_CentredAndFits', () => {
  const l = rearLayout('1234', measure);
  assert.equal(l.x, REAR_TEX.w / 2);
  assert.ok(measure('1234', l.size) <= 0.92 * REAR_TEX.w);
});

test('thanksLayout_TextFitsAndSitsBelowTheSmiley', () => {
  for (const text of ['Vielen Dank!', 'Thank you!']) {
    const l = thanksLayout(text, measure);
    assert.ok(measure(text, l.text.size) <= 0.92 * REAR_TEX.w, text);
    assert.ok(l.smiley.y + 7 * l.smiley.cell < l.text.y - 0.5 * l.text.size);
  }
  assert.ok(SMILEY.length === 7 && SMILEY.every((r) => r.length === 7));
});

// two quads: the tail at x = -5.8 (vertices 0-3) and the nose at x = 5.8 (4-7)
const POS = [-5.8, 2.5, -0.2, -5.8, 2.5, 0.2, -5.8, 2.8, 0.2, -5.8, 2.8, -0.2, 5.8, 2.4, -1, 5.8, 2.4, 1, 5.8, 2.7, 1, 5.8, 2.7, -1];
const IDX = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];
test('splitRearTriangles_TwoQuads_SeparatesTheTail', () => {
  const { rear, rest } = splitRearTriangles(POS, IDX);
  assert.deepEqual(rear, [0, 1, 2, 0, 2, 3]);
  assert.deepEqual(rest, [4, 5, 6, 4, 6, 7]);
});

test('normalizeUv_RearVertices_CoverZeroToOne', () => {
  const uv = [0.004, 0.1, 0.22, 0.1, 0.22, 0.9, 0.004, 0.9, 0.5, 0.5, 0.9, 0.5, 0.9, 0.6, 0.5, 0.6];
  normalizeUv(uv, [0, 1, 2, 0, 2, 3]);
  assert.deepEqual(uv.slice(0, 8), [0, 0, 1, 0, 1, 1, 0, 1]);
  assert.deepEqual(uv.slice(8), [0.5, 0.5, 0.9, 0.5, 0.9, 0.6, 0.5, 0.6]);   // the other quad is untouched
});

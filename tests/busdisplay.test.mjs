import test from 'node:test';
import assert from 'node:assert/strict';
import { DISPLAY_TEX, displayLayout, REAR_TEX, REAR_GRID, SMILEY, glyph, textCols, textDots, rearFrame, stretchRearQuad, quadSize, splitRearTriangles, normalizeUv } from '../busdisplay.js';

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

// #800 (rear LED): the rear display is an LED dot matrix -- the 5x7 bitmap font and the dot layout are pure
test('glyph_KnownCharacters_AreFiveBySeven', () => {
  for (const ch of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzäöüÄÖÜß !.,-:\'/()?+') {
    const g = glyph(ch);
    assert.equal(g.length, 7, ch);
    assert.ok(g.every((row) => /^[.#]{5}$/.test(row)), ch);
    assert.notDeepEqual(g, glyph('☃'), `${ch} falls back`);
  }
});

test('glyph_UnknownCharacter_FallsBackToTheBox', () => {
  assert.deepEqual(glyph('☃'), ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#####']);
});

test('textCols_CountsGlyphsAndOneColumnGaps', () => {
  assert.equal(textCols('Dank'), 4 * 5 + 3);
  assert.equal(textCols('Dank', 2), 2 * (4 * 5 + 3));
  assert.equal(textCols(''), 0);
});

test('textDots_ScaledGlyph_FillsTheScaledCells', () => {
  const dots = textDots('1', 3, 2, 2, 2);   // the '1' is lit at glyph (2, 0): cells 7..8 x 2..3
  assert.ok(dots.some(([c, r]) => c === 7 && r === 2) && dots.some(([c, r]) => c === 8 && r === 3));
  assert.ok(dots.every(([c, r]) => c >= 3 && c < 13 && r >= 2 && r < 16));
});

test('rearFrame_LineNumber_DoubleSizeAndCentred', () => {
  const f = rearFrame({ line: '133', thanks: null });
  const cols = f.dots.map(([c]) => c), rows = f.dots.map(([, r]) => r);
  assert.equal(f.text.sx, 2); assert.equal(f.text.sy, 2);
  assert.ok(Math.abs((Math.min(...cols) + Math.max(...cols) + 1) / 2 - REAR_GRID.cols / 2) <= 1);
  assert.equal(Math.min(...rows), 1); assert.equal(Math.max(...rows), 14);
  assert.equal(f.smiley, null);
});

test('rearFrame_Thanks_SmileyThenTextBothInsideTheGrid', () => {
  for (const thanks of ['Vielen Dank!', 'Thank you!']) {
    const f = rearFrame({ line: '133', thanks });
    assert.ok(f.dots.every(([c, r]) => c >= 0 && c < REAR_GRID.cols && r >= 0 && r < REAR_GRID.rows), thanks);
    assert.equal(f.smiley.y, 0, 'the smiley uses the full height');
    assert.ok(f.text.x >= f.smiley.x + SMILEY[0].length + 2, 'the text starts right of the smiley');
    const smileyRows = f.dots.filter(([c]) => c < f.smiley.x + SMILEY[0].length).map(([, r]) => r);
    assert.equal(Math.min(...smileyRows), 0); assert.equal(Math.max(...smileyRows), REAR_GRID.rows - 1);
    assert.equal(f.text.sy, 2);
    const cols = f.dots.map(([c]) => c);
    assert.ok(Math.abs((Math.min(...cols) + Math.max(...cols) + 1) / 2 - REAR_GRID.cols / 2) <= 2, thanks);
    assert.ok(f.dots.length > 7 * 7 * 4, 'the text is lit too');
  }
});

test('rearFrame_TooLongText_ClipsToTheGrid', () => {
  const f = rearFrame({ line: '1', thanks: 'x'.repeat(200) });
  assert.ok(f.dots.every(([c]) => c >= 0 && c < REAR_GRID.cols));
  assert.equal(f.text.sx, 1);
});

test('SMILEY_IsAFullHeightRingWithEyesAndMouth', () => {
  assert.equal(SMILEY.length, REAR_GRID.rows);
  assert.ok(SMILEY.every((r) => /^[.#]{16}$/.test(r)));
  const lit = SMILEY.join('').split('#').length - 1;
  assert.ok(lit < 0.35 * 16 * 16, 'a ring with features, not a filled blob');
  assert.equal(SMILEY[7][7], '.'); assert.equal(SMILEY[7][8], '.');   // the centre stays dark
  assert.ok(SMILEY[0].includes('#') && SMILEY[15].includes('#'), 'the ring touches the top and bottom rows');
  const eyes = SMILEY.slice(3, 7).join('');
  assert.ok(eyes.includes('##..##') || eyes.includes('##...##') || eyes.includes('##....##'), 'two separate eyes');
});

test('REAR_TEX_HasSquareWholeCells', () => {
  assert.equal(REAR_TEX.w % REAR_GRID.cols, 0);
  assert.equal(REAR_TEX.h % REAR_GRID.rows, 0);
  assert.equal(REAR_TEX.w / REAR_GRID.cols, REAR_TEX.h / REAR_GRID.rows);
});

// two quads: the tail at x = -5.8 (vertices 0-3) and the nose at x = 5.8 (4-7)
const POS = [-5.8, 2.5, -0.2, -5.8, 2.5, 0.2, -5.8, 2.8, 0.2, -5.8, 2.8, -0.2, 5.8, 2.4, -1, 5.8, 2.4, 1, 5.8, 2.7, 1, 5.8, 2.7, -1];
const IDX = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];

// the model's small rear quad is stretched over the tail; +x is forward, so x is the depth and z the width
test('stretchRearQuad_SmallQuad_BecomesTheWidePanel', () => {
  const pos = POS.slice();
  stretchRearQuad(pos, [0, 1, 2, 0, 2, 3], { x: -5.985, y: 2.5, w: 2.2, h: 0.314 });
  const ids = [0, 1, 2, 3];
  assert.ok(ids.every((i) => pos[3 * i] === -5.985));
  assert.deepEqual(ids.map((i) => +pos[3 * i + 2].toFixed(3)), [-1.1, 1.1, 1.1, -1.1]);
  assert.deepEqual(ids.map((i) => +pos[3 * i + 1].toFixed(3)), [2.5, 2.5, 2.814, 2.814]);
  assert.deepEqual(pos.slice(12), POS.slice(12));   // the nose is untouched
  const { w, h } = quadSize(pos, [0, 1, 2, 0, 2, 3]);
  assert.ok(Math.abs(w - 2.2) < 1e-9 && Math.abs(h - 0.314) < 1e-9);
});
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

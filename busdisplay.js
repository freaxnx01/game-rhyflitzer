// #713: pure layout of a Postauto's display texture -- where the line number and the destination go and at which
// font size, in texture pixels. No DOM, no three.js, so node --test can check the limits.
export const DISPLAY_TEX = { w: 1024, h: 128 };
const MIN_SIZE = 20;
// the biggest size (starting at 0.75 * h, dropping by 2) whose text still ends before limit; never below MIN_SIZE
function fit(text, x, limit, measure, h) {
  let size = 0.75 * h;
  while (size > MIN_SIZE && x + measure(text, size) > limit) size -= 2;
  return size;
}
// line: x 0.016..0.205 of w, so the number also fits the rear quad's u window (0.004..0.22); dest starts where the
// baked destination sits (u 0.254) and must end by u 0.984. y is the text baseline.
export function displayLayout({ line, dest }, measure, tex = DISPLAY_TEX) {
  const y = 0.78 * tex.h;
  return {
    line: { x: 0.016 * tex.w, y, size: fit(line, 0.016 * tex.w, 0.205 * tex.w, measure, tex.h) },
    dest: { x: 0.254 * tex.w, y, size: fit(dest, 0.254 * tex.w, 0.984 * tex.w, measure, tex.h) },
  };
}

// #800: the rear display is an LED dot matrix, as wide as the front display: REAR_GRID dots, drawn at REAR_CELL texture
// pixels each. The line number, or a smiley and the thank-you, come out of a 5x7 bitmap font scaled to whole dots.
export const REAR_GRID = { cols: 112, rows: 16 };
export const REAR_CELL = 8;
export const REAR_TEX = { w: REAR_GRID.cols * REAR_CELL, h: REAR_GRID.rows * REAR_CELL };
export const SMILEY = ['..###..', '.#...#.', '#.#.#.#', '#.....#', '#.#.#.#', '.#.#.#.', '..###..'];
// 5x7 glyphs, rows top to bottom, '#' lit; the baseline is row 5 so g j p q y keep a descender
const FONT = {
  '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', '1': '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  '2': '.###.|#...#|....#|...#.|..#..|.#...|#####', '3': '#####|...#.|..#..|...#.|....#|#...#|.###.',
  '4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', '5': '#####|#....|####.|....#|....#|#...#|.###.',
  '6': '..###|.#...|#....|####.|#...#|#...#|.###.', '7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
  '8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.', '9': '.###.|#...#|#...#|.####|....#|...#.|###..',
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.', D: '###..|#..#.|#...#|#...#|#...#|#..#.|###..',
  E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  I: '.###.|..#..|..#..|..#..|..#..|..#..|.###.', J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.', P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.', V: '#...#|#...#|#...#|#...#|.#.#.|.#.#.|..#..',
  W: '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  a: '.....|.....|.###.|....#|.####|#...#|.####', b: '#....|#....|####.|#...#|#...#|#...#|####.',
  c: '.....|.....|.###.|#....|#....|#...#|.###.', d: '....#|....#|.####|#...#|#...#|#...#|.####',
  e: '.....|.....|.###.|#...#|#####|#....|.###.', f: '..##.|.#..#|.#...|###..|.#...|.#...|.#...',
  g: '.....|.####|#...#|#...#|.####|....#|.###.', h: '#....|#....|####.|#...#|#...#|#...#|#...#',
  i: '..#..|.....|.##..|..#..|..#..|..#..|.###.', j: '...#.|.....|..##.|...#.|...#.|#..#.|.##..',
  k: '#....|#....|#..#.|#.#..|##...|#.#..|#..#.', l: '.##..|..#..|..#..|..#..|..#..|..#..|.###.',
  m: '.....|.....|##.#.|#.#.#|#.#.#|#...#|#...#', n: '.....|.....|####.|#...#|#...#|#...#|#...#',
  o: '.....|.....|.###.|#...#|#...#|#...#|.###.', p: '.....|####.|#...#|#...#|####.|#....|#....',
  q: '.....|.####|#...#|#...#|.####|....#|....#', r: '.....|.....|#.##.|##..#|#....|#....|#....',
  s: '.....|.....|.####|#....|.###.|....#|####.', t: '.#...|.#...|###..|.#...|.#...|.#..#|..##.',
  u: '.....|.....|#...#|#...#|#...#|#..##|.##.#', v: '.....|.....|#...#|#...#|#...#|.#.#.|..#..',
  w: '.....|.....|#...#|#...#|#.#.#|#.#.#|.#.#.', x: '.....|.....|#...#|.#.#.|..#..|.#.#.|#...#',
  y: '.....|.....|#...#|#...#|.####|....#|.###.', z: '.....|.....|#####|...#.|..#..|.#...|#####',
  ä: '.#.#.|.....|.###.|....#|.####|#...#|.####', ö: '.#.#.|.....|.###.|#...#|#...#|#...#|.###.',
  ü: '.#.#.|.....|#...#|#...#|#...#|#..##|.##.#', Ä: '.#.#.|.....|.###.|#...#|#####|#...#|#...#',
  Ö: '.#.#.|.....|.###.|#...#|#...#|#...#|.###.', Ü: '.#.#.|.....|#...#|#...#|#...#|#...#|.###.',
  ß: '.##..|#..#.|#.#..|#..#.|#...#|#...#|#.##.',
  ' ': '.....|.....|.....|.....|.....|.....|.....', '!': '..#..|..#..|..#..|..#..|..#..|.....|..#..',
  '.': '.....|.....|.....|.....|.....|.##..|.##..', ',': '.....|.....|.....|.....|.##..|..#..|.#...',
  '-': '.....|.....|.....|#####|.....|.....|.....', ':': '.....|.##..|.##..|.....|.##..|.##..|.....',
  "'": '.##..|..#..|.#...|.....|.....|.....|.....', '/': '....#|...#.|...#.|..#..|.#...|.#...|#....',
  '(': '...#.|..#..|.#...|.#...|.#...|..#..|...#.', ')': '.#...|..#..|...#.|...#.|...#.|..#..|.#...',
  '?': '.###.|#...#|....#|...#.|..#..|.....|..#..', '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
};
const UNKNOWN = '#####|#...#|#...#|#...#|#...#|#...#|#####';   // a hollow box for a character the font lacks
const GLYPH_W = 5, GLYPH_H = 7;
export function glyph(ch) { return (FONT[ch] ?? UNKNOWN).split('|'); }
// the width in dots: 5 per glyph plus a one-column gap between glyphs, all times the horizontal scale
export function textCols(text, sx = 1) { return text.length ? sx * (text.length * (GLYPH_W + 1) - 1) : 0; }
// the lit cells of a bitmap (rows of '#'/'.') drawn at (x, y) with each bitmap pixel covering sx by sy cells
function bitmapDots(rows, x, y, sx, sy) {
  const dots = [];
  rows.forEach((row, r) => [...row].forEach((c, q) => {
    if (c !== '#') return;
    for (let i = 0; i < sx; i++) for (let j = 0; j < sy; j++) dots.push([x + q * sx + i, y + r * sy + j]);
  }));
  return dots;
}
export function textDots(text, x, y, sx, sy) {
  return [...text].flatMap((ch, k) => bitmapDots(glyph(ch), x + k * (GLYPH_W + 1) * sx, y, sx, sy));
}
// double width when the text fits that way, else single: tall condensed dots like a real bus display
const fitScaleX = (text, maxCols) => (textCols(text, 2) <= maxCols ? 2 : 1);
const clip = (dots, grid) => dots.filter(([c, r]) => c >= 0 && c < grid.cols && r >= 0 && r < grid.rows);
// the whole rear frame as lit cells: the line number alone, double size and centred, or (while `thanks` holds) the
// smiley at double size and the thank-you text to its right, the pair centred; anything past the grid is clipped
export function rearFrame({ line, thanks }, grid = REAR_GRID) {
  const sy = 2, y = Math.floor((grid.rows - GLYPH_H * sy) / 2);
  if (!thanks) {
    const sx = fitScaleX(line, grid.cols), x = Math.floor((grid.cols - textCols(line, sx)) / 2);
    return { dots: clip(textDots(line, x, y, sx, sy), grid), smiley: null, text: { x, y, sx, sy } };
  }
  const scale = 2, gap = 4, smileyCols = SMILEY[0].length * scale;
  const sx = fitScaleX(thanks, grid.cols - smileyCols - gap), cols = smileyCols + gap + textCols(thanks, sx);
  const x = Math.max(0, Math.floor((grid.cols - cols) / 2)), tx = x + smileyCols + gap;
  const dots = [...bitmapDots(SMILEY, x, y, scale, scale), ...textDots(thanks, tx, y, sx, sy)];
  return { dots: clip(dots, grid), smiley: { x, y, scale }, text: { x: tx, y, sx, sy } };
}
// the model's own rear quad is a 0.46 x 0.28 m window under the roof (x -5.825): stretched over the tail to the
// front display's width, flush with the rear window (the tail is flat at x -5.975 from the bumper to the roof edge)
export const REAR_QUAD = { x: -5.985, y: 2.5, w: 2.2, h: 0.314 };   // y is the bottom edge; w and h keep the grid's cells square
function range(pos, ids, axis) { const v = ids.map((i) => pos[3 * i + axis]); return [Math.min(...v), Math.max(...v)]; }
export function stretchRearQuad(pos, vertices, quad = REAR_QUAD) {
  const ids = [...new Set(vertices)], [y0, y1] = range(pos, ids, 1), [z0, z1] = range(pos, ids, 2);
  for (const i of ids) {
    pos[3 * i] = quad.x;
    pos[3 * i + 1] = quad.y + ((pos[3 * i + 1] - y0) / (y1 - y0 || 1)) * quad.h;
    pos[3 * i + 2] = ((pos[3 * i + 2] - (z0 + z1) / 2) / (z1 - z0 || 1)) * quad.w;
  }
}
// width (along z) and height (along y) of these vertices, for the debug hook and the tests
export function quadSize(pos, vertices) {
  const ids = [...new Set(vertices)], y = range(pos, ids, 1), z = range(pos, ids, 2);
  return { w: z[1] - z[0], h: y[1] - y[0] };
}
// +x is forward (tools/prepare-bus.mjs:12): triangles within tol m of the most negative x are the rear quad
export function splitRearTriangles(pos, index, tol = 0.1) {
  let minX = Infinity;
  for (let i = 0; i < pos.length; i += 3) minX = Math.min(minX, pos[i]);
  const rear = [], rest = [];
  for (let t = 0; t < index.length; t += 3) {
    const tri = [index[t], index[t + 1], index[t + 2]];
    (tri.every((v) => pos[3 * v] <= minX + tol) ? rear : rest).push(...tri);
  }
  return { rear, rest };
}
// scales these vertices' UVs to 0..1 in place
export function normalizeUv(uv, vertices) {
  const ids = [...new Set(vertices)], us = ids.map((i) => uv[2 * i]), vs = ids.map((i) => uv[2 * i + 1]);
  const u0 = Math.min(...us), v0 = Math.min(...vs), du = Math.max(...us) - u0 || 1, dv = Math.max(...vs) - v0 || 1;
  for (const i of ids) { uv[2 * i] = (uv[2 * i] - u0) / du; uv[2 * i + 1] = (uv[2 * i + 1] - v0) / dv; }
}

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

// #800: the rear quad's own texture -- free to use its whole area, so the line number is centred and larger
export const REAR_TEX = { w: 330, h: 200 };
function fitWidth(text, maxW, start, measure) {
  let size = start;
  while (size > MIN_SIZE && measure(text, size) > maxW) size -= 2;
  return size;
}
export function rearLayout(line, measure, tex = REAR_TEX) {
  return { x: tex.w / 2, y: 0.72 * tex.h, size: fitWidth(line, 0.92 * tex.w, 0.7 * tex.h, measure) };
}
export const SMILEY = ['..###..', '.#...#.', '#.#.#.#', '#.....#', '#.#.#.#', '.#.#.#.', '..###..'];
export function thanksLayout(text, measure, tex = REAR_TEX) {
  const cell = 12;
  return { smiley: { x: (tex.w - 7 * cell) / 2, y: 0.08 * tex.h, cell },
    text: { x: tex.w / 2, y: 0.94 * tex.h, size: fitWidth(text, 0.92 * tex.w, 0.26 * tex.h, measure) } };
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

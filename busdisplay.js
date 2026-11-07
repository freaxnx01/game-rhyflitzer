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

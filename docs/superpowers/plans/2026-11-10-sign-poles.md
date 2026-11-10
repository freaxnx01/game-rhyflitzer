# Sign poles under the panel Implementation Plan (#822)

> Spec: `docs/superpowers/specs/2026-11-10-sign-poles-design.md`. TDD: test first, no browser run needed.

**Goal:** no sign pole shows above, beside the tip of, or in front of its panel.
**Architecture:** pure `signpole.js` (`poleTop`, `signPanelZ`, constants) + 5 small edits in `index.html`.
**Tech:** vanilla ES modules, `node --test`.

Global constraints: buildless, no packages; `const`/`let`; test names `fn_state_expected`; do not touch `busstop.js`, `speeddisplay.js` config, `.worktrees/*`. Run only `node --test tests/signpole.test.mjs tests/speeddisplay.test.mjs tests/busstop.test.mjs`, not the full Playwright suite.

## Task 1: the helper (test first)
Files: create `tests/signpole.test.mjs`, create `signpole.js`.

- [ ] Write the failing test:
```js
// #822: where a sign pole may end -- pure. node --test tests/signpole.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POLE_R, FACE_GAP, poleTop, signPanelZ } from '../signpole.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('poleTop_rect_endsBelowTopEdge', () => {
  assert.ok(near(poleTop({ shape: 'rect', y: 2.4, h: 1.2 }), 3.0 - 0.02));
});
test('poleTop_disc_endsBelowDiscTopAndWhereDiscCoversPole', () => {
  const p = { shape: 'disc', y: 2.1, d: 0.886 };   // Fahrverbot: 0.9 panel, 4/256 border gap each side
  const top = poleTop(p);
  assert.ok(top < 2.1 + 0.443);
  const half = Math.sqrt(0.443 ** 2 - (top + 0.02 - 2.1) ** 2);   // chord at the pole's end
  assert.ok(half >= POLE_R);
});
test('poleTop_tri_endsWhereTriangleIsWiderThanPole', () => {
  const p = { shape: 'tri', apex: 2.611, slope: 0.536 };       // Baustelle
  const top = poleTop(p);
  assert.ok(top < 2.611 - 0.05 / 0.536);
  assert.ok((2.611 - top) * 0.536 > POLE_R);                    // triangle half-width there exceeds the pole radius
});
test('poleTop_largerRadius_lowersTop', () => {
  const p = { shape: 'rect', y: 2, h: 1 };
  assert.ok(poleTop(p, 0.06) <= poleTop(p));
});
test('poleTop_unknownShape_throws', () => {
  assert.throws(() => poleTop({ shape: 'star', y: 1 }), /shape/);
});
test('signPanelZ_frontAndBack_clearThePoleRadius', () => {
  assert.equal(signPanelZ(false), FACE_GAP);
  assert.equal(signPanelZ(true), -FACE_GAP);
  assert.ok(FACE_GAP > POLE_R);
});
```
- [ ] Run, expect FAIL (module missing).
- [ ] Create `signpole.js`:
```js
// #822: where a sign pole may end so it never shows above, beside the tip of, or in front of its panel -- pure.
export const POLE_R = 0.05;     // m: the grey pole's radius, shared by every sign builder
export const FACE_GAP = 0.06;   // m: a panel's centre from the pole axis (radius + 1 cm), so the pole sits behind it
export const signPanelZ = (back) => (back ? -FACE_GAP : FACE_GAP);

// the highest y the pole may reach, fully hidden behind the panel's visible shape
export function poleTop(panel, r = POLE_R, margin = 0.02) {
  const reach = r + margin / 2;   // half-width the shape must still cover at the pole's end
  if (panel.shape === 'rect') return panel.y + panel.h / 2 - margin;
  if (panel.shape === 'disc') return panel.y + Math.sqrt((panel.d / 2) ** 2 - reach ** 2) - margin;
  if (panel.shape === 'tri') return panel.apex - reach / panel.slope - margin;
  throw new Error(`poleTop: unknown shape ${panel.shape}`);
}
```
- [ ] Run, expect PASS. Commit `feat(world): signpole helper for the pole top (#822)`.

## Task 2: roadSign, Fahrverbot, Baustelle
Files: `index.html` (imports ~814, `signPanel` 1822, `roadSign` 1828-1841).

- [ ] Add `import { poleTop, signPanelZ, POLE_R } from './signpole.js';   // #822` beside the busstop import.
- [ ] `signPanel`: `m.position.set(0, y, signPanelZ(back));` (was `back ? -0.02 : 0.02`).
- [ ] `roadSign(kind, x, z, rot, build, panel)`: new last parameter `panel` (the main panel shape for `poleTop`). Pole height `const top = poleTop(panel);` geometry `new THREE.CylinderGeometry(POLE_R, POLE_R, top, 8)`, `pole.position.y = top / 2`.
- [ ] Baustelle passes `{ shape: 'tri', apex: 2.15 + 0.5 - 1.0 * 10 / 256, slope: 0.536 }` (half-width per metre of the red triangle: (120/256) / (224/256) = 0.536); Fahrverbot passes `{ shape: 'disc', y: 2.1, d: 0.9 * 248 / 256 }`.
- [ ] The lower plates (`T.baustelle`, `T.fahrverbot`, centres 1.5 / 1.4) are rects covering the pole, unchanged.

## Task 3: signW, parkingSign, crashSign
- [ ] `signW` (~2218): pole `CylinderGeometry(0.05, 0.05, 2.95, 6)`, `p.position.set(s, 1.475, -0.09)` (behind the 0.08 deep board, 5 cm under its 3.0 top). Keep the rest of the line byte-identical.
- [ ] `parkingSign` (~2084): `board.position` and `plate.position` move `FACE_GAP` along their normal: `const nx = Math.sin(-rot), nz = Math.cos(-rot);` then `set(x + nx * FACE_GAP, ..., z + nz * FACE_GAP)`. Pole height `poleTop({shape:'rect', y: 2.3, h: 0.7})` (=2.63 -> keep pole to 2.6 only if lower: use `Math.min(2.6, poleTop(...))`). Only the P board matters; the plate at 1.75 is covered by the same offset.
- [ ] `crashSign` (~2150): board offset `FACE_GAP + 0.01` (pole radius 0.06) along its normal (heading +x board faces +x: `x + FACE_GAP + 0.01`); pole stays 2.8 (below the board top 2.95).

## Task 4: speed display
- [ ] `speedDisplayBuild` (~2188): pole height `const top = poleTop({ shape: 'rect', y: PN.y, h: PN.h }, POLE_R, 0.05);` geometry `(0.05, 0.05, top, 8)`, `pole.position.y = top / 2`. Config file untouched.

## Task 5: changelog and check
- [ ] `CHANGELOG.md` under `## [Unreleased]` -> `### Fixed`, newest first, player voice: `- \`2026-11-10 HH:MM\` On **road signs** (Fahrverbot, Baustelle), the **place-name boards**, the **P and Crash-Platz signs** and the **speed display** in Sisseln, the **pole** no longer sticks out above the sign or through its face: it ends behind the panel.` (use the real Zurich time; create `### Fixed` if `[Unreleased]` has none).
- [ ] Run `node --test tests/signpole.test.mjs tests/speeddisplay.test.mjs tests/busstop.test.mjs`, expect all green. `grep -n "CylinderGeometry(0.05, 0.05, 2.6" index.html` must no longer match `roadSign`.
- [ ] Manual check list for the PR body (no automated browser run): a Baustelle and a Fahrverbot sign, a Sisseln board, the speed display, from the side: pole ends under the panel's top, no pole in front of a face.
- [ ] Commit `fix(world): sign poles end behind the panel (#822)`; PR.

## Acceptance mapping
AC1 (top at most the visible top) -> Tasks 1-4; AC2 (pole behind face) -> `FACE_GAP` in Tasks 2-3; AC3 (unit test per kind) -> Task 1 (rect, disc, tri).

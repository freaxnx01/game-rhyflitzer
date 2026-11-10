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
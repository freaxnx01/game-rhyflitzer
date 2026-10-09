import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIRROR, mirrorVisible, mirrorRect, mirrorDue } from '../mirror.js';

const COCKPIT = { view: 'cockpit', back: false, flying: false, overlay: false, fullMap: false, touch: false };

test('mirrorVisible: shows in the cockpit view only', () => {
  assert.equal(mirrorVisible(COCKPIT), true);
  for (const view of ['chase', 'near', 'bumper']) assert.equal(mirrorVisible({ ...COCKPIT, view }), false, view);
});

test('mirrorVisible: hidden while looking back, flying, in the overlay, with the full map or on touch', () => {
  for (const key of ['back', 'flying', 'overlay', 'fullMap', 'touch']) assert.equal(mirrorVisible({ ...COCKPIT, [key]: true }), false, key);
});

test('mirrorRect: 22 % of the width clamped to 220-420 px, 3.2:1, centred, 12 px from the top', () => {
  const r = mirrorRect(1000);
  assert.equal(r.w, 220); assert.equal(r.h, 220 * MIRROR.h / MIRROR.w); assert.equal(r.x, (1000 - 220) / 2); assert.equal(r.y, 12);
  assert.equal(mirrorRect(320).w, 220);
  assert.equal(mirrorRect(3000).w, 420);
  assert.equal(mirrorRect(1600).w, 352);
});

test('mirrorDue: every second frame, and at once when it has just become visible', () => {
  assert.equal(mirrorDue(0, true), true);
  assert.equal(mirrorDue(1, true), false);
  assert.equal(mirrorDue(2, true), true);
  assert.equal(mirrorDue(1, false), true);
});

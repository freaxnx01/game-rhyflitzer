import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampCentre, zoomAt } from '../mapzoom.js';

const Z = [1, 2, 4, 8], W = 800, H = 400;

test('clampCentre_AtOneX_IsTheMiddle', () => {
  assert.equal(clampCentre(10, W, 1), 400);
  assert.equal(clampCentre(790, W, 1), 400);
});

test('clampCentre_ZoomedIn_StaysInsideTheEdges', () => {
  assert.equal(clampCentre(0, W, 2), 200);
  assert.equal(clampCentre(800, W, 2), 600);
  assert.equal(clampCentre(300, W, 2), 300);
});

test('zoomAt_ZoomIn_KeepsThePointUnderTheCursor', () => {
  const v = zoomAt({ z: 1, ox: 400, oy: 200 }, 1, 600, 100, W, H, Z);
  assert.equal(v.z, 2);
  // base point under the cursor before: (600-400)/1+400 = 600, (100-200)/1+200 = 100
  assert.equal((600 - W / 2) / v.z + v.ox, 600);
  assert.equal((100 - H / 2) / v.z + v.oy, 100);
});

test('zoomAt_CursorNearTheEdge_ClampsTheView', () => {
  const v = zoomAt({ z: 1, ox: 400, oy: 200 }, 1, 800, 400, W, H, Z);
  assert.equal(v.z, 2);
  assert.equal(v.ox, 600);
  assert.equal(v.oy, 300);
});

test('zoomAt_ZoomOutToOneX_ReturnsToTheWholeMap', () => {
  const v = zoomAt({ z: 2, ox: 600, oy: 300 }, -1, 790, 395, W, H, Z);
  assert.deepEqual(v, { z: 1, ox: 400, oy: 200 });
});

test('zoomAt_AtTheEndOfTheSteps_ReturnsTheSameView', () => {
  assert.deepEqual(zoomAt({ z: 8, ox: 500, oy: 250 }, 1, 100, 100, W, H, Z), { z: 8, ox: 500, oy: 250 });
  assert.deepEqual(zoomAt({ z: 1, ox: 400, oy: 200 }, -1, 100, 100, W, H, Z), { z: 1, ox: 400, oy: 200 });
});
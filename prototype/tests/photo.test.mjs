// #113: pure rules for the photo key. Unit-tested with `node --test prototype/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { photoFileName, canPhoto } from '../photo.js';

test('photoFileName: local timestamp, zero-padded', () => {
  assert.equal(photoFileName(new Date(2026, 9, 9, 7, 5, 3)), 'rhyflitzer-20261009-070503.png');
  assert.equal(photoFileName(new Date(2026, 11, 31, 23, 59, 59)), 'rhyflitzer-20261231-235959.png');
});

test('canPhoto: only with the overlay hidden, the J/O search closed and no key repeat', () => {
  assert.equal(canPhoto(true, false, false), true);
  assert.equal(canPhoto(false, false, false), false);
  assert.equal(canPhoto(true, true, false), false);
  assert.equal(canPhoto(true, false, true), false);
});

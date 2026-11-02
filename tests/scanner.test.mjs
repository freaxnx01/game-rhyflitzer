// The Rhy Knight's scanner light. Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCAN, scannerHead, scannerLevels, scannerGlow } from '../scanner.js';

const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

test('scannerHead_StartOfTheSweep_SitsOnTheFirstSegmentMovingRight', () => {
  assert.deepEqual(scannerHead(0, 8), { at: 0, dir: 1 });
});

test('scannerHead_HalfAPeriod_ReachesTheLastSegmentAndTurnsBack', () => {
  assert.deepEqual(scannerHead(SCAN.period / 2, 8), { at: 7, dir: -1 });
  assert.deepEqual(scannerHead(SCAN.period, 8), { at: 0, dir: 1 });
});

test('scannerLevels_OneLevelPerSegment_BetweenZeroAndOne_FullAtTheHead', () => {
  const t = SCAN.period * 3 / 14, levels = scannerLevels(t, 8);   // the head right on segment 3
  assert.equal(levels.length, 8);
  assert.ok(levels.every(v => v >= 0 && v <= 1), JSON.stringify(levels));
  assert.ok(Math.abs(scannerHead(t, 8).at - 3) < 1e-9);
  assert.ok(Math.abs(levels[3] - 1) < 1e-9 && levels[3] === Math.max(...levels), JSON.stringify(levels));
});

test('scannerLevels_MovingRight_TheTailGlowsLongerBehindThanAhead', () => {
  const t = SCAN.period * 3.5 / 14, levels = scannerLevels(t, 8);   // the head on segment 3.5 ... rounded: exactly between 3 and 4
  const { at, dir } = scannerHead(t, 8);
  assert.equal(dir, 1);
  assert.ok(levels[Math.floor(at) - 1] > levels[Math.ceil(at) + 1], JSON.stringify(levels));
  assert.equal(levels[7], 0, 'far ahead stays dark');
});

test('scannerLevels_TheWayBack_MirrorsTheWayOut', () => {
  const t = 0.3;
  assert.ok(close(scannerLevels(SCAN.period / 2 + t, 8), scannerLevels(t, 8).reverse()));
});

test('scannerGlow_DarkSegmentsStillShowAFaintRed_TheHeadIsBright', () => {
  assert.equal(scannerGlow(0), SCAN.dim);
  assert.equal(scannerGlow(1), SCAN.bright);
  assert.ok(SCAN.dim > 0 && SCAN.bright > SCAN.dim);
});

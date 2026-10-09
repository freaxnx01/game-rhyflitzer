// #128: Blitz mode — the countdown that checkpoints top up. Pure module, so node --test can import it without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLITZ, tick, addBonus, isTimeUp, rankFor, isNewBest } from '../blitz.js';

test('the table: 90 s to start, 60 s per checkpoint, red under 10 s', () => {
  assert.deepEqual(BLITZ, { start: 90, bonus: 60, low: 10 });
});

test('tick counts down and never goes below zero', () => {
  assert.equal(tick(90, 1 / 60), 90 - 1 / 60);
  assert.equal(tick(0.01, 1 / 60), 0);
  assert.equal(tick(0, 1), 0);
});

test('a checkpoint adds the bonus on top of whatever is left, with no cap', () => {
  assert.equal(addBonus(12.5), 72.5);
  assert.equal(addBonus(300), 360);
});

test('time is up at zero, not before', () => {
  assert.equal(isTimeUp(0.2), false);
  assert.equal(isTimeUp(0), true);
});

test('rank by the seconds left at the finish: S >= 90, A >= 60, B >= 30, C below', () => {
  assert.equal(rankFor(90), 'S');
  assert.equal(rankFor(89.9), 'A');
  assert.equal(rankFor(60), 'A');
  assert.equal(rankFor(59.9), 'B');
  assert.equal(rankFor(30), 'B');
  assert.equal(rankFor(29.9), 'C');
  assert.equal(rankFor(0.1), 'C');
});

test('the best is the largest time left; a first finish is always a best', () => {
  assert.equal(isNewBest(null, 5), true);
  assert.equal(isNewBest(40, 41), true);
  assert.equal(isNewBest(40, 40), false);
  assert.equal(isNewBest(40, 12), false);
});

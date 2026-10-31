// #270: the car lights switch — head and tail together, plus the shared blinker/brake/hazard state for #271 and #230.
// Pure: no DOM, no three.js, so node --test can import it. index.html keeps the glue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAMP, lampState } from '../lights.js';

test("lampState: lights off is today's look", () => {
  const s = lampState({});
  assert.equal(s.headLevel, LAMP.head.off);
  assert.equal(s.tailLevel, LAMP.tail.off);
  assert.deepEqual([s.left, s.right], [false, false]);
});

test('lampState: lights on lights head and tail', () => {
  const s = lampState({ head: true });
  assert.equal(s.headLevel, LAMP.head.on);
  assert.equal(s.tailLevel, LAMP.tail.rear);
});

test('lampState: brake beats rear light, with lights off too', () => {
  assert.equal(lampState({ braking: true }).tailLevel, LAMP.tail.brake);
  assert.equal(lampState({ head: true, braking: true }).tailLevel, LAMP.tail.brake);
});

test('lampState: a blinker shows only its side, only on the flash phase', () => {
  assert.deepEqual([lampState({ blinker: 'left', flashOn: true }).left, lampState({ blinker: 'left', flashOn: true }).right], [true, false]);
  assert.equal(lampState({ blinker: 'left', flashOn: false }).left, false);
});

test('lampState: hazard flashes both sides and wins over a blinker', () => {
  const s = lampState({ hazard: true, blinker: 'left', flashOn: true });
  assert.deepEqual([s.left, s.right], [true, true]);
});

test('lampState: hazard shows both sides off together on the dark phase, on together on the flash phase', () => {
  const dark = lampState({ hazard: true, flashOn: false });
  assert.deepEqual([dark.left, dark.right], [false, false]);
  const flash = lampState({ hazard: true, flashOn: true });
  assert.deepEqual([flash.left, flash.right], [true, true]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DELOREAN_BODY, DELOREAN_GLASS, profileSize, louvreSlots, DOOR, doorTarget, stepDoor } from '../delorean.js';

const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);

test('body profile: 4.17 m between the bumpers and 1.09 m to the roof (4.27 x 1.14 with the 0.05 bevel), nothing below the sill', () => {
  const s = profileSize(DELOREAN_BODY);
  close(s.maxX - s.minX, 4.17, 1e-9); close(s.maxY, 1.09, 1e-9); assert.ok(s.minY >= 0.24);
  assert.ok(DELOREAN_BODY.length >= 12);
});

test('glass profile: inside the body in x, under the roof, above the belt line', () => {
  const b = profileSize(DELOREAN_BODY), g = profileSize(DELOREAN_GLASS);
  assert.ok(g.minX > b.minX && g.maxX < b.maxX);
  assert.ok(g.maxY < b.maxY && g.minY > 0.8);
});

test('louvreSlots: n evenly spaced points on the segment, tilted like it', () => {
  const s = louvreSlots(-1.22, 0.955, -0.82, 1.085, 6);
  assert.equal(s.length, 6);
  close(s[0].x, -1.22 + 0.4 / 12, 1e-9); close(s[5].x, -0.82 - 0.4 / 12, 1e-9);
  close(s[1].x - s[0].x, 0.4 / 6, 1e-9); close(s[1].y - s[0].y, 0.13 / 6, 1e-9);
  for (const p of s) close(p.tilt, Math.atan2(0.13, 0.4), 1e-9);
  assert.deepEqual(louvreSlots(0, 0, 1, 0, 0), []);
});

test('doorTarget: open only on the start screen standing still', () => {
  assert.equal(doorTarget('ready', 0), 1);
  assert.equal(doorTarget('ready', 0.05), 1);
  assert.equal(doorTarget('ready', 0.5), 0);
  assert.equal(doorTarget('running', 0), 0);
  assert.equal(doorTarget('finished', 0), 0);
});

test('stepDoor: approaches without overshoot, settles, same real time gives the same angle at 30 and 60 fps', () => {
  assert.deepEqual(DOOR, { angle: 1.2, rate: 3 });
  let o = 0, prev = 0;
  for (let i = 0; i < 10; i++) { o = stepDoor(o, 1, 1 / 60); assert.ok(o > prev && o < 1); prev = o; }
  for (let i = 0; i < 300; i++) o = stepDoor(o, 1, 1 / 60);
  close(o, 1, 1e-3);
  for (let i = 0; i < 300; i++) o = stepDoor(o, 0, 1 / 60);
  close(o, 0, 1e-3);
  let a = 0, b = 0;
  for (let i = 0; i < 6; i++) a = stepDoor(a, 1, 1 / 30);
  for (let i = 0; i < 12; i++) b = stepDoor(b, 1, 1 / 60);
  close(a, b, 1e-9);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { busMarks, markLabel, onCanvas } from '../busmarks.js';

const pose = (b) => ({ x: b.s, z: -b.s, th: 1.5 });
const bus = (key, phase, line = 133, s = 10) => ({ key, phase, s, trip: { line }, route: {} });

test('busMarks_ActiveBuses_OneMarkEachWithPose', () => {
  const m = busMarks([bus('a', 'drive', 133, 5), bus('b', 'stand', 133, 7)], pose);
  assert.deepEqual(m, [{ key: 'a', line: '133', x: 5, z: -5, th: 1.5 }, { key: 'b', line: '133', x: 7, z: -7, th: 1.5 }]);
});
test('busMarks_DoneBus_Skipped', () => {
  assert.equal(busMarks([bus('a', 'done')], pose).length, 0);
});
test('busMarks_NoBuses_Empty', () => {
  assert.deepEqual(busMarks([], pose), []);
});
test('markLabel_FullMapOnly', () => {
  assert.equal(markLabel({ line: '133' }, true), '133');
  assert.equal(markLabel({ line: '133' }, false), null);
});
test('onCanvas_InsideAndPastPad', () => {
  assert.equal(onCanvas(400, 200, 800, 400), true);
  assert.equal(onCanvas(-14, 200, 800, 400), true);
  assert.equal(onCanvas(-15, 200, 800, 400), false);
  assert.equal(onCanvas(400, 415, 800, 400), false);
});

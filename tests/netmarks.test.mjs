import { test } from 'node:test';
import assert from 'node:assert/strict';
import { netMapMarks, netMarkLabel } from '../netmarks.js';

const VIS = 1;   // stand-in flag bit; the module takes it as a parameter
const hex = (id) => ({ swiss: '#e0322d' })[id] ?? '#1b2d5e';
const entries = new Map([
  ['a', { car: 'x', paint: 'swiss', name: 'Ann', track: 'ta' }],
  ['b', { car: 'x', paint: 'nope', name: 'Bob', track: 'tb' }],
  ['c', { car: 'x', paint: 'swiss', name: 'Cy', track: 'tc', leaving: 5 }],
  ['d', { car: null, paint: null, name: 'Di', track: 'td' }],
  ['e', { car: 'x', paint: 'swiss', name: 'Ed', track: 'te' }],
  ['f', { car: 'x', paint: 'swiss', name: 'Flo', track: 'tf' }],
]);
const poses = { ta: { x: 1, z: 2, ry: 0.5, flags: VIS }, tb: { x: 3, z: 4, ry: -1, flags: VIS }, tc: { x: 0, z: 0, ry: 0, flags: VIS }, te: null, tf: { x: 9, z: 9, ry: 0, flags: 0 } };

test('netMapMarks_mixedEntries_onlyVisibleDrivingPlayers', () => {
  const m = netMapMarks(entries, (e) => poses[e.track], hex, VIS);
  assert.deepEqual(m.map((k) => k.id), ['a', 'b']);
});
test('netMapMarks_pose_headingIsMinusRyAndColourFromPaint', () => {
  const [a, b] = netMapMarks(entries, (e) => poses[e.track], hex, VIS);
  assert.equal(a.th, -0.5); assert.equal(a.color, '#e0322d'); assert.equal(a.x, 1); assert.equal(a.z, 2);
  assert.equal(b.color, '#1b2d5e'); assert.equal(a.name, 'Ann');
});
test('netMarkLabel_fullMapOnly', () => {
  assert.equal(netMarkLabel({ name: 'Ann' }, true), 'Ann');
  assert.equal(netMarkLabel({ name: 'Ann' }, false), null);
});
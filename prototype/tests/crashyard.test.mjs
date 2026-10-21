import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CRASH_YARD as Y, KIND_ORDER, yardProps, yardStart, inYard, yardFor, yardEntryPoint, yardTyreStacks } from '../crashyard.js';
import { KNOCKABLE } from '../knock.js';

test('the yard has every knockable kind, five of each, all inside the free rectangle', () => {
  const props = yardProps();
  assert.deepEqual([...KIND_ORDER].sort(), [...KNOCKABLE].sort());
  for (const kind of KIND_ORDER) assert.equal(props.filter(p => p.kind === kind).length, 5, kind);
  for (const p of props) assert.ok(inYard(p.x, p.z, -1), `${p.kind} ${p.x},${p.z} inside`);
});

test('rows stand across the lane, in front of the run-up, and no two props overlap', () => {
  const props = yardProps(), start = yardStart();
  assert.ok(props.every(p => p.x - start.x >= Y.runUp - 6));
  for (let i = 0; i < props.length; i++) for (let j = i + 1; j < props.length; j++) assert.ok(Math.hypot(props[i].x - props[j].x, props[i].z - props[j].z) >= 6, 'apart');
});

test('the car starts at the lane head facing the rows; the J point lies in the yard', () => {
  const s = yardStart(); assert.equal(s.th, 0); assert.ok(inYard(s.x, s.z));
  const [x, z] = yardEntryPoint(); assert.ok(inYard(x, z));
});

test('inYard honours the margin, yardFor only answers for its own region', () => {
  assert.equal(inYard(Y.x0 - 3, Y.z0 + 5), false); assert.equal(inYard(Y.x0 - 3, Y.z0 + 5, 5), true);
  assert.equal(yardFor('hochrhein'), Y); assert.equal(yardFor('ehrendingen'), null);
});

test('yardTyreStacks_Default_FourStacksOfEightInsideTheYardClearOfPropsAndRunUp', () => {
  const stacks = yardTyreStacks(), props = yardProps(), start = yardStart();
  assert.equal(stacks.length, 4);
  for (const s of stacks) {
    assert.equal(s.n, 8);
    assert.ok(inYard(s.x, s.z, -3), `stack ${s.x},${s.z} well inside`);
    assert.ok(s.x - Y.x0 > Y.runUp, 'not in the run-up lane');
    assert.ok(props.every(p => Math.hypot(p.x - s.x, p.z - s.z) >= 6), 'clear of every prop');
  }
  for (let i = 1; i < stacks.length; i++) assert.ok(Math.hypot(stacks[i].x - stacks[i - 1].x, stacks[i].z - stacks[i - 1].z) >= 0.7, 'stacks do not overlap');
  assert.ok(stacks.every(s => s.x > start.x), 'beyond the lane head');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { hasWebGPU } from '../poc/webgpu/js/poc-gate.js';

test('hasWebGPU_noGpu_false', async () => {
  assert.equal(await hasWebGPU({}), false);
});

test('hasWebGPU_nullAdapter_false', async () => {
  assert.equal(await hasWebGPU({ gpu: { requestAdapter: async () => null } }), false);
});

test('hasWebGPU_adapter_true', async () => {
  assert.equal(await hasWebGPU({ gpu: { requestAdapter: async () => ({}) } }), true);
});

test('hasWebGPU_requestThrows_false', async () => {
  const nav = { gpu: { requestAdapter: async () => { throw new Error('boom'); } } };
  assert.equal(await hasWebGPU(nav), false);
});

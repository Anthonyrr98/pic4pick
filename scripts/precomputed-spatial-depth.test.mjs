import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrecomputedSpatialDepthClient } from '../src/utils/precomputedSpatialDepth.js';
const depth = { width: 2, height: 1, values: new Uint8Array([0, 255]) };
const ready = { generation: 'a', status: 'ready', depth_path: 'id/a.png', width: 2, height: 1 };
test('same photo reuses its result; replacing its image invalidates the generation cache', async () => {
  let row = ready, loads = 0;
  const client = createPrecomputedSpatialDepthClient({ loadMetadata: async () => row, loadDepth: async () => { loads++; return depth; } });
  const signal = new AbortController().signal;
  assert.equal(await client.request('photo', () => {}, signal), depth);
  await client.request('photo', () => {}, signal);
  assert.equal(loads, 1);
  row = { ...ready, generation: 'b' };
  await client.request('photo', () => {}, signal);
  assert.equal(loads, 2);
});
test('pending processing polls until a published result is available', async () => {
  let calls = 0;
  const stages = [];
  const client = createPrecomputedSpatialDepthClient({ pollMs: 1, loadMetadata: async () => ++calls < 3 ? { status: 'pending' } : ready, loadDepth: async () => depth });
  await client.request('photo', (p) => stages.push(p.stage), new AbortController().signal);
  assert.deepEqual(stages, ['pending', 'pending', 'reading']);
});
test('closing a scene cancels polling and never starts a depth download', async () => {
  const controller = new AbortController();
  const client = createPrecomputedSpatialDepthClient({ loadMetadata: async () => ({ status: 'processing' }), loadDepth: async () => { throw new Error('must not download'); } });
  const result = client.request('photo', () => controller.abort(), controller.signal);
  await assert.rejects(result, { name: 'AbortError' });
});
test('offline worker returns a useful pending message, with no browser inference fallback', async () => {
  const client = createPrecomputedSpatialDepthClient({ timeoutMs: 0, loadMetadata: async () => null, loadDepth: async () => { throw new Error('must not download'); } });
  await assert.rejects(client.request('photo', () => {}, new AbortController().signal), /后台准备/);
});
test('incorrect depth dimensions cannot be rendered or cached', async () => {
  const client = createPrecomputedSpatialDepthClient({ loadMetadata: async () => ready, loadDepth: async () => ({ ...depth, width: 3 }) });
  await assert.rejects(client.request('photo', () => {}, new AbortController().signal), /数据异常/);
});

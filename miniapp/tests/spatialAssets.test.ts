import test from 'node:test'
import assert from 'node:assert/strict'
import { fitTexture, retryExpiredDepth } from '../../packages/shared/spatialAssets'
import { createPrecomputedSpatialDepthClient } from '../../packages/shared/precomputedSpatialDepth'
test('portrait, panoramic and very small device texture limits retain dimensions without upscaling', () => {
  assert.deepEqual(fitTexture(4000, 6000, 4096), { width: 1365, height: 2048 })
  assert.deepEqual(fitTexture(6000, 1000, 1024), { width: 1024, height: 171 })
  assert.deepEqual(fitTexture(6000, 1, 256), { width: 256, height: 1 })
  assert.deepEqual(fitTexture(128, 256, 1024), { width: 128, height: 256 })
  assert.throws(() => fitTexture(NaN, 10, 2048), /尺寸/)
})
test('an expired depth object is signed again once, while permanent failure and cancellation do not retry', async () => {
  let calls = 0
  assert.equal(await retryExpiredDepth(async () => { if (++calls === 1) throw { status: 403 }; return 'fresh depth' }, () => false), 'fresh depth')
  assert.equal(calls, 2)
  for (const [status, cancelled, count] of [[404, false, 1], [403, true, 1], [403, false, 2]] as const) {
    calls = 0
    await assert.rejects(retryExpiredDepth(async () => { calls++; throw { status } }, () => cancelled))
    assert.equal(calls, count)
  }
})
test('mini program cancellation works without DOMException and does not download ready data after cancellation', async () => {
  const signal = { aborted: false, addEventListener() {}, removeEventListener() {} }
  let downloads = 0
  const client = createPrecomputedSpatialDepthClient({
    createCancelled: () => { const error = new Error('cancelled'); error.name = 'AbortError'; return error },
    loadMetadata: async () => { signal.aborted = true; return { status: 'ready', generation: 'a', depth_path: 'p/a.png', width: 1, height: 1 } },
    loadDepth: async () => { downloads++; return { width: 1, height: 1, values: new Uint8Array([0]) } },
  })
  await assert.rejects(client.prefetch('p', signal), { name: 'AbortError' })
  assert.equal(downloads, 0)
})
test('metadata with changed dimensions cannot reuse old pixels under the same generation', async () => {
  let width = 1, downloads = 0
  const client = createPrecomputedSpatialDepthClient({
    loadMetadata: async () => ({ status: 'ready', generation: 'a', depth_path: 'p/a.png', width, height: 1 }),
    loadDepth: async () => { downloads++; return { width, height: 1, values: new Uint8Array(width) } },
  })
  const signal = new AbortController().signal
  await client.prefetch('p', signal); width = 2
  assert.equal((await client.prefetch('p', signal)).width, 2)
  assert.equal(downloads, 2)
  client.clearCache()
  await client.prefetch('p', signal)
  assert.equal(downloads, 3, 'memory pressure discards cached pixels while preserving a fresh request')
})

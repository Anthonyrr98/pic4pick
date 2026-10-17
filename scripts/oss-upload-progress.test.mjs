import test from 'node:test';
import assert from 'node:assert/strict';
import { watchOssUploadProgress } from '../src/utils/ossUploadProgress.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const fixture = (t, fetcher) => {
  const state = { progress: [], cleared: [] };
  t.mock.method(globalThis, 'fetch', fetcher);
  t.mock.method(globalThis, 'setInterval', (callback, delay) => { state.poll = callback; state.delay = delay; return 123; });
  t.mock.method(globalThis, 'clearInterval', timer => state.cleared.push(timer));
  state.stop = watchOssUploadProgress({ apiUrl: 'https://backend.example/api/upload/oss/', uploadId: 'upload-id', token: 'admin-token',
    file: { size: 25000 }, onProgress: (...args) => state.progress.push(args) });
  t.after(() => state.stop());
  return state;
};

test('authenticated progress reports actual cloud transfer and preview stages', async (t) => {
  let stage = { stage: 'original', percent: 42 };
  const f = fixture(t, async (url, options) => {
    assert.equal(url, 'https://backend.example/api/upload/oss/progress/upload-id');
    assert.equal(options.headers.Authorization, 'Bearer admin-token');
    return { ok: true, json: async () => ({ data: stage }) };
  });
  await tick();
  assert.equal(f.delay, 2000);
  assert.equal(f.progress[0][3].label, '正在保存云端原图：42%');
  assert.equal(f.progress[0][1], 25000);
  stage = { stage: 'preview', percent: 0 };
  await f.poll();
  assert.equal(f.progress[1][3].label, '原图已保存，正在保存高清预览...');
  stage = { stage: 'complete', percent: 100 };
  await f.poll();
  assert.equal(f.progress[2][0], 98);
});

test('unsupported progress endpoints and network failures do not fail the upload', async (t) => {
  let fail = false;
  const f = fixture(t, async () => {
    if (fail) throw new Error('network unavailable');
    return { ok: false, status: 404 };
  });
  await tick();
  fail = true;
  await f.poll();
  assert.deepEqual(f.progress, []);
});

test('stopping aborts outstanding polls, clears timers and ignores late responses', async (t) => {
  let resolve;
  let signal;
  const f = fixture(t, (_url, options) => {
    signal = options.signal;
    return new Promise(done => { resolve = done; });
  });
  f.stop();
  assert.equal(signal.aborted, true);
  assert.deepEqual(f.cleared, [123]);
  resolve({ ok: true, json: async () => ({ data: { stage: 'complete', percent: 100 } }) });
  await tick();
  await f.poll();
  assert.deepEqual(f.progress, []);
});

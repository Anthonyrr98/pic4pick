import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Execute the actual hook with injected React state and API failures. Bundling
// resolves its browser imports without requiring a DOM or production services.
const loadHook = async () => {
  const bundle = await build({ entryPoints: ['src/hooks/usePhotoManagement.js'], bundle: true, write: false, format: 'esm',
    plugins: [{ name: 'hook-fixture', setup(builder) {
      builder.onResolve({ filter: /^(react|\.\.\/utils\/)/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
        const f = globalThis.__adminHookFixture;
        export const useState = initial => { const i=f.states.length; f.states.push(initial()); return [f.states[i], updater => { f.states[i]=typeof updater==='function' ? updater(f.states[i]) : updater; }]; };
        export const useRef = value => ({current:value});
        export const useCallback = fn => fn;
        export const Storage = {get: key => f.initial[key] || [], set: () => true};
        export const STORAGE_KEYS = {ADMIN_UPLOADS:'pending',APPROVED_PHOTOS:'approved',REJECTED_PHOTOS:'rejected'};
        export const ensureHttps = url => url;
        export const handleError = () => {};
        export const formatErrorMessage = e => e.message;
        export const ErrorType = {NETWORK:'network',STORAGE:'storage'};
        export const updateAdminPhoto = (...args) => f.update(...args);
        export const upsertAdminPhoto = () => {};
        export const deleteAdminPhoto = () => {};
        export const deleteOSSFile = () => {};
        export const buildSupabasePayloadFromPhoto = photo => photo;
      ` }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}#${Math.random()}`);
};
const target = { id: 'target', status: 'rejected', reject_reason: '曝光不足' };
const fixture = async (update, refresh = async () => {}) => {
  const f = { states: [], initial: { pending: [{ id: 'pending-other' }], rejected: [{ id: 'before' }, target, { id: 'after' }] }, update };
  globalThis.__adminHookFixture = f;
  const { usePhotoManagement } = await loadHook();
  f.hook = usePhotoManagement({}, refresh, (message) => { f.message = message; });
  return f;
};

test('failed resubmit restores original position, status and rejection reason', async () => {
  const f = await fixture(async () => { throw new Error('simulated network failure'); });
  assert.equal(await f.hook.handleResubmit('target'), false);
  assert.deepEqual(f.states[2].map((photo) => photo.id), ['before', 'target', 'after']);
  assert.equal(f.states[2][1].reject_reason, target.reject_reason);
  assert.equal(f.states[2][1].status, 'rejected');
  assert.deepEqual(f.states[0].map((photo) => photo.id), ['pending-other']);
  assert.equal(f.message.type, 'error');
});

test('rollback preserves unrelated changes made while request is pending', async () => {
  let reject;
  const f = await fixture(() => new Promise((_resolve, fail) => { reject = fail; }));
  const operation = f.hook.handleResubmit('target');
  f.hook.setAdminUploads((prev) => [{ id: 'new-pending' }, ...prev]);
  f.hook.setRejectedPhotos((prev) => [...prev, { id: 'new-rejected' }]);
  reject(new Error('failed'));
  await operation;
  assert.deepEqual(f.states[0].map((photo) => photo.id), ['new-pending', 'pending-other']);
  assert.deepEqual(f.states[2].map((photo) => photo.id), ['before', 'target', 'after', 'new-rejected']);
});

test('committed resubmit is not rolled back when subsequent refresh fails', async () => {
  const f = await fixture(async () => [], async () => { throw new Error('refresh failed'); });
  assert.equal(await f.hook.handleResubmit('target'), true);
  assert.equal(f.states[0][0].status, 'pending');
  assert.ok(!f.states[2].some((photo) => photo.id === 'target'));
  assert.equal(f.message.type, 'info');
});

test('duplicate resubmit while request is pending does not duplicate list items', async () => {
  let resolve; let calls = 0;
  const f = await fixture(() => { calls += 1; return new Promise((done) => { resolve = done; }); });
  const first = f.hook.handleResubmit('target');
  assert.equal(await f.hook.handleResubmit('target'), false);
  resolve([]); await first;
  assert.equal(calls, 1);
  assert.equal(f.states[0].filter((photo) => photo.id === 'target').length, 1);
});

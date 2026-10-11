import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhotoSubmission } from '../src/utils/photoSubmission.js';

const fixture = () => {
  const stored = new Map();
  const storage = { get: (key) => stored.get(key), set: (key, data) => stored.set(key, structuredClone(data)), remove: (key) => stored.delete(key) };
  const uploads = [];
  const commits = [];
  const faults = {};
  let nextId = 0;
  const create = () => createPhotoSubmission({ storage, uuid: () => `id-${++nextId}`, digest: async (file) => file.content,
    uploadImage: async (_file, filename, _progress, _type, options) => {
      uploads.push({ filename, options });
      if (faults.upload) throw new Error('upload response lost');
      return { url: `https://example.com/${filename}`, thumbnailUrl: null, uploadId: options.uploadId };
    },
    createPhoto: async (photo, uploadId) => {
      commits.push({ photo, uploadId });
      if (faults.commit) throw faults.commit;
      return [photo];
    },
  });
  const file = { name: 'test.jpg', size: 123, content: 'file-content-hash' };
  return { create, controller: create(), stored, uploads, commits, faults, file };
};

test('failed save and page reload reuse upload results and stable photo ID', async () => {
  const f = fixture();
  const first = await f.controller.getUpload(f.file, 'aliyun_oss', null, true);
  f.faults.commit = new Error('database unavailable');
  await assert.rejects(f.controller.commit(first, { id: first.id }), /database unavailable/);
  const reloaded = f.create();
  const retry = await reloaded.getUpload({ ...f.file }, 'aliyun_oss', null, true);
  assert.equal(retry.id, first.id);
  assert.deepEqual(retry.result, first.result);
  assert.equal(f.uploads.length, 1);
  f.faults.commit = null;
  await reloaded.commit(retry, { id: retry.id });
  assert.equal(f.commits[1].uploadId, first.id);
  assert.equal(f.stored.size, 0);
  assert.notEqual((await reloaded.getUpload(f.file, 'aliyun_oss', null, true)).id, first.id);
});

test('lost upload response preserves ID and filename on retry', async () => {
  const f = fixture(); f.faults.upload = true;
  await assert.rejects(f.controller.getUpload(f.file, 'aliyun_oss', null, true), /response lost/);
  f.faults.upload = false;
  await f.create().getUpload({ ...f.file }, 'aliyun_oss', null, true);
  assert.deepEqual(f.uploads[0], f.uploads[1]);
});

test('expired cache discards URLs and reuploads on the next attempt', async () => {
  const f = fixture(); const attempt = await f.controller.getUpload(f.file, 'aliyun_oss', null, true);
  f.faults.commit = Object.assign(new Error('expired'), { status: 410 });
  await assert.rejects(f.controller.commit(attempt, { id: attempt.id }), /expired/);
  await f.controller.getUpload(f.file, 'aliyun_oss', null, true);
  assert.equal(f.uploads.length, 2);
  assert.equal(f.uploads[0].filename, f.uploads[1].filename);
});

test('changing file bytes or storage type never reuses stale uploaded URLs', async () => {
  const f = fixture(); const first = await f.controller.getUpload(f.file, 'aliyun_oss', null, true);
  const second = await f.controller.getUpload({ ...f.file, content: 'different-hash' }, 'aliyun_oss', null, true);
  const third = await f.controller.getUpload(f.file, 'api', null, false);
  assert.notEqual(second.id, first.id); assert.notEqual(third.id, first.id);
  assert.equal(f.uploads.length, 3);
});

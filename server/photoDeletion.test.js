import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhotoDeletionService, getPhotoOssAssets } from './photoDeletion.js';

const origin = 'https://test-bucket.oss-cn-beijing.aliyuncs.com/origin/2026/10/11/test.jpg';
const preview = 'https://test-bucket.oss-cn-beijing.aliyuncs.com/ore/hd/2026/10/11/test.jpg';
const photo = { id: 'photo-1', image_url: origin, thumbnail_url: preview };

const fixture = (initialPhotos = [photo]) => {
  const photos = new Map(initialPhotos.map((row) => [row.id, { ...row }]));
  const jobs = new Map();
  const deletedKeys = [];
  const events = [];
  const faults = {};
  const db = async (table, params, options = {}) => {
    const method = options.method || 'GET';
    events.push(`${method} ${table}`);
    if (table === 'photos') {
      if (method === 'DELETE') {
        if (faults.recordDelete) throw new Error('database unavailable');
        if (faults.noRowsDeleted) return [];
        const id = params.get('id').slice(3);
        const existed = photos.delete(id);
        if (faults.ambiguousDelete) throw new Error('response lost after commit');
        return existed ? [{ id }] : [];
      }
      if (params.has('or')) {
        const objectPath = params.get('or').match(/like\."\*\/([^"*]+)\*/)[1];
        return [...photos.values()].filter((row) => [row.image_url, row.thumbnail_url]
          .some((url) => url?.includes(`/${objectPath}`)));
      }
      return [...photos.values()].filter((row) => row.id === params.get('id').slice(3));
    }
    if (method === 'POST') {
      if (faults.queueWrite) throw new Error('queue unavailable');
      jobs.set(options.body.id, structuredClone(options.body));
      return null;
    }
    const id = params.get('id');
    if (method === 'DELETE') {
      if (faults.queueRemove) throw new Error('queue delete unavailable');
      jobs.delete(id.slice(3));
      return null;
    }
    if (method === 'PATCH') {
      const job = jobs.get(id.slice(3));
      if (job) Object.assign(job, options.body);
      return null;
    }
    return id?.startsWith('like.') ? [...jobs.values()] : [jobs.get(id.slice(3))].filter(Boolean);
  };
  const deleteObject = async (key) => {
    events.push(`OSS ${key}`);
    if (faults.oss) throw faults.oss;
    deletedKeys.push(key);
  };
  const create = () => createPhotoDeletionService({ db, deleteObject, bucket: 'test-bucket', logger: { warn() {} } });
  return { service: create(), create, photos, jobs, events, deletedKeys, faults };
};

test('database deletion precedes OSS; exact original and HD preview paths are cleaned', async () => {
  const f = fixture();
  const result = await f.service.removePhoto(photo.id);
  assert.equal(result.cleanup.pending, false);
  assert.equal(f.photos.size, 0);
  assert.equal(f.jobs.size, 0);
  assert.deepEqual(f.deletedKeys, ['origin/2026/10/11/test.jpg', 'ore/hd/2026/10/11/test.jpg']);
  assert.ok(f.events.indexOf('POST app_settings') < f.events.indexOf('DELETE photos'));
  assert.ok(f.events.indexOf('DELETE photos') < f.events.findIndex((event) => event.startsWith('OSS ')));
});

test('queue write failure aborts before database or image deletion', async () => {
  const f = fixture();
  f.faults.queueWrite = true;
  await assert.rejects(f.service.removePhoto(photo.id), /queue unavailable/);
  assert.equal(f.photos.size, 1);
  assert.equal(f.deletedKeys.length, 0);
});

test('database failure preserves every image, including during background retry', async () => {
  const f = fixture();
  f.faults.recordDelete = true;
  await assert.rejects(f.service.removePhoto(photo.id), /database unavailable/);
  await f.create().retryPending();
  assert.equal(f.photos.size, 1);
  assert.equal(f.jobs.size, 1);
  assert.equal(f.deletedKeys.length, 0);
});

test('ambiguous database response is recovered from durable intent after restart', async () => {
  const f = fixture();
  f.faults.ambiguousDelete = true;
  await assert.rejects(f.service.removePhoto(photo.id), /response lost/);
  assert.equal(f.photos.size, 0);
  assert.equal(f.jobs.size, 1);
  await f.create().retryPending();
  assert.equal(f.jobs.size, 0);
  assert.equal(f.deletedKeys.length, 2);
});

test('a zero-row database deletion cannot report success or remove images', async () => {
  const f = fixture();
  f.faults.noRowsDeleted = true;
  await assert.rejects(f.service.removePhoto(photo.id), /作品记录仍存在/);
  assert.equal(f.photos.size, 1);
  assert.equal(f.deletedKeys.length, 0);
});

test('OSS failure reports pending cleanup and a restarted worker retries it', async () => {
  const f = fixture();
  f.faults.oss = new Error('OSS timeout');
  const result = await f.service.removePhoto(photo.id);
  assert.equal(result.cleanup.pending, true);
  assert.equal(f.photos.size, 0);
  assert.equal(f.jobs.size, 1);
  delete f.faults.oss;
  await f.create().retryPending();
  assert.equal(f.jobs.size, 0);
  assert.equal(f.deletedKeys.length, 2);
});

test('images used by another photo are retained, including signed/HTTP variants', async () => {
  const f = fixture([photo, { id: 'photo-2', image_url: origin.replace('https:', 'http:') + '?x-oss-process=image/resize,w_300' }]);
  const result = await f.service.removePhoto(photo.id);
  assert.equal(result.cleanup.pending, false);
  assert.equal(f.photos.size, 1);
  assert.deepEqual(f.deletedKeys, ['ore/hd/2026/10/11/test.jpg']);
});

test('missing objects count as cleaned and retrying a completed deletion is idempotent', async () => {
  const f = fixture();
  f.faults.oss = Object.assign(new Error('missing'), { code: 'NoSuchKey', status: 404 });
  assert.equal((await f.service.removePhoto(photo.id)).cleanup.pending, false);
  assert.deepEqual((await f.service.removePhoto(photo.id)).data, []);
  assert.equal(f.jobs.size, 0);
});

test('duplicate original/preview URL is cleaned once', async () => {
  const f = fixture([{ ...photo, thumbnail_url: origin }]);
  await f.service.removePhoto(photo.id);
  assert.equal(f.deletedKeys.length, 1);
});

test('queue removal failure remains recoverable without restoring deleted records', async () => {
  const f = fixture();
  f.faults.queueRemove = true;
  assert.equal((await f.service.removePhoto(photo.id)).cleanup.pending, true);
  delete f.faults.queueRemove;
  await f.create().retryPending();
  assert.equal(f.jobs.size, 0);
  assert.equal(f.photos.size, 0);
});

test('only safe paths in the configured bucket are owned by the cleanup service', () => {
  for (const url of [
    'https://other.oss-cn-beijing.aliyuncs.com/origin/test.jpg',
    'https://example.com/origin/test.jpg',
    'https://test-bucket.oss-cn-beijing.aliyuncs.com/private/test.jpg',
    'https://test-bucket.oss-cn-beijing.aliyuncs.com/origin/%2e%2e%2fprivate.jpg',
    'https://test-bucket.oss-cn-beijing.aliyuncs.com/origin/%zz.jpg',
  ]) assert.deepEqual(getPhotoOssAssets({ image_url: url }, 'test-bucket'), []);
});

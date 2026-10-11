import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhotoUploadService } from './photoUploads.js';

const id = '30c6e319-8d38-4a62-aad3-e13fc2ebfe0a';
const url = (key) => `https://test-bucket.oss-cn-beijing.aliyuncs.com/${key}`;
const assets = ['origin/2026/10/11/test.jpg', 'ore/hd/2026/10/11/test.jpg'].map((key) => ({ key, url: url(key) }));
const result = { url: assets[0].url, thumbnailUrl: assets[1].url };
const photo = { id, title: 'test', image_url: result.url, thumbnail_url: result.thumbnailUrl, status: 'pending' };

const fixture = () => {
  const photos = new Map();
  const jobs = new Map();
  const objects = new Set();
  const deleted = [];
  const events = [];
  const faults = {};
  let clock = Date.parse('2026-10-11T12:00:00Z');
  const db = async (table, params, options = {}) => {
    const method = options.method || 'GET';
    events.push(`${method} ${table}`);
    if (table === 'photos') {
      if (method === 'POST') {
        if (faults.insert) throw new Error('database unavailable');
        const body = options.body;
        if (!photos.has(body.id)) photos.set(body.id, structuredClone(body));
        if (faults.lostCommitResponse) throw new Error('response lost after commit');
        return [photos.get(body.id)];
      }
      if (faults.read) throw new Error('database read unavailable');
      if (params.has('or')) {
        const path = params.get('or').match(/like\."\*\/([^"*]+)\*/)[1];
        return [...photos.values()].filter((row) => [row.image_url, row.thumbnail_url].some((value) => value?.includes(`/${path}`)));
      }
      return [photos.get(params.get('id').slice(3))].filter(Boolean);
    }
    if (method === 'POST') {
      if (faults.queueWrite) throw new Error('queue unavailable');
      jobs.set(options.body.id, structuredClone(options.body));
      return null;
    }
    if (method === 'DELETE') {
      if (faults.queueRemove) throw new Error('queue removal unavailable');
      jobs.delete(params.get('id').slice(3));
      return null;
    }
    if (method === 'PATCH') {
      Object.assign(jobs.get(params.get('id').slice(3)), options.body);
      return null;
    }
    if (params.get('id').startsWith('like.')) {
      return [...jobs.values()].filter((job) => Date.parse(job.data.expiresAt) <= clock).slice(0, 20);
    }
    return [jobs.get(params.get('id').slice(3))].filter(Boolean);
  };
  const create = () => createPhotoUploadService({ db, bucket: 'test-bucket', logger: { warn() {} }, now: () => clock,
    deleteObject: async (key) => {
      if (faults.cleanup) throw new Error('OSS unavailable');
      objects.delete(key); deleted.push(key);
    },
  });
  let writes = 0;
  const upload = (service, overrides = {}) => service.upload({ id, fingerprint: 'same-file-hash', assets, result,
    writeObjects: async (savedAssets) => {
      writes += 1;
      objects.add(savedAssets[0].key);
      if (faults.partialUpload) throw new Error('preview upload timeout');
      savedAssets.slice(1).forEach(({ key }) => objects.add(key));
    }, ...overrides,
  });
  return { service: create(), create, upload, photos, jobs, objects, faults, deleted, events,
    get writes() { return writes; }, advance: (hours) => { clock += hours * 60 * 60 * 1000; } };
};

test('queue failure prevents all OSS writes', async () => {
  const f = fixture(); f.faults.queueWrite = true;
  await assert.rejects(f.upload(f.service), /queue unavailable/);
  assert.equal(f.writes, 0);
});

test('failed metadata save reuses uploaded URLs and one ID after server restart', async () => {
  const f = fixture();
  const uploaded = await f.upload(f.service);
  f.faults.insert = true;
  await assert.rejects(f.service.createPhoto(photo, id), /database unavailable/);
  const restarted = f.create();
  f.advance(30);
  assert.deepEqual(await f.upload(restarted, { result: { ...result, url: url('origin/new-day/test.jpg') } }), uploaded);
  assert.equal(f.writes, 1);
  f.faults.insert = false;
  await restarted.createPhoto(photo, id);
  assert.equal(f.photos.size, 1);
  assert.equal(f.jobs.size, 0);
  assert.equal(f.objects.size, 2);
  assert.ok(f.events.indexOf('POST app_settings') < f.events.indexOf('POST photos'));
});

test('lost commit response does not duplicate records or delete committed images', async () => {
  const f = fixture(); await f.upload(f.service);
  f.faults.lostCommitResponse = true;
  await assert.rejects(f.service.createPhoto(photo, id), /response lost/);
  f.photos.get(id).status = 'approved';
  const [saved] = await f.create().createPhoto(photo, id);
  assert.equal(saved.status, 'approved');
  assert.equal(f.photos.size, 1);
  assert.equal(f.deleted.length, 0);
});

test('abandoned uploads expire after 48 hours and cached save returns 410', async () => {
  const f = fixture(); await f.upload(f.service);
  f.advance(47); await f.service.retryPending();
  assert.equal(f.objects.size, 2);
  f.advance(2); await f.create().retryPending();
  assert.equal(f.objects.size, 0);
  assert.equal(f.jobs.size, 0);
  await assert.rejects(f.service.createPhoto(photo, id), (error) => error.status === 410);
});

test('partial upload failure immediately cleans the original and uncertain preview', async () => {
  const f = fixture(); f.faults.partialUpload = true;
  await assert.rejects(f.upload(f.service), /preview upload timeout/);
  assert.equal(f.objects.size, 0);
  assert.deepEqual(f.deleted, assets.map(({ key }) => key));
  assert.equal(f.jobs.size, 0);
});

test('failed partial cleanup persists for background retry after restart', async () => {
  const f = fixture(); f.faults.partialUpload = true; f.faults.cleanup = true;
  await assert.rejects(f.upload(f.service), /preview upload timeout/);
  assert.equal(f.objects.size, 1);
  assert.equal(f.jobs.size, 1);
  f.faults.cleanup = false;
  await f.create().retryPending();
  assert.equal(f.objects.size, 0);
  assert.equal(f.jobs.size, 0);
});

test('database lookup failure preserves images during expired cleanup', async () => {
  const f = fixture(); await f.upload(f.service); f.advance(49); f.faults.read = true;
  await f.service.retryPending();
  assert.equal(f.objects.size, 2);
  assert.equal(f.jobs.size, 1);
});

test('another photo using a signed or HTTP URL protects the underlying original', async () => {
  const f = fixture(); await f.upload(f.service);
  f.photos.set('other', { id: 'other', image_url: assets[0].url.replace('https:', 'http:') + '?signature=abc' });
  f.advance(49); await f.service.retryPending();
  assert.ok(f.objects.has(assets[0].key));
  assert.ok(!f.objects.has(assets[1].key));
  assert.equal(f.jobs.size, 0);
});

test('committed photo survives cleanup when removing its tracking job failed', async () => {
  const f = fixture(); await f.upload(f.service); f.faults.queueRemove = true;
  await f.service.createPhoto(photo, id);
  assert.equal(f.jobs.size, 1);
  f.faults.queueRemove = false; f.advance(49); await f.service.retryPending();
  assert.equal(f.objects.size, 2);
  assert.equal(f.jobs.size, 0);
});

test('same upload ID cannot be reused for different file bytes', async () => {
  const f = fixture(); await f.upload(f.service);
  await assert.rejects(f.upload(f.service, { fingerprint: 'other-file-hash' }), (error) => error.status === 409);
  assert.equal(f.writes, 1);
});

test('original-only upload accepts the original as thumbnail fallback', async () => {
  const f = fixture();
  await f.upload(f.service, { assets: [assets[0]], result: { url: result.url, thumbnailUrl: null } });
  await f.service.createPhoto({ ...photo, thumbnail_url: result.url }, id);
  assert.equal(f.photos.size, 1);
});

test('cleanup cannot run while a photo save is in flight', async () => {
  const f = fixture(); await f.upload(f.service);
  f.advance(49);
  // Start commit before the background worker; the id lock protects the files.
  await Promise.all([f.service.createPhoto(photo, id), f.service.retryPending()]);
  assert.equal(f.photos.size, 1);
  assert.equal(f.objects.size, 2);
});

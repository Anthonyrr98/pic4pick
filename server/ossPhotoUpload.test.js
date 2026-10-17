import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadPhotoObject } from './ossPhotoUpload.js';

const logger = { info() {}, warn() {} };
const headers = { 'Content-Type': 'image/jpeg', 'Content-Disposition': 'attachment; filename="original.jpg"', 'x-oss-object-acl': 'public-read' };
const options = { key: 'origin/2026/10/18/photo.jpg', timeout: 300_000, headers, logger };

test('small photos preserve the existing PUT behavior, headers and bytes', async () => {
  const buffer = Buffer.from('original bytes');
  const result = { name: options.key };
  const client = { put: async (key, data, settings) => {
    assert.equal(key, options.key);
    assert.equal(data, buffer);
    assert.deepEqual(settings, { timeout: options.timeout, headers });
    return result;
  } };
  assert.equal(await uploadPhotoObject({ ...options, client, buffer }), result);
});

test('25 MB originals use 1 MB parts with bounded concurrency and request timeouts', async () => {
  const buffer = Buffer.alloc(25 * 1024 * 1024);
  const progress = [];
  const client = { multipartUpload: async (key, data, settings) => {
    assert.equal(key, options.key);
    assert.equal(data, buffer, 'Original bytes must never be recompressed');
    assert.equal(settings.partSize, 1024 * 1024);
    assert.equal(settings.parallel, 3);
    assert.equal(settings.timeout, 60_000);
    assert.equal(settings.mime, 'image/jpeg');
    assert.equal(settings.headers, headers);
    settings.progress(0, { uploadId: 'multipart-id' });
    settings.progress(0.08, { uploadId: 'multipart-id' });
    settings.progress(0.15, { uploadId: 'multipart-id' });
    settings.progress(0.19, { uploadId: 'multipart-id' });
    return { name: key };
  } };
  const result = await uploadPhotoObject({ ...options, client, buffer, logger: { info: (_message, entry) => progress.push(entry.percent) } });
  assert.equal(result.name, options.key);
  assert.deepEqual(progress, [0, 10]);
});

test('failed multipart uploads abort only their own upload and preserve the original failure', async () => {
  const failure = new Error('part timed out');
  const aborted = [];
  const client = {
    multipartUpload: async (_key, _data, settings) => {
      settings.progress(0.1, { uploadId: 'own-upload' });
      throw failure;
    },
    abortMultipartUpload: async (...args) => { aborted.push(args); },
  };
  await assert.rejects(uploadPhotoObject({ ...options, client, buffer: Buffer.alloc(4 * 1024 * 1024) }), error => error === failure);
  assert.deepEqual(aborted, [[options.key, 'own-upload', { timeout: 15_000 }]]);
});

test('initialization failures do not abort an unknown upload', async () => {
  const failure = new Error('OSS unavailable');
  const client = { multipartUpload: async () => { throw failure; } };
  await assert.rejects(uploadPhotoObject({ ...options, client, buffer: Buffer.alloc(4 * 1024 * 1024) }), error => error === failure);
});

test('abort failures are logged without hiding the transfer error', async () => {
  const failure = new Error('part timed out');
  const warnings = [];
  const client = {
    multipartUpload: async (_key, _data, settings) => { settings.progress(0, { uploadId: 'own-upload' }); throw failure; },
    abortMultipartUpload: async () => { throw Object.assign(new Error('unavailable'), { code: 'Timeout' }); },
  };
  await assert.rejects(uploadPhotoObject({ ...options, client, buffer: Buffer.alloc(4 * 1024 * 1024), logger: {
    info() {}, warn: (_message, data) => warnings.push(data),
  } }), error => error === failure);
  assert.equal(warnings[0].uploadId, 'own-upload');
});

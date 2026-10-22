import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { registerFrontendStatic } from './frontendStatic.js';

async function fixture(t, { enabled = false, build = true } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'pic4pick-frontend-static-'));
  const distDir = path.join(root, 'dist');
  const indexPath = path.join(distDir, 'index.html');
  const assetPath = path.join(distDir, 'app.js');
  await mkdir(distDir);
  if (build) {
    await writeFile(indexPath, '<!doctype html><title>Gallery</title>');
    await writeFile(assetPath, 'window.gallery = true;');
  }
  const errors = [];
  const app = express();
  app.set('env', 'production');
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  registerFrontendStatic(app, { enabled, distDir });
  app.use((error, _req, res, _next) => {
    errors.push(error);
    res.status(500).json({ error: error.message });
  });
  const server = app.listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await Promise.all([rm(indexPath, { force: true }), rm(assetPath, { force: true })]);
    await rmdir(distDir);
    await rmdir(root);
  });
  await new Promise(resolve => server.once('listening', resolve));
  return {
    indexPath, errors,
    request: (url, options) => fetch(`http://127.0.0.1:${server.address().port}${url}`, {
      signal: AbortSignal.timeout(3000), ...options,
    }),
  };
}

test('production API-only mode does not serve a build without explicit opt-in', async t => {
  const f = await fixture(t);
  for (const url of ['/', '/admin', '/app.js']) {
    const response = await f.request(url);
    assert.equal(response.status, 404);
    assert.ok(!(await response.text()).includes('Gallery'));
  }
  assert.deepEqual(await (await f.request('/api/health')).json(), { status: 'ok' });
  assert.equal(f.errors.length, 0);
});

test('explicit static hosting without index.html returns 404 without leaking paths', async t => {
  const f = await fixture(t, { enabled: true, build: false });
  for (const method of ['GET', 'HEAD']) {
    const response = await f.request('/', { method });
    assert.equal(response.status, 404);
    const body = await response.text();
    assert.ok(!body.includes('ENOENT') && !body.includes('pic4pick-frontend-static-'));
  }
  assert.equal((await f.request('/api/health')).status, 200);
  assert.equal(f.errors.length, 0);
});

test('explicit static hosting preserves real assets and SPA client routes', async t => {
  const f = await fixture(t, { enabled: true });
  for (const url of ['/', '/admin', '/gallery/deep-link']) {
    const response = await f.request(url);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '<!doctype html><title>Gallery</title>');
  }
  const asset = await f.request('/app.js');
  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), 'window.gallery = true;');
  assert.equal(f.errors.length, 0);
});

test('static SPA fallback preserves API health and API/uploads not-found responses', async t => {
  const f = await fixture(t, { enabled: true });
  assert.deepEqual(await (await f.request('/api/health')).json(), { status: 'ok' });
  for (const url of ['/api/unknown', '/uploads/missing.jpg']) {
    const response = await f.request(url);
    assert.equal(response.status, 404);
    assert.ok(!(await response.text()).includes('Gallery'));
  }
  assert.equal(f.errors.length, 0);
});

test('a build removed after startup falls through to 404 instead of the error handler', async t => {
  const f = await fixture(t, { enabled: true });
  await rm(f.indexPath);
  const response = await f.request('/gallery/deep-link');
  assert.equal(response.status, 404);
  assert.ok(!(await response.text()).includes('ENOENT'));
  assert.equal(f.errors.length, 0);
});

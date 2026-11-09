import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdtemp, readdir, rm, symlink } from 'node:fs/promises';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import sharp from 'sharp';

async function waitFor(condition) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await condition()) return true;
    await sleep(50);
  }
  return false;
}

test('release HTTP contract rejects malformed bodies and cleans up interrupted uploads', { timeout: 20_000 }, async (t) => {
  const source = fileURLToPath(new URL('./', import.meta.url));
  const temporaryRoot = resolve(tmpdir());
  const workspace = await mkdtemp(join(temporaryRoot, 'pic4pick-http-'));
  assert.equal(dirname(resolve(workspace)), temporaryRoot);
  t.after(() => rm(workspace, { recursive: true, force: true }));
  for (const file of await readdir(source)) {
    if (file === 'package.json' || (file.endsWith('.js') && !file.endsWith('.test.js'))) {
      await copyFile(join(source, file), join(workspace, file));
    }
  }
  await symlink(join(source, 'node_modules'), join(workspace, 'node_modules'), 'junction');
  const probe = createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  await new Promise(resolve => probe.close(resolve));
  const secret = 'isolated-release-http-test-credentials';
  const child = spawn(process.execPath, ['server-enhanced.js'], {
    cwd: workspace,
    env: {
      ...process.env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test',
      RENDER: 'false', SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_SERVICE_ROLE_KEY: 'fixture',
      JWT_SECRET: secret, ADMIN_USERNAME: 'fixture', ADMIN_PASSWORD: 'isolated-fixture-password',
      LIKE_NOTIFICATION_ENABLED: 'false',
    },
    stdio: 'ignore',
  });
  try {
    const baseURL = `http://127.0.0.1:${port}`;
    const health = () => fetch(`${baseURL}/api/health`, { signal: AbortSignal.timeout(500) });
    assert.ok(await waitFor(async () => (await health().catch(() => null))?.ok), 'isolated server did not start');
    const post = (body, extra = {}) => fetch(`${baseURL}/api/auth/login`, {
      method: 'POST', body, headers: { 'Content-Type': 'application/json', ...extra },
    });
    const gzip = Buffer.concat([gzipSync('{}'), Buffer.from('trailing bytes')]);
    assert.equal((await post(gzip, { 'Content-Encoding': 'gzip' })).status, 415);
    assert.equal((await post(JSON.stringify({ data: 'x'.repeat(1024 * 1024) }))).status, 413);
    assert.equal((await post('{')).status, 400);
    assert.equal((await post('')).status, 400);
    assert.equal((await health()).status, 200);

    const login = await post(JSON.stringify({ username: 'fixture', password: 'isolated-fixture-password' }));
    assert.equal(login.status, 200);
    const { token } = await login.json();
    assert.ok(token);
    const authorization = `Bearer ${token}`;
    const upload = `${baseURL}/api/upload/oss`;
    const form = new FormData();
    form.append('file', new Blob(['not an image'], { type: 'image/jpeg' }), 'photo.jpgother');
    assert.equal((await fetch(upload, { method: 'POST', headers: { Authorization: authorization }, body: form })).status, 415);

    const image = await sharp({ create: { width: 32, height: 24, channels: 3, background: 'red' } }).jpeg().toBuffer();
    const boundary = 'isolated-multipart-boundary';
    const incomplete = request(upload, {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    });
    incomplete.on('error', () => {});
    incomplete.write(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`);
    incomplete.write(image);
    const uploads = join(workspace, 'uploads', 'pic4pick');
    const sawFile = await waitFor(async () => (await readdir(uploads)).length === 1);
    incomplete.destroy();
    assert.ok(sawFile, 'interrupted multipart request did not reach disk storage');
    assert.ok(await waitFor(async () => (await readdir(uploads)).length === 0), 'interrupted upload left a temporary file');
    assert.equal((await health()).status, 200);
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  }
});

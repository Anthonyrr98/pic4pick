import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createPhotoLikeHandler } from './photoLikes.js';

const fixture = async (t, overrides = {}) => {
  const calls = [];
  const notifications = [];
  const warnings = [];
  const app = express();
  app.use(express.json());
  app.patch('/api/photos/:id/likes', createPhotoLikeHandler({
    db: async (...args) => { calls.push(args); return [{ id: 'photo-1', likes: 5 }]; },
    notifications: { notify: async (result) => { notifications.push(result); } },
    logger: { warn: (...args) => warnings.push(args) },
    sendError: (res) => res.status(503).json({ error: 'database unavailable' }),
    ...overrides,
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const request = async (delta) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/photos/photo-1/likes`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delta }),
      signal: AbortSignal.timeout(2000),
    });
    return { status: response.status, body: await response.json() };
  };
  return { calls, notifications, warnings, request };
};

test('a committed new like sends one notification and preserves the API response', async (t) => {
  const f = await fixture(t);
  const response = await f.request(1);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { success: true, data: { id: 'photo-1', likes: 5 } });
  assert.deepEqual(f.notifications, [{ id: 'photo-1', likes: 5 }]);
  assert.equal(f.calls[0][0], 'rpc/update_public_photo_likes');
  assert.deepEqual(f.calls[0][2].body, { photo_id: 'photo-1', like_delta: 1 });
});

test('unliking updates the database without sending mail', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request(-1)).status, 200);
  assert.equal(f.calls[0][2].body.like_delta, -1);
  assert.equal(f.notifications.length, 0);
});

test('invalid deltas do not update likes or send notifications', async (t) => {
  const f = await fixture(t);
  for (const delta of [0, 2, null, 'invalid']) assert.equal((await f.request(delta)).status, 400);
  assert.equal(f.calls.length, 0);
  assert.equal(f.notifications.length, 0);
});

test('missing and nonpublic photos do not send notifications', async (t) => {
  const f = await fixture(t, { db: async () => [] });
  assert.equal((await f.request(1)).status, 404);
  assert.equal(f.notifications.length, 0);
});

test('database update failure does not send a notification', async (t) => {
  const f = await fixture(t, { db: async () => { throw new Error('DB unavailable'); } });
  assert.equal((await f.request(1)).status, 503);
  assert.equal(f.notifications.length, 0);
});

test('pending email delivery does not delay the like response', async (t) => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  t.after(() => release());
  const f = await fixture(t, { notifications: { notify: () => pending } });
  assert.equal((await f.request(1)).status, 200);
  release();
});

test('unexpected email failure does not change the committed like response', async (t) => {
  const f = await fixture(t, { notifications: { notify: () => { throw new Error('mail failure'); } } });
  assert.equal((await f.request(1)).status, 200);
  assert.equal(f.warnings.length, 1);
});

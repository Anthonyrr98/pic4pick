import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createPhotoLikeHandler, createLikeEventsHandler, getLikeClientIp } from './photoLikes.js';

const fixture = async (t, overrides = {}) => {
  const calls = [];
  const notifications = [];
  const warnings = [];
  const app = express();
  app.set('trust proxy', overrides.trustProxy || false);
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
  const request = async (delta, headers = {}, body = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/photos/photo-1/likes`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ delta, ...body }),
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
  assert.equal(f.calls[0][0], 'rpc/update_public_photo_likes_with_ip');
  assert.deepEqual(f.calls[0][2].body, { photo_id: 'photo-1', like_delta: 1, client_ip: '127.0.0.1' });
});

test('normalizes mapped IPv4, supports IPv6, and avoids persisting invalid addresses', () => {
  assert.equal(getLikeClientIp({ ip: '::ffff:203.0.113.1' }), '203.0.113.1');
  assert.equal(getLikeClientIp({ ip: '2001:db8::1' }), '2001:db8::1');
  assert.equal(getLikeClientIp({ ip: 'not an IP' }), null);
  assert.equal(getLikeClientIp({}), null);
});

test('body IP and untrusted forwarded headers cannot override the socket address', async (t) => {
  const f = await fixture(t);
  await f.request(1, { 'X-Forwarded-For': '203.0.113.42' }, { ip: '198.51.100.1', client_ip: '198.51.100.2' });
  assert.equal(f.calls[0][2].body.client_ip, '127.0.0.1');
});

test('a trusted single proxy selects the nearest forwarded address instead of an injected first address', async (t) => {
  const f = await fixture(t, { trustProxy: 1 });
  const result = await f.request(1, { 'X-Forwarded-For': '198.51.100.99, 203.0.113.42' });
  assert.equal(f.calls[0][2].body.client_ip, '203.0.113.42');
  assert.ok(!JSON.stringify(result.body).includes('203.0.113.42'));
});

test('Forwarded is ignored and an extra proxy hop cannot promote the farthest value', async (t) => {
  const f = await fixture(t, { trustProxy: 1 });
  await f.request(1, { Forwarded: 'for=198.51.100.1' });
  assert.equal(f.calls[0][2].body.client_ip, '127.0.0.1');
  const headers = new Headers();
  headers.append('X-Forwarded-For', '198.51.100.1');
  headers.append('X-Forwarded-For', '203.0.113.1, ::ffff:203.0.113.2');
  await f.request(1, Object.fromEntries(headers));
  assert.equal(f.calls[1][2].body.client_ip, '203.0.113.2');
});

test('a short IPv6-mapped trust subnet does not trust unrelated IPv4 addresses', () => {
  const app = express();
  app.set('trust proxy', '::ffff:10.0.0.0/8');
  assert.equal(app.get('trust proxy fn')('203.0.113.42', 0), false);
  app.set('trust proxy', '::ffff:10.0.0.0/104');
  assert.equal(app.get('trust proxy fn')('10.0.0.42', 0), true);
  assert.equal(app.get('trust proxy fn')('203.0.113.42', 0), false);
});

test('database metadata cannot accidentally expose the visitor IP in the public response', async (t) => {
  const f = await fixture(t, { db: async () => [{ id: 'photo-1', likes: 5, ip: '203.0.113.42' }] });
  assert.deepEqual((await f.request(1)).body, { success: true, data: { id: 'photo-1', likes: 5 } });
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

test('v2 requires an operation ID and does not notify again on replay', async (t) => {
  let applied = true;
  const operationId = 'e2db9b8f-6cc0-43dc-8cd8-4712a06d95f7';
  const f = await fixture(t, {
    requireOperationId: true,
    db: async (route, _params, { body }) => {
      assert.equal(route, 'rpc/apply_photo_like_operation');
      assert.equal(body.requested_operation_id, operationId);
      const result = { id: 'photo-1', likes: 5, applied, conflict: body.requested_delta < 0 };
      applied = false;
      return [result];
    },
  });
  assert.equal((await f.request(1)).status, 400);
  assert.equal((await f.request(1, {}, { operationId: 'invalid' })).status, 400);
  assert.equal((await f.request(1, {}, { operationId })).status, 200);
  assert.equal((await f.request(1, {}, { operationId })).status, 200);
  assert.equal((await f.request(-1, {}, { operationId })).status, 409);
  assert.equal(f.notifications.length, 1);
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

test('admin event query applies bounded pagination and an optional exact photo filter', async () => {
  const photoId = '00000000-0000-0000-0000-000000000001';
  const calls = [];
  let output;
  const handler = createLikeEventsHandler({
    db: async (...args) => { calls.push(args); return []; },
    sendError: () => assert.fail('query should succeed'),
  });
  await handler({ query: { photoId, limit: '20', offset: '10' } }, { json: (data) => { output = data; } });
  assert.deepEqual(output, { success: true, data: [] });
  assert.equal(calls[0][0], 'photo_like_events');
  assert.equal(calls[0][1].get('photo_id'), `eq.${photoId}`);
  assert.equal(calls[0][1].get('limit'), '20');
  assert.equal(calls[0][1].get('offset'), '10');
});

test('invalid admin event filters never query the database', async () => {
  const handler = createLikeEventsHandler({ db: () => assert.fail('invalid query'), sendError: () => {} });
  for (const query of [{ photoId: 'injected' }, { photoId: ['array'] }, { limit: '101' }, { offset: '-1' }]) {
    let status;
    await handler({ query }, { status: (value) => { status = value; return { json: () => {} }; } });
    assert.equal(status, 400);
  }
});

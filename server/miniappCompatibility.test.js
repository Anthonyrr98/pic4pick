import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerLikeRoutes, registerAdminUpdateRoutes } from './miniappCompatibility.js';
import { createPhotoLikeHandler } from './photoLikes.js';

test('POST and PATCH likes use the same RPC, IP and shared request limit', async () => {
  const app = express(); app.use(express.json());
  const calls = []; let requests = 0;
  const handler = createPhotoLikeHandler({
    db: async (...args) => { calls.push(args); return [{ id: 'photo', likes: 3 }]; },
    notifications: { notify: async () => {} }, logger: { warn() {} },
    sendError: (res, error) => res.status(500).json({ error: error.message }),
  });
  registerLikeRoutes(app, (_req, res, next) => { requests += 1; if (requests > 3) res.status(429).end(); else next(); }, handler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/photos/photo/likes`;
  try {
    for (const method of ['PATCH', 'POST']) {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delta: 1 }) });
      assert.equal(response.status, 200); assert.deepEqual(await response.json(), { success: true, data: { id: 'photo', likes: 3 } });
    }
    assert.equal(calls.length, 2); assert.equal(calls[0][0], 'rpc/update_public_photo_likes_with_ip');
    assert.deepEqual(calls[0][2], calls[1][2]); assert.equal(calls[0][2].body.client_ip, '127.0.0.1');
    const invalid = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"delta":2}' });
    assert.equal(invalid.status, 400); assert.equal(calls.length, 2);
    assert.equal((await fetch(url, { method: 'PATCH' })).status, 429);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('both admin update methods require token and admin authorization and preserve partial body', async () => {
  const app = express(); app.use(express.json()); const writes = [];
  registerAdminUpdateRoutes(app,
    (req, res, next) => req.headers.authorization ? next() : res.status(401).end(),
    (req, res, next) => req.headers.authorization === 'Bearer admin' ? next() : res.status(403).end(),
    (req, res) => { writes.push({ id: req.params.id, patch: req.body }); res.json({ success: true, data: [req.body] }); });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/admin/photos/photo`;
  try {
    for (const [method, suffix] of [['PATCH', ''], ['POST', '/update']]) {
      assert.equal((await fetch(base + suffix, { method })).status, 401);
      assert.equal((await fetch(base + suffix, { method, headers: { Authorization: 'Bearer viewer' } })).status, 403);
      const response = await fetch(base + suffix, { method, headers: { Authorization: 'Bearer admin', 'Content-Type': 'application/json' }, body: '{"hidden":true}' });
      assert.equal(response.status, 200);
    }
    assert.deepEqual(writes, [{ id: 'photo', patch: { hidden: true } }, { id: 'photo', patch: { hidden: true } }]);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

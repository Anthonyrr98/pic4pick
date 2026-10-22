import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicPhotoSource, PUBLIC_PHOTO_CACHE_KEY, PUBLIC_PHOTO_CACHE_MAX_AGE_MS,
  PUBLIC_PHOTO_REFRESH_INTERVAL_MS } from '../src/utils/publicPhotoData.js';

const photo = (id = 'public') => ({ id, image_url: `https://images.invalid/${id}.jpg`,
  title: id, status: 'approved', hidden: false });
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
function fixture(fetcher = async () => response([photo()])) {
  let time = 10_000_000;
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key) };
  const options = { url: 'https://project.supabase.co', key: 'sb_publishable_test', storage,
    fetcher, now: () => time };
  return { store: createPublicPhotoSource(options), options, values,
    advance: duration => { time += duration; } };
}

test('bootstrap and mount share a public-only request; a new visit refreshes the saved metadata', async () => {
  let requests = 0;
  let release;
  const f = fixture(async (url, options) => {
    requests++;
    const params = new URL(url).searchParams;
    assert.equal(params.get('status'), 'eq.approved');
    assert.equal(params.get('hidden'), 'eq.false');
    assert.equal(params.get('order'), 'created_at.desc');
    assert.ok(!params.get('select').includes('reject_reason'));
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers.apikey, f.options.key);
    await new Promise(resolve => { release = resolve; });
    return response([{ ...photo(), reject_reason: 'private' }, { ...photo('hidden'), hidden: true },
      { ...photo('pending'), status: 'pending' }]);
  });
  const first = f.store.load();
  assert.equal(f.store.load(), first);
  release();
  assert.deepEqual((await first).rows, [photo()]);
  await f.store.load();
  assert.equal(requests, 1, 'The completed bootstrap is also reused by mount');
  const saved = f.values.get(PUBLIC_PHOTO_CACHE_KEY);
  assert.ok(!saved.includes('private') && !saved.includes(f.options.key));
  const reopened = createPublicPhotoSource(f.options);
  assert.equal(reopened.readCache().rows[0].id, 'public');
  const background = reopened.load();
  assert.equal(requests, 2, 'Disk cache must not prevent background revalidation');
  release();
  await background;
});

test('expired, corrupt, future, foreign and non-public caches cannot populate the gallery', async () => {
  const f = fixture();
  await f.store.load();
  const record = JSON.parse(f.values.get(PUBLIC_PHOTO_CACHE_KEY));
  const read = patch => {
    f.values.set(PUBLIC_PHOTO_CACHE_KEY, JSON.stringify({ ...record, ...patch }));
    return createPublicPhotoSource(f.options).readCache();
  };
  assert.equal(read({ source: 'https://other.supabase.co' }), null);
  assert.equal(read({ fetchedAt: record.fetchedAt + 1 }), null);
  assert.equal(read({ rows: [{ ...photo(), hidden: true }] }), null);
  assert.equal(read({ rows: [{ ...photo(), status: 'pending' }] }), null);
  assert.equal(read({ rows: { unexpected: 'object' } }), null);
  f.values.set(PUBLIC_PHOTO_CACHE_KEY, '{bad json');
  assert.equal(createPublicPhotoSource(f.options).readCache(), null);
  f.values.set(PUBLIC_PHOTO_CACHE_KEY, JSON.stringify(record));
  f.advance(PUBLIC_PHOTO_CACHE_MAX_AGE_MS);
  assert.equal(f.store.readCache(), null, 'Memory has the same expiry as disk');
});

test('successful refresh replaces deleted/hidden rows, including a now-empty gallery', async () => {
  let rows = [photo('removed'), photo('kept')];
  const f = fixture(async () => response(rows));
  await f.store.load();
  rows = [{ ...photo('removed'), hidden: true }, photo('kept')];
  f.advance(PUBLIC_PHOTO_REFRESH_INTERVAL_MS);
  assert.deepEqual((await f.store.load()).rows.map(row => row.id), ['kept']);
  rows = [];
  f.advance(PUBLIC_PHOTO_REFRESH_INTERVAL_MS);
  assert.deepEqual((await f.store.load()).rows, []);
  assert.deepEqual(createPublicPhotoSource(f.options).readCache().rows, []);
});

test('an invalidated in-flight read cannot restore photos after an admin write', async () => {
  let release;
  let requests = 0;
  const f = fixture(async () => {
    if (++requests === 1) return new Promise(resolve => { release = () => resolve(response([photo('deleted')])); });
    return response([photo('new')]);
  });
  const outdated = f.store.load();
  const rejected = assert.rejects(outdated, { name: 'AbortError' });
  f.store.invalidate();
  await f.store.load();
  release();
  await rejected;
  assert.deepEqual(f.store.readCache().rows.map(row => row.id), ['new']);
});

test('statement timeout alone gets an unordered fallback with the same visibility filters', async () => {
  const queries = [];
  const f = fixture(async url => {
    queries.push(new URL(url).searchParams);
    return queries.length === 1 ? response({ code: '57014', message: 'statement timeout' }, 500)
      : response([photo()]);
  });
  await f.store.load();
  assert.equal(queries.length, 2);
  assert.equal(queries[1].get('order'), null);
  assert.equal(queries[1].get('status'), 'eq.approved');
  assert.equal(queries[1].get('hidden'), 'eq.false');
});

test('network failure retains only a still-valid cache and allows a later retry', async () => {
  let fail = false;
  let requests = 0;
  const f = fixture(async () => { requests++; if (fail) throw new Error('offline'); return response([photo()]); });
  await f.store.load();
  f.advance(PUBLIC_PHOTO_REFRESH_INTERVAL_MS);
  fail = true;
  await assert.rejects(f.store.load(), /offline/);
  assert.equal(requests, 2, 'Network failures are not retried in a loop');
  assert.equal(f.store.readCache().rows[0].id, 'public');
  f.advance(PUBLIC_PHOTO_CACHE_MAX_AGE_MS);
  assert.equal(f.store.readCache(), null);
  fail = false;
  await f.store.load();
  assert.equal(requests, 3);
});

test('requests have a deadline and storage denial cannot discard a successful response', async () => {
  const timed = createPublicPhotoSource({ url: 'https://project.supabase.co', key: 'legacy-anon-key',
    timeoutMs: 10, fetcher: async (_url, { signal, headers }) => {
      assert.equal(headers.Authorization, 'Bearer legacy-anon-key');
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    } });
  await assert.rejects(timed.load(), /超时/);
  const blocked = createPublicPhotoSource({ url: 'https://project.supabase.co', key: 'key',
    storage: { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } },
    fetcher: async () => response([photo()]) });
  assert.equal(blocked.readCache(), null);
  assert.equal((await blocked.load()).rows[0].id, 'public');
  assert.equal(blocked.readCache().rows[0].id, 'public');
});

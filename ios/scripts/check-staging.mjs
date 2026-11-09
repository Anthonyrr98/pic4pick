import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const config = JSON.parse(await readFile(new URL('../Sources/Pic4Pick/Resources/ClientConfig.json', import.meta.url)));
assert.equal(config.environment, 'staging');
for (const key of ['apiBaseURL', 'supabaseURL']) {
  const url = new URL(config[key]);
  assert.equal(url.protocol, 'https:');
  assert.ok(!['pic.rlzhao.com', 'pic4pick-backend.onrender.com', 'iwlwbnvhgxlnqozduhrp.supabase.co'].includes(url.hostname));
}

const request = (url, options) => fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15_000) });
const api = config.apiBaseURL;
assert.equal((await request(`${api}/api/health`)).status, 200);
const map = await request(`${api}/api/public/map-config`);
assert.equal(map.status, 200);
assert.equal(map.headers.get('cache-control'), 'no-store');
const allowed = new Set(['VITE_MAP_STYLE_PRESET', 'VITE_MAP_USE_AMAP_SDK', 'VITE_AMAP_MAP_STYLE', 'VITE_GAODE_RASTER_STYLE']);
const { data } = await map.json();
assert.ok(data && typeof data === 'object' && !Array.isArray(data));
assert.ok(Object.entries(data).every(([key, value]) => allowed.has(key) && typeof value === 'string'));

const supabaseHeaders = { apikey: config.publicKey, 'Accept-Profile': 'public' };
if (!config.publicKey.startsWith('sb_publishable_')) supabaseHeaders.Authorization = `Bearer ${config.publicKey}`;
const denied = await request(`${config.supabaseURL}/rest/v1/app_settings?select=data&id=eq.env_config`, { headers: supabaseHeaders });
assert.ok([401, 403, 404].includes(denied.status), 'Private settings must not be readable with the public key');

const pageURL = new URL(`${config.supabaseURL}/rest/v1/photos`);
pageURL.search = new URLSearchParams({
  select: 'id', status: 'eq.approved', hidden: 'eq.false', order: 'id.asc', limit: '200',
});
const ids = new Set();
let cursor;
for (;;) {
  if (cursor) pageURL.searchParams.set('id', `gt.${cursor}`);
  const response = await request(pageURL, { headers: supabaseHeaders });
  assert.equal(response.status, 200);
  const rows = await response.json();
  if (!rows.length) break;
  for (const { id } of rows) {
    assert.ok(typeof id === 'string' && (!cursor || id > cursor) && !ids.has(id));
    ids.add(id);
    cursor = id;
  }
}
const minimum = Number(process.env.PIC4PICK_STAGING_MIN_PHOTOS ?? 1001);
assert.ok(Number.isInteger(minimum) && minimum > 0 && ids.size >= minimum, `Expected at least ${minimum} visible fixture photos`);

const invalidBody = await request(`${api}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
  body: Buffer.concat([gzipSync('{}'), Buffer.from('trailing')]),
});
assert.equal(invalidBody.status, 415);
assert.equal((await request(`${api}/api/health`)).status, 200);
console.log(`Staging contract passed for ${ids.size} visible photos, public map config and request parsing.`);

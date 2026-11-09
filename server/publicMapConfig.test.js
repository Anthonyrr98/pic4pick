import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { MAP_STYLE_PRESETS } from '../packages/shared/mapStylePresets.ts';
import { createPublicMapConfigHandler } from './publicMapConfig.js';

async function fixture(t, db) {
  const app = express();
  app.get('/api/public/map-config', createPublicMapConfigHandler({ db, logger: { warn() {} } }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await once(server, 'listening');
  return (query = '') => fetch(`http://127.0.0.1:${server.address().port}/api/public/map-config${query}`);
}

test('public map config returns only supported styles from the fixed settings row', async (t) => {
  let stored;
  const request = await fixture(t, async (table, params) => {
    assert.equal(table, 'app_settings');
    assert.deepEqual(Object.fromEntries(params), { select: 'data', id: 'eq.env_config', limit: '1' });
    return [{ data: stored }];
  });
  for (const preset of MAP_STYLE_PRESETS) {
    const expected = {
      VITE_MAP_STYLE_PRESET: preset.id,
      VITE_MAP_USE_AMAP_SDK: String(preset.kind === 'amap-js'),
      VITE_GAODE_RASTER_STYLE: String(preset.rasterStyle ?? 8),
      ...(preset.amapStyle ? { VITE_AMAP_MAP_STYLE: preset.amapStyle } : {}),
    };
    stored = {
      ...expected,
      VITE_AMAP_WEB_KEY: 'private-web-key',
      VITE_AMAP_SECURITY_JS_CODE: 'private-security-code',
      VITE_SUPABASE_ANON_KEY: 'unrelated-key',
      internalJob: { state: 'private' },
    };
    const response = await request('?id=photo_upload:private&select=*');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { data: expected });
  }
});

test('missing or malformed overrides return an empty config and database failure returns a generic 503', async (t) => {
  let rows = [];
  const request = await fixture(t, async () => {
    if (!rows) throw new Error('private upstream error');
    return rows;
  });
  assert.deepEqual(await (await request()).json(), { data: {} });
  rows = [{ data: {
    VITE_MAP_STYLE_PRESET: 'js_private',
    VITE_AMAP_MAP_STYLE: 'https://untrusted.example/style',
    VITE_MAP_USE_AMAP_SDK: true,
    VITE_GAODE_RASTER_STYLE: '9',
  } }];
  assert.deepEqual(await (await request()).json(), { data: {} });
  rows = null;
  const response = await request();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { error: '地图配置暂不可用' });
});

import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.UI_BASE_URL || 'http://127.0.0.1:5173';
const cacheKey = 'pic4pick_public_photos_v1';
const photo = (id, title = id) => ({ id, title, status: 'approved', hidden: false,
  image_url: 'https://gallery-cache-test.invalid/photo.svg',
  thumbnail_url: 'https://gallery-cache-test.invalid/photo.svg',
  created_at: '2026-10-18T00:00:00Z', category: 'latest' });
const browser = await chromium.launch({ headless: true });
const releases = [];
const errors = [];
let requests = 0;
let hold = false;
let fail = false;
let rows = [photo('one'), photo('two'), photo('three')];

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await context.addInitScript(({ baseUrl }) => {
    localStorage.setItem('pic4pick_env_overrides', JSON.stringify({
      VITE_SUPABASE_URL: 'https://gallery-cache-test.invalid', VITE_SUPABASE_ANON_KEY: 'sb_publishable_test',
      VITE_API_BASE_URL: baseUrl,
    }));
  }, { baseUrl });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/rest/v1/photos') {
      requests++;
      assert.equal(url.searchParams.get('hidden'), 'eq.false');
      if (hold) await new Promise(resolve => { releases.push(resolve); });
      await route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json',
        body: JSON.stringify(fail ? { message: '模拟离线' } : rows) }).catch(() => {});
      return;
    }
    if (url.pathname.startsWith('/api/admin/photos/')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    }
    if (/^\/api\/photos\/[^/]+\/likes$/.test(url.pathname)) {
      return route.fulfill({ contentType: 'application/json', body: '{"success":true}' });
    }
    if (url.origin === new URL(baseUrl).origin) return route.continue();
    if (url.pathname === '/photo.svg') return route.fulfill({ contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#cfa56a"/></svg>' });
    return route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  const page = await context.newPage();
  let photoRequestStarted;
  let galleryChunkStarted;
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/rest/v1/photos' && !photoRequestStarted) photoRequestStarted = Date.now();
    if (pathname === '/src/pages/Gallery.jsx' && !galleryChunkStarted) galleryChunkStarted = Date.now();
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.photo-card').count(), 3);
  assert.equal(requests, 1, 'Bootstrap and StrictMode share one request');
  assert.ok(photoRequestStarted <= galleryChunkStarted, 'Fetch starts before the gallery lazy chunk');
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).rows.length, cacheKey), 3);
  const firstCard = page.locator('.photo-card').first();
  await firstCard.getByRole('button', { name: '点赞', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(100);
  assert.equal(await firstCard.locator('.like-badge-count').textContent(), '1', 'A focus check keeps optimistic likes');

  // Keep the revalidation request pending for ten seconds. The cached cards must
  // remain visible throughout, then be replaced by the server's current list.
  hold = true;
  const began = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.photo-card').first().waitFor({ timeout: 3000 });
  const cachedRenderMs = Date.now() - began;
  assert.equal(await page.locator('.photo-card').count(), 3);
  await page.waitForTimeout(10_000);
  assert.equal(await page.locator('.photo-card').count(), 3);
  rows = [photo('two', '更新后的作品'), photo('new', '新增作品')];
  hold = false;
  releases.splice(0).forEach(resolve => resolve());
  await page.getByRole('heading', { name: '新增作品', exact: true }).waitFor();
  assert.equal(await page.locator('.photo-card').count(), 2);
  assert.equal(requests, 2);
  console.log(JSON.stringify({ scenario: '10-second revalidation', cachedRenderMs, cards: 2, requests }));

  // A failed revalidation must retain a usable cache, with a visible error.
  fail = true;
  hold = true;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.photo-card').first().waitFor();
  await page.locator('.photo-card').first().getByRole('button', { name: '点赞', exact: true }).click();
  hold = false;
  releases.splice(0).forEach(resolve => resolve());
  assert.equal(await page.locator('.photo-card').count(), 2);
  await page.getByText(/加载云端作品失败/).waitFor();
  assert.equal(await page.locator('.photo-card').first().locator('.like-badge-count').textContent(), '1');
  fail = false;

  // Expired metadata must not restore a previously public/hidden/deleted photo.
  await page.evaluate(key => {
    const cache = JSON.parse(localStorage.getItem(key));
    cache.fetchedAt = Date.now() - 6 * 60_000;
    localStorage.setItem(key, JSON.stringify(cache));
  }, cacheKey);
  hold = true;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('正在整理最新作品', { exact: true }).waitFor();
  assert.equal(await page.locator('.photo-card').count(), 0);
  rows = [photo('current', '当前公开作品')];
  hold = false;
  releases.splice(0).forEach(resolve => resolve());
  await page.getByRole('heading', { name: '当前公开作品', exact: true }).waitFor();

  // An admin update invalidates this browser's cache and its other open tabs.
  const other = await context.newPage();
  other.on('pageerror', error => errors.push(error.message));
  await other.goto(baseUrl, { waitUntil: 'networkidle' });
  await other.getByRole('heading', { name: '当前公开作品', exact: true }).waitFor();
  rows = [];
  await page.evaluate(async () => {
    localStorage.setItem('auth_token', 'cache-test-admin');
    const { updateAdminPhoto } = await import('/src/utils/adminApi.js');
    await updateAdminPhoto('current', { hidden: true });
  });
  await page.getByText('暂无符合条件的照片', { exact: true }).waitFor();
  await other.getByText('暂无符合条件的照片', { exact: true }).waitFor();
  assert.equal(await page.locator('.photo-card').count(), 0);
  assert.equal(await other.locator('.photo-card').count(), 0);
  hold = true;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('暂无符合条件的照片', { exact: true }).waitFor();
  assert.equal(await page.locator('.gallery-loading-state').count(), 0, 'A cached empty result is also usable');
  hold = false;
  releases.splice(0).forEach(resolve => resolve());
  assert.deepEqual(errors, []);
  console.log('Gallery cache checks passed: warm visit, background update, offline, expiry, admin invalidation and cross-tab updates.');
} finally {
  releases.splice(0).forEach(resolve => resolve());
  await browser.close();
}

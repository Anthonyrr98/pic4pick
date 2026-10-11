import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = (process.env.UI_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const artifacts = process.env.UI_ARTIFACT_DIR || '';
const photos = [
  { id: 'map-beijing', title: '北京测试照片', country: '中国', location: '北京', latitude: 39.99, longitude: 116.35 },
  { id: 'map-shanghai', title: '上海测试照片', country: '中国', location: '上海', latitude: 31.23, longitude: 121.47 },
].map(photo => ({ ...photo, category: 'latest', image_url: 'https://map-test.invalid/photo.png',
  thumbnail_url: 'https://map-test.invalid/photo.png', status: 'approved', hidden: false }));

function installMockAmap() {
  window.mapChecks = { maps: [], markers: [], popups: [] };
  class Map {
    constructor(container, options) {
      this.container = container;
      this.options = options;
      this.zoom = options.zoom;
      this.center = { lng: options.center[0], lat: options.center[1] };
      this.events = new window.Map();
      this.calls = [];
      this.resizes = 0;
      container.classList.add('amap-container');
      window.mapChecks.maps.push(this);
      this.readyTimer = setTimeout(() => this.emit('complete'), 20);
    }
    on(event, callback) {
      if (!this.events.has(event)) this.events.set(event, new Set());
      this.events.get(event).add(callback);
    }
    off(event, callback) { this.events.get(event)?.delete(callback); }
    emit(event) { this.events.get(event)?.forEach(callback => callback()); }
    resize() { this.resizes += 1; }
    getZoom() { return this.zoom; }
    getCenter() { return this.center; }
    setZoomAndCenter(zoom, center, immediately, duration) {
      clearTimeout(this.motionTimer);
      this.calls.push({ zoom, center, immediately, duration });
      this.emit('movestart');
      this.emit('zoomstart');
      this.zoom = zoom;
      this.center = { lng: center[0], lat: center[1] };
      this.motionTimer = setTimeout(() => { this.emit('zoomend'); this.emit('moveend'); }, duration);
    }
    destroy() {
      this.destroyed = true;
      clearTimeout(this.readyTimer);
      clearTimeout(this.motionTimer);
      this.container.classList.remove('amap-container');
    }
  }
  class Marker {
    constructor(options) {
      this.options = options;
      this.index = window.mapChecks.markers.length;
      window.mapChecks.markers.push(this);
      this.setMap(options.map);
    }
    setMap(map) {
      this.removed = map === null;
      const content = this.options.content;
      if (!(content instanceof HTMLElement)) return;
      if (!map) { content.remove(); return; }
      // Nearby markers intentionally overlap to exercise the enlarged hit targets.
      Object.assign(content.style, { position: 'absolute', left: `calc(60% - 22px + ${this.index * 14}px)`, top: 'calc(45% - 22px)' });
      map.container.appendChild(content);
    }
  }
  window.AMap = { Map, Marker, Pixel: class {},
    InfoWindow: class {
      constructor(options) { this.options = options; this.opens = 0; window.mapChecks.popups.push(this); }
      open() { this.opens += 1; this.closed = false; }
      close() { this.closed = true; }
    },
    Polyline: class { setMap() {} },
  };
}

const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  if (artifacts) await mkdir(artifacts, { recursive: true });
  const logo = await readFile('public/loa-cropped.png');
  const setup = async (options = {}, preset = 'js_whitesmoke') => {
    const context = await browser.newContext({ viewport: { width: 1146, height: 956 }, ...options });
    await context.addInitScript(preset => {
      sessionStorage.setItem('pic4pick_intro_seen', '1');
      localStorage.setItem('pic4pick_env_overrides', JSON.stringify({ VITE_MAP_STYLE_PRESET: preset,
        VITE_AMAP_WEB_KEY: 'test-key', VITE_AMAP_SECURITY_JS_CODE: 'test-code' }));
    }, preset);
    await context.route('**/rest/v1/photos?**', route => route.fulfill({ json: photos }));
    await context.route('https://map-test.invalid/**', route => route.fulfill({ body: logo, contentType: 'image/png' }));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    return { context, page };
  };

  const { context, page } = await setup();
  let sdkRequests = 0;
  let fallbackRequests = 0;
  page.on('request', request => { if (/maplibre-vendor|maplibre-gl\.js/.test(request.url())) fallbackRequests += 1; });
  await context.route('https://webapi.amap.com/**', async route => {
    sdkRequests += 1;
    // Hover preload and immediate click must share an in-flight SDK request.
    await new Promise(resolve => setTimeout(resolve, 150));
    await route.fulfill({ contentType: 'application/javascript', body: `(${installMockAmap.toString()})();` });
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('#mapCanvas').count(), 0, 'Map must remain lazy on the gallery');
  const discover = page.getByRole('button', { name: '发现', exact: true });
  await discover.hover();
  await discover.click();
  await page.waitForFunction(() => window.mapChecks?.markers.length > 0);
  assert.equal(sdkRequests, 1);
  assert.equal(fallbackRequests, 0, 'AMap preload must not download the unused MapLibre engine');
  const initial = await page.evaluate(() => ({ count: window.mapChecks.maps.length,
    markers: window.mapChecks.markers.length, map: window.mapChecks.maps[0].options }));
  assert.equal(initial.map.mapStyle, 'amap://styles/whitesmoke');
  await page.locator('.curation-category-header').first().click();
  await page.locator('.curation-card').first().click();
  await page.waitForFunction(() => window.mapChecks.maps[0].calls.length > 0);
  const move = await page.evaluate(() => window.mapChecks.maps[0].calls.at(-1));
  assert.equal(move.immediately, false);
  assert.ok(move.duration >= 700 && move.duration <= 2000);
  await page.waitForFunction(() => !document.querySelector('#explore-view').classList.contains('map-in-motion'));
  const glass = await page.locator('.curation-panel').evaluate(el => getComputedStyle(el).backdropFilter);
  assert.equal(glass, 'blur(20px)');

  const search = page.getByRole('searchbox', { name: '搜索地点' });
  await search.fill(' 北京　北京 ');
  assert.equal(await page.locator('.discover-search-result').count(), 1);
  assert.match(await page.locator('.discover-search-result').innerText(), /北京[\s\S]*1 张/);
  await search.press('Enter');
  assert.equal(await page.locator('.discover-search-result').getAttribute('aria-pressed'), 'true');
  await search.fill('不存在的地点');
  await page.getByText('未找到相关地点', { exact: true }).waitFor();
  await search.press('Escape');
  assert.ok(await page.locator('.curation-card.active').count(), 'Clearing search restores the expanded city cards');
  await search.fill('上海');
  await search.press('ArrowDown');
  assert.ok(await page.locator('.discover-search-result').evaluate(el => el === document.activeElement));
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.discover-search-result').getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: '收起面板' }).click();
  assert.equal(await search.count(), 0);
  await page.getByRole('button', { name: '展开面板' }).click();
  assert.equal(await search.inputValue(), '上海');
  await page.getByRole('button', { name: '图库', exact: true }).click();
  await discover.click();
  assert.equal(await search.inputValue(), '上海', 'Search survives returning from the gallery');
  await page.getByRole('button', { name: '清除地点搜索' }).click();
  await search.fill('北京');
  await search.press('Enter');
  await page.getByRole('button', { name: '清除地点搜索' }).click();
  await page.waitForFunction(() => !document.querySelector('#explore-view').classList.contains('map-in-motion'));

  const beijingMarker = page.getByRole('button', { name: '北京 · 1 张照片', exact: true });
  const box = await beijingMarker.boundingBox();
  assert.equal(box.width, 44);
  assert.equal(box.height, 44);
  assert.equal(await beijingMarker.locator('.explore-marker').evaluate(el => el.getBoundingClientRect().width), 9);
  // Click well outside the nine-pixel dot, but within its transparent target.
  await page.mouse.click(box.x + 7, box.y + 22);
  assert.equal(await page.locator('.location-panel-title').innerText(), '北京');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  // Shanghai's topmost transparent target overlaps Beijing's visible dot.
  await page.mouse.click(box.x + 22, box.y + 22);
  assert.equal(await page.locator('.location-panel-title').innerText(), '北京');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  const shanghaiMarker = page.getByRole('button', { name: '上海 · 1 张照片', exact: true });
  await shanghaiMarker.press('ArrowRight');
  assert.equal(await shanghaiMarker.locator('.explore-marker-tooltip').evaluate(el => getComputedStyle(el).visibility), 'visible');
  await shanghaiMarker.press('Enter');
  assert.equal(await page.locator('.location-panel-title').innerText(), '上海');
  await page.getByRole('button', { name: '关闭', exact: true }).click();

  // Zoom completion must not restore expensive glass while a pan is still running.
  await page.evaluate(() => { const map = window.mapChecks.maps[0]; map.emit('movestart'); map.emit('zoomstart'); map.emit('zoomend'); });
  await page.waitForTimeout(250);
  assert.equal(await page.locator('.curation-panel').evaluate(el => getComputedStyle(el).backdropFilter), 'none');
  await page.evaluate(() => window.mapChecks.maps[0].emit('moveend'));
  await page.waitForFunction(() => !document.querySelector('#explore-view').classList.contains('map-in-motion'));

  const savedPosition = await page.evaluate(() => ({ center: window.mapChecks.maps[0].getCenter(), zoom: window.mapChecks.maps[0].getZoom() }));
  const resizeBefore = await page.evaluate(() => window.mapChecks.maps[0].resizes);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.getByRole('button', { name: '图库', exact: true }).click();
    await page.locator('#explore-view').waitFor({ state: 'hidden' });
    await page.locator('.photo-card').first().waitFor({ state: 'visible' });
    await discover.click();
    await page.locator('#explore-view').waitFor({ state: 'visible' });
  }
  const after = await page.evaluate(() => ({ count: window.mapChecks.maps.length,
    markers: window.mapChecks.markers.length, center: window.mapChecks.maps[0].getCenter(),
    zoom: window.mapChecks.maps[0].getZoom(), destroyed: !!window.mapChecks.maps[0].destroyed }));
  assert.equal(after.count, initial.count, 'Returning must reuse the map');
  assert.equal(after.markers, initial.markers, 'Returning must reuse markers');
  assert.equal(after.destroyed, false);
  assert.deepEqual({ center: after.center, zoom: after.zoom }, savedPosition);
  await page.waitForFunction(before => window.mapChecks.maps[0].resizes > before, resizeBefore);
  assert.ok(await page.locator('.curation-card.active').count(), 'City selection must be preserved');
  await page.getByRole('button', { name: '图库', exact: true }).click();
  await page.locator('.photo-card').first().click();
  await page.getByText('焦距', { exact: true }).click();
  await page.getByRole('button', { name: '地理位置', exact: true }).click();
  await page.waitForFunction(() => window.mapChecks.maps.length > 1);
  assert.equal(await page.evaluate(() => window.mapChecks.maps.at(-1).options.mapStyle), initial.map.mapStyle);
  const detailMarker = page.locator('.photo-map-marker-target[data-kind="photo"]');
  await detailMarker.waitFor();
  await page.waitForFunction(() => document.querySelector('.photo-map-marker-target')?.getBoundingClientRect().width > 43.99);
  const detailBox = await detailMarker.boundingBox();
  assert.equal(detailBox.width, 44);
  assert.equal(await detailMarker.locator('.photo-map-marker-dot').evaluate(el => el.getBoundingClientRect().width), 12);
  const popupOpens = await page.evaluate(() => window.mapChecks.popups.at(-1).opens);
  await page.mouse.click(detailBox.x + 8, detailBox.y + 22);
  await detailMarker.press('Enter');
  assert.equal(await page.evaluate(() => window.mapChecks.popups.at(-1).opens), popupOpens + 2);
  await page.getByRole('button', { name: '基本参数', exact: true }).click();
  assert.ok(await page.evaluate(() => window.mapChecks.maps.at(-1).destroyed), 'Closing detail map must still release its instance');
  assert.ok(await page.evaluate(() => window.mapChecks.popups.at(-1).closed));
  await page.keyboard.press('Escape');
  await page.goto(`${baseUrl}/#/admin`);
  await page.waitForFunction(() => window.mapChecks.maps[0].destroyed);
  assert.equal(await page.evaluate(() => [...window.mapChecks.maps[0].events.values()].reduce((n, callbacks) => n + callbacks.size, 0)), 0);
  await context.close();

  const reduced = await setup({ reducedMotion: 'reduce' });
  await reduced.context.addInitScript(installMockAmap);
  await reduced.page.goto(baseUrl, { waitUntil: 'networkidle' });
  await reduced.page.getByRole('button', { name: '发现', exact: true }).click();
  await reduced.page.waitForFunction(() => window.mapChecks?.markers.length > 0);
  await reduced.page.locator('.curation-category-header').first().click();
  await reduced.page.locator('.curation-card').first().click();
  const reducedMove = await reduced.page.evaluate(() => window.mapChecks.maps[0].calls.at(-1));
  assert.equal(reducedMove.immediately, true);
  assert.equal(reducedMove.duration, 0);
  await reduced.context.close();

  // Exercise the actual MapLibre renderer and its camera events, including SDK failure.
  const fallback = await setup({ hasTouch: true }, 'js_whitesmoke');
  await fallback.context.route('https://webapi.amap.com/**', route => route.abort());
  await fallback.page.goto(baseUrl, { waitUntil: 'networkidle' });
  await fallback.page.getByRole('button', { name: '发现', exact: true }).click();
  await fallback.page.locator('#mapCanvas .maplibregl-marker').first().waitFor();
  const canvas = await fallback.page.locator('#mapCanvas canvas').elementHandle();
  await fallback.page.locator('.curation-category-header').first().click();
  await fallback.page.locator('.curation-card').first().click();
  await fallback.page.waitForFunction(() => document.querySelector('#explore-view').classList.contains('map-in-motion'));
  await fallback.page.waitForFunction(() => !document.querySelector('#explore-view').classList.contains('map-in-motion'));
  await fallback.page.getByRole('button', { name: '图库', exact: true }).click();
  await fallback.page.getByRole('button', { name: '发现', exact: true }).click();
  assert.ok(await canvas.evaluate(el => el === document.querySelector('#mapCanvas canvas')));
  await fallback.page.setViewportSize({ width: 390, height: 844 });
  await fallback.page.waitForFunction(() => Math.abs(document.querySelector('#mapCanvas canvas').getBoundingClientRect().width - innerWidth) < 2);
  const mobileSearch = fallback.page.getByRole('searchbox', { name: '搜索地点' });
  await mobileSearch.fill('北京');
  await fallback.page.locator('.discover-search-result').click();
  await fallback.page.waitForFunction(() => !document.querySelector('#explore-view').classList.contains('map-in-motion'));
  const mobileMarker = await fallback.page.getByRole('button', { name: '北京 · 1 张照片', exact: true }).boundingBox();
  await fallback.page.touchscreen.tap(mobileMarker.x + 8, mobileMarker.y + 22);
  assert.equal(await fallback.page.locator('.location-panel-title').innerText(), '北京');
  await fallback.page.getByRole('button', { name: '关闭', exact: true }).click();
  assert.equal(await fallback.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  if (artifacts) await fallback.page.screenshot({ path: path.join(artifacts, 'map-mobile.png') });
  await fallback.page.setViewportSize({ width: 1146, height: 956 });
  await fallback.page.getByRole('button', { name: '图库', exact: true }).click();
  await fallback.page.locator('.photo-card').first().click();
  await fallback.page.getByText('焦距', { exact: true }).click();
  await fallback.page.getByRole('button', { name: '地理位置', exact: true }).click();
  const fallbackDetail = fallback.page.locator('.photo-map-marker-target[data-kind="photo"]');
  await fallbackDetail.waitFor();
  await fallback.page.locator('.photo-location-map .maplibregl-popup-close-button').click();
  const fallbackDetailBox = await fallbackDetail.boundingBox();
  await fallback.page.touchscreen.tap(fallbackDetailBox.x + 8, fallbackDetailBox.y + 22);
  await fallback.page.locator('.photo-location-map .maplibregl-popup').waitFor();
  await fallback.page.locator('.photo-location-map .maplibregl-popup-close-button').click();
  await fallbackDetail.press('Enter');
  await fallback.page.locator('.photo-location-map .maplibregl-popup').waitFor();
  await fallback.page.getByRole('button', { name: '基本参数', exact: true }).click();
  assert.equal(await fallback.page.locator('.photo-map-marker-target').count(), 0);
  await fallback.context.close();
  assert.deepEqual(errors, []);
  console.log('Map checks passed: location search, keyboard and clear/empty states, retained search/map/camera, enlarged and overlapping marker targets, mobile touch, animation, glass restoration, reduced motion, cleanup and real MapLibre fallback.');
} finally {
  await browser.close();
}

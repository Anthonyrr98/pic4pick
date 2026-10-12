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
  assert.equal(await page.locator('.curation-panel').evaluate(el => getComputedStyle(el).backdropFilter), 'none');
  await page.waitForFunction(() => !document.querySelector('#explore-view').classList.contains('map-in-motion'));
  const moves = await page.evaluate(() => window.mapChecks.maps[0].calls);
  assert.ok(moves.length > 20, 'Flight must advance continuously across display frames');
  assert.ok(moves.every(move => move.immediately && move.duration === 0), 'Frames must not start nested SDK animations');
  assert.equal(moves.at(-1).zoom, 10.2);
  const glass = await page.locator('.curation-panel').evaluate(el => getComputedStyle(el).backdropFilter);
  assert.equal(glass, 'blur(20px)');
  const returnToPlaces = async () => page.getByRole('button', { name: '返回地点列表' }).click();
  assert.equal(await page.locator('#curation-gallery-title').innerText(), '北京');
  assert.equal(await page.locator('.curation-photo-thumb').count(), 1);
  await returnToPlaces();
  await page.waitForFunction(() => document.querySelector('.curation-card.active') === document.activeElement);

  const search = page.getByRole('searchbox', { name: '搜索地点' });
  await search.fill(' 北京　北京 ');
  assert.equal(await page.locator('.discover-search-result').count(), 1);
  assert.match(await page.locator('.discover-search-result').innerText(), /北京[\s\S]*1 张/);
  await search.press('Enter');
  assert.equal(await page.locator('#curation-gallery-title').innerText(), '北京');
  await returnToPlaces();
  assert.equal(await page.locator('.discover-search-result').getAttribute('aria-pressed'), 'true');
  // City-to-city travel should pull back, rather than sliding across at street scale.
  await page.waitForFunction(() => !document.querySelector('#explore-view').classList.contains('map-in-motion'));
  const cityFlightStart = await page.evaluate(() => window.mapChecks.maps[0].calls.length);
  await search.fill('上海');
  await search.press('Enter');
  await returnToPlaces();
  await page.waitForFunction(() => !document.querySelector('#explore-view').classList.contains('map-in-motion'));
  const cityMoves = await page.evaluate(start => window.mapChecks.maps[0].calls.slice(start), cityFlightStart);
  assert.ok(Math.min(...cityMoves.map(move => move.zoom)) < 8, 'Distant city flight must zoom out along its arc');
  assert.equal(cityMoves.at(-1).zoom, 10.2);
  // A newer destination replaces an in-flight journey from its current position.
  await search.fill('北京');
  await search.press('Enter');
  await page.waitForFunction(() => document.querySelector('#explore-view').classList.contains('map-in-motion'));
  await returnToPlaces();
  await search.fill('上海');
  await search.press('Enter');
  await returnToPlaces();
  await page.waitForFunction(() => !document.querySelector('#explore-view').classList.contains('map-in-motion'));
  assert.ok(await page.evaluate(() => window.mapChecks.maps[0].getCenter().lng > 120));
  // Touch/wheel control cancels the scheduled flight and keeps the current camera.
  await search.fill('北京');
  await search.press('Enter');
  await page.waitForFunction(() => document.querySelector('#explore-view').classList.contains('map-in-motion'));
  await returnToPlaces();
  await page.locator('#mapCanvas').dispatchEvent('pointerdown');
  const interruptedCalls = await page.evaluate(() => window.mapChecks.maps[0].calls.length);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.mapChecks.maps[0].calls.length), interruptedCalls);
  assert.equal(await page.locator('.curation-panel').evaluate(el => getComputedStyle(el).backdropFilter), 'blur(20px)');
  await search.fill('北京');
  await search.press('Enter');
  await page.waitForFunction(() => document.querySelector('#explore-view').classList.contains('map-in-motion'));
  await returnToPlaces();
  await page.getByRole('button', { name: '图库', exact: true }).click();
  const hiddenCalls = await page.evaluate(() => window.mapChecks.maps[0].calls.length);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.mapChecks.maps[0].calls.length), hiddenCalls, 'A hidden discover view must stop flying');
  await discover.click();
  await search.fill('不存在的地点');
  await page.getByText('未找到相关地点', { exact: true }).waitFor();
  await search.press('Escape');
  assert.ok(await page.locator('.curation-card.active').count(), 'Clearing search restores the expanded city cards');
  await search.fill('上海');
  await search.press('ArrowDown');
  assert.ok(await page.locator('.discover-search-result').evaluate(el => el === document.activeElement));
  await page.keyboard.press('Enter');
  await returnToPlaces();
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
  await returnToPlaces();
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
  assert.ok(Math.abs(detailBox.width - 44) < 0.05);
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

  // A city detail shows the entire city, including photos without map coordinates.
  const cityGallery = await setup({ reducedMotion: 'reduce' });
  const cityPhotos = Array.from({ length: 30 }, (_, index) => ({
    ...photos[0], id: `city-photo-${index}`, title: `北京作品 ${index + 1}`,
    created_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    latitude: index === 0 ? null : photos[0].latitude,
    longitude: index === 0 ? null : photos[0].longitude,
  }));
  await cityGallery.context.route('**/rest/v1/photos?**', route => route.fulfill({
    json: [...cityPhotos, { ...photos[0], id: 'hidden-city-photo', hidden: true }, photos[1]],
  }));
  await cityGallery.context.addInitScript(installMockAmap);
  const cityPage = cityGallery.page;
  await cityPage.goto(baseUrl, { waitUntil: 'networkidle' });
  await cityPage.getByRole('button', { name: '发现', exact: true }).click();
  await cityPage.getByRole('button', { name: '北京', exact: true }).click();
  await cityPage.locator('.curation-card').press('Enter');
  const thumbnails = cityPage.locator('.curation-photo-thumb');
  const cityScroller = cityPage.locator('.curation-panel-scroll');
  assert.equal(await thumbnails.count(), 30, 'Render every visible city photo without gallery pagination');
  assert.equal(await cityPage.locator('.curation-gallery-header > span').innerText(), '30 张');
  assert.equal(await thumbnails.first().getAttribute('aria-label'), '查看照片：北京作品 30');
  assert.equal(await thumbnails.last().getAttribute('aria-label'), '查看照片：北京作品 1');
  const dimensions = await thumbnails.first().evaluate(el => {
    const bounds = el.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height, columns: getComputedStyle(el.parentElement).gridTemplateColumns.split(' ').length };
  });
  assert.equal(dimensions.columns, 3);
  assert.ok(Math.abs(dimensions.width - dimensions.height) < 1, 'Thumbnails must be square');
  assert.ok(await cityScroller.evaluate(el => el.scrollHeight > el.clientHeight), 'Long city galleries must scroll');
  const headerTop = (await cityPage.locator('.curation-gallery-header').boundingBox()).y;
  await thumbnails.last().scrollIntoViewIfNeeded();
  const cityScrollTop = await cityScroller.evaluate(el => el.scrollTop);
  assert.ok(cityScrollTop > 0);
  assert.equal((await cityPage.locator('.curation-gallery-header').boundingBox()).y, headerTop, 'City header stays visible while photos scroll');
  await thumbnails.last().press('Enter');
  await cityPage.getByRole('dialog').waitFor({ state: 'visible' });
  assert.equal(await cityPage.locator('#lightbox-title').innerText(), '北京作品 1');
  await cityPage.keyboard.press('Escape');
  await cityPage.getByRole('dialog').waitFor({ state: 'hidden' });
  await cityPage.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '查看照片：北京作品 1');
  assert.equal(await cityScroller.evaluate(el => el.scrollTop), cityScrollTop, 'Closing a photo preserves the grid scroll position');
  await cityPage.getByRole('button', { name: '收起面板' }).click();
  assert.equal(await thumbnails.count(), 0);
  assert.equal(await cityPage.locator('.curation-gallery-peek').innerText(), '北京 · 30 张');
  await cityPage.getByRole('button', { name: '展开面板' }).click();
  assert.equal(await thumbnails.count(), 30);
  await cityPage.getByRole('button', { name: '返回地点列表' }).click();
  const citySearch = cityPage.getByRole('searchbox', { name: '搜索地点' });
  await citySearch.fill('北京');
  await citySearch.press('Enter');
  await cityPage.getByRole('button', { name: '图库', exact: true }).click();
  await cityPage.getByRole('button', { name: '发现', exact: true }).click();
  assert.equal(await thumbnails.count(), 30, 'Returning to Discover preserves the open city');
  if (artifacts) await cityPage.screenshot({ path: path.join(artifacts, 'discover-city-desktop.png') });
  await cityPage.setViewportSize({ width: 390, height: 844 });
  await cityPage.waitForFunction(() => document.querySelector('.curation-panel').dataset.mobile === 'true');
  assert.equal(await thumbnails.count(), 30);
  assert.equal(await thumbnails.first().evaluate(el => getComputedStyle(el.parentElement).gridTemplateColumns.split(' ').length), 3);
  assert.equal(await cityPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  if (artifacts) await cityPage.screenshot({ path: path.join(artifacts, 'discover-city-mobile.png') });
  await cityPage.getByRole('button', { name: '返回地点列表' }).click();
  assert.equal(await citySearch.inputValue(), '北京', 'Back restores the previous search');
  await cityGallery.context.close();

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

  const mobileSheet = await setup({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const mobilePhotos = [...photos, ...['开封', '安阳', '洛阳', '平顶山', '新郑', '郑州', '漯河'].map((city, index) => ({
    ...photos[0], id: `sheet-${index}`, title: city, location: city, latitude: 34.79, longitude: 114.3,
  }))];
  await mobileSheet.context.route('**/rest/v1/photos?**', route => route.fulfill({ json: mobilePhotos }));
  await mobileSheet.context.addInitScript(installMockAmap);
  await mobileSheet.page.goto(baseUrl, { waitUntil: 'networkidle' });
  await mobileSheet.page.getByRole('button', { name: '发现', exact: true }).click();
  const sheet = mobileSheet.page.getByRole('complementary', { name: '探索地点' });
  await sheet.waitFor();
  assert.equal(await sheet.getAttribute('data-sheet-state'), 'compact');
  const compactSheet = await sheet.boundingBox();
  assert.ok(compactSheet.height > 350 && compactSheet.height < 390);
  await mobileSheet.page.getByRole('button', { name: '河南', exact: true }).click();
  const cityRow = sheet.locator('.curation-category-content');
  assert.ok(await cityRow.evaluate(el => el.scrollWidth > el.clientWidth), 'Mobile cities must scroll horizontally');
  assert.ok(await cityRow.locator('figure').first().evaluate(el => el.getBoundingClientRect().height <= 100));
  const mobileInput = mobileSheet.page.getByRole('searchbox', { name: '搜索地点' });
  const searchTop = (await mobileInput.boundingBox()).y;
  await sheet.locator('.curation-panel-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
  assert.equal((await mobileInput.boundingBox()).y, searchTop, 'Scrolling places must keep search visible');
  await mobileSheet.page.getByRole('button', { name: '展开地点列表' }).click();
  await mobileSheet.page.waitForFunction(() => document.querySelector('.curation-panel').getBoundingClientRect().height > 640);
  const touch = await mobileSheet.context.newCDPSession(mobileSheet.page);
  await sheet.locator('.curation-panel-scroll').evaluate(el => { el.scrollTop = 0; });
  const rowBounds = await cityRow.boundingBox();
  const rowX = rowBounds.x + rowBounds.width - 30, rowY = rowBounds.y + rowBounds.height / 2;
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rowX, y: rowY }] });
  for (let step = 1; step <= 5; step++) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: rowX - step * 30, y: rowY }] });
  }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobileSheet.page.waitForFunction(() => document.querySelector('.curation-category-content').scrollLeft > 30);
  assert.equal(await mobileSheet.page.evaluate(() => window.mapChecks.maps[0].calls.length), 0, 'Swiping cards must not select a city');
  const swipeHandle = async delta => {
    const box = await mobileSheet.page.getByRole('button', { name: /^(收起|展开)面板$/ }).boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + delta }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await swipeHandle(65);
  assert.equal(await sheet.getAttribute('data-sheet-state'), 'compact');
  await mobileSheet.page.waitForFunction(() => document.querySelector('.curation-panel').getBoundingClientRect().height < 390);
  await swipeHandle(65);
  assert.equal(await sheet.getAttribute('data-sheet-state'), 'peek');
  assert.equal(await mobileInput.count(), 0);
  await mobileSheet.page.waitForFunction(() => document.querySelector('.curation-panel').getBoundingClientRect().height < 80);
  await swipeHandle(-65);
  assert.equal(await sheet.getAttribute('data-sheet-state'), 'compact');
  await mobileInput.fill('开封');
  assert.equal(await sheet.getAttribute('data-sheet-state'), 'expanded', 'Search should open enough room for results');
  await mobileSheet.page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => 460 });
    window.visualViewport.dispatchEvent(new Event('resize'));
    document.querySelector('.discover-search input').addEventListener('blur', () => {
      delete window.visualViewport.height;
      window.visualViewport.dispatchEvent(new Event('resize'));
    }, { once: true });
  });
  await mobileSheet.page.waitForFunction(() => Number.parseFloat(document.querySelector('.curation-panel').style.getPropertyValue('--curation-keyboard-inset')) > 300);
  assert.ok((await mobileInput.boundingBox()).y < 400, 'Search must remain above the mobile keyboard');
  await mobileSheet.page.locator('.discover-search-result').click();
  await mobileSheet.page.waitForFunction(() => document.querySelector('#explore-view').classList.contains('map-in-motion'));
  assert.equal(await sheet.getAttribute('data-sheet-state'), 'compact');
  await mobileSheet.page.waitForFunction(() => !document.querySelector('#explore-view').classList.contains('map-in-motion'));
  assert.equal(await mobileSheet.page.getByRole('searchbox', { name: '搜索地点' }).count(), 0);
  assert.equal(await mobileSheet.page.locator('#curation-gallery-title').innerText(), '开封');
  await mobileSheet.page.getByRole('button', { name: '返回地点列表' }).click();
  await mobileSheet.page.getByRole('button', { name: '清除地点搜索' }).click();
  await mobileSheet.page.setViewportSize({ width: 610, height: 956 });
  assert.equal(await mobileSheet.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mobileSheet.page.getByRole('button', { name: '缩小地点列表' }).click();
  await sheet.locator('.curation-panel-scroll').evaluate(el => { el.scrollTop = 0; });
  if (artifacts) await mobileSheet.page.screenshot({ path: path.join(artifacts, 'mobile-place-sheet.png') });
  await mobileSheet.page.setViewportSize({ width: 1146, height: 956 });
  await mobileSheet.page.waitForFunction(() => document.querySelector('.curation-panel').dataset.mobile === 'false');
  assert.equal(await mobileSheet.page.locator('.curation-panel-heading').evaluate(el => getComputedStyle(el).display), 'contents');
  assert.equal(await mobileSheet.page.locator('.curation-mobile-heading').isVisible(), false);
  await mobileSheet.context.close();

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
  await fallback.page.getByRole('button', { name: '返回地点列表' }).click();
  const mobileSearch = fallback.page.getByRole('searchbox', { name: '搜索地点' });
  await mobileSearch.fill('北京');
  await fallback.page.locator('.discover-search-result').click();
  await fallback.page.waitForFunction(() => document.querySelector('#explore-view').classList.contains('map-in-motion'));
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
  console.log('Map checks passed: complete city photo grids, lightbox and return navigation, location search, retained camera, enlarged marker targets, mobile sheet gestures, horizontal cards, fixed search, keyboard dismissal, animation, reduced motion, cleanup and real MapLibre fallback.');
} finally {
  await browser.close();
}

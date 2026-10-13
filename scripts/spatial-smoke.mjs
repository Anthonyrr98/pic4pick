import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

const baseUrl = (process.env.UI_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
// UI regression fixtures exercise precomputed results. Live GPU inference is a
// separate worker check and must never be downloaded into a browser test.
const realModel = false;
const browserType = process.env.SPATIAL_BROWSER === 'webkit' ? webkit : chromium;
const artifactDir = process.env.UI_ARTIFACT_DIR || '.artifacts/spatial';
const fixture = await readFile(new URL('../public/og-image.png', import.meta.url));
const photos = [1, 2].map((id) => ({
  id: `spatial-${id}`, title: `空间场景测试 ${id}`, image: `https://spatial-fixture.invalid/photo-${id}.png`,
  image_url: `https://spatial-fixture.invalid/photo-${id}.png`, category: '风光', country: '中国', location: '上海',
  status: 'approved', hidden: false, rating: 9, created_at: `2026-10-${id === 1 ? '12' : '11'}T00:00:00Z`,
}));
const workerPattern = /spatialDepth\.worker|huggingface\.co|\.onnx(?:$|\?)|ort-wasm/;
const browser = await browserType.launch({ headless: true });
const errors = [];

async function openFixture(options = {}) {
  const fixturePhotos = photos.map((photo, index) => options.proxy ? {
    ...photo,
    image: `https://spatial-fixture.oss-cn-beijing.aliyuncs.com/origin/2026/10/12/photo-${index}.png`,
    image_url: `https://spatial-fixture.oss-cn-beijing.aliyuncs.com/origin/2026/10/12/photo-${index}.png`,
  } : photo);
  const context = await browser.newContext(options.mobile ? {
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
  } : { viewport: { width: 1440, height: 1000 }, reducedMotion: options.reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  if (realModel) page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) console.log(message.text());
  });
  await page.addInitScript(({ photos, permission, saveData }) => {
    sessionStorage.setItem('pic4pick_intro_seen', '1');
    localStorage.setItem('camarts_approved_photos', JSON.stringify(photos));
    window.__spatialPermissionCalls = 0;
    if (typeof saveData === 'boolean') {
      const connection = new EventTarget();
      connection.saveData = saveData;
      Object.defineProperty(navigator, 'connection', { configurable: true, value: connection });
    }
    if (permission) {
      window.DeviceOrientationEvent.requestPermission = () => {
        window.__spatialPermissionCalls += 1;
        return Promise.resolve(permission);
      };
    }
  }, { photos: fixturePhotos, permission: options.permission, saveData: options.saveData });
  await page.route('**/rest/v1/photos*', (route) => route.fulfill({ json: fixturePhotos }));
  let metadataRequests = 0, photoReads = 0, signingRequests = 0, cancelledMetadata = 0;
  const metadataIds = [];
  let signedDepthUrl;
  let metadataStarted;
  const metadataStart = new Promise(resolve => { metadataStarted = resolve; });
  let parallel = false;
  let parallelCheckStarted = false;
  page.on('requestfailed', request => {
    if (request.url().includes('/rest/v1/photo_spatial')) cancelledMetadata++;
  });
  await page.route(/https:\/\/spatial-fixture\.(?:invalid|oss-cn-beijing\.aliyuncs\.com)\//, async (route) => {
    if (route.request().headers().origin) {
      photoReads++;
      if (options.checkParallel && parallelCheckStarted) {
        parallel = await Promise.race([
          metadataStart.then(() => true),
          new Promise(resolve => setTimeout(() => resolve(false), 1500)),
        ]);
      }
    }
    if (options.corsError && route.request().headers().origin) return route.abort('blockedbyresponse');
    return route.fulfill({ contentType: 'image/png', body: fixture, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  let proxyRequests = 0;
  await page.route('**/api/media/proxy?*', (route) => {
    proxyRequests += 1;
    return route.fulfill({ contentType: 'image/png', body: fixture, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  let workerRequests = 0;
  page.on('request', (request) => { if (workerPattern.test(request.url())) workerRequests += 1; });
  await page.route('**/rest/v1/photo_spatial*', async (route) => {
    metadataRequests++;
    metadataIds.push(new URL(route.request().url()).searchParams.get('photo_id'));
    signedDepthUrl = `${new URL(route.request().url()).origin}/storage/v1/object/sign/spatial-depth/fixture/depth.png?token=fixture`;
    metadataStarted();
    if (options.metadataGate && metadataRequests === 1) await options.metadataGate;
    await route.fulfill({ json: [{
      generation: 'fixture', status: options.pending ? 'processing' : options.error ? 'failed' : 'ready',
      depth_path: 'fixture/depth.png', width: 784, height: 412,
      storage_backend: options.useOss ? 'oss' : 'supabase',
    }] }).catch(() => {}); // An intentionally cancelled route may already be closed.
  });
  await page.route('**/api/photos/*/spatial-depth', route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
    signingRequests++;
    return route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' },
      json: { generation: 'fixture', signedUrl: signedDepthUrl } });
  });
  let depthDownloads = 0;
  await page.route('**/storage/v1/object/sign/spatial-depth/**', async (route) => {
    if (route.request().method() === 'POST') {
      signingRequests++;
      return route.fulfill({ json: { signedURL: '/object/sign/spatial-depth/fixture/depth.png?token=fixture' } });
    }
    depthDownloads++;
    if (options.depthGate) await options.depthGate;
    return route.fulfill({ contentType: 'image/svg+xml', headers: { 'Access-Control-Allow-Origin': '*' },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="784" height="412"><defs><linearGradient id="d"><stop stop-color="black"/><stop offset="1" stop-color="white"/></linearGradient></defs><rect width="784" height="412" fill="url(#d)"/></svg>' }).catch(() => {});
  });
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page.locator('.photo-card').first().click();
  const button = page.getByRole('button', { name: '空间场景', exact: true });
  await page.waitForFunction(() => document.querySelector('.lightbox-media img')?.naturalWidth > 0);
  await button.waitFor({ state: 'visible' });
  return { page, context, button, workerRequests: () => workerRequests, depthDownloads: () => depthDownloads, proxyRequests: () => proxyRequests,
    metadataRequests: () => metadataRequests, photoReads: () => photoReads, signingRequests: () => signingRequests,
    metadataIds: () => metadataIds, cancelledMetadata: () => cancelledMetadata, parallel: () => parallel,
    startParallelCheck: () => { parallelCheckStarted = true; } };
}

async function waitReady(page) {
  await page.waitForFunction(() => document.querySelector('.spatial-scene-canvas')?.classList.contains('is-ready')
    || document.querySelector('.spatial-scene-status')?.classList.contains('is-error'), undefined, { timeout: 130_000 });
  assert.equal(await page.locator('.spatial-scene-status.is-error').count(), 0,
    await page.locator('.spatial-scene-status').textContent());
  await page.locator('.spatial-scene-canvas.is-ready').waitFor();
}

try {
  await mkdir(artifactDir, { recursive: true });
  const prepared = await openFixture({ permission: 'granted', useOss: true });
  await prepared.page.waitForTimeout(300);
  assert.equal(prepared.metadataRequests(), 0, 'Brief viewing should not prefetch depth');
  const existingPhotoReads = prepared.photoReads();
  await prepared.page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('/storage/v1/object/sign/spatial-depth/') && entry.name.includes('token=')));
  assert.equal(prepared.metadataRequests(), 1);
  assert.equal(prepared.depthDownloads(), 1);
  assert.equal(prepared.photoReads(), existingPhotoReads, 'Background preparation must not reread photograph pixels');
  assert.equal(await prepared.page.evaluate(() => window.__spatialPermissionCalls), 0, 'Prefetch must not request motion permissions');
  assert.equal(await prepared.button.getAttribute('aria-pressed'), 'false');
  assert.equal(await prepared.page.locator('.spatial-scene-canvas.is-ready').count(), 0);
  await prepared.button.click();
  await waitReady(prepared.page);
  assert.equal(prepared.metadataRequests(), 1, 'Click should reuse prepared metadata');
  assert.equal(prepared.signingRequests(), 1, 'Click should reuse the signed depth download');
  assert.equal(prepared.depthDownloads(), 1);
  await prepared.context.close();

  const dataSaver = await openFixture({ saveData: true, checkParallel: true, useOss: true });
  await dataSaver.page.waitForTimeout(1100);
  assert.equal(dataSaver.metadataRequests(), 0, 'Data saver should disable automatic preparation');
  dataSaver.startParallelCheck();
  await dataSaver.button.click();
  await waitReady(dataSaver.page);
  assert.ok(dataSaver.parallel(), 'Depth metadata must start while photo pixels are still loading');
  await dataSaver.context.close();

  let finishDepth;
  const handoff = await openFixture({ useOss: true, depthGate: new Promise(resolve => { finishDepth = resolve; }) });
  await handoff.page.waitForRequest(request => request.url().includes('token=fixture'));
  await handoff.button.click();
  await handoff.page.waitForTimeout(100);
  assert.equal(handoff.metadataRequests(), 1);
  assert.equal(handoff.signingRequests(), 1);
  assert.equal(handoff.depthDownloads(), 1, 'Click during prefetch must not download twice');
  finishDepth();
  await waitReady(handoff.page);
  await handoff.context.close();

  const brief = await openFixture();
  await brief.page.keyboard.press('Escape');
  await brief.page.waitForTimeout(1100);
  assert.equal(brief.metadataRequests(), 0, 'Closing before the dwell delay must cancel the timer');
  await brief.context.close();

  const switched = await openFixture();
  await switched.page.keyboard.press('ArrowRight');
  await switched.page.waitForTimeout(1100);
  assert.deepEqual(switched.metadataIds(), ['eq.spatial-2'], 'Only the currently viewed photo should be prepared');
  await switched.context.close();

  let finishMetadata;
  const cancelled = await openFixture({ metadataGate: new Promise(resolve => { finishMetadata = resolve; }) });
  await cancelled.page.waitForRequest(request => request.url().includes('/rest/v1/photo_spatial'));
  await cancelled.page.keyboard.press('Escape');
  await cancelled.page.waitForTimeout(100);
  finishMetadata();
  await cancelled.page.waitForTimeout(200);
  assert.ok(cancelled.cancelledMetadata() > 0, 'Closing must abort an unfinished prefetch request');
  assert.equal(cancelled.depthDownloads(), 0);
  await cancelled.context.close();

  const backgroundPending = await openFixture({ pending: true });
  await backgroundPending.page.waitForTimeout(4200);
  assert.equal(backgroundPending.metadataRequests(), 1, 'Pending photos should not be polled in the background');
  assert.equal(backgroundPending.depthDownloads(), 0);
  assert.equal(await backgroundPending.page.locator('.spatial-scene-status').count(), 0);
  await backgroundPending.context.close();

  const backgroundFailure = await openFixture({ error: true });
  await backgroundFailure.page.waitForTimeout(1100);
  assert.equal(backgroundFailure.metadataRequests(), 1);
  assert.equal(await backgroundFailure.page.locator('.spatial-scene-status.is-error').count(), 0, 'Prefetch errors must stay silent');
  await backgroundFailure.button.click();
  await backgroundFailure.page.locator('.spatial-scene-status.is-error').waitFor();
  assert.equal(backgroundFailure.metadataRequests(), 2, 'An explicit click should retry a failed prefetch');
  await backgroundFailure.context.close();
  console.log('Depth-only prefetch, parallel loading, request reuse, cancellation, data saver and silent failures passed');

  const desktop = await openFixture();
  assert.equal(desktop.workerRequests(), 0, 'Model code should load only after enabling the effect');
  await desktop.button.click();
  await waitReady(desktop.page);
  assert.equal(await desktop.button.getAttribute('aria-pressed'), 'true');
  const canvas = desktop.page.locator('.spatial-scene-canvas');
  const bounds = await canvas.boundingBox();
  assert.ok(bounds.width > 100 && bounds.height > 100);
  assert.ok(Math.abs(bounds.width / bounds.height - 1200 / 630) < 0.02, 'Spatial scene must preserve the photo aspect ratio');
  await desktop.page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await desktop.page.waitForTimeout(650);
  const centered = await canvas.screenshot();
  await desktop.page.mouse.move(bounds.x + bounds.width * 0.85, bounds.y + bounds.height * 0.6);
  await desktop.page.waitForTimeout(850);
  const shifted = await canvas.screenshot();
  assert.notDeepEqual(shifted, centered, 'Actual rendered pixels must respond to mouse movement');
  await desktop.page.screenshot({ path: path.join(artifactDir, realModel ? 'spatial-real-desktop.png' : 'spatial-desktop.png') });
  await desktop.button.click();
  assert.equal(await desktop.button.getAttribute('aria-pressed'), 'false');
  await desktop.page.waitForFunction(() => getComputedStyle(document.querySelector('.spatial-scene-canvas')).opacity === '0');
  await desktop.button.click();
  await waitReady(desktop.page);
  assert.equal(desktop.depthDownloads(), 1, 'Reopening the same photo should reuse cached depth');
  assert.equal(desktop.workerRequests(), 0, 'Visitors must never download a model or inference engine');
  await desktop.page.keyboard.press('ArrowRight');
  assert.equal(await desktop.button.getAttribute('aria-pressed'), 'false');
  assert.equal(await desktop.page.locator('.spatial-scene-canvas.is-ready').count(), 0);
  await desktop.button.click();
  await waitReady(desktop.page);
  assert.equal(desktop.depthDownloads(), 2, 'A different photo should load its precomputed depth');
  assert.equal(desktop.workerRequests(), 0, 'A different photo must not start browser inference');
  await desktop.page.keyboard.press('Escape');
  await desktop.page.getByRole('dialog').waitFor({ state: 'hidden' });
  await desktop.context.close();
  console.log(`${realModel ? 'Real model' : 'Fixture'}: depth render, pointer movement, original fallback, cache, photo switch, Escape passed`);

  if (!realModel) {
    const pending = await openFixture({ pending: true });
    await pending.button.click();
    await pending.page.waitForFunction(() => document.querySelector('.spatial-scene-status')?.textContent.includes('后台'));
    await pending.button.click();
    await pending.page.waitForFunction(() => !document.querySelector('.spatial-scene-toggle.is-active'));
    await pending.page.waitForTimeout(100);
    assert.equal(pending.page.workers().length, 0, 'Pending photos must not start browser inference');
    await pending.button.click();
    await pending.page.waitForTimeout(100);
    await pending.page.keyboard.press('ArrowRight');
    await pending.page.waitForTimeout(100);
    assert.equal(pending.page.workers().length, 0, 'Switching photos must not start browser inference');
    await pending.context.close();

    for (const options of [{ error: true }, { corsError: true }]) {
      console.log(`Checking fallback: ${JSON.stringify(options)}`);
      const failure = await openFixture(options);
      await failure.button.click();
      await failure.page.locator('.spatial-scene-status.is-error').waitFor();
      assert.equal(await failure.button.getAttribute('aria-pressed'), 'false');
      assert.equal(await failure.page.locator('.spatial-scene-canvas.is-ready').count(), 0);
      assert.ok(await failure.page.locator('.lightbox-media img').evaluate((image) => image.complete && image.naturalWidth > 0));
      await failure.context.close();
    }

    const proxy = await openFixture({ proxy: true, corsError: true });
    await proxy.button.click();
    await waitReady(proxy.page);
    assert.equal(proxy.proxyRequests(), 1, 'Restricted OSS proxy should recover a failed direct CORS read');
    await proxy.context.close();

    const reduced = await openFixture({ reduced: true });
    await reduced.page.waitForTimeout(1100);
    assert.equal(await reduced.button.isDisabled(), true);
    assert.equal(reduced.metadataRequests(), 0, 'Reduced motion should disable prefetch');
    assert.equal(reduced.workerRequests(), 0);
    await reduced.context.close();

    for (const permission of ['granted', 'denied']) {
      const mobile = await openFixture({ mobile: true, permission });
      await mobile.button.click();
      await waitReady(mobile.page);
      assert.equal(await mobile.page.evaluate(() => window.__spatialPermissionCalls), 1);
      const mobileCanvas = mobile.page.locator('.spatial-scene-canvas');
      const size = await mobileCanvas.boundingBox();
      assert.ok(size.x >= -1 && size.x + size.width <= 391, 'Mobile scene should fit the screen');
      const before = await mobileCanvas.screenshot();
      if (permission === 'granted') {
        await mobile.page.evaluate(() => {
          for (const pose of [{ beta: 60, gamma: 0 }, { beta: 66, gamma: 12 }]) {
            const event = new Event('deviceorientation');
            Object.defineProperties(event, { beta: { value: pose.beta }, gamma: { value: pose.gamma } });
            window.dispatchEvent(event);
          }
        });
      } else if (browserType === chromium) {
        const title = await mobile.page.locator('#lightbox-title').textContent();
        const touch = await mobile.context.newCDPSession(mobile.page);
        const start = { x: size.x + size.width / 2, y: size.y + size.height / 2 };
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + 90, y: start.y + 15 }] });
        await mobile.page.waitForTimeout(250);
        assert.notDeepEqual(await mobileCanvas.screenshot(), before, 'Touch dragging should change the rendered pixels');
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        assert.equal(await mobile.page.locator('#lightbox-title').textContent(), title, 'Dragging a scene must not switch photographs');
        await touch.detach();
      } else {
        await mobile.page.locator('.lightbox-media').evaluate((element) => {
          const rect = element.querySelector('canvas').getBoundingClientRect();
          element.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse', pointerId: 1 }));
          element.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', clientX: rect.right - 30, clientY: rect.bottom - 30 }));
        });
      }
      await mobile.page.waitForTimeout(850);
      if (permission === 'granted' || browserType !== chromium) {
        assert.notDeepEqual(await mobileCanvas.screenshot(), before, 'Mobile interaction should move the rendered scene');
      }
      await mobile.page.screenshot({ path: path.join(artifactDir, `spatial-mobile-${permission}.png`) });
      await mobile.page.emulateMedia({ reducedMotion: 'reduce' });
      await mobile.page.waitForFunction(() => document.querySelector('.spatial-scene-toggle')?.disabled);
      assert.equal(await mobile.button.getAttribute('aria-pressed'), 'false');
      await mobile.context.close();
    }
    console.log('Cancellation, background failure, CORS error, reduced motion, mobile permission and orientation passed');
  }
  assert.deepEqual(errors, [], 'No uncaught browser errors');
} finally {
  await browser.close();
}

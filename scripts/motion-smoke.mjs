import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const baseUrl = (process.env.UI_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const artifacts = '.artifacts/motion';
const errors = [];
const { outputFiles } = await build({
  stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
    import React, { Profiler, StrictMode, useRef, useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { gsap } from 'gsap';
    import { UploadProgress } from './src/components/UploadProgress';
    import { TabStrip } from './src/pages/gallery/components/TabStrip';
    import { useAnimatedPresence } from './src/hooks/useAnimatedPresence';
    window.uploadCommits = 0;
    function Harness() {
      const [upload, setUpload] = useState({ progress: 0, isVisible: true, fileName: 'first.jpg' });
      const [filter, setFilter] = useState('latest');
      const [open, setOpen] = useState(false);
      const [mounted, setMounted] = useState(true);
      window.motion = { setUpload, setFilter, setOpen, setMounted,
        animations: () => gsap.globalTimeline.getChildren(true, true, true).length };
      return mounted && <>
        <Profiler id="upload" onRender={() => window.uploadCommits++}><UploadProgress {...upload} /></Profiler>
        <TabStrip activeFilter={filter} onFilterChange={setFilter} />
        <Dialog open={open} />
      </>;
    }
    function Dialog({open}) {
      const ref = useRef(null);
      const present = useAnimatedPresence(open, ref, { panelSelector: '.fixture-panel' });
      return present && <div ref={ref} className="fixture-dialog"><div className="fixture-panel">Details</div></div>;
    }
    createRoot(document.getElementById('fixture')).render(<StrictMode><Harness /></StrictMode>);
  ` },
  bundle: true, write: false, format: 'esm', loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' },
});

const browser = await chromium.launch({ headless: true });
try {
  await mkdir(artifacts, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await context.route('**/__motion-test__', route => route.fulfill({ contentType: 'text/html', body: `
    <html data-theme="paper"><head><meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/src/App.css"><link rel="stylesheet" href="/src/themes/themes.css">
    <link rel="stylesheet" href="/src/components/UploadProgress.css"></head>
    <body><div class="app-shell"><div id="fixture"></div></div>
    <script type="module" src="/__motion-fixture__.js"></script></body></html>` }));
  await context.route('**/__motion-fixture__.js', route => route.fulfill({ contentType: 'text/javascript', body: outputFiles[0].text }));
  const fixture = await context.newPage();
  fixture.on('pageerror', error => errors.push(error.message));
  await fixture.goto(`${baseUrl}/__motion-test__`);
  await fixture.evaluate(() => window.motion.setUpload({ progress: 80, isVisible: true, fileName: 'first.jpg' }));
  await fixture.waitForFunction(() => Number(document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')) > 0);
  const commits = await fixture.evaluate(() => window.uploadCommits);
  await fixture.waitForFunction(() => document.querySelector('.upload-progress-percentage').textContent === '80%');
  assert.equal(await fixture.evaluate(() => window.uploadCommits), commits, 'Progress animation must not render React every frame');
  for (const progress of [40, 65, 100]) {
    await fixture.evaluate(value => window.motion.setUpload({ progress: value, isVisible: true, fileName: 'first.jpg' }), progress);
  }
  await fixture.waitForFunction(() => document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow') === '100');
  await fixture.evaluate(() => window.motion.setUpload({ progress: 0, isVisible: true, fileName: 'second.jpg' }));
  await fixture.waitForFunction(() => document.querySelector('.upload-progress-percentage').textContent === '0%');
  await fixture.emulateMedia({ reducedMotion: 'reduce' });
  await fixture.evaluate(() => window.motion.setUpload({ progress: 37, isVisible: true, fileName: 'second.jpg' }));
  await fixture.waitForFunction(() => document.querySelector('.upload-progress-percentage').textContent === '37%');
  await fixture.emulateMedia({ reducedMotion: 'no-preference' });
  await fixture.waitForFunction(() => document.querySelector('.upload-progress-percentage').textContent === '37%');
  await fixture.evaluate(() => window.motion.setUpload({ progress: null, isVisible: false, fileName: 'second.jpg' }));
  await fixture.locator('.upload-progress-container').waitFor({ state: 'detached' });

  // Interrupt both directions of the same presence timeline.
  await fixture.evaluate(() => window.motion.setOpen(true));
  await fixture.locator('.fixture-dialog').waitFor();
  await fixture.evaluate(async () => {
    window.motion.setOpen(false);
    await new Promise(requestAnimationFrame);
    window.motion.setOpen(true);
  });
  await fixture.waitForFunction(() => Number(getComputedStyle(document.querySelector('.fixture-dialog')).opacity) === 1);
  await fixture.evaluate(() => window.motion.setOpen(false));
  await fixture.locator('.fixture-dialog').waitFor({ state: 'detached' });
  await fixture.evaluate(() => window.motion.setFilter('far'));
  await fixture.evaluate(() => window.motion.setFilter('nearby'));
  await fixture.evaluate(() => window.motion.setFilter('film'));
  await fixture.evaluate(() => window.motion.setFilter('random'));
  const indicatorAligned = () => {
    const active = document.querySelector('.tab.active').getBoundingClientRect();
    const indicator = document.querySelector('.tab-indicator').getBoundingClientRect();
    return Math.abs(active.left - indicator.left) < 1 && Math.abs(active.width - indicator.width) < 1;
  };
  await fixture.waitForFunction(indicatorAligned);
  for (const width of [390, 320, 844, 1200]) {
    await fixture.setViewportSize({ width, height: 900 });
    await fixture.waitForFunction(indicatorAligned);
  }
  await fixture.evaluate(() => document.fonts.dispatchEvent(new Event('loadingdone')));
  await fixture.waitForFunction(indicatorAligned);
  await fixture.evaluate(async () => {
    window.motion.setUpload({ progress: 90, isVisible: true, fileName: 'third.jpg' });
    window.motion.setOpen(true);
    window.motion.setFilter('far');
    await new Promise(requestAnimationFrame);
    window.motion.setMounted(false);
  });
  await fixture.waitForFunction(() => window.motion.animations() === 0);
  await context.close();

  const photos = Array.from({ length: 5 }, (_, index) => ({
    id: `motion-${index + 1}`, title: `Motion ${index + 1}`, status: 'approved', hidden: false,
    category: index === 3 ? 'film' : 'latest', film_stock: index === 3 ? 'Fuji C200' : '',
    image_url: `https://motion-images.invalid/${index + 1}.svg`,
    thumbnail_url: index === 0 ? 'https://motion-images.invalid/thumb-1.svg' : '',
    created_at: `2026-10-${24 - index}T00:00:00Z`,
  }));
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const app = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion, hasTouch: true });
    await app.addInitScript(() => {
      sessionStorage.setItem('pic4pick_intro_seen', '1');
      localStorage.setItem('pic4pick_env_overrides', JSON.stringify({
        VITE_SUPABASE_URL: 'https://motion-data.invalid', VITE_SUPABASE_ANON_KEY: 'sb_publishable_fixture',
        VITE_API_BASE_URL: 'https://motion-api.invalid',
      }));
    });
    await app.route('https://motion-data.invalid/**', route => route.fulfill({ json: [] }));
    await app.route('**/rest/v1/photos?**', route => route.fulfill({ json: photos }));
    await app.route('https://motion-api.invalid/**', route => route.fulfill({ json: {} }));
    let releaseSlow;
    const slowReady = new Promise(resolve => { releaseSlow = resolve; });
    let releaseFirstPreview;
    const firstPreviewReady = new Promise(resolve => { releaseFirstPreview = resolve; });
    await app.route('https://motion-images.invalid/**', async route => {
      const path = new URL(route.request().url()).pathname;
      const number = Number(path.match(/\d+/)[0]);
      if (path === '/1.svg') await firstPreviewReady;
      if (number === 2) await slowReady;
      if (number === 5) { await route.fulfill({ status: 404, body: 'Unavailable' }); return; }
      const portrait = number % 2 === 0;
      await route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg"
        width="${portrait ? 400 : 600}" height="${portrait ? 600 : 400}">
        <path fill="${portrait ? '#779e8e' : '#ac8966'}" d="M0 0h600v600H0z"/></svg>` });
    });
    const page = await app.newPage();
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      const card = page.getByRole('button', { name: '查看作品：Motion 1', exact: true });
      await card.locator('img.loaded').waitFor();
      await page.evaluate(() => {
        const lightbox = document.querySelector('.lightbox');
        window.sharedPhotoPhases = [];
        new MutationObserver(() => {
          const phase = lightbox.dataset.sharedPhotoMotion;
          if (phase) window.sharedPhotoPhases.push(phase);
          if (phase === 'enter') {
            window.sharedPhotoEntry = {
              layer: document.querySelector('.lightbox-shared-photo'),
              aperture: lightbox.querySelector('.lightbox-media').getBoundingClientRect(),
            };
          }
        }).observe(lightbox, { attributeFilter: ['data-shared-photo-motion'] });
      });
      await card.focus();
      await card.press('Enter');
      if (reducedMotion === 'no-preference') {
        await page.waitForFunction(() => {
          const root = document.querySelector('.lightbox');
          return window.sharedPhotoPhases.includes('enter') && !root.dataset.sharedPhotoMotion
            && root.querySelector('.lightbox-outgoing-image')?.currentSrc.endsWith('/thumb-1.svg')
            && getComputedStyle(root.querySelector('.lightbox-media')).opacity === '1';
        });
        const endpointError = await page.evaluate(() => {
          const { layer, aperture } = window.sharedPhotoEntry;
          const transform = new DOMMatrix(layer.style.transform);
          return Math.hypot(transform.e - aperture.left, transform.f - aperture.top);
        });
        assert.ok(endpointError < 1, `The expanded photo aligns with the aperture (error: ${endpointError}px)`);
      }
      releaseFirstPreview();
      await page.waitForFunction(() => {
        const image = document.querySelector('.lightbox-photo-track > img:not(.lightbox-outgoing-image)');
        return image?.naturalWidth > 0 && Number(getComputedStyle(image).opacity) === 1;
      });
      const touch = await app.newCDPSession(page);
      const bounds = await page.locator('.lightbox-media').boundingBox();
      const sendTouch = (type, dx = 0, dy = 0) => touch.send('Input.dispatchTouchEvent', {
        type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [
          { x: Math.round(bounds.x + bounds.width / 2) + dx, y: Math.round(bounds.y + bounds.height / 2) + dy },
        ],
      });
      const waitForTrack = expected => page.waitForFunction(value => (
        getComputedStyle(document.querySelector('.lightbox-photo-track')).translate === value
      ), expected);
      await sendTouch('touchStart');
      await sendTouch('touchMove', 4, 60);
      await sendTouch('touchEnd');
      await waitForTrack('none');
      assert.equal(await page.locator('#lightbox-title').textContent(), 'Motion 1', 'Vertical gestures leave the photo in place');

      if (reducedMotion === 'no-preference') {
        await sendTouch('touchStart');
        await sendTouch('touchMove', -40);
        await waitForTrack('-40px');
        await sendTouch('touchMove', 26);
        await waitForTrack('26px');
        await sendTouch('touchEnd');
        await waitForTrack('none');
        assert.equal(await page.locator('#lightbox-title').textContent(), 'Motion 1', 'A short reversal settles on the same photo');

        await sendTouch('touchStart');
        await sendTouch('touchMove', 70);
        await waitForTrack('70px');
        await sendTouch('touchCancel');
        await waitForTrack('none');
        assert.equal(await page.locator('#lightbox-title').textContent(), 'Motion 1', 'A canceled touch never switches photos');
      }
      await sendTouch('touchStart');
      await sendTouch('touchMove', -90);
      await waitForTrack(reducedMotion === 'reduce' ? 'none' : '-90px');
      await sendTouch('touchEnd');
      await page.waitForFunction(() => document.querySelector('#lightbox-title').textContent === 'Motion 2');
      await waitForTrack('none');
      assert.equal(await page.locator('.lightbox-outgoing-image').count(), 1, 'Slow loads retain the last visible photograph');
      await page.waitForFunction(() => {
        const snapshot = document.querySelector('.lightbox-outgoing-image');
        if (!snapshot?.currentSrc.endsWith('/1.svg')) return false;
        const transform = getComputedStyle(snapshot).transform;
        return transform === 'none' || Math.abs(new DOMMatrix(transform).m41) < 0.5;
      });
      await page.getByRole('button', { name: '下一张照片', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#lightbox-title').textContent === 'Motion 3');
      releaseSlow();
      await page.locator('.lightbox-outgoing-image').waitFor({ state: 'detached' });
      assert.equal(await page.locator('.lightbox-photo-track > img').getAttribute('alt'), 'Motion 3', 'A stale load cannot replace the latest request');
      await page.keyboard.press('ArrowLeft');
      await page.waitForFunction(() => {
        const image = document.querySelector('.lightbox-photo-track > img:not(.lightbox-outgoing-image)');
        return image?.alt === 'Motion 2' && image.naturalWidth === 400 && Number(getComputedStyle(image).opacity) === 1;
      });
      await page.locator('.lightbox-outgoing-image').waitFor({ state: 'detached' });
      // Reduced-motion reveal is synchronous; React's onLoad ratio update can
      // commit after opacity reaches 1. Wait for the layout we are asserting.
      await page.waitForFunction(() => {
        const media = document.querySelector('.lightbox-media');
        const image = media.querySelector('img');
        return Math.abs(media.clientWidth / media.clientHeight - image.naturalWidth / image.naturalHeight) < 0.02;
      });
      const ratio = await page.locator('.lightbox-media').evaluate(el => {
        const image = el.querySelector('img');
        return { actual: el.clientWidth / el.clientHeight, expected: image.naturalWidth / image.naturalHeight };
      });
      assert.ok(Math.abs(ratio.actual - ratio.expected) < 0.02, 'Portrait transitions preserve the complete image');
      await page.getByRole('button', { name: '基本参数', exact: true }).click();
      const sheet = page.getByRole('dialog', { name: '照片详情' });
      await sheet.waitFor();
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.photo-details-backdrop')).opacity) === 1);
      await page.screenshot({ path: `${artifacts}/details-${reducedMotion}.png` });
      await page.keyboard.press('Escape');
      await sheet.waitFor({ state: 'detached' });
      assert.ok(await page.locator('.lightbox-details-trigger').evaluate(el => el === document.activeElement));
      await page.keyboard.press('Escape');
      await page.locator('.lightbox.active').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '查看作品：Motion 1');
      assert.equal(await page.locator('.lightbox-outgoing-image').count(), 0);
      assert.deepEqual(await page.evaluate(() => window.sharedPhotoPhases),
        reducedMotion === 'reduce' ? [] : ['enter'], 'Navigating to another photo uses the standard exit');

      await card.press('Enter');
      await page.waitForFunction(() => {
        const root = document.querySelector('.lightbox');
        return root.classList.contains('active') && !root.dataset.sharedPhotoMotion
          && Number(getComputedStyle(root).opacity) === 1;
      });
      await page.keyboard.press('Escape');
      await page.locator('.lightbox.active').waitFor({ state: 'hidden' });
      assert.deepEqual(await page.evaluate(() => window.sharedPhotoPhases),
        reducedMotion === 'reduce' ? [] : ['enter', 'enter', 'exit'], 'A visible source gets a return transition');
      assert.equal(await page.locator('.lightbox-shared-photo, [data-shared-photo-source]').count(), 0);

      if (reducedMotion === 'no-preference') {
        await card.press('Enter');
        await page.locator('[data-shared-photo-motion="enter"]').waitFor();
        await page.keyboard.press('Escape');
        await page.locator('.lightbox.active').waitFor({ state: 'hidden' });
        assert.equal(await page.locator('.lightbox-shared-photo, [data-shared-photo-source]').count(), 0,
          'Closing during entry clears the temporary layer');

        await card.press('Enter');
        await page.locator('[data-shared-photo-motion="enter"]').waitFor();
        await card.evaluate(node => { node.style.visibility = 'hidden'; });
        await page.keyboard.press('Escape');
        await page.locator('.lightbox.active').waitFor({ state: 'hidden' });
        assert.deepEqual(await page.evaluate(() => window.sharedPhotoPhases),
          ['enter', 'enter', 'exit', 'enter', 'exit', 'enter'], 'An unavailable source falls back to a fade');
        await page.locator('[data-photo-id="motion-1"]').evaluate(node => {
          node.style.removeProperty('visibility');
        });
        await page.setViewportSize({ width: 1200, height: 900 });
        await card.press('Enter');
        await page.locator('[data-shared-photo-motion="enter"]').waitFor({ state: 'attached' });
        await page.locator('.lightbox-shared-photo').waitFor({ state: 'detached' });
        await page.keyboard.press('Escape');
        await page.locator('[data-shared-photo-motion="exit"]').waitFor({ state: 'attached' });
        await page.locator('.lightbox.active').waitFor({ state: 'hidden' });
        await page.setViewportSize({ width: 390, height: 844 });
      }
      await page.getByRole('tab', { name: '胶片', exact: true }).click();
      await page.getByRole('button', { name: '查看作品：Motion 4', exact: true }).click();
      await page.waitForFunction(() => {
        const image = document.querySelector('.lightbox-media img');
        return image?.naturalWidth === 400 && Number(getComputedStyle(image).opacity) === 1 &&
          Number(getComputedStyle(document.querySelector('.lightbox')).opacity) === 1;
      });
      assert.equal(await page.locator('.lightbox-panel').evaluate(el => el.classList.contains('lightbox-panel--fuji-c200')), true);
      await page.screenshot({ path: `${artifacts}/film-${reducedMotion}.png` });
      await page.keyboard.press('Escape');
      await page.locator('.lightbox.active').waitFor({ state: 'hidden' });
      await page.getByRole('tab', { name: '最新', exact: true }).click();
      await card.click();
      await page.waitForFunction(() => {
        const image = document.querySelector('.lightbox-photo-track > img');
        return image?.alt === 'Motion 1' && image.naturalWidth > 0 && Number(getComputedStyle(image).opacity) === 1;
      });
      // Swiping backwards wraps to the broken last photo. A terminal failure
      // must remove the outgoing snapshot and expose the fallback message.
      await page.locator('.lightbox-shared-photo').waitFor({ state: 'detached' });
      await page.locator('.lightbox-media').evaluate(el => {
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', isPrimary: true, clientX: 100, clientY: 200 }));
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', isPrimary: true, clientX: 220, clientY: 202 }));
      });
      await page.locator('.lightbox-media-fallback').waitFor();
      assert.equal(await page.locator('.lightbox-outgoing-image').count(), 0);
      await page.keyboard.press('Escape');
      await page.locator('.lightbox.active').waitFor({ state: 'hidden' });
    } finally { releaseFirstPreview(); releaseSlow(); await app.close(); }
  }
  assert.deepEqual(errors, []);
  console.log('P1 motion passed: touch tracking and rebound, shared photo entry/return/fallback, upload and tab motion, reversible dialogs, slow and stale image loads, keyboard/focus, portrait and film frames.');
} finally { await browser.close(); }

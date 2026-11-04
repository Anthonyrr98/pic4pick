import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const baseUrl = (process.env.UI_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
// Exercise the production component with deterministic images, without a backend.
const { outputFiles } = await build({
  stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
    import React, { useRef, useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { PhotoGrid } from './src/pages/gallery/components/PhotoGrid';
    window.reads = Array(36).fill(0);
    const stocks = ['Fuji C200', 'Kodak Gold 200', '富士一次性相机', 'FUJIFILM SIMPLE ACE 400'];
    const photos = Array.from({ length: 36 }, (_, i) => new Proxy({
      id: String(i), title: 'Photo ' + i, image: '/__scroll-image__/' + i + '.svg',
      category: 'film', filmStock: stocks[i % stocks.length], likes: 0,
    }, { get(target, key) {
      if (key === 'image') window.reads[i]++;
      return target[key];
    }}));
    window.clickedPhoto = null;
    const click = photo => { window.clickedPhoto = photo.id; };
    const toggle = () => {};
    const load = () => window.showMore();
    function Harness() {
      const [count, setCount] = useState(12);
      const [film, setFilm] = useState(false);
      const ref = useRef(null);
      window.showMore = () => setCount(36);
      window.showFilm = () => {
        document.documentElement.dataset.theme = 'darkroom';
        setFilm(true);
      };
      window.replaceImage = () => {
        // Same photo ID, but a new URL must reset a previous load failure.
        photos[0].image = '/__scroll-image__/replacement.svg';
        setCount(35);
      };
      return <PhotoGrid photos={photos.slice(0, count)} likedPhotoIds={[]}
        onPhotoClick={click} onToggleLike={toggle} hasMore={count < 36}
        isLoadingMore={false} onLoadMore={load} loadMoreRef={ref}
        totalCount={36} filmFrames={film} />;
    }
    createRoot(document.getElementById('fixture')).render(<Harness />);
  ` },
  bundle: true, write: false, format: 'esm',
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' },
});
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: mobile, hasTouch: mobile });
    await context.route('**/__scroll-test__', route => route.fulfill({ contentType: 'text/html', body: `
      <html data-theme="paper"><head><meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/src/App.css"><link rel="stylesheet" href="/src/themes/themes.css">
      <link rel="stylesheet" href="/src/themes/darkroom.css"></head>
      <body><div class="app-shell"><main><div id="fixture"></div></main></div>
      <script type="module" src="/__scroll-fixture__.js"></script></body></html>` }));
    await context.route('**/__scroll-fixture__.js', route => route.fulfill({ contentType: 'text/javascript', body: outputFiles[0].text }));
    let releaseFirstImage;
    const firstImageReady = new Promise(resolve => { releaseFirstImage = resolve; });
    await context.route('**/__scroll-image__/*', async route => {
      const name = new URL(route.request().url()).pathname.split('/').pop();
      if (name === '0.svg') await firstImageReady;
      const portrait = Number.parseInt(name, 10) % 2 === 1;
      return route.fulfill({ contentType: 'image/svg+xml', body:
        `<svg xmlns="http://www.w3.org/2000/svg" width="${portrait ? 400 : 600}" height="${portrait ? 600 : 400}"><path fill="#b29778" d="M0 0h600v600H0z"/></svg>` });
    });
    const page = await context.newPage();
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    await page.goto(`${baseUrl}/__scroll-test__`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('.photo-card img.loaded'));
    await page.waitForTimeout(1400);
    // A load event must not recompute image sources in sibling cards.
    await page.evaluate(() => window.reads.fill(0));
    releaseFirstImage();
    await page.locator('.photo-card').first().locator('img.loaded').waitFor();
    const reads = await page.evaluate(() => window.reads);
    assert.ok(reads.slice(1).every(count => count === 0), 'Loading one image does not render sibling cards');
    const idle = await page.locator('.photo-card').first().evaluate(card => ({
      transform: getComputedStyle(card).transform,
      willChange: getComputedStyle(card).willChange,
      imageWillChange: getComputedStyle(card.querySelector('img')).willChange,
      skeletonAnimation: getComputedStyle(card.querySelector('.photo-skeleton')).animationName,
    }));
    assert.equal(idle.transform, 'none', 'Idle cards do not retain a 3D layer');
    assert.equal(idle.willChange, 'auto');
    assert.equal(idle.imageWillChange, 'auto');
    assert.equal(idle.skeletonAnimation, 'none', 'Loaded skeletons stop animating');
    if (!mobile) {
      await page.locator('.photo-card').first().hover();
      assert.notEqual(await page.locator('.photo-card').first().evaluate(card => getComputedStyle(card).transform), 'none', 'Desktop hover is preserved');
      await page.mouse.move(0, 0);
    }
    await page.locator('.photo-card').first().focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.clickedPhoto), '0', 'Cards remain keyboard accessible');
    await page.getByRole('button', { name: /加载更多/ }).click();
    assert.equal(await page.locator('.photo-card').count(), 36);
    await page.evaluate(async () => {
      for (let y = 0; y <= 4000; y += 160) {
        scrollTo(0, y);
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      scrollTo(0, 0);
    });
    await page.waitForFunction(() => [...document.querySelectorAll('.photo-card')].slice(0, 8).every(card => card.querySelector('img.loaded')));
    assert.equal(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && a.effect?.target?.matches('.photo-skeleton.loaded')).length), 0);
    // A source replacement recovers a failed image instead of retaining stale state.
    await page.locator('.photo-card img').first().evaluate(img => {
      img.dispatchEvent(new Event('error'));
    });
    await page.locator('.photo-card').first().locator('.photo-load-failed').waitFor();
    await page.evaluate(() => window.replaceImage());
    await page.waitForFunction(() => document.querySelector('.photo-card img.loaded')?.src.includes('replacement.svg'));
    await page.evaluate(() => window.showFilm());
    const expected = ['fuji-c200', 'kodak-gold-200', 'fuji-simple-ace', 'fuji-simple-ace'];
    for (let i = 0; i < 4; i++) {
      const frame = page.locator('.photo-card').nth(i).locator('.film-negative');
      await frame.locator('img.loaded').waitFor();
      await page.waitForFunction(({ i }) => {
        const frame = document.querySelectorAll('.film-negative')[i];
        const img = frame.querySelector('img');
        return Math.abs(Number(frame.style.getPropertyValue('--film-photo-ratio')) - img.naturalWidth / img.naturalHeight) < 0.01;
      }, { i });
      assert.match(await frame.getAttribute('class'), new RegExp('film-negative--' + expected[i]));
      const image = frame.locator('img');
      assert.equal(await image.evaluate(img => getComputedStyle(img).objectFit), 'contain');
      for (const edge of await frame.locator('svg image').all()) {
        assert.equal(await edge.getAttribute('href'), '/film-frames/' + expected[i] + '.png');
      }
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.film-negative img').first().evaluate(img => getComputedStyle(img).animationName), 'none');
    console.log(JSON.stringify({ viewport: mobile ? 'mobile' : 'desktop', idle, siblingImageReads: reads.slice(1).reduce((a, b) => a + b, 0), cards: 35 }));
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('Gallery scroll regression passed.');
} finally {
  await browser.close();
}

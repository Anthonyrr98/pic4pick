import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const baseUrl = (process.env.UI_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const { outputFiles } = await build({
  stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
    import React, { StrictMode, useRef, useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { gsap } from 'gsap';
    import { PhotoGrid } from './src/pages/gallery/components/PhotoGrid';
    import { LocationPanel } from './src/pages/gallery/components/LocationPanel';
    const photo={id:'p5',title:'河边',image:'/__p5-image__.svg',category:'latest',likes:9};
    const place={title:'杭州',subtitle:'中国 · 杭州',photos:[photo]};
    function Harness(){
      const [data,setData]=useState(null), [lightbox,setLightbox]=useState(null);
      const [liked,setLiked]=useState(true), [count,setCount]=useState(9);
      const [active,setActive]=useState(true), [mounted,setMounted]=useState(true);
      const [film,setFilm]=useState(false), [allow,setAllow]=useState(true);
      const load=useRef(null);
      window.p5={setData,setActive,setMounted,setFilm,setAllow,place,
        restore:(liked,count)=>{setLiked(liked);setCount(count)},
        animations:()=>gsap.globalTimeline.getChildren(true,true,true).length};
      return mounted&&<>
        <button id="map-trigger" onClick={()=>setData(place)}>地点照片</button>
        <LocationPanel data={data} onClose={()=>setData(null)} onPhotoClick={photo=>{
          window.handoff={opacity:Number(getComputedStyle(document.querySelector('.location-panel-backdrop')).opacity),
            focus:document.activeElement.id};
          setLightbox(photo);
        }}/>
        {lightbox&&<div role="dialog" aria-label="照片灯箱">{lightbox.title}<button onClick={()=>setLightbox(null)}>关闭灯箱</button></div>}
        <PhotoGrid photos={[{...photo,likes:count}]} likedPhotoIds={liked?['p5']:[]} isActive={active}
          filmFrames={film} onPhotoClick={()=>window.cardOpened=true} onToggleLike={()=>{
            if(!allow)return;
            setLiked(value=>!value);setCount(value=>value+(liked?-1:1));
          }} hasMore={false} isLoadingMore={false} onLoadMore={()=>{}} loadMoreRef={load} totalCount={1}/>
      </>;
    }
    createRoot(document.getElementById('fixture')).render(<StrictMode><Harness/></StrictMode>);
  ` }, bundle: true, write: false, format: 'esm',
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' },
});
const browser = await chromium.launch({ headless: true });
const errors = [];
const settled = page => page.waitForFunction(() => !document.querySelector('[data-like-animating]'));
const toggle = page => page.locator('.like-badge').click({ force: true });
try {
  await mkdir('.artifacts/motion', { recursive: true });
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1200, height: 900 },
      isMobile: mobile, hasTouch: mobile });
    await context.route('**/__p5-test__', route => route.fulfill({ contentType: 'text/html', body: `
      <html data-theme="paper"><head><meta name="viewport" content="width=device-width,initial-scale=1">
      <link rel="stylesheet" href="/src/App.css"><link rel="stylesheet" href="/src/themes/themes.css">
      <link rel="stylesheet" href="/src/themes/darkroom.css"></head>
      <body><div class="app-shell"><main><div id="fixture"></div></main></div>
      <script type="module" src="/__p5-fixture__.js"></script></body></html>` }));
    await context.route('**/__p5-fixture__.js', route => route.fulfill({ contentType: 'text/javascript', body: outputFiles[0].text }));
    await context.route('**/__p5-image__.svg', route => route.fulfill({ contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><path fill="#748c81" d="M0 0h600v400H0z"/></svg>' }));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => { if (request.url().endsWith('.css')) errors.push('Stylesheet failed: ' + request.url()); });
    await page.goto(baseUrl + '/__p5-test__');
    await page.locator('.photo-card img.loaded').waitFor();
    await page.waitForFunction(() => document.querySelector('.photo-card').style.opacity === '');
    // Restoring a liked photo never emits a burst or CSS keyframes.
    assert.equal(await page.locator('[data-like-animating]').count(), 0);
    assert.ok(await page.locator('.like-badge-burst').evaluateAll(elements => elements.every(e => getComputedStyle(e).opacity === '0')));
    assert.equal(await page.locator('.like-badge-heart svg').evaluate(e => getComputedStyle(e).animationName), 'none');
    await page.evaluate(() => window.p5.restore(false, 8));
    await toggle(page);
    await page.waitForFunction(() => document.querySelector('[data-like-animating]'));
    assert.equal(await page.locator('.like-badge').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.like-badge-count').textContent(), '9');
    assert.equal(await page.evaluate(() => Boolean(window.cardOpened)), false);
    await settled(page);
    assert.ok(await page.locator('.like-badge-burst, .like-badge-heart, .like-badge-count').evaluateAll(
      elements => elements.every(e => !e.style.transform && !e.style.opacity && !e.style.willChange)));
    // Rapid toggle alternation settles exactly at the final business state.
    for (let i = 0; i < 5; i++) { await toggle(page); await page.waitForTimeout(25); }
    await settled(page);
    assert.equal(await page.locator('.like-badge').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('.like-badge-count').textContent(), '8');
    await page.evaluate(() => window.p5.restore(true, 100));
    assert.equal(await page.locator('[data-like-animating]').count(), 0);
    // A no-op request must not animate a later refresh.
    await page.evaluate(() => window.p5.setAllow(false));
    await toggle(page);
    await page.evaluate(() => window.p5.restore(false, 99));
    assert.equal(await page.locator('[data-like-animating]').count(), 0);
    await page.evaluate(() => window.p5.setAllow(true));
    await toggle(page);
    await page.evaluate(() => window.p5.setActive(false));
    await settled(page);
    await page.evaluate(() => window.p5.setActive(true));
    assert.equal(await page.locator('[data-like-animating]').count(), 0);
    await toggle(page);
    await page.evaluate(() => { document.body.style.paddingBottom = '2000px'; window.scrollTo(0, 2000); });
    await page.waitForFunction(() => !document.querySelector('[data-like-animating]'), null, { timeout: 250 });
    await page.evaluate(() => { window.scrollTo(0, 0); document.body.style.paddingBottom = ''; });
    // Reusing the card when leaving film mode still binds the new like button.
    await page.evaluate(() => window.p5.setFilm(true));
    await page.locator('.like-badge').waitFor({ state: 'detached' });
    await page.evaluate(() => window.p5.setFilm(false));
    await toggle(page);
    await page.waitForFunction(() => document.querySelector('[data-like-animating]'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await settled(page);
    await toggle(page);
    assert.equal(await page.locator('[data-like-animating]').count(), 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    const trigger = page.getByRole('button', { name: '地点照片', exact: true });
    await trigger.click();
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.location-panel-backdrop')).opacity) === 1);
    assert.equal(await page.locator('.location-panel-close').evaluate(e => e === document.activeElement), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('.location-panel-photo').evaluate(e => e === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.location-panel-close').evaluate(e => e === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.location-panel-backdrop').getAttribute('data-state'), 'closing');
    assert.equal(await page.locator('.location-panel-title').textContent(), '杭州');
    await page.locator('.location-panel').waitFor({ state: 'detached' });
    assert.equal(await trigger.evaluate(e => e === document.activeElement), true);
    // Reverse an exit, replace the place, and cancel the queued selection.
    await trigger.click();
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.location-panel-backdrop')).opacity) === 1);
    await page.locator('.location-panel-photo').click();
    await page.evaluate(() => window.p5.setData({ ...window.p5.place, title: '新地点', photos: [] }));
    await page.waitForFunction(() => document.querySelector('.location-panel-title')?.textContent === '新地点');
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.location-panel-backdrop')).opacity) === 1);
    assert.equal(await page.locator('.location-panel-title').textContent(), '新地点');
    assert.equal(await page.locator('.location-panel-close').evaluate(e => e === document.activeElement), true);
    assert.equal(await page.getByRole('dialog', { name: '照片灯箱' }).count(), 0);
    assert.equal(await page.locator('.location-panel-empty').textContent(), '当前没有可用的图库照片');
    await page.locator('.location-panel-backdrop').click({ position: { x: 2, y: 2 } });
    await page.locator('.location-panel').waitFor({ state: 'detached' });
    // Selected photo opens only when the old overlay has faded out.
    await trigger.click();
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.location-panel-backdrop')).opacity) === 1);
    await page.screenshot({ path: `.artifacts/motion/p5-location-${mobile ? 'mobile' : 'desktop'}.png` });
    await page.locator('.location-panel-photo').click();
    assert.equal(await page.getByRole('dialog', { name: '照片灯箱' }).count(), 0);
    await page.getByRole('dialog', { name: '照片灯箱' }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.handoff), { opacity: 0, focus: 'map-trigger' });
    await page.getByRole('button', { name: '关闭灯箱', exact: true }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await trigger.click();
    await page.locator('.location-panel-close').click();
    await page.locator('.location-panel').waitFor({ state: 'detached' });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await toggle(page);
    await trigger.click();
    await page.evaluate(() => window.p5.setMounted(false));
    await page.waitForFunction(() => window.p5.animations() === 0);
    await context.close();
  }
  // Exercise the real page, optimistic like handler, map marker, and lightbox.
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    sessionStorage.setItem('pic4pick_intro_seen', '1');
    localStorage.setItem('camarts_liked_photos', JSON.stringify(['p5-real']));
    localStorage.setItem('pic4pick_env_overrides', JSON.stringify({
      VITE_SUPABASE_URL: 'https://p5-data.invalid', VITE_SUPABASE_ANON_KEY: 'sb_publishable_fixture',
      VITE_API_BASE_URL: 'https://p5-api.invalid', VITE_MAP_STYLE_PRESET: 'street',
    }));
  });
  const photos = [{ id: 'p5-real', title: '西湖', status: 'approved', hidden: false, category: 'latest',
    location: '杭州', country: '中国', latitude: 30.25, longitude: 120.15, likes: 9,
    image_url: 'https://p5-images.invalid/lake.svg', created_at: '2026-10-01T00:00:00Z' }];
  const deltas = [];
  await context.route('https://p5-data.invalid/**', route => route.fulfill({ json: [] }));
  await context.route('**/rest/v1/photos?**', route => route.fulfill({ json: photos }));
  await context.route('https://p5-api.invalid/**', route => {
    if (route.request().url().endsWith('/likes')) deltas.push(route.request().postDataJSON().delta);
    return route.fulfill({ json: {} });
  });
  await context.route('https://p5-images.invalid/**', route => route.fulfill({ contentType: 'image/svg+xml', body:
    '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><path fill="#64897b" d="M0 0h900v600H0z"/></svg>' }));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('.photo-card img.loaded').waitFor();
  assert.equal(await page.locator('[data-like-animating]').count(), 0);
  await page.locator('.photo-card').hover();
  await toggle(page);
  await page.waitForFunction(() => document.querySelector('[data-like-animating]'));
  assert.equal(await page.locator('.like-badge-count').textContent(), '8');
  await settled(page);
  await toggle(page);
  await settled(page);
  assert.deepEqual(deltas, [-1, 1]);
  assert.equal(await page.locator('.like-badge-count').textContent(), '9');
  await page.getByRole('button', { name: '发现', exact: true }).click();
  const marker = page.locator('.explore-marker-target').first();
  await marker.waitFor({ timeout: 30000 });
  await marker.focus();
  await marker.press('Enter');
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.location-panel-backdrop')).opacity) === 1);
  await page.screenshot({ path: '.artifacts/motion/p5-map-location.png' });
  await page.locator('.location-panel-photo').click();
  await page.locator('.lightbox.active').waitFor();
  await page.locator('.location-panel').waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.querySelector('.lightbox-media img')?.naturalWidth > 0);
  await page.keyboard.press('Escape');
  await page.locator('.lightbox.active').waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.activeElement?.classList.contains('explore-marker-target'));
  await context.close();
  assert.deepEqual(errors, []);
  console.log('P5 motion passed: retained/reversible location panel, keyboard focus, photo handoff, interaction-only likes, rapid toggles, film reuse, reduced motion and cleanup.');
} finally { await browser.close(); }

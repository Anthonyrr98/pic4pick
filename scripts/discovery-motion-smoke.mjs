import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const baseUrl = (process.env.UI_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const errors = [];
const { outputFiles } = await build({
  stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
    import React, { StrictMode, useEffect, useRef, useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { gsap } from 'gsap';
    import { PhotoGrid } from './src/pages/gallery/components/PhotoGrid';
    import { CurationPanel } from './src/pages/gallery/components/CurationPanel';
    import { createMarkerReveal } from './src/utils/markerReveal';
    const photos = Array.from({length: 24}, (_, i) => ({ id: String(i), title: 'Photo ' + i,
      image: '/__p2-image__.svg', category: 'film', filmStock: 'Fuji C200' }));
    const groups = [{id: 'province', title: '测试省份', items: [{id: 'city', label: '测试城市',
      image: '/__p2-image__.svg', photoCount: photos.length, photos, lng: 116, lat: 40}]}];
    function Harness() {
      const [view, setView] = useState('grid');
      const [collapsed, setCollapsed] = useState(false);
      const [film, setFilm] = useState(false);
      const [mounted, setMounted] = useState(true);
      const more = useRef(null);
      window.p2 = {setView, setCollapsed, setMounted,
        film() {document.documentElement.dataset.theme = 'darkroom'; setFilm(true)},
        animations: () => gsap.globalTimeline.getChildren(true, true, true).length};
      return mounted && <>
        <div hidden={view !== 'grid'}><PhotoGrid photos={photos} likedPhotoIds={[]} isActive={view === 'grid'}
          filmFrames={film} onPhotoClick={() => {}} onToggleLike={() => {}}
          hasMore={false} isLoadingMore={false} onLoadMore={() => {}} loadMoreRef={more} totalCount={24} /></div>
        <section id="explore-view" hidden={view !== 'explore'} style={{height:'100vh', minHeight:0}}>
          <CurationPanel isActive={view === 'explore'} groups={groups} isLoading={false}
            expandedCategories={{province:true}} onToggleCategory={() => {}} onCityClick={() => {}}
            onPhotoClick={() => {}} activeCitySelection={null} isPanelCollapsed={collapsed}
            onTogglePanelCollapse={() => setCollapsed(value => !value)} />
        </section>
        <Markers />
      </>;
    }
    function Markers() {
      const ref = useRef(null);
      useEffect(() => {
        let animation;
        window.markerTest = {
          start(count, active = true) {
            animation?.dispose(); ref.current.replaceChildren();
            const dots = Array.from({length:count}, () => {
              const anchor = document.createElement('div'); anchor.style.transform = 'translate(12px, 20px)';
              const dot = document.createElement('span'); dot.className = 'test-dot'; anchor.appendChild(dot);
              ref.current.appendChild(anchor); return dot;
            });
            animation = createMarkerReveal(dots, ref.current, () => active);
          },
          finish() { animation?.finish(); },
          dispose() {animation?.dispose(); ref.current.replaceChildren();}
        };
        return () => animation?.dispose();
      }, []);
      return <div ref={ref} />;
    }
    createRoot(document.getElementById('fixture')).render(<StrictMode><Harness /></StrictMode>);
  ` },
  bundle: true, write: false, format: 'esm', loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' },
});
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await context.route('**/__p2-test__', route => route.fulfill({contentType: 'text/html', body: `
    <html data-theme="paper"><head><meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/src/App.css"><link rel="stylesheet" href="/src/themes/themes.css">
    <link rel="stylesheet" href="/src/themes/darkroom.css"><link rel="stylesheet" href="/src/pages/gallery/components/CurationPanel.css">
    <style>#explore-view[hidden]{display:none}.gallery-grid{margin:24px;width:calc(100% - 48px)}.test-dot{display:block;width:12px;height:12px;background:#546c65}</style>
    </head><body><div class="app-shell"><div id="fixture"></div></div>
    <script type="module" src="/__p2-fixture__.js"></script></body></html>`}));
  await context.route('**/__p2-fixture__.js', route => route.fulfill({contentType: 'text/javascript',body:outputFiles[0].text}));
  await context.route('**/__p2-image__.svg', route => route.fulfill({contentType:'image/svg+xml',body:
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><path fill="#779e8e" d="M0 0h600v400H0z"/></svg>'}));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseUrl}/__p2-test__`);
  await page.waitForFunction(() => document.querySelector('.photo-card img.loaded'));
  const card = page.locator('.photo-card').first();
  await card.hover();
  const box = await card.boundingBox();
  const commits = await page.evaluate(() => {
    window.layoutReads = 0;
    const card = document.querySelector('.photo-card');
    const measure = card.getBoundingClientRect.bind(card);
    card.getBoundingClientRect = () => {window.layoutReads++; return measure()};
    return window.p2.animations();
  });
  for (let step = 1; step <= 20; step++) await page.mouse.move(box.x + box.width * (0.3 + step / 60), box.y + box.height * 0.4);
  assert.equal(await page.evaluate(() => window.layoutReads), 0, 'Pointer updates reuse the stable entry bounds');
  assert.ok(await page.evaluate(() => window.p2.animations()) <= commits,
    'Pointer updates do not create tweens while unrelated entry animations may finish');
  assert.equal(await page.locator('.photo-card').nth(1).evaluate(el => getComputedStyle(el).transform), 'none');
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.photo-card')).transform === 'none');
  assert.equal(await card.evaluate(el => getComputedStyle(el).willChange), 'auto');
  await card.hover();
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.photo-card')).transform === 'none');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(() => window.p2.film());
  await card.hover();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4);
  assert.equal(await card.locator('img').evaluate(el => getComputedStyle(el).transform), 'none', 'Film images never shift or crop inside the frame');
  await page.evaluate(() => window.p2.setView('explore'));
  assert.equal(await card.evaluate(el => el.style.transform), '', 'Leaving the gallery releases the hover layer');
  await page.setViewportSize({width:390,height:844});
  const panel = page.locator('.curation-panel');
  await page.waitForFunction(() => document.querySelector('.curation-panel').dataset.mobile === 'true');
  await page.waitForFunction(() => !document.querySelector('.curation-panel').dataset.animating);
  await page.getByRole('button', {name:'展开地点列表',exact:true}).click();
  await page.waitForFunction(() => document.querySelector('.curation-panel').dataset.animating === 'true');
  const scales = await panel.evaluate(el => {
    const matrix = getComputedStyle(el).transform;
    const body = getComputedStyle(el.querySelector('.curation-panel-body')).transform;
    return {outer: new DOMMatrix(matrix).m22, inner: new DOMMatrix(body).m22,
      focusTop: Number(el.dataset.focusTop),
      transition:getComputedStyle(el).transitionProperty};
  });
  assert.ok(Math.abs(scales.outer * scales.inner - 1) < 0.015, 'Panel resizing preserves text proportions');
  assert.equal(scales.transition, 'none', 'No parallel CSS height transition');
  await page.waitForFunction(() => !document.querySelector('.curation-panel').dataset.animating);
  assert.ok(Math.abs((await panel.boundingBox()).y - scales.focusTop) < 0.5,
    'The camera anchor during motion matches the settled sheet top');
  await page.evaluate(async () => {
    window.p2.setCollapsed(true); await new Promise(requestAnimationFrame);
    window.p2.setCollapsed(false);
  });
  await page.waitForFunction(() => !document.querySelector('.curation-panel').dataset.animating);
  assert.equal(await panel.getAttribute('data-sheet-state'),'expanded');
  const search = page.getByRole('searchbox',{name:'搜索地点'});
  await search.focus();
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport,'height',{configurable:true,get:()=>460});
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(() => Number.parseFloat(document.querySelector('.curation-panel').style.getPropertyValue('--curation-keyboard-inset')) > 300);
  assert.ok((await search.boundingBox()).y < 400);
  assert.equal(await panel.getAttribute('data-animating'), null, 'Keyboard avoidance snaps directly to the visible area');
  await page.evaluate(() => window.p2.setCollapsed(true));
  await page.waitForFunction(() => document.querySelector('.curation-panel').dataset.sheetState === 'peek');
  assert.equal(await panel.getAttribute('data-animating'), null, 'Resizing with the keyboard still open snaps too');
  await page.evaluate(() => window.p2.setCollapsed(false));
  await page.waitForFunction(() => document.querySelector('.curation-panel').dataset.sheetState === 'expanded');
  await page.evaluate(() => {delete window.visualViewport.height; window.visualViewport.dispatchEvent(new Event('resize'))});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(() => window.p2.setCollapsed(true));
  await page.waitForFunction(() => document.querySelector('.curation-panel').dataset.sheetState === 'peek');
  assert.equal(await panel.getAttribute('data-animating'), null);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(() => window.p2.setCollapsed(false));
  await page.waitForFunction(() => !document.querySelector('.curation-panel').dataset.animating);
  await mkdir('.artifacts/motion', {recursive:true});
  await page.screenshot({path:'.artifacts/motion/p2-panel.png'});
  await page.evaluate(() => window.markerTest.start(200));
  await page.waitForFunction(() => [...document.querySelectorAll('.test-dot')].every(el=>getComputedStyle(el).opacity==='1'), null, {timeout:1500});
  assert.ok(await page.locator('.test-dot').first().evaluate(el=>el.parentElement.style.transform==='translate(12px, 20px)'));
  await page.evaluate(() => {window.markerTest.start(200); window.markerTest.finish()});
  assert.ok(await page.locator('.test-dot').last().evaluate(el=>getComputedStyle(el).opacity==='1'));
  await page.evaluate(() => window.markerTest.start(200, false));
  assert.ok(await page.locator('.test-dot').last().evaluate(el=>getComputedStyle(el).opacity==='1'));
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(() => window.markerTest.start(200));
  assert.ok(await page.locator('.test-dot').last().evaluate(el=>getComputedStyle(el).opacity==='1'));
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(() => window.markerTest.start(200));
  await page.evaluate(() => window.markerTest.dispose());
  await page.evaluate(() => window.p2.setMounted(false));
  await page.waitForFunction(() => window.p2.animations() === 0);
  assert.deepEqual(errors,[]);
  console.log('P2 motion passed: reused hover tweens and bounds, idle layers, film composition, compensated panel transforms, interruptions, keyboard/reduced motion, bounded 200-marker reveal and cleanup.');
  await context.close();
} finally {await browser.close();}

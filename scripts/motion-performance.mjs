import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Run against the same fixture before/after changes. Counts are deterministic;
// timing samples describe this browser run, not a device-wide FPS guarantee.
const label = process.argv[2] || 'current';
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error('Use an alphanumeric benchmark label.');
const baseUrl = process.env.UI_BASE_URL || 'http://127.0.0.1:5173';
const directory = '.artifacts/motion';
const { outputFiles } = await build({
  stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
    import React, {useRef, useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {CurationPanel} from './src/pages/gallery/components/CurationPanel';
    import {PhotoGrid} from './src/pages/gallery/components/PhotoGrid';
    import {useLightboxImageMotion} from './src/hooks/useLightboxImageMotion';
    const photos=Array.from({length:240},(_,i)=>({id:String(i),title:'Photo '+i,
      image:'/__motion-perf-image__.svg?'+i,category:'film',filmStock:'Fuji C200'}));
    const groups=[{id:'province',title:'Places',items:[{id:'city',label:'City',
      image:photos[0].image,photos:photos.slice(0,48),photoCount:48}]}];
    function Harness(){
      const [view,setView]=useState('explore'),[rows,setRows]=useState(photos);
      const [film,setFilm]=useState(false),[filter,setFilter]=useState('latest');
      const [photo,setPhoto]=useState(null);
      const load=useRef(null),prepare=useRef(null),image=useRef(null),media=useRef(null);
      const switchImage=useLightboxImageMotion(photo?.id,photo?.image,false,image,media);
      window.perfFixture={setView,film(){document.documentElement.dataset.theme='darkroom';setFilm(true)},
        reorder(){prepare.current?.('random');setFilter(f=>f==='latest'?'random':'latest');
          setRows(p=>p.map((_,i)=>p[i^1]))},
        next(i){switchImage(1);setPhoto(photos[i])}};
      return <>
        <section id="explore-view" hidden={view!=='explore'} style={{height:'100vh'}}>
          <CurationPanel isActive={view==='explore'} groups={groups} isLoading={false}
            expandedCategories={{province:true}} onToggleCategory={()=>{}} onCityClick={()=>{}}
            onPhotoClick={()=>{}} activeCitySelection={null} isPanelCollapsed={false} onTogglePanelCollapse={()=>{}}/>
        </section>
        <div hidden={view!=='grid'}><PhotoGrid photos={rows} likedPhotoIds={[]} isActive={view==='grid'}
          filmFrames={film} filterKey={filter} prepareLayoutRef={prepare} onPhotoClick={()=>{}}
          onToggleLike={()=>{}} hasMore={false} isLoadingMore={false} onLoadMore={()=>{}}
          loadMoreRef={load} totalCount={rows.length}/></div>
        <div ref={media} style={{position:'fixed',top:0,left:0,width:240,height:160,pointerEvents:'none'}}>
          {photo&&<img key={photo.id} ref={image} src={photo.image} style={{width:'100%',height:'100%'}}/>}
        </div>
      </>;
    }
    createRoot(document.getElementById('fixture')).render(<Harness/>);
  ` }, bundle: true, write: false, format: 'esm', loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' },
});
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await context.route('**/__motion-perf__', route => route.fulfill({ contentType: 'text/html', body: `
    <html data-theme="paper"><head><link rel="stylesheet" href="/src/App.css">
    <link rel="stylesheet" href="/src/themes/themes.css"><link rel="stylesheet" href="/src/themes/darkroom.css">
    <link rel="stylesheet" href="/src/pages/gallery/components/CurationPanel.css">
    <style>[hidden]{display:none!important}.gallery-grid{margin:24px}</style></head>
    <body><div class="app-shell"><div id="fixture"></div></div><script type="module" src="/__motion-perf__.js"></script></body></html>` }));
  await context.route('**/__motion-perf__.js', route => route.fulfill({ contentType: 'text/javascript', body: outputFiles[0].text }));
  await context.route('**/__motion-perf-image__.svg*', route => route.fulfill({ contentType: 'image/svg+xml', body:
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><path fill="#94785c" d="M0 0h600v400H0z"/></svg>' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,blink.user_timing', transferMode: 'ReturnAsStream' });
  await page.goto(`${baseUrl}/__motion-perf__`);
  await page.locator('.curation-card img.loaded').waitFor();
  const pointer = await page.locator('.curation-card').evaluate(async card => {
    const rect = card.getBoundingClientRect();
    let reads = 0;
    const original = card.getBoundingClientRect.bind(card);
    card.getBoundingClientRect = () => { reads++; return original(); };
    const frames = [], start = performance.now();
    let previous = start;
    card.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse', clientX: rect.x + 20, clientY: rect.y + 20 }));
    for (let i = 0; i < 24; i++) {
      await new Promise(requestAnimationFrame);
      const now = performance.now(); frames.push(now - previous); previous = now;
      for (let j = 0; j < 5; j++) {
        const options = { bubbles: true, pointerType: 'mouse', clientX: rect.x + rect.width * (0.2 + (i % 12) / 20), clientY: rect.y + rect.height * 0.4 };
        card.dispatchEvent(new PointerEvent('pointermove', options));
        card.dispatchEvent(new MouseEvent('mousemove', options));
      }
    }
    card.getBoundingClientRect = original;
    return { events: 120, layoutReads: reads, frameP95Ms: frames.sort((a,b)=>a-b)[Math.floor(frames.length*.95)], elapsedMs: performance.now()-start };
  });
  await page.evaluate(() => window.perfFixture.setView('grid'));
  await page.waitForFunction(() => [...document.querySelectorAll('.photo-card')].every(card => card.style.opacity === ''));
  const reorder = {};
  for (const [position, scrollTop] of [['top', 0], ['deep', 8000]]) {
    await page.evaluate(top => scrollTo(0, top), scrollTop);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    reorder[position] = [];
    for (let i = 0; i < 5; i++) {
      reorder[position].push(await page.evaluate(() => {
        const { getBoundingClientRect } = Element.prototype;
        let cardBoundsReads = 0;
        Element.prototype.getBoundingClientRect = function () {
          if (this.matches('.photo-card')) cardBoundsReads++;
          return getBoundingClientRect.call(this);
        };
        try {
          window.perfFixture.reorder();
          return cardBoundsReads;
        } finally {
          Element.prototype.getBoundingClientRect = getBoundingClientRect;
        }
      }));
      if (i === 0) await page.waitForFunction(() => document.querySelector('[data-layout-motion]'));
      await page.waitForTimeout(40);
    }
    await page.waitForFunction(() => !document.querySelector('[data-layout-motion]'));
  }
  await page.evaluate(() => scrollTo(0, 0));
  for (let i = 0; i < 6; i++) { await page.evaluate(i => window.perfFixture.next(i), i); await page.waitForTimeout(40); }
  await page.evaluate(() => window.perfFixture.film());
  await page.waitForFunction(() => {
    const visible = [...document.querySelectorAll('.film-negative > img')].filter(image => {
      const rect = image.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
    });
    return visible.length === 16 && visible.every(image => image.closest('[data-film-developing]'));
  });
  const film = await page.evaluate(async () => {
    const grid = document.querySelector('.gallery-grid');
    let scans = 0;
    let frameStyleWrites = 0;
    const original = grid.querySelectorAll.bind(grid);
    const { setProperty } = CSSStyleDeclaration.prototype;
    CSSStyleDeclaration.prototype.setProperty = function (name, ...args) {
      if (name === '--film-emulsion-opacity' || name === '--film-grain-opacity') frameStyleWrites++;
      return setProperty.call(this, name, ...args);
    };
    grid.querySelectorAll = selector => { if (selector === '.film-negative > img') scans++; return original(selector); };
    const startCount = grid.querySelectorAll('[data-film-developing]').length;
    performance.mark('film-sample-start');
    try {
      for (let i = 0; i < 24; i++) {
        grid.querySelector('.photo-card').classList.toggle('benchmark-update');
        await new Promise(requestAnimationFrame);
      }
    } finally {
      performance.mark('film-sample-end');
      grid.querySelectorAll = original;
      CSSStyleDeclaration.prototype.setProperty = setProperty;
    }
    return { unrelatedClassUpdates: 24, fullGridScans: scans, frameStyleWrites,
      developingAtStart: startCount, developing: grid.querySelectorAll('[data-film-developing]').length };
  });
  const ended = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.end');
  const { stream } = await ended;
  let trace = '';
  for (;;) { const chunk = await cdp.send('IO.read', { handle: stream }); trace += chunk.data; if (chunk.eof) break; }
  await cdp.send('IO.close', { handle: stream });
  await writeFile(`${directory}/performance-${label}.trace.json`, trace);
  const { traceEvents } = JSON.parse(trace);
  const start = traceEvents.find(event => event.name === 'film-sample-start');
  const end = traceEvents.find(event => event.name === 'film-sample-end');
  if (!start || !end) throw new Error('Film sample markers are missing from the trace');
  const filmMainThreadMs = {};
  for (const name of ['UpdateLayoutTree', 'Layout', 'Paint']) {
    const duration = traceEvents.filter(event => event.name === name && event.pid === start.pid
      && event.tid === start.tid && event.ts >= start.ts && event.ts < end.ts)
      .reduce((sum, event) => sum + (event.dur || 0), 0);
    filmMainThreadMs[name] = Math.round(duration / 100) / 10;
  }
  const report = { label, viewport: '1200x900', galleryCards: 240, pointer, reorder, film, filmMainThreadMs, errors };
  await writeFile(`${directory}/performance-${label}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (errors.length) throw new Error(errors.join('\n'));
  await context.close();
} finally { await browser.close(); }

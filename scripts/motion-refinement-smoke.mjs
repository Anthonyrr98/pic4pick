import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const baseUrl = process.env.UI_BASE_URL || 'http://127.0.0.1:5173';
const { outputFiles } = await build({
  stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
    import React, {StrictMode,useRef,useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {gsap} from 'gsap';
    import {CurationPanel} from './src/pages/gallery/components/CurationPanel';
    import {useViewTransition} from './src/hooks/useViewTransition';
    import {useLightboxImageMotion} from './src/hooks/useLightboxImageMotion';
    const photos=Array.from({length:4},(_,i)=>({id:String(i),title:'Decode '+i,image:'/__refinement-image__/'+i+'.svg'}));
    const groups=[{id:'province',title:'Province',items:[{id:'city',label:'City',
      image:photos[0].image,photos,photoCount:4}]}];
    function App(){
      const [mounted,setMounted]=useState(true);window.unmountRefinement=()=>setMounted(false);
      return mounted&&<Harness/>;
    }
    function Harness(){
      const [view,setView]=useState('gallery-view'),[collapsed,setCollapsed]=useState(false);
      const [photo,setPhoto]=useState(null),[open,setOpen]=useState(true);
      const root=useRef(null),image=useRef(null),media=useRef(null);
      const transition=useViewTransition(root,view,setView);
      const prepare=useLightboxImageMotion(photo?.id,photo?.image,false,image,media,open);
      window.refinement={transition,setCollapsed,setOpen,
        next(i){prepare(1);setPhoto(photos[i])},
        animations:()=>gsap.globalTimeline.getChildren(true,true,true).length,
        imageTweens:()=>gsap.getTweensOf(image.current,true).length};
      return <div ref={root} className="app-shell">
        <nav style={{position:'fixed',top:0,left:0,zIndex:100}}>
          {['gallery-view','explore-view'].map(name=><button key={name} data-view-target={name}
            aria-pressed={view===name} onClick={()=>transition(name)}>{name}</button>)}
        </nav>
        <div data-view-screen="gallery-view" hidden={view!=='gallery-view'} style={{height:2400,paddingTop:60}}>
          <button id="gallery-focus">Gallery focus</button>
        </div>
        <div data-view-screen="explore-view" hidden={view!=='explore-view'}>
          <section id="explore-view" style={{height:'100vh',minHeight:0}}>
            <div className="map-instance"/>
            <CurationPanel isActive={view==='explore-view'} groups={groups} isLoading={false}
              expandedCategories={{province:true}} onToggleCategory={()=>{}} onCityClick={()=>{}}
              onPhotoClick={()=>{}} activeCitySelection={null} isPanelCollapsed={collapsed}
              onTogglePanelCollapse={()=>setCollapsed(value=>!value)}/>
          </section>
        </div>
        <div ref={media} className="decode-stage" style={{position:'fixed',right:0,top:50,width:240,height:160,pointerEvents:'none'}}>
          {photo&&<img key={photo.id} ref={image} data-decode-photo={photo.id} src={photo.image}
            style={{width:'100%',height:'100%',objectFit:'contain'}}/>}
        </div>
      </div>;
    }
    createRoot(document.getElementById('fixture')).render(<StrictMode><App/></StrictMode>);
  ` }, bundle: true, write: false, format: 'esm', loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' },
});
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await context.addInitScript(() => {
    const decode = HTMLImageElement.prototype.decode;
    window.decodeRequests = [];
    HTMLImageElement.prototype.decode = function () {
      if (!this.hasAttribute('data-decode-photo')) return decode.call(this);
      return new Promise(resolve => window.decodeRequests.push({ id: this.dataset.decodePhoto, resolve }));
    };
    window.resolveDecode = id => window.decodeRequests.filter(request => request.id === id).forEach(request => request.resolve());
  });
  await context.route('**/__refinement-test__', route => route.fulfill({ contentType: 'text/html', body: `
    <html data-theme="paper"><head><meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/src/App.css"><link rel="stylesheet" href="/src/themes/themes.css">
    <link rel="stylesheet" href="/src/pages/gallery/components/CurationPanel.css">
    <style>[hidden]{display:none!important}body{margin:0}</style></head>
    <body><div id="fixture"></div><script type="module" src="/__refinement-fixture__.js"></script></body></html>` }));
  await context.route('**/__refinement-fixture__.js', route => route.fulfill({ contentType: 'text/javascript', body: outputFiles[0].text }));
  await context.route('**/__refinement-image__/*', route => route.fulfill({ contentType: 'image/svg+xml', body:
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><path fill="#94785c" d="M0 0h600v400H0z"/></svg>' }));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseUrl}/__refinement-test__`);
  await page.locator('#gallery-focus').focus();
  await page.evaluate(() => { window.savedMap = document.querySelector('.map-instance'); window.refinement.transition('explore-view'); });
  await page.waitForFunction(() => !document.querySelector('[data-view-screen="explore-view"]').hidden && !document.querySelector('[data-view-transition]'));
  assert.equal(await page.locator('[data-view-target="explore-view"]').evaluate(node => node === document.activeElement), true,
    'Programmatic view changes move focus out of the outgoing inert view');
  await page.waitForFunction(() => !document.querySelector('.curation-panel').dataset.animating);
  const city = page.locator('.curation-card');
  await city.hover();
  const box = await city.boundingBox();
  const initialTweens = await city.evaluate(node => {
    window.cityReads = 0;
    const measure = node.getBoundingClientRect.bind(node);
    node.getBoundingClientRect = () => { window.cityReads++; return measure(); };
    return window.refinement.animations();
  });
  for (let i = 0; i < 30; i++) await page.mouse.move(box.x + box.width * (0.3 + i / 100), box.y + box.height * 0.4);
  assert.equal(await page.evaluate(() => window.cityReads), 0, 'City pointer tracking reuses its entry bounds');
  assert.ok(await page.evaluate(() => window.refinement.animations()) <= initialTweens, 'City tracking reuses its tweens');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => !document.querySelector('.curation-card').hasAttribute('data-motion-hover'));
  assert.equal(await city.evaluate(node => node.style.transform), '', 'Reduced motion immediately releases city transforms');
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6);
  assert.equal(await city.getAttribute('data-motion-hover'), null);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await city.hover();
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => !document.querySelector('.curation-card').hasAttribute('data-motion-hover'));
  assert.equal(await city.evaluate(node => getComputedStyle(node).willChange), 'auto');

  // Reverse an unfinished leave, then interrupt an unfinished arrival.
  await page.evaluate(async () => {
    window.refinement.transition('gallery-view'); await new Promise(requestAnimationFrame);
    window.refinement.transition('explore-view');
  });
  await page.waitForFunction(() => !document.querySelector('[data-view-transition]'));
  assert.equal(await page.locator('[data-view-screen="explore-view"]').evaluate(node => node.hidden || node.inert), false);
  await page.evaluate(() => window.refinement.transition('gallery-view'));
  await page.waitForFunction(() => !document.querySelector('[data-view-screen="gallery-view"]').hidden);
  await page.evaluate(() => window.refinement.transition('explore-view'));
  await page.waitForFunction(() => !document.querySelector('[data-view-screen="explore-view"]').hidden && !document.querySelector('[data-view-transition]'));
  assert.equal(await page.evaluate(() => window.savedMap === document.querySelector('.map-instance')), true, 'View transitions retain the map DOM');
  assert.ok(await page.locator('[data-view-screen]').evaluateAll(nodes => nodes.every(node => node.style.opacity === '')));

  await page.evaluate(() => window.refinement.transition('gallery-view'));
  await page.waitForFunction(() => !document.querySelector('[data-view-transition]'));
  await page.evaluate(() => window.scrollTo(0, 700));
  await page.evaluate(() => window.refinement.transition('explore-view'));
  await page.waitForFunction(() => !document.querySelector('[data-view-screen="explore-view"]').hidden && !document.querySelector('[data-view-transition]'));
  await page.evaluate(() => window.refinement.transition('gallery-view'));
  await page.waitForFunction(() => !document.querySelector('[data-view-screen="gallery-view"]').hidden && !document.querySelector('[data-view-transition]'));
  assert.ok(await page.evaluate(() => Math.abs(window.scrollY - 700) < 2), 'Returning to the gallery restores its scroll position');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.refinement.transition('explore-view'));
  await page.waitForFunction(() => !document.querySelector('[data-view-screen="explore-view"]').hidden && !document.querySelector('[data-view-transition]'));
  await page.getByRole('button', { name: '展开地点列表', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.curation-panel').dataset.animating === 'true');
  await page.evaluate(() => window.refinement.transition('gallery-view'));
  await page.waitForFunction(() => document.querySelector('[data-view-screen="explore-view"]').hidden);
  assert.equal(await page.locator('.curation-panel').getAttribute('data-animating'), null, 'Hiding a resizing panel cancels its animation');
  assert.equal(await page.locator('.curation-panel-body').evaluate(node => node.style.transform), '');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => window.refinement.transition('explore-view'));
  await page.waitForFunction(() => !document.querySelector('[data-view-screen="explore-view"]').hidden);
  assert.equal(await page.locator('[data-view-transition]').count(), 0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // Hold decoding independently of load to exercise late promises and closing.
  await page.evaluate(() => window.refinement.next(0));
  await page.waitForFunction(() => window.decodeRequests.some(request => request.id === '0'));
  assert.equal(await page.locator('[data-decode-photo="0"]').evaluate(node => getComputedStyle(node).opacity), '0');
  await page.evaluate(() => window.resolveDecode('0'));
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-decode-photo="0"]')).opacity === '1');
  await page.evaluate(() => window.refinement.next(1));
  await page.waitForFunction(() => window.decodeRequests.some(request => request.id === '1'));
  assert.equal(await page.locator('.lightbox-outgoing-image').count(), 1);
  await page.evaluate(() => window.refinement.next(2));
  await page.waitForFunction(() => window.decodeRequests.some(request => request.id === '2'));
  await page.evaluate(() => window.resolveDecode('1'));
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.locator('[data-decode-photo="2"]').evaluate(node => getComputedStyle(node).opacity), '0', 'A stale decode cannot reveal the new photo');
  await page.evaluate(() => window.resolveDecode('2'));
  await page.locator('.lightbox-outgoing-image').waitFor({ state: 'detached' });
  assert.equal(await page.locator('[data-decode-photo="2"]').evaluate(node => getComputedStyle(node).opacity), '1');
  const decodes = await page.evaluate(() => window.decodeRequests.length);
  for (const reducedMotion of ['reduce', 'no-preference']) {
    await page.emulateMedia({ reducedMotion });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await page.locator('[data-decode-photo="2"]').evaluate(node => getComputedStyle(node).opacity), '1',
      'Changing motion preferences does not replay a visible photograph');
    assert.equal(await page.evaluate(() => window.decodeRequests.length), decodes);
  }
  await page.evaluate(() => window.refinement.next(3));
  await page.waitForFunction(() => window.decodeRequests.some(request => request.id === '3'));
  await page.evaluate(() => window.refinement.setOpen(false));
  await page.locator('.lightbox-outgoing-image').waitFor({ state: 'detached' });
  await page.evaluate(() => window.resolveDecode('3'));
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.evaluate(() => window.refinement.imageTweens()), 0, 'Closing cancels pending image reveals');
  await mkdir('.artifacts/motion', { recursive: true });
  await page.screenshot({ path: '.artifacts/motion/refined-mobile.png' });
  await page.evaluate(() => window.unmountRefinement());
  await page.waitForFunction(() => window.refinement.animations() === 0);
  assert.deepEqual(errors, []);
  console.log('Motion refinements passed: bounded city tracking, reduced motion, reversible view fades, focus/scroll/map retention, hidden panel cleanup, stale decode/close cancellation and StrictMode cleanup.');
  await context.close();
} finally { await browser.close(); }

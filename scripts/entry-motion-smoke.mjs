import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const baseUrl = (process.env.UI_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const errors = [];
const { outputFiles } = await build({
  stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
    import React, {StrictMode, useRef, useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {gsap} from 'gsap';
    import {PhotoGrid} from './src/pages/gallery/components/PhotoGrid';
    import {EntryMotionContext} from './src/contexts/EntryMotionContext';
    function Harness() {
      const [photos,setPhotos] = useState(Array.from({length:4},(_,i)=>({id:String(i),title:'Entry '+i,image:'/__entry-image__.svg',likes:0})));
      const [active,setActive] = useState(true);
      const [ready,setReady] = useState(false);
      const [mounted,setMounted] = useState(true);
      const ref=useRef(null);
      window.entry={setReady,setActive,setMounted,
        refresh:()=>setPhotos(rows=>rows.map(row=>({...row,likes:1}))),
        reverse:()=>setPhotos(rows=>[...rows].reverse()),
        replace:()=>setPhotos(rows=>rows.map(row=>row.id==='0'?{...row,image:'/__entry-image__-new.svg'}:row)),
        append:id=>setPhotos(rows=>[...rows,{id,title:'Entry '+id,image:'/__entry-image__.svg'}]),
        animations:()=>gsap.globalTimeline.getChildren(true,true,true).length};
      return mounted && <EntryMotionContext.Provider value={ready}><PhotoGrid photos={photos}
        isActive={active} likedPhotoIds={[]} onPhotoClick={()=>{}} onToggleLike={()=>{}}
        hasMore={false} isLoadingMore={false} onLoadMore={()=>{}} loadMoreRef={ref} totalCount={photos.length}/></EntryMotionContext.Provider>;
    }
    createRoot(document.getElementById('fixture')).render(<StrictMode><Harness/></StrictMode>);
  ` }, bundle:true,write:false,format:'esm',loader:{'.css':'empty'},
  define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'},
});
const browser = await chromium.launch({headless:true});
try {
  const fixtureContext = await browser.newContext({viewport:{width:1200,height:900}});
  await fixtureContext.route('**/__entry-test__',route=>route.fulfill({contentType:'text/html',body:`
    <html data-theme="paper"><head><link rel="stylesheet" href="/src/App.css"><link rel="stylesheet" href="/src/themes/themes.css"></head>
    <body><div class="app-shell"><main><div id="fixture"></div></main></div><script type="module" src="/__entry-fixture__.js"></script></body></html>`}));
  await fixtureContext.route('**/__entry-fixture__.js',route=>route.fulfill({contentType:'text/javascript',body:outputFiles[0].text}));
  await fixtureContext.route('**/__entry-image__*',route=>route.fulfill({contentType:'image/svg+xml',body:
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><path fill="#778f83" d="M0 0h600v400H0z"/></svg>'}));
  const fixture = await fixtureContext.newPage();
  fixture.on('pageerror',error=>errors.push(error.message));
  await fixture.goto(`${baseUrl}/__entry-test__`);
  await fixture.locator('.photo-card').first().waitFor();
  assert.equal(await fixture.locator('.photo-card').first().evaluate(el=>el.style.opacity),'','Intro readiness gates gallery entry');
  await fixture.evaluate(()=>window.entry.setReady(true));
  await fixture.waitForFunction(()=>[...document.querySelectorAll('.photo-card')].some(el=>el.style.opacity!==''));
  await fixture.waitForFunction(()=>[...document.querySelectorAll('.photo-card')].every(el=>el.style.opacity===''));
  const existingVisible = async () => assert.ok(await fixture.locator('.photo-card').evaluateAll(cards=>cards
    .filter(card=>card.dataset.photoId!=='new'&&card.dataset.photoId!=='hidden').every(card=>card.style.opacity==='')),
    'Existing cards must stay visible through data and source changes');
  for (const action of ['refresh','reverse','replace']) {
    await fixture.evaluate(name=>window.entry[name](),action);
    await fixture.evaluate(()=>new Promise(requestAnimationFrame));
    await existingVisible();
  }
  await fixture.evaluate(()=>window.entry.append('new'));
  await fixture.waitForFunction(()=>document.querySelector('[data-photo-id="new"]')?.style.opacity!=='');
  await existingVisible();
  await fixture.waitForFunction(()=>document.querySelector('[data-photo-id="new"]').style.opacity==='');
  await fixture.evaluate(()=>window.entry.setActive(false));
  await fixture.evaluate(()=>window.entry.append('hidden'));
  await fixture.evaluate(()=>new Promise(requestAnimationFrame));
  assert.equal(await fixture.locator('[data-photo-id="hidden"]').evaluate(el=>el.style.opacity),'');
  await fixture.evaluate(()=>window.entry.setActive(true));
  await fixture.waitForFunction(()=>document.querySelector('[data-photo-id="hidden"]')?.style.opacity!=='');
  await existingVisible();
  await fixture.emulateMedia({reducedMotion:'reduce'});
  await fixture.waitForFunction(()=>[...document.querySelectorAll('.photo-card')].every(el=>el.style.opacity===''));
  await fixture.evaluate(()=>window.entry.setMounted(false));
  await fixture.waitForFunction(()=>window.entry.animations()===0);
  await fixtureContext.close();

  const photos = [1,2].map(number=>({id:'entry-'+number,title:'Opening '+number,
    status:'approved',hidden:false,category:'latest',image_url:'https://entry-images.invalid/photo.svg'}));
  const setup = async ({reduced=false,unavailable=false,seen=false}={}) => {
    const context=await browser.newContext({viewport:{width:1200,height:900},reducedMotion:reduced?'reduce':'no-preference'});
    await context.addInitScript(({unavailable,seen})=>{
      localStorage.setItem('pic4pick_env_overrides',JSON.stringify({VITE_SUPABASE_URL:'https://entry-data.invalid',
        VITE_SUPABASE_ANON_KEY:'sb_publishable_fixture',VITE_API_BASE_URL:'https://entry-api.invalid'}));
      if(seen)sessionStorage.setItem('pic4pick_intro_seen','1');
      if(unavailable){
        const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
        Storage.prototype.getItem=function(key){if(this===sessionStorage&&key==='pic4pick_intro_seen')throw new Error('Unavailable');return get.call(this,key)};
        Storage.prototype.setItem=function(key,value){if(this===sessionStorage&&key==='pic4pick_intro_seen')throw new Error('Unavailable');return set.call(this,key,value)};
      }
    },{unavailable,seen});
    await context.route('https://entry-data.invalid/**',route=>route.fulfill({json:[]}));
    await context.route('**/rest/v1/photos?**',route=>route.fulfill({json:photos}));
    await context.route('https://entry-api.invalid/**',route=>route.fulfill({json:{}}));
    await context.route('https://entry-images.invalid/**',route=>route.fulfill({contentType:'image/svg+xml',body:
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><path fill="#778f83" d="M0 0h600v400H0z"/></svg>'}));
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    return {context,page};
  };

  const initial=await setup();
  let releaseRoute;
  const routeReady=new Promise(resolve=>{releaseRoute=resolve});
  await initial.context.route('**/src/pages/Gallery.jsx*',async route=>{await routeReady;await route.continue()});
  try {
    await initial.page.goto(baseUrl,{waitUntil:'domcontentloaded'});
    await initial.page.locator('.app-intro').waitFor();
    await initial.page.waitForTimeout(1150);
    assert.equal(await initial.page.locator('.app-loading-screen').count(),1,'Initial loading never stacks two screens');
    assert.equal(await initial.page.locator('.app-intro').evaluate(el=>getComputedStyle(el).opacity),'1','Intro waits for the lazy page instead of revealing a blank route');
    releaseRoute();
    await initial.page.locator('.app-intro').waitFor({state:'detached'});
    await initial.page.locator('.photo-card').first().waitFor();
    await initial.page.waitForFunction(()=>document.querySelector('.app-header').style.opacity==='');
    await initial.page.reload({waitUntil:'networkidle'});
    assert.equal(await initial.page.locator('.app-intro').count(),0,'Same-session navigation skips the intro');
    const trigger=initial.page.getByRole('button',{name:/切换主题/});
    await trigger.click();
    const menu=initial.page.locator('.theme-popover');
    await menu.waitFor();
    await initial.page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.theme-popover')).opacity)===1);
    await initial.page.evaluate(()=>{window.savedMenu=document.querySelector('.theme-popover')});
    await initial.page.keyboard.press('Escape');
    assert.equal(await menu.getAttribute('data-state'),'closing');
    assert.equal(await menu.getAttribute('inert'),'','Closing menu cannot retain interactive controls');
    await trigger.evaluate(el=>el.click());
    await initial.page.waitForFunction(()=>document.querySelector('.theme-popover')?.dataset.state==='open');
    assert.ok(await initial.page.evaluate(()=>window.savedMenu===document.querySelector('.theme-popover')),'Reopening reverses the mounted menu');
    await initial.page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.theme-popover')).opacity)===1);
    await initial.page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'pic4pick_theme',newValue:'film'})));
    await initial.page.waitForFunction(()=>document.documentElement.dataset.theme==='film');
    assert.ok(await menu.evaluate(el=>Number(getComputedStyle(el).opacity)>0.98),'Changing a theme does not replay menu entry');
    await mkdir('.artifacts/motion',{recursive:true});
    await initial.page.screenshot({path:'.artifacts/motion/p3-menu.png'});
    await initial.page.keyboard.press('Escape');
    await menu.waitFor({state:'detached'});
    assert.ok(await trigger.evaluate(el=>el===document.activeElement));
    await initial.page.emulateMedia({reducedMotion:'reduce'});
    await trigger.click();
    assert.equal(await menu.evaluate(el=>getComputedStyle(el).opacity),'1');
    await initial.page.keyboard.press('Escape');
    await menu.waitFor({state:'detached'});
    await initial.page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'pic4pick_theme',newValue:'paper'})));
    await initial.page.waitForFunction(()=>document.documentElement.dataset.theme==='paper');
    await initial.page.emulateMedia({reducedMotion:'no-preference'});
    await initial.page.evaluate(()=>new Promise(requestAnimationFrame));
    assert.equal(await initial.page.locator('.theme-transition-wash').evaluate(el=>getComputedStyle(el).opacity),'0',
      'A theme change skipped during reduced motion does not replay later');
  } finally {releaseRoute();await initial.context.close()}

  const changing=await setup();
  let releaseChanging;
  const changingReady=new Promise(resolve=>{releaseChanging=resolve});
  await changing.context.route('**/src/pages/Gallery.jsx*',async route=>{await changingReady;await route.continue()});
  try {
    await changing.page.goto(baseUrl,{waitUntil:'domcontentloaded'});
    await changing.page.locator('.app-intro').waitFor();
    await changing.page.emulateMedia({reducedMotion:'reduce'});
    await changing.page.locator('.app-intro').waitFor({state:'detached'});
    assert.equal(await changing.page.locator('.app-loading-screen').count(),1,'Preference changes hand off to one loading screen');
    releaseChanging();
    await changing.page.locator('.app-loading-screen').waitFor({state:'detached'});
    await changing.page.locator('.photo-card').first().waitFor();
  } finally {releaseChanging();await changing.context.close()}

  for(const options of [{reduced:true},{unavailable:true}]){
    const {context,page}=await setup(options);
    await page.goto(baseUrl,{waitUntil:'networkidle'});
    await page.locator('.app-loading-screen').waitFor({state:'detached'});
    await page.locator('.photo-card').first().waitFor();
    assert.equal(await page.locator('.app-intro').count(),0);
    await context.close();
  }
  const admin=await setup();
  await admin.page.goto(`${baseUrl}/#/admin`,{waitUntil:'networkidle'});
  await admin.page.getByLabel('管理员用户名').waitFor();
  assert.equal(await admin.page.locator('.app-intro').count(),0,'Admin route never waits for the brand intro');
  await admin.context.close();
  assert.deepEqual(errors,[]);
  console.log('P3 motion passed: one intro/lazy-page handoff, session/admin/storage/reduced motion, StrictMode entry, refresh/reorder/source replacement, new-photo-only entry, reversible menu, theme changes, focus and cleanup.');
} finally {await browser.close()}

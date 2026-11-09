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
    const stocks = ['Fuji C200','Kodak Gold 200','富士一次性相机','FUJIFILM SIMPLE ACE 400'];
    const initial = Array.from({length:18},(_,i)=>({id:String(i),title:'Print '+i,
      image:'/__p4-image__/'+i+'.svg',category:'film',filmStock:stocks[i%4],likes:0}));
    function Harness() {
      const [photos,setPhotos] = useState(initial.slice(0,6));
      const [filter,setFilter] = useState('latest');
      const [film,setFilm] = useState(false);
      const [active,setActive] = useState(true);
      const [mounted,setMounted] = useState(true);
      const prepare=useRef(null),load=useRef(null);
      window.p4={
        reorder:()=>{prepare.current?.('random');setFilter(f=>f==='latest'?'random':'latest');setPhotos(p=>[...p].reverse())},
        refresh:()=>setPhotos(p=>p.map(row=>({...row,likes:1}))),
        append:()=>setPhotos(initial),
        prependFilm:()=>setPhotos(rows=>[{...initial[2],id:'new-film'},...rows]),
        removeNewFilm:()=>setPhotos(rows=>rows.filter(row=>row.id!=='new-film')),
        subset:()=>{prepare.current?.('far');setFilter('far');setPhotos(p=>p.filter(row=>Number(row.id)%2===0))},
        empty:()=>{prepare.current?.('nearby');setFilter('nearby');setPhotos([])},
        film:()=>{prepare.current?.('film');document.documentElement.dataset.theme='darkroom';setFilter('film');setFilm(true);setPhotos(initial)},
        setActive,setMounted,
        animations:()=>gsap.globalTimeline.getChildren(true,true,true).length
      };
      return mounted && <PhotoGrid photos={photos} likedPhotoIds={[]} isActive={active}
        onPhotoClick={()=>{}} onToggleLike={()=>{}} hasMore={false} isLoadingMore={false}
        onLoadMore={()=>{}} loadMoreRef={load} totalCount={photos.length} filmFrames={film}
        filterKey={filter} prepareLayoutRef={prepare}/>;
    }
    createRoot(document.getElementById('fixture')).render(<StrictMode><Harness/></StrictMode>);
  ` }, bundle:true, write:false, format:'esm',
  define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'},
});
const browser=await chromium.launch({headless:true});
const errors=[];
try {
  await mkdir('.artifacts/motion',{recursive:true});
  for (const mobile of [false,true]) {
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1200,height:1000},
      isMobile:mobile,hasTouch:mobile});
    await context.route('**/__p4-test__',route=>route.fulfill({contentType:'text/html',body:`
      <html data-theme="paper"><head><meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/src/App.css"><link rel="stylesheet" href="/src/themes/themes.css">
      <link rel="stylesheet" href="/src/themes/darkroom.css"></head>
      <body><div class="app-shell"><main><div id="fixture"></div></main></div>
      <script type="module" src="/__p4-fixture__.js"></script></body></html>`}));
    await context.route('**/__p4-fixture__.js',route=>route.fulfill({contentType:'text/javascript',body:outputFiles[0].text}));
    // Loaded-after-intersection and failed-image paths must both settle safely.
    await context.route('**/__p4-image__/*',async route=>{
      const id=Number(new URL(route.request().url()).pathname.split('/').pop().split('.')[0]);
      if(id===17)return route.fulfill({status:404,body:''});
      await new Promise(resolve=>setTimeout(resolve,id===2?180:20));
      await route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg"
        width="${id%2?400:600}" height="${id%2?600:400}"><path fill="#94785c" d="M0 0h600v600H0z"/></svg>`});
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(baseUrl+'/__p4-test__');
    await page.locator('.photo-card').first().waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('.photo-card')].every(c=>c.style.opacity===''));
    await page.locator('.photo-card').first().hover();
    const before=await page.locator('[data-photo-id="0"]').boundingBox();
    await page.evaluate(()=>window.p4.reorder());
    await page.waitForFunction(()=>document.querySelector('.gallery-grid').hasAttribute('data-layout-motion'));
    assert.equal(await page.locator('[data-motion-hover]').count(),0,'Reordering releases hover transforms');
    const moving=await page.locator('[data-photo-id="0"]').boundingBox();
    await page.waitForFunction(()=>!document.querySelector('.gallery-grid').hasAttribute('data-layout-motion'));
    const destination=await page.locator('[data-photo-id="0"]').boundingBox();
    const travelled=Math.hypot(moving.x-before.x,moving.y-before.y);
    const total=Math.hypot(destination.x-before.x,destination.y-before.y);
    assert.ok(travelled<total*0.75,'Flip starts near the old position, before settling at the new one');
    assert.equal(await page.locator('.photo-card').first().getAttribute('data-photo-id'),'5');
    assert.ok(await page.locator('.photo-card').evaluateAll(cards=>cards.every(c=>c.style.transform==='')));
    await page.evaluate(()=>window.p4.refresh());
    assert.equal(await page.locator('[data-layout-motion]').count(),0,'Data refresh does not animate layout');
    await page.evaluate(()=>window.p4.append());
    assert.equal(await page.locator('[data-layout-motion]').count(),0,'Pagination does not animate retained cards');
    for(let i=0;i<5;i++){
      await page.evaluate(()=>window.p4.reorder());
      await page.waitForTimeout(30);
    }
    await page.waitForFunction(()=>!document.querySelector('.gallery-grid').hasAttribute('data-layout-motion'));
    await page.evaluate(()=>window.p4.reorder());
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(()=>!document.querySelector('.gallery-grid').hasAttribute('data-layout-motion'));
    await page.evaluate(()=>window.p4.subset());
    assert.equal(await page.locator('[data-layout-motion]').count(),0);
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>window.p4.empty());
    assert.equal(await page.locator('.photo-card').count(),0);
    await page.evaluate(()=>window.p4.film());
    await page.waitForFunction(()=>document.querySelectorAll('[data-film-developing]').length>0);
    const concurrent=await page.waitForFunction(minimum=>{
      const images=[...document.querySelectorAll('.film-negative > img.loaded')].filter(image=>{
        const rect=image.getBoundingClientRect();
        return image.complete&&image.naturalWidth&&rect.bottom>0&&rect.top<innerHeight&&rect.right>0&&rect.left<innerWidth;
      });
      return images.length>=minimum&&images.every(image=>image.closest('[data-film-developing]'))
        ? {visible:images.length,playing:document.querySelectorAll('[data-film-developing]').length} : false;
    },mobile?1:3).then(handle=>handle.jsonValue());
    assert.equal(concurrent.playing,concurrent.visible,'All visible loaded prints develop together');
    // Record development until all initial visible prints finish.
    const admission=await page.evaluate(()=>new Promise(resolve=>{
      let maximum=0,filteredMaximum=0;
      const fade=[];
      const firstNegative=document.querySelector('.film-develop-negative');
      const started=performance.now();
      const sample=()=>{
        const frames=[...document.querySelectorAll('[data-film-developing]')];
        maximum=Math.max(maximum,frames.length);
        filteredMaximum=Math.max(filteredMaximum,frames.filter(f=>getComputedStyle(f.querySelector('img')).filter!=='none').length);
        if(firstNegative?.isConnected)fade.push(Number(getComputedStyle(firstNegative).opacity));
        if(performance.now()-started<3400)requestAnimationFrame(sample);else resolve({maximum,filteredMaximum,fade});
      };sample();
    }));
    assert.ok(admission.maximum>=concurrent.visible,'Visible prints never wait for a concurrency slot');
    if(!mobile)assert.ok(admission.maximum>2,'Desktop development is no longer limited to two prints');
    assert.equal(admission.filteredMaximum,0,'The original image never switches a negative filter on or off');
    assert.ok(admission.fade.some(value=>value>0.2&&value<0.8),'Colour emerges through a gradual negative-layer crossfade');
    assert.ok(admission.fade.every((value,index)=>index===0||value<=admission.fade[index-1]+0.001),'Negative layer fades continuously');
    assert.ok(admission.fade.at(-1)<0.01,'Negative layer is invisible before removal');
    assert.equal(await page.locator('.film-develop-layer').count(),0,'Completed development removes temporary layers');
    assert.equal(await page.locator('.film-negative img').first().evaluate(img=>getComputedStyle(img).animationName),'none','CSS development is retired');
    assert.equal(await page.locator('.film-negative img').first().evaluate(img=>getComputedStyle(img).filter),'none','Original image remains unfiltered');
    const first=page.locator('.photo-card').first();
    await first.locator('img.loaded').waitFor();
    assert.equal(await first.locator('img').evaluate(img=>getComputedStyle(img).objectFit),'contain');
    for(let i=0;i<4;i++){
      const card=page.locator('.photo-card').nth(i);
      const stock=['fuji-c200','kodak-gold-200','fuji-simple-ace','fuji-simple-ace'][i];
      assert.ok((await card.locator('.film-negative').getAttribute('class')).includes('film-negative--'+stock));
      for(const edge of await card.locator('svg image').all())assert.equal(await edge.getAttribute('href'),'/film-frames/'+stock+'.png');
    }
    await page.evaluate(()=>window.p4.prependFilm());
    await page.waitForFunction(()=>document.querySelector('[data-photo-id="new-film"] [data-film-developing]'));
    await page.evaluate(()=>{window.removedFilmFrame=document.querySelector('[data-photo-id="new-film"] .film-negative');window.p4.removeNewFilm()});
    await page.waitForFunction(()=>!window.removedFilmFrame.hasAttribute('data-film-developing'));
    assert.equal(await page.evaluate(()=>window.removedFilmFrame.querySelector('.film-develop-layer')),null,
      'Removing a newly inserted print releases its temporary layer during development');
    await page.locator('.photo-card').nth(12).scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelectorAll('[data-film-developing]').length>0);
    await page.evaluate(()=>window.p4.setActive(false));
    await page.waitForFunction(()=>document.querySelectorAll('[data-film-developing]').length===0);
    assert.equal(await page.locator('.film-develop-layer').count(),0,'Stopping development removes temporary layers');
    await page.evaluate(()=>window.p4.setActive(true));
    await page.evaluate(()=>scrollTo(0,0));
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(()=>document.querySelectorAll('[data-film-developing]').length===0);
    assert.ok(await page.locator('.film-negative > img').evaluateAll(images=>images.every(img=>img.style.filter===''&&img.style.opacity==='')));
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-film-developing]').count(),0,'Reduced-motion skips do not replay');
    await page.evaluate(()=>window.p4.setActive(false));
    await page.evaluate(()=>window.p4.setActive(true));
    await page.waitForTimeout(150);
    assert.equal(await page.locator('[data-film-developing]').count(),0,'Returning to the view does not replay developed prints');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:'.artifacts/motion/p4-film-'+(mobile?'mobile':'desktop')+'.png',fullPage:false});
    await page.evaluate(()=>window.p4.setMounted(false));
    await page.waitForFunction(()=>window.p4.animations()===0);
    await context.close();
    console.log(JSON.stringify({viewport:mobile?'mobile':'desktop',...concurrent,maximum:admission.maximum,
      filteredMaximum:admission.filteredMaximum,crossfadeSamples:admission.fade.length}));
  }
  // Exercise the actual page handler as well as the isolated grid: filtering
  // after pagination must commit its first page before layout measurement.
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(()=>{
    sessionStorage.setItem('pic4pick_intro_seen','1');
    localStorage.setItem('pic4pick_env_overrides',JSON.stringify({
      VITE_SUPABASE_URL:'https://p4-data.invalid',VITE_SUPABASE_ANON_KEY:'sb_publishable_fixture',
      VITE_API_BASE_URL:'https://p4-api.invalid'
    }));
  });
  const stocks=['Fuji C200','Kodak Gold 200','富士一次性相机','FUJIFILM SIMPLE ACE 400'];
  const photos=Array.from({length:18},(_,i)=>({id:'p4-'+i,title:'P4 '+i,status:'approved',hidden:false,
    category:i<8?'film':'latest',film_stock:stocks[i%4],created_at:new Date(2025,0,i+1).toISOString(),
    image_url:'https://p4-images.invalid/'+i+'.svg'}));
  await context.route('https://p4-data.invalid/**',route=>route.fulfill({json:[]}));
  await context.route('**/rest/v1/photos?**',route=>route.fulfill({json:photos}));
  await context.route('https://p4-api.invalid/**',route=>route.fulfill({json:{}}));
  await context.route('https://p4-images.invalid/**',route=>route.fulfill({contentType:'image/svg+xml',body:
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><path fill="#94785c" d="M0 0h600v400H0z"/></svg>'}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(baseUrl,{waitUntil:'networkidle'});
  await page.locator('.photo-card').first().waitFor();
  await page.getByRole('button',{name:/加载更多/}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.photo-card').length===18);
  await page.evaluate(()=>scrollTo(0,0));
  await page.getByRole('tab',{name:'随览',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.gallery-grid').hasAttribute('data-layout-motion'));
  assert.equal(await page.locator('.photo-card').count(),12,'Filter and pagination reset commit together');
  await page.waitForFunction(()=>!document.querySelector('.gallery-grid').hasAttribute('data-layout-motion'));
  await page.getByRole('tab',{name:'胶片',exact:true}).click();
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='darkroom');
  await page.waitForFunction(()=>document.querySelectorAll('[data-film-developing]').length>0);
  assert.equal(await page.locator('.photo-card').count(),8);
  assert.equal(await page.locator('[data-layout-motion]').count(),0,'Film geometry is never stretched by Flip');
  await page.screenshot({path:'.artifacts/motion/p4-gallery-developing.png',fullPage:false});
  await page.waitForFunction(()=>document.querySelectorAll('[data-film-developing]').length===0);
  await page.screenshot({path:'.artifacts/motion/p4-gallery.png',fullPage:false});
  await page.getByRole('tab',{name:'最新',exact:true}).click();
  await page.waitForFunction(()=>document.documentElement.dataset.theme!=='darkroom');
  await page.getByRole('tab',{name:'胶片',exact:true}).click();
  await page.locator('.film-negative img.loaded').first().waitFor();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-film-developing]').count(),0,'Re-entering film does not replay completed prints');
  await page.locator('.photo-card').first().click();
  await page.getByRole('dialog').waitFor();
  await page.waitForFunction(()=>document.querySelector('.lightbox-media img')?.naturalWidth>0);
  const stock=await page.locator('.photo-card').first().locator('.film-negative').getAttribute('class');
  const stockId=['fuji-c200','kodak-gold-200','fuji-simple-ace'].find(id=>stock.includes('film-negative--'+id));
  const edges=await page.locator('.lightbox-film-frame svg image').all();
  assert.ok(edges.length>0,'Lightbox displays the stock frame edges');
  for(const edge of edges){
    assert.equal(await edge.getAttribute('href'),'/film-frames/'+stockId+'.png');
  }
  assert.equal(await page.locator('.lightbox-media img').evaluate(img=>getComputedStyle(img).objectFit),'contain');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await context.close();
  assert.deepEqual(errors,[]);
  console.log('P4 motion passed: interruptible layout, refresh/pagination, simultaneous visible film development, frame mapping, reduced motion and cleanup.');
}finally{await browser.close()}

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const base = (process.env.UI_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const baseline = process.argv.find(value => value.startsWith('--baseline='))?.slice(11) || 'HEAD';
const before = execFileSync('git', ['show', `${baseline}:src/App.css`], { encoding: 'utf8' });
const after = readFileSync('src/App.css', 'utf8');
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#83968c"/></svg>');
const photos = [{ id: 'css-one', title: 'CSS contract', location: '上海', country: '中国', status: 'approved', hidden: false,
  category: 'film', created_at: '2026-10-22', image_url: image, thumbnail_url: image }];
const browser = await chromium.launch({ headless: true });
let cases = 0;
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.addInitScript(base => {
    sessionStorage.setItem('pic4pick_intro_seen', '1');
    localStorage.setItem('auth_token', 'css-fixture');
    localStorage.setItem('pic4pick_env_overrides', JSON.stringify({ VITE_API_BASE_URL: base,
      VITE_SUPABASE_URL: 'https://css-fixture.invalid', VITE_SUPABASE_ANON_KEY: 'sb_publishable_test', VITE_MAP_STYLE_PRESET: 'street' }));
  }, base);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === base && !url.pathname.startsWith('/api/')) return route.continue();
    let body = [];
    if (url.pathname === '/rest/v1/photos') body = photos;
    else if (url.pathname === '/api/auth/verify') body = { success: true, user: { username: 'admin' } };
    else if (url.pathname === '/api/admin/photos') body = { success: true, data: photos };
    else if (url.pathname.startsWith('/api/admin/app-settings/')) body = { success: true, data: null };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  for (const view of ['gallery', 'lightbox', 'admin']) {
    await page.goto(base + (view === 'admin' ? '/#/admin' : '/'), { waitUntil: 'networkidle' });
    if (view === 'admin') await page.locator('.admin-tabs').waitFor({ state: 'visible' });
    else await page.locator('.photo-card').first().waitFor({ state: 'visible' });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: '*,*::before,*::after { animation:none!important; transition:none!important; }' });
    if (view === 'lightbox') {
      await page.locator('.photo-card').first().click();
      await page.getByRole('dialog').waitFor();
    }
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['paper', 'film', 'darkroom']) {
        const differences = await page.evaluate(async ({ before, after, theme }) => {
          document.documentElement.dataset.theme = theme;
          const sheet = [...document.querySelectorAll('style[data-vite-dev-id]')]
            .find(element => element.dataset.viteDevId.replaceAll('\\', '/').endsWith('/src/App.css'));
          if (!sheet) throw new Error('Missing App CSS sheet');
          const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          sheet.textContent = before;
          await settle();
          const nodes = [...document.querySelectorAll('body,body *')];
          const capture = () => nodes.map(node => {
            return [null, '::before', '::after'].flatMap(pseudo => {
              const style = getComputedStyle(node, pseudo);
              return [...style].map(property => [`${pseudo || 'element'}:${property}`, style.getPropertyValue(property)]);
            });
          });
          const old = capture();
          sheet.textContent = after;
          await settle();
          const current = capture(), differences = [];
          for (let i = 0; i < old.length; i++) for (let j = 0; j < old[i].length; j++) {
            if (old[i][j][1] !== current[i][j][1]) differences.push({ element: nodes[i].tagName + '.' + nodes[i].className,
              property: old[i][j][0], before: old[i][j][1], after: current[i][j][1] });
          }
          return differences.slice(0, 5);
        }, { before, after, theme });
        assert.deepEqual(differences, [], JSON.stringify({ view, width, theme, differences }));
        cases++;
      }
    }
    console.log(`CSS computed style comparisons passed: ${view}`);
  }
  console.log(`CSS compatibility passed: ${cases} view/viewport/theme cases against ${baseline}.`);
} finally { await browser.close(); }

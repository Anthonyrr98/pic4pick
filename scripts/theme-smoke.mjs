import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = (process.env.UI_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const artifacts = process.env.UI_ARTIFACT_DIR || '';
const presets = [
  { id: 'paper', name: '纸白画廊', bg: 'rgb(245, 245, 242)' },
  { id: 'film', name: '暖调胶片', bg: 'rgb(242, 234, 221)' },
];
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  if (artifacts) await mkdir(artifacts, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  await context.addInitScript(() => {
    sessionStorage.setItem('pic4pick_intro_seen', '1');
    localStorage.setItem('pic4pick_env_overrides', JSON.stringify({ VITE_MAP_STYLE_PRESET: 'street' }));
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  const trigger = page.getByRole('button', { name: /切换主题/ });
  await trigger.waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo(0, 0));

  const select = async (preset) => {
    const scroll = await page.evaluate(() => window.scrollY);
    await trigger.click();
    await page.getByRole('menuitemradio', { name: new RegExp(preset.name) }).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), preset.id);
    assert.equal(await page.evaluate(() => localStorage.getItem('pic4pick_theme')), preset.id);
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    assert.ok(await trigger.evaluate(el => el === document.activeElement), 'Focus returns to the trigger');
    const afterScroll = await page.evaluate(() => window.scrollY);
    assert.ok(Math.abs(afterScroll - scroll) < 3, `Selecting ${preset.id} preserves scroll (${scroll} → ${afterScroll})`);
    await page.waitForFunction(bg => getComputedStyle(document.body).backgroundColor === bg, preset.bg);
  };

  for (const preset of presets) {
    await select(preset);
    if (artifacts) await page.screenshot({ path: path.join(artifacts, `${preset.id}-desktop.png`) });
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('html').getAttribute('data-theme'), preset.id, 'Theme survives a reload');
  }

  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await page.getByRole('menu', { name: '全局主题' }).waitFor();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  assert.ok(await page.getByRole('menuitemradio', { name: /暖调胶片/ }).evaluate(el => el === document.activeElement));
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'film');
  await trigger.click();
  await page.keyboard.press('Escape');
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  await trigger.click();
  await page.locator('.brand').click();
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false', 'Clicking outside dismisses the panel');

  await page.getByRole('button', { name: '发现', exact: true }).click();
  await page.locator('#mapCanvas.maplibregl-map').waitFor({ state: 'visible', timeout: 15000 });
  for (const preset of presets) {
    await select(preset);
    assert.ok(await page.locator('.curation-panel').isVisible(), 'Map panel remains visible after switching themes');
    if (artifacts) await page.screenshot({ path: path.join(artifacts, `map-${preset.id}.png`) });
  }
  await page.getByRole('button', { name: '图库', exact: true }).click();

  const secondPage = await context.newPage();
  await secondPage.goto(`${baseUrl}/#/admin`, { waitUntil: 'networkidle' });
  for (const preset of presets) {
    await select(preset);
    await secondPage.waitForFunction(id => document.documentElement.dataset.theme === id, preset.id);
    const field = secondPage.getByLabel('管理员用户名');
    const foreground = await field.evaluate(el => getComputedStyle(el).color);
    const background = await field.evaluate(el => getComputedStyle(el).backgroundColor);
    assert.notEqual(foreground, background, 'Login input text has a separate foreground');
  }

  await page.goto(`${baseUrl}/#/admin`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'film', 'Theme survives route changes');
  for (const width of [320, 390, 820]) {
    await page.setViewportSize({ width, height: 844 });
    await trigger.click();
    const bounds = await page.locator('.theme-popover').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `Picker fits a ${width}px viewport`);
    await page.keyboard.press('Escape');
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    const toggle = await page.locator('.view-toggle').boundingBox();
    const button = await trigger.boundingBox();
    assert.ok(button.x + button.width <= toggle.x + 1, 'Appearance and view controls do not overlap');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'No horizontal overflow');
    if (artifacts) await page.screenshot({ path: path.join(artifacts, `film-${width}px.png`) });
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await select(presets[1]);
  assert.equal(await page.locator('.theme-transition-wash').evaluate(el => getComputedStyle(el).opacity), '0');
  await trigger.click();
  assert.equal(await page.locator('.theme-popover').evaluate(el => getComputedStyle(el).opacity), '1');
  await page.keyboard.press('Escape');

  const fallbackContext = await browser.newContext();
  await fallbackContext.addInitScript(() => {
    localStorage.setItem('pic4pick_theme', 'midnight');
    sessionStorage.setItem('pic4pick_intro_seen', '1');
  });
  const fallbackPage = await fallbackContext.newPage();
  await fallbackPage.goto(baseUrl, { waitUntil: 'networkidle' });
  assert.equal(await fallbackPage.locator('html').getAttribute('data-theme'), 'paper');
  await fallbackPage.evaluate(() => {
    const nativeGet = Storage.prototype.getItem;
    const nativeSet = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (this === localStorage && key === 'pic4pick_theme') throw new Error('Storage unavailable');
      return nativeGet.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === 'pic4pick_theme') throw new Error('Storage full');
      return nativeSet.call(this, key, value);
    };
  });
  await fallbackPage.getByRole('button', { name: /切换主题/ }).click();
  await fallbackPage.getByRole('menuitemradio', { name: /暖调胶片/ }).click();
  assert.equal(await fallbackPage.locator('html').getAttribute('data-theme'), 'film');
  await fallbackContext.close();
  assert.deepEqual(errors, []);
  console.log('Theme smoke passed: two presets, persistence, keyboard, map panels, cross-tab sync, routes, responsive controls, reduced motion and unavailable storage');
} finally { await browser.close(); }

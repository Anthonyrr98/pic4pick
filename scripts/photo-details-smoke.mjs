import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.UI_BASE_URL || 'http://127.0.0.1:5173';
const image = await readFile('public/og-image.png');
const photos = [
  { id: 'details-with-location', title: '有坐标的照片', latitude: -28.171048, longitude: -179.387748, altitude: 2008, rating: 2 },
  { id: 'details-without-location', title: '没有坐标的照片', latitude: null, longitude: null },
  { id: 'details-film', title: '胶片照片', category: 'film', film_stock: 'Fuji C200', camera: 'Nikon FM2', latitude: null, longitude: null },
].map(photo => ({ category: 'latest', country: '中国', location: '测试地点', camera: 'FUJIFILM X-T5',
  lens: '17-70mm F/2.8 DiIII-A VC RXD B070X', aperture: 'f/8', shutter: '1/640s', focal: '28mm', iso: '400',
  shot_date: '2025-04-16', image_url: 'https://details-test.invalid/photo.png', thumbnail_url: 'https://details-test.invalid/photo.png',
  status: 'approved', hidden: false, ...photo }));
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    sessionStorage.setItem('pic4pick_intro_seen', '1');
    localStorage.setItem('pic4pick_env_overrides', JSON.stringify({ VITE_MAP_STYLE_PRESET: 'street', VITE_AMAP_WEB_KEY: '', VITE_AMAP_KEY: '' }));
    // Exercise denial and an explicit retry without opening a browser permission prompt.
    window.locationAttempts = 0;
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(success, failure) {
        window.locationAttempts += 1;
        if (!window.allowTestLocation) failure({ code: 1, message: 'Test permission denied' });
        else success({ coords: { latitude: 40, longitude: 116 } });
      },
    } });
  });
  await context.route('**/rest/v1/**', route => route.fulfill({ json: [] }));
  await context.route('**/rest/v1/photos?**', route => route.fulfill({ json: photos }));
  await context.route('https://details-test.invalid/**', route => route.fulfill({ body: image, contentType: 'image/png' }));
  await context.route('https://*.is.autonavi.com/**', route => route.fulfill({ body: image, contentType: 'image/png' }));
  await context.route('https://api.open-meteo.com/**', route => route.fulfill({ json: { elevation: [42] } }));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '查看作品：有坐标的照片', exact: true }).click();
  assert.equal(await page.locator('#lightbox-photo-details').count(), 0, 'Metadata appears only in the details sheet');
  assert.equal(await page.locator('.photo-details-sheet').count(), 0, 'Details start closed');
  const opener = page.locator('.lightbox-details-trigger');
  assert.equal(await opener.getAttribute('aria-label'), '基本参数');
  assert.equal(await page.locator('.lightbox-action-group button').count(), 3, 'Parameters, spatial scene and download share one group');
  await opener.click();
  const sheet = page.getByRole('dialog', { name: '照片详情' });
  await sheet.waitFor();
  assert.match(await sheet.locator('.photo-details-intro').innerText(), /有坐标的照片/);
  assert.equal(await sheet.getByRole('heading', { name: '分类', exact: true }).count(), 1);
  assert.equal(await sheet.getByRole('heading', { name: '喜欢', exact: true }).count(), 1);
  await sheet.locator('.photo-map-marker-thumbnail').waitFor();
  assert.match(await sheet.innerText(), /28°10′S/);
  assert.match(await sheet.innerText(), /179°23′W/);
  assert.match(await sheet.innerText(), /2008 m/);
  assert.equal(await sheet.locator('.photo-detail-rating .is-filled').count(), 2);
  const distance = sheet.locator('.photo-detail-card').filter({ has: page.getByRole('heading', { name: '距离', exact: true }) });
  assert.doesNotMatch(await distance.innerText(), /\d+ km/, 'Denial must never show a distance from a default city');
  assert.match(await distance.innerText(), /浏览器设置/);

  for (const [width, height] of [[1440, 1000], [820, 1180], [600, 800], [390, 844], [320, 568], [844, 390]]) {
    await page.setViewportSize({ width, height });
    const layout = await sheet.evaluate(el => {
      const rect = el.getBoundingClientRect();
      const scroller = el.querySelector('.photo-details-scroll');
      return { fits: rect.left >= 0 && rect.right <= innerWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight + 1,
        overflow: scroller.scrollWidth > scroller.clientWidth + 1,
        columns: getComputedStyle(el.querySelector('.photo-details-grid')).gridTemplateColumns.split(' ').length };
    });
    assert.ok(layout.fits, `Sheet must fit ${width}x${height}`);
    assert.equal(layout.overflow, false, `No sideways scrolling at ${width}x${height}`);
    assert.equal(layout.columns, 2);
    await sheet.locator('.photo-detail-card').last().scrollIntoViewIfNeeded();
    assert.ok(await sheet.getByRole('button', { name: '收起照片详情' }).evaluate(el => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight;
    }), 'Close button stays visible while scrolling');
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await sheet.getByRole('button', { name: '收起照片详情' }).focus();
  await page.keyboard.press('Shift+Tab');
  assert.ok(await sheet.evaluate(el => el.contains(document.activeElement)), 'Focus remains inside the sheet');
  await page.evaluate(() => { window.allowTestLocation = true; });
  await sheet.getByRole('button', { name: '重新定位' }).click();
  await distance.getByText(/km/).waitFor();
  assert.match(await distance.innerText(), /距你当前的位置/);
  await page.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });
  assert.equal(await sheet.count(), 0);
  assert.ok(await opener.evaluate(el => el === document.activeElement), 'Closing returns focus to the opener');
  assert.equal(await page.locator('.lightbox.active').count(), 1, 'First Escape closes only details');
  await page.keyboard.press('Escape');
  await page.locator('.lightbox.active').waitFor({ state: 'hidden' });

  await page.locator('.photo-card').filter({ hasText: '没有坐标的照片' }).click();
  await opener.click();
  await sheet.waitFor();
  assert.match(await sheet.innerText(), /没有记录坐标/);
  assert.equal(await sheet.locator('.photo-location-map').count(), 0);
  assert.match(await sheet.innerText(), /f\/8/);
  await page.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });
  await page.keyboard.press('Escape');
  await page.locator('.lightbox.active').waitFor({ state: 'hidden' });

  await page.getByRole('tab', { name: '胶片', exact: true }).click();
  await page.getByRole('button', { name: '查看作品：胶片照片', exact: true }).click();
  await opener.click();
  assert.match(await sheet.innerText(), /Fuji C200/);
  assert.match(await sheet.innerText(), /Nikon FM2/);
  assert.equal(await sheet.getByRole('heading', { name: '光圈', exact: true }).count(), 0);
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'darkroom');
  assert.deepEqual(errors, []);
  console.log('Photo details passed: six viewport sizes, map and thumbnail, coordinate hemispheres, rating, denied location and retry, scroll, focus and Escape, missing GPS and film metadata.');
} finally {
  await browser.close();
}

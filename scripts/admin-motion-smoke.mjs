import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const baseUrl = (process.env.UI_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const artifacts = '.artifacts/motion';
const errors = [];
const { outputFiles } = await build({
  stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
    import React, { StrictMode, useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { gsap } from 'gsap';
    import { UploadProgress } from './src/components/UploadProgress';
    import { AnimatedMessage } from './src/components/AnimatedMessage';
    function Harness() {
      const [upload, setUpload] = useState({ progress: 45, isVisible: true, fileName: 'retained.jpg', statusLabel: '正在上传' });
      const [message, setMessage] = useState({ type: 'info', text: '正在提交' });
      const [mounted, setMounted] = useState(true);
      window.p6 = { setUpload, setMessage, setMounted,
        animations: () => gsap.globalTimeline.getChildren(true, true, true).length };
      return mounted && <><UploadProgress {...upload} /><AnimatedMessage message={message} /></>;
    }
    createRoot(document.getElementById('fixture')).render(<StrictMode><Harness /></StrictMode>);
  ` },
  bundle: true, write: false, format: 'esm', loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' },
});

const browser = await chromium.launch({ headless: true });
try {
  await mkdir(artifacts, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, reducedMotion: 'no-preference' });
  await context.route('**/__admin-motion-test__', route => route.fulfill({ contentType: 'text/html', body: `
    <html data-theme="paper"><head><meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/src/App.css"><link rel="stylesheet" href="/src/themes/themes.css">
    <link rel="stylesheet" href="/src/components/UploadProgress.css"></head>
    <body><div id="fixture"></div><script type="module" src="/__admin-motion-fixture__.js"></script></body></html>` }));
  await context.route('**/__admin-motion-fixture__.js', route => route.fulfill({ contentType: 'text/javascript', body: outputFiles[0].text }));
  const fixture = await context.newPage();
  fixture.on('pageerror', error => errors.push(error.message));
  await fixture.goto(`${baseUrl}/__admin-motion-test__`);
  await fixture.waitForFunction(() => document.querySelector('.upload-progress-percentage')?.textContent === '45%');
  await fixture.evaluate(() => {
    window.p6.setUpload({ progress: null, isVisible: false });
    window.p6.setMessage({ type: '', text: '' });
  });
  assert.equal(await fixture.locator('.upload-progress-anchor').getAttribute('data-state'), 'closing');
  assert.equal(await fixture.locator('.upload-progress-filename').innerText(), 'retained.jpg');
  assert.equal(await fixture.locator('.admin-message').innerText(), '正在提交');
  // Reopen before the reverse animation ends; the old completion must not hide new content.
  await fixture.evaluate(() => {
    window.p6.setUpload({ progress: 70, isVisible: true, fileName: 'retry.jpg', statusLabel: '正在重试' });
    window.p6.setMessage({ type: 'error', text: '可重试的错误' });
  });
  await fixture.waitForFunction(() => document.querySelector('.upload-progress-percentage')?.textContent === '70%');
  assert.equal(await fixture.locator('.upload-progress-filename').innerText(), 'retry.jpg');
  assert.equal(await fixture.locator('.admin-message[role="alert"]').innerText(), '可重试的错误');
  for (const width of [320, 390, 1200]) {
    await fixture.setViewportSize({ width, height: 900 });
    const box = await fixture.locator('.upload-progress-anchor').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width, `Upload panel must fit ${width}px`);
  }
  await fixture.emulateMedia({ reducedMotion: 'reduce' });
  await fixture.evaluate(() => {
    window.p6.setUpload({ progress: null, isVisible: false });
    window.p6.setMessage({ type: '', text: '' });
  });
  await fixture.locator('.upload-progress-anchor').waitFor({ state: 'detached' });
  await fixture.locator('.admin-message').waitFor({ state: 'detached' });
  await fixture.emulateMedia({ reducedMotion: 'no-preference' });
  await fixture.evaluate(() => {
    window.p6.setUpload({ progress: 85, isVisible: true, fileName: 'unmount.jpg' });
    window.p6.setMessage({ type: 'success', text: '完成' });
  });
  await fixture.locator('.upload-progress-anchor').waitFor();
  await fixture.evaluate(() => window.p6.setMounted(false));
  await fixture.waitForFunction(() => window.p6.animations() === 0);

  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(url => {
    localStorage.setItem('auth_token', 'p6-admin-test');
    localStorage.setItem('pic4pick_env_overrides', JSON.stringify({ VITE_API_BASE_URL: url,
      VITE_ALIYUN_OSS_BACKEND_URL: url, VITE_SUPABASE_URL: 'https://p6-test.invalid', VITE_SUPABASE_ANON_KEY: 'p6-test' }));
  }, baseUrl);
  const photo = { id: 'p6-edit', title: '保留的胶片标题', status: 'approved', category: 'film',
    film_stock: 'Fuji C200', shot_date: '2026-11-01', location: '上海', country: '中国',
    image_url: 'https://p6-test.invalid/photo.svg', thumbnail_url: 'https://p6-test.invalid/photo.svg' };
  const photos = [photo];
  let releaseCommit;
  let commits = 0;
  let uploads = 0;
  let lastPayload;
  // All service requests are intercepted; this suite never writes to a live backend.
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === new URL(baseUrl).origin && !url.pathname.startsWith('/api/')) return route.continue();
    const respond = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/photo.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#7c938b"/></svg>' });
    if (url.pathname === '/api/auth/verify') return respond({ success: true, user: { username: 'admin' } });
    if (url.pathname === '/api/admin/photos' && request.method() === 'GET') return respond({ success: true, data: photos });
    if (url.pathname === '/api/upload/oss') {
      uploads++;
      return respond({ success: true, url: photo.image_url });
    }
    if (url.pathname === '/api/admin/photos' && request.method() === 'POST') {
      const attempt = ++commits;
      lastPayload = request.postDataJSON();
      await new Promise(resolve => { releaseCommit = resolve; });
      if (attempt === 1) return respond({ error: '模拟作品保存失败' }, 500);
      photos.push(lastPayload);
      return respond({ success: true, data: lastPayload });
    }
    if (url.pathname.startsWith('/api/upload/oss/progress/')) return respond({}, 404);
    if (url.pathname.startsWith('/api/admin/app-settings/')) return respond({ success: true, data: null });
    return respond([]);
  });
  await page.goto(`${baseUrl}/#/admin`, { waitUntil: 'networkidle' });
  const tabs = page.locator('.admin-tabs');
  await tabs.getByRole('button', { name: /已审核/ }).click();
  const trigger = page.locator('.admin-list-item').first().getByRole('button', { name: /编辑/ });
  const modal = page.locator('.edit-modal-content');
  await trigger.click();
  await modal.waitFor();
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.edit-modal-backdrop')).opacity) === 1);
  await modal.getByPlaceholder('请输入作品标题').fill('退出期间保留此内容');
  await page.screenshot({ path: `${artifacts}/p6-editor-desktop.png` });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.edit-modal-backdrop').getAttribute('data-state'), 'closing');
  assert.equal(await modal.getByPlaceholder('请输入作品标题').inputValue(), '退出期间保留此内容');
  assert.equal(await modal.getAttribute('inert'), '');
  await modal.waitFor({ state: 'detached' });
  assert.equal(await trigger.evaluate(element => element === document.activeElement), true, 'Close restores the original edit trigger');
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await modal.waitFor();
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.edit-modal-backdrop')).opacity) === 1);
  await page.screenshot({ path: `${artifacts}/p6-editor-mobile.png` });
  await page.keyboard.press('Tab');
  assert.equal(await modal.evaluate(element => element.contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  await modal.waitFor({ state: 'detached' });

  await page.setViewportSize({ width: 1200, height: 900 });
  await tabs.getByRole('button', { name: /上传作品/ }).click();
  const form = page.locator('.admin-upload-form');
  await page.locator('#file-upload').setInputFiles({ name: 'p6.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4AAAAABJRU5ErkJggg==', 'base64') });
  await page.getByText(/照片中未找到EXIF数据|无法读取照片EXIF数据/).waitFor();
  await form.locator('[name="title"]').fill('P6 上传重试');
  await form.locator('[name="location"]').fill('上海');
  await form.locator('[name="country"]').fill('中国');
  await form.getByPlaceholder('请选择拍摄日期').fill('2026-11-01');
  await form.locator('[name="title"]').click();
  await form.locator('.category-select-display').click();
  await form.locator('.admin-dropdown-item').getByText('胶片', { exact: true }).click();
  await form.getByRole('combobox', { name: '胶卷' }).fill('Fuji C200');
  await form.getByRole('button', { name: '提交审核', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.upload-progress-percentage')?.textContent === '99%');
  assert.equal(commits, 1);
  assert.equal(await page.locator('.admin-message.success').count(), 0, 'File upload alone must not report submission success');
  assert.equal(await page.locator('.upload-progress-anchor').getAttribute('data-outcome'), 'uploading');
  releaseCommit();
  await page.locator('.upload-progress-anchor[data-outcome="error"]').waitFor();
  assert.ok(Number(await page.getByRole('progressbar').getAttribute('aria-valuenow')) < 100);
  // Retry inside the old 500ms hide delay and hold the next save beyond that delay.
  await form.getByRole('button', { name: '提交审核', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.upload-progress-percentage')?.textContent === '99%');
  await page.waitForTimeout(650);
  assert.equal(commits, 2);
  assert.equal(uploads, 1, 'Save retry reuses the uploaded file');
  assert.equal(await page.locator('.upload-progress-anchor').getAttribute('data-state'), 'open');
  assert.equal(await page.locator('.upload-progress-anchor').getAttribute('data-outcome'), 'uploading');
  assert.equal(lastPayload.category, 'film');
  assert.equal(lastPayload.film_stock, 'Fuji C200');
  await page.screenshot({ path: `${artifacts}/p6-upload-saving.png` });
  releaseCommit();
  await page.locator('.upload-progress-anchor[data-outcome="success"]').waitFor();
  await page.waitForFunction(() => document.querySelector('.upload-progress-percentage')?.textContent === '100%');
  await page.getByText('提交成功！作品已添加到待审核列表', { exact: true }).waitFor();
  await page.locator('.upload-progress-anchor').waitFor({ state: 'detached' });
  assert.deepEqual(errors, []);
  console.log('P6: reversible notices, retained exits, reduced motion, cleanup, editor focus/mobile, truthful progress and rapid save retry passed.');
} finally {
  await browser.close();
}

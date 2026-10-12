import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = (process.env.UI_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const artifactDir = process.env.UI_ARTIFACT_DIR || '';
const image = 'https://admin-ui-test.invalid/photo.svg';
const makePhotos = (status, count, title) => Array.from({ length: count }, (_, index) => ({
  id: `${status}-${index + 1}`, title: `${title} ${String(index + 1).padStart(2, '0')}`,
  status, location: '上海', country: '中国', category: index % 2 ? 'film' : 'latest',
  created_at: '2026-10-12T00:00:00Z', shot_date: '2026-10-11', rating: 7,
  image_url: image, thumbnail_url: image,
}));
const photos = [...makePhotos('approved', 3, '已审核作品'), ...makePhotos('pending', 41, '待审作品'), ...makePhotos('rejected', 25, '退回作品')];
const writes = [];
let heldSave = null;
let holdSave = false;
let failSave = false;
const browser = await chromium.launch({ headless: true });
let page;

try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript((url) => {
    localStorage.setItem('auth_token', 'admin-ui-test');
    localStorage.setItem('pic4pick_env_overrides', JSON.stringify({
      VITE_API_BASE_URL: url, VITE_ALIYUN_OSS_BACKEND_URL: url,
      VITE_SUPABASE_URL: 'https://admin-ui-test.invalid', VITE_SUPABASE_ANON_KEY: 'admin-ui-test',
    }));
  }, baseUrl);
  // Intercept every service request: these checks never write to a live backend.
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === new URL(baseUrl).origin && !url.pathname.startsWith('/api/')) {
      await route.continue();
      return;
    }
    const respond = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (request.url() === image) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#7c938b"/></svg>' });
    if (url.pathname === '/api/auth/verify') return respond({ success: true, user: { username: 'admin' } });
    if (url.pathname === '/api/admin/photos' && request.method() === 'GET') return respond({ success: true, data: photos });
    if (url.pathname === '/api/admin/photos/upsert' || (url.pathname.startsWith('/api/admin/photos/') && request.method() === 'PATCH')) {
      const patch = request.postDataJSON();
      const id = patch.id || decodeURIComponent(url.pathname.split('/').pop());
      const photo = photos.find((item) => item.id === id);
      assert.ok(photo, `Unknown photo ${id}`);
      writes.push({ id, patch });
      if (holdSave) {
        await new Promise((resolve) => { heldSave = resolve; });
      }
      if (failSave) return respond({ error: '模拟保存失败' }, 500);
      Object.assign(photo, patch);
      return respond({ success: true, data: [photo] });
    }
    if (url.pathname.startsWith('/api/admin/app-settings/')) return respond({ success: true, data: null });
    return respond([]);
  });

  await page.goto(`${baseUrl}/#/admin`, { waitUntil: 'networkidle' });
  const tabs = page.locator('.admin-tabs');
  const items = page.locator('.admin-list-item');
  const modal = page.locator('.edit-modal-content');
  const search = page.getByRole('searchbox', { name: '搜索作品' });
  const openTab = (name) => tabs.getByRole('button', { name: new RegExp(name) }).click();
  const waitForItems = (count) => page.waitForFunction((expected) => document.querySelectorAll('.admin-list-item').length === expected, count);
  const assertPending = async () => assert.match(await tabs.locator('.active').innerText(), /待审核/);

  await openTab('已审核');
  await waitForItems(3);
  await items.first().getByRole('button', { name: /编辑/ }).click();
  await modal.getByPlaceholder('请输入作品标题').fill('保存后的标题');
  holdSave = true;
  // Two clicks in the same event turn must still produce only one request.
  await modal.getByRole('button', { name: '保存', exact: true }).evaluate((button) => { button.click(); button.click(); });
  await modal.getByRole('button', { name: '正在保存...' }).waitFor();
  assert.equal(writes.length, 1);
  assert.equal(await modal.getByRole('button', { name: '取消', exact: true }).isEnabled(), false);
  assert.equal(await modal.getByRole('button', { name: '删除作品', exact: true }).isEnabled(), false);
  assert.equal(await modal.getByPlaceholder('请输入作品标题').isEnabled(), false);
  await modal.locator('..').click({ position: { x: 5, y: 5 } });
  assert.equal(await modal.count(), 1, 'Backdrop must not dismiss an in-flight save');
  assert.equal(await modal.getByPlaceholder('请输入作品标题').inputValue(), '保存后的标题');
  holdSave = false;
  heldSave();
  await modal.waitFor({ state: 'hidden' });
  assert.equal(photos.find((photo) => photo.id === 'approved-1').title, '保存后的标题');

  await items.nth(1).getByRole('button', { name: /编辑/ }).click();
  await modal.getByPlaceholder('请输入作品标题').fill('失败后保留的编辑');
  failSave = true;
  await modal.getByRole('button', { name: '保存', exact: true }).click();
  await modal.getByText('保存失败：模拟保存失败', { exact: true }).waitFor();
  assert.equal(await modal.getByPlaceholder('请输入作品标题').inputValue(), '失败后保留的编辑');
  assert.equal(await modal.getByRole('button', { name: '保存', exact: true }).isEnabled(), true);
  // The previous editor's success timer must not clear this editor's error.
  await page.waitForTimeout(2100);
  assert.equal(await modal.getByText('保存失败：模拟保存失败', { exact: true }).count(), 1);
  failSave = false;
  await modal.getByRole('button', { name: '保存', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });

  await openTab('待审核');
  await waitForItems(20);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await waitForItems(1);
  await items.first().getByRole('button', { name: '✓ 通过', exact: true }).click();
  await waitForItems(20);
  await assertPending();
  assert.match(await page.locator('.admin-pagination').innerText(), /第 2 \/ 2 页/);

  await search.fill('待审作品 01');
  await waitForItems(1);
  await items.first().getByRole('button', { name: '✓ 通过', exact: true }).click();
  await page.getByText('没有找到匹配的作品', { exact: true }).waitFor();
  await assertPending();
  await search.fill('待审作品 02');
  await waitForItems(1);
  await items.first().getByRole('button', { name: '✕ 拒绝', exact: true }).click();
  await page.getByText('没有找到匹配的作品', { exact: true }).waitFor();
  await assertPending();
  await page.getByRole('button', { name: '清除筛选', exact: true }).click();
  await waitForItems(20);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await waitForItems(18);
  const batchStart = writes.length;
  await page.getByRole('button', { name: '全选当前列表', exact: true }).click();
  await page.getByRole('button', { name: '批量通过', exact: true }).click();
  await page.getByText('已通过 18 个作品', { exact: true }).waitFor({ timeout: 5000 });
  await waitForItems(20);
  await assertPending();
  assert.equal(writes.length - batchStart, 18, 'Batch approval must affect only the selected page');
  assert.equal(photos.filter((photo) => photo.status === 'pending').length, 20);
  assert.equal(await page.locator('.admin-pagination').count(), 0);
  await items.first().getByRole('checkbox').check();
  await page.getByRole('button', { name: '批量拒绝', exact: true }).click();
  await page.getByText('已拒绝 1 个作品', { exact: true }).waitFor();
  await waitForItems(19);
  await assertPending();

  await search.fill('待审作品 04');
  await waitForItems(1);
  await openTab('已拒绝');
  await waitForItems(20);
  assert.equal(await search.inputValue(), '', 'Each status keeps independent filters');
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await waitForItems(7);
  await search.fill('退回作品 01');
  await waitForItems(1);
  assert.equal(await page.locator('.admin-pagination').count(), 0);
  await search.fill('不存在的照片');
  await page.getByText('没有找到匹配的作品', { exact: true }).waitFor();
  await openTab('待审核');
  await waitForItems(1);
  assert.equal(await search.inputValue(), '待审作品 04');
  await page.getByRole('button', { name: '清除筛选', exact: true }).click();
  await waitForItems(19);
  await page.getByRole('button', { name: '全部分类', exact: true }).click();
  await page.locator('.admin-dropdown-item').filter({ hasText: /^胶片$/ }).dispatchEvent('mousedown');
  await page.waitForFunction(() => document.querySelectorAll('.admin-list-item').length < 19);
  const filteredCount = await items.count();
  assert.equal(filteredCount, photos.filter((photo) => photo.status === 'pending' && photo.category === 'film').length);
  await page.getByRole('button', { name: '清除筛选', exact: true }).click();

  if (artifactDir) await mkdir(artifactDir, { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const header = await page.locator('.admin-header').evaluate((element) => {
      const link = element.querySelector('.primary-menu a');
      const theme = element.querySelector('.theme-trigger');
      const brand = element.querySelector('.brand');
      const rect = link.getBoundingClientRect();
      const themeRect = theme.getBoundingClientRect();
      const brandRect = brand.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(link);
      return {
        textLines: range.getClientRects().length,
        overlap: rect.left < themeRect.right && rect.right > themeRect.left && rect.top < themeRect.bottom && rect.bottom > themeRect.top,
        brandOverlap: brandRect.left < themeRect.right && brandRect.right > themeRect.left && brandRect.top < themeRect.bottom && brandRect.bottom > themeRect.top,
        inBounds: rect.left >= 0 && rect.right <= innerWidth,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.equal(header.textLines, 1, `Return link wraps at ${width}px`);
    assert.equal(header.overlap, false, `Header actions overlap at ${width}px`);
    assert.equal(header.brandOverlap, false, `Brand overlaps actions at ${width}px`);
    assert.equal(header.inBounds, true, `Return link exceeds viewport at ${width}px`);
    assert.equal(header.overflow, false, `Page overflows at ${width}px`);
    if (artifactDir) await page.screenshot({ path: path.join(artifactDir, `admin-${width}.png`), fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log('Admin UI checks passed: save locking and retry, review continuity, filtering, pagination, batch scope, and responsive header.');
} catch (error) {
  console.error({ messages: await page.locator('.admin-message').allTextContents(), writes: writes.length, pending: photos.filter((photo) => photo.status === 'pending').length, selection: await page.locator('.batch-selected-count').allTextContents() });
  throw error;
} finally {
  await browser.close();
}

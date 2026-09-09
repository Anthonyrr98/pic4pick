import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = (process.env.UI_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const artifactDir = process.env.UI_ARTIFACT_DIR || '';

const browser = await chromium.launch({ headless: true });
const errors = [];

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page.locator('.photo-card').first().waitFor({ state: 'visible' });

  const cards = page.locator('.photo-card');
  if (await cards.count() < 1) throw new Error('Gallery rendered no photo cards');

  const firstCard = cards.first();
  if (await firstCard.getAttribute('role') !== 'button') throw new Error('Photo card is not keyboard accessible');
  await firstCard.focus();
  await firstCard.press('Enter');

  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible' });
  if (await dialog.getAttribute('aria-modal') !== 'true') throw new Error('Lightbox is not modal');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });

  const selectedTab = page.locator('[role="tab"][aria-selected="true"]');
  const initialTab = await selectedTab.textContent();
  await selectedTab.focus();
  await selectedTab.press('ArrowRight');
  const nextTab = await page.locator('[role="tab"][aria-selected="true"]').textContent();
  if (initialTab === nextTab) throw new Error('Arrow-key tab navigation did not change the filter');

  await page.getByRole('button', { name: '发现', exact: true }).click();
  await page.locator('.maplibregl-map').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByRole('button', { name: '图库', exact: true }).click();
  await page.locator('.photo-card').first().waitFor({ state: 'visible' });
  await page.waitForTimeout(700);
  const returnedCardOpacity = Number(await page.locator('.photo-card').first().evaluate(
    (element) => getComputedStyle(element).opacity
  ));
  if (returnedCardOpacity < 0.9) throw new Error('Gallery cards stayed visually hidden after returning from the map');

  if (artifactDir) {
    await mkdir(artifactDir, { recursive: true });
    await page.screenshot({ path: path.join(artifactDir, 'gallery-desktop.png'), fullPage: true });
  }

  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  mobilePage.on('pageerror', (error) => errors.push(error.message));
  await mobilePage.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await mobilePage.locator('.photo-card').first().waitFor({ state: 'visible' });
  const mobileColumns = await mobilePage.locator('.photo-card').first().evaluate((element) => {
    const first = element.getBoundingClientRect();
    const sibling = element.nextElementSibling?.getBoundingClientRect();
    return sibling && Math.abs(first.top - sibling.top) < 4 ? 2 : 1;
  });
  if (mobileColumns !== 2) throw new Error('Mobile gallery is not using the expected two-column layout');

  if (artifactDir) {
    await mobilePage.screenshot({ path: path.join(artifactDir, 'gallery-mobile.png'), fullPage: true });
  }

  await mobilePage.goto(`${baseUrl}/#/admin`, { waitUntil: 'networkidle' });
  await mobilePage.getByText('LIGHT OF ANTHONY · STUDIO').waitFor({ state: 'visible' });
  if (await mobilePage.getByLabel('管理员用户名').getAttribute('autocomplete') !== 'username') {
    throw new Error('Admin username autocomplete is missing');
  }

  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  console.log('UI smoke test passed: gallery, keyboard lightbox, tabs, explore map, mobile layout, admin login');
} finally {
  await browser.close();
}

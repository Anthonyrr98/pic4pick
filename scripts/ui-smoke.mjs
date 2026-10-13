import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = (process.env.UI_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const artifactDir = process.env.UI_ARTIFACT_DIR || '';

const browser = await chromium.launch({ headless: true });
const errors = [];

async function checkResponsiveLightbox(page) {
  const originalViewport = page.viewportSize();
  for (const [width, height] of [[978, 956], [769, 700], [1024, 768], [1025, 768], [1280, 720], [820, 1180]]) {
    await page.setViewportSize({ width, height });
    const layout = await page.getByRole('dialog').evaluate((dialog) => {
      const title = dialog.querySelector('#lightbox-title').getBoundingClientRect();
      const actions = dialog.querySelector('.lightbox-actions').getBoundingClientRect();
      const media = dialog.querySelector('.lightbox-media').getBoundingClientRect();
      const image = dialog.querySelector('.lightbox-media img');
      return {
        overlaps: title.left < actions.right && title.right > actions.left
          && title.top < actions.bottom && title.bottom > actions.top,
        frameRatio: media.width / media.height,
        imageRatio: image.naturalWidth / image.naturalHeight,
      };
    });
    if (layout.overlaps) throw new Error(`Lightbox title overlaps the toolbar at ${width}x${height}`);
    if (Math.abs(layout.frameRatio - layout.imageRatio) > 0.02) {
      throw new Error(`Lightbox image ratio changed at ${width}x${height}`);
    }
  }
  await page.setViewportSize(originalViewport);
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  if (process.env.UI_MAP_PRESET) {
    await page.addInitScript((preset) => {
      localStorage.setItem('pic4pick_env_overrides', JSON.stringify({ VITE_MAP_STYLE_PRESET: preset }));
    }, process.env.UI_MAP_PRESET);
  }
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
  await page.waitForFunction(() => {
    const image = document.querySelector('.lightbox.active .lightbox-media img');
    return image?.complete && image.naturalWidth >= image.clientWidth;
  }, undefined, { timeout: 20_000 });
  const lightboxCurrentSrc = await dialog.locator('.lightbox-media img').evaluate((image) => image.currentSrc);
  if (/\/ore\/(?!hd\/)/i.test(lightboxCurrentSrc)) {
    throw new Error('Lightbox is upscaling the stored thumbnail instead of using the original image');
  }
  const lightboxObjectFit = await dialog.locator('.lightbox-media img').evaluate(
    (image) => getComputedStyle(image).objectFit
  );
  if (lightboxObjectFit !== 'contain') {
    throw new Error('Lightbox image is cropped instead of preserving the original composition');
  }
  const lightboxRatios = await dialog.locator('.lightbox-media img').evaluate((image) => {
    const frame = image.closest('.lightbox-media').getBoundingClientRect();
    return {
      frame: frame.width / frame.height,
      image: image.naturalWidth / image.naturalHeight,
    };
  });
  if (Math.abs(lightboxRatios.frame - lightboxRatios.image) > 0.02) {
    throw new Error('Lightbox frame does not match the original image aspect ratio');
  }
  await checkResponsiveLightbox(page);
  if (artifactDir) {
    await mkdir(artifactDir, { recursive: true });
    await page.screenshot({ path: path.join(artifactDir, 'lightbox-desktop.png'), fullPage: true });
  }
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });

  let landscapeChecked = false;
  for (let index = 0; index < Math.min(await cards.count(), 12); index += 1) {
    const candidate = cards.nth(index);
    const isLandscape = await candidate.locator('img').evaluate(
      (image) => image.complete && image.naturalWidth > image.naturalHeight
    );
    if (!isLandscape) continue;
    await candidate.click();
    await dialog.waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const image = document.querySelector('.lightbox.active .lightbox-media img');
      return image?.complete && image.naturalWidth > image.naturalHeight;
    });
    const landscapeRatios = await dialog.locator('.lightbox-media img').evaluate((image) => {
      const frame = image.closest('.lightbox-media').getBoundingClientRect();
      return { frame: frame.width / frame.height, image: image.naturalWidth / image.naturalHeight };
    });
    if (Math.abs(landscapeRatios.frame - landscapeRatios.image) > 0.02) {
      throw new Error('Landscape lightbox frame does not match the original image aspect ratio');
    }
    await checkResponsiveLightbox(page);
    if (artifactDir) {
      await page.screenshot({ path: path.join(artifactDir, 'lightbox-landscape.png'), fullPage: true });
    }
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    landscapeChecked = true;
    break;
  }
  if (!landscapeChecked) throw new Error('No landscape photo was available for the lightbox regression');

  const selectedTab = page.locator('[role="tab"][aria-selected="true"]');
  const initialTab = await selectedTab.textContent();
  await selectedTab.focus();
  await selectedTab.press('ArrowRight');
  const nextTab = await page.locator('[role="tab"][aria-selected="true"]').textContent();
  if (initialTab === nextTab) throw new Error('Arrow-key tab navigation did not change the filter');

  await page.getByRole('button', { name: '发现', exact: true }).click();
  await page.locator('#mapCanvas.maplibregl-map, #mapCanvas.amap-container').waitFor({ state: 'visible', timeout: 15_000 });
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

  const tabletPage = await browser.newPage({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1 });
  tabletPage.on('pageerror', (error) => errors.push(error.message));
  await tabletPage.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await tabletPage.locator('.photo-card').first().waitFor({ state: 'visible' });
  const tabletCards = tabletPage.locator('.photo-card');
  let tabletLandscapeCard = tabletCards.first();
  for (let index = 0; index < Math.min(await tabletCards.count(), 12); index += 1) {
    const candidate = tabletCards.nth(index);
    if (await candidate.locator('img').evaluate((image) => image.complete && image.naturalWidth > image.naturalHeight)) {
      tabletLandscapeCard = candidate;
      break;
    }
  }
  await tabletLandscapeCard.click();
  const tabletDialog = tabletPage.getByRole('dialog');
  await tabletDialog.waitFor({ state: 'visible' });
  await tabletPage.waitForFunction(() => {
    const image = document.querySelector('.lightbox.active .lightbox-media img');
    return image?.complete && image.naturalWidth > 0;
  });
  const tabletLayout = await tabletDialog.evaluate((element) => {
    const wrapper = element.querySelector('.lightbox-content-wrapper');
    const media = element.querySelector('.lightbox-media').getBoundingClientRect();
    const meta = element.querySelector('.lightbox-meta').getBoundingClientRect();
    const image = element.querySelector('.lightbox-media img');
    return {
      direction: getComputedStyle(wrapper).flexDirection,
      mediaWidth: media.width,
      metaWidth: meta.width,
      frameRatio: media.width / media.height,
      imageRatio: image.naturalWidth / image.naturalHeight,
    };
  });
  if (tabletLayout.direction !== 'column') throw new Error('iPad portrait lightbox did not switch to a stacked layout');
  if (tabletLayout.mediaWidth < tabletLayout.metaWidth * 0.9) throw new Error('iPad lightbox photograph is too small beside its metadata');
  if (Math.abs(tabletLayout.frameRatio - tabletLayout.imageRatio) > 0.02) {
    throw new Error('iPad lightbox frame does not preserve the original image ratio');
  }
  if (artifactDir) {
    await tabletPage.screenshot({ path: path.join(artifactDir, 'lightbox-ipad.png'), fullPage: true });
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

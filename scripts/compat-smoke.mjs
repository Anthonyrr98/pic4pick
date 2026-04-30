import { chromium, webkit } from 'playwright';

const TARGET = process.env.TARGET_URL || 'http://localhost:5173/';

async function runFor(name, browserType) {
  const errors = [];
  const failedRequests = [];

  const browser = await browserType.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (url.includes('/assets/') || url.includes('/api') || url.includes('amap')) {
      failedRequests.push(`${req.failure()?.errorText || 'FAILED'} ${url}`);
    }
  });

  const result = {
    browser: name,
    home: { ok: false, details: '' },
    discover: { ok: false, details: '' },
    admin: { ok: false, details: '' },
    errors,
    failedRequests,
  };

  try {
    await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const hasGallery = (await page.getByRole('button', { name: '图库' }).count()) > 0;
    const hasDiscover = (await page.getByRole('button', { name: '发现' }).count()) > 0;
    result.home.ok = hasGallery && hasDiscover;
    result.home.details = `图库按钮=${hasGallery}, 发现按钮=${hasDiscover}`;
  } catch (e) {
    result.home.ok = false;
    result.home.details = String(e);
  }

  try {
    await page.getByRole('button', { name: '发现' }).click();
    await page.waitForTimeout(1500);
    const mapCanvas = await page.locator('#mapCanvas').count();
    const hasMapCanvas = mapCanvas > 0;
    result.discover.ok = hasMapCanvas;
    result.discover.details = `#mapCanvas=${mapCanvas}`;
  } catch (e) {
    result.discover.ok = false;
    result.discover.details = String(e);
  }

  try {
    await page.goto(`${TARGET}#/admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const hasAdminTitle = (await page.getByText('管理后台访问').count()) > 0;
    const hasUserInput = (await page.getByPlaceholder('管理员用户名').count()) > 0;
    const hasPwdInput = (await page.getByPlaceholder('管理员密码').count()) > 0;
    result.admin.ok = hasAdminTitle && hasUserInput && hasPwdInput;
    result.admin.details = `title=${hasAdminTitle}, userInput=${hasUserInput}, pwdInput=${hasPwdInput}`;
  } catch (e) {
    result.admin.ok = false;
    result.admin.details = String(e);
  }

  await browser.close();
  return result;
}

const runs = [
  ['chromium', chromium],
  ['webkit', webkit],
];

const results = [];
for (const [name, bt] of runs) {
  // eslint-disable-next-line no-await-in-loop
  results.push(await runFor(name, bt));
}

console.log(JSON.stringify({ target: TARGET, results }, null, 2));


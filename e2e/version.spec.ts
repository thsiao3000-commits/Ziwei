import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const CURRENT = `v${(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version}`;

/** 模擬線上已經部署了另一個版本。 */
async function remoteVersion(page: Page, version: string) {
  await page.route('**/version.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version }) }),
  );
}

test('頂部列與頁尾顯示版本號；建置產物有 version.json', async ({ page, request }) => {
  await page.goto('./');
  await expect(page.getByTestId('app-version')).toHaveText(CURRENT);
  await expect(page.getByText(`紫微命盤 ${CURRENT}`, { exact: true })).toBeVisible();
  const response = await request.get('./version.json');
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ version: CURRENT });
});

test('線上版本沒有比較新時，不出現提示條', async ({ page }) => {
  await remoteVersion(page, CURRENT);
  const checked = page.waitForResponse((response) => response.url().includes('version.json'));
  await page.goto('./');
  await checked;
  await page.waitForTimeout(300);
  await expect(page.getByRole('button', { name: '立即更新' })).toHaveCount(0);
});

/** 讓版本檢查晚一點回來，測試才有時間先「開始操作」。 */
async function slowRemoteVersion(page: Page, version: string, delay: number) {
  await page.route('**/version.json*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delay));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version }) });
  });
}

test('開頁時線上有新版、還沒開始操作：自動載入最新版，不必按任何東西，也不會無限重載', async ({ page }) => {
  await remoteVersion(page, 'v99.0.0');
  const navigations: string[] = [];
  let loads = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  page.on('load', () => (loads += 1));

  await page.goto('./#/settings');

  // 自己重新載入；因為載到的還是舊版，再用帶版本參數的網址試一次。
  await expect.poll(() => navigations.some((url) => url.includes('?v=v99.0.0')), { timeout: 15_000 }).toBe(true);
  await expect(page.getByRole('heading', { level: 1, name: '設定' })).toBeVisible();
  // 停在原本的頁面，網址上的版本參數已清掉。
  await expect(page).toHaveURL(/\/Ziwei\/#\/settings$/);
  // 測試環境沒有真的新版：同一版不會再自動重載，改成提示條。
  await expect(page.getByRole('button', { name: '立即更新' })).toBeVisible({ timeout: 10_000 });
  // 提示條可能比最後一次載入的 load 事件早出現，先等它落定再比較。
  await page.waitForLoadState('load');
  await page.waitForTimeout(1000);
  const settled = loads;
  await page.waitForTimeout(1500);
  expect(loads).toBe(settled);
  expect(loads).toBeLessThanOrEqual(3);
  expect(await page.evaluate(() => sessionStorage.getItem('ziwei:update-auto'))).toBe('v99.0.0');
  expect(await page.evaluate(() => sessionStorage.getItem('ziwei:update-target'))).toBeNull();
});

test('已經開始操作：不自動重新載入，改用提示條；可以稍後再說', async ({ page }) => {
  await slowRemoteVersion(page, 'v99.0.0', 1200);
  let loads = 0;
  page.on('load', () => (loads += 1));
  await page.goto('./');
  // 版本檢查還沒回來，使用者已經開始填表單。
  await page.getByLabel('稱呼').fill('小明');

  await expect(page.getByText(`有新版 v99.0.0（目前 ${CURRENT}）。更新只會重新載入頁面，命盤、對話與設定不受影響。`)).toBeVisible({ timeout: 10_000 });
  expect(loads).toBe(1);
  // 填到一半的內容還在。
  await expect(page.getByLabel('稱呼')).toHaveValue('小明');

  await page.getByRole('button', { name: '稍後再說' }).click();
  await expect(page.getByRole('button', { name: '立即更新' })).toHaveCount(0);
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { level: 1, name: '設定' })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole('button', { name: '立即更新' })).toHaveCount(0);
});

test('提示條的「立即更新」：重新載入並刷新快取', async ({ page }) => {
  await slowRemoteVersion(page, 'v99.0.0', 1200);
  const navigations: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  await page.goto('./#/settings');
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: '立即更新' }).click({ timeout: 10_000 });
  await expect.poll(() => navigations.some((url) => url.includes('?v=v99.0.0')), { timeout: 15_000 }).toBe(true);
  await expect(page.getByRole('heading', { level: 1, name: '設定' })).toBeVisible();
  await expect(page).toHaveURL(/\/Ziwei\/#\/settings$/);
});

test('電腦版內容靠左，寬螢幕不置中', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, '只檢查電腦版');
  await page.setViewportSize({ width: 2200, height: 1100 });
  await page.goto('./');
  const brand = await page.getByRole('link', { name: '紫微命盤' }).boundingBox();
  const heading = await page.getByRole('heading', { level: 1, name: '排出命盤' }).boundingBox();
  // 左邊界固定 20px，不隨視窗變寬而往中間移。
  expect(brand?.x).toBeCloseTo(20, 0);
  expect(heading?.x).toBeCloseTo(20, 0);
});

test('寬螢幕：我的命盤、名詞、流月財運一覽用到右邊的空間，窄一點維持單欄', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '只檢查電腦版');
  await page.setViewportSize({ width: 1920, height: 1080 });
  // 虛構的測試生日
  for (const [name, day] of [['小明', '16'], ['小華', '20'], ['小美', '22']] as const) {
    await page.goto('./');
    await page.getByLabel('稱呼').fill(name);
    await page.getByRole('radio', { name: '女' }).check({ force: true });
    await page.getByLabel('年（西元）').fill('2000');
    await page.getByLabel('月', { exact: true }).selectOption('8');
    await page.getByLabel('日', { exact: true }).selectOption(day);
    await page.getByLabel('或直接選時辰').selectOption('2');
    await page.getByRole('button', { name: '排出命盤' }).click();
    await expect(page.getByRole('heading', { level: 1, name: `${name}的命盤` })).toBeVisible();
  }
  const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  // 流月財運一覽：說明在左，表格在右
  await page.getByRole('link', { name: '流月財運一覽' }).click();
  const table = page.getByRole('table', { name: /年的流月/ });
  await expect(table).toBeVisible({ timeout: 30_000 });
  const year = page.getByLabel('要看的年份');
  expect((await table.boundingBox())!.x).toBeGreaterThan((await year.boundingBox())!.x + 400);
  expect((await table.boundingBox())!.y).toBeLessThan((await year.boundingBox())!.y);
  await noOverflow();
  await page.screenshot({ path: testInfo.outputPath('wide-months.png'), fullPage: true });

  // 我的命盤：三張排成一列
  await page.goto('./#/charts');
  const items = page.locator('main ul > li');
  await expect(items).toHaveCount(3);
  const ys = await items.evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)));
  expect(new Set(ys).size).toBe(1);
  await noOverflow();
  await page.screenshot({ path: testInfo.outputPath('wide-charts.png') });

  // 名詞：每一類三欄
  await page.goto('./#/glossary');
  const first = page.locator('dl').first().locator('> div');
  await expect(first.first()).toBeVisible({ timeout: 30_000 });
  const tops = await first.evaluateAll((elements) => elements.slice(0, 3).map((element) => Math.round(element.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  await noOverflow();
  await page.screenshot({ path: testInfo.outputPath('wide-glossary.png') });

  // 1100：回到單欄
  await page.setViewportSize({ width: 1100, height: 900 });
  const narrow = await first.evaluateAll((elements) => elements.slice(0, 2).map((element) => Math.round(element.getBoundingClientRect().top)));
  expect(narrow[1]).toBeGreaterThan(narrow[0]!);
  await noOverflow();
});

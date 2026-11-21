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

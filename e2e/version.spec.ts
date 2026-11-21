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

test('線上有新版：出現提示條，可以稍後再說', async ({ page }) => {
  await remoteVersion(page, 'v99.0.0');
  await page.goto('./');
  await expect(page.getByText(`有新版 v99.0.0（目前 ${CURRENT}）。更新只會重新載入頁面，命盤、對話與設定不受影響。`)).toBeVisible({ timeout: 10_000 });
  // 檢查時不走快取，而且只連本站。
  await page.getByRole('button', { name: '稍後再說' }).click();
  await expect(page.getByRole('button', { name: '立即更新' })).toHaveCount(0);
  // 換頁不會再跳出來（同一版不再提示，直到重新開頁）。
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { level: 1, name: '設定' })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole('button', { name: '立即更新' })).toHaveCount(0);
});

test('立即更新：重新載入；載到的還是舊版時，改用帶版本參數的網址再試一次，不會無限重載', async ({ page }) => {
  await remoteVersion(page, 'v99.0.0');
  // 路由自己也會在同一頁內改寫網址，所以用「整頁載入」的次數來判斷有沒有重複重載。
  const navigations: string[] = [];
  let loads = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  page.on('load', () => (loads += 1));
  await page.goto('./#/settings');
  await page.getByRole('button', { name: '立即更新' }).click({ timeout: 10_000 });

  // 先重新載入一次；因為版本還是舊的，再用帶版本參數的網址載一次。
  await expect.poll(() => navigations.some((url) => url.includes('?v=v99.0.0')), { timeout: 15_000 }).toBe(true);
  await expect(page.getByRole('heading', { level: 1, name: '設定' })).toBeVisible();
  // 載完後網址上的版本參數會清掉，仍停在原本的頁面。
  await expect(page).toHaveURL(/\/Ziwei\/#\/settings$/);
  // 測試環境沒有真的新版，提示條會再出現，但不會自己一直重載。
  await expect(page.getByRole('button', { name: '立即更新' })).toBeVisible({ timeout: 10_000 });
  // 最多三次整頁載入（開頁、重新載入、帶版本參數再試一次；中間那次可能還沒載完就被換掉），之後不再增加。
  const settled = loads;
  await page.waitForTimeout(1500);
  expect(loads).toBe(settled);
  expect(loads).toBeLessThanOrEqual(3);
  expect(await page.evaluate(() => sessionStorage.getItem('ziwei:update-target'))).toBeNull();
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

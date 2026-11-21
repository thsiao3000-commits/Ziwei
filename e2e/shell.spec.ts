import { expect, test } from '@playwright/test';

const ALLOWED_HOSTS = new Set(['127.0.0.1', 'api.openai.com', 'api.anthropic.com']);

test('空殼可在子路徑下開啟，導覽與重新整理都正常', async ({ page }, testInfo) => {
  const offSite: string[] = [];
  const failed: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (!ALLOWED_HOSTS.has(url.hostname)) offSite.push(request.url());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: '排出命盤' })).toBeVisible();
  await expect(page.getByRole('group', { name: '示範命盤' })).toBeVisible();
  await expect(page.getByText('不能取代醫療、法律或財務專業意見')).toBeVisible();

  // 字型自行託管，確認楷體真的載入（而不是落到系統後備字型）。
  await page.waitForFunction(() =>
    [...document.fonts].some((face) => face.family.includes('LXGW WenKai TC') && face.status === 'loaded'),
  );

  await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true });

  const nav = page.getByRole('navigation', { name: '主要導覽' }).locator('visible=true');
  await nav.getByRole('link', { name: '設定' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByRole('heading', { level: 1, name: '設定' })).toBeVisible();

  // GitHub Pages 沒有 SPA 回退：hash 路由下重新整理不可 404。
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: '設定' })).toBeVisible();

  await nav.getByRole('link', { name: '我的命盤' }).click();
  await expect(page.getByText('還沒有命盤。輸入出生資料，排出第一張。')).toBeVisible();

  await page.goto('./#/no-such-page');
  await expect(page.getByRole('heading', { level: 1, name: '找不到這個頁面' })).toBeVisible();

  expect(offSite, '不得有第三方請求').toEqual([]);
  expect(failed, '不得有載入失敗的資源').toEqual([]);
  expect(consoleErrors, '主控台不得有錯誤（含 CSP 違規）').toEqual([]);
});

test('建置產物帶有 CSP，只允許本站與兩家 AI 供應商', async ({ page }) => {
  await page.goto('./');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("connect-src 'self' https://api.openai.com https://api.anthropic.com");
  expect(csp).not.toMatch(/script-src[^;]*unsafe/);

  // CSP 真的在執行：連到未列入的主機會被擋下。
  const blocked = await page.evaluate(async () => {
    try {
      await fetch('https://example.com/', { mode: 'no-cors' });
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
});

test('深色主題（夜觀）可用', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: '排出命盤' })).toBeVisible();
  await page.waitForFunction(() => [...document.fonts].some((face) => face.status === 'loaded'));
  const background = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  expect(background).toBe('rgb(20, 33, 61)');
  await page.screenshot({ path: testInfo.outputPath('home-dark.png'), fullPage: true });
});

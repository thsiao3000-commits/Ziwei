import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type Route } from '@playwright/test';

// 假字串，不是任何真實金鑰。
const FAKE_KEY = 'fake-key-for-e2e-0000000000000-wxyz';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

type Seen = { url: string; headers: Record<string, string> };

/** 模擬兩家供應商的 API。真實金鑰的煙霧測試由業主手動執行。 */
async function mockProviders(page: Page, options: { anthropicStatus?: number } = {}) {
  const seen: Seen[] = [];
  const handle = (body: (route: Route) => { status: number; json: unknown }) => async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    seen.push({ url: request.url(), headers: request.headers() });
    const { status, json } = body(route);
    return route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(json) });
  };

  await page.route('https://api.anthropic.com/**', handle(() =>
    options.anthropicStatus === 401
      ? { status: 401, json: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } }
      : {
          status: 200,
          json: {
            data: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-future-9'].map((id, index) => ({
              type: 'model',
              id,
              display_name: id,
              created_at: `2026-0${index + 1}-01T00:00:00Z`,
              lifecycle: 'active',
              line: null,
              max_input_tokens: 1000000,
              max_tokens: 128000,
              capabilities: null,
            })),
            has_more: false,
            first_id: 'claude-sonnet-5-5',
            last_id: 'claude-future-9',
          },
        },
  ));
  await page.route('https://api.openai.com/**', handle(() => ({
    status: 200,
    json: {
      object: 'list',
      data: ['gpt-6.2-sol', 'gpt-image-2', 'gpt-6-luna'].map((id, index) => ({ id, created: 1790000000 + index, object: 'model', owned_by: 'openai' })),
    },
  })));
  return seen;
}

function providerSection(page: Page, name: string) {
  return page.getByTestId(name === 'OpenAI' ? 'provider-openai' : 'provider-anthropic');
}

test('沒有金鑰時：狀態為未設定，模型區說明排盤仍可使用', async ({ page }, testInfo) => {
  await page.goto('./#/settings');
  await expect(page.getByTestId('key-status-openai')).toHaveText('未設定');
  await expect(page.getByTestId('key-status-anthropic')).toHaveText('未設定');
  await expect(page.getByText('先在上面設定至少一把金鑰')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath('settings-empty.png'), fullPage: true });
});

test('貼上金鑰 → 遮罩顯示 → 測試連線 → 選模型；金鑰只送到供應商', async ({ page }, testInfo) => {
  const seen = await mockProviders(page);
  const ownRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === '127.0.0.1') ownRequests.push(`${request.url()} ${JSON.stringify(request.headers())}`);
  });

  await page.goto('./#/settings');
  const claude = providerSection(page, 'Claude（Anthropic）');
  const input = claude.getByLabel('API 金鑰');
  await expect(input).toHaveAttribute('type', 'password');
  await claude.getByRole('button', { name: '顯示金鑰' }).click();
  await expect(input).toHaveAttribute('type', 'text');

  await input.fill(FAKE_KEY);
  await input.press('Enter');

  // 儲存後只顯示遮罩，頁面上不再有完整金鑰。
  await expect(page.getByTestId('key-mask-anthropic')).toHaveText('fak••••••••wxyz');
  await expect(page.getByTestId('key-status-anthropic')).toHaveText('已設定，尚未驗證');
  expect(await page.content()).not.toContain(FAKE_KEY);
  expect(await page.evaluate(() => localStorage.getItem('ziwei:key:anthropic'))).toBe(FAKE_KEY);

  await claude.getByRole('button', { name: '測試連線' }).click();
  await expect(claude.getByText('連線成功，可用模型 3 個。')).toBeVisible();
  await expect(page.getByTestId('key-status-anthropic')).toHaveText('已驗證');

  // 模型下拉：推薦在前，其餘在後。
  const model = page.getByRole('combobox', { name: '模型', exact: true });
  await expect(model).toHaveValue('claude-sonnet-5-5');
  await expect(model.locator('option')).toHaveText([/^claude-sonnet-5-5（推薦） \$\$/, /^claude-haiku-5-5（推薦） \$/, 'claude-future-9']);
  await model.selectOption('claude-future-9');
  await expect(page.getByText('目前提問會用：Claude（Anthropic） 的「claude-future-9」。')).toBeVisible();

  // 自訂模型 ID 優先
  await page.getByLabel(/自訂模型 ID/).fill('claude-custom-x');
  await expect(page.getByText('目前提問會用：Claude（Anthropic） 的「claude-custom-x」。')).toBeVisible();
  await expect(model).toBeDisabled();

  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath('settings-key.png'), fullPage: true });

  // 重新整理後設定與金鑰都還在
  await page.reload();
  await expect(page.getByTestId('key-mask-anthropic')).toHaveText('fak••••••••wxyz');
  await expect(page.getByLabel(/自訂模型 ID/)).toHaveValue('claude-custom-x');

  // 金鑰只出現在送往供應商的請求標頭；送往本站的請求不含金鑰。
  expect(seen.length).toBeGreaterThan(0);
  for (const call of seen) {
    expect(new URL(call.url).hostname).toBe('api.anthropic.com');
    expect(call.url).not.toContain(FAKE_KEY);
    expect(JSON.stringify(call.headers)).toContain(FAKE_KEY);
    expect(call.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  }
  for (const own of ownRequests) expect(own).not.toContain(FAKE_KEY);
});

test('金鑰無效時顯示原因與處理方式', async ({ page }) => {
  await mockProviders(page, { anthropicStatus: 401 });
  await page.goto('./#/settings');
  const claude = providerSection(page, 'Claude（Anthropic）');
  await claude.getByLabel('API 金鑰').fill(FAKE_KEY);
  await claude.getByLabel('API 金鑰').press('Enter');
  await claude.getByRole('button', { name: '測試連線' }).click();
  await expect(claude.getByText('回覆 401：金鑰無效或已撤銷。請到設定頁重新貼上金鑰。')).toBeVisible();
  await expect(page.getByTestId('key-status-anthropic')).toHaveText('驗證失敗');
});

test('供應商連不上時說明兩種可能', async ({ page }) => {
  await page.route('https://api.openai.com/**', (route) => route.abort('failed'));
  await page.goto('./#/settings');
  const openai = providerSection(page, 'OpenAI');
  await openai.getByLabel('API 金鑰').fill(FAKE_KEY);
  await openai.getByLabel('API 金鑰').press('Enter');
  await openai.getByRole('button', { name: '測試連線' }).click();
  await expect(openai.getByText(/瀏覽器連不上 OpenAI。可能是網路問題，或 OpenAI 暫時不接受瀏覽器直連/)).toBeVisible({ timeout: 15000 });
});

test('兩家都設定：OpenAI 列表過濾非文字模型；切換記住方式；清除金鑰', async ({ page }) => {
  await mockProviders(page);
  await page.goto('./#/settings');
  for (const name of ['OpenAI', 'Claude（Anthropic）']) {
    const section = providerSection(page, name);
    await section.getByLabel('API 金鑰').fill(FAKE_KEY);
    await section.getByLabel('API 金鑰').press('Enter');
  }
  const openai = providerSection(page, 'OpenAI');
  await openai.getByRole('button', { name: '測試連線' }).click();
  await expect(openai.getByText('連線成功，可用模型 2 個。')).toBeVisible();

  // 預設供應商只列已設定金鑰的
  await expect(page.getByRole('radio', { name: 'OpenAI' })).toBeChecked();
  await page.getByRole('radio', { name: 'Claude（Anthropic）' }).check({ force: true });
  await expect(page.getByText('已儲存')).toBeVisible();

  // 只記到關閉分頁：金鑰搬到 sessionStorage
  await page.getByRole('radio', { name: '只記到關閉分頁' }).check({ force: true });
  const stores = await page.evaluate(() => ({
    local: localStorage.getItem('ziwei:key:openai'),
    session: sessionStorage.getItem('ziwei:key:openai'),
  }));
  expect(stores.local).toBeNull();
  expect(stores.session).toBe(FAKE_KEY);

  await openai.getByRole('button', { name: '清除金鑰' }).click();
  await expect(page.getByTestId('key-status-openai')).toHaveText('未設定');
  expect(await page.evaluate(() => sessionStorage.getItem('ziwei:key:openai'))).toBeNull();
  await expect(page.getByRole('radio', { name: 'OpenAI' })).toHaveCount(0);
});

test('佈景主題、匯出不含金鑰、清除本站資料不動其他網站的資料', async ({ page }) => {
  await page.goto('./#/settings');
  await page.evaluate(() => localStorage.setItem('twbt_apikey', 'neighbour-site-data'));
  const claude = providerSection(page, 'Claude（Anthropic）');
  await claude.getByLabel('API 金鑰').fill(FAKE_KEY);
  await claude.getByLabel('API 金鑰').press('Enter');

  await page.getByRole('radio', { name: '夜觀（深色）' }).check({ force: true });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe('rgb(20, 33, 61)');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出全部資料' }).click();
  const file = await (await download).path();
  const exported = await readFile(file, 'utf8');
  expect(JSON.parse(exported).app).toBe('ziwei');
  expect(exported).toContain('"theme": "dark"');
  expect(exported).not.toContain(FAKE_KEY);
  await expect(page.getByText('匯出檔不含 API 金鑰。')).toBeVisible();

  await page.getByRole('button', { name: '清除本站所有資料' }).click();
  await page.getByRole('button', { name: '確定清除本站所有資料' }).click();
  await expect(page.getByTestId('key-status-anthropic')).toHaveText('未設定');
  const after = await page.evaluate(() => ({ keys: Object.keys(localStorage), neighbour: localStorage.getItem('twbt_apikey') }));
  expect(after.neighbour).toBe('neighbour-site-data');
  expect(after.keys.filter((key) => key.startsWith('ziwei:key'))).toEqual([]);
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
});

test('新手使用指南：沒有金鑰時預設展開，六個步驟，連結通往對應頁面，可以收合', async ({ page }, testInfo) => {
  await page.goto('./#/settings');
  const guide = page.locator('details', { has: page.getByText('新手使用指南', { exact: true }) });
  await expect(guide).toHaveAttribute('open', '');
  await expect(guide.locator('ol > li')).toHaveCount(6);
  await expect(guide.getByRole('heading', { level: 3, name: /第 3 步：\s*取得並貼上 API 金鑰/ })).toBeVisible();
  await expect(guide.getByText('命盤由排盤程式計算，AI 只負責解讀，不會更動盤上的星曜。')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('guide.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  await guide.locator('summary').click();
  await expect(guide.locator('ol')).toBeHidden();
  await guide.locator('summary').click();
  await guide.getByRole('link', { name: '從命盤截圖帶入' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '從命盤截圖帶入' })).toBeVisible({ timeout: 30_000 });
});

test('新手使用指南：已經設定金鑰時預設收合', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ziwei:key:anthropic', 'fake-key-for-e2e-0000000000000-wxyz'));
  await page.goto('./#/settings');
  const guide = page.locator('details', { has: page.getByText('新手使用指南', { exact: true }) });
  await expect(guide.locator('summary')).toBeVisible();
  await expect(guide).not.toHaveAttribute('open', '');
});

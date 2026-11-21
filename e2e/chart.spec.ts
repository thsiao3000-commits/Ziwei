import { expect, test, type Page } from '@playwright/test';

const ALLOWED_HOSTS = new Set(['127.0.0.1', 'api.openai.com', 'api.anthropic.com']);

// 虛構的測試生日（iztro 文件範例），不是任何人的真實資料。
const BIRTH = { name: '小明', year: '2000', month: '8', day: '16', clock: '04:10' };

function watchRequests(page: Page) {
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  return urls;
}

async function fillForm(page: Page) {
  await page.getByLabel('稱呼').fill(BIRTH.name);
  await page.getByRole('radio', { name: '女' }).check({ force: true });
  await page.getByLabel('年（西元）').fill(BIRTH.year);
  await page.getByLabel('月', { exact: true }).selectOption(BIRTH.month);
  await page.getByLabel('日', { exact: true }).selectOption(BIRTH.day);
  await page.getByLabel('時鐘時間').fill(BIRTH.clock);
}

test('填表單 → 命盤出現 → 點宮位看到三方四正', async ({ page }, testInfo) => {
  const urls = watchRequests(page);
  await page.goto('./');
  await fillForm(page);

  // 時鐘時間與時辰同步
  await expect(page.getByLabel('或直接選時辰')).toHaveValue('2');
  await expect(page.locator('[aria-live="polite"]')).toHaveText('寅時 03:00–05:00');

  await page.getByRole('button', { name: '排出命盤' }).click();

  await expect(page).toHaveURL(/#\/chart\/[a-z0-9]{16}$/);
  await expect(page.getByRole('heading', { level: 1, name: '小明的命盤' })).toBeVisible();

  const board = page.getByRole('group', { name: '小明的命盤' });
  await expect(board.getByRole('button')).toHaveCount(12);
  await expect(board).toContainText('木三局');
  await expect(board).toContainText('庚辰 甲申 丙午 庚寅');
  await expect(board).toContainText('二〇〇〇年七月十七');

  // 命宮在午，主星紫微（廟）
  const soul = board.getByRole('button', { name: /^命宮，壬午/ });
  await expect(soul).toHaveAccessibleName(/主星：紫微（廟）/);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1400); // 等落位動畫結束再截圖
  await page.screenshot({ path: testInfo.outputPath('chart.png'), fullPage: true });

  // 頁面不可比視窗寬（橫向捲動列必須留在自己的容器裡）。
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await soul.click();
  await expect(soul).toHaveAttribute('aria-pressed', 'true');
  // 三方四正：本宮、對宮（遷移）、財帛位、官祿位
  const related = board.locator('[data-related="true"]');
  await expect(related).toHaveCount(4);
  const names = await related.evaluateAll((nodes) => nodes.map((node) => node.querySelector('.sr-only')?.textContent?.split('，')[0]));
  expect(new Set(names)).toEqual(new Set(['命宮', '遷移', '財帛', '官祿']));

  const detail = page.getByRole('heading', { level: 2, name: '命宮' }).locator('visible=true');
  await expect(detail).toBeVisible();
  const panel = page.locator('aside, [role=dialog]').locator('visible=true').filter({ hasText: '三方四正' });
  await expect(panel).toContainText('對宮');
  await expect(panel).toContainText('遷移（子）');
  await expect(panel).toContainText('財帛（寅）');
  await expect(panel).toContainText('官祿（戌）');
  await expect(panel).toContainText('宮干飛化');
  await page.screenshot({ path: testInfo.outputPath('chart-selected.png'), fullPage: true });

  await panel.getByRole('button', { name: '關閉' }).click();
  await expect(soul).toHaveAttribute('aria-pressed', 'false');

  // 鍵盤：方向鍵在宮位間移動，Enter 開詳情
  await soul.focus();
  await page.keyboard.press('ArrowRight');
  await expect(board.getByRole('button', { name: /^父母，癸未/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(board.getByRole('button', { name: /^遷移，戊子/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 2 }).locator('visible=true').first()).toBeVisible();

  // 出生資料與稱呼不進網址；整段流程沒有第三方請求。
  for (const url of urls) {
    const parsed = new URL(url);
    if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') continue;
    expect(ALLOWED_HOSTS.has(parsed.hostname), `第三方請求：${url}`).toBe(true);
    const decoded = decodeURIComponent(url);
    expect(decoded).not.toContain(BIRTH.name);
    expect(decoded).not.toMatch(/2000-0?8-16/);
  }
  expect(decodeURIComponent(page.url())).not.toContain(BIRTH.name);
  expect(page.url()).not.toContain('2000');
});

test('命盤存在本機：重新整理仍在，出現在我的命盤，可以刪除', async ({ page }) => {
  await page.goto('./');
  await fillForm(page);
  await page.getByRole('button', { name: '排出命盤' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '小明的命盤' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: '小明的命盤' })).toBeVisible();
  await expect(page.getByRole('group', { name: '小明的命盤' }).getByRole('button')).toHaveCount(12);

  // 儲存隔離：鍵名都有 ziwei: 前綴，資料庫只有 ziwei-db。
  const storage = await page.evaluate(async () => ({
    keys: Object.keys(localStorage),
    databases: (await indexedDB.databases()).map((db) => db.name),
  }));
  for (const key of storage.keys) expect(key.startsWith('ziwei:')).toBe(true);
  expect(storage.databases).toEqual(['ziwei-db']);

  await page.goto('./#/charts');
  await expect(page.getByRole('link', { name: '小明', exact: true })).toBeVisible();
  await expect(page.getByText('命宮：紫微')).toBeVisible();

  await page.getByRole('button', { name: '刪除命盤「小明」' }).click();
  await page.getByRole('button', { name: '確定刪除「小明」與它的對話' }).click();
  await expect(page.getByText('還沒有命盤。輸入出生資料，排出第一張。')).toBeVisible();
});

test('表單檢核：缺欄位、閏月、子時說明、不存在的日期', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '排出命盤' }).click();
  await expect(page.getByRole('alert')).toContainText('請選擇性別');

  await page.getByRole('radio', { name: '男' }).check({ force: true });
  await page.getByRole('radio', { name: '農曆' }).check({ force: true });
  await page.getByLabel('年（西元）').fill('2020');
  await page.getByLabel('月', { exact: true }).selectOption('5');
  const leap = page.getByRole('checkbox', { name: '閏月' });
  await expect(leap).toBeDisabled();
  await expect(page.getByText('農曆 2020 年沒有閏 5 月')).toBeVisible();

  await page.getByLabel('月', { exact: true }).selectOption('4');
  await expect(leap).toBeEnabled();
  await expect(page.getByText('農曆 2020 年有閏 4 月')).toBeVisible();

  // 農曆 2020 年六月是小月，沒有三十日
  await page.getByLabel('月', { exact: true }).selectOption('6');
  await page.getByLabel('日', { exact: true }).selectOption('30');
  await page.getByLabel('或直接選時辰').selectOption('12');
  await expect(page.getByText('子時跨午夜，分成兩段')).toBeVisible();
  await page.getByRole('button', { name: '排出命盤' }).click();
  await expect(page.getByRole('alert')).toContainText('沒有 30 日');
  await expect(page).not.toHaveURL(/chart/);

  // 國曆的日數跟著月份變
  await page.getByRole('radio', { name: '國曆' }).check({ force: true });
  await page.getByLabel('年（西元）').fill('2001');
  await page.getByLabel('月', { exact: true }).selectOption('2');
  await expect(page.getByLabel('日', { exact: true }).locator('option')).toHaveCount(29); // 「日」＋28 天
});

test('開啟不存在的命盤時說明原因', async ({ page }) => {
  await page.goto('./#/chart/doesnotexist00000');
  await expect(page.getByRole('heading', { level: 1, name: '找不到這張命盤' })).toBeVisible();
});

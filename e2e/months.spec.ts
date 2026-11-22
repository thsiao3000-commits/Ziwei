import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

// 假字串，不是任何真實金鑰。虛構的測試生日。
const FAKE_KEY = 'fake-key-for-e2e-0000000000000-wxyz';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

type Body = { system: string; messages: { role: string; content: string }[] };

function sse(text: string): string {
  const events: [string, unknown][] = [
    ['message_start', { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } }],
    ['message_stop', { type: 'message_stop' }],
  ];
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

async function openMonths(page: Page) {
  await page.goto('./');
  await page.getByLabel('稱呼').fill('小明');
  await page.getByRole('radio', { name: '女' }).check({ force: true });
  await page.getByLabel('年（西元）').fill('2000');
  await page.getByLabel('月', { exact: true }).selectOption('8');
  await page.getByLabel('日', { exact: true }).selectOption('16');
  await page.getByLabel('或直接選時辰').selectOption('2');
  await page.getByRole('button', { name: '排出命盤' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '小明的命盤' })).toBeVisible();
  await page.getByRole('link', { name: '流月財運一覽' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '流月財運一覽' })).toBeVisible({ timeout: 30_000 });
}

test('流月財運一覽：預設今年，十二個流月的落點由程式算出，並說明這是傳統看法', async ({ page }, testInfo) => {
  await openMonths(page);
  const year = page.getByLabel('要看的年份');
  await expect(year).toHaveValue(String(new Date().getFullYear()));
  await expect(year.locator('option').first()).toHaveText('2000 年');
  await year.selectOption('2026');

  await expect(page.getByText('這是紫微斗數的傳統看法，沒有統計驗證。')).toBeVisible();
  await expect(page.getByText(/減碼與停損只看你原本的分析，不受流月影響。/)).toBeVisible();

  const table = page.getByRole('table', { name: '2026 年的流月' });
  await expect(table.locator('tbody tr')).toHaveCount(12);
  await expect(table.getByRole('columnheader')).toHaveText(['流月（農曆）', '國曆期間', '落在命財福田', '干支', '流月命宮落在', '化祿', '化權', '化科', '化忌']);
  await expect(table.getByRole('row', { name: /^正月/ }).getByRole('cell')).toHaveText(['2026/2/17–3/18', '權入財帛', '庚寅', '財帛', '太陽 → 子女', '武曲 → 財帛', '太陰 → 僕役', '天同 → 疾厄']);
  await expect(table.getByRole('row', { name: /^臘月/ })).toContainText('2027/1/8–2/5');
  // 跨年的流月，訖日仍寫出年份。
  await expect(table.getByRole('row', { name: /^冬月/ })).toContainText('2026/12/9–2027/1/7');
  await expect(table.getByRole('row', { name: /^八月/ }).getByRole('cell').nth(1)).toHaveText('沒有');

  // 有閏月的年份
  await year.selectOption('2025');
  await expect(page.getByRole('table', { name: '2025 年的流月' }).getByRole('row', { name: /^閏六月（前半）/ })).toBeVisible();
  await year.selectOption('2026');

  // 沒有金鑰：表格照樣能看，只是不能請 AI 判讀
  await expect(page.getByText('請 AI 判讀需要 API 金鑰。')).toBeVisible();
  await expect(page.getByRole('button', { name: /請 AI 判讀/ })).toHaveCount(0);

  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath('months.png'), fullPage: true });
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.target.join(' ')}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('流月財運一覽：請 AI 判讀時送出程式算好的流月表與那一年的流年', async ({ page }) => {
  const bodies: Body[] = [];
  await page.addInitScript((key) => localStorage.setItem('ziwei:key:anthropic', key), FAKE_KEY);
  await page.route('https://api.anthropic.com/**', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    bodies.push(route.request().postDataJSON() as Body);
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sse('以下是傳統看法，沒有統計驗證。正月傳統上偏順。') });
  });
  await openMonths(page);
  await page.getByLabel('要看的年份').selectOption('2026');
  await page.getByRole('button', { name: '請 AI 判讀 2026 年的流月財運' }).click();

  await expect(page.getByRole('heading', { level: 1, name: '小明的命盤' })).toBeVisible();
  // 桌機的解讀在側欄、手機在命盤下方：取看得到的那一個。
  const reading = page.locator('aside, #reading-section').locator('visible=true').filter({ has: page.getByRole('heading', { level: 2, name: '解讀' }) });
  await expect(reading.getByText('以下是傳統看法，沒有統計驗證。正月傳統上偏順。')).toBeVisible();
  await expect(reading.getByText('已帶入：2026 年流月、2026 年流年')).toBeVisible();

  expect(bodies).toHaveLength(1);
  const content = bodies[0]!.messages[0]!.content;
  expect(content).toContain('請看我 2026 年各流月的財運。');
  expect(content).toContain('沒有統計驗證');
  expect(content).toContain('不要提任何投資標的或價位');
  expect(content).toContain('【2026 農曆年各流月（由排盤程式計算；');
  expect(content).toContain('農曆正月（國曆 2026/2/17–2026/3/18）｜庚寅｜流月命宮落在本命財帛');
  expect(content).toContain('以「可貼上的流月過濾」為標題');
  expect(content).toContain('國曆期間照補充資料逐字抄寫（含年份）');
  expect(content).toContain('【流年 2026】');
  for (const secret of ['小明', '2000-8-16', FAKE_KEY]) expect(JSON.stringify(bodies[0])).not.toContain(secret);
});

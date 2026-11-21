import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

// 假字串，不是任何真實金鑰。虛構的測試生日。
const FAKE_KEY = 'fake-key-for-e2e-0000000000000-wxyz';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

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

async function castChart(page: Page) {
  await page.goto('./');
  await page.getByLabel('稱呼').fill('小明');
  await page.getByRole('radio', { name: '女' }).check({ force: true });
  await page.getByLabel('年（西元）').fill('2000');
  await page.getByLabel('月', { exact: true }).selectOption('8');
  await page.getByLabel('日', { exact: true }).selectOption('16');
  await page.getByLabel('時鐘時間').fill('04:10');
  await page.getByRole('button', { name: '排出命盤' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '小明的命盤' })).toBeVisible();
}

test('時辰對照：十三個時辰的重點、相鄰三張盤並排、改用另一個時辰', async ({ page }, testInfo) => {
  await castChart(page);
  await page.getByRole('link', { name: '不確定出生時辰？比較相鄰時辰的命盤' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '時辰對照' })).toBeVisible();
  await expect(page).toHaveURL(/#\/rectify\/[a-z0-9]{16}$/);

  const summary = page.getByRole('table', { name: '十三個時辰的命盤重點' });
  await expect(summary.locator('tbody tr')).toHaveCount(13);
  const current = summary.getByRole('row', { name: /寅時/ });
  await expect(current).toContainText('目前');
  await expect(current).toContainText('紫微(廟)');
  await expect(current).toContainText('官祿（戌）');
  await expect(current).toContainText('木三局');
  await expect(current).toContainText('3 歲');

  // 預設並排：目前的時辰與前後各一個
  await expect(page.getByRole('heading', { level: 2, name: '丑時、寅時、卯時並排' })).toBeVisible();
  await expect(page.getByRole('group', { name: '寅時的命盤（目前）' }).getByRole('button')).toHaveCount(12);
  await expect(page.getByRole('group', { name: '卯時的命盤' })).toBeVisible();
  const stars = page.getByRole('table', { name: '逐宮主星對照' });
  await expect(stars.locator('tbody tr')).toHaveCount(12);
  await expect(stars.getByRole('row', { name: /^命宮/ })).toContainText('紫微');

  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await page.screenshot({ path: testInfo.outputPath('rectify.png'), fullPage: true });

  // 無障礙與水平溢出
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.target.join(' ')}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  // 換一個中心：午時 → 巳、午、未
  await summary.getByRole('row', { name: /午時/ }).getByRole('button', { name: /並排比較/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: '巳時、午時、未時並排' })).toBeVisible();
  // 頭尾不繞回
  await summary.getByRole('row', { name: /晚子時/ }).getByRole('button', { name: /並排比較/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: '亥時、晚子時並排' })).toBeVisible();

  // 另存成新命盤：原本的命盤不動
  await summary.getByRole('row', { name: /寅時/ }).getByRole('button', { name: /並排比較/ }).click();
  await page.getByRole('button', { name: '把卯時另存成新命盤' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '小明（卯時）的命盤' })).toBeVisible();
  await expect(page.getByRole('group', { name: '小明（卯時）的命盤' })).toContainText('卯時');

  await page.goto('./#/charts');
  await expect(page.getByRole('listitem')).toHaveCount(2);
  await page.getByRole('link', { name: '小明', exact: true }).click();
  await expect(page.getByRole('group', { name: '小明的命盤' })).toContainText('寅時');

  // 把這張命盤改成丑時
  await page.getByRole('link', { name: '不確定出生時辰？比較相鄰時辰的命盤' }).click();
  await page.getByRole('button', { name: '把這張命盤改成丑時' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '小明的命盤' })).toBeVisible();
  const board = page.getByRole('group', { name: '小明的命盤' });
  await expect(board).toContainText('丑時');
  await expect(board.getByRole('button', { name: /^命宮，癸未/ })).toBeVisible();
  await page.reload();
  await expect(board).toContainText('丑時');
});

test('時辰對照：請 AI 列出分辨時辰的問題', async ({ page }) => {
  const bodies: { messages: { role: string; content: string }[] }[] = [];
  await page.addInitScript((key) => localStorage.setItem('ziwei:key:anthropic', key), FAKE_KEY);
  await page.route('https://api.anthropic.com/**', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    bodies.push(route.request().postDataJSON() as { messages: { role: string; content: string }[] });
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sse('可以用這幾個問題來分辨。') });
  });

  await castChart(page);
  await page.getByRole('link', { name: '不確定出生時辰？比較相鄰時辰的命盤' }).click();
  await page.getByRole('button', { name: '請 AI 列出分辨這3個時辰的問題' }).click();

  await expect(page.getByRole('heading', { level: 1, name: '小明的命盤' })).toBeVisible();
  const reading = page.locator('aside, #reading-section').locator('visible=true').filter({ has: page.getByRole('heading', { level: 2, name: '解讀' }) });
  await expect(reading.getByText('已帶入：定盤候選（丑時、寅時、卯時）')).toBeVisible();
  await expect(reading.getByText('可以用這幾個問題來分辨。')).toBeVisible();

  expect(bodies).toHaveLength(1);
  const sent = bodies[0]!.messages[0]!.content;
  expect(sent).toContain('我不確定自己的出生時辰');
  expect(sent).toContain('【定盤候選】');
  expect(sent).toContain('寅時（03:00–05:00）〔目前排的盤〕：命宮在午');
  expect(sent).toContain('卯時（05:00–07:00）：命宮在巳');
  expect(sent).not.toContain('小明');

  // 重新整理不會再問一次
  await page.reload();
  await expect(reading.getByText('可以用這幾個問題來分辨。')).toBeVisible();
  await page.waitForTimeout(800);
  expect(bodies).toHaveLength(1);
});

test('時辰對照：沒有金鑰時引導到設定；找不到命盤時說明', async ({ page }) => {
  await castChart(page);
  await page.getByRole('link', { name: '不確定出生時辰？比較相鄰時辰的命盤' }).click();
  await expect(page.getByText('需要先設定 API 金鑰。')).toBeVisible();
  await expect(page.getByRole('button', { name: /請 AI 列出/ })).toHaveCount(0);

  await page.goto('./#/rectify/doesnotexist00000');
  await expect(page.getByRole('heading', { level: 1, name: '找不到這張命盤' })).toBeVisible();
});

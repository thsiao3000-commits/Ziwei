import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

// 假字串，不是任何真實金鑰。兩組虛構的測試生日。
const FAKE_KEY = 'fake-key-for-e2e-0000000000000-wxyz';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

type Body = { system: string; messages: { role: string; content: string }[] };

function sse(text: string): string {
  const events: [string, unknown][] = [
    ['message_start', { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 3000, output_tokens: 1 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 500 } }],
    ['message_stop', { type: 'message_stop' }],
  ];
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

async function cast(page: Page, person: { name: string; gender: '男' | '女'; year: string; month: string; day: string; slot: string }) {
  await page.goto('./');
  await page.getByLabel('稱呼').fill(person.name);
  await page.getByRole('radio', { name: person.gender }).check({ force: true });
  await page.getByLabel('年（西元）').fill(person.year);
  await page.getByLabel('月', { exact: true }).selectOption(person.month);
  await page.getByLabel('日', { exact: true }).selectOption(person.day);
  await page.getByLabel('或直接選時辰').selectOption(person.slot);
  await page.getByRole('button', { name: '排出命盤' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `${person.name}的命盤` })).toBeVisible();
}

const MING = { name: '小明', gender: '女', year: '2000', month: '8', day: '16', slot: '2' } as const;
const HUA = { name: '阿華', gender: '男', year: '1995', month: '7', day: '7', slot: '0' } as const;

test('只有一張命盤時，說明需要兩張', async ({ page }) => {
  await cast(page, MING);
  await page.getByRole('link', { name: '和另一張命盤合盤' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '合盤' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('合盤需要兩張命盤，目前這台裝置上只有 1 張。')).toBeVisible();
  await expect(page.getByRole('link', { name: '前往排盤' })).toBeVisible();
});

test('合盤：選兩張盤 → 並排、交互關係、逐宮對照 → 請 AI 比較', async ({ page }, testInfo) => {
  const bodies: Body[] = [];
  await page.addInitScript((key) => localStorage.setItem('ziwei:key:anthropic', key), FAKE_KEY);
  await page.route('https://api.anthropic.com/**', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    bodies.push(route.request().postDataJSON() as Body);
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sse('甲重主導，乙重感受，兩人互補。\n\n<followups>\n金錢上要怎麼分工？\n</followups>') });
  });

  await cast(page, MING);
  await cast(page, HUA);
  // 從阿華的命盤進合盤：甲已經帶入。
  await page.getByRole('link', { name: '和另一張命盤合盤' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '合盤' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('甲', { exact: true })).toHaveValue(/.+/);
  await expect(page.getByText('請選擇要比較的另一張命盤（乙）。')).toBeVisible();
  // 乙的選單不會列出已經選為甲的那一張。
  await expect(page.getByLabel('乙', { exact: true }).locator('option')).toHaveCount(2);
  await page.getByLabel('乙', { exact: true }).selectOption({ label: '小明（女，國曆 2000 年 8 月 16 日）' });
  await expect(page).toHaveURL(/#\/compare\/[a-z0-9]{16}\/[a-z0-9]{16}$/);

  // 兩張盤並排
  await expect(page.getByRole('group', { name: '甲：阿華的命盤' }).getByRole('button')).toHaveCount(12);
  await expect(page.getByRole('group', { name: '乙：小明的命盤' }).getByRole('button')).toHaveCount(12);

  // 交互關係與對照表
  await expect(page.getByText(/阿華的命宮（未）落在小明的.+宮。/)).toBeVisible();
  await expect(page.getByText(/小明的命宮（午）落在阿華的.+宮。/)).toBeVisible();
  const cross = page.getByRole('table', { name: '生年四化互入' });
  await expect(cross.locator('tbody tr')).toHaveCount(4);
  await expect(cross.getByRole('row', { name: /^化祿/ })).toContainText('太陽 →');
  // 宮名不會出現「命宮宮」這種重複。
  await expect(page.getByText('宮宮')).toHaveCount(0);
  const stars = page.getByRole('table', { name: '逐宮主星對照' });
  await expect(stars.locator('tbody tr')).toHaveCount(12);
  await expect(stars.getByRole('row', { name: /^命宮/ })).toContainText('紫微(廟)');

  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await page.screenshot({ path: testInfo.outputPath('compare.png'), fullPage: true });

  // 無障礙與水平溢出
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.target.join(' ')}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  // 請 AI 比較
  const reading = page.locator('#reading-section');
  await expect(reading.getByRole('heading', { level: 2, name: '合盤解讀' })).toBeVisible();
  await expect(reading.getByText('AI 的回覆會用「甲」「乙」稱呼這兩張盤：甲是阿華，乙是小明。')).toBeVisible();
  await expect(reading.getByText('稱呼與出生年月日不會送出。')).toBeVisible();
  await reading.getByRole('button', { name: '感情相處' }).click();
  await expect(reading.getByText('甲重主導，乙重感受，兩人互補。')).toBeVisible();
  await expect(reading.getByRole('button', { name: '金錢上要怎麼分工？' })).toBeVisible();
  // 3000 × $2 + 500 × $10，每百萬 token
  await expect(reading.getByText(/輸入 3,000、輸出 500 token\s+約 US\$0\.011/)).toBeVisible();

  expect(bodies).toHaveLength(1);
  const { system, messages } = bodies[0]!;
  expect(system).toContain('【合盤】這次是比較兩張命盤的互動');
  expect(system).toContain('＝＝＝ 甲 ＝＝＝');
  expect(system).toContain('＝＝＝ 乙 ＝＝＝');
  expect(system).toContain('【兩盤的交互關係（由排盤程式計算）】');
  expect(system.match(/【本命十二宮】/g)).toHaveLength(2);
  expect(messages).toHaveLength(1);
  expect(messages[0]!.content).toBe('如果這兩個人是伴侶，感情上怎麼互動？互補與容易摩擦的地方各是什麼？');
  for (const secret of ['小明', '阿華', '2000-8-16', '1995-7-7', FAKE_KEY]) expect(JSON.stringify(bodies[0])).not.toContain(secret);

  // 追問：帶前一輪
  await reading.getByRole('button', { name: '金錢上要怎麼分工？' }).click();
  await expect(reading.getByText('甲重主導，乙重感受，兩人互補。')).toHaveCount(2);
  expect(bodies[1]!.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);

  // 重新整理後對話還在
  await page.reload();
  await expect(page.locator('#reading-section').getByText('甲重主導，乙重感受，兩人互補。').first()).toBeVisible({ timeout: 30_000 });

  // 甲乙對調：換成另一段對話紀錄
  await page.getByRole('button', { name: '甲乙對調' }).click();
  await expect(page.getByRole('group', { name: '甲：小明的命盤' })).toBeVisible();
  await expect(page.locator('#reading-section').getByText('AI 的回覆會用「甲」「乙」稱呼這兩張盤：甲是小明，乙是阿華。')).toBeVisible();
  await expect(page.locator('#reading-section').getByText('甲重主導，乙重感受，兩人互補。')).toHaveCount(0);

  // 各自命盤的對話不受合盤影響
  await page.getByRole('link', { name: '開啟這張命盤' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: '小明的命盤' })).toBeVisible();
  await expect(page.getByText('甲重主導，乙重感受，兩人互補。')).toHaveCount(0);
});

test('從我的命盤進合盤', async ({ page }) => {
  await cast(page, MING);
  await cast(page, HUA);
  await page.goto('./#/charts');
  await page.getByRole('link', { name: '用命盤「小明」合盤' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '合盤' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('甲', { exact: true }).locator('option:checked')).toContainText('小明');
});

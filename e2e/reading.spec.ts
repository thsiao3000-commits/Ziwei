import { expect, test, type Page, type Route } from '@playwright/test';

// 假字串，不是任何真實金鑰。虛構的測試生日。
const FAKE_KEY = 'fake-key-for-e2e-0000000000000-wxyz';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
const ALLOWED_HOSTS = new Set(['127.0.0.1', 'api.openai.com', 'api.anthropic.com']);

type Body = { model: string; system: string; messages: { role: string; content: string }[]; stream?: boolean };

function anthropicSse(text: string): string {
  const chunks = text.match(/[\s\S]{1,12}/g) ?? [];
  const events: [string, unknown][] = [
    [
      'message_start',
      {
        type: 'message_start',
        message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1234, output_tokens: 1 } },
      },
    ],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }],
    ...chunks.map((chunk): [string, unknown] => ['content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: chunk } }]),
    ['content_block_stop', { type: 'content_block_stop', index: 1 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 321 } }],
    ['message_stop', { type: 'message_stop' }],
  ];
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

const REPLIES = [
  '**結論**：命宮紫微坐守，格局穩重。\n\n- 依據：命宮紫微(廟)，會照財帛宮武曲化權\n- <b>不該被渲染的標籤</b>\n\n<followups>\n那事業方面要注意什麼？\n化忌在疾厄宮代表什麼？\n</followups>',
  '事業看官祿宮廉貞天府。\n\n<followups>\n今年適合換工作嗎？\n</followups>',
  '2030 年是庚戌年，流年命宮在官祿。',
];

async function setup(page: Page, options: { failAt?: number } = {}) {
  const bodies: Body[] = [];
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.addInitScript((key) => {
    if (!sessionStorage.getItem('e2e-seeded')) {
      localStorage.setItem('ziwei:key:anthropic', key);
      sessionStorage.setItem('e2e-seeded', '1');
    }
  }, FAKE_KEY);

  await page.route('https://api.anthropic.com/**', async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (request.method() !== 'POST') {
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ data: [], has_more: false, first_id: null, last_id: null }) });
    }
    bodies.push(request.postDataJSON() as Body);
    const index = bodies.length - 1;
    if (options.failAt === index) {
      return route.fulfill({
        status: 400,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'prompt is too long: 1200000 tokens > 1000000 maximum' } }),
      });
    }
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: anthropicSse(REPLIES[index] ?? '好的。') });
  });
  return { bodies, requests };
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

/** 桌機在側欄、手機在命盤下方，取看得到的那一個。 */
function panel(page: Page) {
  return page.locator('aside, #reading-section').locator('visible=true').filter({ has: page.getByRole('heading', { level: 2, name: '解讀' }) });
}

test('沒有金鑰時：命盤可用，解讀面板引導到設定', async ({ page }) => {
  await castChart(page);
  const reading = panel(page);
  await expect(reading.getByText('需要先設定你自己的 OpenAI 或 Claude API 金鑰')).toBeVisible();
  await reading.getByRole('link', { name: '前往設定' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '設定' })).toBeVisible();
});

test('提問 → 串流文字 → 點建議追問 → 第二則回覆含前一輪對話；資料不外流', async ({ page }, testInfo) => {
  const { bodies, requests } = await setup(page);
  await castChart(page);
  const reading = panel(page);

  await reading.getByRole('button', { name: '命盤總論' }).click();

  await expect(reading.getByLabel('對話內容').getByText('請幫我看整張命盤的重點。')).toBeVisible();
  await expect(reading.getByText('已帶入：命宮')).toBeVisible();
  await expect(reading.getByText('命宮紫微坐守，格局穩重。')).toBeVisible();
  await expect(reading.locator('strong', { hasText: '結論' })).toBeVisible();
  // 建議追問區塊不出現在正文，變成可以點的追問。
  await expect(reading.getByText('<followups>')).toHaveCount(0);
  const followup = reading.getByRole('button', { name: '那事業方面要注意什麼？' });
  await expect(followup).toBeVisible();
  await expect(reading.getByRole('button', { name: '化忌在疾厄宮代表什麼？' })).toBeVisible();
  // Markdown 不渲染原始 HTML：標籤當成文字顯示。
  await expect(reading.locator('[data-reply] b')).toHaveCount(0);
  await expect(reading.getByText('<b>不該被渲染的標籤</b>')).toBeVisible();
  // 每則回覆標示所用模型與用量。
  await expect(reading.getByText(/Claude（Anthropic）\s+claude-sonnet-5-5\s+輸入 1,234、輸出 321 token/)).toBeVisible();

  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath('reading.png'), fullPage: true });

  await followup.click();
  await expect(reading.getByText('事業看官祿宮廉貞天府。')).toBeVisible();
  // 舊回覆的追問收起，只留最新一則的。
  await expect(reading.getByRole('button', { name: '化忌在疾厄宮代表什麼？' })).toHaveCount(0);
  await expect(reading.getByRole('button', { name: '今年適合換工作嗎？' })).toBeVisible();
  await expect(reading.getByText('追問會重送整段對話')).toBeVisible();

  // 第二次請求內含前一輪對話；回覆只送正文。
  expect(bodies).toHaveLength(2);
  const second = bodies[1]!;
  expect(second.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
  expect(second.messages[0]!.content).toContain('請幫我看整張命盤的重點。');
  expect(second.messages[0]!.content).toContain('【三方四正】');
  expect(second.messages[1]!.content).toContain('命宮紫微坐守');
  expect(second.messages[1]!.content).not.toContain('followups');
  expect(second.messages[2]!.content).toBe('那事業方面要注意什麼？');

  // 系統提示詞帶命盤與四柱，但預設不含稱呼、生日與時辰。
  for (const body of bodies) {
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.system).toContain('【本命十二宮】');
    expect(body.system).toContain('命宮（壬午）｜主星：紫微(廟)');
    expect(body.system).toContain('【目前運限】');
    const sent = JSON.stringify(body);
    expect(body.system).toContain('【四柱】庚辰 甲申 丙午 庚寅');
    for (const secret of ['小明', '2000-8-16', '二〇〇〇', '七月十七', '寅時', FAKE_KEY]) {
      expect(sent, `請求內文不應包含 ${secret}`).not.toContain(secret);
    }
    for (const key of ['thinking', 'temperature', 'output_config']) expect(body).not.toHaveProperty(key);
  }

  // 自由輸入：Enter 送出；提到年份時帶入該年流年。
  const input = reading.getByRole('textbox', { name: '提問', exact: true });
  await input.fill('2030 年會遇到什麼樣的人？');
  await input.press('Enter');
  await expect(reading.getByText('已帶入：2030 年流年')).toBeVisible();
  await expect(reading.getByText('2030 年是庚戌年，流年命宮在官祿。')).toBeVisible();
  expect(bodies[2]!.messages.at(-1)!.content).toContain('【流年 2030】');
  expect(bodies[2]!.messages).toHaveLength(5);

  // 對話存在本機：重新整理後仍在。
  await page.reload();
  const after = panel(page);
  await expect(after.getByText('事業看官祿宮廉貞天府。')).toBeVisible();
  await expect(after.getByText('2030 年是庚戌年，流年命宮在官祿。')).toBeVisible();
  await expect(after.getByLabel('對話', { exact: true })).toHaveValue(/.+/);

  // 資料不外流：只有本站與供應商；送往本站的請求不含出生資料與金鑰。
  for (const url of requests) {
    const parsed = new URL(url);
    if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') continue;
    expect(ALLOWED_HOSTS.has(parsed.hostname), `第三方請求：${url}`).toBe(true);
    const decoded = decodeURIComponent(url);
    for (const secret of ['小明', '2000-8-16', '2000-08-16', FAKE_KEY]) expect(decoded).not.toContain(secret);
  }
});

test('解讀這個宮位、開新對話、重新命名與刪除', async ({ page }) => {
  const { bodies } = await setup(page);
  await castChart(page);
  const board = page.getByRole('group', { name: '小明的命盤' });
  await board.getByRole('button', { name: /^官祿，丙戌/ }).click();

  const detail = page.locator('aside, [role=dialog]').locator('visible=true').filter({ hasText: '宮干飛化' });
  await detail.getByRole('button', { name: '解讀這個宮位' }).click();

  const reading = panel(page);
  await expect(reading.getByLabel('對話內容').getByText('請解讀我的官祿宮。')).toBeVisible();
  await expect(reading.getByText('已帶入：官祿')).toBeVisible();
  await expect(reading.getByText('命宮紫微坐守，格局穩重。')).toBeVisible();
  expect(bodies[0]!.messages[0]!.content).toContain('官祿：官祿(戌)、夫妻(辰)、命宮(午)、財帛(寅)');
  // 選中宮位時，快捷提問多一個「解讀這一宮」。
  await expect(reading.getByRole('button', { name: '解讀這一宮' })).toBeVisible();

  await reading.getByRole('button', { name: '重新命名' }).click();
  await reading.getByLabel('對話名稱').fill('官祿宮討論');
  await reading.getByRole('button', { name: '儲存名稱' }).click();
  await expect(reading.getByLabel('對話', { exact: true }).locator('option:checked')).toHaveText('官祿宮討論');

  await reading.getByRole('button', { name: '開新對話' }).click();
  await expect(reading.getByLabel('對話內容').getByText('請解讀我的官祿宮。')).toHaveCount(0);
  await reading.getByRole('button', { name: '財運' }).click();
  await expect(reading.getByText('事業看官祿宮廉貞天府。')).toBeVisible();
  // 新對話不帶舊對話的訊息。
  expect(bodies[1]!.messages).toHaveLength(1);
  await expect(reading.getByLabel('對話', { exact: true }).locator('option')).toHaveCount(2);

  await reading.getByRole('button', { name: '刪除對話' }).click();
  await reading.getByRole('button', { name: '確定刪除這段對話' }).click();
  await expect(reading.getByLabel('對話', { exact: true }).locator('option')).toHaveCount(1);
  await expect(reading.getByLabel('對話內容').getByText('請解讀我的官祿宮。')).toBeVisible();
});

test('供應商回報錯誤：說明原因，可重新產生', async ({ page }) => {
  const { bodies } = await setup(page, { failAt: 0 });
  await castChart(page);
  const reading = panel(page);
  await reading.getByRole('button', { name: '事業' }).click();
  await expect(reading.getByRole('alert')).toContainText('回覆 400：對話太長，超過這個模型一次能讀的長度。請開新對話。');

  await reading.getByRole('button', { name: '重新產生' }).click();
  await expect(reading.getByText('事業看官祿宮廉貞天府。')).toBeVisible();
  await expect(reading.getByRole('alert')).toHaveCount(0);
  // 重新產生不會把失敗的那一則送回去。
  expect(bodies[1]!.messages).toHaveLength(1);
});

test('開啟「附上出生年月日」後才送出稱呼與生日', async ({ page }) => {
  const { bodies } = await setup(page);
  await castChart(page);
  const chartUrl = page.url();
  await page.goto('./#/settings');
  await page.getByRole('checkbox', { name: /提問時附上出生年月日/ }).check();
  await page.goto(chartUrl);
  const reading = panel(page);
  await expect(reading.getByText('（含四柱、稱呼與出生年月日）')).toBeVisible();
  await reading.getByRole('button', { name: '性格與天賦' }).click();
  await expect(reading.getByText('命宮紫微坐守，格局穩重。')).toBeVisible();
  expect(bodies[0]!.system).toContain('【出生】稱呼 小明');
  expect(bodies[0]!.system).toContain('國曆 2000-8-16');
});

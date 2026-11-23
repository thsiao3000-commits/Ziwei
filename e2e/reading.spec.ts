import { expect, test, type Page, type Route } from '@playwright/test';

// 假字串，不是任何真實金鑰。虛構的測試生日。
const FAKE_KEY = 'fake-key-for-e2e-0000000000000-wxyz';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
const ALLOWED_HOSTS = new Set(['127.0.0.1', 'api.openai.com', 'api.anthropic.com', 'api.groq.com']);

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

async function setup(page: Page, options: { failAt?: number; replies?: string[] } = {}) {
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
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: anthropicSse((options.replies ?? REPLIES)[index] ?? '好的。') });
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
  await expect(reading.getByText('需要先設定你自己的 OpenAI、Claude 或 Groq API 金鑰')).toBeVisible();
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
  // 每則回覆標示所用模型、用量與估算費用（1,234 × $2 + 321 × $10，每百萬 token）。
  await expect(reading.getByText(/Claude（Anthropic）\s+claude-sonnet-5-5\s+輸入 1,234、輸出 321 token\s+約 US\$0\.0057/)).toBeVisible();

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
  await reading.getByRole('button', { name: '財運', exact: true }).click();
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

test('網站更新後舊分頁載不到 AI 模組：自動重新載入，提問還在，可以直接重新產生', async ({ page }) => {
  const { bodies } = await setup(page);
  // 模擬新版部署後，舊分頁要用的程式區塊已經不在伺服器上（只失敗第一次）。
  let failed = 0;
  await page.route('**/assets/anthropic-*.js', async (route) => {
    if (failed === 0) {
      failed += 1;
      return route.fulfill({ status: 404, contentType: 'text/html', body: 'Not Found' });
    }
    return route.continue();
  });
  let loads = 0;
  page.on('load', () => (loads += 1));

  await castChart(page);
  const before = loads;
  const reading = panel(page);
  await reading.getByRole('button', { name: '事業' }).click();

  // 自動重新載入；提問已經存在本機，不會不見。
  await expect.poll(() => loads, { timeout: 15_000 }).toBeGreaterThan(before);
  const after = panel(page);
  await expect(after.getByLabel('對話內容').getByText('我的事業發展如何？適合什麼樣的工作方式？')).toBeVisible();
  await expect(after.getByText('這則提問還沒有回覆。')).toBeVisible();
  await expect(after.getByRole('alert')).toHaveCount(0);
  expect(bodies).toHaveLength(0);

  await after.getByRole('button', { name: '重新產生' }).click();
  await expect(after.getByText('命宮紫微坐守，格局穩重。')).toBeVisible();
  await expect(after.getByText('這則提問還沒有回覆。')).toHaveCount(0);
  expect(bodies).toHaveLength(1);
  // 只重新載入一次。
  expect(loads).toBe(before + 1);
});

test('解讀文字的行寬上限是 68 個字', async ({ page }) => {
  await setup(page);
  await castChart(page);
  const reading = panel(page);
  await reading.getByRole('button', { name: '命盤總論' }).click();
  await expect(reading.getByText('命宮紫微坐守，格局穩重。')).toBeVisible();
  const prose = reading.locator('.reading-prose').first();
  const { maxWidth, fontSize } = await prose.evaluate((element) => {
    const style = getComputedStyle(element);
    return { maxWidth: parseFloat(style.maxWidth), fontSize: parseFloat(style.fontSize) };
  });
  expect(Math.round(maxWidth / fontSize)).toBe(68);
});

test('費用依線上價格表計算（同源的 pricing.json），查無費率時標示費率未知', async ({ page }) => {
  await setup(page);
  // 模擬業主的線上價格表：Sonnet 漲價、沒有 Haiku。
  let pricingRequests = 0;
  await page.route('**/BenchAI-Support/pricing.json', (route) => {
    pricingRequests += 1;
    expect(new URL(route.request().url()).origin).toBe('http://127.0.0.1:4173');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        schema_version: 1,
        updated_at: '2027-01-15',
        models: { 'claude-sonnet-5-5': { name: 'Claude Sonnet 5.5', vendor: 'anthropic', input: 10, output: 100 } },
      }),
    });
  });
  await castChart(page);
  const reading = panel(page);
  await reading.getByRole('button', { name: '命盤總論' }).click();
  // 1,234 × $10 + 321 × $100，每百萬 token ＝ 0.04444
  await expect(reading.getByText(/輸入 1,234、輸出 321 token\s+約 US\$0\.044/)).toBeVisible();

  await reading.getByLabel('模型').selectOption('claude-haiku-5-5');
  await reading.getByRole('button', { name: '財運', exact: true }).click();
  await expect(reading.getByText(/claude-haiku-5-5\s+輸入 1,234、輸出 321 token\s+費率未知/)).toBeVisible();
  // 價格表只抓一次。
  expect(pricingRequests).toBe(1);

  await page.goto('./#/settings');
  await expect(page.getByText('價目表：線上版，更新於 2027-01-15。')).toBeVisible();
  const usage = page.locator('table').first();
  await expect(usage).toContainText('約 US$0.044');
  await expect(usage).toContainText('費率未知');
  await expect(page.getByText('（不含費率未知的回覆）')).toBeVisible();
  await expect(page.getByRole('link', { name: '模型價目表（另開分頁）' })).toHaveAttribute('href', '/BenchAI-Support/pricing.html');
});

test('抓不到線上價格表時用內建的後備表', async ({ page }) => {
  await setup(page);
  await castChart(page);
  const reading = panel(page);
  await reading.getByRole('button', { name: '命盤總論' }).click();
  await expect(reading.getByText(/約 US\$0\.0057/)).toBeVisible();
  await page.goto('./#/settings');
  await expect(page.getByText(/價目表：抓不到線上版，改用內建的後備表（\d{4}-\d{2}-\d{2}）。/)).toBeVisible();
});

test('手機：輸入區不蓋到底部導覽列；表單欄位不小於 16px（iPhone 才不會自動放大頁面）', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, '只檢查手機版');
  await setup(page);
  await castChart(page);
  const reading = panel(page);
  await reading.getByRole('button', { name: '命盤總論' }).click();
  await expect(reading.getByText('命宮紫微坐守，格局穩重。')).toBeVisible();

  // 捲到對話中段：輸入區會固定在畫面底部、導覽列的正上方。
  await reading.getByLabel('對話內容').scrollIntoViewIfNeeded();
  const input = reading.getByRole('textbox', { name: '提問', exact: true });
  const nav = page.getByRole('navigation', { name: '主要導覽' }).locator('visible=true');
  const composer = await input.locator('xpath=ancestor::div[contains(@class,"sticky")][1]').boundingBox();
  const navBox = await nav.boundingBox();
  expect(composer && navBox).toBeTruthy();
  expect(composer!.y + composer!.height, '輸入區的下緣不可超過導覽列的上緣').toBeLessThanOrEqual(navBox!.y + 0.5);
  // 導覽列的文字完整露出來。
  await expect(nav.getByRole('link', { name: '我的命盤' })).toBeInViewport({ ratio: 1 });

  const small = await page.evaluate(() =>
    [...document.querySelectorAll('select, textarea, input:not([type=radio]):not([type=checkbox]):not([type=file])')]
      .filter((element) => (element as HTMLElement).offsetParent !== null)
      .map((element) => ({ name: element.id || element.tagName, size: parseFloat(getComputedStyle(element).fontSize) }))
      .filter((item) => item.size < 16),
  );
  expect(small, '這些欄位的字級小於 16px').toEqual([]);
});

test('投資性格摘要：送出規定格式的提問，帶入財帛、福德、命宮、田宅的三方四正，不另附流年', async ({ page }) => {
  const { bodies } = await setup(page);
  await castChart(page);
  const reading = panel(page);
  await reading.getByRole('button', { name: '投資性格摘要' }).click();
  await expect(reading.getByText('已帶入：財帛、福德、命宮、田宅')).toBeVisible();
  await expect(reading.getByText('命宮紫微坐守，格局穩重。')).toBeVisible();

  const { system, messages } = bodies[0]!;
  const content = messages[0]!.content;
  expect(content).toContain('請依這張盤整理一份「投資性格摘要」');
  expect(content).toContain('只能讓規則更保守，不能當成放大部位的理由');
  expect(content).toContain('以「可貼上的摘要」為標題');
  expect(content).toContain('【三方四正】');
  expect(content).toContain('田宅：');
  // 運限靠系統提示詞裡今天的大限與流年，不另外附某一年。
  expect(content).not.toContain('【流年 ');
  expect(system).toContain('【目前運限】');
});

test('流月財運：快捷提問排在投資性格摘要後面，附上程式算好的今年流月與流年，要求輸出可貼上的流月過濾', async ({ page }) => {
  const { bodies } = await setup(page);
  await castChart(page);
  const reading = panel(page);
  const labels = await reading.locator('.chip-row').first().getByRole('button').allTextContents();
  expect(labels.indexOf('流月財運')).toBe(labels.indexOf('投資性格摘要') + 1);

  const year = new Date().getFullYear();
  await reading.getByRole('button', { name: '流月財運', exact: true }).click();
  await expect(reading.getByText(`已帶入：${year} 年流月、${year} 年流年`)).toBeVisible();
  await expect(reading.getByText('命宮紫微坐守，格局穩重。')).toBeVisible();

  const content = bodies[0]!.messages[0]!.content;
  expect(content).toContain(`請看我 ${year} 年各流月的財運`);
  expect(content).toContain(`【${year} 農曆年各流月（由排盤程式計算`);
  expect(content).toMatch(/農曆正月（國曆 \d{4}\/\d+\/\d+–\d{4}\/\d+\/\d+）/);
  expect(content).toContain('沒有統計驗證');
  expect(content).toContain('以「可貼上的流月過濾」為標題');
  expect(content).toContain(`【流年 ${year}】`);
});

// 業主在 iPhone Duo 橫向發現的問題（v1.13.1）：回覆裡的程式碼區塊有一行很長時，整段對話被撐得比螢幕寬，
// 連提問的文字也跟著超出畫面。手機、摺疊手機、平板、電腦的尺寸都要檢查。
const WIDE_REPLY = [
  '這是紫微斗數的傳統看法。',
  '| 流月 | 國曆期間 | 判斷 | 依據 |\n|---|---|---|---|\n| 正月 | 2/6–3/7 | 傳統上偏順 | 流月化祿入財帛宮，流月命宮落在福德宮，三方四正會照祿存與天馬，沒有化忌沖入 |',
  '## 可貼上的流月過濾',
  '```\n【流月過濾｜2027 農曆年｜紫微斗數傳統看法，無統計驗證】\n偏順：農曆正月（國曆 2/6–3/7）、農曆三月（國曆 4/7–5/5）、農曆六月（國曆 7/4–8/1）、農曆九月（國曆 9/30–10/28）、農曆十一月（國曆 11/28–12/27）\n用法：只有原本的分析已到加碼價，而且當天落在偏順的國曆期間，才加碼；否則縮小或延後。減碼與停損不受此限制。\n```',
].join('\n\n');

for (const [width, height] of [
  [393, 852],
  [466, 678],
  [669, 951],
  [951, 669],
  [820, 1180],
  [1180, 820],
  [1440, 900],
] as const) {
  test(`回覆裡有很長的程式碼區塊與表格：對話不超出畫面（${width}×${height}）`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '這個測試自己設定視窗大小');
    await page.setViewportSize({ width, height });
    await setup(page, { replies: [WIDE_REPLY] });
    await castChart(page);
    await page.locator('textarea:visible').last().fill('請看我 2027 年各流月的財運。'.repeat(8));
    await page.getByRole('button', { name: '送出提問' }).last().click();
    await expect(page.getByRole('button', { name: '複製回覆' }).last()).toBeVisible();

    const result = await page.evaluate(() => {
      const root = document.documentElement;
      // 橫向捲動列（快捷提問）與表格本來就會在自己的框裡捲動，不算。
      const outside = [...document.querySelectorAll<HTMLElement>('[aria-label="對話內容"] *')]
        .filter((el) => el.offsetParent !== null && !el.closest('table') && el.getBoundingClientRect().right > root.clientWidth + 1)
        .map((el) => el.tagName);
      return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, outside };
    });
    expect(result.outside).toEqual([]);
    expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth);
  });
}

test('快捷提問：平板、摺疊手機橫向與電腦換行、全部看得到；手機與摺疊手機直向維持左右滑動', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '這個測試自己設定視窗大小');
  await setup(page);
  await castChart(page);
  const row = page.locator('.chip-row:visible').first();
  for (const [width, height, wraps] of [
    [951, 669, true],
    [1440, 900, true],
    [820, 1180, true],
    [669, 951, false],
    [393, 852, false],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(row).toBeVisible();
    const fits = await row.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return [...el.querySelectorAll('button')].every((button) => button.getBoundingClientRect().right <= box.right + 1);
    });
    expect(fits, `${width}×${height}`).toBe(wraps);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

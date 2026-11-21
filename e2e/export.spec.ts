import { copyFile, readFile } from 'node:fs/promises';
import { expect, test, type Page, type Route } from '@playwright/test';

// 假字串，不是任何真實金鑰。虛構的測試生日。
const FAKE_KEY = 'fake-key-for-e2e-0000000000000-wxyz';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
const ALLOWED_HOSTS = new Set(['127.0.0.1', 'api.openai.com', 'api.anthropic.com']);

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

/** 讀 PNG 檔頭：簽章與 IHDR 裡的寬高。 */
function pngInfo(bytes: Buffer) {
  return {
    isPng: bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

test('下載命盤圖（PNG）：依目前的密度與運限產生，可不放稱呼與出生資料', async ({ page }, testInfo) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await castChart(page);
  // 等字型載入，匯出的圖才會用楷體。
  await page.waitForFunction(() => [...document.fonts].some((face) => face.family.includes('LXGW WenKai TC') && face.status === 'loaded'));

  let download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下載命盤圖（PNG）' }).click();
  let file = await download;
  expect(file.suggestedFilename()).toBe('紫微命盤-小明.png');
  const plain = await readFile(await file.path());
  expect(pngInfo(plain)).toEqual({ isPng: true, width: 1600, height: 1670 });
  expect(plain.length).toBeGreaterThan(40_000);
  await expect(page.getByText('已下載命盤圖，圖上有稱呼與出生資料。')).toBeVisible();
  await copyFile(await file.path(), testInfo.outputPath('chart-export.png'));

  // 完整密度＋運限＋選中宮位：內容更多，檔案也應該不同。
  await page.getByRole('radio', { name: '完整' }).check({ force: true });
  const limits = page.getByRole('group', { name: '運限' });
  await limits.getByRole('button', { name: /大限 23 到 32 歲/ }).click();
  await limits.getByRole('button', { name: /流年 2030/ }).click();
  await page.getByRole('group', { name: '小明的命盤' }).getByRole('button', { name: /^官祿，丙戌/ }).click();
  const close = page.locator('[role=dialog]').locator('visible=true').getByRole('button', { name: '關閉' });
  if (await close.count()) await page.keyboard.press('Escape');

  await page.getByRole('checkbox', { name: '不放稱呼與出生資料' }).check();
  download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下載命盤圖（PNG）' }).click();
  file = await download;
  expect(file.suggestedFilename()).toBe('紫微命盤.png');
  const full = await readFile(await file.path());
  expect(pngInfo(full)).toEqual({ isPng: true, width: 1600, height: 1670 });
  expect(full.equals(plain)).toBe(false);
  await expect(page.getByText('已下載命盤圖，圖上沒有稱呼與出生資料。')).toBeVisible();
  await copyFile(await file.path(), testInfo.outputPath('chart-export-full.png'));

  // 匯出不送出任何對外請求。
  for (const url of requests) {
    const parsed = new URL(url);
    if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') continue;
    expect(ALLOWED_HOSTS.has(parsed.hostname), `第三方請求：${url}`).toBe(true);
    expect(parsed.hostname, '匯出不應連到供應商').toBe('127.0.0.1');
  }
});

test('匯出這段對話（Markdown）', async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem('ziwei:key:anthropic', key), FAKE_KEY);
  await page.route('https://api.anthropic.com/**', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'text/event-stream' },
      body: sse('**結論**：官祿宮廉貞天府。\n\n<followups>\n那財運呢？\n</followups>'),
    });
  });
  await castChart(page);
  const reading = page.locator('aside, #reading-section').locator('visible=true').filter({ has: page.getByRole('heading', { level: 2, name: '解讀' }) });
  await reading.getByRole('button', { name: '事業' }).click();
  await expect(reading.getByText('官祿宮廉貞天府。')).toBeVisible();

  let download = page.waitForEvent('download');
  await reading.getByRole('button', { name: '匯出這段對話' }).click();
  let file = await download;
  expect(file.suggestedFilename()).toMatch(/^紫微解讀-我的事業發展如何.*\.md$/);
  const markdown = await readFile(await file.path(), 'utf8');
  expect(markdown).toContain('**命盤**：小明（女）｜國曆 2000 年 8 月 16 日');
  expect(markdown).toContain('## 提問\n\n> 我的事業發展如何？適合什麼樣的工作方式？');
  expect(markdown).toContain('_已帶入：官祿、命宮、財帛、遷移_');
  expect(markdown).toContain('## 解讀\n\n**結論**：官祿宮廉貞天府。');
  expect(markdown).toContain('claude-sonnet-5-5');
  expect(markdown).not.toContain('followups');
  expect(markdown).not.toContain(FAKE_KEY);
  expect(markdown).not.toContain('【三方四正】');

  await page.getByRole('checkbox', { name: '不放稱呼與出生資料' }).check();
  download = page.waitForEvent('download');
  await reading.getByRole('button', { name: '匯出這段對話' }).click();
  file = await download;
  const anonymous = await readFile(await file.path(), 'utf8');
  expect(anonymous).toContain('**命盤**：女命｜木三局');
  expect(anonymous).not.toContain('小明');
  expect(anonymous).not.toContain('2000 年');
});

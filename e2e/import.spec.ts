import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

// 假字串，不是任何真實金鑰。虛構的測試生日。
const FAKE_KEY = 'fake-key-for-e2e-0000000000000-wxyz';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
const ALLOWED_HOSTS = new Set(['127.0.0.1', 'api.openai.com', 'api.anthropic.com', 'api.groq.com']);
// 一張 1×1 的 PNG，當成使用者選的「命盤截圖」。
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const READ = {
  found: true,
  name: '小明',
  gender: 'female',
  solar: { year: 2000, month: 8, day: 16 },
  lunar: { year: 2000, month: 7, day: 17, isLeapMonth: false },
  clock: null,
  timeBranch: '寅',
  lateZi: null,
  soulBranch: '午',
  soulMajorStars: ['紫微'],
  fiveElementsClass: '木三局',
  notes: '右下角有浮水印，不影響判讀。',
};

type Body = { system: string; stream?: boolean; messages: { role: string; content: { type: string; text?: string; source?: { type: string; media_type: string; data: string } }[] }[] };

async function mockReply(page: Page, reply: string) {
  const bodies: Body[] = [];
  await page.addInitScript((key) => localStorage.setItem('ziwei:key:anthropic', key), FAKE_KEY);
  await page.route('https://api.anthropic.com/**', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    bodies.push(route.request().postDataJSON() as Body);
    return route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-5-5',
        content: [{ type: 'text', text: reply }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1500, output_tokens: 200 },
      }),
    });
  });
  return bodies;
}

async function pick(page: Page) {
  await page.goto('./');
  await page.getByRole('link', { name: '已經有命盤截圖？請 AI 讀出出生資料帶入表單' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '從命盤截圖帶入' })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('命盤的截圖或照片').setInputFiles({ name: '我的命盤.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByRole('img', { name: '你選的命盤圖片' })).toBeVisible();
}

test('沒有金鑰時引導到設定，並說明可以手動輸入', async ({ page }) => {
  await page.goto('./#/import');
  await expect(page.getByText('讀圖需要 AI，請先設定你自己的 OpenAI、Claude 或 Groq API 金鑰。')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('命盤的截圖或照片')).toHaveCount(0);
});

test('選圖 → 說明會送出什麼 → 讀取 → 帶進表單並比對 → 由程式排出命盤', async ({ page }, testInfo) => {
  const bodies = await mockReply(page, `\`\`\`json\n${JSON.stringify(READ)}\n\`\`\``);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await pick(page);

  // 選了圖還不會送出；先說明會送什麼、送給誰。
  expect(bodies).toHaveLength(0);
  await expect(page.getByText(/這張圖會由你的瀏覽器直接送給 Claude（Anthropic）（模型：claude-sonnet-5-5）/)).toBeVisible();
  await expect(page.getByText(/圖上的姓名、生日與整張命盤都會一併送出；本站沒有伺服器會收到它。/)).toBeVisible();
  await expect(page.getByText(/我的命盤\.png\s+送出時會縮成 1×1/)).toBeVisible();

  await page.getByRole('button', { name: '把圖片送給 AI 讀取出生資料' }).click();
  await expect(page.getByRole('heading', { level: 2, name: '核對後排出命盤' })).toBeVisible();
  // 1,500 × $2 + 200 × $10，每百萬 token
  await expect(page.getByText(/輸入 1,500、輸出 200 token\s+約 US\$0\.0050/)).toBeVisible();

  // 請求：圖片是縮小後的 JPEG，放在訊息裡；提示詞要求只抄不排。
  expect(bodies).toHaveLength(1);
  const body = bodies[0]!;
  expect(body.stream).toBeUndefined();
  expect(body.system).toContain('不要推算、不要排盤、不要猜測');
  const [imagePart, textPart] = body.messages[0]!.content;
  expect(imagePart).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg' } });
  expect(imagePart!.source!.data.length).toBeGreaterThan(100);
  expect(textPart!.text).toContain('"soulBranch"');

  // 帶進表單
  await expect(page.getByLabel('稱呼')).toHaveValue('小明');
  await expect(page.getByRole('radio', { name: '女' })).toBeChecked();
  await expect(page.getByRole('radio', { name: '國曆' })).toBeChecked();
  await expect(page.getByLabel('年（西元）')).toHaveValue('2000');
  await expect(page.getByLabel('月', { exact: true })).toHaveValue('8');
  await expect(page.getByLabel('日', { exact: true })).toHaveValue('16');
  await expect(page.getByLabel('或直接選時辰')).toHaveValue('2');
  await expect(page.getByText('圖上同時有國曆與農曆生日，表單用的是國曆')).toBeVisible();
  await expect(page.getByText('AI 的備註：右下角有浮水印，不影響判讀。')).toBeVisible();

  // 和圖上的命盤比對：程式排出來的結果一致
  const checks = page.getByRole('table', { name: '和圖上的命盤比對' });
  await expect(checks.locator('tbody tr')).toHaveCount(3);
  await expect(checks.getByRole('row', { name: /^命宮位置/ })).toContainText('相符');
  await expect(checks.getByRole('row', { name: /^命宮主星/ })).toContainText('紫微');
  await expect(checks.getByText('不相符')).toHaveCount(0);
  await expect(page.getByText('讀到的資料排出來和圖上一致（寅時）。')).toBeVisible();

  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath('import.png'), fullPage: true });
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.target.join(' ')}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  // 核對後排盤：命盤由程式排出
  await page.getByRole('button', { name: '排出命盤' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '小明的命盤' })).toBeVisible();
  await expect(page.getByRole('group', { name: '小明的命盤' }).getByRole('button', { name: /^命宮，壬午/ })).toBeVisible();

  // 圖片只送給供應商；沒有第三方請求，圖片也不會送到本站。
  for (const url of requests) {
    const parsed = new URL(url);
    if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') continue;
    expect(ALLOWED_HOSTS.has(parsed.hostname), `第三方請求：${url}`).toBe(true);
  }
  const stored = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)) + JSON.stringify(Object.entries(sessionStorage)));
  expect(stored).not.toContain(body.messages[0]!.content[0]!.source!.data.slice(0, 60));
});

test('讀到的資料和圖上的命盤不相符時會標出來；子時沒標早晚要使用者選', async ({ page }) => {
  await mockReply(page, JSON.stringify({ ...READ, timeBranch: '子', soulBranch: '子', soulMajorStars: ['貪狼'], solar: { year: 2000, month: 8, day: 16 } }));
  await pick(page);
  await page.getByRole('button', { name: '把圖片送給 AI 讀取出生資料' }).click();
  await expect(page.getByText('圖上讀不到：時辰（圖上是子時，請選早子時或晚子時）。請自己補上。')).toBeVisible();
  // 時辰沒決定，無法試排，所以還沒有比對表。
  await expect(page.getByRole('table', { name: '和圖上的命盤比對' })).toHaveCount(0);
  await expect(page.getByLabel('或直接選時辰')).toHaveValue('');
  await page.getByRole('button', { name: '排出命盤' }).click();
  await expect(page.getByRole('alert')).toContainText('請輸入出生時間，或直接選擇時辰。');
});

test('不相符：寅時的資料配上別張盤的命宮', async ({ page }) => {
  await mockReply(page, JSON.stringify({ ...READ, soulBranch: '子', soulMajorStars: ['貪狼'], fiveElementsClass: '金四局' }));
  await pick(page);
  await page.getByRole('button', { name: '把圖片送給 AI 讀取出生資料' }).click();
  const checks = page.getByRole('table', { name: '和圖上的命盤比對' });
  await expect(checks.getByText('不相符')).toHaveCount(3);
  await expect(page.getByText(/有項目不相符。常見原因：AI 讀錯生日或時辰/)).toBeVisible();
});

test('不是命盤、或回覆讀不出資料時說明原因', async ({ page }) => {
  await mockReply(page, JSON.stringify({ found: false }));
  await pick(page);
  await page.getByRole('button', { name: '把圖片送給 AI 讀取出生資料' }).click();
  await expect(page.getByRole('alert')).toContainText('AI 判斷這張圖不是紫微斗數命盤。');
  await expect(page.getByRole('heading', { level: 2, name: '核對後排出命盤' })).toHaveCount(0);
});

test('選到不是圖片的檔案會擋下', async ({ page }) => {
  await mockReply(page, '{}');
  await page.goto('./#/import');
  await page.getByLabel('命盤的截圖或照片').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByRole('alert')).toContainText('這不是圖片檔。');
  await expect(page.getByRole('button', { name: '把圖片送給 AI 讀取出生資料' })).toHaveCount(0);
});

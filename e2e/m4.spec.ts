import { expect, test, type Page, type Route } from '@playwright/test';

// 假字串，不是任何真實金鑰。虛構的測試生日。
const FAKE_KEY = 'fake-key-for-e2e-0000000000000-wxyz';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

type Body = { system: string; messages: { role: string; content: string }[] };

function sse(text: string): string {
  const events: [string, unknown][] = [
    ['message_start', { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 2000, output_tokens: 1 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1000 } }],
    ['message_stop', { type: 'message_stop' }],
  ];
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

async function mockAnthropic(page: Page) {
  const bodies: Body[] = [];
  await page.addInitScript((key) => {
    if (!sessionStorage.getItem('e2e-seeded')) {
      localStorage.setItem('ziwei:key:anthropic', key);
      sessionStorage.setItem('e2e-seeded', '1');
    }
  }, FAKE_KEY);
  await page.route('https://api.anthropic.com/**', async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    bodies.push(request.postDataJSON() as Body);
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sse('好的，這是回覆。') });
  });
  return bodies;
}

async function castChart(page: Page, name = '小明') {
  await page.goto('./');
  await page.getByLabel('稱呼').fill(name);
  await page.getByRole('radio', { name: '女' }).check({ force: true });
  await page.getByLabel('年（西元）').fill('2000');
  await page.getByLabel('月', { exact: true }).selectOption('8');
  await page.getByLabel('日', { exact: true }).selectOption('16');
  await page.getByLabel('時鐘時間').fill('04:10');
  await page.getByRole('button', { name: '排出命盤' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `${name}的命盤` })).toBeVisible();
}

function panel(page: Page) {
  return page.locator('aside, #reading-section').locator('visible=true').filter({ has: page.getByRole('heading', { level: 2, name: '解讀' }) });
}

test('運限切換：大限 → 流年 → 流月，盤上疊宮，提問時帶入', async ({ page }, testInfo) => {
  const bodies = await mockAnthropic(page);
  await castChart(page);
  const board = page.getByRole('group', { name: '小明的命盤' });
  const limits = page.getByRole('group', { name: '運限' });

  await expect(limits.getByRole('button', { name: '本命' })).toHaveAttribute('aria-pressed', 'true');
  await expect(board.locator('.palace-limits')).toHaveCount(0);

  // 選大限 23–32（夫妻宮，庚辰）：各宮出現大限宮名，夫妻宮是大限命宮。
  await limits.getByRole('button', { name: /大限 23 到 32 歲/ }).click();
  await expect(board.locator('.palace-limits')).toHaveCount(12);
  const spouse = board.getByRole('button', { name: /^夫妻，庚辰/ });
  await expect(spouse).toHaveAccessibleName(/大限命宮/);
  await expect(spouse.locator('.limit-name.is-soul')).toHaveText('限命宮');
  // 庚干：太陽化祿，在子女宮。
  await expect(board.getByRole('button', { name: /^子女，己卯/ })).toHaveAccessibleName(/大限兄弟，太陽化祿/);
  await expect(board.getByRole('button', { name: /^子女，己卯/ }).locator('.hua-limit')).toHaveText('限祿');

  // 流年 2030 庚戌
  await limits.getByRole('button', { name: /流年 2030/ }).click();
  await expect(board.getByRole('button', { name: /^官祿，丙戌/ })).toHaveAccessibleName(/流年命宮/);
  // 流月
  await limits.getByRole('button', { name: /^流月 農曆\s*正月$/ }).click();
  await expect(board.locator('.limit-name').filter({ hasText: /^月/ })).toHaveCount(12);

  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1400);
  await page.screenshot({ path: testInfo.outputPath('limits.png'), fullPage: true });

  // 提問時帶入選中的運限
  const reading = panel(page);
  await expect(reading.getByText('下一則提問會帶入：大限 23–32 歲、2030 年流年、農曆正月流月')).toBeVisible();
  await reading.getByRole('button', { name: '事業' }).click();
  await expect(reading.getByText('好的，這是回覆。')).toBeVisible();
  await expect(reading.getByText(/已帶入：.*大限 23–32 歲、2030 年流年、農曆正月流月/)).toBeVisible();
  const sent = bodies[0]!.messages[0]!.content;
  expect(sent).toContain('【盤上選中的運限】');
  expect(sent).toContain('流年 2030（虛歲 31）：庚戌');

  // 電腦版：運限列與快捷提問全部看得到，不會被右邊截掉（手機版是橫向捲動）。
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    for (const row of [limits, reading]) {
      const box = await row.boundingBox();
      for (const chip of await row.locator('.chip').all()) {
        const chipBox = await chip.boundingBox();
        expect(chipBox && box && chipBox.x + chipBox.width <= box.x + box.width + 1, await chip.innerText()).toBe(true);
      }
    }
    await expect(reading.getByRole('button', { name: '今年流年' })).toBeInViewport({ ratio: 1 });
  }

  // 今天 → 目前的大限與流年；本命 → 清掉
  await limits.getByRole('button', { name: '今天' }).click();
  await expect(limits.getByRole('button', { name: /大限 23 到 32 歲/ })).toHaveAttribute('aria-pressed', 'true');
  await limits.getByRole('button', { name: '本命' }).click();
  await expect(board.locator('.palace-limits')).toHaveCount(0);
});

test('空宮顯示借對宮主星', async ({ page }) => {
  await castChart(page);
  await page.getByRole('radio', { name: '標準' }).check({ force: true });
  const board = page.getByRole('group', { name: '小明的命盤' });
  const parents = board.getByRole('button', { name: /^父母，癸未/ });
  await expect(parents).toContainText('借對宮 天同、巨門');
  await parents.click();
  const detail = page.locator('aside, [role=dialog]').locator('visible=true').filter({ hasText: '宮干飛化' });
  await expect(detail.getByText(/這一宮沒有主星（空宮）。一般會借對宮疾厄的主星來看/)).toBeVisible();
});

test('解讀視角：多派會診與自訂視角寫進提示詞', async ({ page }) => {
  const bodies = await mockAnthropic(page);
  await page.goto('./#/settings');
  await page.getByLabel(/自訂視角/).fill('用白話、少術語');
  await page.getByRole('radio', { name: '飛星四化為主' }).check({ force: true });

  await castChart(page);
  const reading = panel(page);
  // 預設視角來自設定頁的解讀取向
  await expect(reading.getByLabel('視角')).toHaveValue('feixing');
  await reading.getByRole('button', { name: '命盤總論' }).click();
  await expect(reading.getByText('好的，這是回覆。')).toBeVisible();
  expect(bodies[0]!.system).toContain('解讀取向：飛星四化為主');

  await reading.getByLabel('視角').selectOption('panel');
  await reading.getByRole('button', { name: '財運', exact: true }).click();
  await expect(reading.getByText('好的，這是回覆。')).toHaveCount(2);
  expect(bodies[1]!.system).toContain('共同點與分歧');

  await reading.getByLabel('視角').selectOption('custom');
  await reading.getByRole('button', { name: '感情' }).click();
  await expect(reading.getByText('好的，這是回覆。')).toHaveCount(3);
  expect(bodies[2]!.system).toContain('「用白話、少術語」');
});

test('排盤設定：新命盤採用新設定，舊命盤可以重排；花費統計', async ({ page }) => {
  await mockAnthropic(page);
  // 1985-01-25 晚子時：算來日或算當日排出不同的盤。
  await page.goto('./');
  await page.getByLabel('稱呼').fill('阿華');
  await page.getByRole('radio', { name: '男' }).check({ force: true });
  await page.getByLabel('年（西元）').fill('1985');
  await page.getByLabel('月', { exact: true }).selectOption('1');
  await page.getByLabel('日', { exact: true }).selectOption('25');
  await page.getByLabel('或直接選時辰').selectOption('12');
  await page.getByRole('button', { name: '排出命盤' }).click();
  const board = page.getByRole('group', { name: '阿華的命盤' });
  await expect(board).toContainText('甲子 丁丑 乙丑 丙子');
  await expect(page.getByText('和目前設定頁的不同')).toHaveCount(0);
  const chartUrl = page.url();

  // 先提問一次，留下用量紀錄
  await panel(page).getByRole('button', { name: '命盤總論' }).click();
  await expect(panel(page).getByText('好的，這是回覆。')).toBeVisible();

  await page.goto('./#/settings');
  await page.getByRole('radio', { name: '算當日' }).check({ force: true });
  await expect(page.getByText('已儲存')).toBeVisible();
  // 花費統計：2000 輸入 × $2 + 1000 輸出 × $10 = US$0.014
  await expect(page.getByText('AI 花費統計')).toBeVisible();
  const usage = page.locator('table').first();
  await expect(usage).toContainText('claude-sonnet-5-5');
  await expect(usage).toContainText('2,000');
  await expect(usage).toContainText('1,000');
  await expect(usage).toContainText('US$0.01');

  await page.goto(chartUrl);
  await expect(page.getByText('這張命盤用的是排盤當時的排盤設定，和目前設定頁的不同。')).toBeVisible();
  await expect(board).toContainText('甲子 丁丑 乙丑 丙子');
  await page.getByRole('button', { name: '改用目前的設定重排' }).click();
  // 晚子時算當日：日柱從乙丑變成甲子，時柱跟著變
  await expect(board).toContainText('甲子 丁丑 甲子 甲子');
  await expect(page.getByText('和目前設定頁的不同')).toHaveCount(0);
  // 重排不影響對話
  await expect(panel(page).getByText('好的，這是回覆。')).toBeVisible();

  await page.reload();
  await expect(board).toContainText('甲子 丁丑 甲子 甲子');
});

test('我的命盤：最後開啟、釘選、重新命名', async ({ page }) => {
  await castChart(page, '甲');
  await castChart(page, '乙');
  await page.goto('./#/charts');
  const items = page.getByRole('listitem');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('乙');
  await expect(items.nth(0)).toContainText(/最後開啟：\d{4}\/\d+\/\d+ \d{2}:\d{2}/);

  await page.getByRole('button', { name: '釘選命盤「甲」' }).click();
  await expect(items.nth(0)).toContainText('甲');
  await expect(items.nth(0)).toContainText('已釘選');

  await page.getByRole('button', { name: '重新命名命盤「甲」' }).click();
  await page.getByLabel('稱呼').fill('甲的新名字');
  await page.getByRole('button', { name: '儲存稱呼' }).click();
  await expect(page.getByRole('link', { name: '甲的新名字', exact: true })).toBeVisible();

  // 開啟命盤：稱呼是連結，另外有一顆明確的「開啟命盤」。
  await page.getByRole('link', { name: '開啟命盤「甲的新名字」' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '甲的新名字的命盤' })).toBeVisible();
  await page.goto('./#/charts');
  await page.getByRole('link', { name: '甲的新名字', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: '甲的新名字的命盤' })).toBeVisible();
});

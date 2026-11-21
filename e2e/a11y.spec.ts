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

async function scan(page: Page, label: string) {
  // 等落位動畫與字型都穩定再檢查對比。
  await page.waitForTimeout(1500);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.slice(0, 4).map((node) => `${node.target.join(' ')} :: ${node.failureSummary?.split('\n').slice(1, 3).join(' ').slice(0, 200)}`),
  }));
  expect(summary, `${label} 的無障礙檢查`).toEqual([]);
  // 頁面不可比視窗寬：手機上一旦水平溢出，按鈕會跑到看不到的地方。
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label} 不應水平溢出`).toBeLessThanOrEqual(0);
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

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`無障礙（${scheme === 'light' ? '青花' : '夜觀'}）`, () => {
    test.use({ colorScheme: scheme });

    test('首頁與表單錯誤', async ({ page }) => {
      await page.goto('./');
      await expect(page.getByRole('group', { name: '示範命盤' })).toBeVisible();
      await scan(page, '首頁');
      await page.getByRole('button', { name: '排出命盤' }).click();
      await expect(page.getByRole('alert')).toBeVisible();
      await page.getByRole('radio', { name: '農曆' }).check({ force: true });
      await scan(page, '首頁（表單錯誤、農曆）');
    });

    test('命盤：三種密度、選中宮位、疊上運限、解讀對話', async ({ page }) => {
      await page.addInitScript((key) => localStorage.setItem('ziwei:key:anthropic', key), FAKE_KEY);
      await page.route('https://api.anthropic.com/**', async (route: Route) => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
        return route.fulfill({
          status: 200,
          headers: { ...CORS, 'content-type': 'text/event-stream' },
          body: sse('## 結論\n\n命宮紫微。\n\n| 宮位 | 主星 |\n|---|---|\n| 命宮 | 紫微 |\n\n<followups>\n事業呢？\n</followups>'),
        });
      });
      await castChart(page);
      await scan(page, '命盤（預設密度）');

      await page.getByRole('radio', { name: '完整' }).check({ force: true });
      const limits = page.getByRole('group', { name: '運限' });
      await limits.getByRole('button', { name: /大限 23 到 32 歲/ }).click();
      await limits.getByRole('button', { name: /流年 2030/ }).click();
      await page.getByRole('group', { name: '小明的命盤' }).getByRole('button', { name: /^父母，癸未/ }).click();
      await scan(page, '命盤（完整密度、運限、宮位詳情）');

      const detail = page.locator('aside, [role=dialog]').locator('visible=true').filter({ hasText: '宮干飛化' });
      await detail.getByRole('button', { name: '解讀這個宮位' }).click();
      await expect(page.getByText('命宮紫微。').locator('visible=true')).toBeVisible();
      await scan(page, '命盤（解讀對話）');
    });

    test('設定與我的命盤', async ({ page }) => {
      await page.addInitScript((key) => localStorage.setItem('ziwei:key:openai', key), FAKE_KEY);
      await castChart(page);
      await page.goto('./#/settings');
      await expect(page.getByRole('heading', { level: 1, name: '設定' })).toBeVisible();
      await scan(page, '設定');
      await page.goto('./#/charts');
      await expect(page.getByRole('link', { name: '小明' })).toBeVisible();
      await page.getByRole('button', { name: '重新命名命盤「小明」' }).click();
      await scan(page, '我的命盤');
    });
  });
}

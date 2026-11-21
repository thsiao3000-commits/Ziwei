import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

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

test('名詞小辭典：瀏覽、搜尋、沒有結果', async ({ page }, testInfo) => {
  await page.goto('./');
  await page.getByRole('navigation', { name: '主要導覽' }).locator('visible=true').getByRole('link', { name: '名詞' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '名詞小辭典' })).toBeVisible();
  for (const category of ['基本概念', '十二宮', '十四主星', '輔星', '四化', '運限', '雜曜', '十二神', '流派與設定']) {
    await expect(page.getByRole('heading', { level: 2, name: category })).toBeVisible();
  }
  await expect(page.getByText('傳統上稱為帝星')).toBeVisible();

  const search = page.getByLabel('搜尋名詞');
  await search.fill('化忌');
  await expect(page.getByText(/^找到 \d+ 條$/)).toBeVisible();
  await expect(page.locator('dt').first()).toContainText('化忌');
  await expect(page.getByText('傳統上稱為帝星')).toHaveCount(0);

  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath('glossary.png'), fullPage: true });

  await search.fill('zzz');
  await expect(page.getByText('沒有符合「zzz」的名詞')).toBeVisible();

  await search.fill('');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.target.join(' ')}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('盤上的名詞可以點：就地顯示說明，並可連到辭典', async ({ page }) => {
  await castChart(page);
  await page.getByRole('group', { name: '小明的命盤' }).getByRole('button', { name: /^命宮，壬午/ }).click();
  const detail = page.locator('aside, [role=dialog]').locator('visible=true').filter({ hasText: '宮干飛化' });

  // 主星
  await detail.getByRole('button', { name: /^紫微.*（看名詞說明）$/ }).click();
  const note = detail.getByRole('note');
  await expect(note).toContainText('紫微');
  await expect(note).toContainText('傳統上稱為帝星');

  // 換一個名詞：輔星、雜曜（別名）、欄位名稱
  await detail.getByRole('button', { name: /^文曲.*（看名詞說明）$/ }).click();
  await expect(note).toContainText('口才、才藝');
  await detail.getByRole('button', { name: /^年解.*（看名詞說明）$/ }).click();
  await expect(note).toContainText('解神');
  await expect(note).toContainText('（年解）');
  await detail.getByRole('button', { name: /^三方四正.*（看名詞說明）$/ }).click();
  await expect(note).toContainText('本宮、對宮');
  await detail.getByRole('button', { name: /^命宮.*（看名詞說明）$/ }).click();
  await expect(note).toContainText('整張盤最重要的宮位');

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.target.join(' ')}`)).toEqual([]);

  await detail.getByRole('button', { name: '收起說明' }).click();
  await expect(detail.getByRole('note')).toHaveCount(0);

  // 連到辭典，並標出那一條
  await detail.getByRole('button', { name: /^宮干飛化.*（看名詞說明）$/ }).click();
  await detail.getByRole('link', { name: '在名詞小辭典看更多' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '名詞小辭典' })).toBeVisible();
  await expect(page).toHaveURL(/#\/glossary\/.+/);
  await expect(page.locator('[id="term-宮干飛化"]')).toBeInViewport();
});

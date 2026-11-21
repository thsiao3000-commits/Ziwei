import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { computeChart, computeLimits } from '../src/features/chart/engine';
import { listCharts, saveChart, touchChart, updateChart } from '../src/features/chart/store';
import { DEFAULT_CHART_SETTINGS, NO_LIMITS, type BirthInput } from '../src/features/chart/types';
import { buildSystemPrompt } from '../src/features/reading/prompts';
import { serializeChart, serializeLimits } from '../src/features/reading/serialize';
import { readUsage, recordUsage, usageByMonth } from '../src/features/settings/usage';
import { estimateCost } from '../src/lib/llm/models.config';
import { getDB } from '../src/lib/storage/db';

// 虛構的測試生日（iztro 文件範例）。
const input: BirthInput = { name: '小明', gender: 'female', calendar: 'solar', date: '2000-8-16', timeIndex: 2 };
const chart = computeChart(input, DEFAULT_CHART_SETTINGS);

beforeEach(async () => {
  for (const key of Object.keys(localStorage)) localStorage.removeItem(key);
  await (await getDB()).clear('charts');
});

describe('盤上選中的運限', () => {
  it('沒有選時不附資料', () => {
    expect(serializeLimits(chart, computeLimits(input, DEFAULT_CHART_SETTINGS, NO_LIMITS))).toBeUndefined();
  });

  it('大限、流年、流月各一行，標籤說明帶入了什麼', () => {
    const limits = computeLimits(input, DEFAULT_CHART_SETTINGS, { decadal: 2, year: 2030, month: 0 });
    const attachment = serializeLimits(chart, limits);
    expect(attachment?.label).toBe('大限 23–32 歲、2030 年流年、農曆正月流月');
    expect(attachment?.text).toContain('【盤上選中的運限】');
    expect(attachment?.text).toContain('大限：夫妻（23–32 歲）｜庚辰');
    expect(attachment?.text).toContain('流年 2030（虛歲 31）：庚戌');
    expect(attachment?.text).toContain('流月 農曆正月：');
  });

  it('只選大限時只附大限', () => {
    const attachment = serializeLimits(chart, computeLimits(input, DEFAULT_CHART_SETTINGS, { decadal: 0, year: null, month: null }));
    expect(attachment?.label).toBe('大限 3–12 歲');
    expect(attachment?.text).not.toContain('流年');
  });
});

describe('解讀視角', () => {
  const base = { verbosity: 'standard', today: '2026-11-21', chartContext: 'CHART' } as const;

  it('多派會診：要求兩種取向並整理共同點與分歧', () => {
    const prompt = buildSystemPrompt({ ...base, school: 'panel' });
    expect(prompt).toContain('多派會診');
    expect(prompt).toContain('先用三合派');
    expect(prompt).toContain('再用飛星四化派');
    expect(prompt).toContain('共同點與分歧');
  });

  it('自訂視角：帶入使用者的指示，並聲明不能改變資料與界線規則', () => {
    const prompt = buildSystemPrompt({ ...base, school: 'custom', customPerspective: '  用白話、少術語  ' });
    expect(prompt).toContain('「用白話、少術語」');
    expect(prompt).toContain('不能改變資料、依據與界線的規則');
    expect(prompt).toContain('【界線】');
  });

  it('自訂視角沒填內容時退回三合', () => {
    expect(buildSystemPrompt({ ...base, school: 'custom', customPerspective: '   ' })).toContain('請以三合為主解讀');
  });

  it('視角寫進命盤資料的設定行', () => {
    expect(serializeChart(chart, null, { school: 'panel' })).toContain('取向：多派會診');
    expect(serializeChart(chart, null, { school: 'custom' })).toContain('取向：自訂視角');
  });
});

describe('我的命盤', () => {
  it('重新命名、釘選、改用新的排盤設定', async () => {
    const saved = await saveChart(input, DEFAULT_CHART_SETTINGS);
    expect((await updateChart(saved.id, { name: '  阿明 ' }))?.input.name).toBe('阿明');
    expect((await updateChart(saved.id, { name: '   ' }))?.input.name).toBe('阿明');
    expect((await updateChart(saved.id, { pinned: true }))?.pinned).toBe(true);
    const recast = await updateChart(saved.id, { chartSettings: { ...DEFAULT_CHART_SETTINGS, algorithm: 'zhongzhou' } });
    expect(recast?.chartSettings.algorithm).toBe('zhongzhou');
    expect(recast?.input.date).toBe('2000-8-16');
    expect(await updateChart('nosuchchart00000', { pinned: true })).toBeUndefined();
  });

  it('排序：釘選的在前，其餘依最後開啟新到舊', async () => {
    const a = await saveChart({ ...input, name: '甲' }, DEFAULT_CHART_SETTINGS);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const b = await saveChart({ ...input, name: '乙' }, DEFAULT_CHART_SETTINGS);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const c = await saveChart({ ...input, name: '丙' }, DEFAULT_CHART_SETTINGS);
    expect((await listCharts()).map((item) => item.input.name)).toEqual(['丙', '乙', '甲']);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await touchChart(a.id);
    expect((await listCharts()).map((item) => item.input.name)).toEqual(['甲', '丙', '乙']);

    await updateChart(b.id, { pinned: true });
    expect((await listCharts()).map((item) => item.input.name)).toEqual(['乙', '甲', '丙']);
    expect((await listCharts()).find((item) => item.id === c.id)?.openedAt).toBeUndefined();
  });
});

describe('花費統計', () => {
  it('依月份與模型累計，只記數量', () => {
    const november = new Date(2026, 10, 21);
    recordUsage('anthropic', 'claude-sonnet-5-5', { inputTokens: 1000, outputTokens: 500 }, november);
    recordUsage('anthropic', 'claude-sonnet-5-5', { inputTokens: 2000, outputTokens: 1500 }, november);
    recordUsage('openai', 'gpt-next-unknown', { inputTokens: 10, outputTokens: 20 }, november);
    recordUsage('openai', 'gpt-6.2-sol', { inputTokens: 1_000_000, outputTokens: 0 }, new Date(2026, 11, 1));

    expect(localStorage.getItem('ziwei:usage')).not.toBeNull();
    const months = usageByMonth(readUsage());
    expect(months.map((month) => month.month)).toEqual(['2026-12', '2026-11']);
    expect(months[0]?.cost).toBeCloseTo(2, 6);

    const sonnet = months[1]?.rows.find((row) => row.model === 'claude-sonnet-5-5');
    expect(sonnet).toMatchObject({ inputTokens: 3000, outputTokens: 2000, replies: 2 });
    // 3000 × $2 + 2000 × $10，每百萬 token
    expect(sonnet?.cost).toBeCloseTo(0.026, 6);
    expect(months[1]?.hasUnknown).toBe(true);
    expect(months[1]?.cost).toBeCloseTo(0.026, 6);
  });

  it('不認得的模型不估價；壞掉的紀錄當成沒有', () => {
    expect(estimateCost('some-future-model', 1000, 1000)).toBeNull();
    expect(estimateCost('claude-haiku-5-5', 1_000_000, 1_000_000)).toBeCloseTo(0.6, 6);
    localStorage.setItem('ziwei:usage', '{broken');
    expect(readUsage()).toEqual([]);
  });
});

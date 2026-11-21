import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { computeChart, computeTimeCandidates } from '../src/features/chart/engine';
import { majorStarRows, neighbours, RECTIFY_MESSAGE, serializeCandidates, summarise } from '../src/features/chart/rectify';
import { getChart, saveChart, updateChart } from '../src/features/chart/store';
import { TIME_SLOTS } from '../src/features/chart/time';
import { DEFAULT_CHART_SETTINGS, type BirthInput } from '../src/features/chart/types';
import { buildAttachment } from '../src/features/reading/request';

// 虛構的測試生日（iztro 文件範例）。
const input: BirthInput = { name: '小明', gender: 'female', calendar: 'solar', date: '2000-8-16', timeIndex: 2, clockTime: '04:10' };
const candidates = computeTimeCandidates(input, DEFAULT_CHART_SETTINGS);

describe('定盤輔助：十三個時辰', () => {
  it('每個時辰各排一張盤，和直接排那個時辰的結果相同', () => {
    expect(candidates.map((item) => item.timeIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const { timeIndex, chart } of candidates) {
      expect(chart.time).toBe(TIME_SLOTS[timeIndex]?.name);
      expect(chart).toEqual(computeChart({ ...input, timeIndex }, DEFAULT_CHART_SETTINGS));
    }
  });

  it('時辰每差一個，命宮就移動一宮', () => {
    const branches = candidates.slice(0, 12).map((item) => item.chart.soulBranch);
    expect(new Set(branches).size).toBe(12);
    expect(branches.slice(1, 4)).toEqual(['未', '午', '巳']);
  });

  it('摘要：命宮、命宮主星、身宮、五行局、起運、時柱', () => {
    const current = candidates.find((item) => item.timeIndex === 2)!;
    expect(summarise(current)).toEqual({
      timeIndex: 2,
      name: '寅時',
      range: '03:00–05:00',
      soulBranch: '午',
      soulStars: '紫微(廟)',
      bodyPalace: '官祿（戌）',
      fiveElementsClass: '木三局',
      startAge: 3,
      hourPillar: '庚寅',
    });
    // 空宮寫「空宮」
    expect(candidates.map(summarise).some((item) => item.soulStars === '空宮')).toBe(true);
  });

  it('取相鄰時辰：頭尾不繞回', () => {
    expect(neighbours(candidates, 2).map((item) => item.timeIndex)).toEqual([1, 2, 3]);
    expect(neighbours(candidates, 0).map((item) => item.timeIndex)).toEqual([0, 1]);
    expect(neighbours(candidates, 12).map((item) => item.timeIndex)).toEqual([11, 12]);
  });

  it('逐宮主星對照：依命宮起的順序，一欄一個時辰', () => {
    const rows = majorStarRows(neighbours(candidates, 2));
    expect(rows.map((row) => row.palace)).toEqual(['命宮', '兄弟', '夫妻', '子女', '財帛', '疾厄', '遷移', '僕役', '官祿', '田宅', '福德', '父母']);
    expect(rows[0]?.stars).toHaveLength(3);
    expect(rows[0]?.stars[1]).toBe('紫微');
    expect(rows.some((row) => row.differs)).toBe(true);
  });
});

describe('定盤輔助：給 AI 的資料', () => {
  const block = serializeCandidates(neighbours(candidates, 2), 2);

  it('列出每個候選時辰的差異，並標出目前排的盤', () => {
    expect(block.label).toBe('定盤候選（丑時、寅時、卯時）');
    const lines = block.text.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('【定盤候選】');
    expect(lines[2]).toContain('寅時（03:00–05:00）〔目前排的盤〕：命宮在午｜身宮在官祿（戌）｜木三局｜3 歲起運｜時柱 庚寅');
    expect(lines[2]).toContain('命宮 紫微(廟)');
    expect(lines[1]).not.toContain('目前排的盤');
  });

  it('不含稱呼與生日', () => {
    expect(block.text).not.toContain('小明');
    expect(block.text).not.toContain('2000');
    expect(block.text).not.toContain('七月十七');
  });

  it('可以當成提問的補充資料附上', () => {
    const chart = candidates[2]!.chart;
    const saved = { id: 'testchart0000001', input, chartSettings: DEFAULT_CHART_SETTINGS, createdAt: '', updatedAt: '' };
    const attachment = buildAttachment({ chart, saved, text: RECTIFY_MESSAGE, palaceNames: [], selectedPalace: null, extra: block });
    expect(attachment?.label).toBe(block.label);
    expect(attachment?.text).toBe(block.text);
    expect(RECTIFY_MESSAGE).toContain('先不要替我下結論');
  });
});

describe('定盤輔助：改時辰', () => {
  it('改成別的時辰後，原本輸入的時鐘時間一併拿掉', async () => {
    const saved = await saveChart(input, DEFAULT_CHART_SETTINGS);
    expect(saved.input.clockTime).toBe('04:10');
    const updated = await updateChart(saved.id, { timeIndex: 3 });
    expect(updated?.input.timeIndex).toBe(3);
    expect(updated?.input).not.toHaveProperty('clockTime');
    expect(updated?.input.date).toBe('2000-8-16');
    expect((await getChart(saved.id))?.input.timeIndex).toBe(3);
  });
});

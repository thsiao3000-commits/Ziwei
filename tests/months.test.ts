// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { computeChart, computeLimits, computeMonths } from '../src/features/chart/engine';
import { previousSolarDay } from '../src/features/chart/calendar';
import { focusText, monthRows, monthsMessage, monthYears, serializeMonths, solarRange, solarRangeShort, WEALTH_PALACES } from '../src/features/chart/months';
import { ChartInputError, DEFAULT_CHART_SETTINGS, MUTAGENS, type BirthInput } from '../src/features/chart/types';
import { mentionedYears } from '../src/features/reading/request';

// 虛構的測試生日。
const input: BirthInput = { name: '小明', gender: 'female', calendar: 'solar', date: '2000-8-16', timeIndex: 2 };
const chart = computeChart(input, DEFAULT_CHART_SETTINGS);
const months2026 = computeMonths(input, DEFAULT_CHART_SETTINGS, 2026);
const rows = monthRows(chart, months2026);

const asNumber = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return y! * 10000 + m! * 100 + d!;
};

describe('流月財運一覽：排盤模組', () => {
  it('一般年有十二個流月，國曆起日由農曆月初換算且依序遞增', () => {
    expect(months2026.map((item) => item.label)).toEqual(['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '臘月']);
    // 2026 年農曆正月初一是國曆 2 月 17 日；臘月落在隔年一月。
    expect(months2026[0]!.solarStart).toBe('2026-2-17');
    expect(months2026.at(-1)!.solarStart).toBe('2027-1-8');
    // 訖日是下一個流月開始的前一天；最後一個流月到隔年正月初一的前一天（2027 年春節是 2 月 6 日）。
    expect(months2026[0]!.solarEnd).toBe('2026-3-18');
    expect(months2026.at(-1)!.solarEnd).toBe('2027-2-5');
    for (let i = 0; i < months2026.length - 1; i += 1) {
      expect(asNumber(months2026[i]!.solarEnd)).toBeLessThan(asNumber(months2026[i + 1]!.solarStart));
      expect(asNumber(months2026[i]!.solarEnd)).toBeGreaterThanOrEqual(asNumber(months2026[i]!.solarStart));
    }
    const dates = months2026.map((item) => asNumber(item.solarStart));
    expect([...dates].sort((a, b) => a - b)).toEqual(dates);
    expect(new Set(dates).size).toBe(12);
  });

  it('和命盤頁運限選擇用的流月是同一份資料', () => {
    const decadal = computeLimits(input, DEFAULT_CHART_SETTINGS, { decadal: null, year: null, month: null }).decadals.findIndex(
      (item) => item.yearRange[0] <= 2026 && item.yearRange[1] >= 2026,
    );
    for (const index of [0, 5, 11]) {
      const limits = computeLimits(input, DEFAULT_CHART_SETTINGS, { decadal, year: 2026, month: index });
      expect(limits.months[index]!.label).toBe(months2026[index]!.label);
      expect(limits.overlay.monthly).toEqual(months2026[index]!.limit);
    }
  });

  it('有閏月的年份：閏月分成前半與後半，起日仍然遞增', () => {
    const months = computeMonths(input, DEFAULT_CHART_SETTINGS, 2025);
    expect(months.map((item) => item.label)).toContain('閏六月（前半）');
    expect(months.map((item) => item.label)).toContain('閏六月（後半）');
    expect(months[0]!.solarStart).toBe('2025-1-29');
    const dates = months.map((item) => asNumber(item.solarStart));
    expect([...dates].sort((a, b) => a - b)).toEqual(dates);
    expect(new Set(dates).size).toBe(months.length);
  });

  it('年份超出範圍時丟出輸入錯誤', () => {
    expect(() => computeMonths(input, DEFAULT_CHART_SETTINGS, 1800)).toThrow(ChartInputError);
    expect(() => computeMonths(input, DEFAULT_CHART_SETTINGS, 2101)).toThrow(ChartInputError);
  });
});

describe('流月財運一覽：整理與提問', () => {
  it('每個流月：干支、流月命宮落點、四化各落在盤上有那顆星的宮', () => {
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({ label: '正月', solarStart: '2026-2-17', solarEnd: '2026-3-18', stemBranch: '庚寅' });
    for (const row of rows) {
      expect(chart.palaces.map((palace) => palace.name)).toContain(row.palaceName);
      expect(row.hits.map((hit) => hit.mutagen)).toEqual([...MUTAGENS]);
      for (const hit of row.hits) {
        const palace = chart.palaces.find((item) => item.name === hit.palaceName)!;
        expect([...palace.majorStars, ...palace.minorStars].map((star) => star.name), `${row.label} ${hit.star}`).toContain(hit.star);
        expect(hit.focus).toBe(WEALTH_PALACES.includes(hit.palaceName));
      }
    }
  });

  it('落在命宮、財帛、福德、田宅的四化會整理成一句', () => {
    expect(focusText(rows[0]!)).toBe('權入財帛');
    expect(focusText(rows[2]!)).toBe('權入命宮、忌入財帛');
    expect(rows.some((row) => focusText(row) === '')).toBe(true);
  });

  it('給模型的補充資料：每個流月一行，含國曆起日', () => {
    const { label, text } = serializeMonths(2026, rows);
    expect(label).toBe('2026 年流月');
    const lines = text.split('\n');
    expect(lines[0]).toBe('【2026 農曆年各流月（由排盤程式計算；國曆期間是每個流月的起訖日；四化後面括號內是該星所在的本命宮位）】');
    expect(lines).toHaveLength(13);
    expect(lines[1]).toBe('農曆正月（國曆 2026/2/17–2026/3/18）｜庚寅｜流月命宮落在本命財帛｜四化 祿太陽(子女) 權武曲(財帛) 科太陰(僕役) 忌天同(疾厄)｜落在命財福田：權入財帛');
    expect(text).not.toContain('小明');
    expect(text).not.toContain('2000-8-16');
  });

  it('提問：標明是傳統看法、不提標的與價位；年份會讓系統另外附上那一年的流年', () => {
    const message = monthsMessage(2026);
    for (const text of ['傳統上偏順', '傳統上偏保守', '沒有明顯訊號', '沒有統計驗證', '不要提任何投資標的或價位', '不要把偏順的月份說成可以放大部位或會獲利', '不代表會虧損']) {
      expect(message).toContain(text);
    }
    expect(mentionedYears(message, 2000)).toEqual([2026]);
  });

  it('提問：最後要輸出「可貼上的流月過濾」，月份同時寫農曆月名與國曆期間，日期照抄', () => {
    const message = monthsMessage(2026);
    for (const text of [
      '以「可貼上的流月過濾」為標題，輸出一個程式碼區塊',
      '【流月過濾｜2026 農曆年｜紫微斗數傳統看法，無統計驗證】',
      '偏順：農曆某月（國曆 起日–訖日）',
      '偏保守：農曆某月（國曆 起日–訖日）',
      '減碼與停損不受此限制。',
      '國曆期間照補充資料逐字抄寫（含年份），不要自行換算或改寫日期',
    ]) {
      expect(message).toContain(text);
    }
  });

  it('前一天的計算：跨月、跨年、閏年', () => {
    expect(previousSolarDay('2026-3-19')).toBe('2026-3-18');
    expect(previousSolarDay('2026-3-1')).toBe('2026-2-28');
    expect(previousSolarDay('2028-3-1')).toBe('2028-2-29');
    expect(previousSolarDay('2027-1-1')).toBe('2026-12-31');
    expect(solarRange({ solarStart: '2026-12-9', solarEnd: '2027-1-7' })).toBe('2026/12/9–2027/1/7');
    // 畫面上的精簡寫法：同年省略訖日的年份，跨年仍寫。
    expect(solarRangeShort({ solarStart: '2026-2-17', solarEnd: '2026-3-18' })).toBe('2026/2/17–3/18');
    expect(solarRangeShort({ solarStart: '2026-12-9', solarEnd: '2027-1-7' })).toBe('2026/12/9–2027/1/7');
  });

  it('可選的年份：出生年起一百年，不超過上限', () => {
    const years = monthYears(chart, 2100);
    expect(years[0]).toBe(2000);
    expect(years.at(-1)).toBe(2100);
    expect(monthYears(chart, 2050).at(-1)).toBe(2050);
  });
});

import { describe, expect, it } from 'vitest';
import { computeChart, daysInSolarMonth, hasLeapMonth } from '../src/features/chart/engine';
import { clockMatchesTimeIndex, clockToTimeIndex, TIME_SLOTS } from '../src/features/chart/time';
import {
  ChartInputError,
  DEFAULT_CHART_SETTINGS,
  MUTAGENS,
  type BirthInput,
  type ChartErrorCode,
} from '../src/features/chart/types';

const base: BirthInput = { name: '測試', gender: 'female', calendar: 'solar', date: '2000-8-16', timeIndex: 2 };

function errorCode(input: BirthInput): ChartErrorCode | 'no error' {
  try {
    computeChart(input, DEFAULT_CHART_SETTINGS);
    return 'no error';
  } catch (error) {
    if (error instanceof ChartInputError) return error.code;
    throw error;
  }
}

describe('命盤結構', () => {
  const chart = computeChart(base, DEFAULT_CHART_SETTINGS);

  it('十二宮依地支順行，index 0 是寅宮', () => {
    expect(chart.palaces.map((palace) => palace.branch).join('')).toBe('寅卯辰巳午未申酉戌亥子丑');
    expect(chart.palaces.map((palace) => palace.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('三方四正是對宮、財帛位、官祿位', () => {
    const soul = chart.palaces[chart.soulPalaceIndex];
    expect(soul?.name).toBe('命宮');
    if (!soul) return;
    expect(chart.palaces[soul.surrounded.opposite]?.name).toBe('遷移');
    expect(chart.palaces[soul.surrounded.wealth]?.name).toBe('財帛');
    expect(chart.palaces[soul.surrounded.career]?.name).toBe('官祿');
    for (const palace of chart.palaces) {
      expect(palace.surrounded.opposite).toBe((palace.index + 6) % 12);
      expect(new Set([palace.surrounded.wealth, palace.surrounded.career])).toEqual(
        new Set([(palace.index + 4) % 12, (palace.index + 8) % 12]),
      );
    }
  });

  it('生年四化各一顆，位置與星曜標記一致', () => {
    expect(chart.birthMutagens.map((item) => item.mutagen)).toEqual([...MUTAGENS]);
    for (const item of chart.birthMutagens) {
      const palace = chart.palaces[item.palaceIndex];
      const star = [...(palace?.majorStars ?? []), ...(palace?.minorStars ?? [])].find((s) => s.name === item.star);
      expect(star?.mutagen).toBe(item.mutagen);
    }
  });

  it('空宮沒有主星', () => {
    for (const palace of chart.palaces) {
      expect(palace.isEmpty).toBe(palace.majorStars.length === 0);
    }
    expect(chart.palaces.some((palace) => palace.isEmpty)).toBe(true);
  });

  it('宮干飛化落在十二宮內', () => {
    for (const palace of chart.palaces) {
      for (const mutagen of MUTAGENS) {
        const target = palace.flies[mutagen];
        if (target !== null) {
          expect(target).toBeGreaterThanOrEqual(0);
          expect(target).toBeLessThan(12);
        }
      }
    }
  });

  it('記錄 iztro 版本與排盤設定', () => {
    expect(chart.iztroVersion).toBe('2.6.5');
    expect(chart.settings).toEqual(DEFAULT_CHART_SETTINGS);
  });

  it('同樣的輸入每次結果相同，且不受前一次排盤的設定影響', () => {
    const other = computeChart(base, { ...DEFAULT_CHART_SETTINGS, algorithm: 'zhongzhou', yearDivide: 'exact' });
    expect(other.settings.algorithm).toBe('zhongzhou');
    expect(computeChart(base, DEFAULT_CHART_SETTINGS)).toEqual(chart);
  });
});

describe('邊界：子時', () => {
  it('早子時與晚子時是不同的盤（預設晚子時算來日）', () => {
    const early = computeChart({ ...base, date: '1995-7-7', timeIndex: 0 }, DEFAULT_CHART_SETTINGS);
    const late = computeChart({ ...base, date: '1995-7-7', timeIndex: 12 }, DEFAULT_CHART_SETTINGS);
    expect(early.time).toBe('早子時');
    expect(late.time).toBe('晚子時');
    expect(late.fourPillars).not.toBe(early.fourPillars);
  });

  it('晚子時算當日或來日會改變日柱', () => {
    const input: BirthInput = { ...base, date: '1995-7-7', timeIndex: 12 };
    const forward = computeChart(input, { ...DEFAULT_CHART_SETTINGS, dayDivide: 'forward' });
    const current = computeChart(input, { ...DEFAULT_CHART_SETTINGS, dayDivide: 'current' });
    expect(forward.fourPillars.split(' ')[2]).not.toBe(current.fourPillars.split(' ')[2]);
  });
});

describe('邊界：年分界', () => {
  // 1990-02-03：春節（1 月 27 日）之後、立春（2 月 4 日）之前。
  const input: BirthInput = { ...base, gender: 'male', date: '1990-2-3', timeIndex: 0 };

  it('以正月初一換年時屬馬年（庚午）', () => {
    const chart = computeChart(input, { ...DEFAULT_CHART_SETTINGS, yearDivide: 'normal' });
    expect(chart.fourPillars.split(' ')[0]).toBe('庚午');
  });

  it('預設的月柱依節氣：立春前仍是丑月', () => {
    expect(computeChart(input, DEFAULT_CHART_SETTINGS).fourPillars).toBe('庚午 丁丑 己亥 甲子');
    const byLunarMonth = computeChart(input, { ...DEFAULT_CHART_SETTINGS, horoscopeDivide: 'normal' });
    expect(byLunarMonth.fourPillars).toBe('庚午 戊寅 己亥 甲子');
  });

  it('以立春換年時仍屬蛇年（己巳），生年四化跟著改變', () => {
    const normal = computeChart(input, { ...DEFAULT_CHART_SETTINGS, yearDivide: 'normal' });
    const exact = computeChart(input, { ...DEFAULT_CHART_SETTINGS, yearDivide: 'exact' });
    expect(exact.fourPillars.split(' ')[0]).toBe('己巳');
    expect(exact.birthMutagens.map((item) => item.star)).not.toEqual(normal.birthMutagens.map((item) => item.star));
  });
});

describe('邊界：農曆與閏月', () => {
  it('2020 年有閏四月，其他月份沒有', () => {
    expect(hasLeapMonth(2020, 4)).toBe(true);
    expect(hasLeapMonth(2020, 5)).toBe(false);
    expect(hasLeapMonth(2021, 4)).toBe(false);
    expect(hasLeapMonth(2023, 2)).toBe(true);
  });

  it('閏月與同名的一般月份換算成不同的國曆日期', () => {
    const lunar: BirthInput = { ...base, calendar: 'lunar', date: '2020-4-20', timeIndex: 6 };
    const plain = computeChart({ ...lunar, isLeapMonth: false }, DEFAULT_CHART_SETTINGS);
    const leap = computeChart({ ...lunar, isLeapMonth: true }, DEFAULT_CHART_SETTINGS);
    expect(plain.solarDate).toBe('2020-5-12');
    expect(leap.solarDate).toBe('2020-6-11');
    expect(leap.lunarDate).toBe('二〇二〇年閏四月二十');
  });

  it('不存在的閏月會被擋下', () => {
    expect(errorCode({ ...base, calendar: 'lunar', date: '2021-4-20', isLeapMonth: true })).toBe('not_leap_month');
  });

  it('農曆年底：臘月用繁體字', () => {
    const chart = computeChart({ ...base, date: '2024-2-9', timeIndex: 5 }, DEFAULT_CHART_SETTINGS);
    expect(chart.lunarDate).toBe('二〇二三年臘月三十');
  });

  it('晚子時用農曆輸入：核對與顯示都用出生當天的農曆日期，不是隔天', () => {
    const input: BirthInput = { ...base, calendar: 'lunar', date: '1984-12-5', timeIndex: 12, gender: 'male' };
    const chart = computeChart(input, DEFAULT_CHART_SETTINGS);
    expect(chart.solarDate).toBe('1985-1-25');
    expect(chart.lunarDate).toBe('一九八四年臘月初五');
    expect(chart).toEqual(computeChart({ ...input, calendar: 'solar', date: '1985-1-25' }, DEFAULT_CHART_SETTINGS));
  });

  it('農曆輸入與換算後的國曆輸入排出同一張盤', () => {
    const fromLunar = computeChart({ ...base, calendar: 'lunar', date: '2000-7-17' }, DEFAULT_CHART_SETTINGS);
    const fromSolar = computeChart(base, DEFAULT_CHART_SETTINGS);
    expect(fromLunar).toEqual(fromSolar);
  });
});

describe('輸入檢核', () => {
  it.each([
    ['格式錯誤', { ...base, date: '2000/8/16' }, 'invalid_format'],
    ['月份超出範圍', { ...base, date: '2000-13-1' }, 'invalid_format'],
    ['年份太早', { ...base, date: '1899-12-31' }, 'out_of_range'],
    ['年份太晚', { ...base, date: '2101-1-1' }, 'out_of_range'],
    ['國曆沒有 2 月 30 日', { ...base, date: '2001-2-30' }, 'invalid_solar_date'],
    ['平年沒有 2 月 29 日', { ...base, date: '1900-2-29' }, 'invalid_solar_date'],
    ['時辰超出範圍', { ...base, timeIndex: 13 }, 'invalid_time'],
    ['時辰不是整數', { ...base, timeIndex: 1.5 }, 'invalid_time'],
    ['農曆沒有 31 日', { ...base, calendar: 'lunar', date: '2000-7-31' }, 'invalid_lunar_date'],
  ] as const)('%s', (_name, input, code) => {
    expect(errorCode(input as BirthInput)).toBe(code);
  });

  it('農曆小月的三十日會被擋下，大月的三十日可以排', () => {
    const results = Array.from({ length: 12 }, (_, i) =>
      errorCode({ ...base, calendar: 'lunar', date: `2001-${i + 1}-30` }),
    );
    expect(results).toContain('invalid_lunar_date');
    expect(results).toContain('no error');
  });

  it('閏年 2 月 29 日可以排', () => {
    expect(errorCode({ ...base, date: '2000-2-29' })).toBe('no error');
    expect(daysInSolarMonth(2000, 2)).toBe(29);
    expect(daysInSolarMonth(2100, 2)).toBe(28);
  });

  it('錯誤訊息說明發生什麼事', () => {
    expect(() => computeChart({ ...base, date: '2001-2-30' }, DEFAULT_CHART_SETTINGS)).toThrow(
      '國曆 2001 年 2 月沒有 30 日。',
    );
  });
});

describe('時鐘時間換時辰', () => {
  it.each([
    ['00:00', 0],
    ['00:59', 0],
    ['01:00', 1],
    ['02:59', 1],
    ['03:00', 2],
    ['04:00', 2],
    ['11:00', 6],
    ['12:59', 6],
    ['13:00', 7],
    ['21:00', 11],
    ['22:59', 11],
    ['23:00', 12],
    ['23:59', 12],
  ])('%s → %i', (clock, index) => {
    expect(clockToTimeIndex(clock)).toBe(index);
  });

  it('格式不對時回傳 null', () => {
    expect(clockToTimeIndex('24:00')).toBeNull();
    expect(clockToTimeIndex('12:60')).toBeNull();
    expect(clockToTimeIndex('abc')).toBeNull();
    expect(clockToTimeIndex('')).toBeNull();
  });

  it('時辰名稱與 iztro 的輸出一致', () => {
    for (const slot of TIME_SLOTS) {
      const chart = computeChart({ ...base, timeIndex: slot.index }, DEFAULT_CHART_SETTINGS);
      expect(chart.time).toBe(slot.name);
      expect(chart.timeRange.replace('~', '–').replace('–00:00', '–24:00')).toBe(slot.range);
    }
  });

  it('可判斷時鐘時間是否仍落在選定的時辰內', () => {
    expect(clockMatchesTimeIndex('04:10', 2)).toBe(true);
    expect(clockMatchesTimeIndex('04:10', 3)).toBe(false);
  });
});

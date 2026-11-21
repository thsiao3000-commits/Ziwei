import { describe, expect, it } from 'vitest';
import { computeChart } from '../src/features/chart/engine';
import { DEFAULT_CHART_SETTINGS, type BirthInput } from '../src/features/chart/types';
import golden from './fixtures/ziwei-pub.golden.json';

/**
 * 黃金測試：與 iztro 官方線上排盤（ziwei.pub）的結果逐宮比對。
 * 固定資料由官方網站的畫面擷取而來，全部是虛構的測試生日。
 *
 * 官方排盤本身也是用 iztro 算的，所以這組測試保證的是「本站的包裝、設定與
 * 用字轉換沒有走樣，且 iztro 升版後結果沒有變」，不是獨立驗證演算法。
 */
type GoldenStar = { name: string; brightness: string; mutagen: string };

describe.each(golden.cases)('對照官方排盤：$id（$note）', (testCase) => {
  const input: BirthInput = {
    name: '測試',
    gender: testCase.input.gender as BirthInput['gender'],
    calendar: testCase.input.calendar as BirthInput['calendar'],
    date: testCase.input.date,
    isLeapMonth: testCase.input.isLeapMonth,
    timeIndex: testCase.input.timeIndex,
  };
  const chart = computeChart(input, DEFAULT_CHART_SETTINGS);
  const expected = testCase.expected;

  it('中宮資料相同', () => {
    expect(chart.fiveElementsClass).toBe(expected.fiveElementsClass);
    expect(chart.fourPillars).toBe(expected.fourPillars);
    expect(chart.soul).toBe(expected.soul);
    expect(chart.body).toBe(expected.body);
    expect(chart.soulBranch).toBe(expected.soulBranch);
    expect(chart.bodyBranch).toBe(expected.bodyBranch);
    expect(chart.zodiac).toBe(expected.zodiac);
    expect(`${chart.time}(${chart.timeRange})`).toBe(expected.time);
    // 官方網站的農曆日期仍是簡體（腊、闰），本站轉成繁體。
    expect(chart.lunarDate).toBe(expected.lunarDateRaw.replace('腊', '臘').replace('闰', '閏'));
    expect(chart.lunarDate).not.toMatch(/[腊闰]/);
  });

  it('國曆日期相同', () => {
    const normalise = (value: string) => value.split('-').map(Number).join('-');
    expect(normalise(chart.solarDate)).toBe(normalise(expected.solarDate));
  });

  it('十二宮逐宮相同', () => {
    expect(chart.palaces).toHaveLength(12);
    for (const want of expected.palaces) {
      const got = chart.palaces.find((palace) => palace.branch === want.branch);
      expect(got, `找不到 ${want.branch} 宮`).toBeDefined();
      if (!got) continue;
      const label = `${want.branch}宮（${want.name}）`;
      const stars = (list: { name: string; brightness: string; mutagen: string | null }[]): GoldenStar[] =>
        list.map((star) => ({ name: star.name, brightness: star.brightness, mutagen: star.mutagen ?? '' }));

      expect(got.name, label).toBe(want.name);
      expect(got.stem, label).toBe(want.stem);
      expect(got.isBodyPalace, label).toBe(want.isBody);
      expect(stars(got.majorStars), `${label} 主星`).toEqual(want.major);
      expect(stars(got.minorStars), `${label} 輔星`).toEqual(want.minor);
      // 官方網站把雜曜分兩欄顯示，順序和 iztro 的陣列不同，所以比對內容不比順序。
      expect(got.adjectiveStars.map((star) => star.name).sort(), `${label} 雜曜`).toEqual([...want.adjective].sort());
      expect(got.changsheng12, label).toBe(want.changsheng12);
      expect(got.boshi12, label).toBe(want.boshi12);
      expect(got.suiqian12, label).toBe(want.suiqian12);
      expect(got.jiangqian12, label).toBe(want.jiangqian12);
      expect(got.decadalRange, `${label} 大限`).toEqual(want.decadal);
    }
  });

  it('命宮與身宮的位置和中宮一致', () => {
    expect(chart.palaces[chart.soulPalaceIndex]?.name).toBe('命宮');
    expect(chart.palaces[chart.soulPalaceIndex]?.branch).toBe(expected.soulBranch);
    expect(chart.palaces.find((palace) => palace.isBodyPalace)?.branch).toBe(expected.bodyBranch);
  });
});

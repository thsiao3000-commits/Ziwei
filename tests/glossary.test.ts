import { describe, expect, it } from 'vitest';
import { computeChart, computeTimeCandidates } from '../src/features/chart/engine';
import { DEFAULT_CHART_SETTINGS, type BirthInput } from '../src/features/chart/types';
import { CATEGORIES, findTerm, searchTerms, TERMS } from '../src/features/glossary/terms';

// 虛構的測試生日。
const input: BirthInput = { name: '測試', gender: 'female', calendar: 'solar', date: '2000-8-16', timeIndex: 2 };

describe('名詞小辭典：內容', () => {
  it('沒有重複的名詞；每一條都有分類與說明', () => {
    const names = TERMS.map((item) => item.term);
    expect(new Set(names).size).toBe(names.length);
    for (const item of TERMS) {
      expect(CATEGORIES).toContain(item.category);
      expect(item.text.length, item.term).toBeGreaterThanOrEqual(10);
      expect(item.text.endsWith('。'), item.term).toBe(true);
    }
  });

  it('別名不會和其他條目的名詞撞名', () => {
    const names = new Set(TERMS.map((item) => item.term));
    for (const item of TERMS) {
      for (const alias of item.aliases ?? []) expect(names.has(alias), `${item.term} 的別名 ${alias}`).toBe(false);
    }
  });

  it('每個分類都有條目', () => {
    for (const category of CATEGORIES) expect(TERMS.some((item) => item.category === category), category).toBe(true);
  });

  it('不用宿命或聳動的字眼', () => {
    for (const item of TERMS) expect(item.text, item.term).not.toMatch(/註定|注定|必定|一定會|命中註定|大凶|劫數難逃/);
  });

  it('盤上會出現的宮名、主星、輔星、雜曜都查得到', () => {
    const missing = new Set<string>();
    const charts = [
      ...computeTimeCandidates(input, DEFAULT_CHART_SETTINGS).map((item) => item.chart),
      computeChart({ ...input, date: '1985-1-25', gender: 'male' }, { ...DEFAULT_CHART_SETTINGS, algorithm: 'zhongzhou' }),
      computeChart({ ...input, date: '1968-12-31', timeIndex: 12 }, DEFAULT_CHART_SETTINGS),
      computeChart({ ...input, date: '1976-2-5', timeIndex: 11 }, DEFAULT_CHART_SETTINGS),
    ];
    for (const chart of charts) {
      for (const palace of chart.palaces) {
        if (!findTerm(palace.name)) missing.add(palace.name);
        for (const star of [...palace.majorStars, ...palace.minorStars, ...palace.adjectiveStars]) {
          if (!findTerm(star.name)) missing.add(star.name);
        }
        for (const name of [palace.changsheng12, palace.boshi12, palace.suiqian12, palace.jiangqian12]) {
          if (!findTerm(name)) missing.add(name);
        }
      }
      for (const name of [chart.soul, chart.body]) if (!findTerm(name)) missing.add(name);
    }
    expect([...missing]).toEqual([]);
  });

  it('宮位詳情用到的名詞都查得到', () => {
    for (const name of ['三方四正', '宮干飛化', '大限', '小限', '長生十二神', '博士十二神', '歲前十二神', '空宮', '身宮', '來因宮', '自化']) {
      expect(findTerm(name), name).toBeDefined();
    }
  });
});

describe('名詞小辭典：查詢', () => {
  it('用名詞、別名或加「宮」字都找得到同一條', () => {
    expect(findTerm('僕役')?.term).toBe('僕役');
    expect(findTerm('交友宮')?.term).toBe('僕役');
    expect(findTerm('財帛宮')?.term).toBe('財帛');
    expect(findTerm('事業')?.term).toBe('官祿');
    expect(findTerm('年解')?.term).toBe('解神');
    expect(findTerm('截路')?.term).toBe('截空');
    expect(findTerm('廟')?.term).toBe('亮度');
    expect(findTerm('帝旺')?.term).toBe('長生十二神');
    expect(findTerm(' 紫微 ')?.term).toBe('紫微');
    expect(findTerm('不存在的詞')).toBeUndefined();
  });

  it('大耗是雜曜，不會被博士十二神的清單蓋掉', () => {
    expect(findTerm('大耗')?.category).toBe('雜曜');
  });

  it('搜尋：開頭符合的排前面，也會找說明文字', () => {
    expect(searchTerms('')).toHaveLength(TERMS.length);
    expect(searchTerms('化忌')[0]?.term).toBe('化忌');
    expect(searchTerms('化').slice(0, 4).map((item) => item.term)).toEqual(['化祿', '化權', '化科', '化忌']);
    expect(searchTerms('桃花').map((item) => item.term)).toEqual(expect.arrayContaining(['紅鸞', '天姚', '咸池', '貪狼']));
    expect(searchTerms('事業').map((item) => item.term)).toContain('官祿');
    expect(searchTerms('zzz')).toEqual([]);
  });
});

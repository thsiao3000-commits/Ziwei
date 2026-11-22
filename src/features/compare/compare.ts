import { MUTAGENS, type BirthInput, type ChartData, type HoroscopeData, type Mutagen } from '../chart/types';
import type { QuickPrompt } from '../reading/prompts';
import { palacesFromSoul, serializeChart, serializeYear, type School } from '../reading/serialize';

/**
 * 合盤（CR-13）：兩張命盤之間的交互關係。
 * 全部由程式從排盤結果算出來，不交給模型推算（AI 不排盤）。
 */

/** 對話的索引鍵：兩張盤各自的 id，順序固定，甲乙對調也是同一段對話紀錄的不同鍵。 */
export function compareKey(idA: string, idB: string): string {
  return `compare:${idA}:${idB}`;
}

/** 從合盤對話的索引鍵取回兩張盤的 id；不是合盤的鍵回傳 null。 */
export function parseCompareKey(key: string): [string, string] | null {
  const match = /^compare:([a-z0-9]+):([a-z0-9]+)$/.exec(key);
  return match ? [match[1]!, match[2]!] : null;
}

function majorText(chart: ChartData, index: number): string {
  const palace = chart.palaces[index];
  if (!palace || palace.majorStars.length === 0) return '空宮';
  return palace.majorStars.map((star) => `${star.name}${star.brightness ? `(${star.brightness})` : ''}${star.mutagen ? `[${star.mutagen}]` : ''}`).join('、');
}

export type SoulPlacement = { branch: string; palaceName: string };

/** 「from 的命宮地支」在 onto 盤上是哪一宮。 */
export function soulPlacement(from: ChartData, onto: ChartData): SoulPlacement {
  const palace = onto.palaces.find((item) => item.branch === from.soulBranch);
  return { branch: from.soulBranch, palaceName: palace?.name ?? '' };
}

export type CrossMutagen = { mutagen: Mutagen; star: string; palaceName: string };

/** 「from 的生年四化」那四顆星，在 onto 盤上各落在哪一宮。 */
export function crossMutagens(from: ChartData, onto: ChartData): CrossMutagen[] {
  return from.birthMutagens.map(({ mutagen, star }) => {
    const palace = onto.palaces.find((item) => [...item.majorStars, ...item.minorStars].some((candidate) => candidate.name === star));
    return { mutagen, star, palaceName: palace?.name ?? '' };
  });
}

/** 某顆星在這張盤上的哪一宮（主星與輔星）；找不到時回傳空字串。 */
function starPalace(chart: ChartData, star: string): string {
  return chart.palaces.find((item) => [...item.majorStars, ...item.minorStars].some((candidate) => candidate.name === star))?.name ?? '';
}

export type FlyRow = { palace: string; stem: string; items: CrossMutagen[] };

/**
 * 飛星互入：「from 每一宮的宮干四化」那四顆星，在 onto 盤上各落在哪一宮。
 * 十二宮依命宮起的順序。
 */
export function crossFlies(from: ChartData, onto: ChartData): FlyRow[] {
  return palacesFromSoul(from).map((palace) => ({
    palace: palace.name,
    stem: palace.stem,
    items: MUTAGENS.map((mutagen) => {
      const star = palace.flyStars[mutagen];
      return { mutagen, star, palaceName: starPalace(onto, star) };
    }),
  }));
}

export type LimitSummary = {
  /** 虛歲 */
  age: number;
  /** 還沒起運時為 null */
  decadal: { stemBranch: string; ageRange: [number, number]; palaceName: string; mutagens: CrossMutagen[] } | null;
  yearly: { stemBranch: string; palaceName: string; mutagens: CrossMutagen[] };
};

/** 某一年的大限與流年：干支、命宮落在本命哪一宮、四化星落在本命哪一宮。 */
export function limitSummary(chart: ChartData, horoscope: HoroscopeData): LimitSummary {
  const layer = (limit: HoroscopeData['yearly']) => ({
    stemBranch: `${limit.stem}${limit.branch}`,
    palaceName: chart.palaces[limit.palaceIndex]?.name ?? '',
    mutagens: limit.mutagens.map(({ mutagen, star, palaceIndex }) => ({
      mutagen,
      star,
      palaceName: palaceIndex === null ? '' : (chart.palaces[palaceIndex]?.name ?? ''),
    })),
  });
  return {
    age: horoscope.nominalAge,
    decadal: horoscope.decadal ? { ...layer(horoscope.decadal), ageRange: horoscope.decadal.ageRange } : null,
    yearly: layer(horoscope.yearly),
  };
}

/** 「from 的大限四化」那四顆星，在 onto 盤上各落在哪一宮。還沒起運時回傳空陣列。 */
export function crossDecadal(from: HoroscopeData, onto: ChartData): CrossMutagen[] {
  return (from.decadal?.mutagens ?? []).map(({ mutagen, star }) => ({ mutagen, star, palaceName: starPalace(onto, star) }));
}

/** 合盤要看的那一年，以及兩張盤在那一年的運限。 */
export type CompareLimits = { year: number; a: HoroscopeData; b: HoroscopeData };

/** 可以選的年份：兩人都已出生之後，到較晚出生者的一百歲（不超過排盤支援的範圍）。 */
export function compareYears(a: ChartData, b: ChartData, maxYear: number): number[] {
  const born = Math.max(Number(a.solarDate.split('-')[0]), Number(b.solarDate.split('-')[0]));
  const last = Math.min(maxYear, born + 100);
  return Array.from({ length: Math.max(0, last - born + 1) }, (_, i) => born + i);
}

export type PalaceRow = { palace: string; a: string; b: string };

/** 逐宮主星對照：十二宮依命宮起的順序，兩張盤各自的主星。 */
export function palaceRows(a: ChartData, b: ChartData): PalaceRow[] {
  return palacesFromSoul(a).map((palace) => {
    const other = b.palaces.find((item) => item.name === palace.name);
    return { palace: palace.name, a: majorText(a, palace.index), b: other ? majorText(b, other.index) : '' };
  });
}

export type Party = {
  /** 提示詞裡的稱呼：甲、乙 */
  label: '甲' | '乙';
  chart: ChartData;
  /** 使用者開啟「提問時附上出生年月日」才會有 */
  birth?: BirthInput;
};

function crossLine(from: Party, onto: Party): string {
  const items = crossMutagens(from.chart, onto.chart)
    .map((item) => `${item.mutagen} ${item.star}→${onto.label}的${item.palaceName || '（盤上找不到這顆星）'}`)
    .join('｜');
  return `${from.label}的生年四化落在${onto.label}盤：${items}`;
}

function flyLines(from: Party, onto: Party): string[] {
  return [
    `${from.label}的宮干四化飛入${onto.label}盤（${from.label}的宮位：四化星→落在${onto.label}的哪一宮）：`,
    ...crossFlies(from.chart, onto.chart).map(
      (row) => `${row.palace}（${row.stem}）：${row.items.map((item) => `${item.mutagen} ${item.star}→${item.palaceName || '無'}`).join('｜')}`,
    ),
  ];
}

function decadalLine(from: Party, horoscope: HoroscopeData, onto: Party): string {
  const items = crossDecadal(horoscope, onto.chart);
  if (items.length === 0) return `${from.label}當時尚未起運，沒有大限四化`;
  return `${from.label}的大限四化落在${onto.label}盤：${items.map((item) => `${item.mutagen} ${item.star}→${onto.label}的${item.palaceName || '（盤上找不到這顆星）'}`).join('｜')}`;
}

/**
 * 給模型的合盤資料：兩張本命盤，加上程式算好的交互關係（命宮與生年四化互入、宮干飛化互入）。
 * 有選年份時，再附上兩人那一年的大限與流年，以及大限四化互入。
 */
export function serializeCompare(a: Party, b: Party, school: School, limits?: CompareLimits | null): string {
  const block = (party: Party) =>
    [`＝＝＝ ${party.label} ＝＝＝`, serializeChart(party.chart, null, { school, ...(party.birth ? { birth: party.birth } : {}) })].join('\n');
  const soulA = soulPlacement(a.chart, b.chart);
  const soulB = soulPlacement(b.chart, a.chart);
  return [
    `【合盤】以下是兩張命盤，分別稱為「${a.label}」與「${b.label}」。`,
    block(a),
    block(b),
    '【兩盤的交互關係（由排盤程式計算）】',
    `${a.label}的命宮地支（${soulA.branch}）落在${b.label}盤的${soulA.palaceName}；${b.label}的命宮地支（${soulB.branch}）落在${a.label}盤的${soulB.palaceName}`,
    crossLine(a, b),
    crossLine(b, a),
    '【宮干飛化互入（由排盤程式計算）】',
    ...flyLines(a, b),
    ...flyLines(b, a),
    ...(limits
      ? [
          `【${limits.year} 年的運限（由排盤程式計算）】兩人的流年干支相同，流年四化是同樣四顆星，各自落在自己盤上的位置見下。`,
          `＝ ${a.label} ＝`,
          serializeYear(a.chart, limits.year, limits.a),
          `＝ ${b.label} ＝`,
          serializeYear(b.chart, limits.year, limits.b),
          decadalLine(a, limits.a, b),
          decadalLine(b, limits.b, a),
        ]
      : ['【運限】使用者這次沒有選年份，資料裡沒有大限與流年。']),
  ].join('\n');
}

/** 合盤時加在系統提示詞裡的規則。 */
export const COMPARE_RULES =
  '【合盤】這次是比較兩張命盤的互動，不是解讀單一命盤。請說明兩人的互動模式、互補的地方、容易摩擦的地方，以及相處上可行的建議。不要下「合」或「不合」的二分結論，也不要評斷誰好誰壞；兩張盤只顯示傾向，關係怎麼發展取決於兩個人。引用依據時要寫清楚是哪一張盤（甲或乙）的哪一宮。資料裡的「宮干飛化互入」與運限都由排盤程式算好，請直接引用，不要自行推算；看飛星時以命宮、夫妻、福德等與提問相關的宮位為主，不必逐宮羅列。運限只有使用者選的那一年；問到資料裡沒有的年份時，請說明需要在頁面上改選年份，不要自己推算那一年的四化。';

export const COMPARE_PROMPTS: readonly QuickPrompt[] = [
  { id: 'compare-overall', label: '整體互動', message: '請比較這兩張命盤，說明兩個人相處的整體互動模式。', palaces: [] },
  { id: 'compare-love', label: '感情相處', message: '如果這兩個人是伴侶，感情上怎麼互動？互補與容易摩擦的地方各是什麼？', palaces: [] },
  { id: 'compare-talk', label: '溝通與衝突', message: '這兩個人溝通與處理衝突的方式有什麼不同？意見不合時可以怎麼做？', palaces: [] },
  { id: 'compare-money', label: '金錢觀', message: '這兩個人對金錢與生活安排的看法有什麼差異？一起理財或分擔家計時要留意什麼？', palaces: [] },
  { id: 'compare-work', label: '合作共事', message: '如果這兩個人一起工作或合夥，各自適合負責什麼？要留意哪些地方？', palaces: [] },
  { id: 'compare-fly', label: '飛星互動', message: '請用宮干飛化互入來看：兩人各自的命宮、夫妻宮、福德宮的祿與忌飛到對方的哪一宮？這代表什麼樣的互動？', palaces: [] },
  { id: 'compare-year', label: '這一年的相處', message: '請用資料裡這一年的大限與流年，說明兩人這一年各自的重點，以及相處上要留意什麼。', palaces: [] },
  { id: 'compare-family', label: '親子或家人', message: '如果這兩個人是親子或家人，相處上各自需要什麼？怎麼互相理解？', palaces: [] },
];

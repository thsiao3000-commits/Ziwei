import { MUTAGENS, type ChartData, type MonthLimit, type Mutagen } from './types';

/**
 * 流月財運一覽（業主要求，v1.8.0）。
 * 表格內容全部由排盤程式算出；「偏順或偏保守」是請 AI 依傳統看法判斷，
 * 頁面與提問都要寫明這是傳統解讀、沒有統計驗證。
 */

/** 看財運時留意的宮位。 */
export const WEALTH_PALACES: readonly string[] = ['命宮', '財帛', '福德', '田宅'];

export type MonthHit = { mutagen: Mutagen; star: string; palaceName: string; focus: boolean };

export type MonthRow = {
  label: string;
  /** YYYY-M-D */
  solarStart: string;
  /** YYYY-M-D */
  solarEnd: string;
  stemBranch: string;
  /** 流月命宮落在本命哪一宮 */
  palaceName: string;
  hits: MonthHit[];
};

export function monthRows(chart: ChartData, months: readonly MonthLimit[]): MonthRow[] {
  return months.map(({ label, solarStart, solarEnd, limit }) => ({
    label,
    solarStart,
    solarEnd,
    stemBranch: `${limit.stem}${limit.branch}`,
    palaceName: chart.palaces[limit.palaceIndex]?.name ?? '',
    hits: MUTAGENS.map((mutagen) => {
      const item = limit.mutagens.find((candidate) => candidate.mutagen === mutagen);
      const palaceName = item && item.palaceIndex !== null ? (chart.palaces[item.palaceIndex]?.name ?? '') : '';
      return { mutagen, star: item?.star ?? '', palaceName, focus: WEALTH_PALACES.includes(palaceName) };
    }),
  }));
}

/** 這個流月的四化裡，落在命宮、財帛、福德、田宅的那幾個，例：「祿入財帛、忌入福德」。 */
export function focusText(row: MonthRow): string {
  return row.hits
    .filter((hit) => hit.focus)
    .map((hit) => `${hit.mutagen}入${hit.palaceName}`)
    .join('、');
}

/** 「2026-2-17」→「2026/2/17」 */
export function slashDate(date: string): string {
  return date.replaceAll('-', '/');
}

/** 國曆期間，起訖都寫出年份以免誤會，例：「2026/2/17–2026/3/18」。 */
export function solarRange(row: Pick<MonthRow, 'solarStart' | 'solarEnd'>): string {
  return `${slashDate(row.solarStart)}–${slashDate(row.solarEnd)}`;
}

/** 畫面表格用的精簡寫法：訖日和起日同一年時省略年份，例：「2026/2/17–3/18」；跨年時仍寫出年份。 */
export function solarRangeShort(row: Pick<MonthRow, 'solarStart' | 'solarEnd'>): string {
  const sameYear = row.solarStart.split('-')[0] === row.solarEnd.split('-')[0];
  return `${slashDate(row.solarStart)}–${sameYear ? row.solarEnd.split('-').slice(1).join('/') : slashDate(row.solarEnd)}`;
}

/** 給模型的補充資料。 */
export function serializeMonths(year: number, rows: readonly MonthRow[]): { label: string; text: string } {
  const lines = rows.map(
    (row) =>
      `農曆${row.label}（國曆 ${solarRange(row)}）｜${row.stemBranch}｜流月命宮落在本命${row.palaceName}｜四化 ${row.hits
        .map((hit) => `${hit.mutagen}${hit.star}(${hit.palaceName || '無'})`)
        .join(' ')}｜落在命財福田：${focusText(row) || '無'}`,
  );
  return {
    label: `${year} 年流月`,
    text: [`【${year} 農曆年各流月（由排盤程式計算；國曆期間是每個流月的起訖日；四化後面括號內是該星所在的本命宮位）】`, ...lines].join('\n'),
  };
}

/** 請 AI 判讀的提問。訊息裡的年份會讓系統另外附上那一年的大限與流年。 */
export function monthsMessage(year: number): string {
  return [
    `請看我 ${year} 年各流月的財運。補充資料裡有排盤程式算好的每個流月：流月命宮落在本命哪一宮、流月四化落在哪一宮。`,
    '請逐月判斷「傳統上偏順」「傳統上偏保守」或「沒有明顯訊號」，並寫出依據（主要看流月的祿與忌是否落在命宮、財帛、福德、田宅，以及流月命宮的落點）。',
    '請用表格列出：流月、國曆期間、判斷、依據。表格之後用幾句話整理這一年的節奏。',
    '限制：這是紫微斗數的傳統看法，沒有統計驗證，請在開頭說明。不要提任何投資標的或價位；不要把偏順的月份說成可以放大部位或會獲利；偏保守的月份只代表傳統上建議縮小動作，不代表會虧損。',
    '最後以「可貼上的流月過濾」為標題，輸出一個程式碼區塊（方便整段複製到投資工具的偏好欄位），內容固定為下面四行：',
    `【流月過濾｜${year} 農曆年｜紫微斗數傳統看法，無統計驗證】`,
    '偏順：農曆某月（國曆 起日–訖日）、…（沒有就寫「無」）',
    '偏保守：農曆某月（國曆 起日–訖日）、…（沒有就寫「無」）',
    '用法：只有原本的分析已到加碼價，而且當天落在偏順的國曆期間，才加碼；否則縮小或延後。減碼與停損不受此限制。',
    '月份一律同時寫農曆月名與國曆期間，國曆期間照補充資料逐字抄寫（含年份），不要自行換算或改寫日期。',
  ].join('\n');
}

/** 可選的年份：出生年起一百年，不超過排盤支援的範圍。 */
export function monthYears(chart: ChartData, maxYear: number): number[] {
  const born = Number(chart.solarDate.split('-')[0]);
  const last = Math.min(maxYear, born + 100);
  return Array.from({ length: Math.max(0, last - born + 1) }, (_, i) => born + i);
}

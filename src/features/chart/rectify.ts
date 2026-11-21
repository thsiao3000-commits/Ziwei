import { palacesFromSoul } from '../reading/serialize';
import { TIME_SLOTS } from './time';
import type { ChartData, TimeCandidate } from './types';

/** 定盤輔助用的摘要：分辨相鄰時辰時最有用的幾項。 */
export type CandidateSummary = {
  timeIndex: number;
  /** 例：寅時 */
  name: string;
  /** 例：03:00–05:00 */
  range: string;
  soulBranch: string;
  /** 命宮主星，含亮度；空宮時為「空宮」 */
  soulStars: string;
  /** 身宮落在哪一宮，例：官祿（戌） */
  bodyPalace: string;
  fiveElementsClass: string;
  /** 第一個大限開始的虛歲 */
  startAge: number;
  /** 時柱 */
  hourPillar: string;
};

function majorText(chart: ChartData, index: number, withBrightness: boolean): string {
  const palace = chart.palaces[index];
  if (!palace || palace.majorStars.length === 0) return '空宮';
  return palace.majorStars
    .map((star) => `${star.name}${withBrightness && star.brightness ? `(${star.brightness})` : ''}${star.mutagen ? `[${star.mutagen}]` : ''}`)
    .join('、');
}

export function summarise({ timeIndex, chart }: TimeCandidate): CandidateSummary {
  const slot = TIME_SLOTS[timeIndex];
  const body = chart.palaces.find((palace) => palace.isBodyPalace);
  const soul = chart.palaces[chart.soulPalaceIndex];
  return {
    timeIndex,
    name: slot?.name ?? chart.time,
    range: slot?.range ?? '',
    soulBranch: chart.soulBranch,
    soulStars: majorText(chart, chart.soulPalaceIndex, true),
    bodyPalace: body ? `${body.name}（${body.branch}）` : '',
    fiveElementsClass: chart.fiveElementsClass,
    startAge: soul?.decadalRange[0] ?? 0,
    hourPillar: chart.fourPillars.split(' ')[3] ?? '',
  };
}

/** 逐宮主星對照：每一列是一個宮名，每一欄是一個候選時辰。 */
export function majorStarRows(candidates: readonly TimeCandidate[]): { palace: string; stars: string[]; differs: boolean }[] {
  const first = candidates[0];
  if (!first) return [];
  return palacesFromSoul(first.chart).map((palace) => {
    const stars = candidates.map(({ chart }) => {
      const match = chart.palaces.find((item) => item.name === palace.name);
      return match ? majorText(chart, match.index, false) : '';
    });
    return { palace: palace.name, stars, differs: new Set(stars).size > 1 };
  });
}

/** 以某個時辰為中心，取它與前後各一個時辰（頭尾不繞回）。 */
export function neighbours<T extends { timeIndex: number }>(candidates: readonly T[], centre: number): T[] {
  return candidates.filter((item) => Math.abs(item.timeIndex - centre) <= 1);
}

/** 給 AI 的候選時辰資料，請它列出能分辨這幾個時辰的問題。 */
export function serializeCandidates(candidates: readonly TimeCandidate[], currentTimeIndex: number): { label: string; text: string } {
  const lines = ['【定盤候選】出生時辰不確定。同一個生日，以下相鄰時辰各排出的命盤：'];
  for (const candidate of candidates) {
    const summary = summarise(candidate);
    const palaces = palacesFromSoul(candidate.chart)
      .map((palace) => `${palace.name} ${majorText(candidate.chart, palace.index, true)}`)
      .join('；');
    lines.push(
      `${summary.name}（${summary.range}）${summary.timeIndex === currentTimeIndex ? '〔目前排的盤〕' : ''}：命宮在${summary.soulBranch}｜身宮在${summary.bodyPalace}｜${summary.fiveElementsClass}｜${summary.startAge} 歲起運｜時柱 ${summary.hourPillar}｜十二宮主星：${palaces}`,
    );
  }
  return { label: `定盤候選（${candidates.map((item) => TIME_SLOTS[item.timeIndex]?.name ?? '').join('、')}）`, text: lines.join('\n') };
}

/** 請 AI 協助定盤時送出的訊息。 */
export const RECTIFY_MESSAGE =
  '我不確定自己的出生時辰。請依補充資料裡幾個候選時辰的命盤差異，列出 5 到 8 個可以用過去的經歷、個性或家庭狀況來分辨的具體問題，並說明每一題的哪種答案比較符合哪個時辰。先不要替我下結論。';

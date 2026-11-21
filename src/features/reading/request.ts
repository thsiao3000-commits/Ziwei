import { computeHoroscope } from '../chart/engine';
import { MAX_YEAR, MIN_YEAR, type ChartData, type SavedChart } from '../chart/types';
import type { ChatMessage } from '../../lib/llm/types';
import { parseReply } from './followups';
import { serializeYear, surroundedLine } from './serialize';
import type { Message, UserMessage } from './types';

/** 送給模型的訊息紀錄：使用者訊息加上補充資料；模型回覆只送正文，不送建議追問區塊。 */
export function toChatMessages(messages: readonly Message[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      const extra = message.attachment ? `\n\n【補充資料（由排盤程式產生）】\n${message.attachment.text}` : '';
      result.push({ role: 'user', content: `${message.content}${extra}` });
    } else {
      const body = parseReply(message.content).body.trim();
      // 沒有任何文字的失敗回覆不送出，避免空的 assistant 訊息被供應商拒絕。
      if (body) result.push({ role: 'assistant', content: body });
    }
  }
  // 兩家 API 都要求最後一則是使用者訊息；連續的使用者訊息會被合併成同一輪。
  return result;
}

/** 從提問文字找出提到的西元年份（最多三個），用來附上該年的流年資料。 */
export function mentionedYears(text: string, birthYear: number): number[] {
  const years = new Set<number>();
  for (const match of text.matchAll(/(?<!\d)(\d{4})(?!\d)/g)) {
    const year = Number(match[1]);
    if (year >= Math.max(MIN_YEAR, birthYear) && year <= MAX_YEAR) years.add(year);
  }
  return [...years].slice(0, 3);
}

export type AttachmentInput = {
  chart: ChartData;
  saved: SavedChart;
  text: string;
  /** 要展開三方四正的宮位名稱 */
  palaceNames: readonly string[];
  /** 目前選中的宮位索引 */
  selectedPalace: number | null;
};

/**
 * 這則訊息要附上的命盤補充資料：快捷提問指定的宮位、目前選中的宮位，
 * 以及文字裡提到的年份的流年。沒有東西可附時回傳 undefined。
 */
export function buildAttachment({ chart, saved, text, palaceNames, selectedPalace }: AttachmentInput): UserMessage['attachment'] {
  const indexes = new Set<number>();
  for (const name of palaceNames) {
    const palace = chart.palaces.find((item) => item.name === name || `${item.name}宮` === name);
    if (palace) indexes.add(palace.index);
  }
  if (selectedPalace !== null && chart.palaces[selectedPalace]) indexes.add(selectedPalace);

  const labels: string[] = [];
  const parts: string[] = [];

  if (indexes.size > 0) {
    const lines = [...indexes].map((index) => surroundedLine(chart, index)).filter(Boolean);
    parts.push(`【三方四正】\n${lines.join('\n')}`);
    labels.push(...[...indexes].map((index) => chart.palaces[index]?.name ?? '').filter(Boolean));
  }

  const birthYear = Number(chart.solarDate.split('-')[0]);
  for (const year of mentionedYears(text, birthYear)) {
    try {
      // 年中的日期：不論年分界用正月初一或立春，都落在這一年。
      parts.push(serializeYear(chart, year, computeHoroscope(saved.input, saved.chartSettings, `${year}-7-1`)));
      labels.push(`${year} 年流年`);
    } catch {
      // 算不出來就不附，不影響提問。
    }
  }

  if (parts.length === 0) return undefined;
  return { label: labels.join('、'), text: parts.join('\n\n') };
}

/** 今天的日期（使用者裝置的當地時間），YYYY-M-D。 */
export function todayString(now: Date = new Date()): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

/** 對話標題：取第一則提問的前幾個字。 */
export function titleFrom(text: string): string {
  const line = text.trim().split('\n')[0] ?? '';
  return line.length > 18 ? `${line.slice(0, 18)}…` : line || '新對話';
}

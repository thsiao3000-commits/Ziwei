import { formatSolarDate } from '../chart/layout';
import type { ChartData } from '../chart/types';
import { PROVIDER_NAMES } from '../../lib/llm/types';
import { APP_VERSION } from '../../lib/version';
import { parseReply } from './followups';
import type { Conversation } from './types';

export type MarkdownOptions = {
  conversation: Conversation;
  chart: ChartData;
  name: string;
  /** 不寫出稱呼、生日、時辰與四柱 */
  anonymous: boolean;
  /** 匯出時間，YYYY-M-D */
  exportedOn: string;
};

/** 使用者輸入的文字放進 Markdown 時，避免被當成標題或清單。 */
function quote(text: string): string {
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

/**
 * 把一段對話轉成 Markdown。只含提問、帶入了哪些資料的標籤、回覆正文與所用模型；
 * 不含建議追問區塊、API 金鑰，也不含送給模型的完整命盤資料。
 */
export function conversationToMarkdown({ conversation, chart, name, anonymous, exportedOn }: MarkdownOptions): string {
  const gender = chart.gender === 'male' ? '男' : '女';
  const lines: string[] = [`# ${conversation.title}`, ''];

  const facts = anonymous
    ? [`${gender}命`, chart.fiveElementsClass, `命主 ${chart.soul}`, `身主 ${chart.body}`]
    : [
        `${name}（${gender}）`,
        `國曆 ${formatSolarDate(chart.solarDate)}`,
        `農曆 ${chart.lunarDate}`,
        chart.time,
        `四柱 ${chart.fourPillars}`,
        chart.fiveElementsClass,
        `命主 ${chart.soul}`,
        `身主 ${chart.body}`,
      ];
  lines.push(`**命盤**：${facts.join('｜')}`, '', `匯出日期：${exportedOn}`, '', '---', '');

  for (const message of conversation.messages) {
    if (message.role === 'user') {
      lines.push('## 提問', '', quote(message.content), '');
      if (message.attachment) lines.push(`_已帶入：${message.attachment.label}_`, '');
      continue;
    }
    const body = parseReply(message.content).body.trim();
    lines.push('## 解讀', '');
    if (body) lines.push(body, '');
    if (message.incomplete) {
      const reason = { truncated: '到達長度上限', stopped: '被手動停止', interrupted: '連線中斷' }[message.incomplete];
      lines.push(`_這則回覆沒有寫完（${reason}）。_`, '');
    }
    if (message.error) lines.push(`_這則回覆以錯誤結束：${message.error.message}_`, '');
    lines.push(`_${PROVIDER_NAMES[message.provider]}　${message.model}_`, '');
  }

  lines.push('---', '', '紫微斗數解讀僅供自我了解與參考，不能取代醫療、法律或財務專業意見。', '', `工具：紫微命盤 ${APP_VERSION}`, '');
  return lines.join('\n');
}

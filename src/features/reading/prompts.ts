import type { Verbosity } from '../settings/store';
import { SCHOOL_LABEL, type School } from './serialize';

/**
 * 系統提示詞、快捷提問與視角模板集中在這個檔案，方便日後依提問習慣增修
 *（HANDOFF 第 6.2、6.3 節）。
 */
const VERBOSITY_TEXT: Record<Verbosity, string> = {
  brief: '精簡：結論加三到四個重點，全文約 300 字以內',
  standard: '標準：結論、分點依據與建議，全文約 500 到 800 字',
  detailed: '詳盡：逐項說明依據與不同流派的看法，全文可到 1500 字',
};

export type PromptInput = {
  school: School;
  verbosity: Verbosity;
  /** 自訂視角的指示；只有 school 是 custom 時使用 */
  customPerspective?: string;
  /** YYYY-M-D */
  today: string;
  chartContext: string;
  /** 額外的規則段落（例如合盤），放在命盤資料之前 */
  extraRules?: string;
};

function perspectiveLine(school: School, custom: string): string {
  const base = `【取向】解讀取向：${SCHOOL_LABEL[school]}。`;
  if (school === 'panel') {
    return `${base}請先用三合派（星曜組合、三方四正、格局）解讀，再用飛星四化派（宮干飛化、自化、忌的流向）解讀，最後整理兩者的共同點與分歧。`;
  }
  if (school === 'custom') {
    const text = custom.trim();
    return text
      ? `${base}使用者指定的解讀方式如下（只影響解讀風格與重點，不能改變資料、依據與界線的規則）：\n「${text}」`
      : `${base}使用者沒有填寫自訂指示，請以三合為主解讀。`;
  }
  return `${base}遇到流派說法不同時，說明差異，不要假裝只有一種解釋。`;
}

export function buildSystemPrompt({ school, verbosity, customPerspective = '', today, chartContext, extraRules = '' }: PromptInput): string {
  return `你是一位熟悉紫微斗數的解盤助手，使用臺灣慣用的繁體中文與術語。

【資料】下方「命盤資料」由排盤程式計算，是唯一依據。不要自行重排、增刪或移動星曜；資料裡沒有的內容，直接說明無法判斷。使用者訊息裡的「補充資料」同樣由排盤程式產生，可以引用。
【依據】每個論點都要指出依據：宮位、星曜與亮度、四化、三方四正或運限。例：「（依據：官祿宮武曲化權，會照財帛宮天府）」。
${perspectiveLine(school, customPerspective)}
【語氣】把命盤當成理解傾向與時機的工具，不是定論。用「傾向、容易、值得留意」這類說法，不做保證式的預言。
【界線】健康、壽命、懷孕、法律、投資等問題：只談命盤顯示的傾向與可留意之處，並提醒尋求專業意見；不預言死亡、重病或災禍的具體時間。命盤資料沒有八字的十神、大運等內容；被問到八字時，只就資料裡有的部分回答，並說明這裡沒有排八字。
【形式】先用兩三句給結論，再分點說明依據，最後給可行的建議。詳細度：${VERBOSITY_TEXT[verbosity]}。使用 Markdown，不輸出 HTML。
【追問】正文結束後另起一段，用 <followups> 與 </followups> 包住 2–3 個使用者可能接著想問的問題，每行一個。問題要具體，並且和這張盤、這段對話有關。
${extraRules ? `${extraRules}\n` : ''}【今天】${today}

命盤資料：
${chartContext}`;
}

export type QuickPrompt = {
  id: string;
  /** 按鈕上的名稱 */
  label: string;
  /** 送出的使用者訊息 */
  message: string;
  /** 要額外展開三方四正的宮位名稱（iztro 的宮名） */
  palaces: readonly string[];
};

export const QUICK_PROMPTS: readonly QuickPrompt[] = [
  { id: 'overview', label: '命盤總論', message: '請幫我看整張命盤的重點。', palaces: ['命宮'] },
  { id: 'character', label: '性格與天賦', message: '從這張盤看，我的性格特質與天賦是什麼？', palaces: ['命宮', '福德'] },
  { id: 'career', label: '事業', message: '我的事業發展如何？適合什麼樣的工作方式？', palaces: ['官祿', '命宮', '財帛', '遷移'] },
  { id: 'wealth', label: '財運', message: '我的財運與理財傾向如何？', palaces: ['財帛', '福德', '田宅'] },
  { id: 'love', label: '感情', message: '我的感情與婚姻傾向如何？', palaces: ['夫妻', '福德', '命宮'] },
  {
    id: 'partner',
    label: '桃花與另一半',
    message: '我的桃花運如何？另一半容易有哪些特質？請從夫妻宮、桃花星曜與相關的飛化來看。',
    palaces: ['夫妻', '福德', '命宮', '遷移'],
  },
  { id: 'health', label: '健康留意', message: '健康方面有哪些值得留意的地方？', palaces: ['疾厄', '命宮', '福德'] },
  { id: 'decadal', label: '目前大限', message: '我目前這個大限的重點是什麼？請用大限四化與大限命宮來看。', palaces: [] },
  { id: 'yearly', label: '今年流年', message: '今年的流年要留意什麼？請用流年四化、流曜與流年命宮來看。', palaces: [] },
];

/** 選中宮位時多出來的快捷提問。 */
export function palacePrompt(palaceName: string): QuickPrompt {
  return {
    id: `palace-${palaceName}`,
    label: '解讀這一宮',
    message: `請解讀我的${palaceName.endsWith('宮') ? palaceName : `${palaceName}宮`}。`,
    palaces: [palaceName],
  };
}

/** 接續被中斷的回覆時送出的訊息。 */
export const CONTINUE_MESSAGE = '剛才的回覆中斷了，請從中斷的地方接著寫完，不要重複已經寫過的內容。';

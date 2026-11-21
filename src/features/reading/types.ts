import type { ErrorCode, ProviderId, Usage } from '../../lib/llm/types';

export type UserMessage = {
  role: 'user';
  /** 使用者輸入或快捷提問的文字 */
  content: string;
  /** 隨這則訊息附上的命盤補充資料（三方四正、指定年份的流年） */
  attachment?: { label: string; text: string };
  createdAt: string;
};

export type AssistantMessage = {
  role: 'assistant';
  /** 模型的原始回覆（含建議追問區塊） */
  content: string;
  provider: ProviderId;
  model: string;
  createdAt: string;
  usage?: Usage;
  /** 回覆當下依價格表估算的費用（美元）；查無費率時為 null。舊的回覆沒有這個欄位 */
  costUSD?: number | null;
  /** 回覆沒有完整收完：到達長度上限、使用者按停止，或連線中斷 */
  incomplete?: 'truncated' | 'stopped' | 'interrupted';
  /** 這則回覆以錯誤結束時的說明（已收到的文字仍保留在 content） */
  error?: { code: ErrorCode; message: string };
  /** 不影響結果的提示，例如推理深度被拒後已改用預設值 */
  notice?: string;
};

export type Message = UserMessage | AssistantMessage;

export type Conversation = {
  id: string;
  chartId: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
};

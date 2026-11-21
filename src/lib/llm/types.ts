export type ProviderId = 'openai' | 'anthropic';

export const PROVIDER_IDS: readonly ProviderId[] = ['openai', 'anthropic'];

export const PROVIDER_NAMES: Record<ProviderId, string> = {
  openai: 'OpenAI',
  anthropic: 'Claude（Anthropic）',
};

/** 推理深度。undefined 表示不送參數，使用供應商預設值。 */
export type Effort = 'low' | 'medium' | 'high';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type ChatRequest = {
  provider: ProviderId;
  model: string;
  system: string;
  messages: ChatMessage[];
  effort?: Effort;
};

export type ErrorCode =
  | 'invalid_key'
  | 'no_access'
  | 'model_not_found'
  | 'rate_limited'
  | 'quota'
  | 'overloaded'
  | 'context_too_long'
  | 'blocked'
  /** 模型以安全理由拒答（HTTP 200，不是錯誤狀態碼） */
  | 'refusal'
  | 'unknown';

export type Usage = { inputTokens: number; outputTokens: number };

export type StreamEvent =
  /** 模型正在推理，還沒有文字 */
  | { type: 'status'; state: 'thinking' }
  | { type: 'text'; delta: string }
  /** 不影響結果、但使用者應該知道的事，例如推理深度參數被拒後已移除重試 */
  | { type: 'notice'; message: string }
  /** truncated：回覆到達長度上限而中斷，已收到的文字仍然有效 */
  | { type: 'done'; usage?: Usage; truncated?: boolean }
  | { type: 'error'; code: ErrorCode; message: string };

/** 價格級距：畫面只標級距，不寫死數字（HANDOFF 第 5.1 節）。 */
export type PriceTier = '$' | '$$' | '$$$';

export type ModelInfo = {
  id: string;
  displayName: string;
  /** ISO 時間；不知道時為 null */
  createdAt: string | null;
  recommended: boolean;
  tier: PriceTier | null;
  /** 一句中文定位，只有推薦模型有 */
  note?: string;
  /** 這個模型接受的推理深度；null 表示不知道（照送，被拒再移除） */
  efforts: readonly Effort[] | null;
};

/** 可替換的 fetch，測試時用來餵模擬回應。 */
export type FetchLike = typeof fetch;

export interface LLMProvider {
  listModels(apiKey: string): Promise<ModelInfo[]>;
  streamChat(apiKey: string, req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamEvent>;
}

/** listModels 失敗時丟出的錯誤，帶有對使用者說明用的代碼與訊息。 */
export class LLMError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'LLMError';
    this.code = code;
  }
}

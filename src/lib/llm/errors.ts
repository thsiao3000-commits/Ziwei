import { PROVIDER_NAMES, type ErrorCode, type ProviderId } from './types';

/**
 * 把供應商的失敗對照成本站的錯誤代碼與訊息（HANDOFF 第 7.4 節）。
 * 訊息要說明發生什麼事與怎麼處理。
 */
export type ProviderFailure = {
  /** HTTP 狀態碼；請求沒有送達（斷線或被 CORS 擋下）時為 undefined */
  status?: number;
  /** 供應商的錯誤類型或代碼，例如 insufficient_quota、overloaded_error */
  kind?: string;
  /** 供應商的原始訊息 */
  detail?: string;
};

export function classify(failure: ProviderFailure): ErrorCode {
  const { status, kind = '', detail = '' } = failure;
  const text = `${kind} ${detail}`.toLowerCase();

  if (status === undefined) return 'blocked';
  // 用量限制要先判斷：Groq 超過額度的訊息結尾附了升級方案的網址（…/settings/billing），
  // 只看「billing」會把它誤判成帳務問題（v1.12.1 修正）。
  const rateLimited = /rate_limit|tokens per (minute|day)|requests per (minute|day)/.test(text);
  if (rateLimited && status === 413) return 'context_too_long';
  if (rateLimited && status === 429 && !/insufficient_quota/.test(text)) return 'rate_limited';
  if (/insufficient_quota|billing|credit balance|payment/.test(text) || status === 402) return 'quota';
  if (/context_length|context window|prompt is too long|too many tokens|maximum context/.test(text) || status === 413) {
    return 'context_too_long';
  }
  if (status === 401) return 'invalid_key';
  if (status === 403) return 'no_access';
  if (status === 404) return 'model_not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 500 || /overloaded/.test(text)) return 'overloaded';
  return 'unknown';
}

/** Groq 的每分鐘 token 額度很容易在附上整張命盤時用完，訊息裡要講清楚。 */
const GROQ_TPM_HINT =
  'Groq 會把「提問內容加上回覆上限」算進每分鐘的 token 額度；免費方案的額度很小，附上整張命盤的提問可能一次就超過，追問會重送整段對話、更容易超過。請等一分鐘再試、開新對話、把詳略改成精簡，或到 Groq 主控台升級方案。';

export function describe(provider: ProviderId, code: ErrorCode, failure: ProviderFailure = {}): string {
  const name = PROVIDER_NAMES[provider];
  if (provider === 'groq' && (code === 'rate_limited' || (code === 'context_too_long' && failure.status === 413))) {
    const detail = failure.detail ?? '';
    // Groq 的訊息會寫額度與這次的用量，例如「Limit 8000, Requested 11532」；有就照實列出。
    const numbers = /Limit (\d+), Requested (\d+)/.exec(detail);
    const usage = numbers ? `（額度 ${numbers[1]}，這次需要 ${numbers[2]} token）` : '';
    if (/per day|\bTPD\b|\bRPD\b/i.test(detail)) {
      return `${name} 回覆 ${failure.status ?? ''}：超過每天的用量限制${usage}。今天的額度已經用完，請明天再試、改用另一家供應商，或到 Groq 主控台升級方案。`;
    }
    return `${name} 回覆 ${failure.status ?? ''}：超過每分鐘的用量限制${usage}。${GROQ_TPM_HINT}`;
  }
  const status = failure.status === undefined ? '' : ` ${failure.status}`;
  switch (code) {
    case 'invalid_key':
      return `${name} 回覆${status}：金鑰無效或已撤銷。請到設定頁重新貼上金鑰。`;
    case 'no_access':
      return `${name} 回覆${status}：這把金鑰沒有這個模型的使用權限。請換一個模型，或到供應商主控台確認權限。`;
    case 'model_not_found':
      return `${name} 回覆${status}：找不到這個模型 ID。請到設定頁重新整理模型列表，或檢查自訂模型 ID 有沒有打錯。`;
    case 'rate_limited':
      return `${name} 回覆${status}：請求太頻繁。請稍等一下再試。`;
    case 'quota':
      return `${name} 回覆${status}：帳戶額度不足或帳務有問題。請到供應商主控台確認。`;
    case 'overloaded':
      return `${name} 回覆${status}：供應商忙碌中。請稍後再試。`;
    case 'context_too_long':
      return `${name} 回覆${status}：對話太長，超過這個模型一次能讀的長度。請開新對話。`;
    case 'blocked':
      return `瀏覽器連不上 ${name}。可能是網路問題，或 ${name} 暫時不接受瀏覽器直連。請檢查網路，或改用另一家供應商。`;
    case 'refusal':
      return `${name} 的模型拒絕回答這個問題（安全政策）。請換個問法，或改用另一個模型。`;
    case 'unknown':
      return failure.detail
        ? `${name} 回覆${status}：${failure.detail}`
        : `${name} 回覆${status}：發生未預期的錯誤。請稍後再試。`;
  }
}

/** 400 的原因是否指向推理深度參數不被接受（用來決定要不要移除參數重試）。 */
export function isEffortRejection(failure: ProviderFailure, paramHint?: string | null): boolean {
  if (failure.status !== 400) return false;
  const text = `${paramHint ?? ''} ${failure.kind ?? ''} ${failure.detail ?? ''}`.toLowerCase();
  return /effort|reasoning|output_config/.test(text);
}

export const EFFORT_DROPPED_NOTICE = '這個模型不接受目前的推理深度設定，已改用模型預設值重試。';

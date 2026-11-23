import type { LLMProvider, ProviderId } from './types';

/**
 * 取得供應商用戶端。所有對供應商的呼叫都經過這裡，元件不直接呼叫 fetch。
 * SDK 用到時才載入，沒設定金鑰的人不必下載。
 * 新增第三家供應商時，只需多實作一個 LLMProvider。
 */
const cache = new Map<ProviderId, Promise<LLMProvider>>();

/** 供應商用戶端的程式載入失敗（通常是網站剛更新，舊分頁要的檔案已不在伺服器上；也可能是斷線）。 */
export class ModuleLoadError extends Error {
  constructor() {
    super('provider module failed to load');
    this.name = 'ModuleLoadError';
  }
}

export function getProvider(id: ProviderId): Promise<LLMProvider> {
  let provider = cache.get(id);
  if (!provider) {
    const loading =
      id === 'anthropic'
        ? import('./anthropic').then((module) => module.createAnthropicProvider())
        : id === 'groq'
          ? import('./groq').then((module) => module.createGroqProvider())
          : import('./openai').then((module) => module.createOpenAIProvider());
    // 不管瀏覽器給的錯誤訊息長什麼樣，動態載入失敗一律視為同一種情況。
    provider = loading.catch(() => {
      throw new ModuleLoadError();
    });
    // 載入失敗（例如網站剛更新、舊的檔案已不存在）就不要記住，下次才會重試。
    provider.catch(() => cache.delete(id));
    cache.set(id, provider);
  }
  return provider;
}

export * from './types';

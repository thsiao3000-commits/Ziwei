import type { LLMProvider, ProviderId } from './types';

/**
 * 取得供應商用戶端。所有對供應商的呼叫都經過這裡，元件不直接呼叫 fetch。
 * SDK 用到時才載入，沒設定金鑰的人不必下載。
 * 新增第三家供應商時，只需多實作一個 LLMProvider。
 */
const cache = new Map<ProviderId, Promise<LLMProvider>>();

export function getProvider(id: ProviderId): Promise<LLMProvider> {
  let provider = cache.get(id);
  if (!provider) {
    provider =
      id === 'anthropic'
        ? import('./anthropic').then((module) => module.createAnthropicProvider())
        : import('./openai').then((module) => module.createOpenAIProvider());
    cache.set(id, provider);
  }
  return provider;
}

export * from './types';

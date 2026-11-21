import { readItem, removeItem, writeItem, type StorageArea } from '../../lib/storage/local';
import type { ProviderId } from '../../lib/llm/types';

/**
 * API 金鑰的本機儲存。金鑰只存在使用者的瀏覽器（localStorage，或只記到關閉分頁的
 * sessionStorage），本站沒有伺服器會收到它；匯出檔、網址、測試程式都不含金鑰。
 */
export type KeyStorageMode = 'local' | 'session';

const AREAS: readonly StorageArea[] = ['local', 'session'];

function storageKey(provider: ProviderId): string {
  return `key:${provider}`;
}

export function getKey(provider: ProviderId): string | null {
  for (const area of AREAS) {
    const value = readItem(storageKey(provider), area);
    if (value) return value;
  }
  return null;
}

/** 存到選定的位置，並從另一個位置移除，避免同一把金鑰留兩份。 */
export function setKey(provider: ProviderId, key: string, mode: KeyStorageMode): boolean {
  const value = key.trim();
  if (!value) return false;
  const saved = writeItem(storageKey(provider), value, mode);
  if (saved) removeItem(storageKey(provider), mode === 'local' ? 'session' : 'local');
  return saved;
}

export function clearKey(provider: ProviderId): void {
  for (const area of AREAS) removeItem(storageKey(provider), area);
}

/** 改變「記住金鑰的方式」時，把已存的金鑰搬到新的位置。 */
export function moveKeys(providers: readonly ProviderId[], mode: KeyStorageMode): void {
  for (const provider of providers) {
    const value = getKey(provider);
    if (value) setKey(provider, value, mode);
  }
}

/** 儲存後只顯示遮罩：前 3 碼與後 4 碼。太短的金鑰整段遮住。 */
export function maskKey(key: string): string {
  const value = key.trim();
  if (value.length < 12) return '••••••••';
  return `${value.slice(0, 3)}••••••••${value.slice(-4)}`;
}

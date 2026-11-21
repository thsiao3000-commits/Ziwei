import { closeDB } from './db';
import { DB_NAME, STORAGE_PREFIX, prefixed } from './keys';

export type StorageArea = 'local' | 'session';

function area(kind: StorageArea): Storage {
  return kind === 'local' ? window.localStorage : window.sessionStorage;
}

/** 讀取本站的鍵。傳入的鍵不必自己加前綴。 */
export function readItem(key: string, kind: StorageArea = 'local'): string | null {
  try {
    return area(kind).getItem(prefixed(key));
  } catch {
    // 隱私模式或儲存被停用時讀不到，當作沒有資料。
    return null;
  }
}

/** 寫入本站的鍵。回傳是否成功（空間不足或儲存被停用時為 false）。 */
export function writeItem(key: string, value: string, kind: StorageArea = 'local'): boolean {
  try {
    area(kind).setItem(prefixed(key), value);
    return true;
  } catch {
    return false;
  }
}

export function removeItem(key: string, kind: StorageArea = 'local'): void {
  try {
    area(kind).removeItem(prefixed(key));
  } catch {
    // 儲存不可用時沒有東西可刪。
  }
}

function ownKeys(store: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key !== null && key.startsWith(STORAGE_PREFIX)) keys.push(key);
  }
  return keys;
}

function deleteDatabase(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve();
      return;
    }
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

/**
 * 「清除本站所有資料」。只刪 `ziwei:` 前綴的鍵與本站的資料庫，
 * 不呼叫 clear()，同網域其他網站的資料原封不動。
 */
export async function clearSiteData(): Promise<void> {
  for (const store of [window.localStorage, window.sessionStorage]) {
    for (const key of ownKeys(store)) store.removeItem(key);
  }
  // 先關掉自己的連線，否則刪除會被擋住。
  await closeDB();
  await deleteDatabase();
}

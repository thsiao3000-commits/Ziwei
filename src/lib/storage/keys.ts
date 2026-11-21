/**
 * 本站與業主的其他網站（例如 /Stock/）同網域，localStorage、sessionStorage 與
 * IndexedDB 是共用的（HANDOFF 第 7.8 節）。所有鍵都必須帶這個前綴，
 * 清除資料時也只認這個前綴。
 */
export const STORAGE_PREFIX = 'ziwei:';

/** 本站唯一的 IndexedDB 資料庫名稱。 */
export const DB_NAME = 'ziwei-db';

export function prefixed(key: string): string {
  return key.startsWith(STORAGE_PREFIX) ? key : `${STORAGE_PREFIX}${key}`;
}

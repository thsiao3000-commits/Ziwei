import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SavedChart } from '../../features/chart/types';
import type { Conversation } from '../../features/reading/types';
import { DB_NAME } from './keys';

/**
 * 本站唯一的 IndexedDB 資料庫（ziwei-db）。同網域的其他網站有各自的資料庫，
 * 這裡不開啟、不列舉其他名稱的資料庫。
 */
interface ZiweiDB extends DBSchema {
  charts: {
    key: string;
    value: SavedChart;
    indexes: { updatedAt: string };
  };
  conversations: {
    key: string;
    value: Conversation;
    indexes: { chartId: string };
  };
}

let connection: Promise<IDBPDatabase<ZiweiDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<ZiweiDB>> {
  connection ??= openDB<ZiweiDB>(DB_NAME, 1, {
    upgrade(db) {
      const charts = db.createObjectStore('charts', { keyPath: 'id' });
      charts.createIndex('updatedAt', 'updatedAt');
      const conversations = db.createObjectStore('conversations', { keyPath: 'id' });
      conversations.createIndex('chartId', 'chartId');
    },
    // 另一個分頁要刪除或升級資料庫時，讓出連線。
    blocking() {
      void closeDB();
    },
  });
  return connection;
}

export async function closeDB(): Promise<void> {
  if (!connection) return;
  const pending = connection;
  connection = null;
  try {
    (await pending).close();
  } catch {
    // 連線本來就沒開成功。
  }
}
